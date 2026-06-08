import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ListingCard } from '../components/ListingCard';
import { useDiscoverFilters, CURRENCY_OPTIONS } from '../hooks/useDiscoverFilters';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { Search, MapPin, X, CalendarDays, Plus, ChevronDown, Loader } from 'lucide-react';
import { ListingGridSkeleton } from '../components/Skeletons';
import StructuredData, { buildListingsItemListSchema, usePageMeta } from '../components/StructuredData';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar } from '../components/ui/calendar';
import { Slider } from '../components/ui/slider';

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'courses', label: 'Courses' },
  { value: 'dives', label: 'Fun Dives' },
  { value: 'day_trips', label: 'Land-based Trips' },
  { value: 'liveaboards', label: 'Liveaboards' },
  { value: 'snorkeling', label: 'Snorkeling' }
];

// "Difficulty" filter (beginner/intermediate/advanced) was removed per
// brand decision 2026-06-08. The schema field is preserved server-side for
// future use; the UI surface is gone everywhere it used to render.

export default function Discover() {
  const { user } = useAuthStore();
  const openAuth = useUIStore(s => s.openAuth);
  const globalCurrency = useUIStore(s => s.currency);
  const setGlobalCurrency = useUIStore(s => s.setCurrency);
  const globalExchangeRates = useUIStore(s => s.exchangeRates);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCountry = searchParams.get('country') || '';

  const {
    listings, loading, loadingMore, hasMore, destinations, searchTerm, setSearchTerm, sortBy, setSortBy,
    currency, setCurrency, exchangeRates, rate, sliderMax,
    destCounts, typeCounts,
    filters, filtersRef, updateFilters,
    fetchListings, loadMore, clearAll, toggle, convertPrice, hasFilters,
  } = useDiscoverFilters({ user, urlCountry, globalCurrency, setGlobalCurrency, globalExchangeRates });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onLoadMore = useCallback(() => loadMore(), [loadMore]);
  const sentinelRef = useInfiniteScroll(onLoadMore, hasMore, loading || loadingMore);

  const [wishlistIds, setWishlistIds] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadRecentlyViewed = useCallback(async () => {
    try {
      const ids = JSON.parse(sessionStorage.getItem('bt_recently_viewed') || '[]');
      if (!ids.length) return;
      const res = await axios.get('/listings');
      setRecentlyViewed(ids.map(id => res.data.listings.find(l => l.id === id)).filter(Boolean).slice(0, 6));
    } catch (e) { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchWishlistIds = useCallback(async () => {
    try { const res = await axios.get('/wishlist/ids'); setWishlistIds(res.data.listing_ids); } catch (e) { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) { fetchWishlistIds(); }
    loadRecentlyViewed();
  }, [user, fetchWishlistIds, loadRecentlyViewed]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close currency picker on outside click
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showCurrencyPicker) return;
    const handler = (e) => {
      if (!e.target.closest('[data-testid="currency-selector-btn"]') && !e.target.closest('[data-testid="currency-dropdown"]')) {
        setShowCurrencyPicker(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showCurrencyPicker]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleWishlist = useCallback(async (listingId, e) => {
    e.stopPropagation();
    if (!user) { openAuth(); return; }
    try {
      const res = await axios.post(`/wishlist/${listingId}`);
      setWishlistIds(prev => res.data.wishlisted ? [...prev, listingId] : prev.filter(id => id !== listingId));
      toast.success(res.data.wishlisted ? 'Saved!' : 'Removed');
    } catch (e) { toast.error('Failed'); }
  }, [user, openAuth]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleViewListing = useCallback((listingId) => {
    navigate(`/listing/${listingId}`);
  }, [navigate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCurrencyChange = useCallback((code) => {
    setCurrency(code);
    setShowCurrencyPicker(false);
  }, [setCurrency]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, [setSearchTerm]);

  const visibleTypes = useMemo(() => (
    TYPE_OPTIONS.filter(o => o.value).filter(o => {
      const count = typeCounts[o.value] || 0;
      return count > 0 || filters.types.includes(o.value);
    })
  ), [typeCounts, filters.types]);

  const visibleDestinations = useMemo(() => (
    destinations.filter(d => {
      const count = destCounts[d.country] ?? d.listing_count;
      return count > 0 || filters.countries.includes(d.country);
    })
  ), [destinations, destCounts, filters.countries]);

  const columns = useMemo(() => {
    if (viewportWidth >= 1024) return 3;
    if (viewportWidth >= 768) return 2;
    return 1;
  }, [viewportWidth]);
  const rowCount = useMemo(() => Math.ceil(listings.length / columns), [listings.length, columns]);
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 430,
    overscan: 4,
  });

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* SEO: page meta + structured data */}
      <DiscoverSeo listings={listings} />
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 md:px-12 py-6 sm:py-10" data-testid="discover-page">

        {/* Search Bar */}
        <div className="flex gap-2 mb-6" data-testid="search-bar">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input type="text" placeholder="Search dives, courses, destinations..." className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 outline-none transition-all" value={searchTerm} onChange={handleSearchChange} data-testid="search-input" />
          </div>
          <button onClick={() => fetchListings()} className="px-4 py-2.5 bg-cyan-400 text-white text-sm font-semibold rounded-xl hover:bg-cyan-300 transition-colors" data-testid="search-btn">Search</button>
        </div>

        {/* Filters */}
        <div className="space-y-4 mb-6" data-testid="filter-section">
          <FilterRow label="Type" testId="filter-row-type">
            {visibleTypes.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No types match current filters. <button onClick={clearAll} className="text-cyan-400 font-semibold hover:underline">Clear filters</button></span>
            ) : visibleTypes.map(o => {
              const count = typeCounts[o.value] || 0;
              return (
                <button key={o.value} onClick={() => toggle('types', o.value)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${filters.types.includes(o.value) ? 'bg-cyan-400 text-white shadow-sm' : count === 0 ? 'bg-slate-50 text-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  data-testid={`pill-${o.value}`}>
                  {o.label}
                  <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center ${filters.types.includes(o.value) ? 'bg-white/25 text-white' : 'bg-cyan-100 text-cyan-400'}`}>{count}</span>
                </button>
              );
            })}
          </FilterRow>

          <FilterRow label="Destination" testId="filter-row-destination">
            {visibleDestinations.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No destinations match current filters. <button onClick={clearAll} className="text-cyan-400 font-semibold hover:underline">Clear filters</button></span>
            ) : visibleDestinations.map(d => {
              const count = destCounts[d.country] ?? d.listing_count;
              return (
                <button key={d.country} onClick={() => toggle('countries', d.country)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${filters.countries.includes(d.country) ? 'bg-cyan-400 text-white shadow-sm' : count === 0 ? 'bg-slate-50 text-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  data-testid="destination-pill">
                  {d.country}
                  <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center ${filters.countries.includes(d.country) ? 'bg-white/25 text-white' : 'bg-cyan-100 text-cyan-400'}`}>{count}</span>
                </button>
              );
            })}
          </FilterRow>

          <FilterRow label="Budget" testId="filter-row-budget" noClip>
            <div className="flex items-center gap-3 min-w-[280px]">
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all whitespace-nowrap"
                  data-testid="currency-selector-btn"
                >
                  {CURRENCY_OPTIONS.find(c => c.code === currency)?.symbol || currency}
                  <ChevronDown size={10} />
                </button>
                {showCurrencyPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 max-h-52 overflow-y-auto w-36" data-testid="currency-dropdown">
                    {CURRENCY_OPTIONS.map(c => (
                      <button
                        key={c.code}
                        onClick={() => handleCurrencyChange(c.code)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${currency === c.code ? 'font-bold text-cyan-400 bg-cyan-50' : 'text-slate-600'}`}
                        data-testid={`currency-option-${c.code}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Slider
                value={[filters.priceActive ? filters.priceMax : sliderMax]}
                onValueChange={([v]) => { filtersRef.current = { ...filtersRef.current, priceMax: v }; updateFilters({ priceMax: v, priceActive: true }); }}
                onValueCommit={([v]) => { const f = updateFilters({ priceMax: v, priceActive: true }); fetchListings(f); }}
                min={0} max={sliderMax} step={Math.max(1, Math.round(sliderMax / 100))}
                color="cyan"
                className="flex-1 min-w-0"
                data-testid="price-slider"
              />
              <div className="shrink-0 w-[80px] flex items-center gap-1">
                <span className={`text-xs font-semibold whitespace-nowrap ${filters.priceActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {filters.priceActive ? `${convertPrice(filters.priceMax / rate)}` : 'Any'}
                </span>
                {filters.priceActive && (
                  <button onClick={() => { const f = updateFilters({ priceActive: false, priceMax: sliderMax }); fetchListings(f); }} className="text-slate-300 hover:text-red-500"><X size={12} /></button>
                )}
              </div>
            </div>
          </FilterRow>

          <FilterRow label="Dates" testId="filter-row-dates">
            <button onClick={() => setShowDatePicker(!showDatePicker)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${filters.dateRange.from ? 'bg-cyan-400 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              data-testid="date-filter-btn">
              <CalendarDays size={12} />
              {filters.dateRange.from ? (filters.dateRange.to ? `${filters.dateRange.from.toLocaleDateString('en-US',{month:'short',day:'numeric'})} \u2013 ${filters.dateRange.to.toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : 'Select end date') : 'Any dates'}
            </button>
            {filters.dateRange.from && (
              <button onClick={() => { const f = updateFilters({ dateRange: { from: undefined, to: undefined } }); fetchListings(f); }}
                className="px-3 py-1.5 rounded-full text-[10px] font-semibold text-red-500 bg-red-50 hover:bg-red-100" data-testid="clear-dates-inline">
                <X size={10} className="inline" /> Clear
              </button>
            )}
          </FilterRow>

          {hasFilters && (
            <div className="pt-1">
              <button onClick={clearAll} className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors" data-testid="clear-all-btn">
                <X size={10} className="inline mr-0.5" /> Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Date Picker Dropdown */}
        {showDatePicker && (
          <div className="mb-5 bg-slate-50 rounded-2xl p-4 fade-in" data-testid="date-picker-panel">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <Calendar mode="range" selected={filters.dateRange} onSelect={r => updateFilters({ dateRange: r || { from: undefined, to: undefined } })} numberOfMonths={1} fromDate={new Date()} className="mx-auto" data-testid="date-range-calendar" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-500">{filters.dateRange.from && filters.dateRange.to ? 'Filter by available dates' : filters.dateRange.from ? 'Select end date' : 'Pick travel dates'}</p>
                <div className="flex gap-2">
                  <button onClick={() => { fetchListings(filtersRef.current); setShowDatePicker(false); }} disabled={!filters.dateRange.from} className="px-3 py-1.5 bg-cyan-400 text-white text-xs font-semibold rounded-lg disabled:opacity-40" data-testid="apply-dates-btn">Apply</button>
                  <button onClick={() => { const f = updateFilters({ dateRange: { from: undefined, to: undefined } }); fetchListings(f); setShowDatePicker(false); }} className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg" data-testid="clear-dates-btn">Clear</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400 font-medium" data-testid="results-count">{loading ? '...' : `${listings.length} result${listings.length !== 1 ? 's' : ''}`}</p>
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); fetchListings({ sortBy: e.target.value }); }}
            className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-3 py-1.5 border-0 cursor-pointer" data-testid="sort-select">
            <option value="rating">Top Rated</option>
            <option value="price_asc">Price: Low</option>
            <option value="price_desc">Price: High</option>
            <option value="reviews">Most Reviewed</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && !hasFilters && (
          <div className="mb-8" data-testid="recently-viewed-section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">Recently Viewed</h3>
              <button onClick={() => { sessionStorage.removeItem('bt_recently_viewed'); setRecentlyViewed([]); }} className="text-[10px] text-slate-400 hover:text-slate-600" data-testid="clear-recent-btn">Clear</button>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {recentlyViewed.map(l => (
                <div key={l.id} onClick={() => navigate(`/listing/${l.id}`)} className="flex-shrink-0 w-44 rounded-xl border border-slate-100 overflow-hidden cursor-pointer group hover:shadow-md transition-all" data-testid="recently-viewed-card">
                  <div className="h-24 overflow-hidden"><img src={l.image_url} alt={l.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /></div>
                  <div className="p-2"><p className="text-xs font-semibold line-clamp-1">{l.name}</p><p className="text-[10px] text-slate-400 flex items-center gap-0.5"><MapPin size={9} />{l.location}</p></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Listings Grid */}
        {loading && listings.length === 0 ? (
          <ListingGridSkeleton count={6} />
        ) : listings.length > 0 ? (
          <>
          <div className="mt-2" data-testid="listings-grid">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const startIndex = virtualRow.index * columns;
                const rowItems = listings.slice(startIndex, startIndex + columns);
                return (
                  <div
                    key={virtualRow.index}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="grid gap-6 pb-6"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                  >
                    {rowItems.map(listing => (
                      <ListingCard key={listing.id} listing={listing} convertPrice={convertPrice}
                        wishlisted={wishlistIds.includes(listing.id)} onToggleWishlist={toggleWishlist}
                        onView={handleViewListing} user={user} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          {(hasMore || loadingMore) && (
            <div ref={sentinelRef} className="flex justify-center py-8" data-testid="infinite-scroll-sentinel">
              {loadingMore && <Loader className="animate-spin text-cyan-400" size={24} />}
            </div>
          )}
          </>
        ) : (
          <div className="text-center py-16" data-testid="no-results">
            <MapPin className="text-slate-300 mx-auto mb-3" size={40} />
            <h3 className="text-base font-bold mb-1">No results</h3>
            <p className="text-slate-500 text-sm mb-4">Try adjusting your filters</p>
            <button onClick={clearAll} className="btn-primary px-5 py-2 text-sm" data-testid="clear-all-noresults-btn">Clear Filters</button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

/* ====== FILTER ROW — scrollable on mobile ====== */
const FilterRow = memo(function FilterRow({ label, testId, children, noClip }) {
  return (
    <div data-testid={testId}>
      <span className="block text-[10px] text-cyan-400/60 font-semibold uppercase tracking-wider mb-1.5">{label}</span>
      <div className={`flex items-center gap-2 pb-0.5 -mb-0.5 ${noClip ? '' : 'overflow-x-auto scrollbar-hide'}`}>
        {children}
      </div>
    </div>
  );
});


/* ====== SEO injector for Discover ====== */
function DiscoverSeo({ listings }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const itemList = listings && listings.length > 0 ? buildListingsItemListSchema(listings, origin) : null;
  usePageMeta({
    title: 'Discover Dive Trips, Liveaboards & Courses · Bottom Time',
    description: 'Browse verified dive trips, courses, and liveaboards from operators around the world. Find your next underwater adventure on Bottom Time.',
    url: `${origin}/discover`,
  });
  if (!itemList) return null;
  return <StructuredData id="discover-itemlist" data={itemList} />;
}
