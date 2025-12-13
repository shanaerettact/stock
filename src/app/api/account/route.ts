/**
 * 帳戶查詢 API 路由
 */

import { NextResponse } from 'next/server';
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

