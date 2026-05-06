import { useState, useMemo } from 'react';
import { Anchor, Wrench, Plane, Car, CheckCircle, ChevronDown, Wind, Award, Layers } from 'lucide-react';

const REACT_APP_BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function resolveUrl(url) {
  if (!url) return '';
  return url.startsWith('/') ? `${REACT_APP_BACKEND_URL}${url}` : url;
}


export function PhotoGallery({ photos = [], fallbackImageUrl, alt }) {
  const allPhotos = useMemo(() => {
    if (photos && photos.length > 0) return photos;
    if (fallbackImageUrl) return [{ url: fallbackImageUrl, caption: alt }];
    return [];
  }, [photos, fallbackImageUrl, alt]);

  const [activeIdx, setActiveIdx] = useState(0);
  if (allPhotos.length === 0) return null;

  const active = allPhotos[activeIdx] || allPhotos[0];
  return (
    <div data-testid="photo-gallery">
      <div className="relative h-72 md:h-96 rounded-2xl overflow-hidden mb-3 bg-slate-100">
        <img src={resolveUrl(active.url)} alt={active.caption || alt} className="w-full h-full object-cover" loading="lazy" />
        {allPhotos.length > 1 && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11px] font-medium" data-testid="photo-count">
            {activeIdx + 1} / {allPhotos.length}
          </div>
        )}
      </div>
      {allPhotos.length > 1 && (
        <div className="grid grid-cols-6 gap-2">
          {allPhotos.slice(0, 6).map((p, i) => (
            <button
              key={`thumb-${i}`}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`relative h-16 sm:h-20 rounded-lg overflow-hidden border-2 transition-all ${activeIdx === i ? 'border-cyan-400' : 'border-transparent hover:border-slate-200'}`}
              data-testid={`thumb-${i}`}
            >
              <img src={resolveUrl(p.url)} alt={p.caption || `Photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export function DiveSitesSection({ diveSites = [] }) {
  if (!diveSites || diveSites.length === 0) return null;
  const valid = diveSites.filter(d => d?.name);
  if (valid.length === 0) return null;

  const difficultyColor = (d) => ({
    beginner: 'bg-emerald-50 text-emerald-700',
    open_water: 'bg-cyan-50 text-cyan-700',
    advanced: 'bg-amber-50 text-amber-700',
    rescue: 'bg-orange-50 text-orange-700',
    divemaster: 'bg-rose-50 text-rose-700',
    technical: 'bg-purple-50 text-purple-700',
  }[d] || 'bg-slate-100 text-slate-600');

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="dive-sites-section">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Anchor size={18} className="text-cyan-400" /> Dive Sites ({valid.length})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {valid.map((site, idx) => (
          <div key={`site-${idx}`} className="bg-white border border-slate-100 rounded-xl p-4" data-testid={`dive-site-${idx}`}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h3 className="font-bold text-sm text-slate-800">{site.name}</h3>
              {site.difficulty && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${difficultyColor(site.difficulty)} whitespace-nowrap`}>
                  {site.difficulty.replace('_', ' ')}
                </span>
              )}
            </div>
            {site.max_depth > 0 && (
              <p className="text-xs text-slate-500 mb-1.5">Max depth: <span className="font-semibold text-slate-700">{site.max_depth}m</span></p>
            )}
            {site.description && (
              <p className="text-xs text-slate-600 leading-relaxed">{site.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


export function GearRentalSection({ gearRental, currency = 'USD' }) {
  if (!gearRental) return null;
  const items = (gearRental.items || []).filter(i => i?.name);
  const hasIncluded = !!gearRental.included;
  const hasPaid = items.some(i => !i.included && i.price > 0);
  const hasFree = items.some(i => i.included);
  if (!hasIncluded && !hasPaid && !hasFree && !(gearRental.price > 0)) return null;

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="gear-rental-section">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Wrench size={18} className="text-cyan-400" /> Gear Rental</h2>
      {hasIncluded && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-4" data-testid="gear-included-banner">
          <CheckCircle size={16} className="flex-shrink-0" />
          <span><span className="font-semibold">Full gear set included</span> — no extra charge</span>
        </div>
      )}
      {!hasIncluded && gearRental.price > 0 && (
        <div className="flex items-center gap-2 text-sm text-slate-700 bg-white rounded-xl p-3 mb-4 border border-slate-100">
          <Wrench size={16} className="text-cyan-400 flex-shrink-0" />
          <span>Full gear rental available — <span className="font-semibold">{currency} {gearRental.price}</span></span>
        </div>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((item, i) => (
            <div key={`gear-${i}`} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-slate-100">
              <span className="text-slate-700">{item.name}</span>
              {item.included ? (
                <span className="text-emerald-600 font-semibold">Included</span>
              ) : item.price > 0 ? (
                <span className="text-slate-500">{currency} {item.price}</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export function DirectionsSection({ directions, currency = 'USD' }) {
  if (!directions) return null;
  const hasContent = directions.text || directions.nearest_airport || directions.transfers_available;
  if (!hasContent) return null;

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="directions-section">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Plane size={18} className="text-cyan-400" /> How to Get There</h2>
      {directions.nearest_airport && (
        <div className="flex items-start gap-3 mb-3">
          <Plane size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Nearest Airport</p>
            <p className="text-sm text-slate-700">{directions.nearest_airport}</p>
          </div>
        </div>
      )}
      {directions.transfers_available && (
        <div className="flex items-start gap-3 mb-3" data-testid="transfers-row">
          <Car size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Airport Transfers</p>
            <p className="text-sm text-slate-700">
              Available
              {directions.transfer_price > 0 && <span className="text-slate-500"> — {currency} {directions.transfer_price} per person</span>}
              {!(directions.transfer_price > 0) && <span className="text-emerald-600 font-medium"> · complimentary</span>}
            </p>
          </div>
        </div>
      )}
      {directions.text && (
        <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-white rounded-xl p-4 border border-slate-100 mt-3">
          {directions.text}
        </div>
      )}
    </div>
  );
}


export function PoliciesSection({ listing }) {
  const [open, setOpen] = useState(null);
  const items = useMemo(() => [
    { key: 'cancellation', label: 'Cancellation Policy', value: listing.cancellation_policy },
    { key: 'refund', label: 'Refund Policy', value: listing.refund_policy },
    { key: 'terms', label: 'Terms & Conditions', value: listing.terms_conditions },
    { key: 'legal', label: 'Legal Disclaimer', value: listing.legal_disclaimer },
  ].filter(x => (x.value || '').trim().length > 0), [listing]);

  if (items.length === 0) {
    return (
      <div className="bg-slate-50 rounded-2xl p-6" data-testid="policies-section">
        <h2 className="text-lg font-bold mb-3">Cancellation Policy</h2>
        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" /> Free cancellation up to 48 hours before the trip</div>
          <div className="flex items-start gap-2"><CheckCircle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" /> 50% refund for cancellations 24-48 hours before</div>
          <div className="flex items-start gap-2"><CheckCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" /> No refund for cancellations less than 24 hours before</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="policies-section">
      <h2 className="text-lg font-bold mb-4">Policies</h2>
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.key} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(open === it.key ? null : it.key)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              data-testid={`policy-toggle-${it.key}`}
            >
              <span>{it.label}</span>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${open === it.key ? 'rotate-180' : ''}`} />
            </button>
            {open === it.key && (
              <div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed whitespace-pre-line border-t border-slate-100 pt-3" data-testid={`policy-body-${it.key}`}>
                {it.value}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


export function DiveSpecsBadges({ listing }) {
  const items = [];
  if (listing.num_dives && listing.num_dives > 0) {
    items.push({ icon: Layers, label: `${listing.num_dives} dive${listing.num_dives > 1 ? 's' : ''}`, color: 'text-cyan-600 bg-cyan-50' });
  }
  if (listing.nitrox_available) {
    items.push({ icon: Wind, label: 'Nitrox available', color: 'text-violet-600 bg-violet-50' });
  }
  if (listing.certification_required && listing.certification_required !== 'None Required') {
    items.push({ icon: Award, label: listing.certification_required, color: 'text-amber-700 bg-amber-50' });
  }
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="dive-specs-badges">
      {items.map((it, i) => (
        <span key={`spec-${i}`} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${it.color}`}>
          <it.icon size={12} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
