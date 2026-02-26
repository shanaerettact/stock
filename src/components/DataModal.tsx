'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createChart, createSeriesMarkers, CandlestickSeries } from 'lightweight-charts';
import type { Trade, Position } from '@/lib/types';
import { getStockMarketByCode } from '@/data/stockList';

type ChartCandle = { date: string; open: number; high: number; low: number; close: number; entry?: number; exit?: number };

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'trades' | 'performance' | 'funds' | 'positions' | 'rvalue' | 'monthly';
  trades: Trade[];
  positions: Position[];
  accountBalance: number;
  initialCapital: number;
  onUpdateCapital?: (newCapital: number) => Promise<void>;
}

export default function DataModal({
  isOpen,
  onClose,
  type,
  trades,
  positions,
  accountBalance,
  initialCapital,
  onUpdateCapital,
}: DataModalProps) {
  const [isEditingCapital, setIsEditingCapital] = useState(false);
  const [editCapitalValue, setEditCapitalValue] = useState('');
  const [savingCapital, setSavingCapital] = useState(false);
  const [chartPosition, setChartPosition] = useState<Position | null>(null);
  const [chartData, setChartData] = useState<ChartCandle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<ReturnType<typeof createChart> | null>(null);

  const openChart = useCallback(async (position: Position) => {
    if (position.status !== 'CLOSED') return;
    const exitDate = position.exitDate ? new Date(position.exitDate) : null;
    if (!exitDate || !position.avgExitPrice) {
      setChartError('缺少平倉資訊');
      return;
    }
    setChartPosition(position);
    setChartError(null);
    setChartData([]);
    setChartLoading(true);
    const entryDate = new Date(position.entryDate);
    const padStart = new Date(entryDate);
    padStart.setDate(padStart.getDate() - 30);
    const padEnd = new Date(exitDate);
    padEnd.setDate(padEnd.getDate() + 10);
    const startStr = padStart.toLocaleDateString('sv');
    const endStr = padEnd.toLocaleDateString('sv');
    const market = getStockMarketByCode(position.stockCode);
    try {
      const params = new URLSearchParams({
        code: position.stockCode,
        start_date: startStr,
        end_date: endStr,
      });
      if (market) params.set('market', market);
      const res = await fetch(`/api/stock-price?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || '取得歷史資料失敗');
      }
      const raw = json.data || [];
      if (raw.length === 0) {
        const dbg = json.debug as { stockCode?: string; market?: string; sourcesTried?: string[] } | undefined;
        const msg = dbg
          ? `無法取得歷史資料（${dbg.stockCode ?? position.stockCode} ${dbg.market ?? market ?? '未知'}，已嘗試 ${(dbg.sourcesTried ?? []).join('、')}）`
          : '無法取得歷史資料（證交所 / 櫃買 / Yahoo 皆無資料）';
        throw new Error(msg);
      }
      const entryStr = entryDate.toLocaleDateString('sv');
      const exitStr = exitDate.toLocaleDateString('sv');
      const data: ChartCandle[] = raw
        .map((d: { date?: string; open?: number | null; high?: number | null; low?: number | null; close?: number | null }) => {
          const o = d.open != null ? Number(d.open) : NaN;
          const h = d.high != null ? Number(d.high) : NaN;
          const l = d.low != null ? Number(d.low) : NaN;
          const c = d.close != null ? Number(d.close) : NaN;
          if (!d.date || isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) return null;
          const candle: ChartCandle = { date: d.date, open: o, high: h, low: l, close: c };
          if (d.date === entryStr) candle.entry = position.avgEntryPrice;
          if (d.date === exitStr) candle.exit = position.avgExitPrice!;
          return candle;
        })
        .filter((c: ChartCandle | null): c is ChartCandle => c != null);
      if (data.length === 0) {
        throw new Error('無有效的歷史資料');
      }
      setChartData(data);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setChartLoading(false);
    }
  }, []);

  const closeChart = useCallback(() => {
    setChartPosition(null);
    setChartData([]);
    setChartError(null);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;
    chartInstanceRef.current?.remove();
    chartInstanceRef.current = null;
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 280,
      layout: { background: { color: '#111827' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#374151' }, horzLines: { color: '#374151' } },
      rightPriceScale: { borderColor: '#4b5563', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#4b5563', timeVisible: true, secondsVisible: false },
    });
    chartInstanceRef.current = chart;
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#22c55e',
      borderUpColor: '#ef4444',
      borderDownColor: '#22c55e',
    });
    const validData = chartData
      .map(d => {
        const o = Number(d.open);
        const h = Number(d.high);
        const l = Number(d.low);
        const c = Number(d.close);
        if (!d.date || isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) return null;
        return { time: d.date, open: o, high: h, low: l, close: c };
      })
      .filter((d): d is NonNullable<typeof d> => d != null);
    if (validData.length > 0) candlestickSeries.setData(validData);
    const markers: { time: string; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }[] = [];
    const entryCandle = chartData.find(d => d.entry != null);
    if (entryCandle) markers.push({ time: entryCandle.date, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: `進場 ${chartPosition?.avgEntryPrice?.toLocaleString() ?? ''}` });
    const exitCandle = chartData.find(d => d.exit != null);
    if (exitCandle) markers.push({ time: exitCandle.date, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: `出場 ${chartPosition?.avgExitPrice?.toLocaleString() ?? ''}` });
    if (markers.length) createSeriesMarkers(candlestickSeries, markers);
    chart.timeScale().fitContent();
    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth ?? 400 });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, [chartData, chartPosition]);

  // ESC 鍵關閉
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (chartPosition) {
          closeChart();
        } else if (isEditingCapital) {
          setIsEditingCapital(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isEditingCapital, chartPosition, closeChart]);

  // 開始編輯時，設定初始值
  const handleStartEdit = () => {
    setEditCapitalValue(initialCapital.toString());
    setIsEditingCapital(true);
  };

  // 取消編輯
  const handleCancelEdit = () => {
    setIsEditingCapital(false);
    setEditCapitalValue('');
  };

  // 儲存初始資金
  const handleSaveCapital = async () => {
    const newCapital = Number(editCapitalValue);
    if (isNaN(newCapital) || newCapital < 0) {
      return;
    }

    if (onUpdateCapital) {
      setSavingCapital(true);
      try {
        await onUpdateCapital(newCapital);
        setIsEditingCapital(false);
        setEditCapitalValue('');
      } finally {
        setSavingCapital(false);
      }
    }
  };

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

  // 計算月度統計（依平倉月份，無 exitDate 時用 entryDate）
  const calculateMonthlyStats = () => {
    type Pos = Position & { exitDate?: string | Date; holdingDays?: number | null };
    const closed = positions.filter(p => p.status === 'CLOSED') as Pos[];
    const monthlyData: {
      [key: string]: {
        trades: number;
        pnl: number;
        wins: number;
        losses: number;
        winReturnRates: number[];
        lossReturnRates: number[];
        holdingDaysWin: number[];
        holdingDaysLoss: number[];
      };
    } = {};

    closed.forEach(position => {
      const exitOrEntry = position.exitDate ? new Date(position.exitDate) : new Date(position.entryDate);
      const monthKey = `${exitOrEntry.getFullYear()}-${String(exitOrEntry.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          trades: 0,
          pnl: 0,
          wins: 0,
          losses: 0,
          winReturnRates: [],
          lossReturnRates: [],
          holdingDaysWin: [],
          holdingDaysLoss: [],
        };
      }
      const row = monthlyData[monthKey];
      row.trades++;
      const pnl = position.totalPnL ?? 0;
      const rate = position.returnRate ?? null;
      row.pnl += pnl;
      const days = position.holdingDays ?? null;
      if (pnl > 0) {
        row.wins++;
        if (rate != null) row.winReturnRates.push(rate);
        if (days != null) row.holdingDaysWin.push(days);
      } else if (pnl < 0) {
        row.losses++;
        if (rate != null) row.lossReturnRates.push(rate);
        if (days != null) row.holdingDaysLoss.push(days);
      }
    });

    const map: Record<string, {
      trades: number;
      pnl: number;
      avgWinPct: number | null;
      avgLossPct: number | null;
      maxWinPct: number | null;
      maxLossPct: number | null;
      winRate: number;
      avgHoldingWin: number | null;
      avgHoldingLoss: number | null;
    }> = {};
    Object.entries(monthlyData).forEach(([month, d]) => {
      const avgWinPct = d.winReturnRates.length > 0 ? d.winReturnRates.reduce((a, b) => a + b, 0) / d.winReturnRates.length : null;
      const avgLossPct = d.lossReturnRates.length > 0 ? d.lossReturnRates.reduce((a, b) => a + b, 0) / d.lossReturnRates.length : null;
      const maxWinPct = d.winReturnRates.length > 0 ? Math.max(...d.winReturnRates) : null;
      const maxLossPct = d.lossReturnRates.length > 0 ? Math.min(...d.lossReturnRates) : null;
      const winRate = d.trades > 0 ? (d.wins / d.trades) * 100 : 0;
      const avgHoldingWin = d.holdingDaysWin.length > 0 ? d.holdingDaysWin.reduce((a, b) => a + b, 0) / d.holdingDaysWin.length : null;
      const avgHoldingLoss = d.holdingDaysLoss.length > 0 ? d.holdingDaysLoss.reduce((a, b) => a + b, 0) / d.holdingDaysLoss.length : null;
      map[month] = { trades: d.trades, pnl: d.pnl, avgWinPct, avgLossPct, maxWinPct, maxLossPct, winRate, avgHoldingWin, avgHoldingLoss };
    });
    return map;
  };

  // 產生要顯示的月份列表（今年、去年各 12 月，新到舊）
  const getMonthList = () => {
    const now = new Date();
    const months: string[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
      for (let m = 12; m >= 1; m--) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }
    return months;
  };

  const renderContent = () => {
    const performance = calculatePerformance();
    
    switch (type) {
      case 'trades':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-800">
                <div className="text-sm text-gray-400">總交易筆數</div>
                <div className="text-3xl font-bold text-blue-400">{trades.length}</div>
              </div>
              <div className="bg-green-900/30 rounded-lg p-4 border border-green-800">
                <div className="text-sm text-gray-400">買入交易</div>
                <div className="text-3xl font-bold text-green-400">
                  {trades.filter(t => t.tradeType === 'BUY').length}
                </div>
              </div>
              <div className="bg-red-900/30 rounded-lg p-4 border border-red-800">
                <div className="text-sm text-gray-400">賣出交易</div>
                <div className="text-3xl font-bold text-red-400">
                  {trades.filter(t => t.tradeType === 'SELL').length}
                </div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-800">
                <div className="text-sm text-gray-400">總手續費</div>
                <div className="text-2xl font-bold text-purple-400">
                  {trades.reduce((sum, t) => sum + t.commission, 0).toLocaleString()} 元
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className="font-semibold text-gray-200 mb-3">最近交易</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {trades.slice(0, 10).map(trade => (
                  <div key={trade.id} className="bg-gray-800 rounded p-3 text-sm border border-gray-700">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-gray-200">{trade.stockCode}</span>
                        {trade.stockName && <span className="text-gray-400 ml-2">{trade.stockName}</span>}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.tradeType === 'BUY' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                      }`}>
                        {trade.tradeType === 'BUY' ? '買入' : '賣出'}
                      </span>
                    </div>
                    <div className="text-gray-400 mt-1">
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
              <div className="bg-gradient-to-br from-green-900/30 to-green-900/50 rounded-lg p-4 border border-green-800">
                <div className="text-sm text-gray-400">勝率</div>
                <div className="text-3xl font-bold text-green-400">{performance.winRate}%</div>
                <div className="text-xs text-gray-500 mt-1">
                  {performance.closedPositions.filter(p => (p.totalPnL || 0) > 0).length} 勝 / 
                  {performance.closedPositions.length} 場
                </div>
              </div>
              
              <div className={`rounded-lg p-4 border ${
                performance.totalPnL >= 0 
                  ? 'bg-gradient-to-br from-blue-900/30 to-blue-900/50 border-blue-800' 
                  : 'bg-gradient-to-br from-red-900/30 to-red-900/50 border-red-800'
              }`}>
                <div className="text-sm text-gray-400">總損益</div>
                <div className={`text-3xl font-bold ${performance.totalPnL >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {performance.totalPnL >= 0 ? '+' : ''}{performance.totalPnL.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  報酬率：{((performance.totalPnL / initialCapital) * 100).toFixed(2)}%
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-900/50 rounded-lg p-4 border border-purple-800">
                <div className="text-sm text-gray-400">平均獲利</div>
                <div className="text-2xl font-bold text-purple-400">
                  +{performance.avgWin.toLocaleString()} 元
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-orange-900/30 to-orange-900/50 rounded-lg p-4 border border-orange-800">
                <div className="text-sm text-gray-400">平均虧損</div>
                <div className="text-2xl font-bold text-orange-400">
                  -{performance.avgLoss.toLocaleString()} 元
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-900/50 rounded-lg p-4 border border-indigo-800 col-span-2">
                <div className="text-sm text-gray-400">盈虧比率</div>
                <div className="text-3xl font-bold text-indigo-400">{performance.profitRatio}</div>
                <div className="text-xs text-gray-500 mt-1">
                  平均獲利 / 平均虧損
                </div>
              </div>
            </div>
          </div>
        );

      case 'funds':
        // ===== 從交易記錄核算資金 =====
        const buyTrades = trades.filter(t => t.tradeType === 'BUY');
        const sellTrades = trades.filter(t => t.tradeType === 'SELL');
        
        // 買入總支出（成交金額 + 手續費）
        const totalBuyCost = buyTrades.reduce((sum, t) => sum + t.amount + t.commission, 0);
        // 賣出總收入（成交金額 - 手續費 - 交易稅）
        const totalSellIncome = sellTrades.reduce((sum, t) => sum + t.amount - t.commission - t.tax, 0);
        
        // 持倉成本（開倉部位）- 使用 totalInvested（含手續費）
        const openPositions = positions.filter(p => p.status === 'OPEN');
        // 優先使用 totalInvested（含手續費），否則用成交金額估算
        const holdingCost = openPositions.reduce((sum, p) => {
          return sum + (p.totalInvested ?? (p.avgEntryPrice * p.totalQuantity));
        }, 0);
        
        // 已實現損益（已平倉部位）
        const closedPositions = positions.filter(p => p.status === 'CLOSED');
        const realizedPnL = closedPositions.reduce((sum, p) => sum + (p.totalPnL || 0), 0);
        
        // 根據交易記錄計算的預期餘額
        const expectedBalance = initialCapital - totalBuyCost + totalSellIncome;
        
        // 差異金額
        const balanceDiff = Math.round((accountBalance - expectedBalance) * 100) / 100;
        const isBalanceMatch = Math.abs(balanceDiff) < 1; // 允許 1 元誤差
        
        // 總報酬率
        const returnRate = ((accountBalance - initialCapital) / initialCapital * 100).toFixed(2);
        
        return (
          <div className="space-y-4">
            {/* 基本資金資訊 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-800 relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-400">
                    投資預算
                    <span className="text-xs text-gray-500 ml-1">(預期投入)</span>
                  </div>
                  {!isEditingCapital && (
                    <button
                      onClick={handleStartEdit}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-900/50 transition-colors"
                    >
                      ✏️ 編輯
                    </button>
                  )}
                </div>
                {isEditingCapital ? (
                  <div className="space-y-2">
                    <input
                      type="number"
                      value={editCapitalValue}
                      onChange={(e) => setEditCapitalValue(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入預期投入的資金"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveCapital}
                        disabled={savingCapital || !editCapitalValue || Number(editCapitalValue) < 0}
                        className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
                      >
                        {savingCapital ? '儲存中...' : '✓ 儲存'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingCapital}
                        className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:cursor-not-allowed text-gray-300 text-sm font-medium rounded transition-colors"
                      >
                        ✕ 取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-3xl font-bold text-blue-400">
                    {initialCapital.toLocaleString()} 元
                  </div>
                )}
              </div>
              <div className={`rounded-lg p-4 border ${
                accountBalance >= initialCapital ? 'bg-green-900/30 border-green-800' : 'bg-red-900/30 border-red-800'
              }`}>
                <div className="text-sm text-gray-400">當前餘額</div>
                <div className={`text-3xl font-bold ${
                  accountBalance >= initialCapital ? 'text-green-400' : 'text-red-400'
                }`}>
                  {accountBalance.toLocaleString()} 元
                </div>
              </div>
              <div className={`rounded-lg p-4 col-span-2 border ${
                Number(returnRate) >= 0 ? 'bg-green-900/30 border-green-800' : 'bg-red-900/30 border-red-800'
              }`}>
                <div className="text-sm text-gray-400">總報酬率</div>
                <div className={`text-4xl font-bold ${
                  Number(returnRate) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {Number(returnRate) >= 0 ? '+' : ''}{returnRate}%
                </div>
                <div className="text-sm text-gray-500 mt-2">
                  {Number(returnRate) >= 0 ? '獲利' : '虧損'}：
                  {(accountBalance - initialCapital).toLocaleString()} 元
                </div>
              </div>
            </div>

            {/* 持倉與已實現損益 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-orange-900/30 rounded-lg p-4 border border-orange-800">
                <div className="text-sm text-gray-400">持倉成本</div>
                <div className="text-2xl font-bold text-orange-400">
                  {Math.round(holdingCost).toLocaleString()} 元
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {openPositions.length} 個持倉部位
                </div>
                <div className="mt-2 text-sm">
                  <span className="text-gray-400">佔投資預算 </span>
                  <span className={`font-semibold ${
                    (holdingCost / initialCapital) > 0.8 ? 'text-red-400' : 
                    (holdingCost / initialCapital) > 0.5 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {((holdingCost / initialCapital) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className={`rounded-lg p-4 border ${
                realizedPnL >= 0 ? 'bg-green-900/30 border-green-800' : 'bg-red-900/30 border-red-800'
              }`}>
                <div className="text-sm text-gray-400">已實現損益</div>
                <div className={`text-2xl font-bold ${realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {realizedPnL >= 0 ? '+' : ''}{Math.round(realizedPnL).toLocaleString()} 元
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {closedPositions.length} 筆已平倉
                </div>
              </div>
            </div>

            {/* 持倉明細 */}
            {openPositions.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-sm font-semibold text-gray-300 mb-3">📊 持倉佔比明細</div>
                <div className="space-y-3">
                  {openPositions.map(pos => {
                    const posCost = pos.avgEntryPrice * pos.totalQuantity;
                    const posPercent = (posCost / initialCapital) * 100;
                    return (
                      <div key={pos.id} className="flex items-center gap-3">
                        <div className="w-24 flex-shrink-0">
                          <div className="font-semibold text-gray-200">{pos.stockCode}</div>
                          {pos.stockName && (
                            <div className="text-xs text-gray-500 truncate">{pos.stockName}</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-500 ${
                                  posPercent > 20 ? 'bg-red-500' : 
                                  posPercent > 10 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(posPercent, 100)}%` }}
                              />
                            </div>
                            <div className={`w-16 text-right text-sm font-semibold ${
                              posPercent > 20 ? 'text-red-400' : 
                              posPercent > 10 ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                              {posPercent.toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {pos.totalQuantity.toLocaleString()} 股 × {pos.avgEntryPrice.toLocaleString()} 元 = {Math.round(posCost).toLocaleString()} 元
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* 風險提示 */}
                {(holdingCost / initialCapital) > 0.5 && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${
                    (holdingCost / initialCapital) > 0.8 
                      ? 'bg-red-900/30 border border-red-800 text-red-300'
                      : 'bg-yellow-900/30 border border-yellow-800 text-yellow-300'
                  }`}>
                    {(holdingCost / initialCapital) > 0.8 
                      ? '⚠️ 持倉比例過高（超過 80%），風險較大，建議適度減倉'
                      : '💡 持倉比例偏高（超過 50%），請注意風險控管'
                    }
                  </div>
                )}
              </div>
            )}

            {/* 資產平衡核對 - 餘額 + 持倉 = 投資預算 + 損益 */}
            {(() => {
              // 資產平衡公式：當前餘額 + 持倉成本 = 投資預算 + 已實現損益
              const totalAssets = accountBalance + holdingCost;
              const expectedAssets = initialCapital + realizedPnL;
              const assetsDiff = Math.round((totalAssets - expectedAssets) * 100) / 100;
              const isAssetsMatch = Math.abs(assetsDiff) < 1;
              
              return (
                <div className={`rounded-lg p-4 border ${
                  isAssetsMatch ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-700'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{isAssetsMatch ? '✅' : '❌'}</span>
                    <div className="text-sm font-semibold text-gray-300">資產平衡核對（餘額 + 持倉）</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {/* 左側：實際資產 */}
                    <div className="space-y-2">
                      <div className="text-gray-400 font-medium border-b border-gray-700 pb-1">實際資產</div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">當前餘額</span>
                        <span className="text-gray-200">{accountBalance.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">+ 持倉成本</span>
                        <span className="text-orange-400">{Math.round(holdingCost).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t border-gray-700 pt-1">
                        <span className="text-gray-300">= 總資產</span>
                        <span className="text-white">{Math.round(totalAssets).toLocaleString()} 元</span>
                      </div>
                    </div>
                    
                    {/* 右側：預期資產 */}
                    <div className="space-y-2">
                      <div className="text-gray-400 font-medium border-b border-gray-700 pb-1">預期資產</div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">投資預算</span>
                        <span className="text-blue-400">{initialCapital.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">+ 已實現損益</span>
                        <span className={realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {realizedPnL >= 0 ? '+' : ''}{Math.round(realizedPnL).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold border-t border-gray-700 pt-1">
                        <span className="text-gray-300">= 預期總資產</span>
                        <span className="text-white">{Math.round(expectedAssets).toLocaleString()} 元</span>
                      </div>
                    </div>
                  </div>
                  
                  {isAssetsMatch ? (
                    <div className="mt-3 text-xs text-green-400">
                      ✓ 資產平衡正確：餘額 + 持倉成本 = 投資預算 + 已實現損益
                    </div>
                  ) : (
                    <div className="mt-3 p-2 bg-red-900/30 rounded text-xs text-red-300">
                      ❌ 資產不平衡，差異 {assetsDiff >= 0 ? '+' : ''}{assetsDiff.toLocaleString()} 元
                      <br />
                      可能原因：交易記錄遺漏、重複記錄、或持倉計算錯誤
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 交易記錄核對 */}
            <div className={`rounded-lg p-4 border ${
              isBalanceMatch ? 'bg-green-900/20 border-green-800' : 'bg-yellow-900/20 border-yellow-700'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{isBalanceMatch ? '✅' : '⚠️'}</span>
                <div className="text-sm font-semibold text-gray-300">交易記錄核對</div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">買入總支出</span>
                  <span className="text-red-400">-{Math.round(totalBuyCost).toLocaleString()} 元</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">賣出總收入</span>
                  <span className="text-green-400">+{Math.round(totalSellIncome).toLocaleString()} 元</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="text-gray-400">預期餘額</span>
                  <span className="text-gray-200 font-semibold">
                    {Math.round(expectedBalance).toLocaleString()} 元
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">系統餘額</span>
                  <span className="text-gray-200 font-semibold">
                    {accountBalance.toLocaleString()} 元
                  </span>
                </div>
                {!isBalanceMatch && (
                  <div className="flex justify-between text-yellow-400">
                    <span>差異</span>
                    <span className="font-semibold">
                      {balanceDiff >= 0 ? '+' : ''}{balanceDiff.toLocaleString()} 元
                    </span>
                  </div>
                )}
              </div>
              
              {isBalanceMatch ? (
                <div className="mt-3 text-xs text-green-400">
                  ✓ 資金記錄與交易記錄一致
                </div>
              ) : (
                <div className="mt-3 text-xs text-yellow-400">
                  ⚠ 資金記錄與交易記錄有差異，可能需要調整投資預算或檢查交易記錄
                </div>
              )}
            </div>

            {/* 資金流向明細 */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-sm font-semibold text-gray-300 mb-3">💹 資金流向</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">投資預算</span>
                  <span className="text-blue-400 font-mono">{initialCapital.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">− 買入成交金額</span>
                  <span className="text-gray-300 font-mono">
                    {buyTrades.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">− 買入手續費</span>
                  <span className="text-gray-300 font-mono">
                    {Math.round(buyTrades.reduce((sum, t) => sum + t.commission, 0)).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">+ 賣出成交金額</span>
                  <span className="text-gray-300 font-mono">
                    {sellTrades.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">− 賣出手續費</span>
                  <span className="text-gray-300 font-mono">
                    {Math.round(sellTrades.reduce((sum, t) => sum + t.commission, 0)).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">− 交易稅</span>
                  <span className="text-gray-300 font-mono">
                    {Math.round(sellTrades.reduce((sum, t) => sum + t.tax, 0)).toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-gray-600 pt-2 flex justify-between items-center">
                  <span className="text-gray-300 font-semibold">= 預期餘額</span>
                  <span className="text-white font-mono font-bold">
                    {Math.round(expectedBalance).toLocaleString()} 元
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'positions':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-orange-900/30 rounded-lg p-4 border border-orange-800">
                <div className="text-sm text-gray-400">持倉中</div>
                <div className="text-3xl font-bold text-orange-400">
                  {positions.filter(p => p.status === 'OPEN').length}
                </div>
              </div>
              <div className="bg-green-900/30 rounded-lg p-4 border border-green-800">
                <div className="text-sm text-gray-400">已平倉</div>
                <div className="text-3xl font-bold text-green-400">
                  {positions.filter(p => p.status === 'CLOSED').length}
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className="font-semibold text-gray-200 mb-3">持倉部位</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {positions.filter(p => p.status === 'OPEN').map(position => (
                  <div key={position.id} className="bg-orange-900/30 rounded p-3 border border-orange-800">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-lg text-gray-200">{position.stockCode}</span>
                        {position.stockName && (
                          <span className="text-gray-400 ml-2">{position.stockName}</span>
                        )}
                      </div>
                      <span className="px-2 py-1 bg-orange-900/50 text-orange-400 rounded text-xs font-semibold">
                        持倉中
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 mt-2 flex flex-wrap gap-x-3">
                      <span>成本：{position.avgEntryPrice.toLocaleString()} 元</span>
                      <span>股數：{position.totalQuantity.toLocaleString()} 股</span>
                      <span className="text-red-400 font-medium">
                        停損：{(position.stopLossPrice || Math.round(position.avgEntryPrice * 0.92 * 100) / 100).toLocaleString()} 元
                      </span>
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
              <h4 className="font-semibold text-gray-200 mb-3">已平倉部位</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {positions.filter(p => p.status === 'CLOSED').map(position => (
                  <div key={position.id} className={`rounded p-3 border ${
                    (position.totalPnL || 0) >= 0 
                      ? 'bg-green-900/30 border-green-800' 
                      : 'bg-red-900/30 border-red-800'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-lg text-gray-200">{position.stockCode}</span>
                        {position.stockName && (
                          <span className="text-gray-400 ml-2">{position.stockName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openChart(position)}
                          className="px-2 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors flex items-center gap-1"
                          title="查看日線圖（進出場標註）"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                          </svg>
                          日線圖
                        </button>
                        <span className={`text-lg font-bold ${
                          (position.totalPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {(position.totalPnL || 0) >= 0 ? '+' : ''}
                          {(position.totalPnL || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
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

      case 'rvalue':
        const closedWithR = positions.filter(p => p.status === 'CLOSED');
        const positionsWithR = closedWithR.filter(p => p.rValue !== null);
        const avgRValue = positionsWithR.length > 0
          ? positionsWithR.reduce((sum, p) => sum + (p.rValue || 0), 0) / positionsWithR.length
          : null;
        const positiveRCount = positionsWithR.filter(p => (p.rValue || 0) > 0).length;
        const negativeRCount = positionsWithR.filter(p => (p.rValue || 0) < 0).length;
        const positiveRRate = positionsWithR.length > 0 
          ? (positiveRCount / positionsWithR.length * 100).toFixed(1)
          : '0.0';

        // R 值分布
        const rRanges = [
          { min: -Infinity, max: -2, label: '< -2R', color: 'bg-red-600' },
          { min: -2, max: -1, label: '-2R ~ -1R', color: 'bg-red-400' },
          { min: -1, max: 0, label: '-1R ~ 0R', color: 'bg-orange-400' },
          { min: 0, max: 1, label: '0R ~ 1R', color: 'bg-yellow-400' },
          { min: 1, max: 2, label: '1R ~ 2R', color: 'bg-green-400' },
          { min: 2, max: 3, label: '2R ~ 3R', color: 'bg-green-500' },
          { min: 3, max: Infinity, label: '> 3R', color: 'bg-green-600' },
        ];
        const rDistribution = rRanges.map(range => ({
          ...range,
          count: positionsWithR.filter(p => (p.rValue || 0) >= range.min && (p.rValue || 0) < range.max).length,
        }));

        return (
          <div className="space-y-6">
            {/* R 值說明 */}
            <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 text-sm">
              <h4 className="font-semibold text-blue-400 mb-2">📚 什麼是 R 值？</h4>
              <p className="text-blue-300 mb-2">
                <strong>R 值 = 實際損益 ÷ 預計停損金額</strong>
              </p>
              <ul className="list-disc list-inside text-blue-400 space-y-1">
                <li><strong>1R</strong> = 賺取 1 倍停損金額（例如：停損設 1000 元，實際賺 1000 元）</li>
                <li><strong>-1R</strong> = 虧損等於停損金額（嚴格執行停損）</li>
                <li><strong>2R, 3R</strong> = 獲利是風險的 2 倍、3 倍（優質交易）</li>
              </ul>
            </div>

            {positionsWithR.length > 0 ? (
              <>
                {/* R 值統計 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-900/50 rounded-lg p-4 border border-indigo-800">
                    <div className="text-sm text-gray-400">平均 R 值</div>
                    <div className={`text-3xl font-bold ${(avgRValue || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {avgRValue !== null ? `${avgRValue >= 0 ? '+' : ''}${avgRValue.toFixed(2)}R` : '--'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {positionsWithR.length} 筆交易有 R 值
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-900/30 to-green-900/50 rounded-lg p-4 border border-green-800">
                    <div className="text-sm text-gray-400">正 R 值比例</div>
                    <div className="text-3xl font-bold text-green-400">{positiveRRate}%</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {positiveRCount} 勝 / {negativeRCount} 敗
                    </div>
                  </div>
                </div>

                {/* R 值分布圖 */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <h4 className="font-semibold text-gray-200 mb-4">R 值分布</h4>
                  <div className="space-y-2">
                    {rDistribution.map((range) => (
                      <div key={range.label} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-gray-400">{range.label}</div>
                        <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
                          <div 
                            className={`h-full ${range.color} transition-all duration-500`}
                            style={{ width: `${positionsWithR.length > 0 ? (range.count / positionsWithR.length) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="w-12 text-right text-sm font-semibold text-gray-300">
                          {range.count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* R 值交易列表 */}
                <div>
                  <h4 className="font-semibold text-gray-200 mb-3">交易 R 值記錄</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {positionsWithR.slice(0, 10).map(position => (
                      <div key={position.id} className={`rounded p-3 border ${
                        (position.rValue || 0) >= 0 
                          ? 'bg-green-900/30 border-green-800' 
                          : 'bg-red-900/30 border-red-800'
                      }`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-gray-200">{position.stockCode}</span>
                            {position.stockName && <span className="text-gray-400 ml-2">{position.stockName}</span>}
                          </div>
                          <span className={`text-lg font-bold ${
                            (position.rValue || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {(position.rValue || 0) >= 0 ? '+' : ''}{(position.rValue || 0).toFixed(2)}R
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          損益：{(position.totalPnL || 0) >= 0 ? '+' : ''}{(position.totalPnL || 0).toLocaleString()} 元
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-xl font-semibold text-gray-200 mb-2">尚無 R 值資料</h3>
                <p className="text-gray-400 mb-4">
                  R 值需要在<strong className="text-gray-300">買入時設定停損金額</strong>才能計算
                </p>
                <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 text-sm text-left max-w-md mx-auto">
                  <h4 className="font-semibold text-yellow-400 mb-2">如何產生 R 值資料？</h4>
                  <ol className="list-decimal list-inside text-yellow-500 space-y-1">
                    <li>新增買入交易時，系統會自動計算停損價（買入價 × 92%）</li>
                    <li>停損金額 = (買入價 - 停損價) × 股數</li>
                    <li>平倉後，R 值 = 實際損益 ÷ 停損金額</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        );

      case 'monthly': {
        const monthlyStatsMap = calculateMonthlyStats();
        const monthList = getMonthList();
        const th = "px-3 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-800 border-b border-gray-700 whitespace-nowrap";
        const td = "px-3 py-2 text-sm text-gray-300 border-b border-gray-700/80 whitespace-nowrap";
        const tdEmpty = "px-3 py-2 text-sm text-gray-500 border-b border-gray-700/80";
        return (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto rounded-lg border border-gray-700">
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-gray-800">
                <tr>
                  <th className={th}>月份</th>
                  <th className={th}>總損益</th>
                  <th className={th}>交易總比數</th>
                  <th className={th}>勝率</th>
                  <th className={th}>平均獲利</th>
                  <th className={th}>平均虧損</th>
                  <th className={th}>最大獲利</th>
                  <th className={th}>最大虧損</th>
                  <th className={th}>成功平均持有天數</th>
                  <th className={th}>失敗平均持有天數</th>
                </tr>
              </thead>
              <tbody>
                {monthList.map((month) => {
                  const s = monthlyStatsMap[month];
                  return (
                    <tr key={month} className="hover:bg-gray-800/50">
                      <td className={td + ' font-medium text-gray-200'}>{month}</td>
                      <td className={s ? td : tdEmpty}>
                        {s ? (
                          <span className={s.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {s.pnl >= 0 ? '+' : ''}{s.pnl.toLocaleString()}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={s ? td : tdEmpty}>{s ? s.trades : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s ? `${s.winRate.toFixed(1)}%` : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s && s.avgWinPct != null ? `+${s.avgWinPct.toFixed(2)}%` : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s && s.avgLossPct != null ? `${s.avgLossPct.toFixed(2)}%` : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s && s.maxWinPct != null ? `+${s.maxWinPct.toFixed(2)}%` : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s && s.maxLossPct != null ? `${s.maxLossPct.toFixed(2)}%` : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s && s.avgHoldingWin != null ? `${s.avgHoldingWin.toFixed(1)} 天` : '—'}</td>
                      <td className={s ? td : tdEmpty}>{s && s.avgHoldingLoss != null ? `${s.avgHoldingLoss.toFixed(1)} 天` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }

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
        className="absolute inset-0 bg-black bg-opacity-70 transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-gray-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        <div className="sticky top-0 bg-gradient-to-r from-gray-800 to-gray-900 text-white p-6 rounded-t-lg z-10 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{getTitle()}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 relative">
          {renderContent()}

          {chartPosition && (
            <div className="absolute inset-0 top-0 left-0 right-0 bottom-0 bg-gray-900 z-20 rounded-lg border border-gray-700 flex flex-col -m-6 p-6">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-200">
                  {chartPosition.stockCode} {chartPosition.stockName || ''} 日線圖
                </h4>
                <button
                  type="button"
                  onClick={closeChart}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-[180px]">
                {chartLoading && (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    載入中...
                  </div>
                )}
                {chartError && (
                  <div className="flex items-center justify-center h-full text-red-400">
                    {chartError}
                  </div>
                )}
                {!chartLoading && !chartError && chartData.length > 0 && (
                  <div ref={chartContainerRef} className="w-full" style={{ height: 280 }} />
                )}
              </div>
              {!chartLoading && !chartError && chartData.length > 0 && chartPosition && (
                <div className="flex gap-4 mt-2 text-sm text-gray-400">
                  <span>進場：{new Date(chartPosition.entryDate).toLocaleDateString('zh-TW')} @ {chartPosition.avgEntryPrice.toLocaleString()}</span>
                  <span>出場：{chartPosition.exitDate ? new Date(chartPosition.exitDate).toLocaleDateString('zh-TW') : '-'} @ {(chartPosition.avgExitPrice ?? 0).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-800 px-6 py-4 rounded-b-lg border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
