# 股票交易統計系統

交易記錄與持倉管理，支援手續費/稅計算、即時股價、追蹤停損、52 周新高、已平倉日線圖（K 線＋進出場標註）。

**技術**：Next.js 14、TypeScript、Tailwind、SQLite、Prisma、lightweight-charts。

**股價來源**：即時 → TWSE / TPEX OpenAPI；歷史日線 → 證交所 / 櫃買 / Yahoo Finance（無需 API Key）。

---

## 快速開始

- Node.js >= 18，`npm install`
- `npx prisma generate` → `npx prisma db push` → `npx tsx prisma/init-account.ts`
- `npm run dev` → 訪問 http://localhost:3002

---

## 功能摘要

| 功能 | 說明 |
|------|------|
| 即時股價 | TWSE（上市）、TPEX（上櫃） |
| 52 周新高 | 依歷史日線自動計算 |
| 50 日平均交易量 | 用於量價分析 |
| 已平倉日線圖 | K 線（紅漲綠跌）、進出場箭頭與價格 |

---

## 專案結構

```
stock計算/
├── prisma/    schema, dev.db, init-account, update-capital
├── scripts/   fetch-twse-stocks.ts, stocks.csv
└── src/
    ├── app/   layout, page, globals.css
    │   └── api/   account, trades, positions, stats, stock-price 等
    ├── components/   TradeForm, PositionsTable, DataModal
    ├── data/   stockList.ts（含上市/上櫃 market 欄位）
    └── lib/   types, prisma, tradeCalculations, performanceMetrics 等
```

---

## 指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 建置 |
| `npm run db:generate` / `npm run db:push` / `npm run db:init` | 資料庫 |
| `npm run stocks:update` | 更新台股清單 |

---

## 更新台股清單

- **一鍵**：`npm run stocks:update`（寫入 `src/data/stockList.ts`，備份至 `scripts/stocks.csv`）
- **手動**：編輯 `src/data/stockList.ts`，格式 `{ code: "代號", name: "名稱", market: "上市" }` 或 `market: "上櫃"`
- `market` 用於歷史日線取得順序：上市優先用證交所，上櫃優先用櫃買。

---

## 其他

- **備份**：複製 `prisma/dev.db`。重置：刪除該檔後重新執行 db 與 init 指令。

---

**本專案不會自動新增或產生說明文件。** 所有文件皆為手動維護。
