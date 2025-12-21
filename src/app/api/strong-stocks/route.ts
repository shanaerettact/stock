/**
 * 強勢股 API 路由
 * 取得當日漲幅前 20 名，並篩選出：
 * 1. 創 52 周新高
 * 2. 今日交易量大於 50 日平均交易量的 50%
 * 
 * 資料來源：
 * - 當日股價：TWSE/TPEX OpenAPI（不需要 token）
 * - 歷史資料：FinMind API（需要 token）
 */

import { NextResponse } from 'next/server';

// TWSE 上市股票資料格式
interface TWSEStockData {
  Code: string;
  Name: string;
  TradeVolume: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
}

// TPEX 上櫃股票資料格式
interface TPEXStockData {
  SecuritiesCompanyCode: string;
  CompanyName: string;
  Close: string;
  Open: string;
  High: string;
  Low: string;
  TradingShares: string;
  Change: string;
}

// FinMind API 資料格式
interface FinMindPriceData {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
}

// 強勢股結果格式
export interface StrongStock {
  stockCode: string;
  stockName: string;
  closingPrice: number;
  change: number;
  changePercent: number;
  todayVolume: number;
  avg50DayVolume: number;
  volumeRatio: number;
  week52High: number;
  is52WeekHigh: boolean;
  isVolumeHigh: boolean;
  market: 'TWSE' | 'TPEX';
}

// 統一的股票資料格式
interface NormalizedStock {
  code: string;
  name: string;
  closingPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  market: 'TWSE' | 'TPEX';
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

// 從 TWSE/TPEX OpenAPI 取得當日全市場資料
async function fetchTodayMarketData(): Promise<NormalizedStock[]> {
  const stocks: NormalizedStock[] = [];

  try {
    // 同時取得上市和上櫃資料
    const [twseResponse, tpexResponse] = await Promise.all([
      fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      }).catch(() => null),
      fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes', {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      }).catch(() => null),
    ]);

    // 處理上市股票
    if (twseResponse?.ok) {
      const twseData: TWSEStockData[] = await twseResponse.json();
      for (const stock of twseData) {
        const code = stock.Code;
        // 只保留 4 位數字的股票代號（一般股票）
        if (!/^\d{4}$/.test(code)) continue;

        const closingPrice = parsePrice(stock.ClosingPrice);
        const change = parsePrice(stock.Change);
        const volume = parseVolume(stock.TradeVolume);

        if (closingPrice && change !== null && volume) {
          const prevClose = closingPrice - change;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

          stocks.push({
            code,
            name: stock.Name,
            closingPrice,
            change,
            changePercent,
            volume,
            market: 'TWSE',
          });
        }
      }
    }

    // 處理上櫃股票
    if (tpexResponse?.ok) {
      const tpexData: TPEXStockData[] = await tpexResponse.json();
      for (const stock of tpexData) {
        const code = stock.SecuritiesCompanyCode;
        // 只保留 4 位數字的股票代號（一般股票）
        if (!/^\d{4}$/.test(code)) continue;

        const closingPrice = parsePrice(stock.Close);
        const change = parsePrice(stock.Change);
        const volume = parseVolume(stock.TradingShares);

        if (closingPrice && change !== null && volume) {
          const prevClose = closingPrice - change;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

          stocks.push({
            code,
            name: stock.CompanyName,
            closingPrice,
            change,
            changePercent,
            volume,
            market: 'TPEX',
          });
        }
      }
    }
  } catch (error) {
    console.error('取得市場資料失敗:', error);
  }

  return stocks;
}

// 從 FinMind API 取得歷史資料
async function fetchFinMindHistory(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<FinMindPriceData[]> {
  const token = process.env.FINMIND_API_TOKEN;

  if (!token) {
    return [];
  }

  try {
    const url = 'https://api.finmindtrade.com/api/v4/data';
    const params = new URLSearchParams({
      dataset: 'TaiwanStockPrice',
      data_id: stockCode,
      start_date: startDate,
      end_date: endDate,
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      next: { revalidate: 3600 }, // 快取 1 小時
    });

    if (!response.ok) {
      return [];
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error(`取得 FinMind 歷史資料失敗 (${stockCode}):`, error);
    return [];
  }
}

// 批次取得多支股票的歷史資料
async function fetchHistoricalDataBatch(
  stockCodes: string[]
): Promise<Map<string, FinMindPriceData[]>> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365); // 52 周

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const historyMap = new Map<string, FinMindPriceData[]>();

  // 批次查詢（每次最多 10 支，避免 API 限制）
  const batchSize = 10;
  for (let i = 0; i < stockCodes.length; i += batchSize) {
    const batch = stockCodes.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (code) => {
        const data = await fetchFinMindHistory(code, startDateStr, endDateStr);
        return { code, data };
      })
    );

    for (const { code, data } of results) {
      historyMap.set(code, data);
    }
  }

  return historyMap;
}

// GET /api/strong-stocks
export async function GET() {
  try {
    // 1. 從 TWSE/TPEX 取得當日全市場資料
    const todayStocks = await fetchTodayMarketData();

    if (todayStocks.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '無法取得今日股價資料，可能為非交易日或市場尚未開盤',
        fetchedAt: new Date().toISOString(),
      });
    }

    // 2. 篩選上漲股票並排序，取前 50 名
    const risingStocks = todayStocks
      .filter((stock) => stock.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 50);

    if (risingStocks.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '今日無上漲股票',
        fetchedAt: new Date().toISOString(),
      });
    }

    // 3. 檢查 FinMind token
    const token = process.env.FINMIND_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'FinMind API token 未設定，請在 .env 中設定 FINMIND_API_TOKEN',
        },
        { status: 400 }
      );
    }

    // 4. 取得前 50 名的歷史資料
    const stockCodes = risingStocks.map((s) => s.code);
    const historicalData = await fetchHistoricalDataBatch(stockCodes);

    // 5. 計算每支股票的 52 周新高和 50 日平均交易量
    const strongStocks: StrongStock[] = [];

    for (const stock of risingStocks) {
      const history = historicalData.get(stock.code) || [];

      if (history.length < 10) continue; // 歷史資料不足，跳過

      // 計算 52 周最高價
      const week52High = Math.max(...history.map((d) => d.max || d.close || 0));

      // 計算 50 日平均交易量
      const recentHistory = history.slice(-50);
      const avg50DayVolume =
        recentHistory.length > 0
          ? recentHistory.reduce((sum, d) => sum + (d.Trading_Volume || 0), 0) /
            recentHistory.length
          : 0;

      // 判斷條件
      const is52WeekHigh = stock.closingPrice >= week52High * 0.98; // 允許 2% 誤差
      const volumeRatio = avg50DayVolume > 0 ? stock.volume / avg50DayVolume : 0;
      const isVolumeHigh = volumeRatio >= 1.5;

      // 只加入符合兩個條件的股票
      if (is52WeekHigh && isVolumeHigh) {
        strongStocks.push({
          stockCode: stock.code,
          stockName: stock.name,
          closingPrice: stock.closingPrice,
          change: stock.change,
          changePercent: stock.changePercent,
          todayVolume: stock.volume,
          avg50DayVolume: Math.round(avg50DayVolume),
          volumeRatio: Math.round(volumeRatio * 100) / 100,
          week52High,
          is52WeekHigh: true,
          isVolumeHigh: true,
          market: stock.market,
        });
      }
    }

    // 6. 按漲幅排序並取前 20 名
    const top20 = strongStocks
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 20);

    return NextResponse.json({
      success: true,
      data: top20,
      total: top20.length,
      fetchedAt: new Date().toISOString(),
      source: 'TWSE/TPEX OpenAPI + FinMind API',
    });
  } catch (error) {
    console.error('取得強勢股失敗:', error);
    return NextResponse.json(
      {
        success: false,
        error: '取得強勢股失敗',
        details: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500 }
    );
  }
}
