/**
 * 批次重新計算所有部位的狀態
 * POST /api/positions/recalculate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initialStopPrice } from '@/lib/tradeCalculations';

/**
 * 將交易數量轉換為股數
 */
function convertToShares(quantity: unknown, unit: string, market: string): number {
  const q = typeof quantity === 'number' ? quantity : parseFloat(String(quantity));
  const safeQ = Number.isFinite(q) ? q : 0;
  if (market === 'US') return safeQ;
  return unit === 'LOTS' ? safeQ * 1000 : safeQ;
}

interface TradeRecord {
  id: string;
  tradeType: string;
  quantity: number;
  unit: string;
  market: string;
  price: number;
  amount: number;
  commission: number;
  tax: number;
  totalCost: number;
  tradeDate: Date;
}

/**
 * 根據交易記錄重新計算部位資訊
 */
async function recalculatePosition(positionId: string) {
  // 同時查詢交易記錄和部位資訊
  const [trades, position] = await Promise.all([
    prisma.trade.findMany({
      where: { positionId },
      orderBy: { tradeDate: 'asc' },
    }),
    prisma.position.findUnique({
      where: { id: positionId },
    }),
  ]);

  if (trades.length === 0) {
    return { positionId, status: 'NO_TRADES' };
  }

  const m = position?.market ?? (trades[0] as TradeRecord).market ?? 'TW';

  // 計算買入交易（將數量轉換為股數）
  const buyTrades = trades.filter((t: TradeRecord) => t.tradeType === 'BUY');
  const totalBuyQuantity = buyTrades.reduce((sum: number, t: TradeRecord) => sum + convertToShares(t.quantity, t.unit, m), 0);
  const totalBuyAmount = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalBuyCommission = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const avgEntryPrice =
    totalBuyQuantity > 0
      ? m === 'US'
        ? buyTrades.reduce(
            (sum: number, t: TradeRecord) =>
              sum + Number(t.price) * convertToShares(t.quantity, t.unit, m),
            0
          ) / totalBuyQuantity
        : totalBuyAmount / totalBuyQuantity
      : 0;

  // 根據買入資訊計算停損
  // 初始停損價 = 成本價 × 92%（容忍 8% 虧損）；作為 R 值分母的「初始風險」基準
  // 預計停損金額 = (成本價 - 初始停損價) × 總買入股數 = 成本價 × 8% × 總買入股數
  let stopLossPrice = position?.stopLossPrice;
  let plannedStopLoss = position?.plannedStopLoss;

  if (avgEntryPrice > 0 && totalBuyQuantity > 0) {
    const baseStop = initialStopPrice(avgEntryPrice);
    // 🔧 保留追蹤停損「只升不降」：重算時不得把已往上鎖的停損打回初始 8%
    // （原本無條件覆蓋為 baseStop，會抹掉追蹤停損；改為取較高者）
    stopLossPrice =
      position?.stopLossPrice != null ? Math.max(position.stopLossPrice, baseStop) : baseStop;
    // R 值分母仍以「初始風險」計（進場 8%），不隨追蹤停損變動
    plannedStopLoss = Math.round((avgEntryPrice - baseStop) * totalBuyQuantity);
  }

  // 計算賣出交易（將數量轉換為股數）
  const sellTrades = trades.filter((t: TradeRecord) => t.tradeType === 'SELL');
  const totalSellQuantity = sellTrades.reduce((sum: number, t: TradeRecord) => sum + convertToShares(t.quantity, t.unit, m), 0);
  const totalSellAmount = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalSellCommission = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const totalSellTax = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.tax, 0);
  const avgExitPrice = totalSellQuantity > 0 ? totalSellAmount / totalSellQuantity : null;

  // 計算損益（僅在有賣出時）
  const remainingQuantity = totalBuyQuantity - totalSellQuantity;
  const QTY_EPS = 1e-6;
  const isClosed = sellTrades.length > 0 && Math.abs(remainingQuantity) < QTY_EPS;

  // 計算總損益 = 賣出淨收入 - 對應買入成本
  const totalPnL = isClosed
    ? (totalSellAmount - totalSellCommission - totalSellTax) - (totalBuyAmount + totalBuyCommission)
    : null;
  const returnRate = isClosed && totalBuyAmount > 0
    ? (totalPnL! / (totalBuyAmount + totalBuyCommission)) * 100
    : null;

  // 持有天數
  const entryDate = buyTrades[0]?.tradeDate;
  const exitDate = isClosed ? sellTrades[sellTrades.length - 1]?.tradeDate : null;
  const holdingDays = entryDate && exitDate
    ? Math.ceil((new Date(exitDate).getTime() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // 計算 R 值 = 實際損益 / 預計停損金額
  const rValue = isClosed && plannedStopLoss && plannedStopLoss > 0 && totalPnL !== null
    ? totalPnL / plannedStopLoss
    : null;

  // 更新部位（包含自動計算的 plannedStopLoss 和 stopLossPrice）
  await prisma.position.update({
    where: { id: positionId },
    data: {
      totalQuantity: remainingQuantity,
      avgEntryPrice,
      avgExitPrice,
      totalInvested: totalBuyAmount + totalBuyCommission,
      totalCommission: totalBuyCommission + totalSellCommission,
      totalTax: totalSellTax,
      status: isClosed ? 'CLOSED' : 'OPEN',
      exitDate: exitDate ? new Date(exitDate) : null,
      totalPnL,
      returnRate,
      holdingDays,
      rValue,
      // 補上遺失的停損資訊
      plannedStopLoss: plannedStopLoss ?? null,
      stopLossPrice: stopLossPrice ?? null,
    },
  });

  return {
    positionId,
    status: isClosed ? 'CLOSED' : 'OPEN',
    buyQuantity: totalBuyQuantity,
    sellQuantity: totalSellQuantity,
    remainingQuantity,
    totalPnL,
    rValue,
    plannedStopLoss,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: '缺少帳戶 ID' },
        { status: 400 }
      );
    }

    // 查詢所有部位
    const positions = await prisma.position.findMany({
      where: { accountId },
    });

    // 查詢所有沒有關聯部位的賣出交易
    const orphanSellTrades = await prisma.trade.findMany({
      where: {
        accountId,
        tradeType: 'SELL',
        positionId: null,
      },
    });

    // 嘗試為孤立的賣出交易找到對應的部位
    const linkedTrades = [];
    for (const trade of orphanSellTrades) {
      // 查找該股票的部位（優先找 OPEN 的，沒有的話找最近的 CLOSED）
      const position = await prisma.position.findFirst({
        where: {
          accountId,
          stockCode: trade.stockCode,
          market: trade.market ?? 'TW',
        },
        orderBy: [
          { status: 'asc' }, // OPEN 優先
          { entryDate: 'desc' },
        ],
      });

      if (position) {
        // 更新賣出交易的 positionId
        await prisma.trade.update({
          where: { id: trade.id },
          data: { positionId: position.id },
        });
        linkedTrades.push({
          tradeId: trade.id,
          stockCode: trade.stockCode,
          positionId: position.id,
        });
      }
    }

    // 重新計算所有部位
    const results = [];
    for (const position of positions) {
      const result = await recalculatePosition(position.id);
      results.push(result);
    }

    // 🔧 重新計算帳戶餘額（根據所有交易記錄）
    const balanceResult = await recalculateAccountBalance(accountId);

    return NextResponse.json({
      success: true,
      message: `已重新計算 ${positions.length} 個部位`,
      linkedTrades: linkedTrades.length,
      results,
      balanceRecalculation: balanceResult,
    });
  } catch (error) {
    console.error('重新計算部位失敗:', error);
    return NextResponse.json(
      { error: '重新計算失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}

/**
 * 🔧 根據所有交易記錄重新計算帳戶餘額
 */
async function recalculateAccountBalance(accountId: string) {
  // 查詢帳戶資訊
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return { success: false, error: '找不到帳戶' };
  }

  const allTrades = await prisma.trade.findMany({
    where: { accountId },
    orderBy: { tradeDate: 'asc' },
  });

  let calcTW = account.initialCapital;
  let calcUS = account.initialCapitalUS;

  for (const trade of allTrades) {
    const m = trade.market ?? 'TW';
    if (m === 'US') {
      calcUS += trade.tradeType === 'BUY' ? -trade.totalCost : trade.totalCost;
    } else {
      calcTW += trade.tradeType === 'BUY' ? -trade.totalCost : trade.totalCost;
    }
  }

  const oldTW = account.currentBalance;
  const oldUS = account.currentBalanceUS;
  const diffTW = calcTW - oldTW;
  const diffUS = calcUS - oldUS;

  await prisma.account.update({
    where: { id: accountId },
    data: { currentBalance: calcTW, currentBalanceUS: calcUS },
  });

  return {
    success: true,
    initialCapital: account.initialCapital,
    oldBalance: Math.round(oldTW * 100) / 100,
    newBalance: Math.round(calcTW * 100) / 100,
    difference: Math.round((diffTW + diffUS) * 100) / 100,
    tradesCount: allTrades.length,
  };
}

























