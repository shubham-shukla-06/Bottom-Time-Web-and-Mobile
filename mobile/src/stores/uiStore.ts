import { create } from 'zustand';
import storage from '../utils/storage';
import api from '../api/client';

interface UIState {
  showAuthModal: boolean;
  authMode: 'signin' | 'signup';
  currency: string;
  exchangeRates: Record<string, number>;
  guestMode: boolean;
  openAuth: (mode?: 'signin' | 'signup') => void;
  closeAuth: () => void;
  setCurrency: (code: string) => Promise<void>;
  setExchangeRates: (rates: Record<string, number>) => void;
  fetchExchangeRates: () => Promise<void>;
  hydrateCurrency: () => Promise<void>;
  setGuestMode: (g: boolean) => void;
}

const useUIStore = create<UIState>((set) => ({
  showAuthModal: false,
  authMode: 'signin',
  currency: 'USD',
  exchangeRates: { USD: 1 },
  guestMode: false,

  openAuth: (mode = 'signin') => set({ authMode: mode, showAuthModal: true }),
  closeAuth: () => set({ showAuthModal: false }),
  setGuestMode: (g) => set({ guestMode: g }),

  setCurrency: async (code) => {
    set({ currency: code });
    try { await storage.setItem('bt_currency', code); } catch {/* ignore */}
    api.put('/auth/profile', { currency: code }).catch(() => {/* fire-and-forget */});
  },
  setExchangeRates: (rates) => set({ exchangeRates: rates }),

  fetchExchangeRates: async () => {
    try {
      const res = await api.get('/exchange-rates');
      const rates = res.data?.rates || res.data;
      if (rates && typeof rates === 'object') set({ exchangeRates: rates });
    } catch {/* silent */}
  },

  hydrateCurrency: async () => {
    try {
      const c = await storage.getItem('bt_currency');
      if (c) set({ currency: c });
    } catch {/* ignore */}
  },
}));

export default useUIStore;

/**
 * Convert an amount from one currency to another using stored exchange rates.
 * Rates are normalized base = USD. Mirrors web's behaviour in `useDiscoverFilters`.
 */
export function convertPrice(amount: number, fromCcy: string, toCcy: string, rates: Record<string, number>): number {
  if (!amount || !rates) return amount || 0;
  const fromRate = fromCcy === 'USD' ? 1 : rates[fromCcy] || 1;
  const toRate = toCcy === 'USD' ? 1 : rates[toCcy] || 1;
  // amount is in fromCcy; convert to USD then to toCcy
  const inUsd = amount / fromRate;
  return inUsd * toRate;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', JPY: '¥',
  THB: '฿', IDR: 'Rp', MYR: 'RM', PHP: '₱', SGD: 'S$', NZD: 'NZ$', BRL: 'R$', MXN: 'Mex$',
};

export function formatPrice(amount: number, ccy: string): string {
  const sym = CURRENCY_SYMBOLS[ccy] || '';
  const formatted = (Math.round(amount * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  return `${sym}${formatted}`;
}
