'use client';

import { useState, useEffect, useMemo } from 'react';
import TradeForm from '@/components/TradeForm';
import type { TradeFormData } from '@/components/TradeForm';
import PositionsTable from '@/components/PositionsTable';
import type { Trade, Position } from '@/lib/types';

const ACCOUNT_ID = 'cmj47funv00007jwbtrkd22t9';

export default function HomePage() {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [recalculating, setRecalculating] = useState(false);

  // 顯示訊息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 載入資料
  const loadData = async () => {
    try {
      setLoading(true);
      // 添加時間戳防止快取
      const timestamp = Date.now();
      const [tradesRes, positionsRes, accountRes] = await Promise.all([
        fetch(`/api/trades?accountId=${ACCOUNT_ID}&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/positions?accountId=${ACCOUNT_ID}&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/account?_t=${timestamp}`, { cache: 'no-store' })
      ]);
      
      if (tradesRes.ok) setTrades(await tradesRes.json());
      if (positionsRes.ok) setPositions(await positionsRes.json());
      if (accountRes.ok) {
        const data = await accountRes.json();
        setInitialCapital(data.initialCapital || 100000);
      }
    } catch (error) {
      console.error('載入資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // 提交交易
  const handleSubmit = async (data: TradeFormData) => {
    try {
      const url = editingTrade ? `/api/trades/${editingTrade.id}` : '/api/trades';
      const method = editingTrade ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, accountId: ACCOUNT_ID }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '操作失敗');
      }

      showMessage('success', editingTrade ? '✅ 交易記錄更新成功！' : '✅ 交易記錄新增成功！');
      setEditingTrade(null);
      setShowForm(false);
      loadData();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '操作失敗');
    }
  };

  // 編輯交易
  const handleEdit = (trade: Trade) => {
    setEditingTrade(trade);
    setShowForm(true);
  };

  // 刪除交易
  const handleDelete = async (tradeId: string) => {
    if (!confirm('確定要刪除這筆交易記錄嗎？')) return;

    try {
      setDeletingTradeId(tradeId);
      const response = await fetch(`/api/trades/${tradeId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('刪除失敗');
      showMessage('success', '✅ 交易記錄已刪除！');
      loadData();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '刪除失敗');
    } finally {
      setDeletingTradeId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingTrade(null);
    setShowForm(false);
  };

  // 重新計算所有部位
  const handleRecalculatePositions = async () => {
    try {
      setRecalculating(true);
      const response = await fetch('/api/positions/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: ACCOUNT_ID }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '重新計算失敗');
      }

      const result = await response.json();
      
      // 顯示餘額重算結果
      let balanceMsg = '';
      if (result.balanceRecalculation?.success) {
        const diff = result.balanceRecalculation.difference;
        if (Math.abs(diff) > 1) {
          balanceMsg = `，餘額已調整 ${diff >= 0 ? '+' : ''}${diff.toLocaleString()} 元`;
        } else {
          balanceMsg = '，餘額無需調整';
        }
      }
      
      showMessage('success', `✅ ${result.message}，已關聯 ${result.linkedTrades} 筆孤立交易${balanceMsg}`);
      loadData();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '重新計算失敗');
    } finally {
      setRecalculating(false);
    }
  };

  const openPositions = positions.filter(p => p.status === 'OPEN');
  const closedPositions = positions.filter(p => p.status === 'CLOSED');

  return (
    <main className="min-h-screen">
      {/* 頁首 */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold mb-2">📈 股票交易統計系統</h1>
          <p className="text-gray-400 text-lg">專業的交易記錄與績效分析平台</p>
        </div>
      </header>

      {/* 主要內容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 訊息通知 */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-700 text-green-300'
              : 'bg-red-900/50 border border-red-700 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* 歡迎區塊 */}
        {!showForm && (
          <div className="space-y-8">
            {/* 快速統計 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="交易總數" value={trades.length} unit="筆" color="blue" />
              <StatCard label="持倉部位" value={openPositions.length} unit="個" color="orange" />
              <StatCard label="已平倉" value={closedPositions.length} unit="個" color="green" />
            </div>

            {/* 工具按鈕 */}
            <div className="flex justify-end">
              <button
                onClick={handleRecalculatePositions}
                disabled={recalculating}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-200 font-medium rounded-lg transition-colors text-sm border border-gray-600"
              >
                {recalculating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    計算中...
                  </>
                ) : (
                <>🔄 重新計算部位與餘額</>
              )}
              </button>
            </div>

            {/* 持倉部位 */}
            <PositionsTable 
              positions={positions} 
              initialCapital={initialCapital}
              onMessage={showMessage}
            />

            {/* 最近交易記錄 */}
            {trades.length > 0 && (
              <TradesTable 
                trades={trades}
                onEdit={handleEdit}
                onDelete={handleDelete}
                deletingTradeId={deletingTradeId}
              />
            )}

            {/* 空狀態提示 */}
            {trades.length === 0 && !loading && (
              <EmptyState />
            )}

            {/* 新增交易 */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowForm(true)}
                className="w-full max-w-md bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-lg shadow-md transition-colors text-lg"
              >
                ➕ 新增交易記錄
              </button>
            </div>

          </div>
        )}

        {/* 交易表單 */}
        {showForm && (
          <TradeFormWrapper
            editingTrade={editingTrade}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
          />
        )}
      </div>

      {/* 頁尾 */}
      <footer className="bg-gray-950 text-gray-400 mt-16 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p>© 2024 股票交易統計系統 - 祝您交易順利，穩定獲利！📈</p>
        </div>
      </footer>
    </main>
  );
}

// ===== 子元件 =====

function StatCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: 'blue' | 'orange' | 'green' }) {
  const colorClass = {
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    green: 'text-green-400',
  }[color];

  return (
    <div className="bg-gray-900 rounded-lg shadow-md p-6 border border-gray-800">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{unit}</div>
    </div>
  );
}

// 使用獨立的 wrapper 組件來避免 initialData 被重新創建
function TradeFormWrapper({ editingTrade, onSubmit, onCancel }: {
  editingTrade: Trade | null;
  onSubmit: (data: TradeFormData) => Promise<void>;
  onCancel: () => void;
}) {
  // 使用 useMemo 緩存 initialData，只有當 editingTrade.id 改變時才重新創建
  const initialData = useMemo(() => {
    if (!editingTrade) return undefined;
    return {
      stockCode: editingTrade.stockCode,
      stockName: editingTrade.stockName || '',
      tradeType: editingTrade.tradeType as 'BUY' | 'SELL',
      tradeDate: new Date(editingTrade.tradeDate).toISOString().split('T')[0],
      price: editingTrade.price.toString(),
      quantity: editingTrade.quantity.toString(),
      unit: editingTrade.unit as 'SHARES' | 'LOTS',
      securityType: (editingTrade.securityType as 'STOCK' | 'ETF' | 'TDR' | 'WARRANT') || 'STOCK',
      isDayTrade: editingTrade.isDayTrade || false,
      plannedStopLoss: '',
    };
  }, [editingTrade?.id]); // 只依賴 id，避免內容變化導致重新創建

  return (
    <div className="bg-gray-900 rounded-lg shadow-xl p-8 border border-gray-700">
      <h2 className="text-2xl font-bold text-gray-100 mb-6">
        {editingTrade ? '✏️ 編輯交易記錄' : '📝 新增交易記錄'}
      </h2>
      <TradeForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitLabel={editingTrade ? '更新交易' : '新增交易'}
        initialData={initialData}
      />
    </div>
  );
}

function TradesTable({ trades, onEdit, onDelete, deletingTradeId }: {
  trades: Trade[];
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
  deletingTradeId: string | null;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(trades.length / itemsPerPage);
  
  // 計算當前頁的資料範圍
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTrades = trades.slice(startIndex, endIndex);
  
  // 當交易記錄變更時，重置到第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [trades.length]);
  
  // 生成頁碼按鈕
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // 如果總頁數少於等於最大顯示頁數，顯示所有頁碼
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 否則顯示部分頁碼，包含當前頁前後各2頁
      if (currentPage <= 3) {
        // 前幾頁
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // 後幾頁
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // 中間頁
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-md p-6 border border-gray-800">
      <h2 className="text-2xl font-bold text-gray-100 mb-4">📝 最近交易記錄</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">日期</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">股票</th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-gray-400">類型</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">價格</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">數量</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">成交金額</th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-gray-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {currentTrades.length > 0 ? (
              currentTrades.map((trade) => (
                <tr key={trade.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-3 px-4 text-sm text-gray-400">
                    {new Date(trade.tradeDate).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-gray-200">{trade.stockCode}</div>
                    {trade.stockName && <div className="text-sm text-gray-500">{trade.stockName}</div>}
                  </td>
                  <td className="text-center py-3 px-4">
                    <span className={`px-2 py-1 rounded text-sm font-semibold ${
                      trade.tradeType === 'BUY' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                    }`}>
                      {trade.tradeType === 'BUY' ? '買進' : '賣出'}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4 text-gray-200">{trade.price.toLocaleString('zh-TW')} 元</td>
                  <td className="text-right py-3 px-4 text-gray-200">
                    {trade.quantity} {trade.unit === 'SHARES' ? '股' : '張'}
                  </td>
                  <td className="text-right py-3 px-4 font-semibold text-gray-200">
                    {trade.amount.toLocaleString('zh-TW')} 元
                  </td>
                  <td className="text-center py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onEdit(trade)}
                        className="text-blue-400 hover:text-blue-300 font-medium text-sm px-2 py-1 rounded hover:bg-blue-900/30 transition-colors"
                      >
                        ✏️ 編輯
                      </button>
                      <button
                        onClick={() => onDelete(trade.id)}
                        disabled={deletingTradeId === trade.id}
                        className="text-red-400 hover:text-red-300 font-medium text-sm px-2 py-1 rounded hover:bg-red-900/30 transition-colors disabled:opacity-50"
                      >
                        {deletingTradeId === trade.id ? '⏳' : '🗑️'} 刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  尚無交易記錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* 分頁控件 */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-400">
            顯示第 {startIndex + 1} - {Math.min(endIndex, trades.length)} 筆，共 {trades.length} 筆交易記錄
          </div>
          
          <div className="flex items-center gap-2">
            {/* 上一頁按鈕 */}
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-lg border border-gray-700 transition-colors text-sm font-medium"
            >
              ← 上一頁
            </button>
            
            {/* 頁碼按鈕 */}
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, index) => {
                if (page === '...') {
                  return (
                    <span key={`ellipsis-${index}`} className="px-2 text-gray-500">
                      ...
                    </span>
                  );
                }
                
                const pageNum = page as number;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            {/* 下一頁按鈕 */}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-lg border border-gray-700 transition-colors text-sm font-medium"
            >
              下一頁 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
      <div className="text-6xl mb-4">📊</div>
      <h3 className="text-xl font-semibold text-gray-200 mb-2">尚無交易記錄</h3>
      <p className="text-gray-400 mb-4">點擊下方按鈕開始記錄您的第一筆交易</p>
    </div>
  );
}
