'use client';

import type { Position, StockPrice, TrailingStopResult } from '@/lib/types';
import { calculateTrailingStop, calculateUnrealizedPnL } from '@/lib/types';
import { initialStopPrice, openPositionCost } from '@/lib/tradeCalculations';
import { IconChartLink, IconClock } from '@/components/Icons';

// 訊號 chip 統一樣式：紅多綠空（與漲紅跌綠一致）、盤整琥珀、52週高以品牌藍突顯
const CHIP_BASE = 'inline-flex items-center gap-1 text-[10.5px] font-semibold px-[7px] py-[1.5px] rounded-full border';
const CHIP = {
  pos: `${CHIP_BASE} text-up bg-up-soft border-up-edge`,
  neg: `${CHIP_BASE} text-down bg-down-soft border-down-edge`,
  warn: `${CHIP_BASE} text-warn bg-warn-soft border-warn-edge`,
  hi: `${CHIP_BASE} text-accent bg-accent-soft border-accent-edge`,
  mute: `${CHIP_BASE} text-ink-3 bg-raised border-line font-medium`,
} as const;

const TREND_CHIP: Record<'多頭排列' | '空頭排列' | '盤整', string> = {
  '多頭排列': CHIP.pos,
  '空頭排列': CHIP.neg,
  '盤整': CHIP.warn,
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

  // 總持倉成本：以尚未賣出股數的成本計（部分平倉不含已賣出部分）
  const totalHoldingCost = openPositions.reduce((sum, p) => {
    return sum + openPositionCost(p).remainingCost;
  }, 0);
  const holdingPercent = initialCapital > 0 ? (totalHoldingCost / initialCapital) * 100 : 0;

  if (openPositions.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface rounded-2xl border border-line overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-b border-line-soft">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          持倉部位
          <span className="text-[11px] font-medium text-ink-3 bg-raised border border-line rounded-full px-2 py-px tabular-nums">
            {openPositions.length} 檔
          </span>
        </h2>
        <span className="text-[11.5px] text-ink-3 tabular-nums">
          總持倉成本 {Math.round(totalHoldingCost).toLocaleString()} {currencySuffix} · 佔預算 {holdingPercent.toFixed(1)}%
        </span>
      </div>

      {/* 大盤趨勢濾網 */}
      {stockPrices[benchmarkCode] && (
        <div className="px-5 pt-3">
          <MarketRegimeCard benchmarkCode={benchmarkCode} priceData={stockPrices[benchmarkCode]!} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-line-soft">
              <Th align="left">股票</Th>
              <Th>股數</Th>
              <Th>成本價</Th>
              <Th>收盤／漲跌</Th>
              <Th>訊號</Th>
              <Th>未實現損益</Th>
              <Th>停損價</Th>
              <Th>佔比</Th>
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
        <div className="px-5 pb-3.5 pt-2.5 text-[11.5px] text-ink-3 text-right border-t border-line-soft">
          資料來源：
          {activeMarket === 'US' ? (
            <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-1">Yahoo Finance（即時報價與歷史日線）</a>
          ) : (
            <>
              <a href="https://openapi.twse.com.tw/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-1">TWSE OpenAPI（上市）</a>
              {'、'}
              <a href="https://www.tpex.org.tw/openapi/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">TPEX OpenAPI（上櫃）</a>
              {'、'}
              <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Yahoo Finance（歷史／備援）</a>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-2.5 px-3.5 first:pl-5 last:pr-5 text-[11px] tracking-wider font-bold text-ink-3 whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
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

// 報價來源 chip：一般顯示上市/上櫃/美股；備援來源以琥珀色明確標示
function SourceChip({ priceData }: { priceData?: StockPrice }) {
  if (!priceData?.market) return null;
  if (priceData.isFallbackSource) {
    return <span className={CHIP.warn} title="主要來源失敗，此檔改用備援來源">{priceData.sourceUsed ?? 'Yahoo'} 備援</span>;
  }
  const label = priceData.market === 'TWSE' ? '上市' : priceData.market === 'TPEX' ? '上櫃' : '美股';
  return <span className={CHIP.mute}>{label}</span>;
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

  // 計算該股票佔投資預算的百分比 - 以尚未賣出股數的成本計（含手續費分攤）
  const positionCost = openPositionCost(position).remainingCost;
  const positionPercent = (positionCost / initialCapital) * 100;

  // 嚴重度色條：停損觸發→紅、弱勢/空頭→黃、新高/多頭/追蹤中→綠、其餘→灰
  const severity: 'crit' | 'warn' | 'ok' | 'none' = trailingStop?.isTriggered
    ? 'crit'
    : priceData?.rsLabel === '弱於大盤' || priceData?.trendAlignment === '空頭排列'
      ? 'warn'
      : priceData?.is52WeekHigh || priceData?.trendAlignment === '多頭排列' || trailingStop?.isActivated
        ? 'ok'
        : 'none';
  const railColor = { crit: 'bg-up', warn: 'bg-warn', ok: 'bg-down', none: 'bg-line' }[severity];

  const rsValue = priceData?.rsValue;
  const rsStrong = priceData?.rsLabel === '強於大盤';

  return (
    <tr className="border-b border-line-soft last:border-b-0 hover:bg-white/[.022] transition-colors">
      {/* 股票資訊（含嚴重度色條） */}
      <td className="py-3 pl-5 pr-3.5">
        <div className="flex items-stretch gap-2.5">
          <span className={`w-[3px] rounded-full flex-none min-h-[34px] ${railColor}`} aria-hidden="true" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-ink">{position.stockCode}</span>
              <a
                href={
                  position.market === 'US'
                    ? `https://finance.yahoo.com/quote/${encodeURIComponent(position.stockCode)}`
                    : `https://tw.stock.yahoo.com/quote/${position.stockCode}/technical-analysis`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-3 hover:text-accent transition-colors"
                title="查看技術分析圖"
              >
                <IconChartLink className="w-[14px] h-[14px]" />
              </a>
              <SourceChip priceData={priceData} />
            </div>
            {position.stockName && (
              <div className="text-[11.5px] text-ink-3">{position.stockName}</div>
            )}
          </div>
        </div>
      </td>

      {/* 股數 */}
      <td className="text-right py-3 px-3.5 text-ink-2 whitespace-nowrap">
        {position.totalQuantity.toLocaleString()} 股
      </td>

      {/* 成本價 */}
      <td className="text-right py-3 px-3.5 text-ink-2 whitespace-nowrap">
        {avgEntry.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>

      {/* 今日收盤價＋漲跌 */}
      <td className="text-right py-3 px-3.5 whitespace-nowrap">
        <ClosingPriceCell closingPrice={closingPrice} change={change} priceData={priceData} />
      </td>

      {/* 訊號（趨勢／RS／52週高／量能） */}
      <td className="text-right py-3 px-3.5">
        <div className="flex gap-1 justify-end flex-wrap max-w-[210px] ml-auto">
          {priceData?.trendAlignment && (
            <span
              className={TREND_CHIP[priceData.trendAlignment]}
              title={`MA20: ${fmtMA(priceData.ma20)} / MA50: ${fmtMA(priceData.ma50)} / MA200: ${fmtMA(priceData.ma200)}`}
            >
              {priceData.trendAlignment}
            </span>
          )}
          {rsValue != null && priceData?.rsLabel && (
            <span className={rsStrong ? CHIP.pos : CHIP.neg} title={`相對強度：${priceData.rsLabel}`}>
              RS {rsValue >= 0 ? '+' : ''}{rsValue.toFixed(1)}
            </span>
          )}
          {priceData?.is52WeekHigh && <span className={CHIP.hi}>52週高</span>}
          {priceData?.isVolumeHigh && priceData?.volumeRatio && (
            <span className={CHIP.pos}>量增 {((priceData.volumeRatio - 1) * 100).toFixed(0)}%</span>
          )}
          {!priceData && <span className="text-ink-3 text-xs">--</span>}
        </div>
      </td>

      {/* 未實現損益 */}
      <td className="text-right py-3 px-3.5 whitespace-nowrap">
        <UnrealizedPnLCell amount={unrealizedPnL} percent={unrealizedPnLPercent} currencySuffix={currencySuffix} />
      </td>

      {/* 停損價 */}
      <td className="text-right py-3 px-3.5 whitespace-nowrap">
        <StopLossCell trailingStop={trailingStop} originalStopLoss={originalStopLoss} closingPrice={closingPrice ?? null} />
      </td>

      {/* 佔比（迷你長條，滿條 = 25%） */}
      <td className="text-right py-3 pl-3.5 pr-5">
        <div className="inline-grid gap-[3px] justify-items-end">
          <div className="w-16 h-1 rounded-full bg-raised overflow-hidden">
            <div
              className={`h-full rounded-full ${positionPercent > 20 ? 'bg-up' : positionPercent > 10 ? 'bg-warn' : 'bg-down'}`}
              style={{ width: `${Math.min((positionPercent / 25) * 100, 100)}%` }}
            />
          </div>
          <span className={`text-[10.5px] font-semibold ${positionPercent > 20 ? 'text-up' : positionPercent > 10 ? 'text-warn' : 'text-ink-3'}`}>
            {positionPercent.toFixed(1)}%
          </span>
        </div>
      </td>
    </tr>
  );
}

const fmtMA = (v?: number | null) => (v != null ? v.toFixed(2) : '--');

// 收盤價欄位（含漲跌）
function ClosingPriceCell({ closingPrice, change, priceData }: { closingPrice?: number | null; change?: number | null; priceData?: StockPrice }) {
  if (closingPrice !== null && closingPrice !== undefined) {
    return (
      <div>
        <div className="font-semibold text-ink">{closingPrice.toLocaleString()}</div>
        {change !== null && change !== undefined ? (
          <div className={`text-[11px] ${change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-ink-3'}`}>
            {change > 0 ? '+' : ''}{change.toFixed(2)}
          </div>
        ) : null}
      </div>
    );
  }
  if (priceData?.error) {
    return <span className="text-up text-xs">{priceData.error}</span>;
  }
  return <span className="text-ink-3 text-xs">--</span>;
}

// 未實現損益欄位
function UnrealizedPnLCell({ amount, percent, currencySuffix = '元' }: { amount: number | null; percent: number | null; currencySuffix?: string }) {
  if (amount !== null && percent !== null) {
    const cls = amount >= 0 ? 'text-up' : 'text-down';
    return (
      <div className={cls}>
        <div className="font-semibold">
          {amount >= 0 ? '+' : ''}{Math.round(amount).toLocaleString()} <span className="text-[11px] font-medium opacity-70">{currencySuffix}</span>
        </div>
        <div className="text-[11px] opacity-80">
          {percent >= 0 ? '+' : ''}{percent.toFixed(2)}%
        </div>
      </div>
    );
  }
  return <span className="text-ink-3 text-xs">--</span>;
}

// 停損價欄位：觸發→紅色警示；追蹤中→綠點；距停損 <3% 提前提醒
function StopLossCell({ trailingStop, originalStopLoss, closingPrice }: { trailingStop: TrailingStopResult | null; originalStopLoss: number; closingPrice: number | null }) {
  const stopPrice = trailingStop ? trailingStop.stopLossPrice : originalStopLoss;
  const distancePct =
    closingPrice != null && closingPrice > 0 ? ((closingPrice - stopPrice) / closingPrice) * 100 : null;

  if (trailingStop?.isTriggered) {
    return (
      <div>
        <span className="inline-block font-semibold text-white bg-red-600 px-2 py-0.5 rounded animate-pulse">
          {stopPrice.toLocaleString()}
        </span>
        <div className="text-[11px] text-up font-semibold mt-1">已觸發停損</div>
      </div>
    );
  }

  return (
    <div>
      <div className={`font-medium ${trailingStop?.isActivated ? 'text-down' : 'text-ink-2'}`}>
        {stopPrice.toLocaleString()}
      </div>
      {trailingStop?.isActivated ? (
        <div className="text-[11px] text-down mt-0.5 flex items-center justify-end gap-1">
          <span className="inline-block w-1.5 h-1.5 bg-down rounded-full" />
          追蹤中
        </div>
      ) : distancePct != null && distancePct > 0 && distancePct <= 3 ? (
        <div className="text-[11px] text-up font-semibold mt-0.5">距停損 {distancePct.toFixed(1)}%</div>
      ) : null}
    </div>
  );
}

// 大盤趨勢濾網卡片
function MarketRegimeCard({ benchmarkCode, priceData }: { benchmarkCode: string; priceData: StockPrice }) {
  const { closingPrice, change, trendAlignment, ma20, ma50, ma200 } = priceData;
  return (
    <div className="mb-1 px-3.5 py-2.5 bg-raised rounded-xl border border-line-soft flex items-center gap-3 flex-wrap text-[12.5px] tabular-nums">
      <span className="text-ink-3 inline-flex items-center gap-1.5">
        <IconClock className="w-[14px] h-[14px]" />
        大盤濾網
      </span>
      <span className="font-bold text-ink">{benchmarkCode}</span>
      {closingPrice != null && <span className="text-ink-2">{closingPrice.toLocaleString()}</span>}
      {change != null && (
        <span className={`font-semibold ${change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-ink-3'}`}>
          {change > 0 ? '+' : ''}{change.toFixed(2)}
        </span>
      )}
      {trendAlignment && (
        <span className={TREND_CHIP[trendAlignment]}>{trendAlignment}</span>
      )}
      <span className="ml-auto text-ink-3 hidden sm:inline">
        MA20 {fmtMA(ma20)} · MA50 {fmtMA(ma50)} · MA200 {fmtMA(ma200)}
      </span>
    </div>
  );
}
