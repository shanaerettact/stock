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
  
  // 風險管理（可選）
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
  const [formData, setFormData] = useState<TradeFormData>({
    stockCode: initialData?.stockCode || '',
    stockName: initialData?.stockName || '',
    tradeType: initialData?.tradeType || 'BUY',
    tradeDate: initialData?.tradeDate || new Date().toISOString().split('T')[0],
    price: initialData?.price || '',
    quantity: initialData?.quantity || '',
    unit: initialData?.unit || 'SHARES', // 預設為零股
    plannedStopLoss: initialData?.plannedStopLoss || '',
    positionId: initialData?.positionId || undefined,
  });
  
  const [errors, setErrors] = useState<TradeFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof calculateTrade> | null>(null);
  
  // 即時計算預覽與自動設定停損金額
  useEffect(() => {
    const price = parseFloat(formData.price);
    const quantity = parseInt(formData.quantity);
    
    if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
      const calculation = calculateTrade({
        price,
        quantity,
        unit: formData.unit,
        tradeType: formData.tradeType,
      });
      setPreview(calculation);
      
      // 自動計算停損金額（成交金額 - 成交金額 × 10%）
      const stopLossAmount = Math.round(calculation.amount * 0.9);
      setFormData(prev => ({
        ...prev,
        plannedStopLoss: stopLossAmount.toString(),
      }));
    } else {
      setPreview(null);
    }
  }, [formData.price, formData.quantity, formData.unit, formData.tradeType]);
  
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
    value: string
  ) => {
    // 自動查詢股票資訊並一次更新
    if (field === 'stockCode' && value.trim()) {
      const name = getStockNameByCode(value.trim());
      if (name) {
        setFormData(prev => ({ ...prev, stockCode: value, stockName: name }));
      } else {
        setFormData(prev => ({ ...prev, [field]: value }));
      }
    } else if (field === 'stockName' && value.trim()) {
      const code = getStockCodeByName(value.trim());
      if (code) {
        setFormData(prev => ({ ...prev, stockName: value, stockCode: code }));
      } else {
        setFormData(prev => ({ ...prev, [field]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        {submitLabel}
      </h2>
      
      {/* 錯誤訊息 */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {errors.general}
        </div>
      )}
      
      {/* 交易類型 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
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
            <span className="text-green-600 font-semibold">買進</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="SELL"
              checked={formData.tradeType === 'SELL'}
              onChange={(e) => handleChange('tradeType', e.target.value)}
              className="mr-2"
            />
            <span className="text-red-600 font-semibold">賣出</span>
          </label>
        </div>
      </div>
      
      {/* 股票資訊 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            股票代號 *
          </label>
          <input
            type="text"
            value={formData.stockCode}
            onChange={(e) => handleChange('stockCode', e.target.value)}
            placeholder="例如：2330（會自動帶出名稱）"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-gray-900 ${
              errors.stockCode
                ? 'border-red-300 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
          />
          {errors.stockCode && (
            <p className="mt-1 text-sm text-red-600">{errors.stockCode}</p>
          )}
          {formData.stockName && (
            <p className="mt-1 text-xs text-green-600">
              ✓ {formData.stockName}
            </p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            股票名稱
          </label>
          <input
            type="text"
            value={formData.stockName}
            onChange={(e) => handleChange('stockName', e.target.value)}
            placeholder="例如：台積電（會自動帶出代號）"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
          {formData.stockCode && formData.stockName && (
            <p className="mt-1 text-xs text-green-600">
              ✓ {formData.stockCode}
            </p>
          )}
        </div>
      </div>
      
      {/* 交易日期 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          交易日期 *
        </label>
        <input
          type="date"
          value={formData.tradeDate}
          onChange={(e) => handleChange('tradeDate', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      {/* 價格與數量 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            成交價格（每股）*
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => handleChange('price', e.target.value)}
              placeholder="0.00"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-gray-900 ${
                errors.price
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            <span className="absolute right-3 top-2 text-gray-500">元</span>
          </div>
          {errors.price && (
            <p className="mt-1 text-sm text-red-600">{errors.price}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            數量 *
          </label>
          <div className="flex gap-2">
            {/* 單位選擇器 */}
            <select
              value={formData.unit}
              onChange={(e) => handleChange('unit', e.target.value as TradeUnit)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-gray-900 ${
                  errors.quantity
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
              />
              <span className="absolute right-3 top-2 text-gray-500">
                {formData.unit === 'SHARES' ? '股' : '張'}
              </span>
            </div>
          </div>
          {errors.quantity && (
            <p className="mt-1 text-sm text-red-600">{errors.quantity}</p>
          )}
          {formData.unit === 'SHARES' && (
            <p className="mt-1 text-xs text-blue-600">
              💡 零股單位為「股」，1 張 = 1000 股
            </p>
          )}
          {formData.unit === 'LOTS' && (
            <p className="mt-1 text-xs text-blue-600">
              💡 整張單位為「張」，1 張 = 1000 股
            </p>
          )}
        </div>
      </div>
      
      {/* 風險管理（自動計算） */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          預計停損金額（自動計算：成交金額 - 10%）
        </label>
        <div className="relative">
          <input
            type="text"
            value={formData.plannedStopLoss ? `${parseFloat(formData.plannedStopLoss).toLocaleString('zh-TW')} 元` : ''}
            readOnly
            placeholder="自動計算中..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 cursor-not-allowed"
          />
        </div>
        <p className="mt-1 text-xs text-blue-600">
          💡 當股票價值跌至此金額時停損出場（容忍 10% 虧損）
        </p>
      </div>
      
      {/* 即時計算預覽 */}
      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="font-semibold text-blue-900 mb-3">💰 費用預覽</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {/* 股票資訊 */}
            {formData.stockCode.trim() && (
              <>
                <div className="text-gray-700">股票代號：</div>
                <div className="font-semibold text-right text-blue-700">
                  {formData.stockCode}
                </div>
              </>
            )}
            
            {formData.stockName.trim() && (
              <>
                <div className="text-gray-700">股票名稱：</div>
                <div className="font-semibold text-right text-blue-700">
                  {formData.stockName}
                </div>
              </>
            )}
            
            {(formData.stockCode.trim() || formData.stockName.trim()) && (
              <div className="col-span-2 border-t border-blue-300 my-2"></div>
            )}
            
            <div className="text-gray-700">總股數：</div>
            <div className="font-semibold text-right text-blue-700">
              {preview.totalShares.toLocaleString('zh-TW')} 股
              {formData.unit === 'LOTS' && ` (${formData.quantity} 張)`}
            </div>
            
            <div className="text-gray-700">成交金額：</div>
            <div className="font-semibold text-right">
              {preview.amount.toLocaleString('zh-TW')} 元
            </div>
            
            <div className="text-gray-700">手續費（六折）：</div>
            <div className="font-semibold text-right text-orange-600">
              {preview.commission.toLocaleString('zh-TW')} 元
            </div>
            
            {formData.tradeType === 'SELL' && (
              <>
                <div className="text-gray-700">交易稅：</div>
                <div className="font-semibold text-right text-orange-600">
                  {preview.tax.toLocaleString('zh-TW')} 元
                </div>
              </>
            )}
            
            <div className="col-span-2 border-t border-blue-300 my-2"></div>
            
            <div className="text-gray-900 font-semibold">
              {formData.tradeType === 'BUY' ? '總成本：' : '淨收入：'}
            </div>
            <div className={`font-bold text-right text-lg ${
              formData.tradeType === 'BUY' ? 'text-green-600' : 'text-red-600'
            }`}>
              {preview.totalCost.toLocaleString('zh-TW')} 元
            </div>
            
            {formData.tradeType === 'BUY' && formData.plannedStopLoss && preview && (
              <>
                <div className="col-span-2 border-t border-blue-300 my-2"></div>
                
                <div className="text-gray-700">預計停損金額：</div>
                <div className="font-semibold text-right text-red-600">
                  {parseFloat(formData.plannedStopLoss).toLocaleString('zh-TW')} 元
                </div>
                
                <div className="text-gray-700">可承受損失：</div>
                <div className="font-semibold text-right text-orange-600">
                  {(preview.amount - parseFloat(formData.plannedStopLoss)).toLocaleString('zh-TW')} 元（10%）
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
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }`}
        >
          {isSubmitting ? '提交中...' : submitLabel}
        </button>
        
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-3 border border-gray-300 rounded-md font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
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

