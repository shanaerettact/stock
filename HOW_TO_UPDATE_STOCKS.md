# 如何更新台股清單

本專案目前已包含約 **200+ 支常見台股**，如需更新為完整清單，請依照以下步驟操作。

---

## 📋 目前狀態

- ✅ 已內建 200+ 支常見股票
- ✅ 包含上市、上櫃股票
- ✅ 涵蓋主要權值股、電子股、金融股、傳產股

---

## 🔄 方法 1：使用台灣證券交易所公開資料

### 步驟 1：下載股票清單

訪問台灣證券交易所網站：
```
https://isin.twse.com.tw/isin/C_public.jsp?strMode=2
```

點選：
- **上市股票** → 下載 CSV
- **上櫃股票** → 下載 CSV

### 步驟 2：整理資料

將下載的資料整理成以下格式（CSV 檔案）：

```csv
股票代號,股票名稱,市場別
2330,台積電,上市
2454,聯發科,上市
6664,群翊,上櫃
6415,矽力-KY,上市
```

**注意事項**：
- 第一行必須是標題（股票代號,股票名稱,市場別）
- 欄位用逗號分隔
- 儲存為 UTF-8 編碼

### 步驟 3：放置檔案

將整理好的 CSV 檔案放在：
```
/Users/johnny/Documents/stock計算/scripts/stocks.csv
```

### 步驟 4：執行匯入

```bash
cd /Users/johnny/Documents/stock計算
npx tsx scripts/import-stocks.ts
```

系統會自動：
1. 讀取 CSV 檔案
2. 生成 TypeScript 程式碼
3. 更新 `src/data/stockList.ts`

---

## 🔄 方法 2：使用線上 API（進階）

### Yahoo Finance API

建立一個腳本從 Yahoo Finance 抓取台股清單：

```typescript
// scripts/fetch-from-yahoo.ts
import fetch from 'node-fetch';

async function fetchTWStocks() {
  // 台股代號範圍：1000-9999.TW（上市）、1000-9999.TWO（上櫃）
  const stocks = [];
  
  for (let i = 1000; i <= 9999; i++) {
    const code = i.toString();
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${code}.TW`);
      const data = await res.json();
      // 解析回傳資料...
      if (data.quoteResponse.result.length > 0) {
        const stock = data.quoteResponse.result[0];
        stocks.push({
          code: code,
          name: stock.longName || stock.shortName,
          market: '上市'
        });
      }
    } catch (error) {
      // 該代號不存在，繼續下一個
    }
  }
  
  return stocks;
}
```

---

## 🔄 方法 3：手動新增單支股票

如果只是要新增少數幾支股票，直接編輯 `src/data/stockList.ts`：

```typescript
export const stockList: Stock[] = [
  // ... 現有股票 ...
  
  // 新增您的股票
  { code: "您的代號", name: "股票名稱", market: "上市" },
];
```

---

## 📊 公開資料來源

### 官方資料源

1. **台灣證券交易所（TWSE）**
   - 上市公司：https://isin.twse.com.tw/isin/C_public.jsp?strMode=2
   - 更新頻率：即時

2. **證券櫃檯買賣中心（TPEx）**
   - 上櫃公司：https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430.php
   - 更新頻率：每日

### 第三方資料源

1. **台灣股市資訊網**
   - https://goodinfo.tw/StockInfo/
   - 提供完整的股票列表

2. **HiStock 嗨投資**
   - https://histock.tw/
   - 提供股票代號查詢

3. **CMoney**
   - https://www.cmoney.tw/
   - 提供股票篩選器

---

## 🛠️ 驗證更新

更新完成後，可以執行以下測試：

```bash
# 啟動開發伺服器
npm run dev

# 訪問 http://localhost:3002
# 在交易表單中測試輸入股票代號，確認可以自動帶出名稱
```

---

## 📈 目前已包含的股票類型

### ✅ 已完整收錄
- 台灣 50 成分股
- 主要權值股（台積電、鴻海、聯發科等）
- 金融股（國泰金、富邦金、中信金等）
- 電子股（廣達、華碩、聯電等）
- 傳產股（台塑、中鋼、統一超等）
- 航運股（長榮、陽明、萬海）

### 🔸 部分收錄
- 中小型上市櫃股票
- KY 股（海外註冊）
- 生技醫療股

### ❌ 未收錄
- 興櫃股票
- ETF（0050、0056 等）
- 特別股

---

## 💡 建議

- **一般使用者**：目前的 200+ 支股票已足夠日常使用
- **專業交易者**：建議定期（每季）從官方網站更新完整清單
- **程式開發者**：可以串接 API 實現即時查詢

---

## 🆘 常見問題

### Q: 找不到我的股票怎麼辦？

A: 您可以：
1. 手動在 `src/data/stockList.ts` 中新增該股票
2. 或使用方法 1 更新完整清單

### Q: 更新後前端沒有反應？

A: 需要重新啟動開發伺服器：
```bash
# 按 Ctrl+C 停止
# 重新啟動
npm run dev
```

### Q: 可以包含 ETF 嗎？

A: 可以！只需在清單中加入：
```typescript
{ code: "0050", name: "元大台灣50", market: "上市" },
{ code: "0056", name: "元大高股息", market: "上市" },
```

---

**最後更新：2024-12**

