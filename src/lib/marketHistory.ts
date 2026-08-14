/**
 * 歷史股價抓取與技術指標計算（共用函式庫）
 * 從 src/app/api/stock-price/route.ts 抽出，供即時報價 API 與
 * 平倉後自動分析（src/lib/setupAnalysis.ts）共用同一套抓取/快取邏輯。
 * 台股：TWSE OpenAPI（上市）、TPEX OpenAPI（上櫃）
 * 美股：Yahoo Finance Chart API（query1.finance.yahoo.com/v8/finance/chart），免金鑰
 */

import { calculateSMA, getTrendAlignment, calculateRelativeStrength, type TrendAlignment } from '@/lib/indicators';

// 解析價格字串
export const parsePrice = (priceStr: string | undefined): number | null => {
  if (!priceStr) return null;
  const price = parseFloat(priceStr.replace(/,/g, ''));
  return isNaN(price) ? null : price;
};

// 解析數量字串
export const parseVolume = (volumeStr: string | undefined): number | null => {
  if (!volumeStr) return null;
  const volume = parseInt(volumeStr.replace(/,/g, ''), 10);
  return isNaN(volume) ? null : volume;
};

// 歷史 K 線資料格式
export interface HistoryCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// 民國年轉西元 (e.g. "113/02/01" -> "2024-02-01")
export function rocDateToIso(rocStr: string): string {
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

export function parseYearMonth(isoDate: string): { y: number; m: number } {
  const parts = isoDate.split('-').map(Number);
  return { y: parts[0] ?? 1970, m: parts[1] ?? 1 };
}

/** 是否為美股Ticker（與 TradeForm 美股代號規則一致；不含 .TW） */
export function isUsTickerSymbol(code: string): boolean {
  return /^[A-Z]{1,10}(\.[A-Z]{1,2})?$/i.test(code.trim());
}

export const YAHOO_CHART_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 美股日線歷史（Yahoo Finance Chart API，無需 API key）
 * @see https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}
 */
export async function fetchYahooUsHistory(
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

// 證交所 TWSE 個股日成交（上市股票）https://www.twse.com.tw/exchangeReport/STOCK_DAY
export async function fetchTWSEHistory(
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
export async function fetchTPEXHistory(
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
export async function fetchYahooHistory(
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
    } catch {
      return [];
    }
  };
  for (const suffix of tryOrder) {
    const data = await fetchOne(`${stockCode}.${suffix}`);
    if (data.length > 0) return data;
  }
  return [];
}

export type FetchSource = 'TWSE' | 'TPEX' | 'Yahoo';

export interface HistoryFetchResult {
  history: HistoryCandle[];
  sourcesTried: FetchSource[];
  sourceUsed: FetchSource | null; // 實際成功回傳資料的來源（供 UI 標示備援）
}

export async function fetchHistory(
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
// 以 (代號,市場) 為鍵、保存已抓取的最大日期區間；請求落在區間內時直接切片回傳，
// 讓單檔圖表（往前 300 天）與批次指標（52 週）兩條路徑共用同一份外部抓取結果
const historyCache = new Map<
  string,
  { ts: number; startDate: string; endDate: string; value: HistoryFetchResult }
>();

function sliceHistory(value: HistoryFetchResult, startDate: string, endDate: string): HistoryFetchResult {
  return {
    ...value,
    history: value.history.filter(d => d.date >= startDate && d.date <= endDate),
  };
}

export async function getHistoryCached(
  stockCode: string,
  startDate: string,
  endDate: string,
  market: '上市' | '上櫃' | null
): Promise<HistoryFetchResult> {
  const key = `${stockCode}|${market ?? ''}`;
  const now = Date.now();
  const hit = historyCache.get(key);
  if (
    hit &&
    now - hit.ts < HISTORY_CACHE_TTL_MS &&
    hit.value.history.length > 0 &&
    hit.startDate <= startDate &&
    hit.endDate >= endDate
  ) {
    return sliceHistory(hit.value, startDate, endDate);
  }
  // 未命中時抓涵蓋新舊需求的聯集區間，讓快取條目只會擴大、後續請求更容易命中
  const fetchStart = hit && hit.startDate < startDate ? hit.startDate : startDate;
  const fetchEnd = hit && hit.endDate > endDate ? hit.endDate : endDate;
  const value = await fetchHistory(stockCode, fetchStart, fetchEnd, market);
  historyCache.set(key, { ts: now, startDate: fetchStart, endDate: fetchEnd, value });
  // 避免無上限成長：超過 500 筆時清掉最舊的一批
  if (historyCache.size > 500) {
    const oldest = [...historyCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100);
    for (const [k] of oldest) historyCache.delete(k);
  }
  return sliceHistory(value, startDate, endDate);
}

// 取得「以 asOf 為基準日」往回 365 天的日期範圍（52 周指標用）
export function getYearRangeEndingAt(asOf: Date): { startDateStr: string; endDateStr: string } {
  const endDate = new Date(asOf);
  const startDate52Weeks = new Date(endDate);
  startDate52Weeks.setDate(startDate52Weeks.getDate() - 365);
  return {
    startDateStr: startDate52Weeks.toISOString().split('T')[0] ?? '',
    endDateStr: endDate.toISOString().split('T')[0] ?? '',
  };
}

export interface AdvancedMetrics {
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
}

/**
 * 計算「以 asOf 為基準日」的 52 周新高、50 日平均交易量、均線趨勢與相對強度。
 * asOf 傳入「今天」即為原本即時報價頁的行為；傳入任意歷史日期即可回溯計算當時的技術指標
 * （供平倉後自動分析 src/lib/setupAnalysis.ts 使用）。
 */
export async function calculateAdvancedMetricsAsOf(
  stockCode: string,
  asOf: Date,
  closingPrice: number | null,
  volume: number | null,
  benchmarkCloses: number[],
  benchmarkCode: string,
  marketHint: '上市' | '上櫃' | null = null
): Promise<AdvancedMetrics> {
  if (closingPrice === null) {
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
  const { startDateStr: startDate52WeeksStr, endDateStr } = getYearRangeEndingAt(asOf);
  const startDate50Days = new Date(asOf);
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

  // 判斷是否創 52 周新高（asOf 當日收盤價 >= 52 周最高價）
  const is52WeekHigh = week52High !== null && closingPrice >= week52High;

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
  if (volume !== null && avg50DayVolume !== null && avg50DayVolume > 0) {
    volumeRatio = volume / avg50DayVolume;
    // 交易量是否大於 50 日平均的 50%（即 volumeRatio >= 1.5）
    isVolumeHigh = volumeRatio >= 1.5;
  }

  // 計算 MA20/50/200 與趨勢排列（以歷史收盤序列 + asOf 當日收盤計算）
  const closesForMA = history52Weeks.map(d => d.close);
  if (closesForMA.length === 0 || closesForMA[closesForMA.length - 1] !== closingPrice) {
    closesForMA.push(closingPrice);
  }
  const ma20 = calculateSMA(closesForMA, 20).at(-1) ?? null;
  const ma50 = calculateSMA(closesForMA, 50).at(-1) ?? null;
  const ma200 = calculateSMA(closesForMA, 200).at(-1) ?? null;
  const trendAlignment = getTrendAlignment(closingPrice, ma20, ma50, ma200);

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
