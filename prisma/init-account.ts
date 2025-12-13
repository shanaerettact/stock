/**
 * 建立初始帳戶
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  } finally {
    await prisma.$disconnect();
  }
}

createAccount();

