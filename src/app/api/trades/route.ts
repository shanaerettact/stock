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
      plannedStopLoss,
      positionId,
    } = body;

    // 計算交易費用
    const calculation = calculateTrade({
      price: parseFloat(price),
      quantity: parseInt(quantity),
      unit,
      tradeType,
    });

    // 檢查是否需要建立新部位或更新現有部位
    let finalPositionId = positionId;

    if (!positionId && tradeType === 'BUY') {
      // 建立新部位（totalQuantity 以股數為單位）
      const position = await prisma.position.create({
        data: {
          accountId,
          stockCode,
          stockName: stockName || null,
          status: 'OPEN',
          entryDate: new Date(tradeDate),
          avgEntryPrice: parseFloat(price),
          totalQuantity: calculation.totalShares, // 使用總股數
          plannedStopLoss: plannedStopLoss ? parseFloat(plannedStopLoss) : null,
          totalInvested: calculation.totalCost,
          totalCommission: calculation.commission,
        },
      });
      finalPositionId = position.id;
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
        positionId: finalPositionId,
      },
      include: {
        position: true,
      },
    });

    // 更新帳戶餘額
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (account) {
      const newBalance =
        tradeType === 'BUY'
          ? account.currentBalance - calculation.totalCost
          : account.currentBalance + calculation.totalCost;

      await prisma.account.update({
        where: { id: accountId },
        data: { currentBalance: newBalance },
      });
    }

    return NextResponse.json(trade, { status: 201 });
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
        { status: 400 }
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

