/**
 * 股票交易輸入表單元件
 * 提供完整的表單驗證與即時計算預覽
 */

'use client';

import { useState, useEffect } from 'react';
import { calculateTrade, type TradeUnit } from '@/lib/tradeCalculations';
import { getStockNameByCode, getStockCodeByName } from '@/data/stockList';

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
}

// ===== 表單元件 =====

export default function TradeForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = '新增交易',
}: TradeFormProps) {
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
    positionId: initialData?.positionId || undefined,
  });
  
  const [errors, setErrors] = useState<TradeFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof calculateTrade> | null>(null);
  
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
        positionId: initialData.positionId || undefined,
      });
      setErrors({});
    }
  }, [initialData]);
  
  // 即時計算預覽與自動計算停損價（買入價 × 90%）
  useEffect(() => {
    const price = parseFloat(formData.price);
    const quantity = parseInt(formData.quantity);
    
    if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
      const calculation = calculateTrade({
        price,
        quantity,
        unit: formData.unit,
        tradeType: formData.tradeType,
        securityType: formData.securityType,
        isDayTrade: formData.isDayTrade,
      });
      setPreview(calculation);
      
      // 自動計算停損價 = 買入價 × 92%（容忍 8% 虧損）
      const autoStopLossPrice = Math.round(price * 0.92 * 100) / 100;
      const totalShares = formData.unit === 'LOTS' ? quantity * 1000 : quantity;
      const stopLossAmount = Math.round((price - autoStopLossPrice) * totalShares);
      
      setFormData(prev => ({
        ...prev,
        stopLossPrice: autoStopLossPrice.toString(),
        plannedStopLoss: stopLossAmount.toString(),
      }));
    } else {
      setPreview(null);
    }
  }, [formData.price, formData.quantity, formData.unit, formData.tradeType, formData.securityType, formData.isDayTrade]);
  
  // 表單驗證
  const validateForm = (): boolean => {
    const newErrors: TradeFormErrors = {};
    
    // 股票代號驗證
    if (!formData.stockCode.trim()) {
      newErrors.stockCode = '請輸入股票代號';
    } else if (!/^\d{4,6}$/.test(formData.stockCode)) {
      newErrors.stockCode = '股票代號格式錯誤（應為 4-6 位數字）';
    }
    
    // 價格驗證
    const price = parseFloat(formData.price);
    if (!formData.price || isNaN(price)) {
      newErrors.price = '請輸入有效的價格';
    } else if (price <= 0) {
      newErrors.price = '價格必須大於 0';
    } else if (price > 10000) {
      newErrors.price = '價格似乎過高，請確認';
    }
    
    // 數量驗證（根據單位顯示不同訊息）
    const quantity = parseInt(formData.quantity);
    const unitName = formData.unit === 'SHARES' ? '股數' : '張數';
    
    if (!formData.quantity || isNaN(quantity)) {
      newErrors.quantity = `請輸入有效的${unitName}`;
    } else if (quantity <= 0) {
      newErrors.quantity = `${unitName}必須大於 0`;
    } else if (!Number.isInteger(quantity)) {
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
      const name = getStockNameByCode(value.trim());
      if (name) {
        setFormData(prev => ({ ...prev, stockCode: value, stockName: name }));
      } else {
        setFormData(prev => ({ ...prev, stockCode: value }));
      }
    } else if (field === 'stockName' && typeof value === 'string' && value.trim()) {
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
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6 bg-gray-900 rounded-lg shadow-md border border-gray-800">
      <h2 className="text-2xl font-bold text-gray-100 mb-6">
        {submitLabel}
      </h2>
      
      {/* 錯誤訊息 */}
      {errors.general && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded">
          {errors.general}
        </div>
      )}
      
      {/* 交易類型 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          交易類型 *
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="BUY"
              checked={formData.tradeType === 'BUY'}
              onChange={(e) => handleChange('tradeType', e.target.value)}
              className="mr-2"
            />
            <span className="text-green-400 font-semibold">買進</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="SELL"
              checked={formData.tradeType === 'SELL'}
              onChange={(e) => handleChange('tradeType', e.target.value)}
              className="mr-2"
            />
            <span className="text-red-400 font-semibold">賣出</span>
          </label>
        </div>
      </div>
      
      {/* 股票資訊 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            股票代號 *
          </label>
          <input
            type="text"
            value={formData.stockCode}
            onChange={(e) => handleChange('stockCode', e.target.value)}
            placeholder="例如：2330（會自動帶出名稱）"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 bg-gray-800 text-gray-100 ${
              errors.stockCode
                ? 'border-red-600 focus:ring-red-500'
                : 'border-gray-600 focus:ring-blue-500'
            }`}
          />
          {errors.stockCode && (
            <p className="mt-1 text-sm text-red-400">{errors.stockCode}</p>
          )}
          {formData.stockName && (
            <p className="mt-1 text-xs text-green-400">
              ✓ {formData.stockName}
            </p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            股票名稱
          </label>
          <input
            type="text"
            value={formData.stockName}
            onChange={(e) => handleChange('stockName', e.target.value)}
            placeholder="例如：台積電（會自動帶出代號）"
            className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-gray-100"
          />
          {formData.stockCode && formData.stockName && (
            <p className="mt-1 text-xs text-green-400">
              ✓ {formData.stockCode}
            </p>
          )}
        </div>
      </div>
      
      {/* 交易日期 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          交易日期 *
        </label>
        <input
          type="date"
          value={formData.tradeDate}
          onChange={(e) => handleChange('tradeDate', e.target.value)}
          className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-gray-100"
        />
      </div>
      
      {/* 價格與數量 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            成交價格（每股）*
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => handleChange('price', e.target.value)}
              placeholder="0.00"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 bg-gray-800 text-gray-100 ${
                errors.price
                  ? 'border-red-600 focus:ring-red-500'
                  : 'border-gray-600 focus:ring-blue-500'
              }`}
            />
            <span className="absolute right-3 top-2 text-gray-400">元</span>
          </div>
          {errors.price && (
            <p className="mt-1 text-sm text-red-400">{errors.price}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            數量 *
          </label>
          <div className="flex gap-2">
            {/* 單位選擇器 */}
            <select
              value={formData.unit}
              onChange={(e) => handleChange('unit', e.target.value as TradeUnit)}
              className="w-24 px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-gray-100"
            >
              <option value="SHARES">零股</option>
              <option value="LOTS">張</option>
            </select>
            
            {/* 數量輸入 */}
            <div className="flex-1 relative">
              <input
                type="number"
                step={formData.unit === 'SHARES' ? '1' : '1'}
                min="1"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                placeholder={formData.unit === 'SHARES' ? '100' : '1'}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 bg-gray-800 text-gray-100 ${
                  errors.quantity
                    ? 'border-red-600 focus:ring-red-500'
                    : 'border-gray-600 focus:ring-blue-500'
                }`}
              />
              <span className="absolute right-3 top-2 text-gray-400">
                {formData.unit === 'SHARES' ? '股' : '張'}
              </span>
            </div>
          </div>
          {errors.quantity && (
            <p className="mt-1 text-sm text-red-400">{errors.quantity}</p>
          )}
          {formData.unit === 'SHARES' && (
            <p className="mt-1 text-xs text-blue-400">
              💡 零股單位為「股」，1 張 = 1000 股
            </p>
          )}
          {formData.unit === 'LOTS' && (
            <p className="mt-1 text-xs text-blue-400">
              💡 整張單位為「張」，1 張 = 1000 股
            </p>
          )}
        </div>
      </div>
      
      {/* 標的類型與當沖設定 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            標的類型
          </label>
          <select
            value={formData.securityType}
            onChange={(e) => handleChange('securityType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-gray-100"
          >
            <option value="STOCK">股票</option>
            <option value="ETF">ETF / 指數型</option>
            <option value="TDR">TDR</option>
            <option value="WARRANT">權證</option>
          </select>
          <p className="mt-1 text-xs text-blue-400">
            💡 稅率：股票 0.3%（當沖 0.15%）、ETF/TDR/權證 0.1%（賣出時）
          </p>
        </div>
        
        <div className="flex items-center gap-3 mt-6 md:mt-8">
          <input
            id="isDayTrade"
            type="checkbox"
            checked={formData.isDayTrade}
            onChange={(e) => handleChange('isDayTrade', e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-600 rounded bg-gray-800"
          />
          <label htmlFor="isDayTrade" className="text-sm text-gray-300">
            現股當沖（稅率 0.15%，僅適用股票）
          </label>
        </div>
      </div>
      
      
      {/* 即時計算預覽 */}
      {preview && (
        <div className="bg-gray-800 border border-gray-700 rounded-md p-4">
          <h3 className="font-semibold text-blue-400 mb-3">💰 費用預覽</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {/* 股票資訊 */}
            {formData.stockCode.trim() && (
              <>
                <div className="text-gray-400">股票代號：</div>
                <div className="font-semibold text-right text-blue-400">
                  {formData.stockCode}
                </div>
              </>
            )}
            
            {formData.stockName.trim() && (
              <>
                <div className="text-gray-400">股票名稱：</div>
                <div className="font-semibold text-right text-blue-400">
                  {formData.stockName}
                </div>
              </>
            )}
            
            {(formData.stockCode.trim() || formData.stockName.trim()) && (
              <div className="col-span-2 border-t border-gray-600 my-2"></div>
            )}
            
            <div className="text-gray-400">總股數：</div>
            <div className="font-semibold text-right text-blue-400">
              {preview.totalShares.toLocaleString('zh-TW')} 股
              {formData.unit === 'LOTS' && ` (${formData.quantity} 張)`}
            </div>
            
            <div className="text-gray-400">成交金額：</div>
            <div className="font-semibold text-right text-gray-200">
              {preview.amount.toLocaleString('zh-TW')} 元
            </div>
            
            <div className="text-gray-400">手續費（六折）：</div>
            <div className="font-semibold text-right text-orange-400">
              {preview.commission.toLocaleString('zh-TW')} 元
            </div>
            
            {formData.tradeType === 'SELL' && (
              <>
                <div className="text-gray-400">交易稅：</div>
                <div className="font-semibold text-right text-orange-400">
                  {preview.tax.toLocaleString('zh-TW')} 元
                </div>
              </>
            )}
            
            <div className="col-span-2 border-t border-gray-600 my-2"></div>
            
            <div className="text-gray-200 font-semibold">
              {formData.tradeType === 'BUY' ? '總成本：' : '淨收入：'}
            </div>
            <div className={`font-bold text-right text-lg ${
              formData.tradeType === 'BUY' ? 'text-green-400' : 'text-red-400'
            }`}>
              {preview.totalCost.toLocaleString('zh-TW')} 元
            </div>
            
            {formData.tradeType === 'BUY' && formData.stopLossPrice && preview && (
              <>
                <div className="col-span-2 border-t border-gray-600 my-2"></div>
                
                <div className="text-gray-400">停損價（自動）：</div>
                <div className="font-semibold text-right text-red-400">
                  {parseFloat(formData.stopLossPrice).toLocaleString('zh-TW')} 元
                </div>
                
                <div className="text-gray-400">預計停損損失：</div>
                <div className="font-semibold text-right text-orange-400">
                  {parseFloat(formData.plannedStopLoss || '0').toLocaleString('zh-TW')} 元（10%）
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
          className={`flex-1 py-3 px-4 rounded-md font-semibold text-white transition-colors ${
            isSubmitting
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'
          }`}
        >
          {isSubmitting ? '提交中...' : submitLabel}
        </button>
        
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-3 border border-gray-600 rounded-md font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
        )}
      </div>
      
      <p className="text-xs text-gray-500 text-center">
        * 為必填欄位。手續費與交易稅將自動計算（手續費六折，賣出時收取 0.3% 交易稅）<br />
        💡 換算：1 張 = 1000 股｜1 股 = 0.001 張
      </p>
    </form>
  );
}

