# 如何更新台股清單

本專案內建 **2200+ 支上市/上櫃股票**，可透過一鍵指令自動更新。

---

## ⚡ 一鍵更新（推薦）

```bash
npm run stocks:update
```

腳本會自動：
1. 從 TWSE 抓取最新上市與上櫃清單
2. 過濾成股票/ETF/TDR 類型
3. 更新 `src/data/stockList.ts`
4. 輸出備份至 `scripts/stocks.csv`

---

## 📊 目前收錄

| 類型 | 說明 |
|------|------|
| ✅ 上市股票 | 台積電、鴻海、聯發科等 |
| ✅ 上櫃股票 | 中小型股票 |
| ✅ ETF | 0050、0056 等 |
| ✅ TDR | 海外存託憑證 |
| ❌ 興櫃 | 未收錄 |
| ❌ 權證 | 未收錄 |

---

## 🔧 手動新增

編輯 `src/data/stockList.ts`：

```typescript
export const stockList: Stock[] = [
  // ... 現有股票 ...
  { code: "新代號", name: "股票名稱", market: "上市" },
];
```

---

## 📋 資料來源

- **上市**：https://isin.twse.com.tw/isin/C_public.jsp?strMode=2
- **上櫃**：https://isin.twse.com.tw/isin/C_public.jsp?strMode=4

---

## ✅ 驗證更新

```bash
npm run dev
# 在交易表單輸入股票代號，確認可自動帶出名稱
```

---

**最後更新**: 2024-12
