import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import {
  MapPin, Star, Clock, Award, Users, ArrowLeft, Share2, Heart,
  ShieldCheck, Waves, Anchor, Fish, Wind, Thermometer, Eye, Camera,
  XCircle, MessageCircle, Globe, CheckCircle
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { ReviewSection, ConditionCard, LocationMap, FAQSection, ListingAttendees } from './listing/ListingExtras';
import { PhotoGallery, DiveSitesSection, GearRentalSection, DirectionsSection, PoliciesSection, DiveSpecsBadges } from './listing/RichSections';
import StructuredData, { buildListingSchema, buildBreadcrumbSchema, usePageMeta } from '../components/StructuredData';
import ShareModal from '../components/ShareModal';
import { useShareTracking } from '../hooks/useShareTracking';
import BookingSidebar from './listing/BookingSidebar';
import Footer from '../components/Footer';
import { ListingDetailSkeleton } from '../components/Skeletons';
import { formatPrice } from '../utils/currency';

function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function Tip({ label, children, alignRight }) {
  return (
    <span className="relative group/tip">
      {children}
      <span className={`pointer-events-none absolute bottom-full mb-1.5 px-2 py-1 rounded-md bg-slate-900 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-10 ${alignRight ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
        {label}
      </span>
    </span>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const openAuth = useUIStore(s => s.openAuth);
  const currency = useUIStore(s => s.currency);
  const exchangeRates = useUIStore(s => s.exchangeRates);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wishlisted, setWishlisted] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fetchListing = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/listings/${id}`);
        setListing(response.data);
      } catch (error) {
        toast.error('Failed to load listing');
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
    if (user) checkWishlist();
    fetchAvailability();
    // Track recently viewed
    try {
      const key = 'bt_recently_viewed';
      const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
      const updated = [id, ...stored.filter(x => x !== id)].slice(0, 10);
      sessionStorage.setItem(key, JSON.stringify(updated));
    } catch (e) { /* silent */ }
    // Track page view
    axios.post(sessionStorage.getItem('token') ? '/track' : '/track/anon', { event_type: 'page_view', data: { page: 'listing_detail', listing_id: id } }).catch(() => {});
  }, [id]);

  const checkWishlist = async () => {
    try {
      const res = await axios.get('/wishlist/ids');
      setWishlisted(res.data.listing_ids.includes(id));
    } catch (e) { /* silent */ }
  };

  const fetchAvailability = async () => {
    try {
      const res = await axios.get(`/listings/${id}/availability`);
      setAvailableDates(res.data.available_dates || []);
    } catch (e) { /* silent */ }
  };

  const toggleWishlist = async () => {
    if (!user) { openAuth(); return; }
    try {
      const res = await axios.post(`/wishlist/${id}`);
      setWishlisted(res.data.wishlisted);
      toast.success(res.data.wishlisted ? 'Saved to wishlist' : 'Removed from wishlist');
    } catch (e) { toast.error('Failed to update wishlist'); }
  };

  // UTM tracking: capture incoming utm_* params, persist for booking attribution
  useShareTracking(id);
  const [shareOpen, setShareOpen] = useState(false);

  const typeStyles = {
    dives: { bg: 'bg-blue-50 text-blue-700', label: 'Fun Dive' },
    courses: { bg: 'bg-amber-50 text-amber-700', label: 'Course' },
    liveaboards: { bg: 'bg-violet-50 text-violet-700', label: 'Liveaboard' },
    day_trips: { bg: 'bg-emerald-50 text-emerald-700', label: 'Land-based Trip' },
    snorkeling: { bg: 'bg-sky-50 text-sky-700', label: 'Snorkeling' }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const schema = listing ? buildListingSchema(listing, origin) : null;
  const breadcrumb = listing ? buildBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Discover', path: '/discover' },
    { name: listing.country, path: `/discover?country=${encodeURIComponent(listing.country || '')}` },
    { name: listing.name },
  ].filter(x => x.name), origin) : null;

  const seoImage = listing ? `${origin}/api/listings/${listing.id}/og-image` : undefined;
  usePageMeta({
    title: listing ? `${listing.name} · ${listing.location || listing.country || ''} · Bottom Time` : 'Loading…',
    description: listing ? (listing.description || '').slice(0, 160) : '',
    image: seoImage,
    imageWidth: 1200,
    imageHeight: 630,
    url: listing ? `${origin}/listing/${listing.id}` : origin,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <ListingDetailSkeleton />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
          <h2 className="text-lg font-bold mb-4">Listing not found</h2>
          <button onClick={() => navigate('/discover')} className="btn-primary" data-testid="back-to-discover-btn">
            Back to Discover
          </button>
        </div>
      </div>
    );
  }

  const style = typeStyles[listing.type] || { bg: 'bg-slate-100 text-slate-700', label: listing.type };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {schema?.product && <StructuredData id={`product-${listing.id}`} data={schema.product} />}
      {schema?.trip && <StructuredData id={`trip-${listing.id}`} data={schema.trip} />}
      {breadcrumb && <StructuredData id={`bc-${listing.id}`} data={breadcrumb} />}
      <Navbar />

      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8" data-testid="listing-detail-page">
        <button
          onClick={() => navigate('/discover')}
          className="flex items-center gap-2 text-slate-500 hover:text-cyan-400 mb-6 transition-colors text-sm font-medium"
          data-testid="back-btn"
        >
          <ArrowLeft size={18} />
          Back to Discover
        </button>

        {/* Hero row (Airbnb-style): image left (~62%) + sticky booking right (~38%) on lg+.
            Mobile stacks: image -> title block -> booking card -> rest of content. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 md:gap-8">
          {/* LEFT column: image + title/meta + all body sections */}
          <div className="flex flex-col gap-6 min-w-0">
            {/* PhotoGallery hero (rich) — falls back to single hero if no photos array */}
            <div className="relative">
              <PhotoGallery photos={listing.photos} fallbackImageUrl={listing.image_url} alt={listing.name} />
              <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${style.bg}`}>{style.label}</div>
                {listing.difficulty && (
                  <div className="px-3 py-1 rounded-full text-xs font-semibold bg-white/95 backdrop-blur-sm text-slate-700">
                    {listing.difficulty.charAt(0).toUpperCase() + listing.difficulty.slice(1)}
                  </div>
                )}
              </div>
              <div className="absolute top-3 left-3 flex gap-2 z-10">
                <Tip label="Share listing">
                  <button
                    className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors"
                    onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
                    data-testid="share-btn"
                  >
                    <Share2 size={18} className="text-slate-700" />
                  </button>
                </Tip>
                <Tip label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}>
                  <button
                    className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-all duration-200 ${wishlisted ? 'bg-red-50' : 'bg-white/90 hover:bg-white'}`}
                    onClick={(e) => { e.stopPropagation(); toggleWishlist(); }}
                    data-testid="wishlist-btn"
                  >
                    <Heart size={18} className={wishlisted ? 'text-red-500 fill-red-500' : 'text-slate-700'} />
                  </button>
                </Tip>
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">{listing.name}</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <MapPin className="text-cyan-400" size={16} />
                  <span>{listing.location}{listing.country ? `, ${listing.country}` : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="text-amber-400 fill-amber-400" size={16} />
                  <span className="font-semibold">{listing.rating}</span>
                  <span className="text-slate-400">({listing.review_count} reviews)</span>
                </div>
              </div>
              <DiveSpecsBadges listing={listing} />
            </div>

            <div className="bg-slate-50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-3">About</h2>
              <p className="text-slate-600 leading-relaxed">{listing.description}</p>
            </div>

            {listing.highlights && listing.highlights.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-4">Highlights</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {listing.highlights.map((highlight, idx) => (
                    <div key={`k${idx}`} className="flex items-center gap-3">
                      <CheckCircle className="text-cyan-400 flex-shrink-0" size={18} />
                      <span className="text-slate-700 text-sm">{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dive Sites — from rich form */}
            <DiveSitesSection diveSites={listing.dive_sites} />

            {/* Gear Rental — from rich form */}
            <GearRentalSection gearRental={listing.gear_rental} currency={listing.currency} />

            <div className="bg-slate-50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">Details</h2>
              <div className="grid grid-cols-2 gap-6">
                {listing.duration && (
                  <div>
                    <div className="flex items-center gap-2 text-slate-500 mb-1 text-sm">
                      <Clock size={15} />
                      <span className="font-medium">Duration</span>
                    </div>
                    <p className="font-semibold">{listing.duration}</p>
                  </div>
                )}
                {listing.difficulty && (
                  <div>
                    <div className="flex items-center gap-2 text-slate-500 mb-1 text-sm">
                      <Award size={15} />
                      <span className="font-medium">Difficulty</span>
                    </div>
                    <p className="font-semibold">{listing.difficulty.charAt(0).toUpperCase() + listing.difficulty.slice(1)}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 text-slate-500 mb-1 text-sm">
                    <MapPin size={15} />
                    <span className="font-medium">Location</span>
                  </div>
                  <p className="font-semibold">{listing.location}</p>
                  <p className="text-slate-500 text-xs">{listing.country}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-slate-500 mb-1 text-sm">
                    <Users size={15} />
                    <span className="font-medium">Type</span>
                  </div>
                  <p className="font-semibold">{style.label}</p>
                </div>
              </div>
            </div>

            {/* Divers Going - Show co-attendees */}
            {user && <ListingAttendees listingId={id} />}

            {/* Reviews Section */}
            <ReviewSection listingId={id} user={user} openAuth={openAuth} />

            {/* Google Maps Location */}
            <LocationMap location={listing.location} country={listing.country} />

            {/* What's Included / Excluded */}
            <div className="bg-slate-50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">What's Included</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(listing.included || ['Dive guide', 'Tank & weights', 'Boat transport', 'Light refreshments']).map((item, i) => (
                  <div key={`k${i}`} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle size={14} className="text-emerald-500 flex-shrink-0" /> {item}</div>
                ))}
              </div>
              {(listing.excluded || ['Equipment rental', 'Marine park fees', 'Photos/video', 'Tips']).length > 0 && (
                <>
                  <h3 className="text-sm font-bold mt-5 mb-3 text-slate-600">Not Included</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(listing.excluded || ['Equipment rental', 'Marine park fees', 'Photos/video', 'Tips']).map((item, i) => (
                      <div key={`k${i}`} className="flex items-center gap-2 text-sm text-slate-500"><XCircle size={14} className="text-slate-300 flex-shrink-0" /> {item}</div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Dive Conditions */}
            <div className="bg-slate-50 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">Typical Conditions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <ConditionCard icon={Thermometer} label="Water Temp" value={listing.water_temp || "26-30°C"} />
                <ConditionCard icon={Eye} label="Visibility" value={listing.visibility || "15-30m"} />
                <ConditionCard icon={Waves} label="Current" value={listing.current || "Mild"} />
                <ConditionCard icon={Anchor} label="Max Depth" value={listing.max_dive_depth || (listing.max_depth ? `${listing.max_depth}m` : "30m")} />
              </div>
            </div>

            {/* Directions / How to Get There */}
            <DirectionsSection directions={listing.directions} currency={listing.currency} />

            {/* Policies (real operator data with fallbacks) */}
            <PoliciesSection listing={listing} />

            {/* FAQs */}
            <FAQSection listing={listing} />
          </div>
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-[88px]">
            <BookingSidebar listing={listing} user={user} openAuth={openAuth} id={id} currency={currency} exchangeRates={exchangeRates} availableDates={availableDates} />
            </div>
          </div>
        </div>
      </div>
      <Footer />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} listing={listing} isOperator={false} />
    </div>
  );
}

