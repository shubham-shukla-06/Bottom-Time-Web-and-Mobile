import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '\u20AC', label: 'EUR (\u20AC)' },
  { code: 'GBP', symbol: '\u00A3', label: 'GBP (\u00A3)' },
  { code: 'INR', symbol: '\u20B9', label: 'INR (\u20B9)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
  { code: 'JPY', symbol: '\u00A5', label: 'JPY (\u00A5)' },
  { code: 'THB', symbol: '\u0E3F', label: 'THB (\u0E3F)' },
  { code: 'IDR', symbol: 'Rp', label: 'IDR (Rp)' },
  { code: 'MYR', symbol: 'RM', label: 'MYR (RM)' },
  { code: 'PHP', symbol: '\u20B1', label: 'PHP (\u20B1)' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$)' },
  { code: 'NZD', symbol: 'NZ$', label: 'NZD (NZ$)' },
  { code: 'BRL', symbol: 'R$', label: 'BRL (R$)' },
  { code: 'MXN', symbol: 'MX$', label: 'MXN (MX$)' },
];

const BASE_MAX_USD = 5000;

export { CURRENCY_OPTIONS };

// Compute facet counts from a broad result set, applying cross-filters
function computeFacets(allItems, ff, destinations) {
  const { types: t, countries: c, difficulties: d } = ff;

  // Type counts: apply country + difficulty filters, then count by type
  const typeFiltered = allItems.filter(l =>
    (!c.length || c.includes(l.country)) &&
    (!d.length || d.includes(l.difficulty))
  );
  const typeCounts = {};
  typeFiltered.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });

  // Destination counts: apply type + difficulty filters, then count by country
  const destFiltered = allItems.filter(l =>
    (!t.length || t.includes(l.type)) &&
    (!d.length || d.includes(l.difficulty))
  );
  const destCounts = {};
  destinations.forEach(dd => { destCounts[dd.country] = 0; });
  destFiltered.forEach(l => { destCounts[l.country] = (destCounts[l.country] || 0) + 1; });

  // Level counts: apply type + country filters, then count by difficulty
  const levelFiltered = allItems.filter(l =>
    (!t.length || t.includes(l.type)) &&
    (!c.length || c.includes(l.country))
  );
  const levelCounts = {};
  levelFiltered.forEach(l => {
    if (l.difficulty) levelCounts[l.difficulty] = (levelCounts[l.difficulty] || 0) + 1;
  });

  return { typeCounts, destCounts, levelCounts };
}

export function useDiscoverFilters({ user, urlCountry, globalCurrency, setGlobalCurrency, globalExchangeRates }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('rating');
  const currency = globalCurrency || 'USD';
  const setCurrency = setGlobalCurrency || (() => {});
  const exchangeRates = globalExchangeRates || { USD: 1 };
  const [destCounts, setDestCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});
  const [levelCounts, setLevelCounts] = useState({});

  const rate = exchangeRates[currency] || 1;
  const sliderMax = Math.round(BASE_MAX_USD * rate);

  // Ref for searchTerm so fetchListings always reads the latest
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;

  // AbortController ref to cancel stale requests
  const abortRef = useRef(null);

  const [filters, setFilters] = useState({
    types: [], countries: urlCountry ? [urlCountry] : [], difficulties: [],
    priceMin: 0, priceMax: Math.round(BASE_MAX_USD * (exchangeRates[currency] || 1)), priceActive: false, dateRange: { from: undefined, to: undefined },
  });
  const filtersRef = useRef(filters);
  const destinationsRef = useRef(destinations);
  destinationsRef.current = destinations;

  const updateFilters = (patch) => {
    const next = { ...filtersRef.current, ...patch };
    filtersRef.current = next;
    setFilters(next);
    return next;
  };

  const prevCurrencyRef = useRef(currency);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = prevCurrencyRef.current;
    if (prev !== currency && filters.priceActive) {
      const oldRate = exchangeRates[prev] || 1;
      const newRate = exchangeRates[currency] || 1;
      const usdValue = filters.priceMax / oldRate;
      const newMax = Math.round(usdValue * newRate);
      const f = updateFilters({ priceMax: Math.min(newMax, sliderMax) });
      fetchListings(f);
    }
    prevCurrencyRef.current = currency;
  }, [currency]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchListings();
    fetchDestinations();
    fetchExchangeRates();
  }, []);

  // Debounced live search — triggers 400ms after user stops typing
  const debounceRef = useRef(null);
  const initialLoadDone = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!initialLoadDone.current) { initialLoadDone.current = true; return; }
    // Only search if empty (clear) or 2+ chars
    if (searchTerm.length > 0 && searchTerm.length < 2) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchListings(), 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (urlCountry && !filters.countries.includes(urlCountry)) {
      const f = updateFilters({ countries: [urlCountry] });
      fetchListings(f);
    }
  }, [urlCountry]);

  const fetchDestinations = async () => {
    try {
      const res = await axios.get('/destinations');
      setDestinations(res.data.destinations);
      const counts = {};
      res.data.destinations.forEach(d => { counts[d.country] = d.listing_count; });
      setDestCounts(counts);
    } catch (e) { /* silent */ }
  };

  const fetchExchangeRates = async () => {};

  const fetchListings = async (f, append = false) => {
    const ff = f || filtersRef.current;
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const { types: t, countries: c, difficulties: d, priceActive: pa, priceMax: pm, dateRange: dr } = ff;
      const currentRate = exchangeRates[currency] || 1;
      const maxPriceUSD = Math.round(pm / currentRate);
      const search = searchTermRef.current;

      // Main query — all filters applied
      const p = new URLSearchParams();
      if (t.length) p.append('type', t.join(','));
      if (c.length) p.append('country', c.join(','));
      if (d.length) p.append('difficulty', d.join(','));
      if (pa) {
        p.append('max_price', maxPriceUSD);
        const minPriceUSD = Math.round((ff.priceMin || 0) / currentRate);
        if (minPriceUSD > 0) p.append('min_price', minPriceUSD);
      }
      if (search) p.append('search', search);
      p.append('sort_by', sortBy);
      p.append('limit', '20');
      p.append('include_reviews', 'true');
      if (append) p.append('skip', String(listings.length));

      // Track search events
      if (search && search.length >= 2) {
        axios.post(sessionStorage.getItem('token') ? '/track' : '/track/anon', { event_type: 'search', data: { query: search } }).catch(() => {});
      }
      if (dr?.from && dr?.to) {
        p.append('available_from', dr.from.toISOString().split('T')[0]);
        p.append('available_to', dr.to.toISOString().split('T')[0]);
      } else if (dr?.from) {
        p.append('available_date', dr.from.toISOString().split('T')[0]);
      }

      // Facets query — only budget + date + search (no type/country/difficulty)
      const fp = new URLSearchParams();
      if (pa) fp.append('max_price', maxPriceUSD);
      if (search) fp.append('search', search);
      fp.append('limit', '100');

      const hasAnyFilter = t.length || c.length || d.length || pa || search;

      const [res, facetRes] = await Promise.all([
        axios.get(`/listings?${p.toString()}`, { signal: controller.signal }),
        !append && hasAnyFilter ? axios.get(`/listings?${fp.toString()}`, { signal: controller.signal }) : null,
      ]);

      if (append) {
        setListings(prev => [...prev, ...res.data.listings]);
      } else {
        setListings(res.data.listings);
      }
      setHasMore(res.data.has_more || false);

      // Compute facet counts
      if (!append) {
        const dests = destinationsRef.current;
        if (facetRes) {
          const facets = computeFacets(facetRes.data.listings, ff, dests);
          setTypeCounts(facets.typeCounts);
          setDestCounts(facets.destCounts);
          setLevelCounts(facets.levelCounts);
        } else {
          // No filters active — compute from all results
          const facets = computeFacets(res.data.listings, ff, dests);
          setTypeCounts(facets.typeCounts);
          setDestCounts(facets.destCounts);
          setLevelCounts(facets.levelCounts);
        }
      }
    } catch (e) {
      if (axios.isCancel(e) || e.name === 'AbortError' || e.name === 'CanceledError') return;
      toast.error('Failed to load');
    }
    finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadMore = () => fetchListings(filtersRef.current, true);

  const clearAll = () => {
    const next = updateFilters({ types: [], countries: [], difficulties: [], priceMin: 0, priceMax: sliderMax, priceActive: false, dateRange: { from: undefined, to: undefined } });
    setSearchTerm('');
    fetchListings(next);
  };

  const toggle = (key, val) => {
    const arr = filtersRef.current[key];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    const f = updateFilters({ [key]: next });
    fetchListings(f);
  };

  const convertPrice = (price) => {
    const locales = { USD:'en-US', EUR:'de-DE', GBP:'en-GB', INR:'en-IN', AUD:'en-AU', CAD:'en-CA', JPY:'ja-JP', THB:'th-TH', IDR:'id-ID', MYR:'ms-MY', PHP:'en-PH', SGD:'en-SG', NZD:'en-NZ', BRL:'pt-BR', MXN:'es-MX' };
    const symbols = { USD:'$', EUR:'\u20AC', GBP:'\u00A3', INR:'\u20B9', AUD:'A$', CAD:'C$', JPY:'\u00A5', THB:'\u0E3F', IDR:'Rp', MYR:'RM', PHP:'\u20B1', SGD:'S$', NZD:'NZ$', BRL:'R$', MXN:'MX$' };
    const converted = price * (exchangeRates[currency] || 1);
    const isWhole = Math.abs(converted - Math.round(converted)) < 0.005;
    const num = new Intl.NumberFormat(locales[currency] || 'en-US', { style: 'decimal', minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: isWhole ? 0 : 2 }).format(isWhole ? Math.round(converted) : converted);
    return `${symbols[currency] || currency + ' '}${num}`;
  };

  const hasFilters = filters.types.length || filters.countries.length || filters.difficulties.length || filters.priceActive || filters.dateRange.from;

  return {
    listings, loading, loadingMore, hasMore, destinations, searchTerm, setSearchTerm, sortBy, setSortBy,
    currency, setCurrency, exchangeRates, rate, sliderMax,
    destCounts, typeCounts, levelCounts,
    filters, filtersRef, updateFilters,
    fetchListings, loadMore, clearAll, toggle, convertPrice, hasFilters,
  };
}
