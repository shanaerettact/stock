/**
 * 交易績效指標計算函式庫
 * 包含勝率、期望值、最大回撤、R 值分析等進階指標
 */

// ===== 型別定義 =====

export interface ClosedPosition {
  totalPnL: number;
  returnRate: number;
  rValue: number | null;
  holdingDays: number;
  exitDate: Date;
}

export interface PerformanceMetrics {
  // 基本統計
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 勝率 (%)
  
  // 損益統計
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  
  // 進階指標
  profitFactor: number | null; // 盈虧比率（平均獲利 ÷ 平均虧損）
  adjustedProfitFactor: number | null; // 調整後盈虧比率（考量勝率）
  expectancy: number; // 期望值
  
  // 持有天數
  avgWinHoldingDays: number | null;
  avgLossHoldingDays: number | null;
  
  // R 值分析
  avgRValue: number | null;
  positiveRCount: number;
  negativeRCount: number;
}

export interface DrawdownInfo {
  maxDrawdown: number; // 最大回撤金額
  maxDrawdownPercent: number; // 最大回撤百分比
  maxConsecutiveLosses: number; // 最大連續虧損次數
  currentDrawdown: number; // 當前回撤
  peakBalance: number; // 歷史最高餘額
}

// ===== 績效指標計算 =====

/**
 * 計算整體績效指標
 * @param positions 已平倉的部位陣列
 * @returns 績效指標統計
 */
export function calculatePerformanceMetrics(
  positions: ClosedPosition[]
): PerformanceMetrics {
  const totalTrades = positions.length;
  
  if (totalTrades === 0) {
    return getEmptyMetrics();
  }
  
  // 分類獲利與虧損部位
  const winningPositions = positions.filter(p => p.totalPnL > 0);
  const losingPositions = positions.filter(p => p.totalPnL < 0);
  
  const winningTrades = winningPositions.length;
  const losingTrades = losingPositions.length;
  
  // 勝率
  const winRate = (winningTrades / totalTrades) * 100;
  
  // 總損益
  const totalPnL = positions.reduce((sum, p) => sum + p.totalPnL, 0);
  
  // 平均獲利與虧損
  const avgWin = winningTrades > 0
    ? winningPositions.reduce((sum, p) => sum + p.totalPnL, 0) / winningTrades
    : 0;
  
  const avgLoss = losingTrades > 0
    ? losingPositions.reduce((sum, p) => sum + p.totalPnL, 0) / losingTrades
    : 0;
  
  // 最大獲利與虧損
  const maxWin = winningTrades > 0
    ? Math.max(...winningPositions.map(p => p.totalPnL))
    : 0;
  
  const maxLoss = losingTrades > 0
    ? Math.min(...losingPositions.map(p => p.totalPnL))
    : 0;
  
  // 盈虧比率
  const profitFactor = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
  
  // 調整後盈虧比率（考量勝率）
  const adjustedProfitFactor = avgLoss !== 0 && losingTrades > 0
    ? (winRate / 100 * avgWin) / ((1 - winRate / 100) * Math.abs(avgLoss))
    : null;
  
  // 期望值 = (勝率 × 平均獲利) − ((1 − 勝率) × |平均虧損|)
  const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * Math.abs(avgLoss));
  
  // 平均持有天數
  const avgWinHoldingDays = winningTrades > 0
    ? winningPositions.reduce((sum, p) => sum + p.holdingDays, 0) / winningTrades
    : null;
  
  const avgLossHoldingDays = losingTrades > 0
    ? losingPositions.reduce((sum, p) => sum + p.holdingDays, 0) / losingTrades
    : null;
  
  // R 值分析
  const positionsWithR = positions.filter(p => p.rValue !== null);
  const avgRValue = positionsWithR.length > 0
    ? positionsWithR.reduce((sum, p) => sum + (p.rValue || 0), 0) / positionsWithR.length
    : null;
  
  const positiveRCount = positionsWithR.filter(p => (p.rValue || 0) > 0).length;
  const negativeRCount = positionsWithR.filter(p => (p.rValue || 0) < 0).length;
  
  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalPnL,
    avgWin,
    avgLoss,
    maxWin,
    maxLoss,
    profitFactor,
    adjustedProfitFactor,
    expectancy,
    avgWinHoldingDays,
    avgLossHoldingDays,
    avgRValue,
    positiveRCount,
    negativeRCount,
  };
}

/**
 * 計算每月績效指標
 * @param positions 已平倉的部位陣列
 * @param year 年份
 * @param month 月份（1-12）
 * @returns 該月份的績效指標
 */
export function calculateMonthlyMetrics(
  positions: ClosedPosition[],
  year: number,
  month: number
): PerformanceMetrics {
  // 篩選出該月份平倉的部位
  const monthlyPositions = positions.filter(p => {
    const exitDate = new Date(p.exitDate);
    return exitDate.getFullYear() === year && exitDate.getMonth() + 1 === month;
  });
  
  return calculatePerformanceMetrics(monthlyPositions);
}

// ===== 回撤分析 =====

export interface BalanceSnapshot {
  date: Date;
  balance: number;
}

/**
 * 計算最大回撤與連續虧損
 * @param balanceHistory 帳戶餘額歷史記錄
 * @param positions 已平倉的部位（用於計算連續虧損）
 * @returns 回撤資訊
 */
export function calculateDrawdown(
  balanceHistory: BalanceSnapshot[],
  positions: ClosedPosition[]
): DrawdownInfo {
  if (balanceHistory.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      maxConsecutiveLosses: 0,
      currentDrawdown: 0,
      peakBalance: 0,
    };
  }
  
  // 排序（確保按時間順序）
  const sorted = [...balanceHistory].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  let peakBalance = sorted[0].balance;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let currentDrawdown = 0;
  
  // 計算最大回撤
  sorted.forEach(snapshot => {
    if (snapshot.balance > peakBalance) {
      peakBalance = snapshot.balance;
      currentDrawdown = 0;
    } else {
      const drawdown = peakBalance - snapshot.balance;
      const drawdownPercent = (drawdown / peakBalance) * 100;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
      
      currentDrawdown = drawdown;
    }
  });
  
  // 計算最大連續虧損次數
  let maxConsecutiveLosses = 0;
  let currentConsecutiveLosses = 0;
  
  positions.forEach(position => {
    if (position.totalPnL < 0) {
      currentConsecutiveLosses++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
    } else {
      currentConsecutiveLosses = 0;
    }
  });
  
  return {
    maxDrawdown,
    maxDrawdownPercent,
    maxConsecutiveLosses,
    currentDrawdown,
    peakBalance,
  };
}

// ===== 風險報酬分析 =====

export interface RiskRewardProfile {
  avgRValue: number | null;
  positiveRRate: number; // 正 R 值比例
  rDistribution: {
    range: string; // 例如："-2R to -1R"
    count: number;
    percentage: number;
  }[];
}

/**
 * 分析 R 值分布
 * @param positions 已平倉的部位陣列
 * @returns R 值風險報酬概況
 */
export function analyzeRiskReward(positions: ClosedPosition[]): RiskRewardProfile {
  const positionsWithR = positions.filter(p => p.rValue !== null);
  
  if (positionsWithR.length === 0) {
    return {
      avgRValue: null,
      positiveRRate: 0,
      rDistribution: [],
    };
  }
  
  // 平均 R 值
  const avgRValue = positionsWithR.reduce((sum, p) => sum + (p.rValue || 0), 0) / positionsWithR.length;
  
  // 正 R 值比例
  const positiveRCount = positionsWithR.filter(p => (p.rValue || 0) > 0).length;
  const positiveRRate = (positiveRCount / positionsWithR.length) * 100;
  
  // R 值分布（按區間統計）
  const ranges = [
    { min: -Infinity, max: -2, label: '< -2R' },
    { min: -2, max: -1, label: '-2R to -1R' },
    { min: -1, max: 0, label: '-1R to 0R' },
    { min: 0, max: 1, label: '0R to 1R' },
    { min: 1, max: 2, label: '1R to 2R' },
    { min: 2, max: 3, label: '2R to 3R' },
    { min: 3, max: Infinity, label: '> 3R' },
  ];
  
  const rDistribution = ranges.map(range => {
    const count = positionsWithR.filter(
      p => (p.rValue || 0) >= range.min && (p.rValue || 0) < range.max
    ).length;
    
    return {
      range: range.label,
      count,
      percentage: (count / positionsWithR.length) * 100,
    };
  });
  
  return {
    avgRValue,
    positiveRRate,
    rDistribution,
  };
}

// ===== 輔助函式 =====

function getEmptyMetrics(): PerformanceMetrics {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPnL: 0,
    avgWin: 0,
    avgLoss: 0,
    maxWin: 0,
    maxLoss: 0,
    profitFactor: null,
    adjustedProfitFactor: null,
    expectancy: 0,
    avgWinHoldingDays: null,
    avgLossHoldingDays: null,
    avgRValue: null,
    positiveRCount: 0,
    negativeRCount: 0,
  };
}

