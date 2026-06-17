/**
 * 順勢交易技術指標計算函式庫
 * 包含移動平均線（MA）、趨勢排列、相對強度（RS）
 */

export type TrendAlignment = '多頭排列' | '空頭排列' | '盤整';

/**
 * 計算簡單移動平均線（SMA）
 * @param closes 收盤價序列（依時間升序）
 * @param period 計算週期
 * @returns 與輸入長度相同的陣列，前 period-1 筆為 null
 */
export function calculateSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);

  if (period <= 0) {
    return result;
  }

  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i] as number;
    if (i >= period) {
      sum -= closes[i - period] as number;
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }

  return result;
}

/**
 * 依現價與 MA20/MA50/MA200 判斷趨勢排列
 * - 三者皆有值：price > ma20 > ma50 > ma200 → 多頭排列；price < ma20 < ma50 < ma200 → 空頭排列；其餘 → 盤整
 * - ma200 缺值但 ma20/ma50 有值：僅比較 price/ma20/ma50 三者排列
 * - ma50 也缺值：資料不足，回傳 null
 */
export function getTrendAlignment(
  price: number | null,
  ma20: number | null,
  ma50: number | null,
  ma200: number | null
): TrendAlignment | null {
  if (price === null || ma20 === null || ma50 === null) {
    return null;
  }

  if (ma200 !== null) {
    if (price > ma20 && ma20 > ma50 && ma50 > ma200) return '多頭排列';
    if (price < ma20 && ma20 < ma50 && ma50 < ma200) return '空頭排列';
    return '盤整';
  }

  if (price > ma20 && ma20 > ma50) return '多頭排列';
  if (price < ma20 && ma20 < ma50) return '空頭排列';
  return '盤整';
}

export interface RelativeStrengthResult {
  rsValue: number; // 個股報酬% - 大盤報酬%
  rsLabel: '強於大盤' | '弱於大盤';
}

/**
 * 計算相對強度（RS）：個股與大盤在 lookback 個交易日內的報酬率差
 * @param stockCloses 個股收盤價序列（依時間升序，最後一筆為最新）
 * @param benchmarkCloses 大盤（基準指數）收盤價序列（依時間升序，最後一筆為最新）
 * @param lookback 回顧交易日數（預設 60）
 * @returns 相對強度結果，資料不足時回傳 null
 */
export function calculateRelativeStrength(
  stockCloses: number[],
  benchmarkCloses: number[],
  lookback = 60
): RelativeStrengthResult | null {
  if (stockCloses.length <= lookback || benchmarkCloses.length <= lookback) {
    return null;
  }

  const stockStart = stockCloses[stockCloses.length - 1 - lookback] as number;
  const stockEnd = stockCloses[stockCloses.length - 1] as number;
  const benchmarkStart = benchmarkCloses[benchmarkCloses.length - 1 - lookback] as number;
  const benchmarkEnd = benchmarkCloses[benchmarkCloses.length - 1] as number;

  if (!stockStart || !benchmarkStart) {
    return null;
  }

  const stockReturn = ((stockEnd - stockStart) / stockStart) * 100;
  const benchmarkReturn = ((benchmarkEnd - benchmarkStart) / benchmarkStart) * 100;
  const rsValue = stockReturn - benchmarkReturn;

  return {
    rsValue,
    rsLabel: rsValue >= 0 ? '強於大盤' : '弱於大盤',
  };
}
