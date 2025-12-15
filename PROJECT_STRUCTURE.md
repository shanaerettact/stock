# 專案結構說明

## 📁 檔案架構

```
stock計算/
├── 📄 README.md                     # 專案主文檔
├── 📄 PROJECT_STRUCTURE.md          # 本檔案
├── 📄 HOW_TO_UPDATE_STOCKS.md       # 股票清單更新教學
├── 📄 package.json                  # 專案配置與依賴
├── 📄 tsconfig.json                 # TypeScript 配置
├── 📄 tailwind.config.ts            # Tailwind CSS 配置
├── 📄 next.config.js                # Next.js 配置
│
├── 📂 prisma/                       # 資料庫相關
│   ├── schema.prisma                # 資料庫結構定義
│   ├── dev.db                       # SQLite 資料庫
│   ├── init-account.ts              # 初始化帳戶腳本
│   └── update-capital.ts            # 更新初始資金腳本
│
├── 📂 scripts/                      # 工具腳本
│   ├── fetch-twse-stocks.ts         # 自動更新台股清單
│   └── stocks.csv                   # 股票清單備份
│
└── 📂 src/                          # 原始碼
    ├── 📂 app/                      # Next.js App Router
    │   ├── layout.tsx               # 根佈局
    │   ├── page.tsx                 # 首頁
    │   ├── globals.css              # 全域樣式
    │   └── 📂 api/                  # API 路由
    │       ├── account/route.ts     # 帳戶查詢
    │       ├── trades/route.ts      # 交易 CRUD
    │       ├── trades/[id]/route.ts # 單筆交易操作
    │       ├── positions/route.ts   # 部位查詢
    │       ├── stats/route.ts       # 統計查詢
    │       └── stock-price/route.ts # 即時股價查詢
    │
    ├── 📂 components/               # React 元件
    │   ├── TradeForm.tsx            # 交易表單
    │   ├── DataModal.tsx            # 資料彈窗
    │   └── PositionsTable.tsx       # 持倉表格（含即時報價）
    │
    ├── 📂 data/                     # 靜態資料
    │   └── stockList.ts             # 台股清單（2200+ 支）
    │
    └── 📂 lib/                      # 工具函式
        ├── types.ts                 # 共用型別定義
        ├── prisma.ts                # Prisma 客戶端
        ├── tradeCalculations.ts     # 交易計算
        ├── performanceMetrics.ts    # 績效指標
        └── formValidation.ts        # 表單驗證
```

---

## 📝 核心檔案說明

### 前端元件
| 檔案 | 說明 |
|------|------|
| `src/app/page.tsx` | 首頁（統計卡片、持倉、交易記錄） |
| `src/components/TradeForm.tsx` | 交易輸入表單 |
| `src/components/PositionsTable.tsx` | 持倉表格（含即時報價、追蹤停損） |
| `src/components/DataModal.tsx` | 績效分析彈窗 |

### API 路由
| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/account` | GET | 查詢帳戶資訊 |
| `/api/trades` | GET/POST | 查詢/新增交易 |
| `/api/trades/[id]` | PUT/DELETE | 更新/刪除交易 |
| `/api/positions` | GET | 查詢部位 |
| `/api/stats` | GET | 查詢績效統計 |
| `/api/stock-price` | GET | 取得即時股價（TWSE/TPEX） |

### 工具函式
| 檔案 | 說明 |
|------|------|
| `lib/types.ts` | 共用型別（Trade, Position, StockPrice, TrailingStop） |
| `lib/tradeCalculations.ts` | 手續費、稅、損益計算 |
| `lib/performanceMetrics.ts` | 勝率、期望值、R 值、回撤計算 |
| `lib/formValidation.ts` | 表單驗證邏輯 |

---

## 🚀 常用指令

### 開發
```bash
npm run dev          # 啟動開發伺服器 (port 3002)
npm run build        # 建置生產版本
npm run lint         # ESLint 檢查
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
npm run stocks:update  # 自動更新台股清單
```

---

## 🔧 技術棧

- **前端**: Next.js 14 + React 18 + TypeScript
- **樣式**: Tailwind CSS
- **後端**: Next.js API Routes
- **資料庫**: SQLite + Prisma ORM
- **即時股價**: TWSE/TPEX OpenAPI

---

## 🎯 功能特色

### 持倉管理
- ✅ 即時取得 TWSE/TPEX 收盤價
- ✅ 自動計算未實現損益
- ✅ 追蹤停損（漲幅達 20% 自動啟用）

### 交易記錄
- ✅ 支援零股/整張交易
- ✅ 自動計算手續費（六折）、交易稅
- ✅ 智能股票代號/名稱互查

### 績效分析
- ✅ 勝率、盈虧比、期望值
- ✅ R 值分析、最大回撤
- ✅ 月度統計

---

**最後更新**: 2024-12
