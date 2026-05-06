const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '\u20AC', GBP: '\u00A3', INR: '\u20B9',
  AUD: 'A$', CAD: 'C$', JPY: '\u00A5', THB: '\u0E3F',
  IDR: 'Rp', MYR: 'RM', PHP: '\u20B1', SGD: 'S$',
  NZD: 'NZ$', BRL: 'R$', MXN: 'MX$',
};

const CURRENCY_LOCALES = {
  USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', INR: 'en-IN',
  AUD: 'en-AU', CAD: 'en-CA', JPY: 'ja-JP', THB: 'th-TH',
  IDR: 'id-ID', MYR: 'ms-MY', PHP: 'en-PH', SGD: 'en-SG',
  NZD: 'en-NZ', BRL: 'pt-BR', MXN: 'es-MX',
};

export function getCurrencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || code + ' ';
}

/**
 * Convert an amount from one currency to another using exchange rates.
 * Exchange rates are USD-based (e.g., rates.EUR = 0.92 means 1 USD = 0.92 EUR).
 * To convert: amount / rates[from] * rates[to]
 * If from === to, no conversion needed.
 */
export function convertAmount(amount, fromCurrency, toCurrency, exchangeRates) {
  if (fromCurrency === toCurrency || !exchangeRates) return amount;
  const fromRate = exchangeRates[fromCurrency] || 1;
  const toRate = exchangeRates[toCurrency] || 1;
  return amount / fromRate * toRate;
}

/**
 * Format a price for display.
 * @param {number} amount - The price in source currency
 * @param {string} displayCurrency - Currency to display in (user's preference)
 * @param {object} exchangeRates - USD-based exchange rates
 * @param {string} sourceCurrency - Currency the amount is in (default: 'USD' for backward compat)
 */
export function formatPrice(amount, displayCurrency, exchangeRates, sourceCurrency = 'USD') {
  const converted = sourceCurrency === displayCurrency
    ? amount
    : Math.round(convertAmount(amount, sourceCurrency, displayCurrency, exchangeRates) * 100) / 100;
  const locale = CURRENCY_LOCALES[displayCurrency] || 'en-US';
  const sym = getCurrencySymbol(displayCurrency);
  const isWhole = converted === Math.round(converted);
  const num = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(converted);
  return `${sym}${num}`;
}

export function formatPriceExact(amount, displayCurrency, exchangeRates, sourceCurrency = 'USD') {
  return formatPrice(amount, displayCurrency, exchangeRates, sourceCurrency);
}

/**
 * Format a line total: convert unit price, round, then multiply by quantity.
 * Ensures displayed_unit_price × qty = displayed_line_total exactly.
 */
export function formatLineTotal(unitPrice, quantity, displayCurrency, exchangeRates, sourceCurrency = 'USD') {
  const unitConverted = sourceCurrency === displayCurrency
    ? unitPrice
    : Math.round(convertAmount(unitPrice, sourceCurrency, displayCurrency, exchangeRates) * 100) / 100;
  const lineTotal = Math.round(unitConverted * quantity * 100) / 100;
  const locale = CURRENCY_LOCALES[displayCurrency] || 'en-US';
  const sym = getCurrencySymbol(displayCurrency);
  const isWhole = lineTotal === Math.round(lineTotal);
  const num = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(lineTotal);
  return `${sym}${num}`;
}

/**
 * Get the raw converted + rounded amount (number, not formatted string).
 * Useful for computing subtotals client-side.
 */
export function convertAndRound(amount, fromCurrency, toCurrency, exchangeRates) {
  if (fromCurrency === toCurrency) return amount;
  return Math.round(convertAmount(amount, fromCurrency, toCurrency, exchangeRates) * 100) / 100;
}
