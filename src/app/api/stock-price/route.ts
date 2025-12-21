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

// FinMind API 歷史資料格式
interface FinMindData {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  close: number;
  high: number;
  low: number;
  open: number;
}

// 從 FinMind API 取得歷史資料
async function fetchFinMindHistory(
  stockCode: string,
  startDate: string,
  endDate: string
): Promise<FinMindData[]> {
  const token = process.env.FINMIND_API_TOKEN;
  
  if (!token) {
    console.warn('FinMind API token 未設定，將跳過歷史資料查詢');
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
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 }, // 快取 1 小時
    });

    if (!response.ok) {
      console.error(`FinMind API 錯誤 (${stockCode}):`, response.statusText);
      return [];
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error(`取得 FinMind 歷史資料失敗 (${stockCode}):`, error);
    return [];
  }
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

  const endDateStr = endDate.toISOString().split('T')[0];
  const startDate52WeeksStr = startDate52Weeks.toISOString().split('T')[0];
  const startDate50DaysStr = startDate50Days.toISOString().split('T')[0];

  // 取得 52 周歷史資料
  const history52Weeks = await fetchFinMindHistory(
    stockCode,
    startDate52WeeksStr,
    endDateStr
  );

  // 取得 50 日歷史資料（用於計算平均交易量）
  const history50Days = await fetchFinMindHistory(
    stockCode,
    startDate50DaysStr,
    endDateStr
  );

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
      .map(d => d.Trading_Volume)
      .filter(v => v && v > 0);
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
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
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
