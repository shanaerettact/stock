/**
 * 從 CSV 檔案匯入股票清單
 * 
 * 使用方式：
 * 1. 下載台股清單 CSV 檔案（例如從 TWSE 下載）
 * 2. 將檔案放在 scripts/stocks.csv
 * 3. 執行：npx tsx scripts/import-stocks.ts
 * 
 * CSV 格式範例：
 * 股票代號,股票名稱,市場別
 * 2330,台積電,上市
 * 6664,群翊,上櫃
 */

import * as fs from 'fs';
import * as path from 'path';

interface StockData {
  code: string;
  name: string;
  market: string;
}

function parseCSV(filePath: string): StockData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const stocks: StockData[] = [];
  
  // 跳過標題行
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const [code, name, market] = line.split(',');
    if (code && name) {
      stocks.push({
        code: code.trim(),
        name: name.trim(),
        market: market ? market.trim() : '上市',
      });
    }
  }
  
  return stocks;
}

function generateTypeScriptFile(stocks: StockData[]): string {
  const template = `/**
 * 台股股票代號與名稱對照表
 * 自動生成於：${new Date().toLocaleString('zh-TW')}
 * 總計：${stocks.length} 支股票
 */

export interface Stock {
  code: string;
  name: string;
  market?: string;
}

export const stockList: Stock[] = [
${stocks.map(s => `  { code: "${s.code}", name: "${s.name}", market: "${s.market}" },`).join('\n')}
];

// 建立代號查詢映射
export const stockByCode = new Map<string, Stock>(
  stockList.map(stock => [stock.code, stock])
);

// 建立名稱查詢映射
export const stockByName = new Map<string, Stock>(
  stockList.map(stock => [stock.name, stock])
);

/**
 * 根據股票代號查詢股票名稱
 */
export function getStockNameByCode(code: string): string | null {
  return stockByCode.get(code)?.name || null;
}

/**
 * 根據股票名稱查詢股票代號
 */
export function getStockCodeByName(name: string): string | null {
  return stockByName.get(name)?.code || null;
}

/**
 * 搜尋股票（支援模糊搜尋）
 */
export function searchStocks(keyword: string): Stock[] {
  const lowerKeyword = keyword.toLowerCase();
  return stockList.filter(
    stock =>
      stock.code.includes(lowerKeyword) ||
      stock.name.includes(keyword)
  );
}

/**
 * 取得所有上市股票
 */
export function getListedStocks(): Stock[] {
  return stockList.filter(stock => stock.market === "上市");
}

/**
 * 取得所有上櫃股票
 */
export function getOTCStocks(): Stock[] {
  return stockList.filter(stock => stock.market === "上櫃");
}

/**
 * 取得股票總數
 */
export function getStockCount(): { total: number; listed: number; otc: number } {
  return {
    total: stockList.length,
    listed: getListedStocks().length,
    otc: getOTCStocks().length,
  };
}
`;
  
  return template;
}

async function main() {
  const csvPath = path.join(__dirname, 'stocks.csv');
  const outputPath = path.join(__dirname, '../src/data/stockList.ts');
  
  console.log('📊 台股清單匯入工具');
  console.log('─────────────────────────────');
  
  // 檢查 CSV 檔案是否存在
  if (!fs.existsSync(csvPath)) {
    console.log('');
    console.log('❌ 找不到 stocks.csv 檔案');
    console.log('');
    console.log('請依照以下步驟操作：');
    console.log('');
    console.log('1. 下載台股清單 CSV 檔案：');
    console.log('   - 台灣證券交易所：https://isin.twse.com.tw/isin/C_public.jsp?strMode=2');
    console.log('   - 或使用 Yahoo 財經、CMoney 等資料');
    console.log('');
    console.log('2. 整理成以下格式的 CSV：');
    console.log('   股票代號,股票名稱,市場別');
    console.log('   2330,台積電,上市');
    console.log('   6664,群翊,上櫃');
    console.log('');
    console.log('3. 將檔案儲存為 scripts/stocks.csv');
    console.log('');
    console.log('4. 重新執行此腳本：npx tsx scripts/import-stocks.ts');
    console.log('');
    return;
  }
  
  try {
    console.log('📖 讀取 CSV 檔案...');
    const stocks = parseCSV(csvPath);
    
    console.log(`✅ 成功讀取 ${stocks.length} 支股票`);
    console.log('');
    
    console.log('📝 生成 TypeScript 檔案...');
    const content = generateTypeScriptFile(stocks);
    
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`✅ 已更新 ${outputPath}`);
    console.log('');
    
    console.log('📊 統計資訊：');
    const listed = stocks.filter(s => s.market === '上市').length;
    const otc = stocks.filter(s => s.market === '上櫃').length;
    console.log(`   上市：${listed} 支`);
    console.log(`   上櫃：${otc} 支`);
    console.log(`   總計：${stocks.length} 支`);
    console.log('');
    console.log('🎉 匯入完成！');
    
  } catch (error) {
    console.error('❌ 匯入失敗:', error);
    process.exit(1);
  }
}

main();

