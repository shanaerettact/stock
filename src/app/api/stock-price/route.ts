/**
 * 股票收盤價 API 路由
 * 台股：TWSE OpenAPI（上市）、TPEX OpenAPI（上櫃）
 * 美股：Yahoo Finance Chart API（query1.finance.yahoo.com/v8/finance/chart），免金鑰；亦適用歷史日線
 * 其他商業來源可選：Finnhub、Alpha Vantage、FMP 等（需 API key）
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateSMA, getTrendAlignment, calculateRelativeStrength, type TrendAlignment } from '@/lib/indicators';

// TWSE 上市股票資料格式
interface TWSEStockData {
  Code: string;           // 股票代號
  Name: string;           // 股票名稱
  TradeVolume: string;    // 成交股數
  TradeValue: string;     // 成交金額
  OpeningPrice: string;   // 開盤價
  HighestPrice: string;   // 最高價
  LowestPrice: string;    // 最低價
  ClosingPrice: string;   // 收盤價
  Change: string;         // 漲跌價差
  Transaction: string;    // 成交筆數
}

// TPEX 上櫃股票資料格式
interface TPEXStockData {
  SecuritiesCompanyCode: string;  // 股票代號
  CompanyName: string;            // 股票名稱
  Close: string;                  // 收盤價
  Open: string;                   // 開盤價
  High: string;                   // 最高價
  Low: string;                    // 最低價
  TradingShares: string;          // 成交股數
  TransactionAmount: string;      // 成交金額
  Change: string;                 // 漲跌
  TransactionNumber: string;      // 成交筆數
}

export interface StockPriceResult {
  stockCode: string;
  stockName: string;
  closingPrice: number | null;
  change: number | null;
  openingPrice: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  tradeVolume: number | null;
  market: 'TWSE' | 'TPEX' | 'US' | null;  // 上市/上櫃/美股（Yahoo Chart）
  error?: string;
  // 52 周新高相關
  is52WeekHigh?: boolean;        // 是否創 52 周新高
  week52High?: number | null;            // 52 周最高價
  // 交易量相關
  todayVolume?: number | null;    // 今日交易量
  avg50DayVolume?: number | null; // 50 日平均交易量
  volumeRatio?: number | null;    // 今日交易量 / 50 日平均交易量
  isVolumeHigh?: boolean;         // 今日交易量是否大於 50 日平均的 50%
  // 均線趨勢相關
  ma20?: number | null;
  ma50?: number | null;
  ma200?: number | null;
  trendAlignment?: TrendAlignment | null;
  // 相對強度（vs 大盤）
  rsValue?: number | null;
  rsLabel?: '強於大盤' | '弱於大盤' | null;
  benchmarkCode?: string | null;
}

// 解析價格字串
const parsePrice = (priceStr: string | undefined): number | null => {
  if (!priceStr) return null;
  const price = parseFloat(priceStr.replace(/,/g, ''));
  return isNaN(price) ? null : price;
};

// 解析數量字串
const parseVolume = (volumeStr: string | undefined): number | null => {
  if (!volumeStr) return null;
  const volume = parseInt(volumeStr.replace(/,/g, ''), 10);
  return isNaN(volume) ? null : volume;
};

// 歷史 K 線資料格式
interface HistoryCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// 民國年轉西元 (e.g. "113/02/01" -> "2024-02-01")
function rocDateToIso(rocStr: string): string {
  const parts = rocStr.split('/').map((s) => Number(s));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined || !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return '1970-01-01';
  }
  const adYear = y + 1911;
  return `${adYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseYearMonth(isoDate: string): { y: number; m: number } {
  const parts = isoDate.split('-').map(Number);
  return { y: parts[0] ?? 1970, m: parts[1] ?? 1 };
}

/** 是否為美股Ticker（與 TradeForm 美股代號規則一致；不含 .TW） */
function isUsTickerSymbol(code: string): boolean {
  return /^[A-Z]{1,10}(\.[A-Z]{1,2})?$/i.test(code.trim());
}

const YAHOO_CHART_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 美股日線歷史（Yahoo Finance Chart API，無需 API key）
 * @see https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}
 */
async function fetchYahooUsHistory(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<HistoryCandle[]> {
  const sym = symbol.trim();
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${startTs}&period2=${endTs}&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_CHART_UA, Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    const json = await res.json();
    const chart = json?.chart?.result?.[0];
    if (!chart?.timestamp?.length) return [];
    const q = chart.indicators?.quote?.[0] ?? {};
    const result: HistoryCandle[] = [];
    for (let i = 0; i < chart.timestamp.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      const vol = q.volume?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      const d = new Date(chart.timestamp[i] * 1000);
      const dateIso = d.toISOString().slice(0, 10);
      if (dateIso < startDate || dateIso > endDate) continue;
      const volNum =
        vol != null && typeof vol === 'number' && !isNaN(vol) ? Math.round(vol) : undefined;
      result.push({ date: dateIso, open: o, high: h, low: l, close: c, volume: volNum });
    }
    return result;
  } catch {
    return [];
  }
}

/** 美股即時／最近收盤（Yahoo Chart，range 約 1 個月日線） */
async function fetchYahooUsQuote(symbol: string): Promise<StockPriceResult | null> {
  const sym = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_CHART_UA, Accept: 'application/json' },
      next: { revalidate: 120 },
    });
    const json = await res.json();
    const err = json?.chart?.error;
    if (err) return null;
    const chart = json?.chart?.result?.[0];
    if (!chart) return null;
    const meta = chart.meta ?? {};
    const q = chart.indicators?.quote?.[0] ?? {};
    const ts: number[] = chart.timestamp ?? [];
    let lastClose: number | null = null;
    let lastOpen: number | null = null;
    let lastHigh: number | null = null;
    let lastLow: number | null = null;
    let lastVol: number | null = null;
    for (let i = ts.length - 1; i >= 0; i--) {
      const c = q.close?.[i];
      if (c != null && typeof c === 'number' && !isNaN(c)) {
        lastClose = c;
        lastOpen = q.open?.[i] ?? null;
        lastHigh = q.high?.[i] ?? null;
        lastLow = q.low?.[i] ?? null;
        const v = q.volume?.[i];
        lastVol = v != null && typeof v === 'number' && !isNaN(v) ? Math.round(v) : null;
        break;
      }
    }
    const price =
      typeof meta.regularMarketPrice === 'number' && !isNaN(meta.regularMarketPrice)
        ? meta.regularMarketPrice
        : lastClose;
    if (price == null || typeof price !== 'number' || isNaN(price)) return null;
    const prevClose =
      typeof meta.chartPreviousClose === 'number' && !isNaN(meta.chartPreviousClose)
        ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number' && !isNaN(meta.previousClose)
          ? meta.previousClose
          : null;
    const change = prevClose != null ? price - prevClose : null;
    const name = String(meta.longName || meta.shortName || sym);

    return {
      stockCode: sym,
      stockName: name,
      closingPrice: price,
      change,
      openingPrice: lastOpen,
      highestPrice: lastHigh,
      lowestPrice: lastLow,
      tradeVolume: lastVol,
      market: 'US',
    };
  } catch {
    return null;
  }
}

// 證交所 TWSE 個股日成交（上市股票）https://www.twse.com.tw/exchangeReport/STOCK_DAY
async function fetchTWSEHistory(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<HistoryCandle[]> {
  const { y: startY, m: startM } = parseYearMonth(startDate);
  const { y: endY, m: endM } = parseYearMonth(endDate);
  const result: HistoryCandle[] = [];

  for (let y = startY; y <= endY; y++) {
    const mStart = y === startY ? startM : 1;
    const mEnd = y === endY ? endM : 12;
    for (let m = mStart; m <= mEnd; m++) {
      const dateStr = `${y}${String(m).padStart(2, '0')}01`;
      try {
        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockCode}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' }, next: { revalidate: 3600 } });
        const json = await res.json();
        if (json.stat !== 'OK' || !Array.isArray(json.data)) continue;
        for (const row of json.data) {
          const dateIso = rocDateToIso(row[0]);
          if (dateIso < startDate || dateIso > endDate) continue;
          const open = parsePrice(row[3]);
          const high = parsePrice(row[4]);
          const low = parsePrice(row[5]);
          const close = parsePrice(row[6]);
          const vol = parseVolume(row[1]);
          if (open != null && high != null && low != null && close != null) {
            result.push({ date: dateIso, open, high, low, close, volume: vol ?? undefined });
          }
        }
      } catch (e) {
        console.warn(`TWSE 歷史 ${stockCode} ${dateStr}:`, e);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// 櫃買中心 TPEX 個股日成交（上櫃股票）
// 使用現行端點 tpex.org.tw/www/zh-tw/afterTrading/tradingStock
// （舊 st43_result.php 已於官網改版後下線，直接回傳 404）
async function fetchTPEXHistory(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<HistoryCandle[]> {
  const { y: startY, m: startM } = parseYearMonth(startDate);
  const { y: endY, m: endM } = parseYearMonth(endDate);
  const result: HistoryCandle[] = [];

  for (let y = startY; y <= endY; y++) {
    const mStart = y === startY ? startM : 1;
    const mEnd = y === endY ? endM : 12;
    for (let m = mStart; m <= mEnd; m++) {
      // 現行端點以西元 YYYY/MM/DD 帶入欲查詢的月份
      const dParam = `${y}/${String(m).padStart(2, '0')}/01`;
      try {
        const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${stockCode}&date=${dParam}&response=json`;
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': YAHOO_CHART_UA },
          next: { revalidate: 3600 },
        });
        const json = await res.json();
        // 新格式：{ tables: [{ data: [[日期,成交仟股,成交仟元,開,高,低,收,漲跌,筆數], ...] }] }
        // 保留對舊格式（aaData / 直接陣列）的相容
        const data = json?.tables?.[0]?.data ?? json?.aaData ?? (Array.isArray(json) ? json : null);
        if (!Array.isArray(data)) continue;
        for (const row of data) {
          const dateStr = typeof row[0] === 'string' ? row[0] : row.date;
          if (!dateStr) continue;
          const s = String(dateStr);
          const dateIso = s.includes('/') ? rocDateToIso(s) : s;
          if (dateIso < startDate || dateIso > endDate) continue;
          const open = parsePrice(row[3] ?? row.open);
          const high = parsePrice(row[4] ?? row.high);
          const low = parsePrice(row[5] ?? row.low);
          const close = parsePrice(row[6] ?? row.close);
          // 成交量欄位為「成交仟股」，換算為股數以與 TWSE / Yahoo 的單位一致
          const volKShares = parseVolume(row[1] ?? row.volume);
          const vol = volKShares != null ? volKShares * 1000 : null;
          if (open != null && high != null && low != null && close != null) {
            result.push({ date: dateIso, open, high, low, close, volume: vol ?? undefined });
          }
        }
      } catch (e) {
        console.warn(`TPEX 歷史 ${stockCode} ${dParam}:`, e);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// Yahoo Finance 台股：上市 .TW、上櫃 .TWO（若 .TW 無資料則試 .TWO）
async function fetchYahooHistory(
  stockCode: string,
  startDate: string,
  endDate: string,
  market: '上市' | '上櫃' | null
): Promise<HistoryCandle[]> {
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000);
  const tryOrder = market === '上櫃' ? ['TWO', 'TW'] : ['TW', 'TWO'];
  const fetchOne = async (symbol: string): Promise<HistoryCandle[]> => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }, next: { revalidate: 3600 } });
      const json = await res.json();
      const chart = json?.chart?.result?.[0];
      if (!chart?.timestamp?.length) return [];
      const q = chart.indicators?.quote?.[0] ?? {};
      const result: HistoryCandle[] = [];
      for (let i = 0; i < chart.timestamp.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        const vol = q.volume?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        const d = new Date(chart.timestamp[i] * 1000);
        const dateIso = d.toISOString().slice(0, 10);
        if (dateIso < startDate || dateIso > endDate) continue;
        const volNum = vol != null && typeof vol === 'number' && !isNaN(vol) ? Math.round(vol) : undefined;
        result.push({ date: dateIso, open: o, high: h, low: l, close: c, volume: volNum });
      }
      return result;
    } catch (e) {
      return [];
    }
  };
  for (const suffix of tryOrder) {
    const data = await fetchOne(`${stockCode}.${suffix}`);
    if (data.length > 0) return data;
  }
  return [];
}

type FetchSource = 'TWSE' | 'TPEX' | 'Yahoo';

interface HistoryFetchResult {
  history: HistoryCandle[];
  sourcesTried: FetchSource[];
  sourceUsed: FetchSource | null; // 實際成功回傳資料的來源（供 UI 標示備援）
}

async function fetchHistory(
  stockCode: string,
  startDate: string,
  endDate: string,
  market: '上市' | '上櫃' | null
): Promise<HistoryFetchResult> {
  if (isUsTickerSymbol(stockCode)) {
    const history = await fetchYahooUsHistory(stockCode.trim(), startDate, endDate);
    return { history, sourcesTried: ['Yahoo'], sourceUsed: history.length > 0 ? 'Yahoo' : null };
  }

  const sourcesTried: FetchSource[] = [];
  let history: HistoryCandle[] = [];

  const tryOrder: FetchSource[] = market === '上櫃'
    ? ['TPEX', 'Yahoo', 'TWSE']
    : market === '上市'
    ? ['TWSE', 'Yahoo', 'TPEX']
    : ['TWSE', 'TPEX', 'Yahoo'];

  for (const src of tryOrder) {
    sourcesTried.push(src);
    if (src === 'TWSE') history = await fetchTWSEHistory(stockCode, startDate, endDate);
    else if (src === 'TPEX') history = await fetchTPEXHistory(stockCode, startDate, endDate);
    else history = await fetchYahooHistory(stockCode, startDate, endDate, market);
    if (history.length > 0) return { history, sourcesTried, sourceUsed: src };
  }
  return { history: [], sourcesTried, sourceUsed: null };
}

/**
 * 歷史日線記憶體快取：外部（TWSE 逐月 / Yahoo / TPEX）抓取成本高，
 * 快取讓「首次稍等、之後秒開」。TTL 內同一 (代號,區間,市場) 直接回傳。
 */
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 分鐘
const historyCache = new Map<string, { ts: number; value: HistoryFetchResult }>();

async function getHistoryCached(
  stockCode: string,
  startDate: string,
  endDate: string,
  market: '上市' | '上櫃' | null
): Promise<HistoryFetchResult> {
  const key = `${stockCode}|${startDate}|${endDate}|${market ?? ''}`;
  const now = Date.now();
  const hit = historyCache.get(key);
  if (hit && now - hit.ts < HISTORY_CACHE_TTL_MS && hit.value.history.length > 0) {
    return hit.value;
  }
  const value = await fetchHistory(stockCode, startDate, endDate, market);
  historyCache.set(key, { ts: now, value });
  // 避免無上限成長：超過 500 筆時清掉最舊的一批
  if (historyCache.size > 500) {
    const oldest = [...historyCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100);
    for (const [k] of oldest) historyCache.delete(k);
  }
  return value;
}

// 取得 52 周日期範圍（today - 365 天 ~ today）
function get52WeekRange(): { startDateStr: string; endDateStr: string } {
  const endDate = new Date();
  const startDate52Weeks = new Date(endDate);
  startDate52Weeks.setDate(startDate52Weeks.getDate() - 365);
  return {
    startDateStr: startDate52Weeks.toISOString().split('T')[0] ?? '',
    endDateStr: endDate.toISOString().split('T')[0] ?? '',
  };
}

// 計算 52 周新高、50 日平均交易量、均線趨勢與相對強度
async function calculateAdvancedMetrics(
  stockCode: string,
  todayClosingPrice: number | null,
  todayVolume: number | null,
  benchmarkCloses: number[],
  benchmarkCode: string,
  marketHint: '上市' | '上櫃' | null = null
): Promise<{
  is52WeekHigh: boolean;
  week52High: number | null;
  avg50DayVolume: number | null;
  volumeRatio: number | null;
  isVolumeHigh: boolean;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  trendAlignment: TrendAlignment | null;
  rsValue: number | null;
  rsLabel: '強於大盤' | '弱於大盤' | null;
}> {
  if (todayClosingPrice === null) {
    return {
      is52WeekHigh: false,
      week52High: null,
      avg50DayVolume: null,
      volumeRatio: null,
      isVolumeHigh: false,
      ma20: null,
      ma50: null,
      ma200: null,
      trendAlignment: null,
      rsValue: null,
      rsLabel: null,
    };
  }

  // 計算日期範圍（52 周約 365 天，50 日約 70 天，考慮交易日）
  const { startDateStr: startDate52WeeksStr, endDateStr } = get52WeekRange();
  const startDate50Days = new Date();
  startDate50Days.setDate(startDate50Days.getDate() - 70);
  const startDate50DaysStr = startDate50Days.toISOString().split('T')[0] ?? '';

  // 取得 52 周歷史資料（證交所/櫃買/Yahoo，帶市場提示以優先命中正確來源，並走快取）
  const { history: history52Weeks } = await getHistoryCached(stockCode, startDate52WeeksStr, endDateStr, marketHint);

  // 50 日均量：直接由 52 周資料切出最近約 70 天，免二次外部抓取
  const history50Days = history52Weeks.filter(d => d.date >= startDate50DaysStr);

  // 計算 52 周最高價
  let week52High: number | null = null;
  if (history52Weeks.length > 0) {
    week52High = Math.max(...history52Weeks.map(d => d.high || 0));
  }

  // 判斷是否創 52 周新高（今日收盤價 >= 52 周最高價）
  const is52WeekHigh = week52High !== null && todayClosingPrice >= week52High;

  // 計算 50 日平均交易量
  let avg50DayVolume: number | null = null;
  if (history50Days.length > 0) {
    const volumes = history50Days
      .map(d => d.volume)
      .filter((v): v is number => v != null && v > 0);
    if (volumes.length > 0) {
      avg50DayVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    }
  }

  // 計算交易量比率
  let volumeRatio: number | null = null;
  let isVolumeHigh = false;
  if (todayVolume !== null && avg50DayVolume !== null && avg50DayVolume > 0) {
    volumeRatio = todayVolume / avg50DayVolume;
    // 今日交易量是否大於 50 日平均的 50%（即 volumeRatio >= 1.5）
    isVolumeHigh = volumeRatio >= 1.5;
  }

  // 計算 MA20/50/200 與趨勢排列（以歷史收盤序列 + 今日收盤計算）
  const closesForMA = history52Weeks.map(d => d.close);
  if (closesForMA.length === 0 || closesForMA[closesForMA.length - 1] !== todayClosingPrice) {
    closesForMA.push(todayClosingPrice);
  }
  const ma20 = calculateSMA(closesForMA, 20).at(-1) ?? null;
  const ma50 = calculateSMA(closesForMA, 50).at(-1) ?? null;
  const ma200 = calculateSMA(closesForMA, 200).at(-1) ?? null;
  const trendAlignment = getTrendAlignment(todayClosingPrice, ma20, ma50, ma200);

  // 計算相對強度（vs 大盤基準，自身即為基準時略過）
  let rsValue: number | null = null;
  let rsLabel: '強於大盤' | '弱於大盤' | null = null;
  if (stockCode.toUpperCase() !== benchmarkCode.toUpperCase() && benchmarkCloses.length > 0) {
    const rs = calculateRelativeStrength(closesForMA, benchmarkCloses, 60);
    if (rs) {
      rsValue = rs.rsValue;
      rsLabel = rs.rsLabel;
    }
  }

  return {
    is52WeekHigh,
    week52High,
    avg50DayVolume,
    volumeRatio,
    isVolumeHigh,
    ma20,
    ma50,
    ma200,
    trendAlignment,
    rsValue,
    rsLabel,
  };
}

// GET /api/stock-price?codes=2330,2317
// GET /api/stock-price?code=2330&start_date=2024-01-01&end_date=2024-12-31 (歷史日線：TWSE/TPEX/Yahoo)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const codeParam = searchParams.get('code');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // 歷史日線模式：依 market 優化來源順序
    if (codeParam && startDate && endDate) {
      const code = codeParam.trim();
      const marketParam = searchParams.get('market');
      const market = marketParam === '上櫃' || marketParam === '上市' ? marketParam : null;

      // 往前延伸約 300 天，用於計算 MA20/50/200（避免請求區間開頭的均線值為 null）
      const extendedStartDateObj = new Date(startDate);
      extendedStartDateObj.setDate(extendedStartDateObj.getDate() - 300);
      const extendedStartDate = extendedStartDateObj.toISOString().split('T')[0] ?? startDate;

      const { history, sourcesTried, sourceUsed } = await getHistoryCached(code, extendedStartDate, endDate, market);
      if (history.length === 0) {
        console.warn(`[歷史日線無資料] 代碼=${code} 市場=${market ?? '未知'} 已嘗試=${sourcesTried.join(',')}`);
      }

      // 判斷是否為備援來源：上市預期 TWSE、上櫃預期 TPEX、其餘（含未知）預期主來源以外皆視為備援
      const primarySource: FetchSource | null =
        market === '上市' ? 'TWSE' : market === '上櫃' ? 'TPEX' : null;
      const isFallbackSource =
        sourceUsed != null && primarySource != null && sourceUsed !== primarySource;

      const closes = history.map(d => d.close);
      const ma20Series = calculateSMA(closes, 20);
      const ma50Series = calculateSMA(closes, 50);
      const ma200Series = calculateSMA(closes, 200);

      const data = history
        .map((d, i) => ({
          date: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume ?? null,
          ma20: ma20Series[i] ?? null,
          ma50: ma50Series[i] ?? null,
          ma200: ma200Series[i] ?? null,
        }))
        .filter(d => d.date >= startDate);

      return NextResponse.json({
        success: true,
        data,
        sourceUsed,        // 實際命中的來源：TWSE / TPEX / Yahoo
        isFallbackSource,  // true 表示改用備援來源（例：上櫃改用 Yahoo）
        ...(history.length === 0 && { debug: { stockCode: code, market: market ?? '未知', sourcesTried } }),
      });
    }

    const codesParam = searchParams.get('codes');
    if (!codesParam) {
      return NextResponse.json(
        { error: '請提供股票代號 (codes 參數)' },
        { status: 400 }
      );
    }

    const stockCodes = codesParam.split(',').map(code => code.trim());

    const needsTwQuotes = stockCodes.some((code) => !isUsTickerSymbol(code));
    const needsUsQuotes = stockCodes.some((code) => isUsTickerSymbol(code));

    // 大盤基準歷史（台股：0050；美股：SPY），每批請求各只抓一次，供均線趨勢與相對強度計算
    const { startDateStr: bench52wStart, endDateStr: bench52wEnd } = get52WeekRange();
    const [twBenchmarkHistory, usBenchmarkHistory] = await Promise.all([
      needsTwQuotes
        ? getHistoryCached('0050', bench52wStart, bench52wEnd, '上市').then(r => r.history)
        : Promise.resolve([]),
      needsUsQuotes
        ? fetchYahooUsHistory('SPY', bench52wStart, bench52wEnd)
        : Promise.resolve([]),
    ]);
    const twBenchmarkCloses = twBenchmarkHistory.map(d => d.close);
    const usBenchmarkCloses = usBenchmarkHistory.map(d => d.close);

    let twseData: TWSEStockData[] = [];
    let tpexData: TPEXStockData[] = [];

    if (needsTwQuotes) {
    // 同時取得上市和上櫃股票資料
    const [twseResponse, tpexResponse] = await Promise.all([
      // TWSE 上市股票
      fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 },
      }).catch(err => {
        console.error('TWSE API 錯誤:', err);
        return null;
      }),
      // TPEX 上櫃股票
      fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes', {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 },
      }).catch(err => {
        console.error('TPEX API 錯誤:', err);
        return null;
      }),
    ]);

    // 解析 TWSE 資料
    if (twseResponse?.ok) {
      try {
        twseData = await twseResponse.json();
      } catch (e) {
        console.error('解析 TWSE 資料失敗:', e);
      }
    }

    // 解析 TPEX 資料
    if (tpexResponse?.ok) {
      try {
        tpexData = await tpexResponse.json();
      } catch (e) {
        console.error('解析 TPEX 資料失敗:', e);
      }
    }
    }

    // 過濾出需要的股票（台股：TWSE/TPEX；美股：Yahoo Finance Chart API）
    const basicResults: StockPriceResult[] = await Promise.all(
      stockCodes.map(async (code) => {
        const c = code.trim();
        if (isUsTickerSymbol(c)) {
          const us = await fetchYahooUsQuote(c);
          if (us) return us;
          return {
            stockCode: c.toUpperCase(),
            stockName: '',
            closingPrice: null,
            change: null,
            openingPrice: null,
            highestPrice: null,
            lowestPrice: null,
            tradeVolume: null,
            market: null,
            error:
              '美股行情取得失敗（資料來源：Yahoo Finance Chart；請確認代號如 AAPL、GOOG、BRK.B）',
          };
        }

        const twseStock = twseData.find((stock) => stock.Code === c);

        if (twseStock) {
          return {
            stockCode: twseStock.Code,
            stockName: twseStock.Name,
            closingPrice: parsePrice(twseStock.ClosingPrice),
            change: parsePrice(twseStock.Change),
            openingPrice: parsePrice(twseStock.OpeningPrice),
            highestPrice: parsePrice(twseStock.HighestPrice),
            lowestPrice: parsePrice(twseStock.LowestPrice),
            tradeVolume: parseVolume(twseStock.TradeVolume),
            market: 'TWSE' as const,
          };
        }

        const tpexStock = tpexData.find((stock) => stock.SecuritiesCompanyCode === c);

        if (tpexStock) {
          return {
            stockCode: tpexStock.SecuritiesCompanyCode,
            stockName: tpexStock.CompanyName,
            closingPrice: parsePrice(tpexStock.Close),
            change: parsePrice(tpexStock.Change),
            openingPrice: parsePrice(tpexStock.Open),
            highestPrice: parsePrice(tpexStock.High),
            lowestPrice: parsePrice(tpexStock.Low),
            tradeVolume: parseVolume(tpexStock.TradingShares),
            market: 'TPEX' as const,
          };
        }

        return {
          stockCode: c,
          stockName: '',
          closingPrice: null,
          change: null,
          openingPrice: null,
          highestPrice: null,
          lowestPrice: null,
          tradeVolume: null,
          market: null,
          error: '找不到該股票資料（可能為興櫃或已下市）',
        };
      })
    );

    // 為每支股票計算進階指標（52 周新高、50 日平均交易量）
    const results: StockPriceResult[] = await Promise.all(
      basicResults.map(async (result) => {
        if (result.error || result.closingPrice === null) {
          return result;
        }

        try {
          const isUs = isUsTickerSymbol(result.stockCode);
          const benchmarkCloses = isUs ? usBenchmarkCloses : twBenchmarkCloses;
          const benchmarkCode = isUs ? 'SPY' : '0050';
          // 依即時報價命中的市場給定歷史來源提示：TWSE→上市、TPEX→上櫃
          const marketHint: '上市' | '上櫃' | null =
            result.market === 'TWSE' ? '上市' : result.market === 'TPEX' ? '上櫃' : null;
          const metrics = await calculateAdvancedMetrics(
            result.stockCode,
            result.closingPrice,
            result.tradeVolume,
            benchmarkCloses,
            benchmarkCode,
            marketHint
          );

          return {
            ...result,
            is52WeekHigh: metrics.is52WeekHigh,
            week52High: metrics.week52High,
            todayVolume: result.tradeVolume,
            avg50DayVolume: metrics.avg50DayVolume,
            volumeRatio: metrics.volumeRatio,
            isVolumeHigh: metrics.isVolumeHigh,
            ma20: metrics.ma20,
            ma50: metrics.ma50,
            ma200: metrics.ma200,
            trendAlignment: metrics.trendAlignment,
            rsValue: metrics.rsValue,
            rsLabel: metrics.rsLabel,
            benchmarkCode,
          };
        } catch (error) {
          console.error(`計算進階指標失敗 (${result.stockCode}):`, error);
          // 即使計算失敗，也返回基本資料
          return result;
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: results,
      fetchedAt: new Date().toISOString(),
      sources: {
        twse: twseData.length > 0,
        tpex: tpexData.length > 0,
      },
    });
  } catch (error) {
    console.error('取得股票收盤價失敗:', error);
    return NextResponse.json(
      { 
        error: '取得股票收盤價失敗', 
        details: error instanceof Error ? error.message : '未知錯誤' 
      },
      { status: 500 }
    );
  }
}
