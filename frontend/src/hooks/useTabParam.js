import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Syncs a tab/section state with a URL search param so that the active tab
 * survives a browser refresh and can be deep-linked.
 *
 * Usage:
 *   const [tab, setTab] = useTabParam('tab', 'overview', ['overview', 'analytics']);
 *
 * - `paramName`  the query string key (e.g. 'tab' or 'section').
 * - `defaultValue` value used when the param is absent or invalid.
 * - `validValues` (optional) whitelist of acceptable values. Anything outside
 *   the list collapses to `defaultValue` so we never end up in an unknown tab.
 *
 * The setter uses `replace: true` so changing tabs does not pollute browser
 * history (back button still goes to the page the user came from, not through
 * every tab they touched).
 */
export default function useTabParam(paramName, defaultValue, validValues = null) {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(paramName);
  let value = raw ?? defaultValue;
  if (validValues && !validValues.includes(value)) value = defaultValue;

  const setValue = useCallback((next) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (next === defaultValue || next == null) {
        newParams.delete(paramName);
      } else {
        newParams.set(paramName, next);
      }
      return newParams;
    }, { replace: true });
  }, [setSearchParams, paramName, defaultValue]);

  return [value, setValue];
}
