/**
 * 共用型別定義
 */

// ===== 交易相關 =====

export interface Trade {
  id: string;
  stockCode: string;
  stockName: string | null;
  tradeType: string;
  tradeDate: string;
  price: number;
  quantity: number;
  unit: string;
  securityType: string;
  isDayTrade: boolean;
  market?: string;
  amount: number;
  commission: number;
  tax: number;
  totalCost: number;
  createdAt: string;
}

// ===== 部位相關 =====

export interface Position {
  id: string;
  stockCode: string;
  stockName: string | null;
  market?: string;
  status: string;
  entryDate: string;
  avgEntryPrice: number;
  totalQuantity: number;
  stopLossPrice: number | null;
  plannedStopLoss: number | null;
  totalPnL: number | null;
  returnRate: number | null;
  rValue: number | null;
  totalInvested?: number;      // 總投入成本（含手續費）
  totalCommission?: number;    // 總手續費
  exitDate?: string | Date | null;   // 平倉日期
  avgExitPrice?: number | null;      // 平均賣出價
  notes?: string | null;             // 備註
}

// ===== 股價相關 =====

export interface StockPrice {
  stockCode: string;
  stockName: string;
  closingPrice: number | null;
  change: number | null;
  market: 'TWSE' | 'TPEX' | null;
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

// ===== 追蹤停損相關 =====

export interface TrailingStopResult {
  isActivated: boolean;
  stopLossPrice: number;
  gainPercent: number;
  isTriggered: boolean;
}

export interface TrailingStopConfig {
  activationPercent: number;  // 啟用門檻（預設 0.2 = 20%）
  trailingPercent: number;    // 回撤比例（預設 0.1 = 10%）
  breakEvenPercent: number;   // 保本比例（預設 0.02 = 2%）
}

export const DEFAULT_TRAILING_STOP_CONFIG: TrailingStopConfig = {
  activationPercent: 0.2,
  trailingPercent: 0.1,
  breakEvenPercent: 0.02,
};

/**
 * 計算追蹤停損
 */
export function calculateTrailingStop(
  entryPrice: number,
  closingPrice: number | null,
  originalStopLoss: number,
  config: TrailingStopConfig = DEFAULT_TRAILING_STOP_CONFIG
): TrailingStopResult | null {
  if (closingPrice === null) {
    return null;
  }

  const gainPercent = (closingPrice - entryPrice) / entryPrice;
  
  if (gainPercent >= config.activationPercent) {
    const trailingStop = Math.round(closingPrice * (1 - config.trailingPercent) * 100) / 100;
    const breakEvenStop = Math.round(entryPrice * (1 + config.breakEvenPercent) * 100) / 100;
    const newStopLoss = Math.max(trailingStop, breakEvenStop, originalStopLoss);
    
    return {
      isActivated: true,
      stopLossPrice: newStopLoss,
      gainPercent: gainPercent * 100,
      isTriggered: closingPrice <= newStopLoss,
    };
  }
  
  return {
    isActivated: false,
    stopLossPrice: originalStopLoss,
    gainPercent: gainPercent * 100,
    isTriggered: closingPrice <= originalStopLoss,
  };
}

/**
 * 計算未實現損益
 */
export function calculateUnrealizedPnL(
  entryPrice: number,
  closingPrice: number | null,
  quantity: number
): { amount: number | null; percent: number | null } {
  if (closingPrice === null) {
    return { amount: null, percent: null };
  }
  
  const amount = (closingPrice - entryPrice) * quantity;
  const percent = ((closingPrice - entryPrice) / entryPrice) * 100;
  
  return { amount, percent };
}


