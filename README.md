# 股票交易統計系統

交易記錄與持倉管理，支援手續費/稅計算、即時股價、追蹤停損。

**技術**：Next.js 14、TypeScript、Tailwind、SQLite、Prisma。股價來源：TWSE/TPEX OpenAPI。

---

## 快速開始

- Node.js >= 18，`npm install`
- `npx prisma generate` → `npx prisma db push` → `npx tsx prisma/init-account.ts`
- `npm run dev` → 訪問 http://localhost:3002

---

## 專案結構

```
stock計算/
├── prisma/    schema, dev.db, init-account, update-capital
├── scripts/   fetch-twse-stocks.ts, stocks.csv
└── src/
    ├── app/   layout, page, globals.css
    │   └── api/   account, trades, trades/[id], positions, positions/recalculate, stats, stock-price
    ├── components/   TradeForm, PositionsTable
    ├── data/   stockList.ts
    └── lib/   types, prisma, tradeCalculations, performanceMetrics, formValidation
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
- **手動**：編輯 `src/data/stockList.ts`，格式 `{ code: "代號", name: "名稱", market: "上市" }`

---

## 其他

- **FinMind**（選用）：於 `.env.local` 設定 `FINMIND_API_TOKEN` 可啟用 52 周新高、交易量分析。
- **備份**：複製 `prisma/dev.db`。重置：刪除該檔後重新執行 db 與 init 指令。

---

**本專案不會自動新增或產生說明文件。** 所有文件皆為手動維護。
