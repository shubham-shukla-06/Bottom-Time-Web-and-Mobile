import { create } from 'zustand';
import storage from '../utils/storage';
import api from '../api/client';

interface UIState {
  showAuthModal: boolean;
  authMode: 'signin' | 'signup';
  currency: string;
  exchangeRates: Record<string, number>;
  ratesLoaded: boolean;
  guestMode: boolean;
  openAuth: (mode?: 'signin' | 'signup') => void;
  closeAuth: () => void;
  setCurrency: (code: string) => Promise<void>;
  setExchangeRates: (rates: Record<string, number>) => void;
  fetchExchangeRates: () => Promise<void>;
  hydrateCurrency: () => Promise<void>;
  setGuestMode: (g: boolean) => void;
}

const useUIStore = create<UIState>((set, get) => ({
  showAuthModal: false,
  authMode: 'signin',
  currency: 'USD',
  // Seeded with USD only so we never NaN before rates arrive. `ratesLoaded`
  // gates real conversion in `useCurrency.format` — see hooks/useCurrency.ts.
  exchangeRates: { USD: 1 },
  ratesLoaded: false,
  guestMode: false,

  openAuth: (mode = 'signin') => set({ authMode: mode, showAuthModal: true }),
  closeAuth: () => set({ showAuthModal: false }),
  setGuestMode: (g) => set({ guestMode: g }),

  setCurrency: async (code) => {
    set({ currency: code });
    try { await storage.setItem('bt_currency', code); } catch { /* ignore */ }
    api.put('/auth/profile', { currency: code }).catch(() => { /* fire-and-forget */ });
  },
  setExchangeRates: (rates) => set({ exchangeRates: rates, ratesLoaded: true }),

  fetchExchangeRates: async () => {
    // Skip if rates already in memory — they refresh on next cold boot. The
    // backend caches its own copy with a daily Frankfurter refresh.
    if (get().ratesLoaded) return;
    try {
      const res = await api.get('/exchange-rates');
      const rates = res.data?.rates || res.data;
      if (rates && typeof rates === 'object') {
        set({ exchangeRates: { USD: 1, ...rates }, ratesLoaded: true });
      } else {
        console.warn('[currency] /exchange-rates returned no rates; keeping symbol-only fallback');
      }
    } catch (e) {
      console.warn('[currency] failed to fetch /exchange-rates:', e);
    }
  },

  hydrateCurrency: async () => {
    try {
      const c = await storage.getItem('bt_currency');
      if (c) set({ currency: c });
    } catch { /* ignore */ }
  },
}));

export default useUIStore;

/**
 * Convert an amount from one currency to another using stored exchange rates.
 * USD-based: rate[X] = how many X equal 1 USD. amount_in_to = amount / rate[from] * rate[to].
 * Same-currency short-circuit. Missing rates fall back to 1 with a warn so
 * the price still renders rather than vanishing.
 */
export function convertPrice(
  amount: number,
  fromCcy: string,
  toCcy: string,
  rates: Record<string, number>,
): number {
  if (!amount || isNaN(amount)) return 0;
  if (!rates || fromCcy === toCcy) return amount;
  const fromRate = fromCcy === 'USD' ? 1 : (rates[fromCcy] ?? null);
  const toRate   = toCcy   === 'USD' ? 1 : (rates[toCcy]   ?? null);
  if (fromRate == null) {
    console.warn(`[currency] missing rate for ${fromCcy}; falling back to source amount`);
    return amount;
  }
  if (toRate == null) {
    console.warn(`[currency] missing rate for ${toCcy}; falling back to source amount`);
    return amount;
  }
  const inUsd = amount / fromRate;
  return inUsd * toRate;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', JPY: '¥',
  THB: '฿', IDR: 'Rp', MYR: 'RM', PHP: '₱', SGD: 'S$', NZD: 'NZ$', BRL: 'R$', MXN: 'Mex$',
};

// Locale per currency — mirrors web `frontend/src/utils/currency.js` so the
// grouping (e.g. INR 1,23,456 vs JPY 1234567) is identical across platforms.
export const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', INR: 'en-IN',
  AUD: 'en-AU', CAD: 'en-CA', JPY: 'ja-JP', THB: 'th-TH',
  IDR: 'id-ID', MYR: 'ms-MY', PHP: 'en-PH', SGD: 'en-SG',
  NZD: 'en-NZ', BRL: 'pt-BR', MXN: 'es-MX',
};

/**
 * Lightweight static formatter — used only when the caller already knows
 * the amount is in the *display* currency (e.g. a backend-side breakdown
 * that returns numbers in the user's currency). Prefer `useCurrency().format`
 * for any listing/product/booking price that comes from the backend in its
 * own source currency.
 */
export function formatPrice(amount: number, ccy: string): string {
  const sym = CURRENCY_SYMBOLS[ccy] || '';
  const locale = CURRENCY_LOCALES[ccy] || 'en-US';
  const isWhole = Math.round(amount) === amount;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(amount);
  return `${sym}${formatted}`;
}
