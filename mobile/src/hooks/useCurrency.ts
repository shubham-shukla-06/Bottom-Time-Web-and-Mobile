/**
 * useCurrency — central currency hook for the mobile app.
 *
 * Mirrors web `frontend/src/utils/currency.js`:
 *   • Reads `currency` + `exchangeRates` from uiStore (USD-base rates).
 *   • `format(amount, fromCurrency)` converts amount → user's currency, then
 *     formats with the target locale's grouping (Intl.NumberFormat) and
 *     web's exact decimal rule: whole numbers → 0 decimals, else → 2.
 *   • If rates haven't loaded yet (cold-boot race), renders the amount as-is
 *     in its source currency with its source symbol so the user never sees
 *     `$0` or `NaN`. Conversion kicks in automatically as soon as the boot
 *     effect in `_layout.tsx` populates the rates.
 *
 * The store also pushes the currency choice to `/auth/profile` whenever
 * the picker changes it (best-effort) and persists via SecureStore.
 */
import { useCallback } from 'react';
import useUIStore, {
  CURRENCY_SYMBOLS, CURRENCY_LOCALES, convertPrice,
} from '../stores/uiStore';

interface FormatOpts {
  withCode?: boolean;
  minFractionDigits?: number;
  maxFractionDigits?: number;
}

interface UseCurrencyReturn {
  currency: string;
  rate: number;
  symbol: string;
  ratesLoaded: boolean;
  format: (amount: number | null | undefined, fromCurrency?: string, opts?: FormatOpts) => string;
  convert: (amount: number, fromCurrency?: string) => number;
}

export default function useCurrency(): UseCurrencyReturn {
  const currency = useUIStore((s) => s.currency);
  const rates = useUIStore((s) => s.exchangeRates);
  const ratesLoaded = useUIStore((s) => s.ratesLoaded);

  const rate = currency === 'USD' ? 1 : (rates[currency] || 1);
  const symbol = CURRENCY_SYMBOLS[currency] || '';

  const convert = useCallback(
    (amount: number, fromCurrency: string = 'USD'): number => {
      if (!amount || isNaN(amount)) return 0;
      return convertPrice(amount, fromCurrency, currency, rates);
    },
    [currency, rates],
  );

  const format = useCallback(
    (amount: number | null | undefined, fromCurrency: string = 'USD', opts?: FormatOpts): string => {
      const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;

      // Loading-state fallback: rates not yet fetched AND a conversion is
      // required → render amount in its source currency so the user sees a
      // real price (not $0 or a misleading symbol-swap). The component will
      // re-render once `ratesLoaded` flips to true.
      if (!ratesLoaded && fromCurrency !== currency) {
        const srcSym = CURRENCY_SYMBOLS[fromCurrency] || '';
        const srcLoc = CURRENCY_LOCALES[fromCurrency] || 'en-US';
        const wholeSrc = Math.round(safe) === safe;
        const minFracSrc = opts?.minFractionDigits ?? (wholeSrc ? 0 : 2);
        const maxFracSrc = opts?.maxFractionDigits ?? (wholeSrc ? 0 : 2);
        const fSrc = new Intl.NumberFormat(srcLoc, {
          style: 'decimal',
          minimumFractionDigits: minFracSrc,
          maximumFractionDigits: maxFracSrc,
        }).format(safe);
        return opts?.withCode ? `${srcSym}${fSrc} ${fromCurrency}` : `${srcSym}${fSrc}`;
      }

      // Normal path: convert → round to 2dp → format with target locale.
      const converted = fromCurrency === currency
        ? safe
        : Math.round(convert(safe, fromCurrency) * 100) / 100;
      const locale = CURRENCY_LOCALES[currency] || 'en-US';
      const isWhole = Math.round(converted) === converted;
      const minFrac = opts?.minFractionDigits ?? (isWhole ? 0 : 2);
      const maxFrac = opts?.maxFractionDigits ?? (isWhole ? 0 : 2);
      const formatted = new Intl.NumberFormat(locale, {
        style: 'decimal',
        minimumFractionDigits: minFrac,
        maximumFractionDigits: maxFrac,
      }).format(converted);
      return opts?.withCode ? `${symbol}${formatted} ${currency}` : `${symbol}${formatted}`;
    },
    [convert, symbol, currency, ratesLoaded],
  );

  return { currency, rate, symbol, ratesLoaded, format, convert };
}
