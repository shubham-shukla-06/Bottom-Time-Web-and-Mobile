import { memo } from 'react';
import { MapPin, Star, Clock, Heart, Share2, MessageSquareQuote, Wind, Layers } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import Tip from './Tip';

function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
  document.body.appendChild(ta); ta.focus(); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}

function trackEvent(type, data) {
  const token = sessionStorage.getItem('token');
  axios.post(token ? '/track' : '/track/anon', { event_type: type, data }).catch(() => {});
}

const TYPE_STYLES = {
  dives: { bg: 'bg-blue-50 text-blue-700', label: 'Fun Dive' },
  courses: { bg: 'bg-amber-50 text-amber-700', label: 'Course' },
  liveaboards: { bg: 'bg-violet-50 text-violet-700', label: 'Liveaboard' },
  day_trips: { bg: 'bg-emerald-50 text-emerald-700', label: 'Land-based Trip' },
  snorkeling: { bg: 'bg-sky-50 text-sky-700', label: 'Snorkeling' }
};

export const ListingCard = memo(function ListingCard({ listing, convertPrice, wishlisted, onToggleWishlist, onView, user }) {
  const style = TYPE_STYLES[listing.type] || { bg: 'bg-slate-100 text-slate-700', label: listing.type };

  return (
    <div className="group rounded-2xl border border-slate-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.08)] transition-all duration-500 overflow-hidden cursor-pointer" onClick={() => { trackEvent('listing_click', { listing_id: listing.id, name: listing.name }); onView(listing.id); }} data-testid="listing-card">
      <div className="relative aspect-[16/9] overflow-hidden">
        <img src={listing.image_url} alt={listing.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold ${style.bg}`}>{style.label}</div>
        <div className="absolute top-3 right-3 flex gap-1.5">
          <Tip label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}>
            <button onClick={e => onToggleWishlist(listing.id, e)} className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-all" data-testid="wishlist-heart-btn">
              <Heart size={13} className={wishlisted ? 'text-red-500 fill-red-500' : 'text-slate-500'} />
            </button>
          </Tip>
          <Tip label="Share listing" alignRight>
            <button onClick={e => { e.stopPropagation(); trackEvent('share', { listing_id: listing.id, name: listing.name }); const url = `${window.location.origin}/listing/${listing.id}`; const mob = /iPhone|iPad|Android/i.test(navigator.userAgent); if (mob && navigator.share) navigator.share({ title: listing.name, url }).catch(() => {}); else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(() => { copyFallback(url); toast.success('Link copied!'); }); else { copyFallback(url); toast.success('Link copied!'); } }} className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-all" data-testid="share-listing-btn">
              <Share2 size={11} className="text-slate-500" />
            </button>
          </Tip>
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-sm sm:text-base font-bold mb-2 line-clamp-1 group-hover:text-cyan-400 transition-colors">{listing.name}</h3>
        <p className="text-slate-500 text-sm mb-3 line-clamp-2">{listing.description}</p>

        {/* Unified meta row — mirrors ListingDetail.js (commit f1f5ec0).
            All items same plain icon+text style, no pills. flex-wrap so
            narrow cards break cleanly to a second line. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin size={14} className="text-cyan-400 flex-shrink-0" />
            <span className="line-clamp-1">{listing.location}</span>
          </div>
          {listing.duration && (
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-cyan-400 flex-shrink-0" />
              <span>{listing.duration}</span>
            </div>
          )}
          {listing.num_dives > 0 && (
            <div className="flex items-center gap-1.5">
              <Layers size={14} className="text-cyan-400 flex-shrink-0" />
              <span>{listing.num_dives} dive{listing.num_dives > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Secondary feature pill — keeps Nitrox as a discoverable accent without
            inflating the unified meta row. */}
        {listing.nitrox_available && (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold">
              <Wind size={10} /> Nitrox
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {listing.rating != null && (
            <div className="flex items-center gap-1">
              <Star size={14} className="text-amber-400 fill-amber-400 flex-shrink-0" />
              <span className="font-semibold text-sm text-slate-700">{listing.rating}</span>
              <span className="text-xs text-slate-400">({listing.review_count})</span>
            </div>
          )}
          {listing.price ? <span className="text-base font-bold text-slate-700 group-hover:text-cyan-400 transition-colors">{convertPrice(listing.price)}</span> : <span className="text-sm text-slate-400">Contact</span>}
        </div>
        {listing.latest_review && (
          <div className="mt-3 flex gap-2 items-start" data-testid="listing-review-snippet">
            <MessageSquareQuote size={12} className="text-slate-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed italic">"{listing.latest_review.comment}" — <span className="font-medium not-italic text-slate-500">{listing.latest_review.user_name}</span></p>
          </div>
        )}
      </div>
    </div>
  );
});
