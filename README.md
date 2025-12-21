# 📈 股票交易統計系統

專業的股票交易記錄與績效分析平台，幫助交易者量化交易表現、找出優劣勢，優化交易策略。

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8)

---

## ✨ 核心功能

### 📝 交易記錄
- 完整記錄買賣交易
- 支援零股與整張交易
- 自動計算手續費（六折）、交易稅
- 智能股票代號/名稱互查（內建 2200+ 台股）

### 📊 持倉管理
- **即時報價**：一鍵取得 TWSE/TPEX 收盤價
- **未實現損益**：自動計算損益金額與百分比
- **追蹤停損**：漲幅達 20% 自動啟用，鎖定獲利

### 📈 績效分析
- 勝率、平均獲利/虧損、盈虧比
- 期望值、R 值分析、最大回撤
- 月度統計與趨勢追蹤

---

## 🚀 快速開始

### 系統需求
- Node.js >= 18.0.0
- npm >= 9.0.0

### 安裝步驟

```bash
# 1. 安裝依賴
npm install

# 2. 初始化資料庫
npx prisma generate
npx prisma db push

# 3. 建立初始帳戶
npx tsx prisma/init-account.ts

# 4. 啟動開發伺服器
npm run dev
```

訪問 **http://localhost:3002** 開始使用！

---

## 📁 專案結構

```
src/
├── app/
│   ├── page.tsx              # 首頁
│   └── api/                   # API 路由
│       ├── trades/            # 交易 CRUD
│       ├── positions/         # 部位查詢
│       ├── stock-price/       # 即時股價
│       └── stats/             # 績效統計
├── components/
│   ├── TradeForm.tsx          # 交易表單
│   ├── PositionsTable.tsx     # 持倉表格
│   └── DataModal.tsx          # 績效彈窗
├── lib/
│   ├── types.ts               # 共用型別
│   ├── tradeCalculations.ts   # 交易計算
│   └── performanceMetrics.ts  # 績效指標
└── data/
    └── stockList.ts           # 台股清單
```

詳細結構請參考 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

---

## 🔧 常用指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 建置生產版本 |
| `npm run db:init` | 初始化帳戶 |
| `npm run stocks:update` | 更新台股清單 |

---

## 💡 功能亮點

### 🔄 即時股價查詢
點擊「取得今日收盤價」按鈕，自動從 [TWSE OpenAPI](https://openapi.twse.com.tw/) 取得：
- 上市股票（TWSE）
- 上櫃股票（TPEX）

### 📉 追蹤停損機制
當持股漲幅達 **20%** 時自動啟用：
- 追蹤停損價 = 收盤價 × 90%
- 保本停損價 = 成本價 × 102%
- 取兩者較高值，確保獲利

### 📊 費用計算
- **手續費**：成交金額 × 0.1425% × 0.6（六折）
- **交易稅**：
  - 股票：賣出 0.3%（當沖 0.15%）
  - ETF/TDR/權證：賣出 0.1%

---

## 🏗️ 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | Next.js 14 + React 18 + Tailwind CSS |
| 語言 | TypeScript（嚴格模式） |
| 後端 | Next.js API Routes |
| 資料庫 | SQLite + Prisma ORM |
| 即時資料 | TWSE/TPEX OpenAPI |

---

## 📊 資料模型

### Trade（交易記錄）
- 股票代號/名稱、交易類型、日期
- 價格、數量、單位（股/張）
- 手續費、稅、總成本

### Position（部位）
- 開倉/平倉狀態
- 平均成本、總股數
- 停損價、損益、報酬率、R 值

---

## 🔑 FinMind API 設定（52 周新高、交易量分析）

系統支援使用 FinMind API 來判斷 52 周新高和計算 50 日平均交易量。

### 設定步驟

1. **註冊 FinMind 帳號**
   - 前往 [FinMind 官網](https://finmind.github.io/) 註冊
   - 驗證信箱後取得免費 API Token（每小時 600 次請求）

2. **設定環境變數**
   在專案根目錄建立 `.env.local` 檔案：
   ```bash
   FINMIND_API_TOKEN=您的_API_Token
   ```

3. **重新啟動開發伺服器**
   ```bash
   npm run dev
   ```

### 功能說明

- **52 周新高**：當股票收盤價達到或超過過去 52 周最高價時，會顯示 🎯 標記
- **交易量提示**：當今日交易量超過 50 日平均交易量的 50% 時，會顯示 📈 量增提示

> **注意**：如果未設定 FinMind API Token，系統仍可正常運作，但不會顯示 52 周新高和交易量分析功能。

---

## 🆘 常見問題

### Q: 找不到股票代號？
執行 `npm run stocks:update` 更新完整清單，或手動編輯 `src/data/stockList.ts`。

### Q: 如何重置資料？
刪除 `prisma/dev.db` 後重新執行初始化指令。

### Q: 可以備份資料嗎？
複製 `prisma/dev.db` 檔案即可備份。

### Q: FinMind API 是免費的嗎？
是的，註冊並驗證信箱後，每小時可發送最多 600 次請求，完全免費。

---

## 📄 授權

MIT License

---

**祝您交易順利，穩定獲利！** 📈💰
