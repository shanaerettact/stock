/**
 * 從台灣證券交易所（上市/上櫃）即時抓取股票代號與名稱
 *
 * 使用方式：
 *   npm run stocks:update
 *   # 或
 *   npx tsx scripts/fetch-twse-stocks.ts
 *
 * 產出：
 *   1. 更新 /src/data/stockList.ts
 *   2. 輸出備份 CSV 至 /scripts/stocks.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';

interface StockRecord {
  code: string;
  name: string;
  market: string; // 上市 / 上櫃
}

const SOURCES = [
  { url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2', label: '上市' },
  { url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4', label: '上櫃' },
];
const PROJECT_ROOT = path.join(__dirname, '..');
const OUTPUT_TS = path.join(PROJECT_ROOT, 'src/data/stockList.ts');
const OUTPUT_CSV = path.join(PROJECT_ROOT, 'scripts/stocks.csv');
const big5Decoder = new TextDecoder('big5');
// CFI 代碼前綴：
// E = Equity (股票類)：ES(普通股)、EP(特別股)、EV(其他)、ED(存託憑證)
// C = Collective Investment (集合投資)：CE(ETF)
// 排除 RW (權證)、CB (可轉債) 等
const ALLOWED_CFI_PREFIX = ['ES', 'EP', 'EV', 'ED', 'CE', 'EF', 'EM']; // 股票、ETF、TDR 等

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .trim();
}

function cleanCell(cell: string): string {
  const withoutTags = cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return decodeHtmlEntities(withoutTags);
}

function parseCodeAndName(codeWithName: string): { code: string; name: string } | null {
  const normalized = codeWithName.replace(/\u3000/g, ' ').trim(); // 移除全形空白
  const [code, ...rest] = normalized.split(/\s+/);
  const name = rest.join(' ').replace(/\s+/g, ' ').trim();

  if (!code || !name) {
    return null;
  }

  return { code, name };
}

function parseStocks(html: string, defaultMarket?: string): StockRecord[] {
  const rows = html.split('<tr>');
  const stocks: StockRecord[] = [];
  const dedup = new Map<string, StockRecord>();

  for (const row of rows) {
    const cells = Array.from(row.matchAll(/<td[^>]*>(.*?)<\/td>/gi)).map(match => cleanCell(match[1] ?? ''));
    if (cells.length < 4) continue;

    const codeAndName = parseCodeAndName(cells[0] ?? '');
    const market = (cells[3] || defaultMarket || '').trim();
    const cfi = cells[5] || '';

    if (!codeAndName) continue;
    if (market !== '上市' && market !== '上櫃') continue;
    if (!ALLOWED_CFI_PREFIX.some(prefix => cfi.startsWith(prefix))) continue;

    const record: StockRecord = {
      code: codeAndName.code,
      name: codeAndName.name,
      market,
    };

    dedup.set(record.code, record); // 同代號以最新為準
  }

  for (const stock of dedup.values()) {
    stocks.push(stock);
  }

  stocks.sort((a, b) => a.code.localeCompare(b.code, 'zh-TW'));
  return stocks;
}

function toTypeScriptContent(stocks: StockRecord[]): string {
  const now = new Date();
  const formattedDate = now.toLocaleString('zh-TW', { hour12: false });
  const listed = stocks.filter(s => s.market === '上市').length;
  const otc = stocks.filter(s => s.market === '上櫃').length;
  const sourceText = SOURCES.map(s => s.url).join('、');

  const stockLines = stocks
    .map(s => `  { code: "${s.code}", name: "${s.name}", market: "${s.market}" },`)
    .join('\n');

  return `/**
 * 台股股票代號與名稱對照表
 * 自動生成於：${formattedDate}
 * 資料來源：${sourceText}
 * 統計：上市 ${listed} 支，上櫃 ${otc} 支，總計 ${stocks.length} 支
 */

export interface Stock {
  code: string;
  name: string;
  market?: string;
}

export const stockList: Stock[] = [
${stockLines}
];

// 建立代號查詢映射
export const stockByCode = new Map<string, Stock>(
  stockList.map(stock => [stock.code, stock])
);

// 建立名稱查詢映射
export const stockByName = new Map<string, Stock>(
  stockList.map(stock => [stock.name, stock])
);

/** 根據股票代號查詢股票名稱 */
export function getStockNameByCode(code: string): string | null {
  return stockByCode.get(code)?.name || null;
}

/** 根據股票名稱查詢股票代號 */
export function getStockCodeByName(name: string): string | null {
  return stockByName.get(name)?.code || null;
}

/** 搜尋股票（支援模糊搜尋） */
export function searchStocks(keyword: string): Stock[] {
  const lowerKeyword = keyword.toLowerCase();
  return stockList.filter(
    stock =>
      stock.code.toLowerCase().includes(lowerKeyword) ||
      stock.name.includes(keyword)
  );
}

/** 取得所有上市股票 */
export function getListedStocks(): Stock[] {
  return stockList.filter(stock => stock.market === "上市");
}

/** 取得所有上櫃股票 */
export function getOTCStocks(): Stock[] {
  return stockList.filter(stock => stock.market === "上櫃");
}

/** 取得股票總數 */
export function getStockCount(): { total: number; listed: number; otc: number } {
  return {
    total: stockList.length,
    listed: getListedStocks().length,
    otc: getOTCStocks().length,
  };
}
`;
}

function toCSVContent(stocks: StockRecord[]): string {
  const header = '股票代號,股票名稱,市場別';
  const rows = stocks.map(s => `${s.code},${s.name},${s.market}`);
  return [header, ...rows].join('\n');
}

async function fetchTwseHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StockListFetcher/1.0; +https://github.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`下載失敗：${url} => HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return big5Decoder.decode(buffer);
}

async function fetchAllStocks(): Promise<StockRecord[]> {
  const collected: StockRecord[] = [];

  for (const source of SOURCES) {
    console.log(`📡 下載${source.label}清單中...`);
    const html = await fetchTwseHtml(source.url);
    const parsed = parseStocks(html, source.label);
    collected.push(...parsed);
  }

  const dedup = new Map<string, StockRecord>();
  for (const stock of collected) {
    dedup.set(stock.code, stock);
  }

  return Array.from(dedup.values()).sort((a, b) => a.code.localeCompare(b.code, 'zh-TW'));
}

async function main() {
  console.log('📡 下載台股清單中...');
  const stocks = await fetchAllStocks();

  console.log('🧩 解析資料...');
  const listedCount = stocks.filter(s => s.market === '上市').length;
  const otcCount = stocks.filter(s => s.market === '上櫃').length;

  console.log(`✅ 解析完成：上市 ${listedCount} 支，上櫃 ${otcCount} 支，總計 ${stocks.length} 支`);

  console.log('📝 生成 TypeScript 檔案...');
  const tsContent = toTypeScriptContent(stocks);
  fs.writeFileSync(OUTPUT_TS, tsContent, 'utf-8');
  console.log(`✅ 已更新 ${OUTPUT_TS}`);

  console.log('💾 輸出 CSV 備份...');
  const csvContent = toCSVContent(stocks);
  fs.writeFileSync(OUTPUT_CSV, csvContent, 'utf-8');
  console.log(`✅ 已輸出 ${OUTPUT_CSV}`);

  console.log('🎉 完成！');
}

main().catch(error => {
  console.error('❌ 更新失敗：', error);
  process.exit(1);
});

