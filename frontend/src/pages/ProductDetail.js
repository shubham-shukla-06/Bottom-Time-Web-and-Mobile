import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import useCartStore from '../stores/cartStore';
import { formatPrice } from '../utils/currency';
import Navbar from '../components/Navbar';
import { ArrowLeft, ShoppingCart, Minus, Plus, Check, Heart, Share2, Star, ThumbsUp, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const refreshCart = useCartStore(s => s.refreshCart);
  const wishlistedProductIds = useUIStore(s => s.wishlistedProductIds);
  const refreshWishlist = useUIStore(s => s.refreshWishlist);
  const currency = useUIStore(s => s.currency);
  const exchangeRates = useUIStore(s => s.exchangeRates);
  const cartItems = useCartStore(s => s.cartItems);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  const allImages = [
    product?.image_url,
    ...(product?.images || []),
  ].filter(Boolean);
  const [imgLoaded, setImgLoaded] = useState(false);

  const cartItemsForProduct = (cartItems || []).filter(i => i.product_id === id);
  const cartQty = cartItemsForProduct.reduce((s, i) => s + i.quantity, 0);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try {
        const [prodRes, revRes] = await Promise.all([
          axios.get(`/products/${id}`),
          axios.get(`/reviews/${id}`).catch(() => ({ data: { reviews: [], stats: null } }))
        ]);
        setProduct(prodRes.data);
        if (prodRes.data.sizes?.length > 0) setSelectedSize(prodRes.data.sizes[0]);
        setReviews(revRes.data.reviews || []);
        setReviewStats(revRes.data.stats || null);
      } catch (e) { toast.error('Product not found'); navigate('/shop'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const productInfoItems = useMemo(() => {
    if (!product) return [];
    return [
      ['Country of Origin', product.country_of_origin],
      ['Manufacturer', product.manufacturer],
      ['Manufacturer Address', product.manufacturer_address],
      ['Importer', product.importer],
      ['Net Quantity', product.net_quantity],
      ['Warranty', product.warranty],
      ['Return Policy', product.return_policy],
      ['Delivery Estimate', product.delivery_estimate],
    ].filter(([, v]) => v);
  }, [product]);


  const handleAddToCart = async () => {
    if (!user) { openAuth(); return; }
    if (product.sizes?.length > 0 && !selectedSize) { toast.error('Please select a size'); return; }
    setAdding(true);
    try {
      await axios.post(`/cart/add?product_id=${id}&quantity=${quantity}${selectedSize ? `&size=${selectedSize}` : ''}`);
      setAdded(true);
      refreshCart();
      toast.success('Added to cart!');
      setTimeout(() => setAdded(false), 2000);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add'); }
    finally { setAdding(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50/40">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
          <div className="rounded-xl bg-slate-100 aspect-square" />
          <div className="flex flex-col gap-4 pt-4">
            <div className="h-5 bg-slate-100 rounded w-20" />
            <div className="h-8 bg-slate-100 rounded w-3/4" />
            <div className="h-4 bg-slate-50 rounded w-full" />
            <div className="h-4 bg-slate-50 rounded w-2/3" />
            <div className="h-10 bg-slate-100 rounded w-32 mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
  if (!product) return null;

  return (
    <div className="min-h-screen bg-slate-50/40">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6" data-testid="product-detail-page">
        <button onClick={() => navigate('/shop')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 mb-5 text-xs font-medium transition-colors" data-testid="back-to-shop">
          <ArrowLeft size={14} /> Shop
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
          {/* Image Gallery */}
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden bg-white border border-slate-100 aspect-square relative" data-testid="product-main-image">
              {!imgLoaded && <div className="absolute inset-0 bg-slate-50 animate-pulse" />}
              <img src={allImages[selectedImage] || product.image_url} alt={product.name} loading="lazy"
                onLoad={() => setImgLoaded(true)} key={selectedImage}
                className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`} />
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="product-thumbnail-strip">
                {allImages.map((img, i) => (
                  <button key={`k${i}`} onClick={() => { setSelectedImage(i); setImgLoaded(false); }}
                    className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${selectedImage === i ? 'border-cyan-400 ring-1 ring-cyan-200' : 'border-slate-100 hover:border-slate-300'}`}
                    data-testid={`thumbnail-${i}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <span className={`inline-block self-start px-2.5 py-0.5 rounded-md text-[11px] font-semibold mb-3 ${product.category === 'merch' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {product.category === 'merch' ? 'Merch' : 'Gear'}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mb-1" data-testid="product-name">{product.name}</h1>
            {/* Rating summary */}
            {reviewStats && reviewStats.total > 0 && (
              <div className="flex items-center gap-1.5 mb-3" data-testid="detail-rating">
                <div className="flex">
                  {[1,2,3,4,5].map(s => <Star key={s} size={14} className={s <= Math.round(reviewStats.average) ? 'text-amber-400' : 'text-slate-200'} fill="currentColor" />)}
                </div>
                <span className="text-sm font-semibold text-slate-700">{reviewStats.average}</span>
                <a href="#reviews" className="text-xs text-slate-400 hover:text-cyan-500">({reviewStats.total} review{reviewStats.total !== 1 ? 's' : ''})</a>
              </div>
            )}
            <p className="text-slate-400 text-sm mb-5 leading-relaxed" data-testid="product-description">{product.description}</p>

            <div className="flex items-baseline gap-2 mb-5" data-testid="product-price">
              <span className="text-2xl font-bold text-slate-900">{formatPrice(product.price, currency, exchangeRates)}</span>
              {product.compare_at_price && product.compare_at_price > product.price && (
                <>
                  <span className="text-base text-slate-300 line-through" data-testid="detail-original-price">{formatPrice(product.compare_at_price, currency, exchangeRates)}</span>
                  <span className="text-sm font-bold text-emerald-500" data-testid="detail-discount-badge">{Math.round((1 - product.price / product.compare_at_price) * 100)}% off</span>
                </>
              )}
            </div>

            {/* Sizes */}
            {product.sizes?.length > 0 && (
              <div className="mb-5">
                <label className="text-xs font-semibold text-slate-500 mb-2 block uppercase tracking-wider">Size</label>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map(s => (
                    <button key={s} onClick={() => setSelectedSize(s)}
                      className={`w-10 h-10 rounded-lg text-sm font-semibold flex items-center justify-center transition-all ${selectedSize === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      data-testid={`size-${s}`}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity — only show when not yet in cart */}
            {cartQty === 0 && (
              <div className="mb-5">
                <label className="text-xs font-semibold text-slate-500 mb-2 block uppercase tracking-wider">Quantity</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors" data-testid="qty-minus"><Minus size={14} /></button>
                  <span className="text-sm font-bold w-8 text-center" data-testid="qty-display">{quantity}</span>
                  <button onClick={() => setQuantity(Math.min(10, quantity + 1))} className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors" data-testid="qty-plus"><Plus size={14} /></button>
                </div>
              </div>
            )}

            {/* Stock */}
            {!product.in_stock && (
              <div className="bg-red-50 text-red-500 text-xs font-semibold px-4 py-2.5 rounded-lg mb-4" data-testid="out-of-stock">Sold Out</div>
            )}

            {/* Add to Cart / Cart State */}
            {added ? (
              <button disabled className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-emerald-500 text-white" data-testid="add-to-cart-detail-btn">
                <Check size={16} /> Added!
              </button>
            ) : cartQty > 0 ? (
              <div className="w-full" data-testid="detail-cart-controls">
                <div className="flex items-center gap-3 mb-2">
                  <div className="inline-flex items-center bg-cyan-50 border border-cyan-200 rounded-xl h-10 overflow-hidden">
                    <button onClick={async () => {
                      try {
                        const targetItem = cartItemsForProduct.find(i => i.size === selectedSize) || cartItemsForProduct[0];
                        const sizeParam = targetItem?.size ? `&size=${targetItem.size}` : '';
                        if ((targetItem?.quantity || 0) <= 1 && cartItemsForProduct.length <= 1) { await axios.delete(`/cart/${id}`); } else if ((targetItem?.quantity || 0) <= 1) { await axios.put(`/cart/update?product_id=${id}&quantity=0${sizeParam}`); } else { await axios.put(`/cart/update?product_id=${id}&quantity=${(targetItem?.quantity || 1) - 1}${sizeParam}`); }
                        await refreshCart();
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update cart'); }
                    }} className="shrink-0 w-10 h-full bg-cyan-400 text-white hover:bg-cyan-500 flex items-center justify-center transition-colors" data-testid="detail-qty-minus"><Minus size={14} /></button>
                    <span className="px-3 text-sm font-bold text-cyan-700 whitespace-nowrap">{cartQty} in cart</span>
                    <button onClick={async () => {
                      try {
                        const targetItem = cartItemsForProduct.find(i => i.size === selectedSize) || cartItemsForProduct[0];
                        const sizeParam = targetItem?.size ? `&size=${targetItem.size}` : '';
                        await axios.post(`/cart/add?product_id=${id}&quantity=1${sizeParam}`);
                        await refreshCart();
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update cart'); }
                    }} className="shrink-0 w-10 h-full bg-cyan-400 text-white hover:bg-cyan-500 flex items-center justify-center transition-colors" data-testid="detail-qty-plus"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => navigate('/cart')} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:border-cyan-300 hover:text-cyan-500 transition-all text-center" data-testid="go-to-cart">
                    View Cart
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={handleAddToCart}
                  disabled={!product.in_stock || adding}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-cyan-400 text-white hover:bg-cyan-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="add-to-cart-detail-btn"
                >
                  {adding ? 'Adding...' : <><ShoppingCart size={16} /> Add to Cart — {formatPrice(product.price * quantity, currency, exchangeRates)}</>}
                </button>
                <button onClick={() => navigate('/cart')} className="text-xs text-slate-400 hover:text-cyan-500 font-medium mt-2.5 transition-colors" data-testid="go-to-cart">
                  View Cart
                </button>
              </>
            )}

            {/* Wishlist + Share */}
            <div className="flex gap-2 mt-3">
              <button onClick={async () => {
                if (!user) { openAuth(); return; }
                await axios.post(`/wishlist/product/${id}`);
                refreshWishlist();
                toast.success(wishlistedProductIds.includes(id) ? 'Removed from wishlist' : 'Added to wishlist');
              }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${wishlistedProductIds.includes(id) ? 'bg-rose-50 border-rose-200 text-rose-500' : 'border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500'}`}
                data-testid="detail-wishlist-btn">
                <Heart size={14} fill={wishlistedProductIds.includes(id) ? 'currentColor' : 'none'} />
                {wishlistedProductIds.includes(id) ? 'Wishlisted' : 'Add to Wishlist'}
              </button>
              <button onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: product.name, text: product.description, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success('Link copied!');
                }
              }}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200 text-slate-500 hover:border-cyan-200 hover:text-cyan-500 transition-all"
                data-testid="detail-share-btn">
                <Share2 size={14} /> Share
              </button>
            </div>

            {/* Highlights */}
            {product.highlights?.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Highlights</h3>
                <ul className="flex flex-col gap-1.5">
                  {product.highlights.map((h, i) => (
                    <li key={`k${i}`} className="text-xs text-slate-500 flex items-start gap-2"><Check size={12} className="text-cyan-400 mt-0.5 flex-shrink-0" />{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Product Information — India Compliance */}
            <div className="mt-6 border-t border-slate-100 pt-5" data-testid="product-info-section">
              <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Product Information</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {productInfoItems.map(([label, value]) => (
                  <div key={label} className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-xs text-slate-400">{label}</span>
                    <span className="text-xs font-medium text-slate-600 text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        {reviewStats && reviewStats.total > 0 && (
          <div className="mt-10 border-t border-slate-100 pt-8" id="reviews" data-testid="reviews-section">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Customer Reviews</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Left: Star breakdown */}
              <div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold text-slate-900">{reviewStats.average}</span>
                  <div>
                    <div className="flex">
                      {[1,2,3,4,5].map(s => <Star key={s} size={16} className={s <= Math.round(reviewStats.average) ? 'text-amber-400' : 'text-slate-200'} fill="currentColor" />)}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{reviewStats.total} review{reviewStats.total !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {/* Star bars */}
                <div className="space-y-1.5">
                  {[5,4,3,2,1].map(star => {
                    const count = reviewStats.distribution?.[star] || 0;
                    const pct = reviewStats.total > 0 ? Math.round((count / reviewStats.total) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2" data-testid={`star-bar-${star}`}>
                        <span className="text-xs text-slate-500 w-3 text-right">{star}</span>
                        <Star size={11} className="text-amber-400 shrink-0" fill="currentColor" />
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400 w-7 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Review list with sort/filter */}
              <div className="md:col-span-2">
                <ReviewList reviews={reviews} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


const REVIEW_SORTS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'highest', label: 'Highest Rated' },
  { value: 'lowest', label: 'Lowest Rated' },
  { value: 'helpful', label: 'Most Helpful' },
];

function ReviewList({ reviews }) {
  const [sort, setSort] = useState('recent');
  const [starFilter, setStarFilter] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentSort = REVIEW_SORTS.find(s => s.value === sort) || REVIEW_SORTS[0];

  const filtered = reviews
    .filter(r => starFilter === 0 || r.rating === starFilter)
    .sort((a, b) => {
      if (sort === 'recent') return new Date(b.created_at) - new Date(a.created_at);
      if (sort === 'highest') return b.rating - a.rating;
      if (sort === 'lowest') return a.rating - b.rating;
      if (sort === 'helpful') return (b.helpful_count || 0) - (a.helpful_count || 0);
      return 0;
    });

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="review-controls">
        {/* Custom Sort Dropdown */}
        <div className="relative" ref={sortRef}>
          <button onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-slate-100 rounded-full hover:bg-slate-200 cursor-pointer font-semibold text-slate-600 transition-colors whitespace-nowrap"
            data-testid="review-sort">
            {currentSort.label}
            <ChevronDown size={12} className={`text-slate-400 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
          </button>
          {sortOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-44 bg-white rounded-xl border border-slate-100 shadow-[0_12px_40px_rgb(0,0,0,0.10)] py-1 z-50">
              {REVIEW_SORTS.map(s => (
                <button key={s.value} onClick={() => { setSort(s.value); setSortOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${s.value === sort ? 'bg-cyan-50 text-cyan-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                  data-testid={`review-sort-${s.value}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Star filter pills */}
        <div className="flex gap-1">
          <button onClick={() => setStarFilter(0)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${starFilter === 0 ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            data-testid="review-filter-all">All</button>
          {[5,4,3,2,1].map(s => (
            <button key={s} onClick={() => setStarFilter(starFilter === s ? 0 : s)}
              className={`px-2 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-0.5 ${starFilter === s ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              data-testid={`review-filter-${s}`}>
              {s} <Star size={9} fill="currentColor" className={starFilter === s ? 'text-white' : 'text-amber-400'} />
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-400 ml-auto">{filtered.length} review{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Review items */}
      <div className="flex flex-col gap-4">
        {filtered.length > 0 ? filtered.map(r => (
          <div key={r.id} className="border-b border-slate-50 pb-4 last:border-0" data-testid="review-item">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500">
                {r.user_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">{r.user_name}</span>
                  {r.verified_booking && <span className="text-[9px] font-semibold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">Verified Purchase</span>}
                </div>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= r.rating ? 'text-amber-400' : 'text-slate-200'} fill="currentColor" />)}
                  <span className="text-[10px] text-slate-300 ml-1">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed ml-9">{r.comment}</p>
            <button onClick={async () => {
              try { await axios.post(`/reviews/${r.id}/helpful`); r.helpful_count = (r.helpful_count || 0) + 1; setSort(s => s); } catch { toast.error('Sign in to vote'); }
            }}
              className="text-[10px] text-slate-400 hover:text-cyan-500 ml-9 mt-1.5 flex items-center gap-1 transition-colors" data-testid="helpful-btn">
              <ThumbsUp size={10} /> Helpful{r.helpful_count > 0 ? ` (${r.helpful_count})` : ''}
            </button>
          </div>
        )) : (
          <p className="text-xs text-slate-400 py-4">No reviews match this filter.</p>
        )}
      </div>
    </div>
  );
}