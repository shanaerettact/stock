/**
 * 股票收盤價 API 路由
 * 從 TWSE OpenAPI (上市) 和 TPEX OpenAPI (上櫃) 取得當日收盤價
 * https://openapi.twse.com.tw/
 * https://www.tpex.org.tw/openapi/
 */

import { NextRequest, NextResponse } from 'next/server';

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
  market: 'TWSE' | 'TPEX' | null;  // 上市/上櫃
  error?: string;
  // 52 周新高相關
  is52WeekHigh?: boolean;        // 是否創 52 周新高
  week52High?: number;            // 52 周最高價
  // 交易量相關
  todayVolume?: number | null;    // 今日交易量
  avg50DayVolume?: number | null; // 50 日平均交易量
  volumeRatio?: number | null;    // 今日交易量 / 50 日平均交易量
  isVolumeHigh?: boolean;         // 今日交易量是否大於 50 日平均的 50%
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
  const [y, m, d] = rocStr.split('/').map(Number);
  const adYear = y + 1911;
  return `${adYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 證交所 TWSE 個股日成交（上市股票）https://www.twse.com.tw/exchangeReport/STOCK_DAY
async function fetchTWSEHistory(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<HistoryCandle[]> {
  const [startY, startM] = startDate.split('-').map(Number);
  const [endY, endM] = endDate.split('-').map(Number);
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
async function fetchTPEXHistory(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<HistoryCandle[]> {
  const [startY, startM] = startDate.split('-').map(Number);
  const [endY, endM] = endDate.split('-').map(Number);
  const result: HistoryCandle[] = [];

  for (let y = startY; y <= endY; y++) {
    const mStart = y === startY ? startM : 1;
    const mEnd = y === endY ? endM : 12;
    for (let m = mStart; m <= mEnd; m++) {
      const rocY = y - 1911;
      const dParam = `${rocY}/${String(m).padStart(2, '0')}`;
      try {
        const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&se=AL&stkno=${stockCode}&d=${dParam}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' }, next: { revalidate: 3600 } });
        const json = await res.json();
        const data = json.aaData ?? json;
        if (!Array.isArray(data)) continue;
        for (const row of data) {
          const dateStr = typeof row[0] === 'string' ? row[0] : row.date;
          const dateIso = dateStr.includes('/') ? rocDateToIso(dateStr) : dateStr;
          if (dateIso < startDate || dateIso > endDate) continue;
          const open = parsePrice(row[3] ?? row.open);
          const high = parsePrice(row[4] ?? row.high);
          const low = parsePrice(row[5] ?? row.low);
          const close = parsePrice(row[6] ?? row.close);
          const vol = parseVolume(row[1] ?? row.volume);
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

async function fetchHistory(
  stockCode: string,
  startDate: string,
  endDate: string,
  market: '上市' | '上櫃' | null
): Promise<{ history: HistoryCandle[]; sourcesTried: FetchSource[] }> {
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
    if (history.length > 0) return { history, sourcesTried };
  }
  return { history: [], sourcesTried };
}

// 計算 52 周新高和 50 日平均交易量
async function calculateAdvancedMetrics(
  stockCode: string,
  todayClosingPrice: number | null,
  todayVolume: number | null
): Promise<{
  is52WeekHigh: boolean;
  week52High: number | null;
  avg50DayVolume: number | null;
  volumeRatio: number | null;
  isVolumeHigh: boolean;
}> {
  if (todayClosingPrice === null) {
    return {
      is52WeekHigh: false,
      week52High: null,
      avg50DayVolume: null,
      volumeRatio: null,
      isVolumeHigh: false,
    };
  }

  // 計算日期範圍（52 周約 365 天，50 日約 70 天，考慮交易日）
  const endDate = new Date();
  const startDate52Weeks = new Date(endDate);
  startDate52Weeks.setDate(startDate52Weeks.getDate() - 365);
  const startDate50Days = new Date(endDate);
  startDate50Days.setDate(startDate50Days.getDate() - 70);

  const endDateStr = endDate.toISOString().split('T')[0] ?? '';
  const startDate52WeeksStr = startDate52Weeks.toISOString().split('T')[0] ?? '';
  const startDate50DaysStr = startDate50Days.toISOString().split('T')[0] ?? '';

  // 取得 52 周歷史資料（證交所/櫃買/Yahoo）
  const { history: history52Weeks } = await fetchHistory(stockCode, startDate52WeeksStr, endDateStr, null);

  // 取得 50 日歷史資料（用於計算平均交易量）
  const { history: history50Days } = await fetchHistory(stockCode, startDate50DaysStr, endDateStr, null);

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

  return {
    is52WeekHigh,
    week52High,
    avg50DayVolume,
    volumeRatio,
    isVolumeHigh,
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
      const { history, sourcesTried } = await fetchHistory(code, startDate, endDate, market);
      if (history.length === 0) {
        console.warn(`[歷史日線無資料] 代碼=${code} 市場=${market ?? '未知'} 已嘗試=${sourcesTried.join(',')}`);
      }
      return NextResponse.json({
        success: true,
        data: history.map(d => ({
          date: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume ?? null,
        })),
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

    let twseData: TWSEStockData[] = [];
    let tpexData: TPEXStockData[] = [];

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

    // 過濾出需要的股票（先取得基本資料）
    const basicResults: StockPriceResult[] = stockCodes.map(code => {
      // 先從 TWSE 找
      const twseStock = twseData.find(stock => stock.Code === code);
      
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

      // 再從 TPEX 找
      const tpexStock = tpexData.find(stock => stock.SecuritiesCompanyCode === code);
      
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

      // 都找不到
      return {
        stockCode: code,
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
    });

    // 為每支股票計算進階指標（52 周新高、50 日平均交易量）
    const results: StockPriceResult[] = await Promise.all(
      basicResults.map(async (result) => {
        if (result.error || result.closingPrice === null) {
          return result;
        }

        try {
          const metrics = await calculateAdvancedMetrics(
            result.stockCode,
            result.closingPrice,
            result.tradeVolume
          );

          return {
            ...result,
            is52WeekHigh: metrics.is52WeekHigh,
            week52High: metrics.week52High,
            todayVolume: result.tradeVolume,
            avg50DayVolume: metrics.avg50DayVolume,
            volumeRatio: metrics.volumeRatio,
            isVolumeHigh: metrics.isVolumeHigh,
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
