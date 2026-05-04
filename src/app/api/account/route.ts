/**
 * 帳戶查詢與更新 API 路由
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/account - 查詢帳戶（支援 market 參數回傳對應資金）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') || 'TW';

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

    const initialCapital = market === 'US' ? account.initialCapitalUS : account.initialCapital;
    const currentBalance = market === 'US' ? account.currentBalanceUS : account.currentBalance;

    return NextResponse.json({
      ...account,
      initialCapital,
      currentBalance,
    });
  } catch (error) {
    console.error('查詢帳戶失敗:', error);
    return NextResponse.json(
      { error: '查詢帳戶失敗' },
      { status: 500 }
    );
  }
}

// PUT /api/account - 更新帳戶資訊（初始資金，依 market 分開）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { initialCapital, market = 'TW' } = body;

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

    const isUS = market === 'US';
    const oldCapital = isUS ? existingAccount.initialCapitalUS : existingAccount.initialCapital;
    const oldBalance = isUS ? existingAccount.currentBalanceUS : existingAccount.currentBalance;
    const capitalDiff = parsedCapital - oldCapital;

    const updatedAccount = await prisma.account.update({
      where: { id: existingAccount.id },
      data: isUS
        ? { initialCapitalUS: parsedCapital, currentBalanceUS: oldBalance + capitalDiff }
        : { initialCapital: parsedCapital, currentBalance: oldBalance + capitalDiff },
    });

    return NextResponse.json({
      ...updatedAccount,
      initialCapital: isUS ? updatedAccount.initialCapitalUS : updatedAccount.initialCapital,
      currentBalance: isUS ? updatedAccount.currentBalanceUS : updatedAccount.currentBalance,
    });
  } catch (error) {
    console.error('更新帳戶失敗:', error);
    return NextResponse.json(
      { error: '更新帳戶失敗' },
      { status: 500 }
    );
  }
}

