/* Backwards-compat shim — see /app/frontend/src/data/countries.js for the canonical
   ISO 3166-1 list (245 entries, with name/iso/code/flag). All consumers should
   eventually import from `../../data/countries`; this module simply re-exports so
   existing call-sites in ShippingStep.js (and elsewhere) keep working unchanged. */
export { COUNTRIES, COUNTRY_NAMES } from '../../data/countries';
