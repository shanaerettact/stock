/**
 * 交易記錄 API 路由
 * 處理交易的新增、查詢、更新、刪除
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTrade } from '@/lib/tradeCalculations';
import { validateTradeForm } from '@/lib/formValidation';

// GET /api/trades - 查詢所有交易
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const stockCode = searchParams.get('stockCode');
    const positionId = searchParams.get('positionId');

    const trades = await prisma.trade.findMany({
      where: {
        ...(accountId && { accountId }),
        ...(stockCode && { stockCode }),
        ...(positionId && { positionId }),
      },
      include: {
        position: true,
      },
      orderBy: {
        tradeDate: 'desc',
      },
    });

    return NextResponse.json(trades);
  } catch (error) {
    console.error('查詢交易失敗:', error);
    return NextResponse.json(
      { error: '查詢交易失敗' },
      { status: 500 }
    );
  }
}

// POST /api/trades - 新增交易
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 驗證表單資料
    const validation = validateTradeForm(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: '驗證失敗', errors: validation.errors },
        { status: 400 }
      );
    }

    const {
      accountId,
      stockCode,
      stockName,
      tradeType,
      tradeDate,
      price,
      quantity,
      unit = 'SHARES', // 預設為零股
      stopLossPrice,
      plannedStopLoss,
      positionId,
      securityType = 'STOCK',
      isDayTrade = false,
    } = body;

    // 計算交易費用
    const calculation = calculateTrade({
      price: parseFloat(price),
      quantity: parseInt(quantity),
      unit,
      tradeType,
      securityType,
      isDayTrade,
    });

    // 檢查是否需要建立新部位或更新現有部位
    let finalPositionId = positionId;

    if (!positionId) {
      // 查找該股票是否有現有的開倉部位
      const existingPosition = await prisma.position.findFirst({
        where: {
          accountId,
          stockCode,
          status: 'OPEN',
        },
        orderBy: { entryDate: 'desc' },
      });

      if (existingPosition) {
        // 有現有開倉部位，使用該部位
        finalPositionId = existingPosition.id;
      } else if (tradeType === 'BUY') {
        // 沒有開倉部位且是買入，建立新部位
        const position = await prisma.position.create({
          data: {
            accountId,
            stockCode,
            stockName: stockName || null,
            status: 'OPEN',
            entryDate: new Date(tradeDate),
            avgEntryPrice: parseFloat(price),
            totalQuantity: calculation.totalShares,
            stopLossPrice: stopLossPrice ? parseFloat(stopLossPrice) : null,
            plannedStopLoss: plannedStopLoss ? parseFloat(plannedStopLoss) : null,
            totalInvested: calculation.totalCost,
            totalCommission: calculation.commission,
          },
        });
        finalPositionId = position.id;
      }
    }

    // 建立交易記錄
    const trade = await prisma.trade.create({
      data: {
        accountId,
        stockCode,
        stockName: stockName || null,
        tradeType,
        tradeDate: new Date(tradeDate),
        price: parseFloat(price),
        quantity: parseInt(quantity),
        unit,
        amount: calculation.amount,
        commission: calculation.commission,
        tax: calculation.tax,
        totalCost: calculation.totalCost,
        securityType,
        isDayTrade,
        positionId: finalPositionId,
      },
      include: {
        position: true,
      },
    });

    // 如果有關聯部位，重新計算部位資訊（同步持倉）
    if (finalPositionId) {
      await updatePositionFromTrades(finalPositionId);
    }

    // 更新帳戶餘額
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (account) {
      const newBalance =
        tradeType === 'BUY'
          ? account.currentBalance - calculation.totalCost
          : account.currentBalance + calculation.totalCost;

      await prisma.account.updateMany({
        where: { id: accountId },
        data: { currentBalance: newBalance },
      });
    }

    // 重新查詢交易記錄（含更新後的部位資訊）
    const updatedTrade = await prisma.trade.findUnique({
      where: { id: trade.id },
      include: { position: true },
    });

    return NextResponse.json(updatedTrade, { status: 201 });
  } catch (error) {
    console.error('新增交易失敗:', error);
    return NextResponse.json(
      { error: '新增交易失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}

// DELETE /api/trades/:id - 刪除交易
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: '缺少交易 ID' },
        { status: 404 }
      );
    }

    await prisma.trade.delete({
      where: { id },
    });

    return NextResponse.json({ message: '刪除成功' });
  } catch (error) {
    console.error('刪除交易失敗:', error);
    return NextResponse.json(
      { error: '刪除交易失敗' },
      { status: 500 }
    );
  }
}

// ===== 輔助函式 =====

interface TradeRecord {
  id: string;
  tradeType: string;
  quantity: number;
  unit: string;
  amount: number;
  commission: number;
  tax: number;
  tradeDate: Date;
}

/**
 * 將交易數量轉換為股數
 * @param quantity 交易數量
 * @param unit 單位（SHARES 或 LOTS）
 * @returns 實際股數
 */
function convertToShares(quantity: number, unit: string): number {
  return unit === 'LOTS' ? quantity * 1000 : quantity;
}

/**
 * 根據交易記錄重新計算部位資訊
 */
async function updatePositionFromTrades(positionId: string) {
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

  if (trades.length === 0) return;

  const plannedStopLoss = position?.plannedStopLoss;

  // 計算買入交易（將數量轉換為股數）
  const buyTrades = trades.filter((t: TradeRecord) => t.tradeType === 'BUY');
  const totalBuyQuantity = buyTrades.reduce((sum: number, t: TradeRecord) => sum + convertToShares(t.quantity, t.unit), 0);
  const totalBuyAmount = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalBuyCommission = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const avgEntryPrice = totalBuyQuantity > 0 ? totalBuyAmount / totalBuyQuantity : 0;

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

  // 更新部位
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
    },
  });
}

