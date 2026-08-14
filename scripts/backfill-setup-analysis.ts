/**
 * 回填已平倉部位缺漏的備註與進場訊號標籤（一次性維運腳本）
 *
 * 依部位 entryDate 回溯歷史股價，分析 52 週高/均線排列/量比/RS 並分類訊號標籤、組備註。
 * 只補目前是空白的欄位（notes / setupType / rsAtEntry / trendAtEntry /
 * pctFrom52wHighAtEntry / volRatioAtEntry），絕不覆蓋既有內容，可重複執行。
 *
 * 使用方式：
 *   npm run db:backfill-setup-analysis
 */

import { PrismaClient } from '@prisma/client';
import { analyzeClosedPosition } from '@/lib/setupAnalysis';

const prisma = new PrismaClient();

/** 與 src/app/page.tsx 相同 */
const ACCOUNT_ID = 'cmj47funv00007jwbtrkd22t9';

/** 對外部歷史股價來源（TWSE 逐月請求等）客氣一點的節流間隔 */
const DELAY_MS = 300;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const positions = await prisma.position.findMany({
    where: {
      accountId: ACCOUNT_ID,
      status: 'CLOSED',
      OR: [{ notes: null }, { notes: '' }, { setupType: null }, { setupType: '' }],
    },
    orderBy: { exitDate: 'asc' },
  });

  console.log(`找到 ${positions.length} 筆缺備註／訊號標籤的已平倉部位\n`);

  let filled = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, p] of positions.entries()) {
    const needsNotes = !p.notes;
    const needsSetupType = !p.setupType;
    const label = `[${i + 1}/${positions.length}] ${p.stockCode}${p.stockName ? `(${p.stockName})` : ''}`;

    if (!needsNotes && !needsSetupType) {
      skipped++;
      continue;
    }
    if (p.avgExitPrice == null || p.exitDate == null) {
      console.warn(`${label} ⚠️ 缺出場價／日期，略過`);
      skipped++;
      continue;
    }

    console.log(`${label} 分析中…`);
    const analysis = await analyzeClosedPosition({
      stockCode: p.stockCode,
      market: p.market === 'US' ? 'US' : 'TW',
      entryDate: p.entryDate,
      entryPrice: p.avgEntryPrice,
      exitDate: p.exitDate,
      exitPrice: p.avgExitPrice,
      holdingDays: p.holdingDays,
      returnRate: p.returnRate,
    });

    if (!analysis) {
      console.warn(`${label} ❌ 抓不到歷史資料，略過`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    await prisma.position.update({
      where: { id: p.id },
      data: {
        ...(needsSetupType ? { setupType: analysis.setupType } : {}),
        ...(needsNotes ? { notes: analysis.notes } : {}),
        ...(p.rsAtEntry == null ? { rsAtEntry: analysis.rsAtEntry } : {}),
        ...(p.trendAtEntry == null ? { trendAtEntry: analysis.trendAtEntry } : {}),
        ...(p.pctFrom52wHighAtEntry == null
          ? { pctFrom52wHighAtEntry: analysis.pctFrom52wHighAtEntry }
          : {}),
        ...(p.volRatioAtEntry == null ? { volRatioAtEntry: analysis.volRatioAtEntry } : {}),
      },
    });

    console.log(`${label} ✅ ${analysis.setupType}`);
    filled++;
    await sleep(DELAY_MS);
  }

  console.log(`\n完成：補上 ${filled} 筆、跳過 ${skipped} 筆、失敗 ${failed} 筆`);
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
