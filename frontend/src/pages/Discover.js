import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ListingCard } from '../components/ListingCard';
import { useDiscoverFilters, CURRENCY_OPTIONS } from '../hooks/useDiscoverFilters';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { Search, MapPin, X, SlidersHorizontal, Loader, Lock } from 'lucide-react';
import { ListingGridSkeleton } from '../components/Skeletons';
import StructuredData, { buildListingsItemListSchema, usePageMeta } from '../components/StructuredData';
import FilterPanel from '../components/FilterPanel';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';

const TYPE_LABELS = { courses: 'Courses', dives: 'Fun Dives', day_trips: 'Land-based', liveaboards: 'Liveaboards', snorkeling: 'Snorkeling' };
const LEVEL_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const GUEST_VISIBLE_COUNT = 6;

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
    destCounts, typeCounts, levelCounts,
    filters, filtersRef, updateFilters,
    fetchListings, loadMore, clearAll, toggle, convertPrice, hasFilters,
  } = useDiscoverFilters({ user, urlCountry, globalCurrency, setGlobalCurrency, globalExchangeRates });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onLoadMore = useCallback(() => loadMore(), [loadMore]);
  const sentinelRef = useInfiniteScroll(onLoadMore, hasMore, loading || loadingMore);

  const [wishlistIds, setWishlistIds] = useState([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isGuest = !user;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchWishlistIds = useCallback(async () => {
    try { const res = await axios.get('/wishlist/ids'); setWishlistIds(res.data.listing_ids); } catch (e) { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) { fetchWishlistIds(); }
  }, [user, fetchWishlistIds]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, [setSearchTerm]);

  // Active filter chips
  const activeChips = useMemo(() => {
    const out = [];
    filters.types.forEach(v => out.push({ key: `t-${v}`, label: TYPE_LABELS[v] || v, remove: () => toggle('types', v) }));
    filters.countries.forEach(v => out.push({ key: `c-${v}`, label: v, remove: () => toggle('countries', v) }));
    filters.difficulties.forEach(v => out.push({ key: `d-${v}`, label: LEVEL_LABELS[v] || v, remove: () => toggle('difficulties', v) }));
    if (filters.priceActive) {
      const label = filters.priceMin && filters.priceMin > 0
        ? `${convertPrice(filters.priceMin / rate)} – ${convertPrice(filters.priceMax / rate)}`
        : `Up to ${convertPrice(filters.priceMax / rate)}`;
      out.push({ key: 'price', label, remove: () => { const f = updateFilters({ priceActive: false, priceMax: sliderMax, priceMin: 0 }); fetchListings(f); } });
    }
    if (filters.dateRange?.from) {
      const label = filters.dateRange.to
        ? `${filters.dateRange.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${filters.dateRange.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Pick dates';
      out.push({ key: 'date', label, remove: () => { const f = updateFilters({ dateRange: { from: undefined, to: undefined } }); fetchListings(f); } });
    }
    return out;
  }, [filters, toggle, convertPrice, rate, updateFilters, fetchListings, sliderMax]);

  // Handle filter panel apply
  const handleFilterApply = useCallback((draft) => {
    const f = updateFilters(draft);
    fetchListings(f);
  }, [updateFilters, fetchListings]);

  // Guest-gated listings
  const visibleListings = useMemo(() => {
    if (!isGuest) return listings;
    return listings.slice(0, GUEST_VISIBLE_COUNT);
  }, [isGuest, listings]);

  const columns = useMemo(() => {
    if (viewportWidth >= 1024) return 3;
    if (viewportWidth >= 768) return 2;
    return 1;
  }, [viewportWidth]);
  const rowCount = useMemo(() => Math.ceil(visibleListings.length / columns), [visibleListings.length, columns]);
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 430,
    overscan: 4,
  });

  const activeFilterCount = activeChips.length;
  const currencySymbol = CURRENCY_OPTIONS.find(c => c.code === currency)?.symbol || '$';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <DiscoverSeo listings={listings} />
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 md:px-12 py-6 sm:py-10" data-testid="discover-page">

        {/* Search + Filters Button */}
        <div className="flex gap-2 mb-4" data-testid="search-bar">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search dives, courses, destinations..."
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-full border border-slate-200 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 outline-none transition-all"
              value={searchTerm}
              onChange={handleSearchChange}
              data-testid="search-input"
            />
          </div>
          <button
            onClick={() => setFilterPanelOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-400 text-white text-sm font-bold rounded-full hover:bg-cyan-500 transition-colors shadow-sm"
            data-testid="open-filters-btn"
          >
            <SlidersHorizontal size={14} />
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
        </div>

        {/* Active Filter Chips */}
        {activeChips.length > 0 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide pb-0.5" data-testid="active-chips-bar">
            {activeChips.map(c => (
              <button
                key={c.key}
                onClick={c.remove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400 text-white text-xs font-semibold whitespace-nowrap hover:bg-cyan-500 transition-colors"
                data-testid={`active-${c.key}`}
              >
                <span className="max-w-[120px] truncate">{c.label}</span>
                <X size={12} />
              </button>
            ))}
            <button
              onClick={clearAll}
              className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold whitespace-nowrap hover:bg-slate-200 transition-colors"
              data-testid="clear-all-btn"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Results bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400 font-medium" data-testid="results-count">
            {loading ? '...' : `${listings.length} result${listings.length !== 1 ? 's' : ''}`}
          </p>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); fetchListings({ sortBy: e.target.value }); }}
            className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-3 py-1.5 border-0 cursor-pointer"
            data-testid="sort-select"
          >
            <option value="rating">Top Rated</option>
            <option value="price_asc">Price: Low</option>
            <option value="price_desc">Price: High</option>
            <option value="reviews">Most Reviewed</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        {/* Listings Grid */}
        {loading && listings.length === 0 ? (
          <ListingGridSkeleton count={6} />
        ) : visibleListings.length > 0 ? (
          <>
            <div className="mt-2" data-testid="listings-grid">
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                  const startIndex = virtualRow.index * columns;
                  const rowItems = visibleListings.slice(startIndex, startIndex + columns);
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

            {/* Guest gating overlay */}
            {isGuest && listings.length > GUEST_VISIBLE_COUNT && (
              <div className="relative -mt-8" data-testid="guest-gated-section">
                <div className="h-24 bg-gradient-to-b from-transparent to-white pointer-events-none" />
                <div className="flex flex-col items-center py-10 px-6" data-testid="guest-gating-card">
                  <div className="w-14 h-14 rounded-full bg-cyan-50 flex items-center justify-center mb-4">
                    <Lock size={24} className="text-cyan-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Log in to discover all listings</h3>
                  <p className="text-sm text-slate-500 mb-5 text-center max-w-sm">Sign in to explore the full catalog of dive trips, courses, and liveaboards from operators around the world.</p>
                  <button
                    onClick={() => openAuth()}
                    className="px-8 py-3 rounded-full bg-cyan-400 text-white font-bold text-sm hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-400/20"
                    data-testid="guest-login-btn"
                  >
                    Log in
                  </button>
                </div>
              </div>
            )}

            {!isGuest && (hasMore || loadingMore) && (
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
            <button onClick={clearAll} className="px-5 py-2 text-sm font-semibold text-white bg-cyan-400 rounded-full hover:bg-cyan-500 transition-colors" data-testid="clear-all-noresults-btn">Clear Filters</button>
          </div>
        )}
      </div>

      <Footer />

      {/* Filter Panel */}
      <FilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filters={filters}
        destinations={destinations}
        currency={currency}
        currencySymbol={currencySymbol}
        onApply={handleFilterApply}
        onClearAll={() => { clearAll(); setFilterPanelOpen(false); }}
        resultCount={listings.length}
      />
    </div>
  );
}

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
