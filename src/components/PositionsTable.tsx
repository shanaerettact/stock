'use client';

import { useState } from 'react';
import type { Position, StockPrice, TrailingStopResult } from '@/lib/types';
import { calculateTrailingStop, calculateUnrealizedPnL } from '@/lib/types';

interface PositionsTableProps {
  positions: Position[];
  onMessage?: (type: 'success' | 'error', text: string) => void;
}

export default function PositionsTable({ positions, onMessage }: PositionsTableProps) {
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);

  const openPositions = positions.filter(p => p.status === 'OPEN');

  const fetchStockPrices = async () => {
    if (openPositions.length === 0) {
      onMessage?.('error', '目前沒有持倉部位');
      return;
    }

    try {
      setFetchingPrices(true);
      const stockCodes = openPositions.map(p => p.stockCode).join(',');
      const response = await fetch(`/api/stock-price?codes=${stockCodes}`);
      
      if (!response.ok) {
        throw new Error('取得收盤價失敗');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const pricesMap: Record<string, StockPrice> = {};
        result.data.forEach((price: StockPrice) => {
          pricesMap[price.stockCode] = price;
        });
        setStockPrices(pricesMap);
        setPricesFetchedAt(new Date().toLocaleTimeString('zh-TW'));
        onMessage?.('success', '✅ 已取得今日收盤價！');
      } else {
        throw new Error(result.error || '取得收盤價失敗');
      }
    } catch (error) {
      console.error('取得收盤價失敗:', error);
      onMessage?.('error', error instanceof Error ? error.message : '取得收盤價失敗');
    } finally {
      setFetchingPrices(false);
    }
  };

  if (openPositions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">📊 目前持倉</h2>
        <div className="flex items-center gap-3">
          {pricesFetchedAt && (
            <span className="text-sm text-gray-500">更新時間：{pricesFetchedAt}</span>
          )}
          <button
            onClick={fetchStockPrices}
            disabled={fetchingPrices}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {fetchingPrices ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                取得中...
              </>
            ) : (
              <>📡 取得今日收盤價</>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">股票</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">股數</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">成本價</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">今日收盤</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">漲跌</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">未實現損益</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">停損價</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">狀態</th>
            </tr>
          </thead>
          <tbody>
            {openPositions.map((position) => (
              <PositionRow 
                key={position.id} 
                position={position} 
                priceData={stockPrices[position.stockCode]} 
              />
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(stockPrices).length > 0 && (
        <div className="mt-4 text-xs text-gray-500 text-right">
          資料來源：<a href="https://openapi.twse.com.tw/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">TWSE OpenAPI</a>
        </div>
      )}
    </div>
  );
}

// 單一持倉列元件
function PositionRow({ position, priceData }: { position: Position; priceData?: StockPrice }) {
  const closingPrice = priceData?.closingPrice;
  const change = priceData?.change;
  
  const originalStopLoss = position.stopLossPrice || 
    Math.round(position.avgEntryPrice * 0.9 * 100) / 100;
  
  const trailingStop = calculateTrailingStop(
    position.avgEntryPrice,
    closingPrice ?? null,
    originalStopLoss
  );
  
  const { amount: unrealizedPnL, percent: unrealizedPnLPercent } = calculateUnrealizedPnL(
    position.avgEntryPrice,
    closingPrice ?? null,
    position.totalQuantity
  );

  return (
    <tr className="border-b hover:bg-gray-50">
      {/* 股票資訊 */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{position.stockCode}</span>
          <a
            href={`https://tw.stock.yahoo.com/quote/${position.stockCode}/technical-analysis`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 transition-colors"
            title="查看技術分析圖"
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
              />
            </svg>
          </a>
        </div>
        {position.stockName && (
          <div className="text-sm text-gray-600">{position.stockName}</div>
        )}
      </td>

      {/* 股數 */}
      <td className="text-right py-3 px-4 text-gray-900">
        {position.totalQuantity.toLocaleString()} 股
      </td>

      {/* 成本價 */}
      <td className="text-right py-3 px-4 text-gray-900">
        {position.avgEntryPrice.toLocaleString()} 元
      </td>

      {/* 今日收盤價 */}
      <td className="text-right py-3 px-4">
        <ClosingPriceCell closingPrice={closingPrice} priceData={priceData} />
      </td>

      {/* 漲跌 */}
      <td className="text-right py-3 px-4">
        <ChangeCell change={change} />
      </td>

      {/* 未實現損益 */}
      <td className="text-right py-3 px-4">
        <UnrealizedPnLCell amount={unrealizedPnL} percent={unrealizedPnLPercent} />
      </td>

      {/* 停損價 */}
      <td className="text-right py-3 px-4">
        <StopLossCell trailingStop={trailingStop} originalStopLoss={originalStopLoss} />
      </td>

      {/* 狀態 */}
      <td className="text-right py-3 px-4">
        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm font-semibold">
          持倉中
        </span>
      </td>
    </tr>
  );
}

// 收盤價欄位
function ClosingPriceCell({ closingPrice, priceData }: { closingPrice?: number | null; priceData?: StockPrice }) {
  if (closingPrice !== null && closingPrice !== undefined) {
    return (
      <div>
        <span className="font-semibold text-gray-900">
          {closingPrice.toLocaleString()} 元
        </span>
        {priceData?.market && (
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            priceData.market === 'TWSE' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-purple-100 text-purple-700'
          }`}>
            {priceData.market === 'TWSE' ? '上市' : '上櫃'}
          </span>
        )}
      </div>
    );
  }
  
  if (priceData?.error) {
    return <span className="text-red-500 text-sm">{priceData.error}</span>;
  }
  
  return <span className="text-gray-400 text-sm">--</span>;
}

// 漲跌欄位
function ChangeCell({ change }: { change?: number | null }) {
  if (change !== null && change !== undefined) {
    return (
      <span className={`font-medium ${change > 0 ? 'text-red-600' : change < 0 ? 'text-green-600' : 'text-gray-600'}`}>
        {change > 0 ? '+' : ''}{change.toFixed(2)}
      </span>
    );
  }
  return <span className="text-gray-400 text-sm">--</span>;
}

// 未實現損益欄位
function UnrealizedPnLCell({ amount, percent }: { amount: number | null; percent: number | null }) {
  if (amount !== null && percent !== null) {
    return (
      <div>
        <div className={`font-semibold ${amount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
          {amount >= 0 ? '+' : ''}{Math.round(amount).toLocaleString()} 元
        </div>
        <div className={`text-xs ${percent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
          ({percent >= 0 ? '+' : ''}{percent.toFixed(2)}%)
        </div>
      </div>
    );
  }
  return <span className="text-gray-400 text-sm">--</span>;
}

// 停損價欄位
function StopLossCell({ trailingStop, originalStopLoss }: { trailingStop: TrailingStopResult | null; originalStopLoss: number }) {
  if (trailingStop) {
    return (
      <div>
        <div className={`font-medium ${
          trailingStop.isTriggered 
            ? 'text-white bg-red-500 px-2 py-0.5 rounded animate-pulse' 
            : trailingStop.isActivated 
              ? 'text-green-600' 
              : 'text-red-600'
        }`}>
          {trailingStop.stopLossPrice.toLocaleString()} 元
        </div>
        {trailingStop.isTriggered ? (
          <div className="text-xs text-red-600 font-semibold mt-1">⚠️ 已觸發停損</div>
        ) : trailingStop.isActivated ? (
          <div className="text-xs text-green-600 mt-1 flex items-center justify-end gap-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            追蹤停損中
          </div>
        ) : null}
      </div>
    );
  }
  
  return (
    <span className="text-red-600 font-medium">
      {originalStopLoss.toLocaleString()} 元
    </span>
  );
}










