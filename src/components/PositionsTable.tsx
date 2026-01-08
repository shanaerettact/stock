'use client';

import { useState } from 'react';
import type { Position, StockPrice, TrailingStopResult } from '@/lib/types';
import { calculateTrailingStop, calculateUnrealizedPnL } from '@/lib/types';

interface PositionsTableProps {
  positions: Position[];
  initialCapital?: number;
  onMessage?: (type: 'success' | 'error', text: string) => void;
}

export default function PositionsTable({ positions, initialCapital = 100000, onMessage }: PositionsTableProps) {
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);

  const openPositions = positions.filter(p => p.status === 'OPEN');
  
  // 計算總持倉成本和佔比 - 使用 totalInvested（含手續費）
  const totalHoldingCost = openPositions.reduce((sum, p) => {
    // 優先使用 totalInvested（含手續費），否則用成交金額估算
    return sum + ((p as { totalInvested?: number }).totalInvested ?? (p.avgEntryPrice * p.totalQuantity));
  }, 0);
  const holdingPercent = (totalHoldingCost / initialCapital) * 100;

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

  // 決定持倉佔比的顏色和等級
  const getHoldingStatus = () => {
    if (holdingPercent > 80) return { color: 'red', bg: 'bg-red-500', text: 'text-red-400', label: '過高', icon: '🔴' };
    if (holdingPercent > 50) return { color: 'yellow', bg: 'bg-yellow-500', text: 'text-yellow-400', label: '偏高', icon: '🟡' };
    if (holdingPercent > 30) return { color: 'blue', bg: 'bg-blue-500', text: 'text-blue-400', label: '適中', icon: '🔵' };
    return { color: 'green', bg: 'bg-green-500', text: 'text-green-400', label: '安全', icon: '🟢' };
  };
  const holdingStatus = getHoldingStatus();

  return (
    <div className="bg-gray-900 rounded-lg shadow-md p-6 border border-gray-800">
      {/* 標題與操作按鈕 */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-100">📊 目前持倉</h2>
        <div className="flex items-center gap-3">
          {pricesFetchedAt && (
            <span className="text-sm text-gray-500">更新時間：{pricesFetchedAt}</span>
          )}
          <button
            onClick={fetchStockPrices}
            disabled={fetchingPrices}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors text-sm"
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

      {/* 持倉總覽 - 顯眼的佔比顯示 */}
      <div className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* 左側：持倉成本 */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">總持倉成本</div>
              <div className="text-2xl font-bold text-white">
                {Math.round(totalHoldingCost).toLocaleString()} <span className="text-lg text-gray-400">元</span>
              </div>
            </div>
            <div className="text-3xl text-gray-600">|</div>
            <div>
              <div className="text-sm text-gray-400 mb-1">投資預算</div>
              <div className="text-xl font-semibold text-gray-300">
                {initialCapital.toLocaleString()} <span className="text-sm text-gray-400">元</span>
              </div>
            </div>
          </div>

          {/* 右側：佔比圓圈 */}
          <div className="flex items-center gap-4">
            {/* 佔比進度條 */}
            <div className="flex-1 md:w-48">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-400">資金使用率</span>
                <span className={`text-sm font-semibold ${holdingStatus.text}`}>
                  {holdingStatus.icon} {holdingStatus.label}
                </span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${holdingStatus.bg} transition-all duration-700 ease-out`}
                  style={{ width: `${Math.min(holdingPercent, 100)}%` }}
                />
              </div>
            </div>

            {/* 佔比數字 */}
            <div className={`text-center px-4 py-2 rounded-xl border-2 ${
              holdingPercent > 80 ? 'border-red-500 bg-red-900/30' :
              holdingPercent > 50 ? 'border-yellow-500 bg-yellow-900/30' :
              holdingPercent > 30 ? 'border-blue-500 bg-blue-900/30' :
              'border-green-500 bg-green-900/30'
            }`}>
              <div className={`text-3xl font-bold ${holdingStatus.text}`}>
                {holdingPercent.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">佔投資預算</div>
            </div>
          </div>
        </div>

        {/* 風險提示 */}
        {holdingPercent > 50 && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${
            holdingPercent > 80 
              ? 'bg-red-900/40 border border-red-700 text-red-300'
              : 'bg-yellow-900/40 border border-yellow-700 text-yellow-300'
          }`}>
            {holdingPercent > 80 
              ? '⚠️ 持倉比例過高！建議適度減倉以降低風險'
              : '💡 持倉比例偏高，請注意資金配置與風險控管'
            }
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">股票</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">股數</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">成本價</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">今日收盤</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">漲跌</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">未實現損益</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">停損價</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">狀態</th>
            </tr>
          </thead>
          <tbody>
            {openPositions.map((position) => (
              <PositionRow 
                key={position.id} 
                position={position} 
                priceData={stockPrices[position.stockCode]}
                initialCapital={initialCapital}
              />
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(stockPrices).length > 0 && (
        <div className="mt-4 text-xs text-gray-500 text-right">
          資料來源：
          <a href="https://openapi.twse.com.tw/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">TWSE OpenAPI</a>
          {'、'}
          <a href="https://finmind.github.io/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">FinMind API</a>
        </div>
      )}
    </div>
  );
}

// 單一持倉列元件
function PositionRow({ position, priceData, initialCapital }: { position: Position; priceData?: StockPrice; initialCapital: number }) {
  const closingPrice = priceData?.closingPrice;
  const change = priceData?.change;
  
  const originalStopLoss = position.stopLossPrice || 
    Math.round(position.avgEntryPrice * 0.92 * 100) / 100;
  
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

  // 計算該股票佔投資預算的百分比 - 使用 totalInvested（含手續費）
  const positionCost = (position as { totalInvested?: number }).totalInvested ?? (position.avgEntryPrice * position.totalQuantity);
  const positionPercent = (positionCost / initialCapital) * 100;

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      {/* 股票資訊 */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-200">{position.stockCode}</span>
          <a
            href={`https://tw.stock.yahoo.com/quote/${position.stockCode}/technical-analysis`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
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
          <div className="text-sm text-gray-500">{position.stockName}</div>
        )}
        {/* 52 周新高提示 */}
        {priceData?.is52WeekHigh && (
          <div className="mt-1 flex items-center gap-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-900/50 text-yellow-400">
              🎯 52周新高
            </span>
          </div>
        )}
        {/* 交易量提示 */}
        {priceData?.isVolumeHigh && priceData?.volumeRatio && (
          <div className="mt-1 flex items-center gap-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-900/50 text-green-400">
              📈 量增 {((priceData.volumeRatio - 1) * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </td>

      {/* 股數 */}
      <td className="text-right py-3 px-4 text-gray-200">
        {position.totalQuantity.toLocaleString()} 股
      </td>

      {/* 成本價 */}
      <td className="text-right py-3 px-4 text-gray-200">
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

      {/* 狀態與佔比 */}
      <td className="text-right py-3 px-4">
        <div className="flex flex-col items-end gap-1">
          <span className="px-2 py-1 bg-orange-900/50 text-orange-400 rounded text-sm font-semibold">
            持倉中
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            positionPercent > 20 ? 'bg-red-900/50 text-red-400' :
            positionPercent > 10 ? 'bg-yellow-900/50 text-yellow-400' :
            'bg-green-900/50 text-green-400'
          }`}>
            佔 {positionPercent.toFixed(1)}%
          </span>
        </div>
      </td>
    </tr>
  );
}

// 收盤價欄位
function ClosingPriceCell({ closingPrice, priceData }: { closingPrice?: number | null; priceData?: StockPrice }) {
  if (closingPrice !== null && closingPrice !== undefined) {
    return (
      <div>
        <span className="font-semibold text-gray-200">
          {closingPrice.toLocaleString()} 元
        </span>
        {priceData?.market && (
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            priceData.market === 'TWSE' 
              ? 'bg-blue-900/50 text-blue-400' 
              : 'bg-purple-900/50 text-purple-400'
          }`}>
            {priceData.market === 'TWSE' ? '上市' : '上櫃'}
          </span>
        )}
      </div>
    );
  }
  
  if (priceData?.error) {
    return <span className="text-red-400 text-sm">{priceData.error}</span>;
  }
  
  return <span className="text-gray-500 text-sm">--</span>;
}

// 漲跌欄位
function ChangeCell({ change }: { change?: number | null }) {
  if (change !== null && change !== undefined) {
    return (
      <span className={`font-medium ${change > 0 ? 'text-red-400' : change < 0 ? 'text-green-400' : 'text-gray-400'}`}>
        {change > 0 ? '+' : ''}{change.toFixed(2)}
      </span>
    );
  }
  return <span className="text-gray-500 text-sm">--</span>;
}

// 未實現損益欄位
function UnrealizedPnLCell({ amount, percent }: { amount: number | null; percent: number | null }) {
  if (amount !== null && percent !== null) {
    return (
      <div>
        <div className={`font-semibold ${amount >= 0 ? 'text-red-400' : 'text-green-400'}`}>
          {amount >= 0 ? '+' : ''}{Math.round(amount).toLocaleString()} 元
        </div>
        <div className={`text-xs ${percent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
          ({percent >= 0 ? '+' : ''}{percent.toFixed(2)}%)
        </div>
      </div>
    );
  }
  return <span className="text-gray-500 text-sm">--</span>;
}

// 停損價欄位
function StopLossCell({ trailingStop, originalStopLoss }: { trailingStop: TrailingStopResult | null; originalStopLoss: number }) {
  if (trailingStop) {
    return (
      <div>
        <div className={`font-medium ${
          trailingStop.isTriggered 
            ? 'text-white bg-red-600 px-2 py-0.5 rounded animate-pulse' 
            : trailingStop.isActivated 
              ? 'text-green-400' 
              : 'text-red-400'
        }`}>
          {trailingStop.stopLossPrice.toLocaleString()} 元
        </div>
        {trailingStop.isTriggered ? (
          <div className="text-xs text-red-400 font-semibold mt-1">⚠️ 已觸發停損</div>
        ) : trailingStop.isActivated ? (
          <div className="text-xs text-green-400 mt-1 flex items-center justify-end gap-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            追蹤停損中
          </div>
        ) : null}
      </div>
    );
  }
  
  return (
    <span className="text-red-400 font-medium">
      {originalStopLoss.toLocaleString()} 元
    </span>
  );
}










