'use client';

import { useState } from 'react';
import type { StrongStock } from '@/app/api/strong-stocks/route';

interface StrongStocksPanelProps {
  onMessage?: (type: 'success' | 'error', text: string) => void;
}

export default function StrongStocksPanel({ onMessage }: StrongStocksPanelProps) {
  const [stocks, setStocks] = useState<StrongStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [tradingDate, setTradingDate] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const fetchStrongStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/strong-stocks');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '取得強勢股失敗');
      }

      setStocks(result.data || []);
      setTradingDate(result.tradingDate);
      setFetchedAt(new Date().toLocaleTimeString('zh-TW'));

      if (result.data?.length > 0) {
        onMessage?.('success', `✅ 已找到 ${result.data.length} 支符合條件的強勢股！`);
      } else {
        onMessage?.('success', result.message || '今日無符合條件的強勢股');
      }
    } catch (error) {
      console.error('取得強勢股失敗:', error);
      onMessage?.('error', error instanceof Error ? error.message : '取得強勢股失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🔥 今日強勢股</h2>
          <p className="text-sm text-gray-600 mt-1">
            篩選條件：創 52 周新高 + 交易量大於 50 日均量 50%
          </p>
        </div>
        <div className="flex items-center gap-3">
          {fetchedAt && (
            <span className="text-sm text-gray-500">
              {tradingDate && `交易日：${tradingDate}`}
              {fetchedAt && ` ・ 更新：${fetchedAt}`}
            </span>
          )}
          <button
            onClick={fetchStrongStocks}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                搜尋中...
              </>
            ) : (
              <>🔍 搜尋強勢股</>
            )}
          </button>
        </div>
      </div>

      {/* 說明區塊 */}
      {stocks.length === 0 && !loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-600 mb-2">點擊「搜尋強勢股」按鈕</p>
          <p className="text-sm text-gray-500">
            系統將自動篩選出當日漲幅前列、創 52 周新高、且交易量放大的股票
          </p>
        </div>
      )}

      {/* 股票列表 */}
      {stocks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">排名</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">股票</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">收盤價</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">漲幅</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">52周高</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">量比</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">標記</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">技術圖</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock, index) => (
                <tr
                  key={stock.stockCode}
                  className="border-b hover:bg-yellow-50 transition-colors"
                >
                  {/* 排名 */}
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold ${
                        index < 3
                          ? 'bg-yellow-400 text-yellow-900'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>

                  {/* 股票資訊 */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{stock.stockCode}</span>
                      {'market' in stock && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          stock.market === 'TWSE'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {stock.market === 'TWSE' ? '上市' : '上櫃'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">{stock.stockName}</div>
                  </td>

                  {/* 收盤價 */}
                  <td className="text-right py-3 px-4 font-semibold text-gray-900">
                    {stock.closingPrice.toLocaleString()} 元
                  </td>

                  {/* 漲幅 */}
                  <td className="text-right py-3 px-4">
                    <div className="text-red-600 font-bold">
                      +{stock.changePercent.toFixed(2)}%
                    </div>
                    <div className="text-xs text-red-500">
                      +{stock.change.toFixed(2)}
                    </div>
                  </td>

                  {/* 52 周高 */}
                  <td className="text-right py-3 px-4 text-gray-700">
                    {stock.week52High.toLocaleString()}
                  </td>

                  {/* 量比 */}
                  <td className="text-right py-3 px-4">
                    <span
                      className={`font-semibold ${
                        stock.volumeRatio >= 2
                          ? 'text-purple-600'
                          : stock.volumeRatio >= 1.5
                          ? 'text-green-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {stock.volumeRatio.toFixed(2)}x
                    </span>
                  </td>

                  {/* 標記 */}
                  <td className="text-center py-3 px-4">
                    <div className="flex flex-wrap justify-center gap-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                        🎯 新高
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                        📈 量增
                      </span>
                    </div>
                  </td>

                  {/* 技術圖連結 */}
                  <td className="text-center py-3 px-4">
                    <a
                      href={`https://tw.stock.yahoo.com/quote/${stock.stockCode}/technical-analysis`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium transition-colors"
                    >
                      📊 查看
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 資料來源 */}
      {stocks.length > 0 && (
        <div className="mt-4 text-xs text-gray-500 text-right">
          資料來源：
          <a
            href="https://finmind.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline ml-1"
          >
            FinMind API
          </a>
        </div>
      )}
    </div>
  );
}

