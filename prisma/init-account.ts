/**
 * 建立初始帳戶
 * 執行方式：
 *   npx tsx prisma/init-account.ts              — 建立新帳戶
 *   npx tsx prisma/init-account.ts --seed-us-broker — 匯入附圖美股買入（排除定期定額；與 page.tsx ACCOUNT_ID 一致）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 與 src/app/page.tsx 相同 */
const PAGE_ACCOUNT_ID = 'cmj47funv00007jwbtrkd22t9';

/**
 * 海外對帳單「本期買賣」中，排除 VT/VOO 定期定額後的現股買入。
 * 金額、手續費依券商結單（美元）；併入部位與交易表 market=US。
 */
async function seedUsBrokerStatement() {
  console.log('📥 匯入美股買入紀錄（AEP、GOOG）…');

  const account = await prisma.account.findUnique({ where: { id: PAGE_ACCOUNT_ID } });
  if (!account) {
    console.error(`❌ 找不到帳戶 ID：${PAGE_ACCOUNT_ID}，請先建立帳戶或同步 page.tsx 的 ACCOUNT_ID。`);
    process.exit(1);
  }

  const marker = await prisma.trade.findFirst({
    where: {
      accountId: PAGE_ACCOUNT_ID,
      market: 'US',
      stockCode: 'AEP',
      tradeType: 'BUY',
      tradeDate: new Date('2025-12-01T00:00:00.000Z'),
    },
  });

  if (marker) {
    console.log('ℹ️ 已存在 2025/12/01 AEP 美股買入，略過重複匯入。');
    return;
  }

  const entryDate = new Date('2025-12-01T12:00:00.000Z');

  // AEP：2 股，成交價 122.2783 USD，金額 244.56，手續費 0.24 → 總成本 244.80（與庫存均價 122.40 一致）
  const aepAmount = 244.56;
  const aepCommission = 0.24;
  const aepTotalCost = aepAmount + aepCommission;
  const aepQty = 2;
  const aepPrice = 122.2783;

  const aepPos = await prisma.position.create({
    data: {
      accountId: PAGE_ACCOUNT_ID,
      stockCode: 'AEP',
      stockName: '美國電力公司',
      market: 'US',
      status: 'OPEN',
      entryDate,
      avgEntryPrice: aepTotalCost / aepQty,
      totalQuantity: aepQty,
      totalInvested: aepTotalCost,
      totalCommission: aepCommission,
      totalTax: 0,
    },
  });

  await prisma.trade.create({
    data: {
      accountId: PAGE_ACCOUNT_ID,
      stockCode: 'AEP',
      stockName: '美國電力公司',
      tradeType: 'BUY',
      tradeDate: entryDate,
      price: aepPrice,
      quantity: aepQty,
      unit: 'SHARES',
      amount: aepAmount,
      commission: aepCommission,
      tax: 0,
      totalCost: aepTotalCost,
      securityType: 'STOCK',
      isDayTrade: false,
      market: 'US',
      positionId: aepPos.id,
    },
  });

  // GOOG：1 股，成交 316.1291，金額 316.13，手續費 0.32 → 總成本 316.45（與庫存均價一致）
  const googAmount = 316.13;
  const googCommission = 0.32;
  const googTotalCost = googAmount + googCommission;
  const googQty = 1;
  const googPrice = 316.1291;

  const googPos = await prisma.position.create({
    data: {
      accountId: PAGE_ACCOUNT_ID,
      stockCode: 'GOOG',
      stockName: 'Alphabet公司',
      market: 'US',
      status: 'OPEN',
      entryDate,
      avgEntryPrice: googTotalCost / googQty,
      totalQuantity: googQty,
      totalInvested: googTotalCost,
      totalCommission: googCommission,
      totalTax: 0,
    },
  });

  await prisma.trade.create({
    data: {
      accountId: PAGE_ACCOUNT_ID,
      stockCode: 'GOOG',
      stockName: 'Alphabet公司',
      tradeType: 'BUY',
      tradeDate: entryDate,
      price: googPrice,
      quantity: googQty,
      unit: 'SHARES',
      amount: googAmount,
      commission: googCommission,
      tax: 0,
      totalCost: googTotalCost,
      securityType: 'STOCK',
      isDayTrade: false,
      market: 'US',
      positionId: googPos.id,
    },
  });

  console.log('✅ 已寫入 AEP、GOOG 各一筆買入與對應部位（市場 US）。');
  console.log('   配息與定期定額未匯入；如需可在介面手動補或另開功能。');
}

async function createAccount() {
  console.log('💰 建立新帳戶...');

  try {
    const account = await prisma.account.create({
      data: {
        userId: 'demo-account-001',
        initialCapital: 1000000, // 初始資金 100 萬（可自行修改）
        currentBalance: 1000000,
        currency: 'TWD',
      },
    });

    console.log('✅ 帳戶建立成功！');
    console.log('');
    console.log('📊 帳戶資訊：');
    console.log(`   ID: ${account.id}`);
    console.log(`   初始資金: ${account.initialCapital.toLocaleString('zh-TW')} 元`);
    console.log(`   當前餘額: ${account.currentBalance.toLocaleString('zh-TW')} 元`);
    console.log('');
    console.log('🎉 現在可以開始新增交易記錄了！');
  } catch (error) {
    console.error('❌ 建立帳戶時發生錯誤:', error);
    process.exit(1);
  }
}

async function main() {
  if (process.argv.includes('--seed-us-broker')) {
    await seedUsBrokerStatement();
  } else {
    await createAccount();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
