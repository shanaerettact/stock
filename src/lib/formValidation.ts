/**
 * 表單驗證函式庫
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// ===== 基本驗證 =====

export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim() === '') {
    return { isValid: false, error: `${fieldName}為必填欄位` };
  }
  return { isValid: true };
}

export function validateStockCode(code: string): ValidationResult {
  return validateStockCodeForMarket(code, 'TW');
}

export function validateStockCodeForMarket(code: string, market: 'TW' | 'US'): ValidationResult {
  if (!code || code.trim() === '') {
    return { isValid: false, error: '請輸入股票代號' };
  }
  const c = code.trim();
  if (market === 'US') {
    if (!/^[A-Z]{1,10}(\.[A-Z]{1,2})?$/i.test(c)) {
      return { isValid: false, error: '美股代號格式錯誤（例如 AAPL、BRK.B）' };
    }
    return { isValid: true };
  }
  if (!/^\d{4,6}$/.test(c)) {
    return { isValid: false, error: '股票代號格式錯誤（應為 4-6 位數字）' };
  }
  return { isValid: true };
}

export function validatePrice(price: string | number): ValidationResult {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return { isValid: false, error: '請輸入有效的價格' };
  }
  if (numPrice <= 0) {
    return { isValid: false, error: '價格必須大於 0' };
  }
  return { isValid: true };
}

export function validateQuantity(
  quantity: string | number,
  unit: 'SHARES' | 'LOTS' = 'SHARES'
): ValidationResult {
  const numQuantity = typeof quantity === 'string' ? parseInt(quantity) : quantity;
  const unitName = unit === 'SHARES' ? '股數' : '張數';
  
  if (isNaN(numQuantity)) {
    return { isValid: false, error: `請輸入有效的${unitName}` };
  }
  if (numQuantity <= 0) {
    return { isValid: false, error: `${unitName}必須大於 0` };
  }
  if (!Number.isInteger(numQuantity)) {
    return { isValid: false, error: `${unitName}必須為整數` };
  }
  
  const maxQuantity = unit === 'SHARES' ? 1000000 : 10000;
  if (numQuantity > maxQuantity) {
    return { isValid: false, error: `${unitName}似乎過大，請確認` };
  }
  return { isValid: true };
}

export function validateDate(date: string | Date): ValidationResult {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return { isValid: false, error: '請輸入有效的日期' };
  }
  
  const minDate = new Date('2000-01-01');
  const maxDate = new Date();
  maxDate.setHours(23, 59, 59, 999);
  
  if (dateObj < minDate) {
    return { isValid: false, error: '交易日期不可早於 2000 年' };
  }
  if (dateObj > maxDate) {
    return { isValid: false, error: '交易日期不可晚於今天' };
  }
  return { isValid: true };
}

export function validateStopLoss(stopLoss: string | number): ValidationResult {
  if (!stopLoss || stopLoss === '') {
    return { isValid: true }; // 可選欄位
  }
  
  const numStopLoss = typeof stopLoss === 'string' ? parseFloat(stopLoss) : stopLoss;
  
  if (isNaN(numStopLoss)) {
    return { isValid: false, error: '請輸入有效的停損金額' };
  }
  if (numStopLoss <= 0) {
    return { isValid: false, error: '停損金額必須大於 0' };
  }
  return { isValid: true };
}

// ===== 組合驗證 =====

export interface TradeFormInput {
  stockCode: string;
  stockName?: string;
  tradeType: 'BUY' | 'SELL';
  tradeDate: string;
  price: string;
  quantity: string;
  unit?: 'SHARES' | 'LOTS';
  plannedStopLoss?: string;
  market?: 'TW' | 'US';
}

export interface TradeFormErrors {
  stockCode?: string;
  price?: string;
  quantity?: string;
  tradeDate?: string;
  plannedStopLoss?: string;
}

export function validateTradeForm(data: TradeFormInput): {
  isValid: boolean;
  errors: TradeFormErrors;
} {
  const errors: TradeFormErrors = {};
  
  const market = data.market === 'US' ? 'US' : 'TW';
  const stockCodeResult = validateStockCodeForMarket(data.stockCode, market);
  if (!stockCodeResult.isValid) errors.stockCode = stockCodeResult.error;
  
  const priceResult = validatePrice(data.price);
  if (!priceResult.isValid) errors.price = priceResult.error;
  
  const quantityResult = validateQuantity(data.quantity, data.unit || 'SHARES');
  if (!quantityResult.isValid) errors.quantity = quantityResult.error;
  
  const dateResult = validateDate(data.tradeDate);
  if (!dateResult.isValid) errors.tradeDate = dateResult.error;
  
  if (data.plannedStopLoss) {
    const stopLossResult = validateStopLoss(data.plannedStopLoss);
    if (!stopLossResult.isValid) errors.plannedStopLoss = stopLossResult.error;
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
