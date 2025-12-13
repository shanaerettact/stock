/**
 * 績效統計 API 路由
 * 處理整體績效與每月統計的查詢
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculatePerformanceMetrics, calculateMonthlyMetrics } from '@/lib/performanceMetrics';

// GET /api/stats - 查詢績效統計
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const type = searchParams.get('type'); // 'overall' | 'monthly'
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!accountId) {
      return NextResponse.json(
        { error: '缺少帳戶 ID' },
        { status: 400 }
      );
    }

    // 查詢所有已平倉的部位
    const closedPositions = await prisma.position.findMany({
      where: {
        accountId,
        status: 'CLOSED',
      },
      orderBy: {
        exitDate: 'asc',
      },
    });

    const positionsData = closedPositions.map(p => ({
      totalPnL: p.totalPnL || 0,
      returnRate: p.returnRate || 0,
      rValue: p.rValue,
      holdingDays: p.holdingDays || 0,
      exitDate: p.exitDate!,
    }));

    if (type === 'monthly' && year && month) {
      // 每月統計
      const metrics = calculateMonthlyMetrics(
        positionsData,
        parseInt(year),
        parseInt(month)
      );

      return NextResponse.json(metrics);
    }

    // 整體統計
    const overallMetrics = calculatePerformanceMetrics(positionsData);

    // 查詢帳戶資訊
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    return NextResponse.json({
      account: {
        initialCapital: account?.initialCapital || 0,
        currentBalance: account?.currentBalance || 0,
      },
      metrics: overallMetrics,
    });
  } catch (error) {
    console.error('查詢統計失敗:', error);
    return NextResponse.json(
      { error: '查詢統計失敗' },
      { status: 500 }
    );
  }
}

// GET /api/stats/monthly-summary - 查詢所有月份摘要
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

    // 查詢所有已平倉的部位
    const closedPositions = await prisma.position.findMany({
      where: {
        accountId,
        status: 'CLOSED',
      },
      orderBy: {
        exitDate: 'asc',
      },
    });

    // 按月份分組
    const monthlyGroups = new Map<string, typeof closedPositions>();

    closedPositions.forEach(position => {
      if (!position.exitDate) return;

      const key = `${position.exitDate.getFullYear()}-${position.exitDate.getMonth() + 1}`;

      if (!monthlyGroups.has(key)) {
        monthlyGroups.set(key, []);
      }

      monthlyGroups.get(key)!.push(position);
    });

    // 計算每月統計
    const monthlySummary = Array.from(monthlyGroups.entries()).map(([key, positions]) => {
      const [year, month] = key.split('-').map(Number);

      const positionsData = positions.map(p => ({
        totalPnL: p.totalPnL || 0,
        returnRate: p.returnRate || 0,
        rValue: p.rValue,
        holdingDays: p.holdingDays || 0,
        exitDate: p.exitDate!,
      }));

      const metrics = calculatePerformanceMetrics(positionsData);

      return {
        year,
        month,
        ...metrics,
      };
    });

    return NextResponse.json(monthlySummary);
  } catch (error) {
    console.error('查詢月度摘要失敗:', error);
    return NextResponse.json(
      { error: '查詢月度摘要失敗' },
      { status: 500 }
    );
  }
}

