/**
 * 台股股票代號與名稱對照表
 * 資料來源：台灣證券交易所
 * 最後更新：2024-12
 */

export interface Stock {
  code: string;
  name: string;
  market?: string; // 上市/上櫃
}

export const stockList: Stock[] = [
  // === 加權指數成分股（前 50 大市值） ===
  { code: "2330", name: "台積電", market: "上市" },
  { code: "2317", name: "鴻海", market: "上市" },
  { code: "2454", name: "聯發科", market: "上市" },
  { code: "2881", name: "富邦金", market: "上市" },
  { code: "2882", name: "國泰金", market: "上市" },
  { code: "2412", name: "中華電", market: "上市" },
  { code: "2891", name: "中信金", market: "上市" },
  { code: "3711", name: "日月光投控", market: "上市" },
  { code: "2886", name: "兆豐金", market: "上市" },
  { code: "2303", name: "聯電", market: "上市" },
  { code: "1301", name: "台塑", market: "上市" },
  { code: "1303", name: "南亞", market: "上市" },
  { code: "2884", name: "玉山金", market: "上市" },
  { code: "2892", name: "第一金", market: "上市" },
  { code: "2002", name: "中鋼", market: "上市" },
  { code: "2308", name: "台達電", market: "上市" },
  { code: "5880", name: "合庫金", market: "上市" },
  { code: "2880", name: "華南金", market: "上市" },
  { code: "2912", name: "統一超", market: "上市" },
  { code: "2887", name: "台新金", market: "上市" },
  
  // === 電子股 ===
  { code: "2382", name: "廣達", market: "上市" },
  { code: "2357", name: "華碩", market: "上市" },
  { code: "2395", name: "研華", market: "上市" },
  { code: "2379", name: "瑞昱", market: "上市" },
  { code: "2327", name: "國巨", market: "上市" },
  { code: "2301", name: "光寶科", market: "上市" },
  { code: "2408", name: "南亞科", market: "上市" },
  { code: "3008", name: "大立光", market: "上市" },
  { code: "2409", name: "友達", market: "上市" },
  { code: "2474", name: "可成", market: "上市" },
  { code: "2324", name: "仁寶", market: "上市" },
  { code: "2337", name: "旺宏", market: "上市" },
  { code: "2344", name: "華邦電", market: "上市" },
  { code: "2360", name: "致茂", market: "上市" },
  { code: "2377", name: "微星", market: "上市" },
  { code: "2376", name: "技嘉", market: "上市" },
  { code: "3045", name: "台灣大", market: "上市" },
  { code: "3034", name: "聯詠", market: "上市" },
  { code: "3037", name: "欣興", market: "上市" },
  { code: "3231", name: "緯創", market: "上市" },
  { code: "6415", name: "矽力-KY", market: "上市" },
  { code: "6669", name: "緯穎", market: "上市" },
  { code: "2449", name: "京元電子", market: "上市" },
  { code: "2404", name: "漢唐", market: "上市" },
  { code: "6515", name: "穎崴", market: "上市" },
  
  // === 傳產股 ===
  { code: "1326", name: "台化", market: "上市" },
  { code: "1216", name: "統一", market: "上市" },
  { code: "2207", name: "和泰車", market: "上市" },
  { code: "2105", name: "正新", market: "上市" },
  { code: "2801", name: "彰銀", market: "上市" },
  { code: "2823", name: "中壽", market: "上市" },
  { code: "2834", name: "台企銀", market: "上市" },
  { code: "2845", name: "遠東銀", market: "上市" },
  { code: "2867", name: "三商壽", market: "上市" },
  { code: "9910", name: "豐泰", market: "上市" },
  { code: "1101", name: "台泥", market: "上市" },
  { code: "1102", name: "亞泥", market: "上市" },
  { code: "1201", name: "味全", market: "上市" },
  { code: "1402", name: "遠東新", market: "上市" },
  { code: "1434", name: "福懋", market: "上市" },
  { code: "1476", name: "儒鴻", market: "上市" },
  { code: "1504", name: "東元", market: "上市" },
  { code: "1590", name: "亞德客-KY", market: "上市" },
  { code: "1605", name: "華新", market: "上市" },
  { code: "1717", name: "長興", market: "上市" },
  
  // === 航運股 ===
  { code: "2603", name: "長榮", market: "上市" },
  { code: "2609", name: "陽明", market: "上市" },
  { code: "2615", name: "萬海", market: "上市" },
  { code: "2606", name: "裕民", market: "上市" },
  { code: "2618", name: "長榮航", market: "上市" },
  { code: "2610", name: "華航", market: "上市" },
  
  // === 生技醫療股 ===
  { code: "4904", name: "遠傳", market: "上市" },
  { code: "4938", name: "和碩", market: "上市" },
  { code: "4958", name: "臻鼎-KY", market: "上市" },
  { code: "6505", name: "台塑化", market: "上市" },
  
  // === 上櫃股票 ===
  { code: "3443", name: "創意", market: "上櫃" },
  { code: "5269", name: "祥碩", market: "上櫃" },
  { code: "5274", name: "信驊", market: "上櫃" },
  { code: "6176", name: "瑞儀", market: "上櫃" },
  { code: "6446", name: "藥華藥", market: "上櫃" },
  { code: "6472", name: "保瑞", market: "上櫃" },
  { code: "6531", name: "愛普", market: "上櫃" },
  { code: "4919", name: "新唐", market: "上櫃" },
  { code: "6147", name: "頎邦", market: "上櫃" },
  { code: "6187", name: "萬潤", market: "上櫃" },
  { code: "6213", name: "聯茂", market: "上櫃" },
  { code: "6235", name: "華孚", market: "上櫃" },
  { code: "6257", name: "矽格", market: "上櫃" },
  { code: "6271", name: "同欣電", market: "上櫃" },
  { code: "6282", name: "康舒", market: "上櫃" },
  { code: "8046", name: "南電", market: "上櫃" },
  { code: "3587", name: "閎康", market: "上櫃" },
  { code: "4966", name: "譜瑞-KY", market: "上櫃" },
  { code: "5371", name: "中光電", market: "上櫃" },
  { code: "5425", name: "台半", market: "上櫃" },
  { code: "6664", name: "群翊", market: "上櫃" },
  { code: "6706", name: "惠特", market: "上櫃" },
  
  // === 其他熱門股票 ===
  { code: "2014", name: "中鴻", market: "上市" },
  { code: "2201", name: "裕隆", market: "上市" },
  { code: "2204", name: "中華", market: "上市" },
  { code: "2227", name: "裕日車", market: "上市" },
  { code: "2231", name: "為升", market: "上市" },
  { code: "2352", name: "佳世達", market: "上市" },
  { code: "2353", name: "宏碁", market: "上市" },
  { code: "2371", name: "大同", market: "上市" },
  { code: "2421", name: "建準", market: "上市" },
  { code: "2441", name: "超豐", market: "上市" },
  { code: "2451", name: "創見", market: "上市" },
  { code: "2498", name: "宏達電", market: "上市" },
  { code: "2520", name: "冠德", market: "上市" },
  { code: "2542", name: "興富發", market: "上市" },
  { code: "2609", name: "陽明", market: "上市" },
  { code: "2633", name: "台灣高鐵", market: "上市" },
  { code: "2636", name: "台驊投控", market: "上市" },
  { code: "2727", name: "王品", market: "上市" },
  { code: "2812", name: "台中銀", market: "上市" },
  { code: "2832", name: "台產", market: "上市" },
  { code: "2885", name: "元大金", market: "上市" },
  { code: "2888", name: "新光金", market: "上市" },
  { code: "2890", name: "永豐金", market: "上市" },
  { code: "2923", name: "鼎固-KY", market: "上市" },
  { code: "3006", name: "晶豪科", market: "上市" },
  { code: "3023", name: "信邦", market: "上市" },
  { code: "3044", name: "健鼎", market: "上市" },
  { code: "3048", name: "益登", market: "上市" },
  { code: "3049", name: "和鑫", market: "上市" },
  { code: "3481", name: "群創", market: "上市" },
  { code: "3533", name: "嘉澤", market: "上市" },
  { code: "3596", name: "智易", market: "上市" },
  { code: "3661", name: "世芯-KY", market: "上市" },
  { code: "3702", name: "大聯大", market: "上市" },
  { code: "4906", name: "正文", market: "上市" },
  { code: "4912", name: "聯德控股-KY", market: "上市" },
  { code: "5222", name: "全訊", market: "上市" },
  { code: "6239", name: "力成", market: "上市" },
  { code: "6277", name: "宏正", market: "上市" },
  { code: "8150", name: "南茂", market: "上市" },
  { code: "8454", name: "富邦媒", market: "上市" },
  { code: "9904", name: "寶成", market: "上市" },
  { code: "9914", name: "美利達", market: "上市" },
  { code: "9917", name: "中保科", market: "上市" },
  { code: "9921", name: "巨大", market: "上市" },
  { code: "9933", name: "中鼎", market: "上市" },
  { code: "9938", name: "百和", market: "上市" },
  { code: "9941", name: "裕融", market: "上市" },
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
