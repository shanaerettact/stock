/**
 * 股票收盤價 API 路由
 * 台股：TWSE OpenAPI（上市）、TPEX OpenAPI（上櫃）
 * 美股：Yahoo Finance Chart API（query1.finance.yahoo.com/v8/finance/chart），免金鑰；亦適用歷史日線
 * 其他商業來源可選：Finnhub、Alpha Vantage、FMP 等（需 API key）
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateSMA, type TrendAlignment } from '@/lib/indicators';
import {
  parsePrice,
  parseVolume,
  isUsTickerSymbol,
  YAHOO_CHART_UA,
  fetchYahooUsHistory,
  getHistoryCached,
  getYearRangeEndingAt,
  calculateAdvancedMetricsAsOf,
} from '@/lib/marketHistory';

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

      // 判斷是否為備援來源：實際命中的來源不是嘗試順序的第一個（該市場的主來源）即視為備援
      // 由 fetchHistory 的 sourcesTried 推導，市場未知時也能正確標示（未知市場最容易 fallback）
      const primarySource = sourcesTried[0] ?? null;
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
    const { startDateStr: bench52wStart, endDateStr: bench52wEnd } = getYearRangeEndingAt(new Date());
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
          const metrics = await calculateAdvancedMetricsAsOf(
            result.stockCode,
            new Date(),
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
