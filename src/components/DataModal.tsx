'use client';

import { useEffect } from 'react';

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

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'trades' | 'performance' | 'funds' | 'positions' | 'rvalue' | 'monthly';
  trades: Trade[];
  positions: Position[];
  accountBalance: number;
  initialCapital: number;
}

export default function DataModal({
  isOpen,
  onClose,
  type,
  trades,
  positions,
  accountBalance,
  initialCapital,
}: DataModalProps) {
  // ESC 鍵關閉
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 計算績效指標
  const calculatePerformance = () => {
    const closedPositions = positions.filter(p => p.status === 'CLOSED');
    const winPositions = closedPositions.filter(p => (p.totalPnL || 0) > 0);
    const losePositions = closedPositions.filter(p => (p.totalPnL || 0) < 0);
    
    const winRate = closedPositions.length > 0 
      ? (winPositions.length / closedPositions.length * 100).toFixed(1)
      : '0.0';
    
    const totalPnL = closedPositions.reduce((sum, p) => sum + (p.totalPnL || 0), 0);
    const avgWin = winPositions.length > 0
      ? winPositions.reduce((sum, p) => sum + (p.totalPnL || 0), 0) / winPositions.length
      : 0;
    const avgLoss = losePositions.length > 0
      ? Math.abs(losePositions.reduce((sum, p) => sum + (p.totalPnL || 0), 0) / losePositions.length)
      : 0;
    const profitRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '0.00';
    
    return { winRate, totalPnL, avgWin, avgLoss, profitRatio, closedPositions };
  };

  // 計算月度統計
  const calculateMonthlyStats = () => {
    const monthlyData: { [key: string]: { trades: number; pnl: number } } = {};
    
    positions.filter(p => p.status === 'CLOSED').forEach(position => {
      const date = new Date(position.entryDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { trades: 0, pnl: 0 };
      }
      monthlyData[monthKey].trades++;
      monthlyData[monthKey].pnl += position.totalPnL || 0;
    });
    
    return Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const renderContent = () => {
    const performance = calculatePerformance();
    
    switch (type) {
      case 'trades':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">總交易筆數</div>
                <div className="text-3xl font-bold text-blue-600">{trades.length}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">買入交易</div>
                <div className="text-3xl font-bold text-green-600">
                  {trades.filter(t => t.tradeType === 'BUY').length}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">賣出交易</div>
                <div className="text-3xl font-bold text-red-600">
                  {trades.filter(t => t.tradeType === 'SELL').length}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">總手續費</div>
                <div className="text-2xl font-bold text-purple-600">
                  {trades.reduce((sum, t) => sum + t.commission, 0).toLocaleString()} 元
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className="font-semibold text-gray-800 mb-3">最近交易</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {trades.slice(0, 10).map(trade => (
                  <div key={trade.id} className="bg-gray-50 rounded p-3 text-sm">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold">{trade.stockCode}</span>
                        {trade.stockName && <span className="text-gray-600 ml-2">{trade.stockName}</span>}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.tradeType === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {trade.tradeType === 'BUY' ? '買入' : '賣出'}
                      </span>
                    </div>
                    <div className="text-gray-600 mt-1">
                      {new Date(trade.tradeDate).toLocaleDateString()} • 
                      {trade.price} 元 × {trade.quantity} {trade.unit === 'SHARES' ? '股' : '張'} = 
                      {trade.amount.toLocaleString()} 元
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'performance':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-gray-600">勝率</div>
                <div className="text-3xl font-bold text-green-600">{performance.winRate}%</div>
                <div className="text-xs text-gray-500 mt-1">
                  {performance.closedPositions.filter(p => (p.totalPnL || 0) > 0).length} 勝 / 
                  {performance.closedPositions.length} 場
                </div>
              </div>
              
              <div className={`rounded-lg p-4 border ${
                performance.totalPnL >= 0 
                  ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200' 
                  : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
              }`}>
                <div className="text-sm text-gray-600">總損益</div>
                <div className={`text-3xl font-bold ${performance.totalPnL >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {performance.totalPnL >= 0 ? '+' : ''}{performance.totalPnL.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  報酬率：{((performance.totalPnL / initialCapital) * 100).toFixed(2)}%
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <div className="text-sm text-gray-600">平均獲利</div>
                <div className="text-2xl font-bold text-purple-600">
                  +{performance.avgWin.toLocaleString()} 元
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                <div className="text-sm text-gray-600">平均虧損</div>
                <div className="text-2xl font-bold text-orange-600">
                  -{performance.avgLoss.toLocaleString()} 元
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200 col-span-2">
                <div className="text-sm text-gray-600">盈虧比率</div>
                <div className="text-3xl font-bold text-indigo-600">{performance.profitRatio}</div>
                <div className="text-xs text-gray-500 mt-1">
                  平均獲利 / 平均虧損
                </div>
              </div>
            </div>
          </div>
        );

      case 'funds':
        const returnRate = ((accountBalance - initialCapital) / initialCapital * 100).toFixed(2);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">初始資金</div>
                <div className="text-3xl font-bold text-blue-600">
                  {initialCapital.toLocaleString()} 元
                </div>
              </div>
              <div className={`rounded-lg p-4 ${
                accountBalance >= initialCapital ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <div className="text-sm text-gray-600">當前餘額</div>
                <div className={`text-3xl font-bold ${
                  accountBalance >= initialCapital ? 'text-green-600' : 'text-red-600'
                }`}>
                  {accountBalance.toLocaleString()} 元
                </div>
              </div>
              <div className={`rounded-lg p-4 col-span-2 ${
                Number(returnRate) >= 0 ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <div className="text-sm text-gray-600">總報酬率</div>
                <div className={`text-4xl font-bold ${
                  Number(returnRate) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {Number(returnRate) >= 0 ? '+' : ''}{returnRate}%
                </div>
                <div className="text-sm text-gray-500 mt-2">
                  {Number(returnRate) >= 0 ? '獲利' : '虧損'}：
                  {(accountBalance - initialCapital).toLocaleString()} 元
                </div>
              </div>
            </div>
          </div>
        );

      case 'positions':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">持倉中</div>
                <div className="text-3xl font-bold text-orange-600">
                  {positions.filter(p => p.status === 'OPEN').length}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">已平倉</div>
                <div className="text-3xl font-bold text-green-600">
                  {positions.filter(p => p.status === 'CLOSED').length}
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className="font-semibold text-gray-800 mb-3">持倉部位</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {positions.filter(p => p.status === 'OPEN').map(position => (
                  <div key={position.id} className="bg-orange-50 rounded p-3 border border-orange-200">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-lg">{position.stockCode}</span>
                        {position.stockName && (
                          <span className="text-gray-600 ml-2">{position.stockName}</span>
                        )}
                      </div>
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-semibold">
                        持倉中
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      成本：{position.avgEntryPrice} 元 • 
                      股數：{position.totalQuantity.toLocaleString()} 股
                    </div>
                  </div>
                ))}
                
                {positions.filter(p => p.status === 'OPEN').length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    目前無持倉部位
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className="font-semibold text-gray-800 mb-3">已平倉部位</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {positions.filter(p => p.status === 'CLOSED').slice(0, 5).map(position => (
                  <div key={position.id} className={`rounded p-3 border ${
                    (position.totalPnL || 0) >= 0 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-lg">{position.stockCode}</span>
                        {position.stockName && (
                          <span className="text-gray-600 ml-2">{position.stockName}</span>
                        )}
                      </div>
                      <span className={`text-lg font-bold ${
                        (position.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(position.totalPnL || 0) >= 0 ? '+' : ''}
                        {(position.totalPnL || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      報酬率：{(position.returnRate || 0).toFixed(2)}%
                    </div>
                  </div>
                ))}
                
                {positions.filter(p => p.status === 'CLOSED').length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    尚無已平倉部位
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'monthly':
        const monthlyStats = calculateMonthlyStats();
        return (
          <div className="space-y-4">
            {monthlyStats.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {monthlyStats.map(([month, data]) => (
                  <div key={month} className={`rounded-lg p-4 border ${
                    data.pnl >= 0 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-lg">{month}</div>
                        <div className="text-sm text-gray-600">
                          {data.trades} 筆交易
                        </div>
                      </div>
                      <div className={`text-2xl font-bold ${
                        data.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {data.pnl >= 0 ? '+' : ''}{data.pnl.toLocaleString()} 元
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                尚無月度統計資料
              </div>
            )}
          </div>
        );

      default:
        return <div>資料載入中...</div>;
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'trades': return '📝 交易記錄';
      case 'performance': return '📊 績效分析';
      case 'funds': return '💰 資金管理';
      case 'positions': return '📈 部位管理';
      case 'rvalue': return '🎲 R 值分析';
      case 'monthly': return '📅 月度統計';
      default: return '資料統計';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-t-lg z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{getTitle()}</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {renderContent()}
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-lg border-t">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
