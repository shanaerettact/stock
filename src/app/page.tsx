'use client';

import { useState, useEffect } from 'react';
import TradeForm from '@/components/TradeForm';
import type { TradeFormData } from '@/components/TradeForm';
import DataModal from '@/components/DataModal';

interface Trade {
  id: string;
  stockCode: string;
  stockName: string | null;
  tradeType: string;
  tradeDate: string;
  price: number;
  quantity: number;
  unit: string;
  amount: number;
  commission: number;
  tax: number;
  totalCost: number;
  createdAt: string;
}

interface Position {
  id: string;
  stockCode: string;
  stockName: string | null;
  status: string;
  entryDate: string;
  avgEntryPrice: number;
  totalQuantity: number;
  totalPnL: number | null;
  returnRate: number | null;
}

export default function HomePage() {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<'trades' | 'performance' | 'funds' | 'positions' | 'rvalue' | 'monthly' | null>(null);
  const [accountBalance, setAccountBalance] = useState(100000);
  const [initialCapital, setInitialCapital] = useState(100000);

  // 載入交易記錄與部位
  const loadData = async () => {
    try {
      setLoading(true);
      const accountId = 'cmj47funv00007jwbtrkd22t9';
      
      // 同時載入交易記錄、部位和帳戶資訊
      const [tradesRes, positionsRes, accountRes] = await Promise.all([
        fetch(`/api/trades?accountId=${accountId}`),
        fetch(`/api/positions?accountId=${accountId}`),
        fetch(`/api/account`)
      ]);
      
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        setTrades(tradesData);
      }
      
      if (positionsRes.ok) {
        const positionsData = await positionsRes.json();
        setPositions(positionsData);
      }
      
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setInitialCapital(accountData.initialCapital || 100000);
        setAccountBalance(accountData.currentBalance || 100000);
      }
    } catch (error) {
      console.error('載入資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (data: TradeFormData) => {
    try {
      // 使用實際的帳戶 ID（實際應用中應該從登入系統或 API 取得）
      const accountId = 'cmj47funv00007jwbtrkd22t9';

      if (editingTrade) {
        // 編輯模式
        const response = await fetch(`/api/trades/${editingTrade.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...data,
            accountId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '更新交易失敗');
        }

        setMessage({ type: 'success', text: '✅ 交易記錄更新成功！' });
        setEditingTrade(null);
      } else {
        // 新增模式
        const response = await fetch('/api/trades', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...data,
            accountId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '新增交易失敗');
        }

        setMessage({ type: 'success', text: '✅ 交易記錄新增成功！' });
      }
      
      setShowForm(false);
      
      // 重新載入資料
      loadData();

      // 3 秒後清除訊息
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '操作失敗，請稍後再試',
      });
    }
  };

  // 處理編輯
  const handleEdit = (trade: Trade) => {
    setEditingTrade(trade);
    setShowForm(true);
  };

  // 處理刪除
  const handleDelete = async (tradeId: string) => {
    if (!confirm('確定要刪除這筆交易記錄嗎？此操作無法復原。')) {
      return;
    }

    try {
      setDeletingTradeId(tradeId);
      
      const response = await fetch(`/api/trades/${tradeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('刪除失敗');
      }

      setMessage({ type: 'success', text: '✅ 交易記錄已刪除！' });
      
      // 重新載入資料
      loadData();

      // 3 秒後清除訊息
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '刪除失敗，請稍後再試',
      });
    } finally {
      setDeletingTradeId(null);
    }
  };

  // 取消編輯
  const handleCancelEdit = () => {
    setEditingTrade(null);
    setShowForm(false);
  };

  return (
    <main className="min-h-screen">
      {/* 頁首 */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold mb-2">📈 股票交易統計系統</h1>
          <p className="text-blue-100 text-lg">
            專業的交易記錄與績效分析平台
          </p>
        </div>
      </header>

      {/* 主要內容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 訊息通知 */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 歡迎區塊 */}
        {!showForm && (
          <div className="space-y-8">
            
            {/* 快速統計 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">交易總數</div>
                <div className="text-3xl font-bold text-blue-600">{trades.length}</div>
                <div className="text-xs text-gray-500 mt-1">筆</div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">持倉部位</div>
                <div className="text-3xl font-bold text-orange-600">
                  {positions.filter(p => p.status === 'OPEN').length}
                </div>
                <div className="text-xs text-gray-500 mt-1">個</div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">已平倉</div>
                <div className="text-3xl font-bold text-green-600">
                  {positions.filter(p => p.status === 'CLOSED').length}
                </div>
                <div className="text-xs text-gray-500 mt-1">個</div>
              </div>
            </div>

            {/* 持倉部位 */}
            {positions.filter(p => p.status === 'OPEN').length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  📊 目前持倉
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">股票</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">股數</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.filter(p => p.status === 'OPEN').map((position) => (
                        <tr key={position.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900">{position.stockCode}</div>
                            {position.stockName && (
                              <div className="text-sm text-gray-600">{position.stockName}</div>
                            )}
                          </td>
                          <td className="text-right py-3 px-4 text-gray-900">
                            {position.totalQuantity.toLocaleString()} 股
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm font-semibold">
                              持倉中
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 最近交易記錄 */}
            {trades.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  📝 最近交易記錄
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">日期</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">股票</th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">類型</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">價格</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">數量</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">成交金額</th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 10).map((trade) => (
                        <tr key={trade.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {new Date(trade.tradeDate).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900">{trade.stockCode}</div>
                            {trade.stockName && (
                              <div className="text-sm text-gray-600">{trade.stockName}</div>
                            )}
                          </td>
                          <td className="text-center py-3 px-4">
                            <span className={`px-2 py-1 rounded text-sm font-semibold ${
                              trade.tradeType === 'BUY' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {trade.tradeType === 'BUY' ? '買進' : '賣出'}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4 text-gray-900">
                            {trade.price.toLocaleString('zh-TW')} 元
                          </td>
                          <td className="text-right py-3 px-4 text-gray-900">
                            {trade.quantity} {trade.unit === 'SHARES' ? '股' : '張'}
                          </td>
                          <td className="text-right py-3 px-4 font-semibold text-gray-900">
                            {trade.amount.toLocaleString('zh-TW')} 元
                          </td>
                          <td className="text-center py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEdit(trade)}
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                title="編輯"
                              >
                                ✏️ 編輯
                              </button>
                              <button
                                onClick={() => handleDelete(trade.id)}
                                disabled={deletingTradeId === trade.id}
                                className="text-red-600 hover:text-red-800 font-medium text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="刪除"
                              >
                                {deletingTradeId === trade.id ? '⏳' : '🗑️'} 刪除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {trades.length > 10 && (
                  <div className="mt-4 text-center text-sm text-gray-600">
                    顯示最近 10 筆，共 {trades.length} 筆交易記錄
                  </div>
                )}
              </div>
            )}

            {/* 空狀態提示 */}
            {trades.length === 0 && !loading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-blue-900 mb-2">
                  尚無交易記錄
                </h3>
                <p className="text-blue-700 mb-4">
                  點擊下方按鈕開始記錄您的第一筆交易
                </p>
              </div>
            )}

            {/* 功能介紹卡片 */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                🎯 核心功能
              </h2>
              <p className="text-gray-600 mb-6 text-sm">
                點擊功能卡片查看詳細說明
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FeatureCard
                  icon="📝"
                  title="交易記錄"
                  description="記錄每筆買賣，自動計算手續費與交易稅"
                  onClick={() => setSelectedFeature('trades')}
                />
                <FeatureCard
                  icon="📊"
                  title="績效分析"
                  description="勝率、盈虧比、期望值、R 值等專業指標"
                  onClick={() => setSelectedFeature('performance')}
                />
                <FeatureCard
                  icon="💰"
                  title="資金管理"
                  description="追蹤帳戶餘額、最大回撤、風險控制"
                  onClick={() => setSelectedFeature('funds')}
                />
                <FeatureCard
                  icon="📈"
                  title="部位管理"
                  description="成對交易追蹤，計算持有天數與報酬率"
                  onClick={() => setSelectedFeature('positions')}
                />
                <FeatureCard
                  icon="🎲"
                  title="R 值分析"
                  description="風險報酬比計算，量化交易品質"
                  onClick={() => setSelectedFeature('rvalue')}
                />
                <FeatureCard
                  icon="📅"
                  title="月度統計"
                  description="按月份統計績效，找出交易規律"
                  onClick={() => setSelectedFeature('monthly')}
                />
              </div>
            </div>

            {/* 資料統計 Modal */}
            {selectedFeature && (
              <DataModal
                isOpen={!!selectedFeature}
                onClose={() => setSelectedFeature(null)}
                type={selectedFeature}
                trades={trades}
                positions={positions}
                accountBalance={accountBalance}
                initialCapital={initialCapital}
              />
            )}

            {/* 快速開始按鈕 */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowForm(true)}
                className="w-full max-w-md bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg shadow-md transition-colors text-lg"
              >
                ➕ 新增交易記錄
              </button>
            </div>

            {/* 使用說明 */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                🚀 快速開始
              </h2>
              <div className="space-y-4 text-gray-700">
                <Step
                  number="1"
                  title="新增交易記錄"
                  description="點擊上方按鈕，輸入股票代號、價格、數量等資訊"
                />
                <Step
                  number="2"
                  title="系統自動計算"
                  description="手續費（六折）、交易稅、總成本將即時顯示"
                />
                <Step
                  number="3"
                  title="查看統計分析"
                  description="使用 Prisma Studio 查看所有交易記錄與績效指標"
                />
                <Step
                  number="4"
                  title="追蹤交易表現"
                  description="分析勝率、R 值、回撤等關鍵指標，優化交易策略"
                />
              </div>
            </div>

            {/* 技術資訊 */}
            <div className="bg-gray-100 rounded-lg p-6 text-sm text-gray-600">
              <p className="mb-2">
                <strong>技術架構：</strong> Next.js 14 + Prisma + SQLite + TypeScript + Tailwind CSS
              </p>
              <p className="mb-2">
                <strong>API 路由：</strong>
              </p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>POST /api/trades - 新增交易</li>
                <li>GET /api/trades - 查詢交易</li>
                <li>GET /api/positions - 查詢部位</li>
                <li>GET /api/stats - 查詢統計</li>
              </ul>
            </div>
          </div>
        )}

        {/* 交易表單 */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              {editingTrade ? '✏️ 編輯交易記錄' : '📝 新增交易記錄'}
            </h2>
            <TradeForm
              onSubmit={handleSubmit}
              onCancel={handleCancelEdit}
              submitLabel={editingTrade ? '更新交易' : '新增交易'}
              initialData={editingTrade ? {
                stockCode: editingTrade.stockCode,
                stockName: editingTrade.stockName || '',
                tradeType: editingTrade.tradeType as 'BUY' | 'SELL',
                tradeDate: new Date(editingTrade.tradeDate).toISOString().split('T')[0],
                price: editingTrade.price.toString(),
                quantity: editingTrade.quantity.toString(),
                unit: editingTrade.unit as 'SHARES' | 'LOTS',
                plannedStopLoss: '',
              } : undefined}
            />
          </div>
        )}
      </div>

      {/* 頁尾 */}
      <footer className="bg-gray-800 text-gray-300 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p>© 2024 股票交易統計系統 - 祝您交易順利，穩定獲利！📈</p>
        </div>
      </footer>
    </main>
  );
}

// 功能卡片元件
function FeatureCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-lg p-6 border border-blue-200 hover:border-blue-300 transition-all duration-200 hover:shadow-lg transform hover:-translate-y-1 text-left w-full"
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-3">{description}</p>
      <div className="text-blue-600 text-xs font-semibold flex items-center gap-1">
        點擊查看詳情
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// 步驟元件
function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
        {number}
      </div>
      <div>
        <h4 className="font-semibold text-gray-800 mb-1">{title}</h4>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
    </div>
  );
}

