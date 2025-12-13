/**
 * 表單驗證邏輯函式庫
 * 提供可重用的驗證規則與錯誤訊息
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// ===== 基本驗證函式 =====

/**
 * 驗證必填欄位
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim() === '') {
    return {
      isValid: false,
      error: `${fieldName}為必填欄位`,
    };
  }
  return { isValid: true };
}

/**
 * 驗證股票代號
 * 台股代號：4-6 位數字
 */
export function validateStockCode(code: string): ValidationResult {
  if (!code || code.trim() === '') {
    return {
      isValid: false,
      error: '請輸入股票代號',
    };
  }
  
  const trimmed = code.trim();
  
  // 台股代號格式：4-6 位數字
  if (!/^\d{4,6}$/.test(trimmed)) {
    return {
      isValid: false,
      error: '股票代號格式錯誤（應為 4-6 位數字）',
    };
  }
  
  return { isValid: true };
}

/**
 * 驗證價格
 */
export function validatePrice(price: string | number): ValidationResult {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return {
      isValid: false,
      error: '請輸入有效的價格',
    };
  }
  
  if (numPrice <= 0) {
    return {
      isValid: false,
      error: '價格必須大於 0',
    };
  }
  
  if (numPrice > 10000) {
    return {
      isValid: false,
      error: '價格似乎過高，請確認（超過 10,000 元）',
    };
  }
  
  // 檢查小數位數（台股最小跳動單位）
  const priceStr = numPrice.toString();
  const decimalPart = priceStr.split('.')[1];
  
  if (decimalPart && decimalPart.length > 2) {
    return {
      isValid: false,
      error: '價格最多兩位小數',
    };
  }
  
  return { isValid: true };
}

/**
 * 驗證數量（零股或張數）
 */
export function validateQuantity(
  quantity: string | number,
  unit: 'SHARES' | 'LOTS' = 'SHARES'
): ValidationResult {
  const numQuantity = typeof quantity === 'string' ? parseInt(quantity) : quantity;
  const unitName = unit === 'SHARES' ? '股數' : '張數';
  
  if (isNaN(numQuantity)) {
    return {
      isValid: false,
      error: `請輸入有效的${unitName}`,
    };
  }
  
  if (numQuantity <= 0) {
    return {
      isValid: false,
      error: `${unitName}必須大於 0`,
    };
  }
  
  if (!Number.isInteger(numQuantity)) {
    return {
      isValid: false,
      error: `${unitName}必須為整數`,
    };
  }
  
  // 零股與整張的合理上限不同
  const maxQuantity = unit === 'SHARES' ? 1000000 : 10000;
  if (numQuantity > maxQuantity) {
    return {
      isValid: false,
      error: `${unitName}似乎過大，請確認`,
    };
  }
  
  return { isValid: true };
}

/**
 * 驗證日期
 */
export function validateDate(date: string | Date): ValidationResult {
  let dateObj: Date;
  
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }
  
  if (isNaN(dateObj.getTime())) {
    return {
      isValid: false,
      error: '請輸入有效的日期',
    };
  }
  
  // 檢查日期是否在合理範圍（不早於 2000 年，不晚於今天）
  const minDate = new Date('2000-01-01');
  const maxDate = new Date();
  maxDate.setHours(23, 59, 59, 999); // 今天結束
  
  if (dateObj < minDate) {
    return {
      isValid: false,
      error: '交易日期不可早於 2000 年',
    };
  }
  
  if (dateObj > maxDate) {
    return {
      isValid: false,
      error: '交易日期不可晚於今天',
    };
  }
  
  return { isValid: true };
}

/**
 * 驗證停損金額（可選欄位）
 */
export function validateStopLoss(stopLoss: string | number): ValidationResult {
  // 空值視為有效（可選欄位）
  if (!stopLoss || stopLoss === '') {
    return { isValid: true };
  }
  
  const numStopLoss = typeof stopLoss === 'string' ? parseFloat(stopLoss) : stopLoss;
  
  if (isNaN(numStopLoss)) {
    return {
      isValid: false,
      error: '請輸入有效的停損金額',
    };
  }
  
  if (numStopLoss <= 0) {
    return {
      isValid: false,
      error: '停損金額必須大於 0',
    };
  }
  
  if (numStopLoss > 10000000) {
    return {
      isValid: false,
      error: '停損金額似乎過大',
    };
  }
  
  return { isValid: true };
}

// ===== 組合驗證 =====

export type TradeUnit = 'SHARES' | 'LOTS';

export interface TradeFormData {
  stockCode: string;
  stockName?: string;
  tradeType: 'BUY' | 'SELL';
  tradeDate: string;
  price: string;
  quantity: string;
  unit?: TradeUnit; // 單位：零股(SHARES) 或 張(LOTS)
  plannedStopLoss?: string;
}

export interface TradeFormErrors {
  stockCode?: string;
  price?: string;
  quantity?: string;
  tradeDate?: string;
  plannedStopLoss?: string;
}

/**
 * 驗證完整的交易表單
 */
export function validateTradeForm(data: TradeFormData): {
  isValid: boolean;
  errors: TradeFormErrors;
} {
  const errors: TradeFormErrors = {};
  
  // 驗證股票代號
  const stockCodeResult = validateStockCode(data.stockCode);
  if (!stockCodeResult.isValid) {
    errors.stockCode = stockCodeResult.error;
  }
  
  // 驗證價格
  const priceResult = validatePrice(data.price);
  if (!priceResult.isValid) {
    errors.price = priceResult.error;
  }
  
  // 驗證數量（根據單位顯示不同訊息）
  const quantityResult = validateQuantity(data.quantity, data.unit || 'SHARES');
  if (!quantityResult.isValid) {
    errors.quantity = quantityResult.error;
  }
  
  // 驗證日期
  const dateResult = validateDate(data.tradeDate);
  if (!dateResult.isValid) {
    errors.tradeDate = dateResult.error;
  }
  
  // 驗證停損金額（可選）
  if (data.plannedStopLoss) {
    const stopLossResult = validateStopLoss(data.plannedStopLoss);
    if (!stopLossResult.isValid) {
      errors.plannedStopLoss = stopLossResult.error;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// ===== 進階驗證 =====

/**
 * 驗證賣出交易（確保有對應的買入部位）
 */
export function validateSellTrade(
  _stockCode: string,
  quantity: number,
  availableQuantity: number
): ValidationResult {
  if (quantity > availableQuantity) {
    return {
      isValid: false,
      error: `賣出張數 (${quantity}) 超過可用張數 (${availableQuantity})`,
    };
  }
  
  return { isValid: true };
}

/**
 * 驗證初始資金
 */
export function validateInitialCapital(capital: string | number): ValidationResult {
  const numCapital = typeof capital === 'string' ? parseFloat(capital) : capital;
  
  if (isNaN(numCapital)) {
    return {
      isValid: false,
      error: '請輸入有效的初始資金',
    };
  }
  
  if (numCapital <= 0) {
    return {
      isValid: false,
      error: '初始資金必須大於 0',
    };
  }
  
  if (numCapital < 10000) {
    return {
      isValid: false,
      error: '初始資金建議至少 10,000 元',
    };
  }
  
  return { isValid: true };
}

/**
 * 驗證交易金額是否超過可用資金
 */
export function validateSufficientFunds(
  tradeCost: number,
  availableBalance: number
): ValidationResult {
  if (tradeCost > availableBalance) {
    return {
      isValid: false,
      error: `交易成本 (${tradeCost.toLocaleString('zh-TW')}) 超過可用餘額 (${availableBalance.toLocaleString('zh-TW')})`,
    };
  }
  
  return { isValid: true };
}

