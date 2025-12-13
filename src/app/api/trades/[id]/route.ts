import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateTrade, type TradeUnit } from '@/lib/tradeCalculations';

// 型別定義
interface TradeRecord {
  id: string;
  tradeType: string;
  quantity: number;
  amount: number;
  commission: number;
  tax: number;
  tradeDate: Date;
}

/**
 * GET /api/trades/[id]
 * 取得單筆交易記錄
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const trade = await prisma.trade.findUnique({
      where: { id },
      include: {
        position: true,
      },
    });

    if (!trade) {
      return NextResponse.json({ error: '找不到交易記錄' }, { status: 404 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error('Error fetching trade:', error);
    return NextResponse.json({ error: '取得交易記錄失敗' }, { status: 500 });
  }
}

/**
 * PUT /api/trades/[id]
 * 更新交易記錄
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const {
      stockCode,
      stockName,
      tradeType,
      tradeDate,
      price,
      quantity,
      unit,
    } = body;

    // 驗證必填欄位
    if (!stockCode || !tradeType || !tradeDate || !price || !quantity || !unit) {
      return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
    }

    // 檢查交易記錄是否存在
    const existingTrade = await prisma.trade.findUnique({
      where: { id },
      include: { position: true },
    });

    if (!existingTrade) {
      return NextResponse.json({ error: '找不到交易記錄' }, { status: 404 });
    }

    // 重新計算交易費用
    const calculation = calculateTrade({
      price: parseFloat(price),
      quantity: parseInt(quantity),
      unit: unit as TradeUnit,
      tradeType,
    });

    // 更新交易記錄
    const updatedTrade = await prisma.trade.update({
      where: { id },
      data: {
        stockCode,
        stockName: stockName || null,
        tradeType,
        tradeDate: new Date(tradeDate),
        price: parseFloat(price),
        quantity: parseInt(quantity),
        unit: unit as TradeUnit,
        amount: calculation.amount,
        commission: calculation.commission,
        tax: calculation.tax,
        totalCost: calculation.totalCost,
      },
      include: {
        position: true,
      },
    });

    // 如果有關聯部位，需要重新計算部位資訊
    if (existingTrade.positionId) {
      await updatePositionFromTrades(existingTrade.positionId);
    }

    return NextResponse.json(updatedTrade);
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json({ error: '更新交易記錄失敗' }, { status: 500 });
  }
}

/**
 * DELETE /api/trades/[id]
 * 刪除交易記錄
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 檢查交易記錄是否存在
    const existingTrade = await prisma.trade.findUnique({
      where: { id },
      include: { position: true },
    });

    if (!existingTrade) {
      return NextResponse.json({ error: '找不到交易記錄' }, { status: 404 });
    }

    const positionId = existingTrade.positionId;

    // 刪除交易記錄
    await prisma.trade.delete({
      where: { id },
    });

    // 如果有關聯部位，需要重新計算部位資訊
    if (positionId) {
      const remainingTrades = await prisma.trade.count({
        where: { positionId },
      });

      if (remainingTrades === 0) {
        // 如果沒有剩餘交易，刪除部位
        await prisma.position.delete({
          where: { id: positionId },
        });
      } else {
        // 否則重新計算部位資訊
        await updatePositionFromTrades(positionId);
      }
    }

    return NextResponse.json({ message: '交易記錄已刪除' });
  } catch (error) {
    console.error('Error deleting trade:', error);
    return NextResponse.json({ error: '刪除交易記錄失敗' }, { status: 500 });
  }
}

/**
 * 根據交易記錄重新計算部位資訊
 */
async function updatePositionFromTrades(positionId: string) {
  const trades = await prisma.trade.findMany({
    where: { positionId },
    orderBy: { tradeDate: 'asc' },
  });

  if (trades.length === 0) return;

  // 計算買入交易
  const buyTrades = trades.filter((t: TradeRecord) => t.tradeType === 'BUY');
  const totalBuyQuantity = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.quantity, 0);
  const totalBuyAmount = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalBuyCommission = buyTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const avgEntryPrice = totalBuyQuantity > 0 ? totalBuyAmount / totalBuyQuantity : 0;

  // 計算賣出交易
  const sellTrades = trades.filter((t: TradeRecord) => t.tradeType === 'SELL');
  const totalSellQuantity = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.quantity, 0);
  const totalSellAmount = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.amount, 0);
  const totalSellCommission = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.commission, 0);
  const totalSellTax = sellTrades.reduce((sum: number, t: TradeRecord) => sum + t.tax, 0);
  const avgExitPrice = totalSellQuantity > 0 ? totalSellAmount / totalSellQuantity : null;

  // 更新部位
  await prisma.position.update({
    where: { id: positionId },
    data: {
      totalQuantity: totalBuyQuantity - totalSellQuantity,
      avgEntryPrice,
      avgExitPrice,
      totalInvested: totalBuyAmount + totalBuyCommission,
      totalCommission: totalBuyCommission + totalSellCommission,
      totalTax: totalSellTax,
      status: totalBuyQuantity === totalSellQuantity ? 'CLOSED' : 'OPEN',
      exitDate: totalBuyQuantity === totalSellQuantity && trades.length > 0 ? trades[trades.length - 1].tradeDate : null,
    },
  });
}

