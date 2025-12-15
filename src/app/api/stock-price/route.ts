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

    // 過濾出需要的股票
    const results: StockPriceResult[] = stockCodes.map(code => {
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
