/**
 * 從網路抓取最新台股清單
 * 
 * 使用方式：
 * npx tsx scripts/fetch-twse-stocks.ts
 * 
 * 此腳本會：
 * 1. 提供台灣證券交易所的資料來源連結
 * 2. 引導您如何下載並整理資料
 */

console.log('');
console.log('📊 台股清單更新指南');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('🌐 官方資料來源：');
console.log('');
console.log('1. 台灣證券交易所（TWSE）- 上市股票');
console.log('   網址：https://isin.twse.com.tw/isin/C_public.jsp?strMode=2');
console.log('   說明：點選「上市」→ 可下載或複製所有上市股票');
console.log('');
console.log('2. 證券櫃檯買賣中心（TPEx）- 上櫃股票');
console.log('   網址：https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430.php');
console.log('   說明：可查詢並下載上櫃股票清單');
console.log('');
console.log('3. Yahoo 財經台股');
console.log('   網址：https://tw.stock.yahoo.com/');
console.log('   說明：提供股票代號查詢功能');
console.log('');
console.log('───────────────────────────────────────────────────────────');
console.log('');
console.log('📝 整理步驟：');
console.log('');
console.log('1. 從上述網站下載或複製股票資料');
console.log('');
console.log('2. 整理成 CSV 格式（使用 Excel 或 Google Sheets）：');
console.log('   ┌─────────────────────────────────────┐');
console.log('   │ 股票代號 │ 股票名稱 │ 市場別     │');
console.log('   ├─────────────────────────────────────┤');
console.log('   │ 2330     │ 台積電   │ 上市       │');
console.log('   │ 2317     │ 鴻海     │ 上市       │');
console.log('   │ 6664     │ 群翊     │ 上櫃       │');
console.log('   └─────────────────────────────────────┘');
console.log('');
console.log('3. 儲存為 CSV 檔案：scripts/stocks.csv');
console.log('');
console.log('4. 執行匯入腳本：');
console.log('   npx tsx scripts/import-stocks.ts');
console.log('');
console.log('───────────────────────────────────────────────────────────');
console.log('');
console.log('🚀 快速方式（推薦）：');
console.log('');
console.log('訪問以下網站可以直接下載整理好的 CSV：');
console.log('');
console.log('• GoodInfo 台灣股市資訊網');
console.log('  https://goodinfo.tw/tw/StockList.asp');
console.log('  說明：提供完整的上市櫃股票清單，可匯出 Excel');
console.log('');
console.log('• CMoney 股票清單');
console.log('  https://www.cmoney.tw/finance/');
console.log('  說明：提供股票篩選與匯出功能');
console.log('');
console.log('───────────────────────────────────────────────────────────');
console.log('');
console.log('📌 目前專案狀態：');
console.log('');
console.log(`   檔案位置：src/data/stockList.ts`);
console.log('   目前收錄：約 200+ 支常見股票');
console.log('   包含類型：上市、上櫃主要股票');
console.log('');
console.log('───────────────────────────────────────────────────────────');
console.log('');
console.log('💡 提示：');
console.log('');
console.log('• 目前清單已包含大部分常用股票（台灣 50、中型 100 等）');
console.log('• 如果您交易的股票都是主流股，現有清單已足夠使用');
console.log('• 如果需要完整清單（2000+ 支），請依照上述步驟更新');
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

