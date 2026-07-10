/**
 * 股票交易計算函式庫
 * 包含手續費、交易稅、損益等所有自動計算邏輯
 */

// ===== 常數定義 =====
const COMMISSION_RATE = 0.001425; // 0.1425%
const COMMISSION_DISCOUNT = 0.6; // 電子交易常見 6 折
const TAX_RATE_STOCK = 0.003; // 一般股票 0.3%（賣出）
const TAX_RATE_STOCK_DAY_TRADE = 0.0015; // 現股當沖 0.15%（賣出）
const TAX_RATE_ETF_TDR_WARRANT = 0.001; // ETF / 權證 / TDR 0.1%（賣出）
const SHARES_PER_LOT = 1000; // 台股一張 = 1000 股
/** 美股：手續費率 0.1%，每筆上限 1 美元 */
const US_COMMISSION_RATE = 0.001;
const US_COMMISSION_MAX_USD = 1;
/** 美股賣出約當 SEC Section 31 費率（簡化，僅供試算） */
const US_SELL_REGULATORY_FEE_RATE = 0.0000278;
/** 預設停損比例（進場價 × (1 - 8%)） */
export const DEFAULT_STOP_LOSS_PERCENT = 0.08;

/** 初始停損價 = 進場價 × (1 - 預設停損比例)，四捨五入至分；所有預設停損一律經此計算以保持一致 */
export function initialStopPrice(entryPrice: number): number {
  return Math.round(entryPrice * (1 - DEFAULT_STOP_LOSS_PERCENT) * 100) / 100;
}

// ===== 型別定義 =====
export type TradeUnit = 'SHARES' | 'LOTS'; // 零股 | 張
export type SecurityType = 'STOCK' | 'ETF' | 'TDR' | 'WARRANT';
export type MarketRegion = 'TW' | 'US';

export interface TradeInput {
  price: number; // 成交價格（每股）
  quantity: number; // 數量（依據 unit 而定）
  unit: TradeUnit; // 單位：零股(SHARES) 或 張(LOTS)
  tradeType: 'BUY' | 'SELL';
  securityType?: SecurityType; // 標的類型：股票/ETF/TDR/權證
  isDayTrade?: boolean; // 是否為現股當沖
  market?: MarketRegion; // TW 台股 / US 美股
}

export interface TradeCalculation {
  amount: number; // 成交金額
  commission: number; // 手續費
  tax: number; // 交易稅
  totalCost: number; // 總成本（買入）或淨收入（賣出）
  totalShares: number; // 總股數
}

export interface PositionPnL {
  totalPnL: number; // 總損益
  returnRate: number; // 報酬率 (%)
  rValue: number | null; // R 值
  holdingDays: number; // 持有天數
}

// ===== 單筆交易計算 =====

/**
 * 將數量轉換為股數
 * @param quantity 數量
 * @param unit 單位（零股或張）
 * @returns 總股數
 */
export function convertToShares(quantity: number, unit: TradeUnit, market: MarketRegion = 'TW'): number {
  if (market === 'US') return quantity;
  return unit === 'LOTS' ? quantity * SHARES_PER_LOT : quantity;
}

/**
 * 計算成交金額
 * @param price 每股價格
 * @param quantity 數量
 * @param unit 單位（零股或張）
 * @returns 成交金額 = price × 總股數
 */
export function calculateAmount(price: number, quantity: number, unit: TradeUnit = 'LOTS', market: MarketRegion = 'TW'): number {
  const totalShares = convertToShares(quantity, unit, market);
  return price * totalShares;
}

/**
 * 計算手續費（買賣都有）
 * @param amount 成交金額
 * @returns 手續費（台股：0.1425%×六折；美股：成交金額 0.1%，每筆最高 1 美元）
 */
export function calculateCommission(amount: number, totalShares: number, unit: TradeUnit, market: MarketRegion = 'TW'): number {
  if (market === 'US') {
    const raw = amount * US_COMMISSION_RATE;
    const capped = Math.min(raw, US_COMMISSION_MAX_USD);
    return Math.round(capped * 100) / 100;
  }
  const commission = amount * COMMISSION_RATE * COMMISSION_DISCOUNT;
  const isOddLot = unit === 'SHARES' && totalShares < SHARES_PER_LOT;
  const minimum = isOddLot ? 1 : 20;
  return Math.max(commission, minimum);
}

/**
 * 計算交易稅（僅賣出）
 * @param amount 成交金額
 * @param tradeType 交易類型
 * @returns 交易稅 = amount × 0.3%（賣出時）
 */
export function calculateTax(
  amount: number,
  tradeType: 'BUY' | 'SELL',
  securityType: SecurityType = 'STOCK',
  isDayTrade = false,
  market: MarketRegion = 'TW'
): number {
  if (tradeType !== 'SELL') {
    return 0;
  }

  if (market === 'US') {
    return Math.round(amount * US_SELL_REGULATORY_FEE_RATE * 100) / 100;
  }

  if (securityType === 'ETF' || securityType === 'TDR' || securityType === 'WARRANT') {
    return amount * TAX_RATE_ETF_TDR_WARRANT;
  }

  const rate = isDayTrade ? TAX_RATE_STOCK_DAY_TRADE : TAX_RATE_STOCK;
  return amount * rate;
}

/**
 * 計算單筆交易所有費用
 * @param input 交易輸入資料
 * @returns 完整計算結果
 */
export function calculateTrade(input: TradeInput): TradeCalculation {
  const market = input.market ?? 'TW';
  const totalShares = convertToShares(input.quantity, input.unit, market);
  const amount = calculateAmount(input.price, input.quantity, input.unit, market);
  const commission = calculateCommission(amount, totalShares, input.unit, market);
  const tax = calculateTax(amount, input.tradeType, input.securityType, input.isDayTrade, market);
  
  // 買入：總成本 = 成交金額 + 手續費
  // 賣出：淨收入 = 成交金額 - 手續費 - 交易稅
  const totalCost = input.tradeType === 'BUY'
    ? amount + commission
    : amount - commission - tax;
  
  return {
    amount,
    commission,
    tax,
    totalCost,
    totalShares,
  };
}

// ===== 部位損益計算 =====

export interface Trade {
  tradeType: 'BUY' | 'SELL';
  amount: number;
  commission: number;
  tax: number;
  totalCost: number;
  tradeDate: Date;
}

/**
 * 計算部位損益（一組買賣交易）
 * @param trades 屬於該部位的所有交易
 * @param entryDate 開倉日期
 * @param exitDate 平倉日期
 * @param plannedStopLoss 預計停損金額（用於計算 R 值）
 * @returns 部位績效指標
 */
export function calculatePositionPnL(
  trades: Trade[],
  entryDate: Date,
  exitDate: Date | null,
  plannedStopLoss?: number
): PositionPnL | null {
  if (!exitDate) {
    // 尚未平倉，無法計算損益
    return null;
  }
  
  // 計算總投入與總回收
  let totalBuyCost = 0;
  let totalSellRevenue = 0;
  
  trades.forEach(trade => {
    if (trade.tradeType === 'BUY') {
      totalBuyCost += trade.totalCost; // 買入總成本（含手續費）
    } else {
      totalSellRevenue += trade.totalCost; // 賣出淨收入（已扣手續費和稅）
    }
  });
  
  // 總損益 = 賣出淨收入 - 買入總成本
  const totalPnL = totalSellRevenue - totalBuyCost;
  
  // 報酬率 = (損益 / 投入成本) × 100%
  const returnRate = totalBuyCost > 0 ? (totalPnL / totalBuyCost) * 100 : 0;
  
  // R 值 = 實際損益 / 預計停損金額
  const rValue = plannedStopLoss && plannedStopLoss > 0
    ? totalPnL / plannedStopLoss
    : null;
  
  // 持有天數
  const holdingDays = Math.ceil(
    (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return {
    totalPnL,
    returnRate,
    rValue,
    holdingDays,
  };
}

// ===== 平均買入/賣出價計算 =====

export interface PriceQuantity {
  price: number;
  quantity: number;
}

/**
 * 計算加權平均價格
 * @param trades 價格與數量陣列
 * @returns 加權平均價格
 */
export function calculateWeightedAvgPrice(trades: PriceQuantity[]): number {
  const totalAmount = trades.reduce((sum, t) => sum + t.price * t.quantity, 0);
  const totalQuantity = trades.reduce((sum, t) => sum + t.quantity, 0);

  return totalQuantity > 0 ? totalAmount / totalQuantity : 0;
}

// ===== 風險%部位試算 =====

export interface PositionSizeInput {
  price: number; // 進場價格
  riskAmount: number; // 可承受虧損金額
  stopLossPercent?: number; // 停損比例（預設 DEFAULT_STOP_LOSS_PERCENT）
  unit: TradeUnit; // 單位：零股(SHARES) 或 張(LOTS)
  market: MarketRegion; // TW 台股 / US 美股
}

export interface PositionSizeResult {
  stopLossPrice: number; // 建議停損價 = price × (1 - stopLossPercent)
  riskPerShare: number; // 每股風險 = price - stopLossPrice
  suggestedQuantity: number; // 建議數量（依 unit/market 顯示張或股）
  suggestedShares: number; // 對應總股數
  actualRiskAmount: number; // 依四捨五入後數量回推的實際風險金額
}

/**
 * 依風險金額與停損比例反算建議部位大小
 * @param params 試算輸入（進場價、可承受風險金額、停損比例、單位、市場）
 * @returns 建議停損價、每股風險、建議數量與實際風險金額
 */
export function calculatePositionSize(params: PositionSizeInput): PositionSizeResult {
  const { price, riskAmount, unit, market } = params;
  const stopLossPercent = params.stopLossPercent ?? DEFAULT_STOP_LOSS_PERCENT;
  const stopLossPrice = Math.round(price * (1 - stopLossPercent) * 100) / 100;
  const riskPerShare = price - stopLossPrice;

  if (riskPerShare <= 0 || riskAmount <= 0) {
    return { stopLossPrice, riskPerShare, suggestedQuantity: 0, suggestedShares: 0, actualRiskAmount: 0 };
  }

  if (market === 'TW' && unit === 'LOTS') {
    const suggestedQuantity = Math.floor(riskAmount / riskPerShare / SHARES_PER_LOT);
    const suggestedShares = suggestedQuantity * SHARES_PER_LOT;
    return {
      stopLossPrice,
      riskPerShare,
      suggestedQuantity,
      suggestedShares,
      actualRiskAmount: suggestedShares * riskPerShare,
    };
  }

  const suggestedShares = Math.floor(riskAmount / riskPerShare);
  return {
    stopLossPrice,
    riskPerShare,
    suggestedQuantity: suggestedShares,
    suggestedShares,
    actualRiskAmount: suggestedShares * riskPerShare,
  };
}

