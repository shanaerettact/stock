/**
 * 批次重新計算所有部位的狀態
 * POST /api/positions/recalculate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * 將交易數量轉換為股數
 */
function convertToShares(quantity: number, unit: string): number {
  return unit === 'LOTS' ? quantity * 1000 : quantity;
}

interface TradeRecord {
  id: string;
  tradeType: string;
  quantity: number;
  unit: string;
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

  // 計算買入交易（將數量轉換為股數）
  const buyTrades = trades.filter((t: TradeRecord) => t.tradeType === 'BUY');
  const totalBuyQuantity = buyTrades.reduce((sum: number, t: TradeRecord) => sum + convertToShares(t.quantity, t.unit), 0);
  const totalBuyAmount = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalBuyCommission = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const avgEntryPrice = totalBuyQuantity > 0 ? totalBuyAmount / totalBuyQuantity : 0;

  // 如果 plannedStopLoss 為空，根據買入資訊自動計算
  // 停損價 = 成本價 × 90%（容忍 10% 虧損）
  // 預計停損金額 = (成本價 - 停損價) × 總股數 = 成本價 × 10% × 總股數
  let plannedStopLoss = position?.plannedStopLoss;
  let stopLossPrice = position?.stopLossPrice;
  
  if (!plannedStopLoss && avgEntryPrice > 0 && totalBuyQuantity > 0) {
    stopLossPrice = Math.round(avgEntryPrice * 0.9 * 100) / 100;
    plannedStopLoss = Math.round((avgEntryPrice - stopLossPrice) * totalBuyQuantity);
  }

  // 計算賣出交易（將數量轉換為股數）
  const sellTrades = trades.filter((t: TradeRecord) => t.tradeType === 'SELL');
  const totalSellQuantity = sellTrades.reduce((sum: number, t: TradeRecord) => sum + convertToShares(t.quantity, t.unit), 0);
  const totalSellAmount = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalSellCommission = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const totalSellTax = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.tax, 0);
  const avgExitPrice = totalSellQuantity > 0 ? totalSellAmount / totalSellQuantity : null;

  // 計算損益（僅在有賣出時）
  const remainingQuantity = totalBuyQuantity - totalSellQuantity;
  const isClosed = remainingQuantity === 0 && sellTrades.length > 0;

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

    return NextResponse.json({
      success: true,
      message: `已重新計算 ${positions.length} 個部位`,
      linkedTrades: linkedTrades.length,
      results,
    });
  } catch (error) {
    console.error('重新計算部位失敗:', error);
    return NextResponse.json(
      { error: '重新計算失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}





