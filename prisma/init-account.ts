/**
 * 建立初始帳戶
 * 執行方式：
 *   npx tsx prisma/init-account.ts              — 建立新帳戶
 *   npx tsx prisma/init-account.ts --seed-us-broker — 匯入附圖複委託本期買賣（含定期定額小數股；與 page.tsx ACCOUNT_ID 一致）
 *   npx tsx prisma/init-account.ts --prune-us-inventory — 刪除不在「海外有價證券本期庫存」十檔內之美股交易與部位（同上帳戶）
 *   npx tsx prisma/init-account.ts --patch-us-avg-cost — 依券商表定美金成本均價縮放買入成交並重算部位
 *   npx tsx prisma/init-account.ts --recalc-positions — 依成交重算該帳戶所有部位（修正成本均價後請執行）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 與 src/app/page.tsx 相同 */
const PAGE_ACCOUNT_ID = 'cmj47funv00007jwbtrkd22t9';

/** 複委託庫存截圖 2026/04/30 標的（僅此十檔保留） */
const US_BROKER_INVENTORY_TICKERS = [
  'AMAT',
  'AMD',
  'BE',
  'GOOG',
  'ITA',
  'MU',
  'SSO',
  'USD',
  'VOO',
  'VRT',
  'VT',
] as const;

/** 券商庫存／對帳單成本均價（USD/股）；僅縮放該標的之買入成交 principal+commission 比例 */
const US_BROKER_TARGET_AVG_USD: Record<string, number> = {
  AMAT: 429.81,
  AMD: 329.608,
  BE: 255.742,
  GOOG: 331.768,
  ITA: 225.01,
  MU: 445.873,
  USD: 55.308,
  VOO: 637.79,
  VRT: 318.99,
};

const QTY_EPS = 1e-6;

interface TRec {
  tradeType: string;
  quantity: number;
  unit: string;
  amount: number;
  commission: number;
  tax: number;
}

function convertToShares(quantity: unknown, unit: string, market: string): number {
  const q = typeof quantity === 'number' ? quantity : parseFloat(String(quantity));
  const safeQ = Number.isFinite(q) ? q : 0;
  if (market === 'US') return safeQ;
  return unit === 'LOTS' ? safeQ * 1000 : safeQ;
}

async function updatePositionFromTrades(positionId: string) {
  const trades = await prisma.trade.findMany({
    where: { positionId },
    orderBy: { tradeDate: 'asc' },
  });
  if (trades.length === 0) return;

  const positionMeta = await prisma.position.findUnique({
    where: { id: positionId },
    select: { market: true },
  });

  const buyTrades = trades.filter((t: TRec) => t.tradeType === 'BUY');
  const m = positionMeta?.market ?? (trades[0] as { market?: string }).market ?? 'TW';
  const totalBuyQuantity = buyTrades.reduce((s, t) => s + convertToShares(t.quantity, t.unit, m), 0);
  const totalBuyAmount = buyTrades.reduce((s, t) => s + t.amount, 0);
  const totalBuyCommission = buyTrades.reduce((s, t) => s + t.commission, 0);
  const avgEntryPrice = totalBuyQuantity > 0 ? totalBuyAmount / totalBuyQuantity : 0;

  const sellTrades = trades.filter((t: TRec) => t.tradeType === 'SELL');
  const totalSellQuantity = sellTrades.reduce((s, t) => s + convertToShares(t.quantity, t.unit, m), 0);
  const totalSellAmount = sellTrades.reduce((s, t) => s + t.amount, 0);
  const totalSellCommission = sellTrades.reduce((s, t) => s + t.commission, 0);
  const totalSellTax = sellTrades.reduce((s, t) => s + t.tax, 0);
  const avgExitPrice = totalSellQuantity > 0 ? totalSellAmount / totalSellQuantity : null;

  const remainingQuantity = totalBuyQuantity - totalSellQuantity;
  const isClosed = sellTrades.length > 0 && Math.abs(remainingQuantity) < QTY_EPS;

  const totalPnL = isClosed
    ? totalSellAmount - totalSellCommission - totalSellTax - (totalBuyAmount + totalBuyCommission)
    : null;
  const returnRate =
    isClosed && totalBuyAmount > 0 ? (totalPnL! / (totalBuyAmount + totalBuyCommission)) * 100 : null;

  const entryDate = buyTrades[0]?.tradeDate;
  const exitDate = isClosed ? sellTrades[sellTrades.length - 1]?.tradeDate : null;
  const holdingDays =
    entryDate && exitDate
      ? Math.ceil(
          (new Date(exitDate).getTime() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;

  await prisma.position.update({
    where: { id: positionId },
    data: {
      totalQuantity: remainingQuantity,
      avgEntryPrice,
      avgExitPrice,
      totalInvested: totalBuyAmount + totalBuyCommission,
      totalCommission: totalBuyCommission + totalSellCommission,
      totalTax: totalSellTax,
      status: isClosed ? 'CLOSED' : 'OPEN',
      exitDate: exitDate ? new Date(exitDate) : null,
      totalPnL,
      returnRate,
      holdingDays,
    },
  });
}

function usDate(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

type Row = {
  d: string;
  code: string;
  name: string;
  sec: 'STOCK' | 'ETF';
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  amount: number;
  comm: number;
  tax?: number;
};

async function getOpenPosition(accountId: string, code: string) {
  return prisma.position.findFirst({
    where: { accountId, stockCode: code, market: 'US', status: 'OPEN' },
    orderBy: { entryDate: 'desc' },
  });
}

async function ensurePositionForBuy(accountId: string, row: Row, tradeDate: Date) {
  const existing = await getOpenPosition(accountId, row.code);
  if (existing) return existing;
  const totalCost = row.amount + row.comm;
  return prisma.position.create({
    data: {
      accountId,
      stockCode: row.code,
      stockName: row.name,
      market: 'US',
      status: 'OPEN',
      entryDate: tradeDate,
      avgEntryPrice: row.price,
      totalQuantity: row.qty,
      totalInvested: totalCost,
      totalCommission: row.comm,
      totalTax: 0,
    },
  });
}

/**
 * 將部位內所有「買入」成交依係數縮放，使 sum(amount)/總買入股數 = 目標均價（與本專案 avgEntryPrice 定義一致，不含 sold lot 實務稅負）。
 */
async function patchUsAvgCostFromBrokerTable() {
  console.log('📐 依券商表定成本均價調整美股買入成交…');

  const account = await prisma.account.findUnique({ where: { id: PAGE_ACCOUNT_ID } });
  if (!account) {
    console.error(`❌ 找不到帳戶 ID：${PAGE_ACCOUNT_ID}`);
    process.exit(1);
  }

  for (const [code, targetAvg] of Object.entries(US_BROKER_TARGET_AVG_USD)) {
    const positions = await prisma.position.findMany({
      where: {
        accountId: PAGE_ACCOUNT_ID,
        market: 'US',
        stockCode: code,
        status: 'OPEN',
      },
    });

    for (const pos of positions) {
      const buys = await prisma.trade.findMany({
        where: { positionId: pos.id, tradeType: 'BUY' },
        orderBy: { tradeDate: 'asc' },
      });
      if (buys.length === 0) continue;

      const firstBuy = buys[0];
      if (!firstBuy) continue;
      const m = pos.market ?? firstBuy.market ?? 'US';
      const Q = buys.reduce((s, t) => s + convertToShares(t.quantity, t.unit, m), 0);
      const sumAmt = buys.reduce((s, t) => s + t.amount, 0);
      if (Q <= 0 || sumAmt <= 0) continue;

      const f = (targetAvg * Q) / sumAmt;
      for (const t of buys) {
        const newPrice = Math.round(t.price * f * 1e6) / 1e6;
        const newAmount = Math.round(newPrice * t.quantity * 100) / 100;
        const newComm = Math.round(t.commission * f * 100) / 100;
        const newTotalCost = Math.round((newAmount + newComm) * 100) / 100;
        await prisma.trade.update({
          where: { id: t.id },
          data: {
            price: newPrice,
            amount: newAmount,
            commission: newComm,
            totalCost: newTotalCost,
          },
        });
      }
      await updatePositionFromTrades(pos.id);
      console.log(`   ${code}：已調整 ${buys.length} 筆買入 → 表定均價約 ${targetAvg}`);
    }
  }

  console.log('✅ 美股成本均價縮放完成（未改賣出成交）。');
}

async function recalcAllPositionsForAccount() {
  const rows = await prisma.position.findMany({
    where: { accountId: PAGE_ACCOUNT_ID },
    select: { id: true },
  });
  for (const { id } of rows) {
    await updatePositionFromTrades(id);
  }
  console.log(`✅ 已依成交重算 ${rows.length} 個部位（含 avgEntryPrice／剩餘股數）。`);
}

async function pruneUsNotInBrokerInventory() {
  console.log('🧹 刪除非庫存圖十檔之美股交易與部位…');

  const account = await prisma.account.findUnique({ where: { id: PAGE_ACCOUNT_ID } });
  if (!account) {
    console.error(`❌ 找不到帳戶 ID：${PAGE_ACCOUNT_ID}，請先建立帳戶或同步 page.tsx 的 ACCOUNT_ID。`);
    process.exit(1);
  }

  const keep = [...US_BROKER_INVENTORY_TICKERS];
  const delTrades = await prisma.trade.deleteMany({
    where: {
      accountId: PAGE_ACCOUNT_ID,
      market: 'US',
      stockCode: { notIn: keep },
    },
  });
  const delPos = await prisma.position.deleteMany({
    where: {
      accountId: PAGE_ACCOUNT_ID,
      market: 'US',
      stockCode: { notIn: keep },
    },
  });

  console.log(`✅ 已刪除美股交易 ${delTrades.count} 筆、部位 ${delPos.count} 個。`);
  console.log('   請於首頁執行「重新計算部位與餘額」同步帳戶美元餘額。');
}

async function appendTrade(accountId: string, row: Row) {
  const tradeDate = usDate(row.d);
  const tax = row.tax ?? 0;

  if (row.side === 'BUY') {
    const pos = await ensurePositionForBuy(accountId, row, tradeDate);
    const totalCost = row.amount + row.comm;
    await prisma.trade.create({
      data: {
        accountId,
        stockCode: row.code,
        stockName: row.name,
        tradeType: 'BUY',
        tradeDate,
        price: row.price,
        quantity: row.qty,
        unit: 'SHARES',
        amount: row.amount,
        commission: row.comm,
        tax: 0,
        totalCost,
        securityType: row.sec,
        isDayTrade: false,
        market: 'US',
        positionId: pos.id,
      },
    });
    await updatePositionFromTrades(pos.id);
    return;
  }

  const pos = await getOpenPosition(accountId, row.code);
  if (!pos) {
    throw new Error(`無開倉部位可賣出：${row.code} ${row.d}`);
  }
  const totalCost = row.amount - row.comm - tax;
  await prisma.trade.create({
    data: {
      accountId,
      stockCode: row.code,
      stockName: row.name,
      tradeType: 'SELL',
      tradeDate,
      price: row.price,
      quantity: row.qty,
      unit: 'SHARES',
      amount: row.amount,
      commission: row.comm,
      tax,
      totalCost,
      securityType: row.sec,
      isDayTrade: false,
      market: 'US',
      positionId: pos.id,
    },
  });
  await updatePositionFromTrades(pos.id);
}

/**
 * 海外對帳單「本期買賣」：美元金額、手續費依結單；僅含庫存圖十檔。ITA 期初買入為配對本期賣出（結單外持倉推估）。
 */
async function seedUsBrokerStatement() {
  console.log('📥 匯入附圖複委託本期買賣（2026/04）…');

  const account = await prisma.account.findUnique({ where: { id: PAGE_ACCOUNT_ID } });
  if (!account) {
    console.error(`❌ 找不到帳戶 ID：${PAGE_ACCOUNT_ID}，請先建立帳戶或同步 page.tsx 的 ACCOUNT_ID。`);
    process.exit(1);
  }

  const marker = await prisma.trade.findFirst({
    where: {
      accountId: PAGE_ACCOUNT_ID,
      market: 'US',
      stockCode: 'VOO',
      tradeType: 'BUY',
      tradeDate: usDate('2026-04-16'),
    },
  });

  if (marker) {
    console.log('ℹ️ 已存在 2026/04/16 VOO 定期定額買入標記，略過重複匯入。');
    return;
  }

  const rows: Row[] = [
    {
      d: '2026-04-06',
      code: 'ITA',
      name: 'iShares Dow Jones U.S. Aerospace & Defense Index Fund',
      sec: 'ETF',
      side: 'BUY',
      qty: 22,
      price: 225.014091,
      amount: 4950.31,
      comm: 4.95,
    },
    {
      d: '2026-04-16',
      code: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      sec: 'ETF',
      side: 'BUY',
      qty: 0.27932,
      price: 637.79,
      amount: 178.1474028036,
      comm: 0.17815,
    },
    {
      d: '2026-04-16',
      code: 'VT',
      name: 'Vanguard Total World Stock ETF',
      sec: 'ETF',
      side: 'BUY',
      qty: 1.20757,
      price: 149.06,
      amount: 180.0,
      comm: 0.18,
    },
    { d: '2026-04-21', code: 'VRT', name: 'Vertiv Holdings Co', sec: 'STOCK', side: 'BUY', qty: 1, price: 318.67, amount: 318.67, comm: 0.32 },
    { d: '2026-04-21', code: 'BE', name: 'Bloom Energy Corp', sec: 'STOCK', side: 'BUY', qty: 2, price: 231.405, amount: 462.81, comm: 0.46 },
    { d: '2026-04-22', code: 'AMD', name: 'ADVANCED MICRO DEVICES INC', sec: 'STOCK', side: 'BUY', qty: 2, price: 294.54, amount: 589.08, comm: 0.59 },
    {
      d: '2026-04-22',
      code: 'ITA',
      name: 'iShares Dow Jones U.S. Aerospace & Defense Index Fund',
      sec: 'ETF',
      side: 'SELL',
      qty: 21,
      price: 222.23,
      amount: 4666.83,
      comm: 4.67,
    },
    { d: '2026-04-22', code: 'MU', name: 'Micron Technology', sec: 'STOCK', side: 'BUY', qty: 2, price: 472.789, amount: 945.58, comm: 0.95 },
    { d: '2026-04-24', code: 'AMD', name: 'ADVANCED MICRO DEVICES INC', sec: 'STOCK', side: 'BUY', qty: 1, price: 345.34, amount: 345.34, comm: 0.35 },
    { d: '2026-04-24', code: 'AMD', name: 'ADVANCED MICRO DEVICES INC', sec: 'STOCK', side: 'BUY', qty: 1, price: 344.626, amount: 344.63, comm: 0.34 },
    { d: '2026-04-27', code: 'GOOG', name: 'Alphabet Inc.', sec: 'STOCK', side: 'BUY', qty: 2, price: 347.0, amount: 694.0, comm: 0.69 },
    { d: '2026-04-29', code: 'BE', name: 'Bloom Energy Corp', sec: 'STOCK', side: 'BUY', qty: 2, price: 279.571, amount: 559.14, comm: 0.56 },
    { d: '2026-04-30', code: 'AMD', name: 'ADVANCED MICRO DEVICES INC', sec: 'STOCK', side: 'BUY', qty: 1, price: 348.25, amount: 348.25, comm: 0.35 },
  ];

  for (const row of rows) {
    await appendTrade(PAGE_ACCOUNT_ID, row);
  }

  console.log('✅ 已寫入複委託對帳單本期買賣共', rows.length, '筆（市場 US）。');
  console.log('   配息、換匯、SSO／USD 未在本期買賣表者未入庫；與庫存不一致請用 --prune-us-inventory 清理。');
}

async function createAccount() {
  console.log('💰 建立新帳戶...');

  try {
    const account = await prisma.account.create({
      data: {
        userId: 'demo-account-001',
        initialCapital: 1000000,
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
  if (process.argv.includes('--recalc-positions')) {
    await recalcAllPositionsForAccount();
  } else if (process.argv.includes('--patch-us-avg-cost')) {
    await patchUsAvgCostFromBrokerTable();
  } else if (process.argv.includes('--prune-us-inventory')) {
    await pruneUsNotInBrokerInventory();
  } else if (process.argv.includes('--seed-us-broker')) {
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
