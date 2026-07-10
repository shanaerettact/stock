'use client';

import type { Position, StockPrice, TrailingStopResult } from '@/lib/types';
import { calculateTrailingStop, calculateUnrealizedPnL } from '@/lib/types';
import { initialStopPrice } from '@/lib/tradeCalculations';

// 趨勢排列圖示與顏色
const TREND_CONFIG: Record<'多頭排列' | '空頭排列' | '盤整', { icon: string; color: string }> = {
  '多頭排列': { icon: '🟢', color: 'bg-green-900/50 text-green-400' },
  '空頭排列': { icon: '🔴', color: 'bg-red-900/50 text-red-400' },
  '盤整': { icon: '🟡', color: 'bg-yellow-900/50 text-yellow-400' },
};

interface PositionsTableProps {
  positions: Position[];
  initialCapital?: number;
  currencySuffix?: string;
  activeMarket?: 'TW' | 'US';
  /** 由上層（page）統一抓取並傳入的今日收盤價 */
  stockPrices: Record<string, StockPrice>;
}

export default function PositionsTable({ positions, initialCapital = 100000, currencySuffix = '元', activeMarket = 'TW', stockPrices }: PositionsTableProps) {
  const benchmarkCode = activeMarket === 'US' ? 'SPY' : '0050';
  const openPositions = positions.filter(p => p.status === 'OPEN');

  // 總持倉成本（優先使用 totalInvested，含手續費）
  const totalHoldingCost = openPositions.reduce((sum, p) => {
    return sum + ((p as { totalInvested?: number }).totalInvested ?? (p.avgEntryPrice * p.totalQuantity));
  }, 0);
  const holdingPercent = initialCapital > 0 ? (totalHoldingCost / initialCapital) * 100 : 0;

  if (openPositions.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-900 rounded-2xl shadow-md border border-gray-800 overflow-hidden">
      {/* 標題列（資金使用率已移至頂部 KPI，這裡僅保留精簡摘要） */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-gray-800">
        <h2 className="text-lg font-bold text-gray-100">
          📊 持倉部位 <span className="font-normal text-gray-500 text-sm ml-1">{openPositions.length} 檔</span>
        </h2>
        <span className="text-xs text-gray-500">
          總持倉成本 {Math.round(totalHoldingCost).toLocaleString()} {currencySuffix} · 佔預算 {holdingPercent.toFixed(1)}%
        </span>
      </div>

      {/* 大盤趨勢濾網 */}
      {stockPrices[benchmarkCode] && (
        <div className="px-5 pt-4">
          <MarketRegimeCard benchmarkCode={benchmarkCode} priceData={stockPrices[benchmarkCode]!} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">股票</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">股數</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">成本價</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">今日收盤</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">漲跌</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">RS 相對強度</th>
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
                currencySuffix={currencySuffix}
              />
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(stockPrices).length > 0 && (
        <div className="px-5 pb-4 pt-3 text-xs text-gray-500 text-right">
          資料來源：
          {activeMarket === 'US' ? (
            <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">Yahoo Finance（即時報價與歷史日線）</a>
          ) : (
            <>
              <a href="https://openapi.twse.com.tw/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">TWSE OpenAPI（上市）</a>
              {'、'}
              <a href="https://www.tpex.org.tw/openapi/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">TPEX OpenAPI（上櫃）</a>
              {'、'}
              <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Yahoo Finance（歷史／備援）</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 美股：加權成交價 Σ(價×股數)/Σ股數，與交易列表「成交價」及後端 avgEntryPrice 一致 */
type PositionWithTrades = Position & {
  trades?: Array<{ tradeType: string; quantity: number; amount: number; unit: string; price: number }>;
};

export function effectiveAvgEntryPrice(position: Position): number {
  if (position.market !== 'US' || !position.trades?.length) {
    return position.avgEntryPrice;
  }
  const buys = position.trades.filter((t) => t.tradeType === 'BUY');
  let qsum = 0;
  let psum = 0;
  for (const t of buys) {
    const q = typeof t.quantity === 'number' ? t.quantity : parseFloat(String(t.quantity));
    if (!Number.isFinite(q) || q <= 0) continue;
    const px = typeof t.price === 'number' ? t.price : parseFloat(String(t.price));
    if (!Number.isFinite(px)) continue;
    qsum += q;
    psum += px * q;
  }
  return qsum > 0 ? psum / qsum : position.avgEntryPrice;
}

// 單一持倉列元件
function PositionRow({ position, priceData, initialCapital, currencySuffix = '元' }: { position: Position; priceData?: StockPrice; initialCapital: number; currencySuffix?: string }) {
  const positionX = position as PositionWithTrades;
  const avgEntry = effectiveAvgEntryPrice(positionX);
  const closingPrice = priceData?.closingPrice;
  const change = priceData?.change;
  
  const originalStopLoss = position.stopLossPrice || initialStopPrice(avgEntry);
  
  const trailingStop = calculateTrailingStop(
    avgEntry,
    closingPrice ?? null,
    originalStopLoss
  );
  
  const { amount: unrealizedPnL, percent: unrealizedPnLPercent } = calculateUnrealizedPnL(
    avgEntry,
    closingPrice ?? null,
    position.totalQuantity
  );

  // 計算該股票佔投資預算的百分比 - 使用 totalInvested（含手續費）
  const positionCost = (position as { totalInvested?: number }).totalInvested ?? (position.avgEntryPrice * position.totalQuantity);
  const positionPercent = (positionCost / initialCapital) * 100;

  // 嚴重度色條：停損觸發→紅、弱勢/空頭→黃、新高/多頭/追蹤中→綠、其餘→灰
  const severity: 'crit' | 'warn' | 'ok' | 'none' = trailingStop?.isTriggered
    ? 'crit'
    : priceData?.rsLabel === '弱於大盤' || priceData?.trendAlignment === '空頭排列'
      ? 'warn'
      : priceData?.is52WeekHigh || priceData?.trendAlignment === '多頭排列' || trailingStop?.isActivated
        ? 'ok'
        : 'none';
  const railColor = { crit: 'bg-red-500', warn: 'bg-amber-500', ok: 'bg-green-500', none: 'bg-gray-700' }[severity];

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      {/* 股票資訊（含嚴重度色條） */}
      <td className="py-3 px-4">
       <div className="flex items-stretch gap-3">
        <span className={`w-1 rounded-full flex-none ${railColor}`} aria-hidden="true" />
        <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-200">{position.stockCode}</span>
          <a
            href={
              position.market === 'US'
                ? `https://finance.yahoo.com/quote/${encodeURIComponent(position.stockCode)}`
                : `https://tw.stock.yahoo.com/quote/${position.stockCode}/technical-analysis`
            }
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
        {/* 均線趨勢排列 */}
        {priceData?.trendAlignment && (
          <div className="mt-1 flex items-center gap-1">
            <TrendBadge trendAlignment={priceData.trendAlignment} ma20={priceData.ma20} ma50={priceData.ma50} ma200={priceData.ma200} />
          </div>
        )}
        </div>
       </div>
      </td>

      {/* 股數 */}
      <td className="text-right py-3 px-4 text-gray-200">
        {position.totalQuantity.toLocaleString()} 股
      </td>

      {/* 成本價 */}
      <td className="text-right py-3 px-4 text-gray-200">
        {avgEntry.toLocaleString()} {currencySuffix}
      </td>

      {/* 今日收盤價 */}
      <td className="text-right py-3 px-4">
        <ClosingPriceCell closingPrice={closingPrice} priceData={priceData} currencySuffix={currencySuffix} />
      </td>

      {/* 漲跌 */}
      <td className="text-right py-3 px-4">
        <ChangeCell change={change} />
      </td>

      {/* RS 相對強度 */}
      <td className="text-right py-3 px-4">
        <RSCell rsValue={priceData?.rsValue} rsLabel={priceData?.rsLabel} />
      </td>

      {/* 未實現損益 */}
      <td className="text-right py-3 px-4">
        <UnrealizedPnLCell amount={unrealizedPnL} percent={unrealizedPnLPercent} currencySuffix={currencySuffix} />
      </td>

      {/* 停損價 */}
      <td className="text-right py-3 px-4">
        <StopLossCell trailingStop={trailingStop} originalStopLoss={originalStopLoss} currencySuffix={currencySuffix} />
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
function ClosingPriceCell({ closingPrice, priceData, currencySuffix = '元' }: { closingPrice?: number | null; priceData?: StockPrice; currencySuffix?: string }) {
  if (closingPrice !== null && closingPrice !== undefined) {
    return (
      <div>
        <span className="font-semibold text-gray-200">
          {closingPrice.toLocaleString()} {currencySuffix}
        </span>
        {priceData?.market && (
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            priceData.market === 'TWSE'
              ? 'bg-blue-900/50 text-blue-400'
              : priceData.market === 'TPEX'
              ? 'bg-purple-900/50 text-purple-400'
              : 'bg-amber-900/50 text-amber-400'
          }`}>
            {priceData.market === 'TWSE' ? '上市' : priceData.market === 'TPEX' ? '上櫃' : '美股'}
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

// 均線趨勢排列 badge
function TrendBadge({ trendAlignment, ma20, ma50, ma200 }: {
  trendAlignment: '多頭排列' | '空頭排列' | '盤整';
  ma20?: number | null;
  ma50?: number | null;
  ma200?: number | null;
}) {
  const config = TREND_CONFIG[trendAlignment];
  const fmt = (v?: number | null) => (v != null ? v.toFixed(2) : '--');
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${config.color}`}
      title={`MA20: ${fmt(ma20)} / MA50: ${fmt(ma50)} / MA200: ${fmt(ma200)}`}
    >
      {config.icon} {trendAlignment}
    </span>
  );
}

// RS 相對強度欄位
function RSCell({ rsValue, rsLabel }: { rsValue?: number | null; rsLabel?: '強於大盤' | '弱於大盤' | null }) {
  if (rsValue == null || !rsLabel) {
    return <span className="text-gray-500 text-sm">--</span>;
  }
  const isStrong = rsLabel === '強於大盤';
  return (
    <div className={isStrong ? 'text-red-400' : 'text-green-400'}>
      <div className="font-medium">{rsValue >= 0 ? '+' : ''}{rsValue.toFixed(1)}%</div>
      <div className="text-xs">{rsLabel}</div>
    </div>
  );
}

// 大盤趨勢濾網卡片
function MarketRegimeCard({ benchmarkCode, priceData }: { benchmarkCode: string; priceData: StockPrice }) {
  const { closingPrice, change, trendAlignment, ma20, ma50, ma200 } = priceData;
  return (
    <div className="mb-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">📡 大盤狀態</span>
        <span className="font-semibold text-gray-200">{benchmarkCode}</span>
        {closingPrice != null && (
          <span className="text-gray-200">{closingPrice.toLocaleString()}</span>
        )}
        <ChangeCell change={change} />
      </div>
      {trendAlignment && (
        <TrendBadge trendAlignment={trendAlignment} ma20={ma20} ma50={ma50} ma200={ma200} />
      )}
    </div>
  );
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
function UnrealizedPnLCell({ amount, percent, currencySuffix = '元' }: { amount: number | null; percent: number | null; currencySuffix?: string }) {
  if (amount !== null && percent !== null) {
    return (
      <div>
        <div className={`font-semibold ${amount >= 0 ? 'text-red-400' : 'text-green-400'}`}>
          {amount >= 0 ? '+' : ''}{Math.round(amount).toLocaleString()} {currencySuffix}
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
function StopLossCell({ trailingStop, originalStopLoss, currencySuffix = '元' }: { trailingStop: TrailingStopResult | null; originalStopLoss: number; currencySuffix?: string }) {
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
          {trailingStop.stopLossPrice.toLocaleString()} {currencySuffix}
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
      {originalStopLoss.toLocaleString()} {currencySuffix}
    </span>
  );
}










