/**
 * 平倉部位自動分析：依進場當下的歷史技術指標，回填「進場訊號標籤」與備註。
 * 分類規則以既有 12 筆手動標記部位（同時具備進場快照與 setupType）校準而得，
 * 詳見 /Users/johnny/.claude/plans/precious-soaring-haven.md。
 */

import type { TrendAlignment } from '@/lib/indicators';
import { SETUP_TYPES } from '@/lib/types';
import {
  getHistoryCached,
  fetchYahooUsHistory,
  getYearRangeEndingAt,
  calculateAdvancedMetricsAsOf,
} from '@/lib/marketHistory';

export type SetupType = (typeof SETUP_TYPES)[number];

export interface EntryIndicators {
  trend: TrendAlignment | null;
  pctFrom52wHigh: number | null;
  rsValue: number | null;
  volumeRatio: number | null;
}

/**
 * 依進場當下指標分類訊號標籤。
 * - 規則 1/2（其他／52週新高突破）由 3+5 筆樣本驗證，把握較高。
 * - 規則 3（強勢股輪動，僅 1 筆樣本）與規則 5（回測支撐/均線，0 筆樣本）證據較薄弱，
 *   屬合理猜測；備註會附上原始指標數字供人工覆核。
 */
export function classifySetupType(ind: EntryIndicators): SetupType {
  if (ind.trend !== '多頭排列') return '其他';
  if (ind.pctFrom52wHigh !== null && ind.pctFrom52wHigh >= -3) return '52週新高突破';
  if (ind.rsValue !== null && ind.rsValue >= 60 && ind.volumeRatio !== null && ind.volumeRatio < 2) {
    return '強勢股輪動';
  }
  if (ind.pctFrom52wHigh !== null && ind.pctFrom52wHigh >= -12) return '箱型突破';
  if (ind.pctFrom52wHigh !== null) return '回測支撐/均線';
  return '其他';
}

export interface AutoNotesInput {
  market: 'TW' | 'US';
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  holdingDays: number | null;
  returnRate: number | null;
  trendAtEntry: TrendAlignment | null;
  pctFrom52wHighAtEntry: number | null;
  rsAtEntry: number | null;
  volRatioAtEntry: number | null;
}

const fmtDate = (d: Date): string => d.toISOString().slice(0, 10).replace(/-/g, '/');
const fmtSigned = (v: number, digits: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

/** 組出固定格式的自動分析備註，並清楚標註為系統自動產生，方便使用者分辨、修改。 */
export function buildAutoNotes(input: AutoNotesInput): string {
  const unit = input.market === 'US' ? '美元' : '元';

  const indicatorBits: string[] = [];
  if (input.pctFrom52wHighAtEntry != null) {
    indicatorBits.push(`距52週高 ${fmtSigned(input.pctFrom52wHighAtEntry, 1)}%`);
  }
  if (input.trendAtEntry) indicatorBits.push(input.trendAtEntry);
  if (input.volRatioAtEntry != null) indicatorBits.push(`量比 ${input.volRatioAtEntry.toFixed(2)}x`);
  if (input.rsAtEntry != null) indicatorBits.push(`RS ${fmtSigned(input.rsAtEntry, 1)}%`);

  const entryLine = `進場 ${fmtDate(input.entryDate)} @ ${input.entryPrice}${unit}${
    indicatorBits.length ? `（${indicatorBits.join('、')}）` : ''
  }`;

  const holdingBit = input.holdingDays != null ? `，持有 ${input.holdingDays} 天` : '';
  const returnBit = input.returnRate != null ? `，報酬率 ${fmtSigned(input.returnRate, 1)}%` : '';
  const exitLine = `出場 ${fmtDate(input.exitDate)} @ ${input.exitPrice}${unit}${holdingBit}${returnBit}`;

  return [entryLine, exitLine, '（系統依歷史股價自動分析回填，如與實際操作理由不符請自行修改）'].join('\n');
}

export interface ClosedPositionInput {
  stockCode: string;
  market: 'TW' | 'US';
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  holdingDays: number | null;
  returnRate: number | null;
}

export interface ClosedPositionAnalysis {
  setupType: SetupType;
  notes: string;
  rsAtEntry: number | null;
  trendAtEntry: TrendAlignment | null;
  pctFrom52wHighAtEntry: number | null;
  volRatioAtEntry: number | null;
}

/**
 * 依部位進場日期回溯抓取歷史股價，計算當時的技術指標並分類訊號標籤、組備註。
 * Best-effort：任何一步失敗（抓不到歷史資料等）回傳 null，呼叫端應忽略錯誤、不影響交易本身。
 */
export async function analyzeClosedPosition(
  input: ClosedPositionInput
): Promise<ClosedPositionAnalysis | null> {
  try {
    const { startDateStr, endDateStr } = getYearRangeEndingAt(input.entryDate);
    const isUs = input.market === 'US';

    const { history: stockHistory } = await getHistoryCached(
      input.stockCode,
      startDateStr,
      endDateStr,
      null
    );
    if (stockHistory.length === 0) return null;

    const entryDateStr = endDateStr; // getYearRangeEndingAt 的 endDateStr 即 entryDate 的 ISO 日期
    const entryCandle =
      [...stockHistory].reverse().find(d => d.date <= entryDateStr) ??
      stockHistory[stockHistory.length - 1] ??
      null;
    const entryClose = entryCandle?.close ?? input.entryPrice;
    const entryVolume = entryCandle?.volume ?? null;

    const benchmarkCode = isUs ? 'SPY' : '0050';
    const benchmarkHistory = isUs
      ? await fetchYahooUsHistory('SPY', startDateStr, endDateStr)
      : (await getHistoryCached('0050', startDateStr, endDateStr, '上市')).history;
    const benchmarkCloses = benchmarkHistory.map(d => d.close);

    const metrics = await calculateAdvancedMetricsAsOf(
      input.stockCode,
      input.entryDate,
      entryClose,
      entryVolume,
      benchmarkCloses,
      benchmarkCode,
      null
    );

    const pctFrom52wHighAtEntry =
      metrics.week52High != null && metrics.week52High > 0
        ? (entryClose / metrics.week52High - 1) * 100
        : null;

    const indicators: EntryIndicators = {
      trend: metrics.trendAlignment,
      pctFrom52wHigh: pctFrom52wHighAtEntry,
      rsValue: metrics.rsValue,
      volumeRatio: metrics.volumeRatio,
    };
    const setupType = classifySetupType(indicators);

    const notes = buildAutoNotes({
      market: input.market,
      entryDate: input.entryDate,
      entryPrice: input.entryPrice,
      exitDate: input.exitDate,
      exitPrice: input.exitPrice,
      holdingDays: input.holdingDays,
      returnRate: input.returnRate,
      trendAtEntry: metrics.trendAlignment,
      pctFrom52wHighAtEntry,
      rsAtEntry: metrics.rsValue,
      volRatioAtEntry: metrics.volumeRatio,
    });

    return {
      setupType,
      notes,
      rsAtEntry: metrics.rsValue,
      trendAtEntry: metrics.trendAlignment,
      pctFrom52wHighAtEntry,
      volRatioAtEntry: metrics.volumeRatio,
    };
  } catch (error) {
    console.warn(`平倉自動分析失敗 (${input.stockCode}):`, error);
    return null;
  }
}
