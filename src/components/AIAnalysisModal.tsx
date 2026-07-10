'use client';

import { useState, useEffect } from 'react';
import type { Trade, Position } from '@/lib/types';

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  twTrades: Trade[];
  usTrades: Trade[];
  twPositions: Position[];
  usPositions: Position[];
}

export default function AIAnalysisModal({
  isOpen,
  onClose,
  twTrades,
  usTrades,
  twPositions,
  usPositions,
}: AIAnalysisModalProps) {
  const [activeTab, setActiveTab] = useState<'TW' | 'US'>('TW');
  const [twAnalysis, setTwAnalysis] = useState<string>('');
  const [usAnalysis, setUsAnalysis] = useState<string>('');
  const [twLoading, setTwLoading] = useState(false);
  const [usLoading, setUsLoading] = useState(false);
  const [twError, setTwError] = useState<string>('');
  const [usError, setUsError] = useState<string>('');

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const runAnalysis = async (market: 'TW' | 'US') => {
    const trades = market === 'TW' ? twTrades : usTrades;
    const positions = market === 'TW' ? twPositions : usPositions;
    const setLoading = market === 'TW' ? setTwLoading : setUsLoading;
    const setAnalysis = market === 'TW' ? setTwAnalysis : setUsAnalysis;
    const setError = market === 'TW' ? setTwError : setUsError;

    if (trades.length === 0) {
      setError(`目前沒有${market === 'TW' ? '台股' : '美股'}交易記錄。`);
      return;
    }

    setLoading(true);
    setError('');
    setAnalysis('');

    try {
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades, positions, market }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '分析失敗');
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失敗，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentAnalysis = activeTab === 'TW' ? twAnalysis : usAnalysis;
  const currentLoading = activeTab === 'TW' ? twLoading : usLoading;
  const currentError = activeTab === 'TW' ? twError : usError;
  const currentTrades = activeTab === 'TW' ? twTrades : usTrades;

  return (
    <div
      className="modal-overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-panel-in bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-3xl flex flex-col"
        style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="text-xl font-bold text-gray-100 tracking-tight">AI 交易分析</h2>
              <p className="text-xs text-gray-500">由 AI 分析您的交易記錄並提供改善建議</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="text-gray-400 hover:text-gray-100 transition-colors p-2 rounded-lg hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs（底線式，與儀表板一致） */}
        <div className="flex gap-1 px-6 pt-3 flex-shrink-0 border-b border-gray-800">
          {(['TW', 'US'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setActiveTab(m)}
              aria-selected={activeTab === m}
              className={`px-4 py-2.5 -mb-px font-semibold text-sm border-b-2 transition-colors ${
                activeTab === m
                  ? 'text-gray-100 border-blue-500'
                  : 'text-gray-400 border-transparent hover:text-gray-200'
              }`}
            >
              {m === 'TW' ? '🇹🇼 台股分析' : '🇺🇸 美股分析'}
              <span className="ml-1.5 text-xs text-gray-500">
                {(m === 'TW' ? twTrades : usTrades).length}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {!currentAnalysis && !currentLoading && !currentError && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-gray-200 mb-2">
                {activeTab === 'TW' ? '台股' : '美股'}交易分析
              </h3>
              <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                AI 將分析您的 {currentTrades.length} 筆交易記錄，評估各月份操作策略、
                識別交易模式，並給出具體的改善建議。
              </p>
              {currentTrades.length === 0 ? (
                <p className="text-yellow-400 text-sm">目前沒有{activeTab === 'TW' ? '台股' : '美股'}交易記錄。</p>
              ) : (
                <button
                  onClick={() => runAnalysis(activeTab)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-md"
                >
                  🚀 開始 AI 分析
                </button>
              )}
            </div>
          )}

          {currentLoading && (
            <div className="text-center py-12">
              <div className="flex flex-col items-center gap-4">
                <svg className="animate-spin h-10 w-10 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-gray-300 font-medium">AI 正在分析您的交易記錄...</p>
                <p className="text-gray-500 text-sm">這可能需要 20-60 秒，請耐心等候</p>
              </div>
            </div>
          )}

          {currentError && !currentLoading && (
            <div className="py-8">
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
                <p className="text-red-300 text-sm">❌ {currentError}</p>
              </div>
              {currentTrades.length > 0 && (
                <div className="text-center">
                  <button
                    onClick={() => runAnalysis(activeTab)}
                    className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors text-sm"
                  >
                    🔄 重試
                  </button>
                </div>
              )}
            </div>
          )}

          {currentAnalysis && !currentLoading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-400">
                  {activeTab === 'TW' ? '🇹🇼 台股' : '🇺🇸 美股'}分析報告
                </h3>
                <button
                  onClick={() => runAnalysis(activeTab)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  🔄 重新分析
                </button>
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <MarkdownRenderer text={currentAnalysis} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base font-bold text-blue-300 mt-5 mb-2">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-white mt-6 mb-3 border-b border-gray-700 pb-1">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-xl font-bold text-white mt-4 mb-3">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      elements.push(
        <p key={i} className="font-semibold text-gray-200 mt-4 mb-1">
          {line.slice(2, -2)}
        </p>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="text-gray-300 text-sm ml-4 list-disc mb-1">
          <InlineMarkdown text={line.slice(2)} />
        </li>
      );
    } else if (/^\d+\./.test(line)) {
      elements.push(
        <li key={i} className="text-gray-300 text-sm ml-4 list-decimal mb-1">
          <InlineMarkdown text={line.replace(/^\d+\.\s*/, '')} />
        </li>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else if (line.startsWith('|')) {
      // Table: collect all table lines
      const tableLines: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1]!.startsWith('|')) {
        i++;
        tableLines.push(lines[i]!);
      }
      elements.push(<MarkdownTable key={i} lines={tableLines} />);
    } else {
      elements.push(
        <p key={i} className="text-gray-300 text-sm mb-2 leading-relaxed">
          <InlineMarkdown text={line} />
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx} className="text-gray-100 font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter(l => !l.match(/^\|[-|: ]+\|$/))
    .map(l => l.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim()));

  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  if (!header) return null;

  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-800">
            {header.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left text-gray-300 font-semibold border border-gray-700">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/40'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-gray-300 border border-gray-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
