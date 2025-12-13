# 📈 股票交易統計系統

一個專業的股票交易記錄與績效分析平台，幫助交易者量化交易表現、找出優劣勢，並作為優化交易策略的依據。

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 核心功能

### 📝 交易記錄管理
- ✅ 完整記錄買賣交易（股票代號、名稱、價格、數量、日期）
- ✅ 支援零股與整張交易單位切換
- ✅ 自動計算手續費（0.1425% × 0.6 折）
- ✅ 自動計算交易稅（賣出時 0.3%）
- ✅ 自動計算停損金額（成交金額的 10%）
- ✅ 即時費用預覽與計算
- ✅ 交易記錄編輯與刪除功能
- ✅ 智能股票代號/名稱互查（內建 200+ 台股清單）

### 📊 部位管理
- ✅ 成對交易追蹤（買入→賣出）
- ✅ 持倉部位即時顯示
- ✅ 平倉部位歷史記錄
- ✅ 自動計算平均成本
- ✅ 部位損益與報酬率
- ✅ 風險管理（R 值計算）

### 📈 績效指標分析
- ✅ **基本指標**：勝率、平均獲利、平均虧損、盈虧比率
- ✅ **進階指標**：期望值、調整後盈虧比率、最大回撤
- ✅ **R 值分析**：風險報酬比、R 值分布統計
- ✅ **持有天數**：成功/失敗部位平均持有天數

### 📅 時間維度統計
- ✅ 整體績效總覽
- ✅ 每月績效統計
- ✅ 歷史餘額與回撤追蹤

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

# 3. 建立初始帳戶（初始資金：100,000 元）
npx tsx prisma/init-account.ts

# 4. 啟動開發伺服器
npm run dev
```

訪問 **http://localhost:3002** 開始使用！

---

## 🏗️ 技術架構

### 前端
- **框架**：Next.js 14 (App Router)
- **UI**：React 18 + Tailwind CSS
- **語言**：TypeScript 5.3 (嚴格模式)
- **表單驗證**：自訂驗證邏輯

### 後端
- **API**：Next.js API Routes
- **資料庫**：SQLite
- **ORM**：Prisma 5.9

### 功能特性
- ✅ 即時計算與預覽
- ✅ 響應式設計（支援手機、平板、電腦）
- ✅ 客戶端與伺服器端驗證
- ✅ RESTful API 設計

---

## 📁 專案結構

```
stock計算/
├── prisma/
│   ├── schema.prisma              # 資料庫結構定義
│   ├── dev.db                     # SQLite 資料庫檔案
│   ├── init-account.ts            # 初始化帳戶腳本
│   ├── update-capital.ts          # 更新初始資金腳本
│   └── seed.ts                    # 資料種子檔案
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── account/          # 帳戶 API
│   │   │   ├── trades/           # 交易 API（新增/編輯/刪除）
│   │   │   ├── positions/        # 部位 API
│   │   │   └── stats/            # 統計 API
│   │   ├── layout.tsx            # 根佈局
│   │   ├── page.tsx              # 首頁（交易記錄列表）
│   │   └── globals.css           # 全域樣式
│   ├── components/
│   │   └── TradeForm.tsx         # 交易輸入表單元件
│   ├── data/
│   │   └── stockList.ts          # 台股清單（200+ 支股票）
│   └── lib/
│       ├── tradeCalculations.ts  # 交易計算（手續費、稅、損益）
│       ├── performanceMetrics.ts # 績效指標（勝率、R值、回撤）
│       ├── formValidation.ts     # 表單驗證邏輯
│       └── prisma.ts             # Prisma 客戶端
├── scripts/
│   ├── import-stocks.ts          # 股票清單匯入工具
│   ├── fetch-twse-stocks.ts      # 台股清單更新指南
│   └── stocks-example.csv        # CSV 格式範例
├── public/
│   └── favicon.ico               # 網站圖示
├── HOW_TO_UPDATE_STOCKS.md       # 股票清單更新教學
├── USAGE_EXAMPLES.md             # 使用範例
├── ZERO_SHARES_GUIDE.md          # 零股交易指南
├── package.json                  # 專案配置
├── tsconfig.json                 # TypeScript 配置
├── tailwind.config.ts            # Tailwind CSS 配置
└── README.md                     # 本檔案
```

---

## 📖 使用說明

### 1. 新增交易記錄

```
首頁 → 點擊「➕ 新增交易記錄」→ 填寫表單 → 提交
```

**表單欄位：**
- 股票代號（輸入後自動帶出名稱）
- 股票名稱（輸入後自動帶出代號）
- 交易類型（買進/賣出）
- 交易日期
- 成交價格
- 數量（支援零股/張切換）
- 停損金額（自動計算）

**即時功能：**
- ✅ 輸入股票代號 → 自動顯示名稱
- ✅ 輸入股票名稱 → 自動顯示代號
- ✅ 切換單位 → 自動重新計算
- ✅ 修改價格/數量 → 即時更新預覽

### 2. 編輯交易記錄

```
首頁 → 找到交易記錄 → 點擊「✏️ 編輯」→ 修改資料 → 更新交易
```

- ✅ 表單自動填入原始資料
- ✅ 修改後即時計算費用
- ✅ 自動更新關聯部位

### 3. 刪除交易記錄

```
首頁 → 找到交易記錄 → 點擊「🗑️ 刪除」→ 確認
```

- ✅ 刪除前會顯示確認對話框
- ✅ 自動處理關聯部位
- ✅ 如果是部位的唯一交易，部位也會被刪除

### 4. 查看統計資料

```
首頁 → 查看統計卡片
```

- 交易總數
- 持倉部位數量
- 已平倉部位數量
- 目前持倉列表
- 最近交易記錄（最多 10 筆）

### 5. 使用 Prisma Studio

```bash
npm run db:studio
```

訪問 **http://localhost:5555** 查看和編輯資料庫內容。

---

## 🔧 常用指令

### 開發相關
```bash
npm run dev          # 啟動開發伺服器
npm run build        # 建置生產版本
npm run start        # 啟動生產伺服器
npm run lint         # 執行 ESLint 檢查
npm run type-check   # TypeScript 型別檢查
```

### 資料庫相關
```bash
npm run db:generate  # 生成 Prisma Client
npm run db:push      # 推送 schema 到資料庫
npm run db:studio    # 開啟 Prisma Studio
npm run db:seed      # 執行種子資料
npm run db:reset     # 重置資料庫
```

### 自訂腳本
```bash
# 初始化帳戶
npx tsx prisma/init-account.ts

# 更新初始資金
npx tsx prisma/update-capital.ts

# 匯入股票清單
npx tsx scripts/import-stocks.ts

# 查看股票清單更新指南
npx tsx scripts/fetch-twse-stocks.ts
```

---

## 📊 資料庫結構

### Account（帳戶）
- 帳戶 ID
- 初始資金
- 當前餘額
- 幣別

### Trade（交易記錄）
- 交易 ID
- 股票代號/名稱
- 交易類型（買進/賣出）
- 交易日期
- 價格、數量、單位
- 手續費、稅、總成本
- 關聯部位 ID

### Position（部位）
- 部位 ID
- 股票代號/名稱
- 狀態（開倉/平倉）
- 平均買入價/賣出價
- 總股數
- 損益、報酬率、R 值
- 持有天數

### MonthlyStats（月度統計）
- 年月
- 交易次數
- 勝率、盈虧比
- 期望值、最大回撤

---

## 💡 實用功能

### 零股與整張交易
系統支援兩種交易單位：

- **零股**：以「股」為單位（最小 1 股）
- **整張**：以「張」為單位（1 張 = 1000 股）

自動轉換與計算，避免單位錯誤。

### 自動停損計算
系統自動計算建議停損金額：

```
停損金額 = 成交金額 × 90%
```

例如：買入 10,000 元，建議停損設在 9,000 元。

### 股票代號/名稱互查
輸入代號或名稱，系統自動補全：

```
輸入「2330」→ 自動顯示「台積電」
輸入「台積電」→ 自動顯示「2330」
```

內建 200+ 支常見台股，可手動擴充至完整清單。

---

## 🎯 進階使用

### 更新股票清單

參考 [HOW_TO_UPDATE_STOCKS.md](./HOW_TO_UPDATE_STOCKS.md) 取得最新台股清單。

### 資料備份

```bash
# 備份資料庫
cp prisma/dev.db prisma/dev.db.backup

# 還原資料庫
cp prisma/dev.db.backup prisma/dev.db
```

### 修改初始資金

```bash
# 編輯 prisma/update-capital.ts，修改金額
npx tsx prisma/update-capital.ts
```

---

## 📝 注意事項

### 手續費計算
- 公式：成交金額 × 0.1425% × 0.6（六折優惠）
- 最低收費：1 元（系統自動處理）

### 交易稅
- 買入：無交易稅
- 賣出：成交金額 × 0.3%

### 零股交易
- 支援 1 股起交易
- 手續費與整張相同
- 自動單位轉換（1 張 = 1000 股）

---

## 🐛 常見問題

### Q: 找不到我的股票代號？
A: 可以手動在 `src/data/stockList.ts` 中新增，或參考更新指南匯入完整清單。

### Q: 如何重置所有資料？
A: 執行 `npm run db:reset` 會清空資料庫並重新初始化。

### Q: 編輯交易後部位沒更新？
A: 系統會自動重新計算部位，如果沒有更新，請檢查控制台是否有錯誤訊息。

### Q: 可以匯出資料嗎？
A: 目前可使用 Prisma Studio 匯出，或直接複製 `prisma/dev.db` 檔案。

---

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request！

---

## 📄 授權

MIT License

---

## 📧 聯絡資訊

如有問題或建議，歡迎聯絡。

---

**祝您交易順利，穩定獲利！** 📈💰✨
