/**
 * 部位管理 API 路由
 * 處理部位的查詢、平倉、績效計算
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { prisma } from '@/lib/prisma';
import { calculatePositionPnL, calculateWeightedAvgPrice } from '@/lib/tradeCalculations';

// GET /api/positions - 查詢所有部位
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const status = searchParams.get('status');
    const stockCode = searchParams.get('stockCode');
    const market = searchParams.get('market');

    const positions = await prisma.position.findMany({
      where: {
        ...(accountId && { accountId }),
        ...(status && { status: status as 'OPEN' | 'CLOSED' }),
        ...(stockCode && { stockCode }),
        ...(market && (market === 'US' || market === 'TW') ? { market } : {}),
      },
      include: {
        trades: true,
      },
      orderBy: {
        entryDate: 'desc',
      },
    });

    return NextResponse.json(positions, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('查詢部位失敗:', error);
    return NextResponse.json(
      { error: '查詢部位失敗' },
      { status: 500 }
    );
  }
}

// PATCH /api/positions?id=xxx - 更新部位欄位（notes / stopLossPrice）
export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少部位 ID' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const updateData: Record<string, unknown> = {};

    if ('notes' in body) {
      updateData.notes = typeof body.notes === 'string' ? body.notes : null;
    }
    if ('stopLossPrice' in body) {
      updateData.stopLossPrice = typeof body.stopLossPrice === 'number' ? body.stopLossPrice : null;
    }
    if ('setupType' in body) {
      updateData.setupType = typeof body.setupType === 'string' && body.setupType ? body.setupType : null;
    }
    // 進場指標快照（僅接受數值 / 趨勢字串）
    if ('rsAtEntry' in body) {
      updateData.rsAtEntry = typeof body.rsAtEntry === 'number' && Number.isFinite(body.rsAtEntry) ? body.rsAtEntry : null;
    }
    if ('trendAtEntry' in body) {
      updateData.trendAtEntry = typeof body.trendAtEntry === 'string' && body.trendAtEntry ? body.trendAtEntry : null;
    }
    if ('pctFrom52wHighAtEntry' in body) {
      updateData.pctFrom52wHighAtEntry = typeof body.pctFrom52wHighAtEntry === 'number' && Number.isFinite(body.pctFrom52wHighAtEntry) ? body.pctFrom52wHighAtEntry : null;
    }
    if ('volRatioAtEntry' in body) {
      updateData.volRatioAtEntry = typeof body.volRatioAtEntry === 'number' && Number.isFinite(body.volRatioAtEntry) ? body.volRatioAtEntry : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
    }

    const position = await prisma.position.update({
      where: { id },
      data: updateData,
      include: { trades: true },
    });
    return NextResponse.json(position);
  } catch (error: unknown) {
    console.error('更新部位失敗:', error);
    const err = error as { code?: string };
    if (err?.code === 'P2025') {
      return NextResponse.json({ error: '找不到該部位' }, { status: 404 });
    }
    return NextResponse.json(
      { error: '更新失敗', details: error instanceof Error ? (error as Error).message : String(error) },
      { status: 500 }
    );
  }
}

// POST /api/positions - 平倉
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

    const m = position.market ?? 'TW';
    const convertToShares = (quantity: unknown, unit: string): number => {
      const q = typeof quantity === 'number' ? quantity : parseFloat(String(quantity));
      const safeQ = Number.isFinite(q) ? q : 0;
      if (m === 'US') return safeQ;
      return unit === 'LOTS' ? safeQ * 1000 : safeQ;
    };

    // 檢查是否已完全賣出（需要將數量轉換為股數）
    const totalBuyQuantity = buyTrades.reduce((sum, t) => sum + convertToShares(t.quantity, t.unit), 0);
    const totalSellQuantity = sellTrades.reduce((sum, t) => sum + convertToShares(t.quantity, t.unit), 0);

    if (Math.abs(totalBuyQuantity - totalSellQuantity) > 1e-6) {
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

