import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import useCartStore from '../stores/cartStore';
import Navbar from '../components/Navbar';
import { ShoppingBag, Search, ShoppingCart, Loader, SlidersHorizontal, X, Check, ChevronDown, Minus, Plus, Heart, Star } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import Footer from '../components/Footer';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

import { ProductGridSkeleton } from '../components/Skeletons';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'merch', label: 'Merch' },
  { value: 'gear', label: 'Gear' },
  { value: 'essentials', label: 'Dive Essentials' }
];

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' }
];

const PRICE_RANGES = [
  { label: 'Any', min: 0, max: 99999 },
  { label: 'Under $25', min: 0, max: 25 },
  { label: '$25–$50', min: 25, max: 50 },
  { label: '$50–$100', min: 50, max: 100 },
  { label: '$100+', min: 100, max: 99999 },
];

const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '\u20AC', label: 'EUR (\u20AC)' },
  { code: 'GBP', symbol: '\u00A3', label: 'GBP (\u00A3)' },
  { code: 'INR', symbol: '\u20B9', label: 'INR (\u20B9)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
  { code: 'JPY', symbol: '\u00A5', label: 'JPY (\u00A5)' },
  { code: 'THB', symbol: '\u0E3F', label: 'THB (\u0E3F)' },
];

const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white overflow-hidden animate-pulse">
      <div className="h-44 sm:h-52 bg-slate-100" />
      <div className="p-3.5">
        <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
        <div className="h-3 bg-slate-50 rounded w-full mb-3" />
        <div className="flex justify-between items-center pt-2 border-t border-slate-50">
          <div className="h-5 bg-slate-100 rounded w-16" />
          <div className="h-7 bg-slate-50 rounded-full w-16" />
        </div>
      </div>
    </div>
  );
});

const CustomSortDropdown = memo(function CustomSortDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value) || options[0];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-slate-100 rounded-full outline-none hover:bg-slate-200 cursor-pointer font-semibold text-slate-600 transition-colors whitespace-nowrap"
        data-testid="shop-sort">
        {selected.label}
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-slate-100 shadow-[0_12px_40px_rgb(0,0,0,0.10)] py-1 z-50" data-testid="sort-dropdown-menu">
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${o.value === value ? 'bg-cyan-50 text-cyan-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
              data-testid={`sort-${o.value}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const CurrencySelector = memo(function CurrencySelector({ currency, setCurrency }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = CURRENCY_OPTIONS.find(c => c.code === currency) || CURRENCY_OPTIONS[0];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-100 rounded-full hover:bg-slate-200 cursor-pointer font-semibold text-slate-600 transition-colors whitespace-nowrap"
        data-testid="currency-selector-btn">
        {current.symbol} {current.code}
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-100 rounded-xl shadow-[0_12px_40px_rgb(0,0,0,0.10)] py-1 max-h-52 overflow-y-auto w-36 z-50" data-testid="currency-dropdown">
          {CURRENCY_OPTIONS.map(c => (
            <button key={c.code} onClick={() => { setCurrency(c.code); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${currency === c.code ? 'font-bold text-cyan-400 bg-cyan-50' : 'text-slate-600'}`}
              data-testid={`currency-option-${c.code}`}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default function Shop() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const currency = useUIStore(s => s.currency);
  const setCurrency = useUIStore(s => s.setCurrency);
  const exchangeRates = useUIStore(s => s.exchangeRates);
  const wishlistedProductIds = useUIStore(s => s.wishlistedProductIds);
  const refreshWishlist = useUIStore(s => s.refreshWishlist);
  const { refreshCart, cartItems } = useCartStore();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [search, setSearch] = useState('');
  const [priceRange, setPriceRange] = useState(PRICE_RANGES[0]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const productsLengthRef = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchProducts = useCallback(async (overrideCat, overrideSort, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      const cat = overrideCat !== undefined ? overrideCat : category;
      if (cat) params.append('category', cat);
      if (search) params.append('search', search);
      params.append('sort_by', overrideSort || sortBy);
      params.append('limit', '20');
      if (append) params.append('skip', String(productsLengthRef.current));

      const response = await axios.get(`/products?${params.toString()}`);
      let filtered = response.data.products;

      if (priceRange.max < 99999 || priceRange.min > 0) {
        filtered = filtered.filter(p => p.price >= priceRange.min && p.price <= priceRange.max);
      }
      if (inStockOnly) {
        filtered = filtered.filter(p => p.in_stock);
      }

      if (append) {
        setProducts(prev => {
          const next = [...prev, ...filtered];
          productsLengthRef.current = next.length;
          return next;
        });
      } else {
        setProducts(filtered);
        productsLengthRef.current = filtered.length;
      }
      setResultCount(response.data.total || filtered.length);
      setHasMore(response.data.has_more || false);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, search, sortBy, priceRange, inStockOnly]);

  // Ref to always hold the latest fetchProducts without triggering effects
  const fetchRef = useRef(fetchProducts);
  fetchRef.current = fetchProducts;

  // Initial load — runs exactly once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchRef.current();
  }, []);

  // Debounced search — only fires when search value actually changes (not on mount)
  const debounceRef = useRef(null);
  const isInitialMount = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    if (search.length > 0 && search.length < 2) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRef.current(), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Build a map of product_id -> total quantity in cart
  const cartMap = useMemo(() => {
    const map = {};
    (cartItems || []).forEach(item => {
      map[item.product_id] = (map[item.product_id] || 0) + item.quantity;
    });
    return map;
  }, [cartItems]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadMoreProducts = useCallback(() => fetchProducts(undefined, undefined, true), [fetchProducts]);
  const sentinelRef = useInfiniteScroll(loadMoreProducts, hasMore, loading || loadingMore);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCategoryChange = useCallback((cat) => {
    setCategory(cat);
    fetchProducts(cat);
  }, [fetchProducts]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSort = useCallback((sort) => {
    setSortBy(sort);
    fetchProducts(undefined, sort);
  }, [fetchProducts]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearch = useCallback(() => fetchProducts(), [fetchProducts]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clearFilters = useCallback(() => {
    setCategory('');
    setSortBy('popular');
    setSearch('');
    setPriceRange(PRICE_RANGES[0]);
    setInStockOnly(false);
    fetchProducts('', 'popular');
  }, [fetchProducts]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearchInput = useCallback((event) => {
    setSearch(event.target.value);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleFilters = useCallback(() => setShowFilters(prev => !prev), []);

  const hasActiveFilters = category || search || priceRange.min > 0 || priceRange.max < 99999 || inStockOnly;

  const columns = useMemo(() => {
    if (viewportWidth >= 1024) return 4;
    if (viewportWidth >= 768) return 3;
    return 2;
  }, [viewportWidth]);

  const rowCount = useMemo(() => Math.ceil(products.length / columns), [products.length, columns]);
  const productVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 380,
    overscan: 4,
  });

  return (
    <div className="min-h-screen bg-slate-50/40 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-10 pt-6 pb-10" data-testid="shop-page">

        {/* Header */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Shop</h1>
            <p className="text-sm text-slate-500 mt-0.5">Gear & merch for your next dive</p>
          </div>
          <span className="text-xs text-slate-400" data-testid="result-count">{resultCount} product{resultCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category pills — match Discover sizing */}
            <div className="flex gap-1.5">
              {CATEGORIES.map(({ value, label }) => {
                const isActive = category === value;
                return (
                  <button key={value} onClick={() => handleCategoryChange(value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${isActive ? 'bg-cyan-400 text-white shadow-sm shadow-cyan-400/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    data-testid={`cat-${value || 'all'}`}>
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

            {/* Search — taller, instant as-you-type */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 transition-all placeholder:text-slate-400"
                placeholder="Search products..." value={search}
                onChange={handleSearchInput} data-testid="shop-search" />
            </div>

            {/* Custom Sort Dropdown */}
            <CustomSortDropdown value={sortBy} onChange={handleSort} options={SORT_OPTIONS} />

            {/* Currency Selector */}
            <CurrencySelector currency={currency} setCurrency={setCurrency} />

            {/* Filter toggle */}
            <button onClick={toggleFilters}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${showFilters ? 'bg-cyan-400 text-white shadow-sm shadow-cyan-400/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              data-testid="toggle-filters">
              <SlidersHorizontal size={14} /> Filters
            </button>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 font-medium" data-testid="clear-filters">
                <X size={11} /> Clear
              </button>
            )}
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl px-4 py-3 border border-slate-100" data-testid="filter-panel">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Price</span>
                {PRICE_RANGES.map(r => (
                  <button key={r.label} onClick={() => { setPriceRange(r); setTimeout(handleSearch, 50); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${priceRange.label === r.label ? 'bg-cyan-400 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    data-testid={`price-${r.label.replace(/\s/g, '-')}`}>{r.label}</button>
                ))}
              </div>
              <div className="h-4 w-px bg-slate-200" />
              <button onClick={() => { setInStockOnly(!inStockOnly); setTimeout(handleSearch, 50); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${inStockOnly ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                data-testid="in-stock-filter">
                {inStockOnly ? 'In Stock' : 'All Stock'}
              </button>
            </div>
          )}
        </div>

        {/* Products Grid */}
        {loading && products.length === 0 ? (
          <ProductGridSkeleton count={8} />
        ) : products.length > 0 ? (
          <>
            <div className="mt-1" data-testid="products-grid">
              <div style={{ height: productVirtualizer.getTotalSize(), position: 'relative' }}>
                {productVirtualizer.getVirtualItems().map(virtualRow => {
                  const startIndex = virtualRow.index * columns;
                  const rowItems = products.slice(startIndex, startIndex + columns);
                  return (
                    <div
                      key={virtualRow.index}
                      data-index={virtualRow.index}
                      ref={productVirtualizer.measureElement}
                      className="grid gap-3 sm:gap-4 pb-4"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                    >
                      {rowItems.map(product => (
                        <ProductCard key={product.id} product={product} currency={currency} exchangeRates={exchangeRates} cartQty={cartMap[product.id] || 0} wishlisted={wishlistedProductIds.includes(product.id)} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <div ref={sentinelRef} className="py-4 text-center">
              {loadingMore && <Loader className="animate-spin text-slate-300 mx-auto" size={20} />}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <ShoppingBag className="text-slate-200 mx-auto mb-3" size={48} />
            <p className="text-base font-semibold text-slate-700 mb-1">No products found</p>
            <p className="text-slate-400 text-sm mb-4">Try adjusting your filters</p>
            {hasActiveFilters && <button onClick={clearFilters} className="text-sm font-semibold text-cyan-500 hover:text-cyan-600">Clear Filters</button>}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

const CATEGORY_BADGE = {
  merch: 'bg-violet-500/80 text-white',
  gear: 'bg-emerald-500/80 text-white',
  essentials: 'bg-cyan-500/80 text-white',
};
const CATEGORY_LABEL = { merch: 'Merch', gear: 'Gear', essentials: 'Essentials' };

const ProductCard = memo(function ProductCard({ product, currency, exchangeRates, cartQty, wishlisted }) {
  const navigate = useNavigate();
  const openAuth = useUIStore(s => s.openAuth);
  const user = useAuthStore(s => s.user);
  const refreshCart = useCartStore(s => s.refreshCart);
  const refreshWishlist = useUIStore(s => s.refreshWishlist);
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || null);
  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const getCurrencySymbol = (c) => {
    const symbols = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', INR: '\u20B9', AUD: 'A$', CAD: 'C$', JPY: '\u00A5', THB: '\u0E3F' };
    return symbols[c] || c + ' ';
  };
  const formatPrice = (price) => {
    const rate = exchangeRates[currency] || 1;
    const converted = price * rate;
    const locales = { USD:'en-US', EUR:'de-DE', GBP:'en-GB', INR:'en-IN', AUD:'en-AU', CAD:'en-CA', JPY:'ja-JP', THB:'th-TH' };
    const isWhole = Math.abs(converted - Math.round(converted)) < 0.005;
    const num = new Intl.NumberFormat(locales[currency] || 'en-US', { style: 'decimal', minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: isWhole ? 0 : 2 }).format(isWhole ? Math.round(converted) : converted);
    return `${getCurrencySymbol(currency)}${num}`;
  };

  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.compare_at_price) * 100) : 0;

  const handleAdd = async (e) => {
    e.stopPropagation();
    if (!user) { openAuth(); return; }
    if (product.sizes?.length > 0 && !selectedSize) { toast.error('Select a size first'); return; }
    setBusy(true);
    try {
      await axios.post(`/cart/add?product_id=${product.id}&quantity=1${selectedSize ? `&size=${selectedSize}` : ''}`);
      setJustAdded(true);
      await refreshCart();
      setTimeout(() => setJustAdded(false), 1200);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add'); }
    finally { setBusy(false); }
  };

  const handleUpdateQty = async (e, delta) => {
    e.stopPropagation();
    if (!user) return;
    setBusy(true);
    try {
      const newQty = cartQty + delta;
      if (newQty <= 0) {
        await axios.delete(`/cart/${product.id}`);
      } else if (delta > 0) {
        await axios.post(`/cart/add?product_id=${product.id}&quantity=1${selectedSize ? `&size=${selectedSize}` : ''}`);
      } else {
        await axios.put(`/cart/update?product_id=${product.id}&quantity=${newQty}${selectedSize ? `&size=${selectedSize}` : ''}`);
      }
      await refreshCart();
    } catch (err) { toast.error('Failed to update cart'); }
    finally { setBusy(false); }
  };

  const handleToggleWishlist = async (e) => {
    e.stopPropagation();
    if (!user) { openAuth(); return; }
    try {
      await axios.post(`/wishlist/product/${product.id}`);
      refreshWishlist();
    } catch (err) { toast.error('Failed'); }
  };

  const inCart = cartQty > 0;

  return (
    <div className="group rounded-xl bg-white border border-slate-100 hover:border-cyan-200 transition-all duration-200 overflow-hidden hover:shadow-sm flex flex-col"
      data-testid="product-card">
      {/* Image */}
      <div className="relative h-44 sm:h-52 overflow-hidden bg-slate-50 cursor-pointer" onClick={() => navigate(`/product/${product.id}`)}>
        {!imgLoaded && <div className="absolute inset-0 bg-slate-100 animate-pulse" />}
        <img src={product.image_url} alt={product.name} loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={`w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`} />
        {/* Wishlist heart */}
        <button onClick={handleToggleWishlist}
          className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${wishlisted ? 'bg-rose-500 text-white' : 'bg-white/80 text-slate-400 hover:text-rose-500 backdrop-blur-sm'}`}
          data-testid="wishlist-btn">
          <Heart size={14} fill={wishlisted ? 'currentColor' : 'none'} />
        </button>
        {hasDiscount && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-white" data-testid="discount-badge">
            {discountPct}% off
          </span>
        )}
        {!product.in_stock && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-white text-xs font-semibold bg-black/50 px-3 py-1 rounded-md">Sold Out</span>
          </div>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        {/* Name — lights up cyan on card hover */}
        <h3 className="font-semibold text-sm text-slate-800 group-hover:text-cyan-500 mb-0.5 line-clamp-1 cursor-pointer transition-colors" onClick={() => navigate(`/product/${product.id}`)}>
          {product.name}
        </h3>
        <p className="text-slate-400 text-xs mb-1.5 line-clamp-1 leading-relaxed group-hover:text-slate-500 transition-colors">{product.description}</p>

        {/* Rating */}
        {product.rating > 0 && (
          <div className="flex items-center gap-1 mb-2" data-testid="card-rating">
            <Star size={11} className="text-amber-400" fill="currentColor" />
            <span className="text-[11px] font-semibold text-slate-700">{product.rating}</span>
            <span className="text-[10px] text-slate-400">({product.review_count})</span>
          </div>
        )}

        {/* Size Selection */}
        {product.sizes?.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-2.5" data-testid="size-selector">
            {product.sizes.map(s => (
              <button key={s} onClick={(e) => { e.stopPropagation(); setSelectedSize(s); }}
                className={`text-[10px] px-2 h-6 rounded flex items-center justify-center font-semibold transition-all ${selectedSize === s ? 'bg-cyan-400 text-white' : 'bg-slate-50 text-slate-400 hover:bg-cyan-50 hover:text-cyan-600'}`}
                data-testid={`card-size-${s}`}>{s}</button>
            ))}
          </div>
        )}

        {/* Price + Cart Controls — always at bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-50 mt-auto">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-slate-800 group-hover:text-cyan-500 transition-colors" data-testid="product-price">{formatPrice(product.price)}</span>
            {hasDiscount && (
              <span className="text-xs text-slate-500 line-through" data-testid="original-price">{formatPrice(product.compare_at_price)}</span>
            )}
          </div>

          {/* Cart button area */}
          {justAdded ? (
            <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-500 text-white" data-testid="add-to-cart-btn">
              <Check size={12} className="inline mr-0.5" /> Added
            </span>
          ) : inCart ? (
            <div className="inline-flex items-center bg-cyan-50 border border-cyan-200 rounded-md h-7 overflow-hidden" data-testid="cart-qty-controls" onClick={e => e.stopPropagation()}>
              <button onClick={(e) => handleUpdateQty(e, -1)} disabled={busy}
                className="shrink-0 w-7 h-full bg-cyan-400 text-white hover:bg-cyan-500 flex items-center justify-center transition-colors disabled:opacity-40"
                data-testid="card-qty-minus">
                <Minus size={12} strokeWidth={2.5} />
              </button>
              <span className="px-1.5 text-[11px] font-bold text-cyan-700 whitespace-nowrap" data-testid="card-qty-display">{cartQty} in cart</span>
              <button onClick={(e) => handleUpdateQty(e, 1)} disabled={busy}
                className="shrink-0 w-7 h-full bg-cyan-400 text-white hover:bg-cyan-500 flex items-center justify-center transition-colors disabled:opacity-40"
                data-testid="card-qty-plus">
                <Plus size={12} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button onClick={handleAdd} disabled={!product.in_stock || busy}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-500 group-hover:bg-cyan-400 group-hover:text-white hover:bg-cyan-400 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="add-to-cart-btn">
              {busy ? '...' : <><ShoppingCart size={12} className="inline mr-0.5" /> Add</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
