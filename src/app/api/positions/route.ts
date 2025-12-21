/**
 * 部位管理 API 路由
 * 處理部位的查詢、平倉、績效計算
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculatePositionPnL, calculateWeightedAvgPrice } from '@/lib/tradeCalculations';

// GET /api/positions - 查詢所有部位
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const status = searchParams.get('status');
    const stockCode = searchParams.get('stockCode');

    const positions = await prisma.position.findMany({
      where: {
        ...(accountId && { accountId }),
        ...(status && { status: status as 'OPEN' | 'CLOSED' }),
        ...(stockCode && { stockCode }),
      },
      include: {
        trades: true,
      },
      orderBy: {
        entryDate: 'desc',
      },
    });

    return NextResponse.json(positions);
  } catch (error) {
    console.error('查詢部位失敗:', error);
    return NextResponse.json(
      { error: '查詢部位失敗' },
      { status: 500 }
    );
  }
}

// POST /api/positions/:id/close - 平倉
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { positionId } = body;

    if (!positionId) {
      return NextResponse.json(
        { error: '缺少部位 ID' },
        { status: 400 }
      );
    }

    // 查詢部位與相關交易
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: {
        trades: true,
      },
    });

    if (!position) {
      return NextResponse.json(
        { error: '找不到該部位' },
        { status: 404 }
      );
    }

    if (position.status === 'CLOSED') {
      return NextResponse.json(
        { error: '該部位已平倉' },
        { status: 400 }
      );
    }

    // 分離買入與賣出交易
    const buyTrades = position.trades.filter(t => t.tradeType === 'BUY');
    const sellTrades = position.trades.filter(t => t.tradeType === 'SELL');

    // 輔助函式：將交易數量轉換為股數
    const convertToShares = (quantity: number, unit: string): number => {
      return unit === 'LOTS' ? quantity * 1000 : quantity;
    };

    // 檢查是否已完全賣出（需要將數量轉換為股數）
    const totalBuyQuantity = buyTrades.reduce((sum, t) => sum + convertToShares(t.quantity, t.unit), 0);
    const totalSellQuantity = sellTrades.reduce((sum, t) => sum + convertToShares(t.quantity, t.unit), 0);

    if (totalBuyQuantity !== totalSellQuantity) {
      return NextResponse.json(
        { error: '買賣數量不匹配，無法平倉' },
        { status: 400 }
      );
    }

    // 計算平均賣出價（使用轉換後的股數）
    const avgExitPrice = calculateWeightedAvgPrice(
      sellTrades.map(t => ({ price: t.price, quantity: convertToShares(t.quantity, t.unit) }))
    );

    // 找出最後一筆賣出日期
    const exitDate = new Date(
      Math.max(...sellTrades.map(t => t.tradeDate.getTime()))
    );

    // 計算部位損益
    const pnl = calculatePositionPnL(
      position.trades.map(t => ({
        tradeType: t.tradeType as 'BUY' | 'SELL',
        amount: t.amount,
        commission: t.commission,
        tax: t.tax,
        totalCost: t.totalCost,
        tradeDate: t.tradeDate,
      })),
      position.entryDate,
      exitDate,
      position.plannedStopLoss || undefined
    );

    if (!pnl) {
      return NextResponse.json(
        { error: '無法計算損益' },
        { status: 500 }
      );
    }

    // 更新部位狀態
    const updatedPosition = await prisma.position.update({
      where: { id: positionId },
      data: {
        status: 'CLOSED',
        exitDate,
        avgExitPrice,
        totalPnL: pnl.totalPnL,
        returnRate: pnl.returnRate,
        rValue: pnl.rValue,
        holdingDays: pnl.holdingDays,
        totalCommission: position.trades.reduce((sum, t) => sum + t.commission, 0),
        totalTax: position.trades.reduce((sum, t) => sum + t.tax, 0),
      },
      include: {
        trades: true,
      },
    });

    return NextResponse.json({
      message: '平倉成功',
      position: updatedPosition,
      pnl,
    });
  } catch (error) {
    console.error('平倉失敗:', error);
    return NextResponse.json(
      { error: '平倉失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}

