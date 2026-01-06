/**
 * 強勢股 API 路由
 * 取得當日漲幅前 20 名，並篩選出：
 * 1. 創 52 周新高
 * 2. 今日交易量大於 50 日平均交易量的 50%
 */

import { NextResponse } from 'next/server';

// FinMind API 資料格式
interface FinMindPriceData {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  Trading_money: number;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  Trading_turnover: number;
}

// FinMind 台股代號清單資料格式
interface FinMindStockInfo {
  stock_id: string;
  stock_name: string;
  industry_category: string;
  type: string;
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
}

// 從 FinMind API 取得資料
async function fetchFinMindData(
  dataset: string,
  params: Record<string, string>
): Promise<unknown[]> {
  const token = process.env.FINMIND_API_TOKEN;

  if (!token) {
    console.warn('FinMind API token 未設定');
    return [];
  }

  try {
    const url = 'https://api.finmindtrade.com/api/v4/data';
    const queryParams = new URLSearchParams({ dataset, ...params });

    const response = await fetch(`${url}?${queryParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      next: { revalidate: 300 }, // 快取 5 分鐘
    });

    if (!response.ok) {
      console.error(`FinMind API 錯誤: ${response.statusText}`);
      return [];
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('FinMind API 請求失敗:', error);
    return [];
  }
}

// 取得股票名稱對照表
async function fetchStockNames(): Promise<Map<string, string>> {
  const data = (await fetchFinMindData('TaiwanStockInfo', {})) as FinMindStockInfo[];
  const nameMap = new Map<string, string>();

  data.forEach((stock) => {
    nameMap.set(stock.stock_id, stock.stock_name);
  });

  return nameMap;
}

// 取得最近交易日的所有股票收盤資料（自動處理週末和假日）
async function fetchTodayPrices(): Promise<FinMindPriceData[]> {
  // 計算查詢日期範圍（往前 10 天，確保能找到交易日）
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 10);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = today.toISOString().split('T')[0];

  // 取得最近 10 天的資料
  const data = (await fetchFinMindData('TaiwanStockPrice', {
    start_date: startDateStr || '',
    end_date: endDateStr || '',
  })) as FinMindPriceData[];

  if (data.length === 0) {
    return [];
  }

  // 找出最新的交易日
  const latestDate = data.reduce((max, d) => (d?.date && d.date > max ? d.date : max), data[0]?.date || '');

  // 只回傳最新交易日的資料
  return data.filter((d) => d.date === latestDate);
}

// 取得歷史資料（52 周）
async function fetchHistoricalData(
  stockCodes: string[]
): Promise<Map<string, FinMindPriceData[]>> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365); // 52 周

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const historyMap = new Map<string, FinMindPriceData[]>();

  // 批次查詢每支股票的歷史資料
  await Promise.all(
    stockCodes.map(async (code) => {
      const data = (await fetchFinMindData('TaiwanStockPrice', {
        data_id: code,
        start_date: startDateStr || '',
        end_date: endDateStr || '',
      })) as FinMindPriceData[];

      historyMap.set(code, data);
    })
  );

  return historyMap;
}

// GET /api/strong-stocks
export async function GET() {
  try {
    const token = process.env.FINMIND_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'FinMind API token 未設定，請在 .env.local 中設定 FINMIND_API_TOKEN',
        },
        { status: 400 }
      );
    }

    // 1. 取得今日所有股票價格
    const todayPrices = await fetchTodayPrices();

    if (todayPrices.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '無法取得今日股價資料，可能為非交易日',
        fetchedAt: new Date().toISOString(),
      });
    }

    // 2. 過濾出普通股票（排除 ETF、權證等，代號為 4 位數字）
    const validStocks = todayPrices.filter((stock) => {
      const code = stock.stock_id;
      // 只保留 4 位數字的股票代號（一般股票）
      return /^\d{4}$/.test(code) && stock.close > 0 && stock.spread !== undefined;
    });

    // 3. 計算漲幅並排序，取前 50 名（後續會過濾）
    const stocksWithChange = validStocks
      .map((stock) => {
        const prevClose = stock.close - stock.spread;
        const changePercent = prevClose > 0 ? (stock.spread / prevClose) * 100 : 0;
        return {
          ...stock,
          changePercent,
          prevClose,
        };
      })
      .filter((stock) => stock.changePercent > 0) // 只要上漲的股票
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 50); // 取前 50 名用於後續篩選

    if (stocksWithChange.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '今日無上漲股票',
        fetchedAt: new Date().toISOString(),
      });
    }

    // 4. 取得股票名稱
    const stockNames = await fetchStockNames();

    // 5. 取得前 50 名的歷史資料
    const stockCodes = stocksWithChange.map((s) => s.stock_id);
    const historicalData = await fetchHistoricalData(stockCodes);

    // 6. 計算每支股票的 52 周新高和 50 日平均交易量
    const strongStocks: StrongStock[] = [];

    for (const stock of stocksWithChange) {
      const history = historicalData.get(stock.stock_id) || [];

      if (history.length < 10) continue; // 歷史資料不足，跳過

      // 計算 52 周最高價
      const week52High = Math.max(...history.map((d) => d.max || 0));

      // 計算 50 日平均交易量
      const recentHistory = history.slice(-50);
      const avg50DayVolume =
        recentHistory.length > 0
          ? recentHistory.reduce((sum, d) => sum + (d.Trading_Volume || 0), 0) / recentHistory.length
          : 0;

      // 判斷條件
      const is52WeekHigh = stock.close >= week52High;
      const volumeRatio = avg50DayVolume > 0 ? stock.Trading_Volume / avg50DayVolume : 0;
      const isVolumeHigh = volumeRatio >= 1.5;

      // 只加入符合兩個條件的股票
      if (is52WeekHigh && isVolumeHigh) {
        strongStocks.push({
          stockCode: stock.stock_id,
          stockName: stockNames.get(stock.stock_id) || '',
          closingPrice: stock.close,
          change: stock.spread,
          changePercent: stock.changePercent,
          todayVolume: stock.Trading_Volume,
          avg50DayVolume: Math.round(avg50DayVolume),
          volumeRatio: Math.round(volumeRatio * 100) / 100,
          week52High,
          is52WeekHigh,
          isVolumeHigh,
        });
      }
    }

    // 7. 按漲幅排序並取前 20 名
    const top20 = strongStocks.sort((a, b) => b.changePercent - a.changePercent).slice(0, 20);

    return NextResponse.json({
      success: true,
      data: top20,
      total: top20.length,
      fetchedAt: new Date().toISOString(),
      tradingDate: todayPrices[0]?.date || null,
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

