/**
 * 更新初始資金
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateCapital() {
  console.log('💰 更新初始資金...');

  try {
    // 查詢現有帳戶
    const account = await prisma.account.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!account) {
      console.log('❌ 找不到帳戶');
      return;
    }

    console.log('原始帳戶資訊：');
    console.log(`   初始資金: ${account.initialCapital.toLocaleString('zh-TW')} 元`);
    console.log(`   當前餘額: ${account.currentBalance.toLocaleString('zh-TW')} 元`);
    console.log('');

    // 更新為 10 萬元
    const newCapital = 100000;

    const updatedAccount = await prisma.account.update({
      where: { id: account.id },
      data: {
        initialCapital: newCapital,
        currentBalance: newCapital,
      },
    });

    console.log('✅ 更新成功！');
    console.log('');
    console.log('新的帳戶資訊：');
    console.log(`   初始資金: ${updatedAccount.initialCapital.toLocaleString('zh-TW')} 元`);
    console.log(`   當前餘額: ${updatedAccount.currentBalance.toLocaleString('zh-TW')} 元`);
    console.log('');
    console.log('🎉 帳戶資金已更新為 100,000 元！');
  } catch (error) {
    console.error('❌ 更新失敗:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateCapital();

