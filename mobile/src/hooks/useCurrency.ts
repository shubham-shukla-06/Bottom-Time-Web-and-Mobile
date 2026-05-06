/**
 * useCurrency — central currency hook for the mobile app.
 *
 * Returns the user's selected currency, the FX rate (USD-base) for that
 * currency, and a `format(amount, fromCurrency='USD')` helper that converts
 * between currencies using the live exchange-rate map from `uiStore`.
 *
 * The store persists `bt_currency` via SecureStore and pushes the choice
 * to `/auth/profile` whenever it changes (best-effort).
 *
 * Mirrors web `frontend/src/hooks/useDiscoverFilters.js` + Navbar currency
 * selector behaviour (USD base, rates fetched once at boot).
 */
import { useCallback } from 'react';
import useUIStore, { CURRENCY_SYMBOLS, convertPrice } from '../stores/uiStore';

interface UseCurrencyReturn {
  currency: string;
  rate: number;
  symbol: string;
  format: (amount: number | null | undefined, fromCurrency?: string, opts?: { withCode?: boolean; minFractionDigits?: number; maxFractionDigits?: number }) => string;
  convert: (amount: number, fromCurrency?: string) => number;
}

export default function useCurrency(): UseCurrencyReturn {
  const currency = useUIStore((s) => s.currency);
  const rates = useUIStore((s) => s.exchangeRates);

  const rate = currency === 'USD' ? 1 : (rates[currency] || 1);
  const symbol = CURRENCY_SYMBOLS[currency] || '';

  const convert = useCallback(
    (amount: number, fromCurrency: string = 'USD'): number => {
      if (!amount || isNaN(amount)) return 0;
      return convertPrice(amount, fromCurrency, currency, rates);
    },
    [currency, rates]
  );

  const format = useCallback(
    (amount: number | null | undefined, fromCurrency: string = 'USD', opts?: { withCode?: boolean; minFractionDigits?: number; maxFractionDigits?: number }): string => {
      const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      const converted = convert(safe, fromCurrency);
      const minFrac = opts?.minFractionDigits ?? 0;
      const maxFrac = opts?.maxFractionDigits ?? 2;
      const formatted = (Math.round(converted * 100) / 100).toLocaleString(undefined, {
        minimumFractionDigits: minFrac,
        maximumFractionDigits: maxFrac,
      });
      return opts?.withCode ? `${symbol}${formatted} ${currency}` : `${symbol}${formatted}`;
    },
    [convert, symbol, currency]
  );

  return { currency, rate, symbol, format, convert };
}
