/**
 * Country normalization helpers — single source of truth for "is this
 * country X?" checks. Accepts either the spelled-out country name (e.g.
 * "India", "INDIA", " india ") OR the ISO-3166 alpha-2 code ("IN", "in").
 *
 * Mirrors the backend `tax_engine.is_india()` helper so frontend and backend
 * normalize identically — no drift between the two.
 *
 * Use these helpers everywhere instead of inline `=== 'India'` checks.
 */
import { COUNTRIES } from '../data/countries';

/** True iff `country` refers to India (accepts name OR ISO-2). */
export const isIndia = (country) =>
  ['india', 'in'].includes((country || '').trim().toLowerCase());

/**
 * Normalize a free-form country value to its canonical ISO-2 code.
 * Returns the input untouched if no match (graceful fallback for unknown
 * inputs). Use this before storing a country in user-generated records
 * so the persisted value is always ISO-2.
 */
export const toIso2 = (value) => {
  if (!value) return '';
  const v = value.trim();
  if (v.length === 2 && /^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const lower = v.toLowerCase();
  const hit = COUNTRIES.find(c => c.name.toLowerCase() === lower);
  return hit ? hit.iso : value;
};

/**
 * Look up the canonical country entry by either name or ISO-2.
 * Returns `null` when nothing matches.
 */
export const findCountry = (value) => {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return COUNTRIES.find(c => c.name.toLowerCase() === v || c.iso.toLowerCase() === v) || null;
};

/** Friendly display name — falls back to the raw value when unmatched. */
export const countryName = (value) => findCountry(value)?.name || value || '';
