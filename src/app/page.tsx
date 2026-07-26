'use client';

import { useState, useEffect, useMemo } from 'react';
import TradeForm from '@/components/TradeForm';
import type { TradeFormData } from '@/components/TradeForm';
import DataModal from '@/components/DataModal';
import AIAnalysisModal from '@/components/AIAnalysisModal';
import PositionsTable, { effectiveAvgEntryPrice } from '@/components/PositionsTable';
import type { Trade, Position, StockPrice } from '@/lib/types';
import { calculateTrailingStop, calculateUnrealizedPnL } from '@/lib/types';
import { DEFAULT_STOP_LOSS_PERCENT } from '@/lib/tradeCalculations';

const ACCOUNT_ID = 'cmj47funv00007jwbtrkd22t9';

// 台股慣例：漲紅跌綠（正為紅、負為綠）
const pnlText = (v: number) => (v >= 0 ? 'text-red-400' : 'text-green-400');
const sign = (v: number) => (v >= 0 ? '+' : '');

type FeatureKey = 'trades' | 'performance' | 'funds' | 'positions' | 'rvalue' | 'monthly';

export default function HomePage() {
  const [showForm, setShowForm] = useState(false);
  const [activeMarket, setActiveMarket] = useState<'TW' | 'US'>('TW');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey | null>(null);
  const [accountBalance, setAccountBalance] = useState(100000);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [recalculating, setRecalculating] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [allTWTrades, setAllTWTrades] = useState<Trade[]>([]);
  const [allUSTrades, setAllUSTrades] = useState<Trade[]>([]);
  const [allTWPositions, setAllTWPositions] = useState<Position[]>([]);
  const [allUSPositions, setAllUSPositions] = useState<Position[]>([]);

  // 今日收盤價（改由 page 統一抓取，供 KPI 與持倉表共用）
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);

  const currencySuffix = activeMarket === 'US' ? '美元' : '元';
  const benchmarkCode = activeMarket === 'US' ? 'SPY' : '0050';

  // 顯示訊息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 載入資料
  const loadData = async () => {
    try {
      setLoading(true);
      const timestamp = Date.now();
      const [tradesRes, positionsRes, accountRes] = await Promise.all([
        fetch(`/api/trades?accountId=${ACCOUNT_ID}&market=${activeMarket}&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/positions?accountId=${ACCOUNT_ID}&market=${activeMarket}&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/account?market=${activeMarket}&_t=${timestamp}`, { cache: 'no-store' })
      ]);

      if (tradesRes.ok) setTrades(await tradesRes.json());
      if (positionsRes.ok) setPositions(await positionsRes.json());
      if (accountRes.ok) {
        const data = await accountRes.json();
        setInitialCapital(data.initialCapital || 100000);
        setAccountBalance(data.currentBalance || 100000);
      }
    } catch (error) {
      console.error('載入資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  // 切換市場時清空舊市場的收盤價，避免代號錯置
  useEffect(() => {
    setStockPrices({});
    setPricesFetchedAt(null);
    loadData();
  }, [activeMarket]);

  useEffect(() => {
    if (selectedFeature) loadData();
  }, [selectedFeature]);

  const openPositions = useMemo(() => positions.filter(p => p.status === 'OPEN'), [positions]);
  const closedPositions = useMemo(() => positions.filter(p => p.status === 'CLOSED'), [positions]);

  // 取得今日收盤價 + 追蹤停損只升不降
  const fetchStockPrices = async () => {
    if (openPositions.length === 0) {
      showMessage('error', '目前沒有持倉部位');
      return;
    }
    try {
      setFetchingPrices(true);
      const codes = [...new Set([...openPositions.map(p => p.stockCode), benchmarkCode])].join(',');
      const res = await fetch(`/api/stock-price?codes=${codes}`);
      if (!res.ok) throw new Error('取得收盤價失敗');
      const result = await res.json();
      if (!result.success || !result.data) throw new Error(result.error || '取得收盤價失敗');

      const map: Record<string, StockPrice> = {};
      result.data.forEach((p: StockPrice) => { map[p.stockCode] = p; });
      setStockPrices(map);
      setPricesFetchedAt(
        new Date().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      );

      let updated = 0;
      await Promise.all(openPositions.map(async (position) => {
        const cp = map[position.stockCode]?.closingPrice ?? null;
        if (cp === null) return;
        const avgEntry = effectiveAvgEntryPrice(position);
        const originalStop = position.stopLossPrice ?? Math.round(avgEntry * (1 - DEFAULT_STOP_LOSS_PERCENT) * 100) / 100;
        const trailing = calculateTrailingStop(avgEntry, cp, originalStop);
        if (!trailing || !trailing.isActivated) return;
        if (trailing.stopLossPrice > (position.stopLossPrice ?? 0)) {
          try {
            await fetch(`/api/positions?id=${position.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stopLossPrice: trailing.stopLossPrice }),
            });
            setPositions(prev => prev.map(p => (p.id === position.id ? { ...p, stopLossPrice: trailing.stopLossPrice } : p)));
            updated++;
          } catch (err) {
            console.warn(`${position.stockCode} 追蹤停損更新失敗:`, err);
          }
        }
      }));

      showMessage('success', `✅ 已取得今日收盤價${updated > 0 ? `，已鎖定 ${updated} 檔追蹤停損` : ''}！`);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '取得收盤價失敗');
    } finally {
      setFetchingPrices(false);
    }
  };

  // 進場指標快照：新買進建立部位後，best-effort 抓當下 RS/趨勢/距52週高/量比並寫入部位
  const captureEntrySnapshot = async (stockCode: string, market: 'TW' | 'US') => {
    try {
      const posRes = await fetch(
        `/api/positions?accountId=${ACCOUNT_ID}&market=${market}&stockCode=${encodeURIComponent(stockCode)}&status=OPEN&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!posRes.ok) return;
      const posList: Position[] = await posRes.json();
      const target = posList.find(p => p.rsAtEntry == null && p.trendAtEntry == null);
      if (!target) return;

      const priceRes = await fetch(`/api/stock-price?codes=${encodeURIComponent(stockCode)}`, { cache: 'no-store' });
      if (!priceRes.ok) return;
      const pj = await priceRes.json();
      const row = Array.isArray(pj?.data) ? pj.data[0] : null;
      if (!row) return;

      const snapshot: Record<string, number | string> = {};
      if (typeof row.rsValue === 'number') snapshot.rsAtEntry = row.rsValue;
      if (typeof row.trendAlignment === 'string') snapshot.trendAtEntry = row.trendAlignment;
      if (typeof row.volumeRatio === 'number') snapshot.volRatioAtEntry = row.volumeRatio;
      if (typeof row.closingPrice === 'number' && typeof row.week52High === 'number' && row.week52High > 0) {
        snapshot.pctFrom52wHighAtEntry = (row.closingPrice / row.week52High - 1) * 100;
      }
      if (Object.keys(snapshot).length === 0) return;

      await fetch(`/api/positions?id=${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      await loadData();
    } catch { /* best-effort，失敗不影響交易 */ }
  };

  // ===== KPI 計算 =====
  const kpis = useMemo(() => {
    const holdingCost = openPositions.reduce(
      (s, p) => s + (p.totalInvested ?? p.avgEntryPrice * p.totalQuantity), 0
    );
    const realizedPnL = closedPositions.reduce((s, p) => s + (p.totalPnL || 0), 0);
    const wins = closedPositions.filter(p => (p.totalPnL || 0) > 0);
    const losses = closedPositions.filter(p => (p.totalPnL || 0) < 0);
    const winRate = closedPositions.length ? (wins.length / closedPositions.length) * 100 : null;
    const avgWin = wins.length ? wins.reduce((s, p) => s + (p.totalPnL || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, p) => s + (p.totalPnL || 0), 0) / losses.length) : 0;
    const pnlRatio = avgLoss > 0 ? avgWin / avgLoss : null;
    const rVals = closedPositions.map(p => p.rValue).filter((r): r is number => r != null);
    const avgR = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;
    const expectancy = closedPositions.length ? realizedPnL / closedPositions.length : null;
    const fundUsage = initialCapital > 0 ? (holdingCost / initialCapital) * 100 : 0;
    const totalAssets = accountBalance + holdingCost;

    let unreal = 0;
    let unrealBase = 0;
    let priced = 0;
    // 組合總風險（Portfolio Heat）：Σ 各未平倉部位「若觸及目前停損」的虧損金額 ÷ 權益
    // 停損已鎖到成本之上者，該部位風險視為 0（已保本/鎖利）
    let openRisk = 0;
    openPositions.forEach(p => {
      const avgEntry = effectiveAvgEntryPrice(p);
      const stop = p.stopLossPrice ?? avgEntry * (1 - DEFAULT_STOP_LOSS_PERCENT);
      const risk = (avgEntry - stop) * p.totalQuantity;
      if (risk > 0) openRisk += risk;

      const cp = stockPrices[p.stockCode]?.closingPrice ?? null;
      if (cp == null) return;
      const { amount } = calculateUnrealizedPnL(avgEntry, cp, p.totalQuantity);
      if (amount != null) { unreal += amount; unrealBase += avgEntry * p.totalQuantity; priced++; }
    });
    const equity = totalAssets > 0 ? totalAssets : initialCapital;
    const heatPct = equity > 0 ? (openRisk / equity) * 100 : 0;

    return {
      holdingCost, realizedPnL, winRate, pnlRatio, avgR, expectancy, fundUsage, totalAssets,
      accountBalance,
      winCount: wins.length,
      unreal, unrealPct: unrealBase > 0 ? (unreal / unrealBase) * 100 : null,
      hasPrices: priced > 0,
      openRisk, heatPct,
    };
  }, [openPositions, closedPositions, stockPrices, accountBalance, initialCapital]);

  // 提交交易
  const handleSubmit = async (data: TradeFormData) => {
    try {
      const url = editingTrade ? `/api/trades/${editingTrade.id}` : '/api/trades';
      const method = editingTrade ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          accountId: ACCOUNT_ID,
          market: editingTrade ? ((editingTrade.market as 'TW' | 'US') || 'TW') : activeMarket,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const fieldErrors = errorData.errors as Record<string, string> | undefined;
        const detail =
          fieldErrors && Object.keys(fieldErrors).length > 0
            ? Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v}`).join('；')
            : errorData.error || '操作失敗';
        throw new Error(detail);
      }

      showMessage('success', editingTrade ? '✅ 交易記錄更新成功！' : '✅ 交易記錄新增成功！');
      setEditingTrade(null);
      setShowForm(false);
      try {
        const recalcRes = await fetch('/api/positions/recalculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: ACCOUNT_ID }),
        });
        if (!recalcRes.ok) throw new Error('recalc failed');
      } catch { /* 忽略 */ }
      await loadData();
      // 新買進 → 擷取進場指標快照（不阻塞主流程）
      if (!editingTrade && data.tradeType === 'BUY') {
        captureEntrySnapshot(data.stockCode.trim(), activeMarket);
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '操作失敗');
    }
  };

  const handleEdit = (trade: Trade) => {
    setEditingTrade(trade);
    setActiveMarket((trade.market === 'US' ? 'US' : 'TW'));
    setShowForm(true);
  };

  const handleDelete = async (tradeId: string) => {
    if (!confirm('確定要刪除這筆交易記錄嗎？')) return;
    try {
      setDeletingTradeId(tradeId);
      const response = await fetch(`/api/trades/${tradeId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('刪除失敗');
      showMessage('success', '✅ 交易記錄已刪除！');
      try {
        await fetch('/api/positions/recalculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: ACCOUNT_ID }),
        });
      } catch { /* 忽略 */ }
      await loadData();
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

  const handleUpdateCapital = async (newCapital: number) => {
    try {
      const response = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialCapital: newCapital, market: activeMarket }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '更新失敗');
      }
      const data = await response.json();
      setInitialCapital(data.initialCapital);
      setAccountBalance(data.currentBalance);
      showMessage('success', '✅ 初始資金已更新！');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '更新初始資金失敗');
      throw error;
    }
  };

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
      let balanceMsg = '';
      if (result.balanceRecalculation?.success) {
        const diff = result.balanceRecalculation.difference;
        balanceMsg = Math.abs(diff) > 1
          ? `，餘額已調整 ${diff >= 0 ? '+' : ''}${diff.toLocaleString()} 元`
          : '，餘額無需調整';
      }
      showMessage('success', `✅ ${result.message}，已關聯 ${result.linkedTrades} 筆孤立交易${balanceMsg}`);
      await loadData();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '重新計算失敗');
    } finally {
      setRecalculating(false);
    }
  };

  const handleOpenAIModal = async () => {
    const timestamp = Date.now();
    try {
      const [twTradesRes, usTradesRes, twPosRes, usPosRes] = await Promise.all([
        fetch(`/api/trades?accountId=${ACCOUNT_ID}&market=TW&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/trades?accountId=${ACCOUNT_ID}&market=US&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/positions?accountId=${ACCOUNT_ID}&market=TW&_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/positions?accountId=${ACCOUNT_ID}&market=US&_t=${timestamp}`, { cache: 'no-store' }),
      ]);
      if (twTradesRes.ok) setAllTWTrades(await twTradesRes.json());
      if (usTradesRes.ok) setAllUSTrades(await usTradesRes.json());
      if (twPosRes.ok) setAllTWPositions(await twPosRes.json());
      if (usPosRes.ok) setAllUSPositions(await usPosRes.json());
    } catch { /* use existing data if fetch fails */ }
    setShowAIModal(true);
  };

  const openFeature = async (key: FeatureKey) => {
    await loadData();
    setSelectedFeature(key);
  };

  return (
    <main className="min-h-screen bg-gray-950">
      {/* ===== 頂部工具列 ===== */}
      <header className="sticky top-0 z-20 backdrop-blur bg-gray-950/80 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📈</span>
            <div className="leading-tight">
              <div className="font-extrabold text-gray-100 tracking-tight">股票交易統計</div>
              <div className="text-[11px] text-gray-500 hidden sm:block">專業交易記錄與績效分析</div>
            </div>
          </div>

          <div className="inline-flex bg-gray-900 border border-gray-700 rounded-lg p-0.5" role="group" aria-label="市場">
            {(['TW', 'US'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setActiveMarket(m)}
                aria-pressed={activeMarket === m}
                className={`px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  activeMarket === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchStockPrices}
              disabled={fetchingPrices}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-600 disabled:opacity-60 transition-colors"
            >
              {fetchingPrices ? (
                <>
                  <Spinner /> 取得中…
                </>
              ) : (
                <>📡 取得收盤價</>
              )}
            </button>
            <button
              onClick={handleRecalculatePositions}
              disabled={recalculating}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-600 disabled:opacity-60 transition-colors"
            >
              {recalculating ? (<><Spinner /> 計算中…</>) : (<>🔄 重算部位</>)}
            </button>
            <button
              onClick={handleOpenAIModal}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-transparent text-purple-100 bg-gradient-to-b from-purple-700 to-purple-800 hover:from-purple-600 transition-colors"
            >
              🤖 AI 分析
            </button>
            <button
              onClick={() => { setEditingTrade(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              ➕ 新增交易
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 訊息通知 */}
        {message && (
          <div className={`p-3.5 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-700 text-green-300'
              : 'bg-red-900/50 border border-red-700 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {showForm ? (
          <TradeFormWrapper
            editingTrade={editingTrade}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
            activeMarket={activeMarket}
            onActiveMarketChange={setActiveMarket}
          />
        ) : (
          <>
            {/* ===== 今日總覽 KPI ===== */}
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-bold tracking-widest uppercase text-gray-500">今日總覽</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-800 to-transparent" />
                <span className="text-xs text-gray-500">
                  {pricesFetchedAt ? `更新 ${pricesFetchedAt} · 收盤` : '尚未取得收盤價'}
                </span>
              </div>
              <KpiStrip
                kpis={kpis}
                currencySuffix={currencySuffix}
                closedCount={closedPositions.length}
                onFetchPrices={fetchStockPrices}
              />
            </section>

            {/* ===== 持倉部位 ===== */}
            <PositionsTable
              positions={positions}
              initialCapital={initialCapital}
              currencySuffix={currencySuffix}
              activeMarket={activeMarket}
              stockPrices={stockPrices}
            />

            {/* ===== 分析與紀錄 ===== */}
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-bold tracking-widest uppercase text-gray-500">分析與紀錄</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-800 to-transparent" />
              </div>
              <AnalysisNav
                onSelect={openFeature}
                closedCount={closedPositions.length}
                tradeCount={trades.length}
              />
            </section>

            {/* ===== 交易記錄（可編輯） ===== */}
            {trades.length > 0 ? (
              <TradesTable
                trades={trades}
                onEdit={handleEdit}
                onDelete={handleDelete}
                deletingTradeId={deletingTradeId}
                currencySuffix={currencySuffix}
              />
            ) : (
              !loading && <EmptyState onAdd={() => { setEditingTrade(null); setShowForm(true); }} />
            )}
          </>
        )}
      </div>

      {/* AI 分析 Modal */}
      <AIAnalysisModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        twTrades={allTWTrades}
        usTrades={allUSTrades}
        twPositions={allTWPositions}
        usPositions={allUSPositions}
      />

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
          activeMarket={activeMarket}
          onUpdateCapital={handleUpdateCapital}
          onRefreshData={loadData}
        />
      )}

      <footer className="border-t border-gray-800 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-gray-500 text-sm">
          © 2024 股票交易統計系統 · 祝您交易順利，穩定獲利 📈
        </div>
      </footer>
    </main>
  );
}

// ===== 子元件 =====

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

interface KpiData {
  totalAssets: number;
  accountBalance: number;
  holdingCost: number;
  realizedPnL: number;
  winRate: number | null;
  pnlRatio: number | null;
  avgR: number | null;
  expectancy: number | null;
  fundUsage: number;
  winCount: number;
  unreal: number;
  unrealPct: number | null;
  hasPrices: boolean;
  openRisk: number;
  heatPct: number;
}

function KpiTile({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums">{children}</div>
      {sub && <div className="mt-1 text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

function KpiStrip({
  kpis, currencySuffix, closedCount, onFetchPrices,
}: {
  kpis: KpiData;
  currencySuffix: string;
  closedCount: number;
  onFetchPrices: () => void;
}) {
  const fundColor = kpis.fundUsage > 80 ? 'bg-red-500' : kpis.fundUsage > 50 ? 'bg-amber-500' : 'bg-green-500';
  const fundText = kpis.fundUsage > 80 ? 'text-red-400' : kpis.fundUsage > 50 ? 'text-amber-400' : 'text-green-400';
  // 組合總風險（Heat）常見控在 6~10% 內
  const heatText = kpis.heatPct > 10 ? 'text-red-400' : kpis.heatPct > 6 ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiTile label="總資產" sub={`餘額 ${Math.round(kpis.accountBalance).toLocaleString()} ＋ 持倉 ${Math.round(kpis.holdingCost).toLocaleString()}`}>
        <span className="text-gray-100">{Math.round(kpis.totalAssets).toLocaleString()} <span className="text-sm font-semibold text-gray-500">{currencySuffix}</span></span>
      </KpiTile>

      <KpiTile
        label={<>未實現損益 <span className="text-gray-600">今日</span></>}
        sub={kpis.hasPrices
          ? <span className={pnlText(kpis.unreal)}>{kpis.unrealPct != null ? `${sign(kpis.unrealPct)}${kpis.unrealPct.toFixed(2)}%` : ''} · 持倉浮動</span>
          : <button onClick={onFetchPrices} className="text-blue-400 hover:underline">點此取得收盤價 →</button>}
      >
        {kpis.hasPrices
          ? <span className={pnlText(kpis.unreal)}>{sign(kpis.unreal)}{Math.round(kpis.unreal).toLocaleString()}</span>
          : <span className="text-gray-600">—</span>}
      </KpiTile>

      <KpiTile label="已實現損益" sub={`${closedCount} 筆平倉`}>
        <span className={pnlText(kpis.realizedPnL)}>{sign(kpis.realizedPnL)}{Math.round(kpis.realizedPnL).toLocaleString()}</span>
      </KpiTile>

      <KpiTile
        label="勝率"
        sub={kpis.pnlRatio != null ? `${kpis.winCount} 勝 / ${closedCount} · 盈虧比 ${kpis.pnlRatio.toFixed(2)}` : `${kpis.winCount} 勝 / ${closedCount}`}
      >
        {kpis.winRate != null
          ? <span className="text-gray-100">{kpis.winRate.toFixed(1)}<span className="text-sm font-semibold text-gray-500">%</span></span>
          : <span className="text-gray-600">—</span>}
      </KpiTile>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="text-xs text-gray-400">資金使用率</div>
        <div className={`mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${fundText}`}>
          {kpis.fundUsage.toFixed(1)}<span className="text-sm font-semibold text-gray-500">%</span>
        </div>
        <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${fundColor} transition-all duration-700`} style={{ width: `${Math.min(kpis.fundUsage, 100)}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-gray-500 flex items-center justify-between">
          <span title="組合總風險 Heat：若所有部位觸及目前停損的總虧損 ÷ 權益">風險熱度</span>
          <span className={`font-semibold tabular-nums ${heatText}`}>
            {kpis.heatPct.toFixed(1)}% <span className="text-gray-600">({Math.round(kpis.openRisk).toLocaleString()})</span>
          </span>
        </div>
      </div>

      <KpiTile
        label="平均 R 值"
        sub={kpis.expectancy != null ? `期望值 ${sign(kpis.expectancy)}${Math.round(kpis.expectancy).toLocaleString()} / 筆` : '尚無平倉資料'}
      >
        {kpis.avgR != null
          ? <span className={pnlText(kpis.avgR)}>{sign(kpis.avgR)}{kpis.avgR.toFixed(2)}<span className="text-sm font-semibold text-gray-500">R</span></span>
          : <span className="text-gray-600">—</span>}
      </KpiTile>
    </div>
  );
}

function AnalysisNav({
  onSelect, closedCount, tradeCount,
}: {
  onSelect: (key: FeatureKey) => void;
  closedCount: number;
  tradeCount: number;
}) {
  const items: { key: FeatureKey; icon: string; label: string; count?: number }[] = [
    { key: 'performance', icon: '📊', label: '績效分析' },
    { key: 'funds', icon: '💰', label: '資金管理' },
    { key: 'rvalue', icon: '🎲', label: 'R 值分析' },
    { key: 'monthly', icon: '📅', label: '月度統計' },
    { key: 'positions', icon: '📈', label: '已平倉', count: closedCount },
    { key: 'trades', icon: '📝', label: '交易統計', count: tradeCount },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onSelect(it.key)}
          className="group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-600 hover:bg-gray-800/60 transition-colors text-left"
        >
          <span className="text-lg">{it.icon}</span>
          <span className="flex-1 text-sm font-semibold text-gray-200">{it.label}</span>
          {it.count != null && (
            <span className="text-[11px] text-gray-500 bg-gray-800 border border-gray-700 rounded-full px-1.5">{it.count}</span>
          )}
          <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
      ))}
    </div>
  );
}

// 使用獨立的 wrapper 組件來避免 initialData 被重新創建
function TradeFormWrapper({ editingTrade, onSubmit, onCancel, activeMarket, onActiveMarketChange }: {
  editingTrade: Trade | null;
  onSubmit: (data: TradeFormData) => Promise<void>;
  onCancel: () => void;
  activeMarket: 'TW' | 'US';
  onActiveMarketChange: (m: 'TW' | 'US') => void;
}) {
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
  }, [editingTrade?.id]);

  const formMarket: 'TW' | 'US' = editingTrade
    ? ((editingTrade.market === 'US' ? 'US' : 'TW'))
    : activeMarket;

  return (
    <div className="bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-700">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">
        {editingTrade ? '✏️ 編輯交易記錄' : '📝 新增交易記錄'}
      </h2>
      {!editingTrade && (
        <div className="flex gap-2 mb-6">
          {(['TW', 'US'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onActiveMarketChange(m)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeMarket === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-600'
              }`}
            >
              {m === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股'}
            </button>
          ))}
        </div>
      )}
      {editingTrade && (
        <p className="text-sm text-gray-500 mb-6">
          市場：{formMarket === 'US' ? '美股（美元）' : '台股（新台幣）'}
        </p>
      )}
      <TradeForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitLabel={editingTrade ? '更新交易' : '新增交易'}
        initialData={initialData}
        market={formMarket}
        embedded
      />
    </div>
  );
}

function TradesTable({ trades, onEdit, onDelete, deletingTradeId, currencySuffix = '元' }: {
  trades: Trade[];
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
  deletingTradeId: string | null;
  currencySuffix?: string;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const itemsPerPage = 10;

  const filteredTrades = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return trades;
    return trades.filter((trade) =>
      trade.stockCode.toLowerCase().includes(keyword) ||
      (trade.stockName ?? '').toLowerCase().includes(keyword)
    );
  }, [trades, searchKeyword]);

  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTrades = filteredTrades.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [trades.length, searchKeyword]);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...'); pages.push(totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1); pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1); pages.push('...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push('...'); pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="bg-gray-900 rounded-2xl shadow-md p-6 border border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-100">📝 交易記錄</h2>
        <div className="relative w-full sm:w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜尋股票代號或名稱"
            className="w-full pl-9 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => setSearchKeyword('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              aria-label="清除搜尋"
            >
              ✕
            </button>
          )}
        </div>
      </div>
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
                  <td className="text-right py-3 px-4 text-gray-200 tabular-nums">{trade.price.toLocaleString('zh-TW')} {currencySuffix}</td>
                  <td className="text-right py-3 px-4 text-gray-200 tabular-nums">
                    {trade.quantity} {trade.unit === 'SHARES' ? '股' : '張'}
                  </td>
                  <td className="text-right py-3 px-4 font-semibold text-gray-200 tabular-nums">
                    {trade.amount.toLocaleString('zh-TW')} {currencySuffix}
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
                  {searchKeyword ? '查無符合的交易記錄' : '尚無交易記錄'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-400">
            顯示第 {startIndex + 1} - {Math.min(endIndex, filteredTrades.length)} 筆，共 {filteredTrades.length} 筆交易記錄
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-lg border border-gray-700 transition-colors text-sm font-medium"
            >
              ← 上一頁
            </button>
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, index) => {
                if (page === '...') {
                  return <span key={`ellipsis-${index}`} className="px-2 text-gray-500">...</span>;
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
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-lg border border-gray-700 transition-colors text-sm font-medium"
            >
              下一頁 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-10 text-center">
      <div className="text-5xl mb-4">📊</div>
      <h3 className="text-xl font-semibold text-gray-200 mb-2">尚無交易記錄</h3>
      <p className="text-gray-400 mb-5">開始記錄您的第一筆交易，即可看到績效與持倉分析</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
      >
        ➕ 新增交易記錄
      </button>
    </div>
  );
}
