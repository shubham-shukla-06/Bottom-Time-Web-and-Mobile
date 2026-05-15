// Phase 4-P3 deferred polish — currency + FX display helpers.
//
// Single source of truth for "price_inr × FX(displayCurrency) → formatted
// string" so all surfaces (cart, listing cards, product cards, order detail,
// invoice) render the same way.
//
// Locked semantics (see /app/memory/CART_CHECKOUT_LOCKED.md + STRIPE/RAZORPAY):
//  - INR is the canonical store. `price_inr` is authoritative.
//  - When `displayCurrency !== "INR"`, convert via /api/utils/exchange-rates
//    (already loaded into useUIStore on app boot).
//  - Symbol per currency: ₹ ¥ $ £ €  — fallback to currency code.
//  - Always 2 decimals except JPY (zero decimals — per ISO-4217 minor digits).

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'AED ', CHF: 'CHF ', CNY: '¥', HKD: 'HK$', NZD: 'NZ$' };
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'XAF', 'XOF']);

export function currencySymbol(code) {
  return SYMBOLS[(code || 'INR').toUpperCase()] || `${(code || 'INR').toUpperCase()} `;
}

/** Convert a canonical INR amount to the display currency using frankfurter
 *  rates (frankfurter publishes rates per 1 USD; useUIStore exposes them under
 *  `exchangeRates.rates` keyed by currency code AND `exchangeRates.inrPerUsd`). */
export function convertInrTo(amountInr, displayCurrency, exchangeRates) {
  const tgt = (displayCurrency || 'INR').toUpperCase();
  if (tgt === 'INR' || !amountInr) return Number(amountInr || 0);
  const inrPerUsd = exchangeRates?.inrPerUsd || exchangeRates?.rates?.INR;
  if (!inrPerUsd) return Number(amountInr || 0);  // fall back to INR (loud-fail in UI)
  const usd = Number(amountInr) / Number(inrPerUsd);
  if (tgt === 'USD') return usd;
  const rate = exchangeRates?.rates?.[tgt];
  return rate ? usd * Number(rate) : usd;
}

/** Format a number with the right symbol + decimals for the currency. */
export function formatCurrency(amount, code) {
  const cur = (code || 'INR').toUpperCase();
  const dp = ZERO_DECIMAL.has(cur) ? 0 : 2;
  const n = Number(amount || 0);
  return `${currencySymbol(cur)}${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

/** Combined: canonical INR → display currency → formatted. */
export function formatInrAs(amountInr, displayCurrency, exchangeRates) {
  const converted = convertInrTo(amountInr, displayCurrency, exchangeRates);
  return formatCurrency(converted, displayCurrency);
}

/** Pretty FX line for invoices / receipts.
 *  Returns null for INR orders (callers can render nothing or "Native pricing"). */
export function formatFxLine({ display_currency, fx_rate_locked, fx_locked_at, fx_source }) {
  const cur = (display_currency || 'INR').toUpperCase();
  if (cur === 'INR' || !fx_rate_locked || Number(fx_rate_locked) === 1) return null;
  const locked = fx_locked_at ? new Date(fx_locked_at) : null;
  const lockedStr = locked && !Number.isNaN(locked.getTime())
    ? locked.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : '—';
  const src = fx_source && fx_source !== 'identity' ? ` · ${fx_source}` : '';
  return `Currency: ${cur} · FX Rate: ₹${Number(fx_rate_locked).toFixed(2)} per ${cur} · Locked at: ${lockedStr}${src}`;
}
