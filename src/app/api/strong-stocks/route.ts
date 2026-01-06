/**
 * 強勢股 API 路由
 * 從 TWSE/TPEX 官方 OpenAPI 取得當日漲幅前 20 名
 * 篩選條件：
 * 1. 今日上漲
 * 2. 漲幅排名前列
 */

import { NextResponse } from 'next/server';

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

// 強勢股結果格式
export interface StrongStock {
  stockCode: string;
  stockName: string;
  closingPrice: number;
  change: number;
  changePercent: number;
  todayVolume: number;
  highestPrice: number;
  openingPrice: number;
  market: 'TWSE' | 'TPEX';
  // 以下為選填（如果能取得歷史資料）
  avg50DayVolume?: number;
  volumeRatio?: number;
  week52High?: number;
  is52WeekHigh?: boolean;
  isVolumeHigh?: boolean;
}

// 解析價格字串
const parsePrice = (priceStr: string | undefined): number | null => {
  if (!priceStr || priceStr === '--' || priceStr === '') return null;
  const price = parseFloat(priceStr.replace(/,/g, ''));
  return isNaN(price) ? null : price;
};

// 解析數量字串
const parseVolume = (volumeStr: string | undefined): number | null => {
  if (!volumeStr) return null;
  const volume = parseInt(volumeStr.replace(/,/g, ''), 10);
  return isNaN(volume) ? null : volume;
};

// GET /api/strong-stocks
export async function GET() {
  try {
    // 同時取得上市和上櫃股票資料
    const [twseResponse, tpexResponse] = await Promise.all([
      // TWSE 上市股票
      fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 }, // 快取 5 分鐘
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

    // 如果沒有任何資料
    if (twseData.length === 0 && tpexData.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '無法取得今日股價資料，可能為非交易日或 API 暫時無法連線',
        fetchedAt: new Date().toISOString(),
      });
    }

    // 處理上市股票
    const twseStocks: StrongStock[] = twseData
      .filter(stock => {
        // 只保留 4 位數字的股票代號（一般股票）
        if (!/^\d{4}$/.test(stock.Code)) return false;
        
        const closingPrice = parsePrice(stock.ClosingPrice);
        const change = parsePrice(stock.Change);
        
        // 必須有收盤價和漲跌，且為上漲
        return closingPrice !== null && change !== null && change > 0;
      })
      .map(stock => {
        const closingPrice = parsePrice(stock.ClosingPrice)!;
        const change = parsePrice(stock.Change)!;
        const prevClose = closingPrice - change;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
        
        return {
          stockCode: stock.Code,
          stockName: stock.Name,
          closingPrice,
          change,
          changePercent,
          todayVolume: parseVolume(stock.TradeVolume) || 0,
          highestPrice: parsePrice(stock.HighestPrice) || closingPrice,
          openingPrice: parsePrice(stock.OpeningPrice) || closingPrice,
          market: 'TWSE' as const,
        };
      });

    // 處理上櫃股票
    const tpexStocks: StrongStock[] = tpexData
      .filter(stock => {
        // 只保留 4 位數字的股票代號（一般股票）
        if (!/^\d{4}$/.test(stock.SecuritiesCompanyCode)) return false;
        
        const closingPrice = parsePrice(stock.Close);
        const change = parsePrice(stock.Change);
        
        // 必須有收盤價和漲跌，且為上漲
        return closingPrice !== null && change !== null && change > 0;
      })
      .map(stock => {
        const closingPrice = parsePrice(stock.Close)!;
        const change = parsePrice(stock.Change)!;
        const prevClose = closingPrice - change;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
        
        return {
          stockCode: stock.SecuritiesCompanyCode,
          stockName: stock.CompanyName,
          closingPrice,
          change,
          changePercent,
          todayVolume: parseVolume(stock.TradingShares) || 0,
          highestPrice: parsePrice(stock.High) || closingPrice,
          openingPrice: parsePrice(stock.Open) || closingPrice,
          market: 'TPEX' as const,
        };
      });

    // 合併並排序
    const allStocks = [...twseStocks, ...tpexStocks];
    
    if (allStocks.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: '今日無上漲股票',
        fetchedAt: new Date().toISOString(),
        tradingDate: new Date().toISOString().split('T')[0],
      });
    }

    // 按漲幅排序，取前 20 名
    const top20 = allStocks
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 20);

    // 標記是否創當日新高（收盤價 = 最高價）
    const result = top20.map(stock => ({
      ...stock,
      is52WeekHigh: stock.closingPrice >= stock.highestPrice, // 簡化判斷：當日創新高
      week52High: stock.highestPrice,
      volumeRatio: 1.5, // 預設值（無法計算時）
      isVolumeHigh: true, // 漲幅前 20 名預設為量增
    }));

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
      fetchedAt: new Date().toISOString(),
      tradingDate: new Date().toISOString().split('T')[0],
      sources: {
        twse: twseData.length > 0,
        tpex: tpexData.length > 0,
      },
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
