# 專案結構說明

## 📁 檔案架構

```
stock計算/
├── 📄 README.md                     # 專案主文檔（安裝、使用、功能說明）
├── 📄 HOW_TO_UPDATE_STOCKS.md       # 股票清單更新教學
├── 📄 package.json                  # 專案配置與依賴
├── 📄 tsconfig.json                 # TypeScript 配置
├── 📄 tailwind.config.ts            # Tailwind CSS 配置
├── 📄 next.config.js                # Next.js 配置
├── 📄 postcss.config.js             # PostCSS 配置
│
├── 📂 prisma/                       # 資料庫相關
│   ├── schema.prisma                # 資料庫結構定義
│   ├── dev.db                       # SQLite 資料庫檔案
│   ├── init-account.ts              # 初始化帳戶腳本
│   └── update-capital.ts            # 更新初始資金腳本
│
├── 📂 scripts/                      # 工具腳本
│   ├── import-stocks.ts             # 股票清單匯入工具
│   ├── fetch-twse-stocks.ts         # 股票清單更新指南腳本
│   └── stocks-example.csv           # CSV 格式範例
│
├── 📂 public/                       # 靜態資源
│   └── favicon.ico                  # 網站圖示
│
└── 📂 src/                          # 原始碼
    ├── 📂 app/                      # Next.js App Router
    │   ├── layout.tsx               # 根佈局
    │   ├── page.tsx                 # 首頁（交易記錄列表）
    │   ├── globals.css              # 全域樣式
    │   └── 📂 api/                  # API 路由
    │       ├── account/             # 帳戶 API
    │       │   └── route.ts         # GET /api/account
    │       ├── trades/              # 交易 API
    │       │   ├── route.ts         # GET/POST /api/trades
    │       │   └── [id]/
    │       │       └── route.ts     # GET/PUT/DELETE /api/trades/[id]
    │       ├── positions/           # 部位 API
    │       │   └── route.ts         # GET /api/positions
    │       └── stats/               # 統計 API
    │           └── route.ts         # GET /api/stats
    │
    ├── 📂 components/               # React 元件
    │   └── TradeForm.tsx            # 交易輸入表單元件
    │
    ├── 📂 data/                     # 靜態資料
    │   └── stockList.ts             # 台股清單（200+ 支）
    │
    └── 📂 lib/                      # 工具函式庫
        ├── prisma.ts                # Prisma 客戶端
        ├── tradeCalculations.ts     # 交易計算（手續費、稅、損益）
        ├── performanceMetrics.ts    # 績效指標（勝率、R值、回撤）
        └── formValidation.ts        # 表單驗證邏輯
```

---

## 📝 核心檔案說明

### 配置檔案
- **package.json** - 專案依賴與腳本命令
- **tsconfig.json** - TypeScript 編譯設定（嚴格模式）
- **tailwind.config.ts** - Tailwind CSS 自訂配置
- **next.config.js** - Next.js 框架配置

### 資料庫
- **prisma/schema.prisma** - 定義資料表結構（Account, Trade, Position, MonthlyStats）
- **prisma/dev.db** - SQLite 資料庫檔案
- **prisma/init-account.ts** - 建立初始帳戶
- **prisma/update-capital.ts** - 更新帳戶初始資金

### 前端
- **src/app/page.tsx** - 首頁（交易記錄列表、統計卡片）
- **src/app/layout.tsx** - 應用程式根佈局
- **src/components/TradeForm.tsx** - 交易表單（新增/編輯）

### API
- **src/app/api/account/** - 帳戶管理
- **src/app/api/trades/** - 交易記錄 CRUD
- **src/app/api/positions/** - 部位查詢
- **src/app/api/stats/** - 統計資料

### 工具函式
- **src/lib/tradeCalculations.ts** - 手續費、稅、損益計算
- **src/lib/performanceMetrics.ts** - 勝率、期望值、回撤計算
- **src/lib/formValidation.ts** - 表單欄位驗證
- **src/lib/prisma.ts** - Prisma 客戶端單例

### 資料
- **src/data/stockList.ts** - 台股代號與名稱對照表

### 工具腳本
- **scripts/import-stocks.ts** - 從 CSV 匯入股票清單
- **scripts/fetch-twse-stocks.ts** - 顯示股票清單更新指南

---

## 🎯 檔案用途快速參考

### 我想要...

#### 新增功能
- **新增 API 端點** → `src/app/api/[endpoint]/route.ts`
- **新增頁面** → `src/app/[page]/page.tsx`
- **新增元件** → `src/components/[Component].tsx`
- **新增計算邏輯** → `src/lib/[module].ts`

#### 修改資料庫
- **修改資料表** → `prisma/schema.prisma` → 執行 `npm run db:push`

#### 修改樣式
- **全域樣式** → `src/app/globals.css`
- **元件樣式** → 使用 Tailwind CSS class

#### 資料管理
- **初始化帳戶** → 執行 `npm run db:init`
- **更新初始資金** → 執行 `npm run db:update-capital`

#### 股票清單
- **新增單支股票** → 編輯 `src/data/stockList.ts`
- **匯入完整清單** → 準備 CSV → 執行 `npm run stocks:import`
- **查看更新指南** → 執行 `npm run stocks:guide`

---

## 🚀 常用操作

### 開發
```bash
npm run dev          # 啟動開發伺服器（port 3002）
npm run build        # 建置生產版本
npm run lint         # 執行程式碼檢查
npm run type-check   # TypeScript 型別檢查
```

### 資料庫
```bash
npm run db:generate  # 生成 Prisma Client
npm run db:push      # 更新資料庫結構
npm run db:init      # 初始化帳戶
```

### 股票清單
```bash
npm run stocks:import  # 匯入股票清單
npm run stocks:guide   # 查看更新指南
```

---

## 📦 依賴套件

### 主要依賴
- **next** - React 框架
- **react** - UI 函式庫
- **@prisma/client** - 資料庫 ORM
- **zod** - 資料驗證（選用）

### 開發依賴
- **typescript** - 型別系統
- **prisma** - 資料庫工具
- **tailwindcss** - CSS 框架
- **tsx** - TypeScript 執行器

---

## 🔧 技術棧

- **前端**: Next.js 14 + React 18 + TypeScript
- **樣式**: Tailwind CSS
- **後端**: Next.js API Routes
- **資料庫**: SQLite + Prisma ORM
- **部署**: 本地執行（可部署至 Vercel）

---

**最後更新**: 2024-12-13

