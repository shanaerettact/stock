/**
 * 股票交易輸入表單元件
 * 提供完整的表單驗證與即時計算預覽
 */

'use client';

import { useState, useEffect } from 'react';
import { calculateTrade, calculatePositionSize, DEFAULT_STOP_LOSS_PERCENT, initialStopPrice, type TradeUnit } from '@/lib/tradeCalculations';
import { getStockNameByCode, getStockCodeByName } from '@/data/stockList';
import { SETUP_TYPES } from '@/lib/types';

// ===== 型別定義 =====

export interface TradeFormData {
  // 基本資訊
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL';
  tradeDate: string;
  
  // 價格與數量
  price: string;
  quantity: string;
  unit: TradeUnit; // 單位：零股(SHARES) 或 張(LOTS)
  securityType: 'STOCK' | 'ETF' | 'TDR' | 'WARRANT';
  isDayTrade: boolean;
  
  // 風險管理（可選）
  stopLossPrice: string; // 停損價格
  plannedStopLoss: string;

  // 進場訊號標籤（僅新部位適用）
  setupType?: string;

  // 關聯部位（可選，用於加碼或平倉）
  positionId?: string;
}

export interface TradeFormErrors {
  stockCode?: string;
  price?: string;
  quantity?: string;
  plannedStopLoss?: string;
  general?: string;
}

interface TradeFormProps {
  initialData?: Partial<TradeFormData>;
  onSubmit: (data: TradeFormData) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** 台股 TW / 美股 US，影響手續費與代號格式 */
  market?: 'TW' | 'US';
  /** 為 true 時不顯示表單內大標題（外層已有標題時使用） */
  embedded?: boolean;
}

// ===== 表單元件 =====

export default function TradeForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = '新增交易',
  market = 'TW',
  embedded = false,
}: TradeFormProps) {
  const isUS = market === 'US';
  const priceSuffix = isUS ? '美元' : '元';

  // 表單狀態
  const getDefaultDate = (): string => {
    const today = new Date().toISOString().split('T')[0];
    return today || '';
  };
  
  const [formData, setFormData] = useState<TradeFormData>({
    stockCode: initialData?.stockCode || '',
    stockName: initialData?.stockName || '',
    tradeType: initialData?.tradeType || 'BUY',
    tradeDate: initialData?.tradeDate || getDefaultDate(),
    price: initialData?.price || '',
    quantity: initialData?.quantity || '',
    unit: initialData?.unit || 'SHARES', // 預設為零股
    securityType: initialData?.securityType || 'STOCK',
    isDayTrade: initialData?.isDayTrade || false,
    stopLossPrice: initialData?.stopLossPrice || '',
    plannedStopLoss: initialData?.plannedStopLoss || '',
    setupType: initialData?.setupType || '',
    positionId: initialData?.positionId || undefined,
  });

  const [errors, setErrors] = useState<TradeFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof calculateTrade> | null>(null);

  // 部位試算（風險管理）
  const [sizingStopPercentInput, setSizingStopPercentInput] = useState<string>(String(DEFAULT_STOP_LOSS_PERCENT * 100));
  const [sizingRiskAmountInput, setSizingRiskAmountInput] = useState<string>('');
  
  // 當 initialData 改變時，更新表單資料（用於編輯模式）
  useEffect(() => {
    if (initialData) {
      setFormData({
        stockCode: initialData.stockCode || '',
        stockName: initialData.stockName || '',
        tradeType: initialData.tradeType || 'BUY',
        tradeDate: initialData.tradeDate || getDefaultDate(),
        price: initialData.price || '',
        quantity: initialData.quantity || '',
        unit: initialData.unit || 'SHARES',
        securityType: initialData.securityType || 'STOCK',
        isDayTrade: initialData.isDayTrade || false,
        stopLossPrice: initialData.stopLossPrice || '',
        plannedStopLoss: initialData.plannedStopLoss || '',
        setupType: initialData.setupType || '',
        positionId: initialData.positionId || undefined,
      });
      setErrors({});
    }
  }, [initialData]);

  useEffect(() => {
    if (!initialData) {
      setFormData(prev => ({
        ...prev,
        unit: isUS ? 'SHARES' : prev.unit,
        isDayTrade: isUS ? false : prev.isDayTrade,
        securityType:
          isUS && (prev.securityType === 'TDR' || prev.securityType === 'WARRANT')
            ? 'STOCK'
            : prev.securityType,
      }));
    }
  }, [isUS, initialData]);

  // 美股：本地 stockList 無名稱時，向 Yahoo 行情 API 查 longName（與持倉頁取得收盤價同源）
  useEffect(() => {
    if (!isUS) return;
    const raw = formData.stockCode.trim();
    if (!raw || !/^[A-Z]{1,10}(\.[A-Z]{1,2})?$/i.test(raw)) return;
    const code = raw.toUpperCase();
    if (getStockNameByCode(code)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        const row = Array.isArray(json?.data) ? json.data[0] : undefined;
        const yName = typeof row?.stockName === 'string' ? row.stockName.trim() : '';
        if (cancelled || !yName) return;
        setFormData(prev => {
          if (prev.stockCode.trim().toUpperCase() !== code) return prev;
          if (prev.stockName.trim()) return prev;
          return { ...prev, stockName: yName };
        });
      } catch {
        /* 略過：網路或來源失敗時維持手動輸入 */
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isUS, formData.stockCode]);

  // 即時計算預覽與自動計算停損價（買入價 × 92%）
  useEffect(() => {
    const price = parseFloat(formData.price);
    const quantity = isUS ? parseFloat(formData.quantity) : parseInt(formData.quantity, 10);

    if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
      const calculation = calculateTrade({
        price,
        quantity,
        unit: formData.unit,
        tradeType: formData.tradeType,
        securityType: formData.securityType,
        isDayTrade: isUS ? false : formData.isDayTrade,
        market,
      });
      setPreview(calculation);
      
      const autoStopLossPrice = initialStopPrice(price);
      const totalShares = isUS ? quantity : (formData.unit === 'LOTS' ? quantity * 1000 : quantity);
      const stopLossAmount = Math.round((price - autoStopLossPrice) * totalShares);
      
      setFormData(prev => ({
        ...prev,
        stopLossPrice: autoStopLossPrice.toString(),
        plannedStopLoss: stopLossAmount.toString(),
      }));
    } else {
      setPreview(null);
    }
  }, [formData.price, formData.quantity, formData.unit, formData.tradeType, formData.securityType, formData.isDayTrade, market, isUS]);

  // 部位試算：可承受風險金額預設同步「預計停損損失」（依成交價格與數量算出的 8% 停損金額）
  useEffect(() => {
    setSizingRiskAmountInput(formData.plannedStopLoss || '');
  }, [formData.plannedStopLoss]);

  // 表單驗證
  const validateForm = (): boolean => {
    const newErrors: TradeFormErrors = {};
    
    // 股票代號驗證
    if (!formData.stockCode.trim()) {
      newErrors.stockCode = '請輸入股票代號';
    } else if (isUS) {
      if (!/^[A-Z]{1,10}(\.[A-Z]{1,2})?$/i.test(formData.stockCode.trim())) {
        newErrors.stockCode = '美股代號格式錯誤（例如 AAPL、BRK.B）';
      }
    } else if (!/^[A-Za-z0-9]{2,10}$/.test(formData.stockCode)) {
      newErrors.stockCode = '股票代號格式錯誤（2-10 位英數字）';
    }
    
    // 價格驗證
    const price = parseFloat(formData.price);
    if (!formData.price || isNaN(price)) {
      newErrors.price = '請輸入有效的價格';
    } else if (price <= 0) {
      newErrors.price = '價格必須大於 0';
    }
    
    // 數量驗證（根據單位顯示不同訊息）
    const quantity = isUS ? parseFloat(formData.quantity) : parseInt(formData.quantity, 10);
    const unitName = isUS ? '股數' : (formData.unit === 'SHARES' ? '股數' : '張數');

    if (!formData.quantity || isNaN(quantity)) {
      newErrors.quantity = `請輸入有效的${unitName}`;
    } else if (quantity <= 0) {
      newErrors.quantity = `${unitName}必須大於 0`;
    } else if (!isUS && !Number.isInteger(quantity)) {
      newErrors.quantity = `${unitName}必須為整數`;
    }
    
    // 停損金額驗證（可選）
    if (formData.plannedStopLoss) {
      const stopLoss = parseFloat(formData.plannedStopLoss);
      if (isNaN(stopLoss) || stopLoss <= 0) {
        newErrors.plannedStopLoss = '停損金額必須為正數';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // 處理輸入變更
  const handleChange = (
    field: keyof TradeFormData,
    value: string | boolean
  ) => {
    // 自動查詢股票資訊並一次更新
    if (field === 'stockCode' && typeof value === 'string' && value.trim()) {
      if (isUS) {
        const u = value.trim().toUpperCase();
        const name = getStockNameByCode(u);
        setFormData(prev => ({
          ...prev,
          stockCode: u,
          ...(name ? { stockName: name } : { stockName: '' }),
        }));
      } else {
        const name = getStockNameByCode(value.trim());
        if (name) {
          setFormData(prev => ({ ...prev, stockCode: value, stockName: name }));
        } else {
          setFormData(prev => ({ ...prev, stockCode: value }));
        }
      }
    } else if (field === 'stockName' && typeof value === 'string' && value.trim() && !isUS) {
      const code = getStockCodeByName(value.trim());
      if (code) {
        setFormData(prev => ({ ...prev, stockName: value, stockCode: code }));
      } else {
        setFormData(prev => ({ ...prev, stockName: value }));
      }
    } else if (typeof value === 'boolean') {
      setFormData(prev => ({ ...prev, [field]: value }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value as string }));
    }
    
    // 清除該欄位的錯誤訊息
    if (errors[field as keyof TradeFormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };
  
  // 處理提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    setErrors({});
    
    try {
      await onSubmit(formData);
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : '提交失敗，請稍後再試',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 部位試算結果（依目前價格、停損比例、可承受風險金額計算建議數量）
  const sizingPrice = parseFloat(formData.price);
  const sizingStopPercent = parseFloat(sizingStopPercentInput) / 100;
  const sizingRiskAmount = parseFloat(sizingRiskAmountInput);
  const positionSizeResult =
    !isNaN(sizingPrice) && sizingPrice > 0 &&
    !isNaN(sizingStopPercent) && sizingStopPercent > 0 &&
    !isNaN(sizingRiskAmount) && sizingRiskAmount > 0
      ? calculatePositionSize({
          price: sizingPrice,
          riskAmount: sizingRiskAmount,
          stopLossPercent: sizingStopPercent,
          unit: formData.unit,
          market,
        })
      : null;

  return (
    <form onSubmit={handleSubmit} className={embedded ? 'space-y-5' : 'space-y-5 max-w-2xl mx-auto p-6 bg-surface rounded-2xl shadow-md border border-line'}>
      {!embedded && (
        <h2 className="text-2xl font-bold text-ink mb-6">
          {submitLabel}
        </h2>
      )}

      {/* 錯誤訊息 */}
      {errors.general && (
        <div className="bg-up-soft border border-up-edge text-up px-4 py-3 rounded-lg text-sm">
          {errors.general}
        </div>
      )}

      {/* 交易類型 */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="交易類型">
        {(['BUY', 'SELL'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleChange('tradeType', t)}
            aria-pressed={formData.tradeType === t}
            className={`py-2 rounded-lg text-sm font-bold border transition-colors ${
              formData.tradeType === t
                ? 'text-accent bg-accent-soft border-accent-edge'
                : 'text-ink-3 bg-raised border-line hover:text-ink-2'
            }`}
          >
            {t === 'BUY' ? '買進' : '賣出'}
          </button>
        ))}
      </div>
      
      {/* 股票資訊 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            股票代號 *
          </label>
          <input
            type="text"
            value={formData.stockCode}
            onChange={(e) => handleChange('stockCode', e.target.value)}
            placeholder={isUS ? '例如：AAPL' : '例如：2330（會自動帶出名稱）'}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 bg-raised text-ink ${
              errors.stockCode
                ? 'border-red-600 focus:ring-red-500'
                : 'border-line focus:ring-accent'
            }`}
          />
          {errors.stockCode && (
            <p className="mt-1 text-sm text-red-400">{errors.stockCode}</p>
          )}
          {formData.stockName && (
            <p className="mt-1 text-xs text-down">
              ✓ {formData.stockName}
            </p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            股票名稱
          </label>
          <input
            type="text"
            value={formData.stockName}
            onChange={(e) => handleChange('stockName', e.target.value)}
            placeholder={isUS ? '例如：Apple Inc.' : '例如：台積電（會自動帶出代號）'}
            className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
          />
          {formData.stockCode && formData.stockName && (
            <p className="mt-1 text-xs text-down">
              ✓ {formData.stockCode}
            </p>
          )}
        </div>
      </div>

      {/* 進場訊號類型（僅新部位適用） */}
      {formData.tradeType === 'BUY' && !formData.positionId && (
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            進場訊號類型
          </label>
          <select
            value={formData.setupType || ''}
            onChange={(e) => handleChange('setupType', e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
          >
            <option value="">不標記</option>
            {SETUP_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      )}

      {/* 交易日期 */}
      <div>
        <label className="block text-sm font-medium text-ink-2 mb-2">
          交易日期 *
        </label>
        <input
          type="date"
          value={formData.tradeDate}
          onChange={(e) => handleChange('tradeDate', e.target.value)}
          className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
        />
      </div>
      
      {/* 價格與數量 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            成交價格（每股）*
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              value={formData.price}
              onChange={(e) => handleChange('price', e.target.value)}
              placeholder="0.00"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 bg-raised text-ink ${
                errors.price
                  ? 'border-red-600 focus:ring-red-500'
                  : 'border-line focus:ring-accent'
              }`}
            />
            <span className="absolute right-3 top-2 text-ink-3">{priceSuffix}</span>
          </div>
          {errors.price && (
            <p className="mt-1 text-sm text-red-400">{errors.price}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            數量 *
          </label>
          <div className="flex gap-2">
            {!isUS && (
            <select
              value={formData.unit}
              onChange={(e) => handleChange('unit', e.target.value as TradeUnit)}
              className="w-24 px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
            >
              <option value="SHARES">零股</option>
              <option value="LOTS">張</option>
            </select>
            )}
            
            {/* 數量輸入 */}
            <div className="flex-1 relative">
              <input
                type="number"
                step={formData.unit === 'SHARES' ? '1' : '1'}
                min="1"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder={isUS ? '10' : (formData.unit === 'SHARES' ? '100' : '1')}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 bg-raised text-ink ${
                  errors.quantity
                    ? 'border-red-600 focus:ring-red-500'
                    : 'border-line focus:ring-accent'
                }`}
              />
              <span className="absolute right-3 top-2 text-ink-3">
                {isUS ? '股' : (formData.unit === 'SHARES' ? '股' : '張')}
              </span>
            </div>
          </div>
          {errors.quantity && (
            <p className="mt-1 text-sm text-red-400">{errors.quantity}</p>
          )}
          {!isUS && formData.unit === 'SHARES' && (
            <p className="mt-1 text-xs text-accent">
              零股單位為「股」，1 張 = 1000 股
            </p>
          )}
          {!isUS && formData.unit === 'LOTS' && (
            <p className="mt-1 text-xs text-accent">
              整張單位為「張」，1 張 = 1000 股
            </p>
          )}
          {isUS && (
            <p className="mt-1 text-xs text-accent">
              美股以「股」為單位；手續費試算為成交額 0.1%（每筆最高 1 美元），賣出另含簡化規費
            </p>
          )}
        </div>
      </div>

      {/* 部位試算（風險管理） */}
      {formData.tradeType === 'BUY' && formData.price && (
        <div className="bg-raised border border-line-soft rounded-xl p-4">
          <h3 className="text-[11px] font-bold tracking-[.1em] text-ink-3 mb-3">部位試算（風險管理）</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                停損比例 (%)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={sizingStopPercentInput}
                onChange={(e) => setSizingStopPercentInput(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                可承受風險金額（{priceSuffix}）
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={sizingRiskAmountInput}
                onChange={(e) => setSizingRiskAmountInput(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="例如：5000"
                className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
              />
            </div>
          </div>

          {positionSizeResult ? (
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="text-ink-3">建議停損價：</div>
              <div className="font-semibold text-right text-red-400">
                {positionSizeResult.stopLossPrice.toLocaleString('zh-TW')} {priceSuffix}
              </div>
              <div className="text-ink-3">每股風險：</div>
              <div className="font-semibold text-right text-warn">
                {positionSizeResult.riskPerShare.toLocaleString('zh-TW')} {priceSuffix}
              </div>
              <div className="text-ink-3">建議買入數量：</div>
              <div className="font-semibold text-right text-accent">
                {positionSizeResult.suggestedQuantity.toLocaleString('zh-TW')} {!isUS && formData.unit === 'LOTS' ? '張' : '股'}
              </div>
              <div className="text-ink-3">實際風險金額：</div>
              <div className="font-semibold text-right text-ink">
                {Math.round(positionSizeResult.actualRiskAmount).toLocaleString('zh-TW')} {priceSuffix}
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-3 mb-3">
              請輸入停損比例與可承受風險金額，系統將自動試算建議買入數量。
            </p>
          )}

          <button
            type="button"
            onClick={() => positionSizeResult && handleChange('quantity', String(positionSizeResult.suggestedQuantity))}
            disabled={!positionSizeResult || positionSizeResult.suggestedQuantity <= 0}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-raised disabled:text-ink-3 text-white text-sm font-medium rounded-lg transition-colors"
          >
            套用建議數量
          </button>
          {positionSizeResult && positionSizeResult.suggestedQuantity <= 0 && (
            <p className="mt-2 text-xs text-warn">
              風險金額不足以買進最小單位，請提高風險金額或調整停損比例
            </p>
          )}
        </div>
      )}

      {/* 標的類型與當沖設定 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            標的類型
          </label>
          <select
            value={formData.securityType}
            onChange={(e) => handleChange('securityType', e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-raised text-ink"
          >
            <option value="STOCK">股票</option>
            <option value="ETF">ETF / 指數型</option>
            {!isUS && <option value="TDR">TDR</option>}
            {!isUS && <option value="WARRANT">權證</option>}
          </select>
          <p className="mt-1 text-xs text-accent">
            {isUS
              ? '美股試算：手續費 0.1%／筆上限 1 美元；賣出另計簡化規費（非台股交易稅）'
              : '稅率：股票 0.3%（當沖 0.15%）、ETF/TDR/權證 0.1%（賣出時）'}
          </p>
        </div>
        
        {!isUS && (
        <div className="flex items-center gap-3 mt-6 md:mt-8">
          <input
            id="isDayTrade"
            type="checkbox"
            checked={formData.isDayTrade}
            onChange={(e) => handleChange('isDayTrade', e.target.checked)}
            className="h-4 w-4 accent-[#5B8DEF] focus:ring-accent border-line rounded bg-raised"
          />
          <label htmlFor="isDayTrade" className="text-sm text-ink-2">
            現股當沖（稅率 0.15%，僅適用股票）
          </label>
        </div>
        )}
      </div>
      
      
      {/* 即時計算預覽 */}
      {preview && (
        <div className="bg-raised border border-line-soft rounded-xl p-4">
          <h3 className="text-[11px] font-bold tracking-[.1em] text-ink-3 mb-3">即時試算</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {/* 股票資訊 */}
            {formData.stockCode.trim() && (
              <>
                <div className="text-ink-3">股票代號：</div>
                <div className="font-semibold text-right text-accent">
                  {formData.stockCode}
                </div>
              </>
            )}
            
            {formData.stockName.trim() && (
              <>
                <div className="text-ink-3">股票名稱：</div>
                <div className="font-semibold text-right text-accent">
                  {formData.stockName}
                </div>
              </>
            )}
            
            {(formData.stockCode.trim() || formData.stockName.trim()) && (
              <div className="col-span-2 border-t border-line my-2"></div>
            )}
            
            <div className="text-ink-3">總股數：</div>
            <div className="font-semibold text-right text-accent">
              {preview.totalShares.toLocaleString('zh-TW')} 股
              {!isUS && formData.unit === 'LOTS' && ` (${formData.quantity} 張)`}
            </div>
            
            <div className="text-ink-3">成交金額：</div>
            <div className="font-semibold text-right text-ink">
              {preview.amount.toLocaleString('zh-TW')} {priceSuffix}
            </div>
            
            <div className="text-ink-3">{isUS ? '手續費（0.1%·上限 1 美元）：' : '手續費（六折）：'}</div>
            <div className="font-semibold text-right text-warn">
              {preview.commission.toLocaleString('zh-TW')} {priceSuffix}
            </div>
            
            {formData.tradeType === 'SELL' && (
              <>
                <div className="text-ink-3">{isUS ? '賣出規費（簡化）：' : '交易稅：'}</div>
                <div className="font-semibold text-right text-warn">
                  {preview.tax.toLocaleString('zh-TW')} {priceSuffix}
                </div>
              </>
            )}
            
            <div className="col-span-2 border-t border-line my-2"></div>
            
            <div className="text-ink font-semibold">
              {formData.tradeType === 'BUY' ? '總成本：' : '淨收入：'}
            </div>
            <div className="font-bold text-right text-lg text-ink">
              {preview.totalCost.toLocaleString('zh-TW')} {priceSuffix}
            </div>
            
            {formData.tradeType === 'BUY' && formData.stopLossPrice && preview && (
              <>
                <div className="col-span-2 border-t border-line my-2"></div>
                
                <div className="text-ink-3">停損價（自動）：</div>
                <div className="font-semibold text-right text-red-400">
                  {parseFloat(formData.stopLossPrice).toLocaleString('zh-TW')} {priceSuffix}
                </div>
                
                <div className="text-ink-3">預計停損損失：</div>
                <div className="font-semibold text-right text-warn">
                  {parseFloat(formData.plannedStopLoss || '0').toLocaleString('zh-TW')} {priceSuffix}（約當 {(DEFAULT_STOP_LOSS_PERCENT * 100).toFixed(0)}%）
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* 提交按鈕 */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
            isSubmitting
              ? 'bg-raised text-ink-3 cursor-not-allowed'
              : 'bg-accent hover:bg-accent-hover'
          }`}
        >
          {isSubmitting ? '提交中...' : submitLabel}
        </button>
        
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-3 border border-line rounded-lg font-semibold text-ink-2 hover:bg-raised hover:text-ink transition-colors"
          >
            取消
          </button>
        )}
      </div>
      
      <p className="text-xs text-ink-3 text-center">
        {isUS ? (
          <>* 美股金額以美元計；手續費試算為 0.1%、每筆最高 1 美元。帳戶餘額僅反映台股，美股不併入同一餘額。</>
        ) : (
          <>
        * 為必填欄位。手續費與交易稅將自動計算（手續費六折，賣出時收取 0.3% 交易稅）<br />
        換算：1 張 = 1000 股｜1 股 = 0.001 張
          </>
        )}
      </p>
    </form>
  );
}

