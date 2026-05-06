import { useState, useMemo } from 'react';
import { RefreshCw, Share2, Camera } from 'lucide-react';

/**
 * Inline preview of the listing's auto-generated 1200×630 social card.
 * Pulled from /api/listings/{id}/og-image. Cache-busted by the listing's
 * updated_at + a manual refresh tick so operators see new versions instantly
 * after swapping the hero photo or saving.
 */
export default function SocialPreview({ listing }) {
  const [tick, setTick] = useState(0);
  const apiBase = process.env.REACT_APP_BACKEND_URL;

  const imgSrc = useMemo(() => {
    if (!listing?.id) return null;
    const v = encodeURIComponent(listing.updated_at || '');
    return `${apiBase}/api/listings/${listing.id}/og-image?v=${v}&t=${tick}`;
  }, [apiBase, listing?.id, listing?.updated_at, tick]);

  if (!listing?.id) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center" data-testid="social-preview-empty">
        <Camera size={20} className="text-slate-300 mx-auto mb-2" />
        <p className="text-xs text-slate-500 font-medium">Save a draft to preview your social card</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Cards are auto-generated when LinkedIn, WhatsApp, X &amp; Facebook unfurl your link.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4" data-testid="social-preview">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
            <Share2 size={13} className="text-cyan-500" />
          </span>
          <div>
            <h4 className="text-[12px] font-bold text-slate-800 leading-none">Social card preview</h4>
            <p className="text-[10px] text-slate-400 mt-1">Live render · 1200×630 · used by WhatsApp, LinkedIn, X &amp; Facebook</p>
          </div>
        </div>
        <button
          onClick={() => setTick(t => t + 1)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50/40 transition-colors"
          title="Force re-fetch the latest card"
          data-testid="social-preview-refresh"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-[1200/630]">
        <img
          src={imgSrc}
          alt="Social preview card"
          className="w-full h-full object-cover"
          data-testid="social-preview-img"
          onError={e => { e.target.style.opacity = 0.3; }}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
        Tip: this card uses your <span className="font-semibold text-slate-500">first photo</span> as the hero. Reorder or replace it above to change the card.
      </p>
    </div>
  );
}
