# 股票交易統計系統

交易記錄與持倉管理，支援台股／美股雙市場、手續費/稅計算、即時股價、追蹤停損、R 值績效、52 周新高、已平倉日線圖（K 線＋進出場標註）。

**技術**：Next.js 14、TypeScript、Tailwind、SQLite、Prisma、lightweight-charts、recharts、zod。

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
| 台股 / 美股雙市場 | TW / US 市場分開管理資金與部位 |
| 52 周新高 | 依歷史日線自動計算 |
| 50 日平均交易量 | 用於量價分析 |
| 已平倉日線圖 | K 線（紅漲綠跌）、進出場箭頭與價格 |
| R 值追蹤 | 預設停損金額、實際 R 值績效評估 |
| 現股當沖 | isDayTrade 旗標，自動套用當沖稅率 |
| 證券種類 | STOCK / ETF / TDR / WARRANT |
| 部位備註 | 可隨時編輯的部位附注欄位 |
| 部位重算 | 透過 API 重新計算持倉成本與損益 |

---

## 專案結構

```
stock/
├── prisma/    schema, dev.db, init-account, update-capital
├── scripts/   fetch-twse-stocks.ts, import-stocks.ts, stocks.csv
└── src/
    ├── app/   layout, page, globals.css
    │   └── api/
    │       ├── account/
    │       ├── trades/ (含 [id]/)
    │       ├── positions/ (含 recalculate/)
    │       ├── position-notes/
    │       ├── stats/
    │       └── stock-price/
    ├── components/   TradeForm, PositionsTable, DataModal
    ├── data/   stockList.ts（含上市/上櫃 market 欄位）
    └── lib/   types, prisma, tradeCalculations, performanceMetrics, formValidation
```

---

## 指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發伺服器（port 3002） |
| `npm run start` | 生產模式啟動（port 3002） |
| `npm run build` | 建置 |
| `npm run lint` / `npm run lint:fix` | ESLint 檢查 / 自動修正 |
| `npm run format` / `npm run format:check` | Prettier 格式化 / 檢查 |
| `npm run type-check` | TypeScript 型別檢查 |
| `npm run clean` | 清除 .next 與快取 |
| `npm run db:generate` | Prisma client 產生 |
| `npm run db:push` | 同步 schema 至 DB |
| `npm run db:init` | 初始化帳戶 |
| `npm run db:update-capital` | 更新資金 |
| `npm run db:seed-us-broker` | 初始化美股券商帳戶 |
| `npm run db:patch-us-avg-cost` | 修補美股平均成本 |
| `npm run db:recalc-positions` | 重新計算所有部位 |
| `npm run db:prune-us-inventory` | 清理美股庫存 |
| `npm run stocks:update` | 更新台股清單（寫入 stockList.ts） |
| `npm run stocks:import` | 批次匯入股票清單 |

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
