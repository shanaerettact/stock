import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const dynamic = 'force-dynamic';

interface TradeData {
  stockCode: string;
  stockName: string | null;
  tradeType: string;
  tradeDate: string;
  price: number;
  quantity: number;
  unit: string;
  amount: number;
  market?: string;
}

interface PositionData {
  stockCode: string;
  stockName: string | null;
  market?: string;
  status: string;
  entryDate: string;
  avgEntryPrice: number;
  totalQuantity: number;
  totalPnL: number | null;
  returnRate: number | null;
  rValue: number | null;
  exitDate?: string | Date | null;
  avgExitPrice?: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const { trades, positions, market } = await request.json() as {
      trades: TradeData[];
      positions: PositionData[];
      market: 'TW' | 'US';
    };

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '未設定 GROQ_API_KEY' }, { status: 500 });
    }

    const client = new Groq({ apiKey });

    // Group trades by month
    const tradesByMonth: Record<string, TradeData[]> = {};
    for (const trade of trades) {
      const month = trade.tradeDate.slice(0, 7); // YYYY-MM
      if (!tradesByMonth[month]) tradesByMonth[month] = [];
      tradesByMonth[month]!.push(trade);
    }

    const months = Object.keys(tradesByMonth).sort();
    if (months.length === 0) {
      return NextResponse.json({ error: '沒有交易記錄可供分析' }, { status: 400 });
    }

    const marketLabel = market === 'TW' ? '台灣股市（台股）' : '美國股市（美股）';
    const currency = market === 'TW' ? 'TWD' : 'USD';

    // 免費層 TPM 上限 12k tokens：prompt 必須有上限，不能隨資料量無限成長。
    // 近 N 個月保留個股明細，較舊月份壓縮為單行統計。
    const DETAIL_MONTHS = 6;
    const detailMonths = new Set(months.slice(-DETAIL_MONTHS));

    const monthlySummaries = months.map(month => {
      const monthTrades = tradesByMonth[month] ?? [];
      const buyTrades = monthTrades.filter(t => t.tradeType === 'BUY');
      const sellTrades = monthTrades.filter(t => t.tradeType === 'SELL');
      const totalBuyAmount = buyTrades.reduce((s, t) => s + t.amount, 0);
      const totalSellAmount = sellTrades.reduce((s, t) => s + t.amount, 0);

      if (!detailMonths.has(month)) {
        return `## ${month}（摘要）交易 ${monthTrades.length} 筆（買 ${buyTrades.length}／賣 ${sellTrades.length}）買進 ${Math.round(totalBuyAmount).toLocaleString()}、賣出 ${Math.round(totalSellAmount).toLocaleString()} ${currency}`;
      }

      const stockSummary = Object.entries(
        monthTrades.reduce<Record<string, { buys: number; sells: number; buyAmt: number; sellAmt: number }>>(
          (acc, t) => {
            if (!acc[t.stockCode]) acc[t.stockCode] = { buys: 0, sells: 0, buyAmt: 0, sellAmt: 0 };
            const entry = acc[t.stockCode]!;
            if (t.tradeType === 'BUY') { entry.buys++; entry.buyAmt += t.amount; }
            else { entry.sells++; entry.sellAmt += t.amount; }
            return acc;
          }, {}
        )
      ).map(([code, d]) => {
        const name = monthTrades.find(t => t.stockCode === code)?.stockName || '';
        return `${code}${name ? `(${name})` : ''}: 買${d.buys}次(${Math.round(d.buyAmt).toLocaleString()}) 賣${d.sells}次(${Math.round(d.sellAmt).toLocaleString()})`;
      }).join('\n    ');

      return `## ${month}
  - 總交易筆數: ${monthTrades.length} 筆（買進 ${buyTrades.length} 筆 / 賣出 ${sellTrades.length} 筆）
  - 買進總額: ${Math.round(totalBuyAmount).toLocaleString()} ${currency}
  - 賣出總額: ${Math.round(totalSellAmount).toLocaleString()} ${currency}
  - 個股明細:
    ${stockSummary}`;
    }).join('\n\n');

    // 已平倉部位：彙總統計 + 代表性樣本（最大獲利/最大虧損/最近平倉），避免逐筆列出撐爆 prompt
    const closedPositions = positions.filter(p => p.status === 'CLOSED');
    const fmtPosition = (p: PositionData) => {
      const pnl = p.totalPnL !== null ? `損益 ${Math.round(p.totalPnL).toLocaleString()} ${currency}` : '';
      const ret = p.returnRate !== null ? `報酬率 ${p.returnRate.toFixed(1)}%` : '';
      const rv = p.rValue !== null ? `R ${p.rValue.toFixed(2)}` : '';
      return `- ${p.stockCode}${p.stockName ? `(${p.stockName})` : ''}: ${p.entryDate.slice(0, 10)} 進場 ${[pnl, ret, rv].filter(Boolean).join('，')}`;
    };

    let positionsSummary = '（無已平倉記錄）';
    if (closedPositions.length > 0) {
      const withPnL = closedPositions.filter(p => p.totalPnL !== null);
      const wins = withPnL.filter(p => (p.totalPnL ?? 0) > 0);
      const totalPnL = withPnL.reduce((s, p) => s + (p.totalPnL ?? 0), 0);
      const rValues = closedPositions.filter(p => p.rValue !== null).map(p => p.rValue!);
      const avgR = rValues.length ? rValues.reduce((s, v) => s + v, 0) / rValues.length : null;

      const SAMPLE = 5;
      const byPnL = [...withPnL].sort((a, b) => (b.totalPnL ?? 0) - (a.totalPnL ?? 0));
      const topWins = byPnL.slice(0, SAMPLE).filter(p => (p.totalPnL ?? 0) > 0);
      const topLosses = byPnL.slice(-SAMPLE).filter(p => (p.totalPnL ?? 0) < 0).reverse();
      const recent = [...closedPositions]
        .sort((a, b) => String(b.exitDate ?? '').localeCompare(String(a.exitDate ?? '')))
        .slice(0, SAMPLE);
      // 去重（同部位可能同時是最大獲利與最近平倉）
      const seen = new Set<PositionData>([...topWins, ...topLosses]);
      const recentUnique = recent.filter(p => !seen.has(p));

      positionsSummary = `統計：共 ${closedPositions.length} 筆平倉，勝 ${wins.length} 敗 ${withPnL.length - wins.length}（勝率 ${withPnL.length ? ((wins.length / withPnL.length) * 100).toFixed(1) : '--'}%），總損益 ${Math.round(totalPnL).toLocaleString()} ${currency}${avgR !== null ? `，平均 R 值 ${avgR.toFixed(2)}` : ''}

獲利最大：
${topWins.map(fmtPosition).join('\n') || '（無）'}

虧損最大：
${topLosses.map(fmtPosition).join('\n') || '（無）'}${recentUnique.length ? `

最近平倉：
${recentUnique.map(fmtPosition).join('\n')}` : ''}`;
    }

    const prompt = `你是一位專業的${marketLabel}交易分析師。請根據以下交易記錄，用繁體中文分析這位交易者在各月份的交易行為，並給出具體的改善建議。

=== 市場別：${marketLabel} ===

=== 各月份交易明細 ===
${monthlySummaries}

=== 已平倉部位總覽（統計＋代表性樣本） ===
${positionsSummary}

請依以下結構撰寫分析報告：

1. **整體交易概況**（交易頻率、資金分配、活躍月份）

2. **各月份重點分析**（針對每個有交易的月份，說明：
   - 當月市場背景（依你對${marketLabel}的知識推測該月大盤狀況）
   - 個股操作優缺點
   - 值得注意的操作模式）

3. **績效亮點與問題點**（從已平倉記錄看出的規律，包括盈虧比、持倉時間、R值品質）

4. **具體改善建議**（至少5點，針對這位交易者的特定問題，例如：進場時機、停損紀律、資金控管、選股邏輯等）

5. **下一步行動計畫**（短期可執行的3項具體改進步驟）

請用條列式和表格混合的方式呈現，讓報告清晰易讀。`;

    // 免費層 TPM 12k 是「prompt + max_tokens」合計；max_tokens 調低以留空間給資料
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
    });

    const analysisText = completion.choices[0]?.message?.content ?? '分析失敗，請重試。';

    return NextResponse.json({ analysis: analysisText });
  } catch (error) {
    console.error('AI 分析失敗:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 分析失敗' },
      { status: 500 }
    );
  }
}
