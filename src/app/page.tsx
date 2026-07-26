'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import TradeForm from '@/components/TradeForm';
import type { TradeFormData } from '@/components/TradeForm';
import DataModal from '@/components/DataModal';
import AIAnalysisModal from '@/components/AIAnalysisModal';
import PositionsTable, { effectiveAvgEntryPrice } from '@/components/PositionsTable';
import type { Trade, Position, StockPrice } from '@/lib/types';
import { calculateTrailingStop, calculateUnrealizedPnL } from '@/lib/types';
import { initialStopPrice, openPositionCost } from '@/lib/tradeCalculations';
import { calculatePerformanceMetrics, toClosedPosition } from '@/lib/performanceMetrics';
import {
  IconLogo, IconPlus, IconRefresh, IconSparkle, IconDots, IconSearch, IconEdit, IconTrash,
  IconCheck, IconClose, IconBars, IconWallet, IconDice, IconCalendar, IconList,
  IconArrowUp, IconArrowDown, IconRecalc, Spinner,
} from '@/components/Icons';

const ACCOUNT_ID = 'cmj47funv00007jwbtrkd22t9';

// 台股慣例：漲紅跌綠（正為紅、負為綠）
const pnlText = (v: number) => (v >= 0 ? 'text-up' : 'text-down');
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [allTWTrades, setAllTWTrades] = useState<Trade[]>([]);
  const [allUSTrades, setAllUSTrades] = useState<Trade[]>([]);
  const [allTWPositions, setAllTWPositions] = useState<Position[]>([]);
  const [allUSPositions, setAllUSPositions] = useState<Position[]>([]);

  // 今日收盤價（由 page 統一抓取，供 KPI 與持倉表共用）
  const [stockPrices, setStockPrices] = useState<Record<string, StockPrice>>({});
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);
  // 每個市場開頁自動抓一次收盤價（伺服器有快取，之後手動重整）
  const autoFetchedRef = useRef<Partial<Record<'TW' | 'US', boolean>>>({});

  const currencySuffix = activeMarket === 'US' ? '美元' : '元';
  const benchmarkCode = activeMarket === 'US' ? 'SPY' : '0050';

  // 顯示訊息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3200);
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
    autoFetchedRef.current[activeMarket] = false;
    loadData();
  }, [activeMarket]);

  const openPositions = useMemo(() => positions.filter(p => p.status === 'OPEN'), [positions]);
  const closedPositions = useMemo(() => positions.filter(p => p.status === 'CLOSED'), [positions]);

  // 取得今日收盤價 + 追蹤停損只升不降
  const fetchStockPrices = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (openPositions.length === 0) {
      if (!silent) showMessage('error', '目前沒有持倉部位');
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

      // 收集所有停損上移結果後一次更新 state，避免逐檔 setPositions 造成連續重繪
      const newStops = new Map<string, number>();
      await Promise.all(openPositions.map(async (position) => {
        const cp = map[position.stockCode]?.closingPrice ?? null;
        if (cp === null) return;
        const avgEntry = effectiveAvgEntryPrice(position);
        const originalStop = position.stopLossPrice ?? initialStopPrice(avgEntry);
        const trailing = calculateTrailingStop(avgEntry, cp, originalStop);
        if (!trailing || !trailing.isActivated) return;
        if (trailing.stopLossPrice > (position.stopLossPrice ?? 0)) {
          try {
            await fetch(`/api/positions?id=${position.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stopLossPrice: trailing.stopLossPrice }),
            });
            newStops.set(position.id, trailing.stopLossPrice);
          } catch (err) {
            console.warn(`${position.stockCode} 追蹤停損更新失敗:`, err);
          }
        }
      }));
      if (newStops.size > 0) {
        setPositions(prev => prev.map(p => {
          const s = newStops.get(p.id);
          return s != null ? { ...p, stopLossPrice: s } : p;
        }));
      }

      // 手動重整一律回報；自動載入只在有鎖定停損時提示
      if (!silent) {
        showMessage('success', `已更新收盤價${newStops.size > 0 ? `，鎖定 ${newStops.size} 檔追蹤停損` : ''}`);
      } else if (newStops.size > 0) {
        showMessage('success', `已鎖定 ${newStops.size} 檔追蹤停損`);
      }
    } catch (error) {
      if (!silent) showMessage('error', error instanceof Error ? error.message : '取得收盤價失敗');
    } finally {
      setFetchingPrices(false);
    }
  };

  // 開頁自動載入收盤價（每個市場一次；伺服器端有快取，之後秒開）
  useEffect(() => {
    if (loading || fetchingPrices) return;
    if (autoFetchedRef.current[activeMarket]) return;
    if (openPositions.length === 0) return;
    autoFetchedRef.current[activeMarket] = true;
    fetchStockPrices({ silent: true });
  }, [loading, openPositions, activeMarket]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // 持倉成本以「尚未賣出股數」計，部分平倉的部位不含已賣出成本
    const holdingCost = openPositions.reduce(
      (s, p) => s + openPositionCost(p).remainingCost, 0
    );
    // 勝率/盈虧比/平均R 與績效分析 modal 共用同一份定義（performanceMetrics）
    const perf = calculatePerformanceMetrics(closedPositions.map(toClosedPosition));
    const realizedPnL = perf.totalPnL;
    const winRate = closedPositions.length ? perf.winRate : null;
    const pnlRatio = perf.profitFactor;
    const avgR = perf.avgRValue;
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
      const stop = p.stopLossPrice ?? initialStopPrice(avgEntry);
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
      winCount: perf.winningTrades,
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

      showMessage('success', editingTrade ? '交易記錄更新成功' : '交易記錄新增成功');
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
    try {
      setDeletingTradeId(tradeId);
      const response = await fetch(`/api/trades/${tradeId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('刪除失敗');
      showMessage('success', '交易記錄已刪除');
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
      showMessage('success', '初始資金已更新');
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
      showMessage('success', `${result.message}，已關聯 ${result.linkedTrades} 筆孤立交易${balanceMsg}`);
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

  // 抽屜開啟時鎖住背景捲動、Esc 關閉
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancelEdit(); };
    if (showForm) document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [showForm]);

  return (
    <main className="min-h-screen bg-bg text-ink">
      {/* ===== 頂部工具列 ===== */}
      <header className="sticky top-0 z-20 backdrop-blur bg-surface/85 border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="w-[30px] h-[30px] rounded-[9px] flex-none grid place-items-center text-white bg-gradient-to-br from-[#2E5EC4] to-accent">
              <IconLogo className="w-4 h-4" />
            </span>
            <div className="leading-tight">
              <div className="font-bold text-ink text-[14.5px] tracking-tight">股票交易統計</div>
              <div className="text-[10.5px] text-ink-3 hidden sm:block">交易記錄與績效分析</div>
            </div>
          </div>

          <div className="inline-flex bg-raised border border-line rounded-[9px] p-0.5" role="group" aria-label="市場">
            {(['TW', 'US'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setActiveMarket(m)}
                aria-pressed={activeMarket === m}
                className={`px-3.5 py-1 rounded-[7px] text-[12.5px] font-semibold transition-colors ${
                  activeMarket === m
                    ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_rgba(91,141,239,.38)]'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {m === 'TW' ? '台股' : '美股'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-wrap">
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-ink-2 bg-raised border border-line rounded-full pl-2 pr-2.5 py-1 tabular-nums">
              <span className={`w-[7px] h-[7px] rounded-full ${pricesFetchedAt ? 'bg-down' : 'bg-line-strong'}`} />
              {pricesFetchedAt ? `收盤價已更新 ${pricesFetchedAt}` : '尚未取得收盤價'}
            </span>
            <button
              onClick={() => fetchStockPrices()}
              disabled={fetchingPrices}
              className="inline-flex items-center gap-1.5 px-3 py-[7px] text-[12.5px] font-semibold rounded-[9px] border border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60 transition-colors"
            >
              {fetchingPrices ? <Spinner /> : <IconRefresh />}
              {fetchingPrices ? '更新中…' : '重新整理'}
            </button>
            <button
              onClick={handleOpenAIModal}
              className="inline-flex items-center gap-1.5 px-3 py-[7px] text-[12.5px] font-semibold rounded-[9px] border border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink transition-colors"
            >
              <IconSparkle />
              AI 分析
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(v => !v)}
                aria-label="更多操作"
                aria-expanded={showMoreMenu}
                className="inline-flex items-center px-2.5 py-[7px] rounded-[9px] border border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink transition-colors"
              >
                <IconDots />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute right-0 top-10 z-40 min-w-[190px] bg-overlay border border-line rounded-xl p-1.5 shadow-xl">
                    <button
                      onClick={() => { setShowMoreMenu(false); handleRecalculatePositions(); }}
                      disabled={recalculating}
                      className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-60 transition-colors"
                    >
                      {recalculating ? <Spinner /> : <IconRecalc />}
                      重算部位
                    </button>
                    <button
                      onClick={() => { setShowMoreMenu(false); openFeature('funds'); }}
                      className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] text-ink-2 hover:bg-raised hover:text-ink transition-colors"
                    >
                      <IconWallet />
                      資金管理
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => { setEditingTrade(null); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-[7px] text-[12.5px] font-semibold rounded-[9px] bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              <IconPlus />
              新增交易
            </button>
          </div>
        </div>
      </header>

      {/* 固定 Toast（不推擠版面） */}
      {message && (
        <div
          role="status"
          className={`toast-in fixed top-4 right-4 z-[70] flex items-center gap-2.5 max-w-[min(92vw,380px)] px-4 py-2.5 rounded-xl text-[12.5px] shadow-xl border bg-overlay ${
            message.type === 'success' ? 'border-down-edge text-ink' : 'border-up-edge text-ink'
          }`}
        >
          <span className={`w-5 h-5 rounded-full grid place-items-center flex-none ${
            message.type === 'success' ? 'bg-down-soft text-down' : 'bg-up-soft text-up'
          }`}>
            {message.type === 'success' ? <IconCheck className="w-3 h-3" strokeWidth={2.5} /> : <IconClose className="w-3 h-3" strokeWidth={2.5} />}
          </span>
          {message.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* ===== 今日總覽 KPI ===== */}
        <section>
          <div className="flex items-center gap-3 mb-2.5">
            <h2 className="text-[11px] font-bold tracking-[.13em] uppercase text-ink-3">今日總覽</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-line to-transparent" />
            <span className="text-[11.5px] text-ink-3">單位：{activeMarket === 'US' ? '美元' : '新台幣'}</span>
          </div>
          <KpiStrip
            kpis={kpis}
            currencySuffix={currencySuffix}
            closedCount={closedPositions.length}
            onFetchPrices={() => fetchStockPrices()}
            fetchingPrices={fetchingPrices}
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
          <div className="flex items-center gap-3 mb-2.5">
            <h2 className="text-[11px] font-bold tracking-[.13em] uppercase text-ink-3">分析與紀錄</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-line to-transparent" />
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
      </div>

      {/* ===== 新增／編輯交易抽屜 ===== */}
      {showForm && (
        <>
          <div
            className="modal-overlay-in fixed inset-0 z-[60] bg-[rgba(5,8,14,.6)]"
            onClick={handleCancelEdit}
            aria-hidden="true"
          />
          <TradeDrawer
            editingTrade={editingTrade}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
            activeMarket={activeMarket}
            onActiveMarketChange={setActiveMarket}
          />
        </>
      )}

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

      <footer className="border-t border-line mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 text-center text-ink-3 text-[12.5px]">
          股票交易統計系統 · 祝您交易順利，穩定獲利
        </div>
      </footer>
    </main>
  );
}

// ===== 子元件 =====

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
    <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] min-w-0">
      <div className="text-[11.5px] font-semibold text-ink-3">{label}</div>
      <div className="mt-1 text-[21px] leading-tight font-extrabold tracking-tight tabular-nums">{children}</div>
      {sub && <div className="mt-1 text-[11px] text-ink-3 truncate tabular-nums">{sub}</div>}
    </div>
  );
}

function KpiStrip({
  kpis, currencySuffix, closedCount, onFetchPrices, fetchingPrices,
}: {
  kpis: KpiData;
  currencySuffix: string;
  closedCount: number;
  onFetchPrices: () => void;
  fetchingPrices: boolean;
}) {
  const fundColor = kpis.fundUsage > 80 ? 'bg-up' : kpis.fundUsage > 50 ? 'bg-warn' : 'bg-down';
  const fundText = kpis.fundUsage > 80 ? 'text-up' : kpis.fundUsage > 50 ? 'text-warn' : 'text-down';
  // 組合總風險（Heat）常見控在 6~10% 內
  const heatText = kpis.heatPct > 10 ? 'text-up' : kpis.heatPct > 6 ? 'text-warn' : 'text-down';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
      <KpiTile label="總資產" sub={<>餘額 <span className="text-ink-2">{Math.round(kpis.accountBalance).toLocaleString()}</span> ＋ 持倉 <span className="text-ink-2">{Math.round(kpis.holdingCost).toLocaleString()}</span></>}>
        <span className="text-ink">{Math.round(kpis.totalAssets).toLocaleString()} <span className="text-xs font-semibold text-ink-3">{currencySuffix}</span></span>
      </KpiTile>

      <KpiTile
        label="未實現損益"
        sub={kpis.hasPrices
          ? <span className={pnlText(kpis.unreal)}>{kpis.unrealPct != null ? `${sign(kpis.unrealPct)}${kpis.unrealPct.toFixed(2)}%` : ''} · 持倉浮動</span>
          : <button onClick={onFetchPrices} disabled={fetchingPrices} className="text-accent hover:underline disabled:opacity-60">
              {fetchingPrices ? '取得收盤價中…' : '點此取得收盤價 →'}
            </button>}
      >
        {kpis.hasPrices
          ? <span className={pnlText(kpis.unreal)}>{sign(kpis.unreal)}{Math.round(kpis.unreal).toLocaleString()}</span>
          : <span className="text-ink-3">—</span>}
      </KpiTile>

      <KpiTile label="已實現損益" sub={`${closedCount} 筆平倉累計`}>
        <span className={pnlText(kpis.realizedPnL)}>{sign(kpis.realizedPnL)}{Math.round(kpis.realizedPnL).toLocaleString()}</span>
      </KpiTile>

      <KpiTile
        label="勝率"
        sub={kpis.pnlRatio != null ? `${kpis.winCount} 勝／${closedCount} · 盈虧比 ${kpis.pnlRatio.toFixed(2)}` : `${kpis.winCount} 勝／${closedCount}`}
      >
        {kpis.winRate != null
          ? <span className="text-ink">{kpis.winRate.toFixed(1)}<span className="text-xs font-semibold text-ink-3">%</span></span>
          : <span className="text-ink-3">—</span>}
      </KpiTile>

      <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] min-w-0">
        <div className="text-[11.5px] font-semibold text-ink-3">資金使用率</div>
        <div className={`mt-1 text-[21px] leading-tight font-extrabold tracking-tight tabular-nums ${fundText}`}>
          {kpis.fundUsage.toFixed(1)}<span className="text-xs font-semibold text-ink-3">%</span>
        </div>
        <div className="mt-2 h-[5px] bg-raised rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${fundColor} transition-all duration-700`} style={{ width: `${Math.min(kpis.fundUsage, 100)}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-ink-3 flex items-center justify-between tabular-nums">
          <span title="組合總風險 Heat：若所有部位觸及目前停損的總虧損 ÷ 權益">風險熱度</span>
          <span className={`font-semibold ${heatText}`}>
            {kpis.heatPct.toFixed(1)}% <span className="text-ink-3">({Math.round(kpis.openRisk).toLocaleString()})</span>
          </span>
        </div>
      </div>

      <KpiTile
        label="平均 R 值"
        sub={kpis.expectancy != null ? `期望值 ${sign(kpis.expectancy)}${Math.round(kpis.expectancy).toLocaleString()}／筆` : '尚無平倉資料'}
      >
        {kpis.avgR != null
          ? <span className={pnlText(kpis.avgR)}>{sign(kpis.avgR)}{kpis.avgR.toFixed(2)}<span className="text-xs font-semibold text-ink-3">R</span></span>
          : <span className="text-ink-3">—</span>}
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
  const items: { key: FeatureKey; icon: React.ReactNode; label: string; count?: number }[] = [
    { key: 'performance', icon: <IconBars />, label: '績效分析' },
    { key: 'funds', icon: <IconWallet />, label: '資金管理' },
    { key: 'rvalue', icon: <IconDice />, label: 'R 值分析' },
    { key: 'monthly', icon: <IconCalendar />, label: '月度統計' },
    { key: 'positions', icon: <IconCheck />, label: '已平倉', count: closedCount },
    { key: 'trades', icon: <IconList />, label: '交易統計', count: tradeCount },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onSelect(it.key)}
          className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface border border-line hover:border-accent-edge hover:bg-[#141B29] transition-colors text-left"
        >
          <span className="w-7 h-7 rounded-lg flex-none grid place-items-center bg-raised text-ink-2 group-hover:text-accent group-hover:bg-accent-soft transition-colors">
            {it.icon}
          </span>
          <span className="flex-1 text-[12.5px] font-semibold text-ink-2 group-hover:text-ink transition-colors">{it.label}</span>
          {it.count != null && (
            <span className="text-[10.5px] text-ink-3 tabular-nums">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// 右側抽屜：新增／編輯交易（保留 KPI 與持倉可見，不再整頁切換）
function TradeDrawer({ editingTrade, onSubmit, onCancel, activeMarket, onActiveMarketChange }: {
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
  }, [editingTrade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const formMarket: 'TW' | 'US' = editingTrade
    ? ((editingTrade.market === 'US' ? 'US' : 'TW'))
    : activeMarket;

  return (
    <aside
      className="drawer-panel-in fixed top-0 right-0 bottom-0 z-[61] w-[min(520px,94vw)] bg-surface border-l border-line flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={editingTrade ? '編輯交易記錄' : '新增交易記錄'}
    >
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line-soft">
        <h2 className="text-[15px] font-bold text-ink flex-1">
          {editingTrade ? '編輯交易記錄' : '新增交易'}
        </h2>
        {editingTrade ? (
          <span className="text-[10.5px] font-medium text-ink-3 bg-raised border border-line rounded-full px-2 py-0.5">
            {formMarket === 'US' ? '美股 · 美元' : '台股 · 新台幣'}
          </span>
        ) : (
          <div className="inline-flex bg-raised border border-line rounded-[9px] p-0.5" role="group" aria-label="市場">
            {(['TW', 'US'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onActiveMarketChange(m)}
                aria-pressed={activeMarket === m}
                className={`px-3 py-1 rounded-[7px] text-xs font-semibold transition-colors ${
                  activeMarket === m
                    ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_rgba(91,141,239,.38)]'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {m === 'TW' ? '台股' : '美股'}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onCancel}
          aria-label="關閉"
          className="w-[30px] h-[30px] rounded-lg grid place-items-center text-ink-3 hover:bg-raised hover:text-ink transition-colors"
        >
          <IconClose />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <TradeForm
          onSubmit={onSubmit}
          onCancel={onCancel}
          submitLabel={editingTrade ? '更新交易' : '新增交易'}
          initialData={initialData}
          market={formMarket}
          embedded
        />
      </div>
    </aside>
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  // 點擊其他地方關閉刪除確認
  useEffect(() => {
    if (!confirmDeleteId) return;
    const close = () => setConfirmDeleteId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [confirmDeleteId]);

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
    <section className="bg-surface rounded-2xl border border-line overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3.5 border-b border-line-soft">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          交易記錄
          <span className="text-[11px] font-medium text-ink-3 bg-raised border border-line rounded-full px-2 py-px tabular-nums">
            {filteredTrades.length} 筆
          </span>
        </h2>
        <div className="relative w-full sm:w-60">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
            <IconSearch className="w-[14px] h-[14px]" />
          </span>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜尋代號或名稱"
            className="w-full pl-8 pr-8 py-[7px] bg-raised border border-line rounded-[9px] text-[12.5px] text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => setSearchKeyword('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              aria-label="清除搜尋"
            >
              <IconClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-line-soft">
              <th className="text-left py-2.5 pl-5 pr-3.5 text-[11px] tracking-wider font-bold text-ink-3">日期</th>
              <th className="text-left py-2.5 px-3.5 text-[11px] tracking-wider font-bold text-ink-3">股票</th>
              <th className="text-center py-2.5 px-3.5 text-[11px] tracking-wider font-bold text-ink-3">類型</th>
              <th className="text-right py-2.5 px-3.5 text-[11px] tracking-wider font-bold text-ink-3">價格</th>
              <th className="text-right py-2.5 px-3.5 text-[11px] tracking-wider font-bold text-ink-3">數量</th>
              <th className="text-right py-2.5 px-3.5 text-[11px] tracking-wider font-bold text-ink-3">成交金額</th>
              <th className="text-center py-2.5 pl-3.5 pr-5 text-[11px] tracking-wider font-bold text-ink-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {currentTrades.length > 0 ? (
              currentTrades.map((trade) => (
                <tr key={trade.id} className="border-b border-line-soft last:border-b-0 hover:bg-white/[.022] transition-colors">
                  <td className="py-2.5 pl-5 pr-3.5 text-ink-3 whitespace-nowrap">
                    {new Date(trade.tradeDate).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <span className="font-bold text-ink">{trade.stockCode}</span>
                    {trade.stockName && <span className="ml-2 text-xs text-ink-3">{trade.stockName}</span>}
                  </td>
                  <td className="text-center py-2.5 px-3.5">
                    {trade.tradeType === 'BUY' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-[7px] text-[11.5px] font-bold text-accent bg-accent-soft">
                        <IconArrowUp className="w-[11px] h-[11px]" strokeWidth={2.25} />
                        買進
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-[7px] text-[11.5px] font-bold text-ink-2 bg-raised shadow-[inset_0_0_0_1px_#232C3D]">
                        <IconArrowDown className="w-[11px] h-[11px]" strokeWidth={2.25} />
                        賣出
                      </span>
                    )}
                  </td>
                  <td className="text-right py-2.5 px-3.5 text-ink-2 whitespace-nowrap">{trade.price.toLocaleString('zh-TW')}</td>
                  <td className="text-right py-2.5 px-3.5 text-ink-2 whitespace-nowrap">
                    {trade.quantity} {trade.unit === 'SHARES' ? '股' : '張'}
                  </td>
                  <td className="text-right py-2.5 px-3.5 font-semibold text-ink whitespace-nowrap">
                    {trade.amount.toLocaleString('zh-TW')} <span className="text-[11px] font-medium text-ink-3">{currencySuffix}</span>
                  </td>
                  <td className="text-center py-2.5 pl-3.5 pr-5">
                    <div className="relative inline-flex items-center gap-1">
                      <button
                        onClick={() => onEdit(trade)}
                        title="編輯"
                        aria-label="編輯"
                        className="w-7 h-7 rounded-[7px] grid place-items-center text-ink-3 hover:bg-raised hover:text-ink transition-colors"
                      >
                        <IconEdit />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(confirmDeleteId === trade.id ? null : trade.id); }}
                        disabled={deletingTradeId === trade.id}
                        title="刪除"
                        aria-label="刪除"
                        className="w-7 h-7 rounded-[7px] grid place-items-center text-ink-3 hover:bg-up-soft hover:text-up disabled:opacity-50 transition-colors"
                      >
                        {deletingTradeId === trade.id ? <Spinner /> : <IconTrash />}
                      </button>
                      {confirmDeleteId === trade.id && (
                        <div
                          className="absolute right-0 top-9 z-30 w-[210px] bg-overlay border border-line rounded-xl p-3 shadow-xl text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-xs text-ink-2 mb-2.5">
                            刪除 {trade.stockCode} 這筆{trade.tradeType === 'BUY' ? '買進' : '賣出'}記錄？部位將重新計算。
                          </p>
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded-[7px] text-xs font-semibold text-ink-2 bg-raised hover:text-ink transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => { setConfirmDeleteId(null); onDelete(trade.id); }}
                              className="px-2.5 py-1.5 rounded-[7px] text-xs font-semibold text-white bg-[#C74B4B] hover:bg-[#D65C5C] transition-colors"
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-ink-3">
                  {searchKeyword ? '查無符合的交易記錄' : '尚無交易記錄'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-line-soft">
          <div className="text-[11.5px] text-ink-3 tabular-nums">
            顯示第 {startIndex + 1}–{Math.min(endIndex, filteredTrades.length)} 筆，共 {filteredTrades.length} 筆
          </div>
          <div className="flex items-center gap-1 tabular-nums">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              aria-label="上一頁"
              className="min-w-[29px] h-[29px] px-1.5 rounded-lg text-xs font-semibold text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              ‹
            </button>
            {getPageNumbers().map((page, index) => {
              if (page === '...') {
                return <span key={`ellipsis-${index}`} className="px-1 text-ink-3">…</span>;
              }
              const pageNum = page as number;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                  className={`min-w-[29px] h-[29px] px-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    currentPage === pageNum
                      ? 'text-accent bg-accent-soft shadow-[inset_0_0_0_1px_rgba(91,141,239,.38)]'
                      : 'text-ink-2 hover:bg-raised hover:text-ink'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              aria-label="下一頁"
              className="min-w-[29px] h-[29px] px-1.5 rounded-lg text-xs font-semibold text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-10 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-2xl grid place-items-center bg-raised text-ink-3">
        <IconBars className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-ink mb-1.5">尚無交易記錄</h3>
      <p className="text-ink-2 text-sm mb-5">開始記錄您的第一筆交易，即可看到績效與持倉分析</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-[9px] bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
      >
        <IconPlus />
        新增交易記錄
      </button>
    </div>
  );
}
