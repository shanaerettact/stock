/**
 * 帳戶查詢與更新 API 路由
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/account - 查詢帳戶（目前返回第一個帳戶）
export async function GET() {
  try {
    // 查詢第一個帳戶（在多使用者系統中應該根據登入的使用者查詢）
    const account = await prisma.account.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: '找不到帳戶，請先建立帳戶' },
        { status: 404 }
      );
    }

    return NextResponse.json(account);
  } catch (error) {
    console.error('查詢帳戶失敗:', error);
    return NextResponse.json(
      { error: '查詢帳戶失敗' },
      { status: 500 }
    );
  }
}

// PUT /api/account - 更新帳戶資訊（初始資金）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { initialCapital } = body;

    // 驗證初始資金
    if (initialCapital === undefined || initialCapital === null) {
      return NextResponse.json(
        { error: '請提供初始資金' },
        { status: 400 }
      );
    }

    const parsedCapital = Number(initialCapital);
    if (isNaN(parsedCapital) || parsedCapital < 0) {
      return NextResponse.json(
        { error: '初始資金必須是有效的正數' },
        { status: 400 }
      );
    }

    // 查詢第一個帳戶
    const existingAccount = await prisma.account.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!existingAccount) {
      return NextResponse.json(
        { error: '找不到帳戶，請先建立帳戶' },
        { status: 404 }
      );
    }

    // 計算當前餘額的差額並更新
    const capitalDiff = parsedCapital - existingAccount.initialCapital;
    
    const updatedAccount = await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        initialCapital: parsedCapital,
        currentBalance: existingAccount.currentBalance + capitalDiff,
      },
    });

    return NextResponse.json(updatedAccount);
  } catch (error) {
    console.error('更新帳戶失敗:', error);
    return NextResponse.json(
      { error: '更新帳戶失敗' },
      { status: 500 }
    );
  }
}

