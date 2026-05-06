import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Users, ThumbsUp, MapPin, ChevronDown } from 'lucide-react';
import { Marker } from '@vis.gl/react-google-maps';
import SafeMapWrapper from '../../components/SafeMapWrapper';
import axios from 'axios';
import { toast } from 'sonner';

export function ReviewSection({ listingId, user, openAuth }) {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [helpfulIds, setHelpfulIds] = useState([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchReviews(); }, [listingId]);

  const fetchReviews = async () => {
    try {
      const res = await axios.get(`/reviews/${listingId}`);
      setReviews(res.data.reviews);
      if (res.data.stats) setStats(res.data.stats);
    } catch (e) { /* silent */ }
  };

  const submitReview = async () => {
    if (!comment.trim()) { toast.error('Please write a comment'); return; }
    setSaving(true);
    try {
      await axios.post('/reviews', { listing_id: listingId, rating, comment });
      toast.success('Review submitted!');
      setShowForm(false); setComment(''); setRating(5);
      fetchReviews();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit review'); }
    finally { setSaving(false); }
  };

  const markHelpful = async (reviewId) => {
    if (!user) { openAuth(); return; }
    try {
      await axios.post(`/reviews/${reviewId}/helpful`);
      setHelpfulIds(prev => [...prev, reviewId]);
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful_count: (r.helpful_count || 0) + 1 } : r));
    } catch (e) { /* silent */ }
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="review-section">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-black text-slate-900">{stats.average || '—'}</div>
          <div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={14} className={s <= Math.round(stats.average) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{stats.total} review{stats.total !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => { if (!user) openAuth(); else setShowForm(!showForm); }}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-sm font-semibold transition-colors"
          data-testid="write-review-btn"
        >
          Write Review
        </button>
      </div>

      {/* Distribution bars */}
      <div className="space-y-1.5 mb-6">
        {[5, 4, 3, 2, 1].map(s => {
          const count = stats.distribution?.[s] || 0;
          const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
          return (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-slate-500">{s}</span>
              <Star size={10} className="text-amber-400 fill-amber-400" />
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6 text-right text-slate-400">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Review form */}
      {showForm && (
        <div className="bg-white rounded-xl p-4 mb-6 border border-slate-200" data-testid="review-form">
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => setRating(s)} data-testid={`star-${s}`}>
                <Star size={24} className={s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
              </button>
            ))}
          </div>
          <textarea
            className="input-field h-24 text-sm"
            placeholder="Share your experience..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            data-testid="review-comment"
          />
          <div className="flex gap-2 mt-3">
            <button onClick={submitReview} disabled={saving} className="btn-primary px-4 py-2 text-sm" data-testid="submit-review-btn">
              {saving ? 'Submitting...' : 'Submit Review'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Reviews list */}
      <div className="space-y-4">
        {reviews.map(r => (
          <div key={r.id} className="bg-white rounded-xl p-4" data-testid="review-item">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                {r.user_name?.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{r.user_name}</p>
                <p className="text-[10px] text-slate-400">{r.created_at?.split('T')[0]}</p>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={12} className={s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{r.comment}</p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => markHelpful(r.id)}
                disabled={helpfulIds.includes(r.id)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-500 disabled:opacity-50"
                data-testid="helpful-btn"
              >
                <ThumbsUp size={12} /> Helpful ({r.helpful_count || 0})
              </button>
            </div>
          </div>
        ))}
        {reviews.length === 0 && <p className="text-center text-sm text-slate-400 py-4">No reviews yet. Be the first!</p>}
      </div>
    </div>
  );
}

export function ConditionCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-xl p-3 text-center" data-testid="condition-card">
      <Icon size={18} className="text-cyan-500 mx-auto mb-1" />
      <p className="text-[10px] text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

export function LocationMap({ location, country }) {
  const KNOWN = {
    'bali': { lat: -8.34, lng: 115.09 }, 'thailand': { lat: 9.0, lng: 98.0 },
    'egypt': { lat: 27.18, lng: 33.83 }, 'maldives': { lat: 3.2, lng: 73.22 },
    'mexico': { lat: 20.4, lng: -87.3 }, 'australia': { lat: -16.9, lng: 145.7 },
    'philippines': { lat: 10.3, lng: 123.9 }, 'indonesia': { lat: -2.5, lng: 118.0 },
  };
  const loc = (location || country || '').toLowerCase();
  let center = { lat: 0, lng: 30 };
  for (const [key, coords] of Object.entries(KNOWN)) {
    if (loc.includes(key)) { center = coords; break; }
  }
  const label = `${location || ''}${country ? `, ${country}` : ''}`;

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="location-map">
      <h2 className="text-lg font-bold mb-3">Location</h2>
      <p className="text-sm text-slate-500 mb-3 flex items-center gap-1">
        <MapPin size={14} className="text-cyan-500" /> {label}
      </p>
      <SafeMapWrapper
        center={center}
        zoom={8}
        height={250}
        label={label}
        className="rounded-xl"
      >
        <Marker position={center} />
      </SafeMapWrapper>
    </div>
  );
}

export function FAQSection({ listing }) {
  const [open, setOpen] = useState(null);
  const faqs = listing.faqs || [
    { q: "What certification do I need?", a: `This experience requires at minimum an Open Water certification for ${listing.difficulty === 'beginner' ? 'basic dives' : 'the planned dives'}. Beginners are welcome with a Try Dive option.` },
    { q: "What should I bring?", a: "Bring your certification card, swimsuit, towel, sunscreen, and any personal dive gear. We provide all essential equipment." },
    { q: "Is there a minimum/maximum group size?", a: "We typically run trips with 2-8 divers per guide to ensure safety and personal attention. Private trips available on request." },
    { q: "What happens if the weather is bad?", a: "Safety first! We'll reschedule if conditions are unsafe. Full refund or free reschedule available for weather cancellations." },
  ];
  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="faq-section">
      <h2 className="text-lg font-bold mb-4">Common Questions</h2>
      <div className="space-y-2">
        {faqs.map((faq, i) => (
          <div key={`k${i}`} className="bg-white rounded-xl overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between px-4 py-3 text-left">
              <span className="text-sm font-semibold text-slate-700">{faq.q}</span>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <div className="px-4 pb-3"><p className="text-sm text-slate-600 leading-relaxed">{faq.a}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListingAttendees({ listingId }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`/buddy-finder/listing-buddies/${listingId}`);
        setAttendees(res.data.attendees || []);
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [listingId]);

  if (loading || attendees.length === 0) return null;

  return (
    <div className="bg-slate-50 rounded-2xl p-6" data-testid="listing-attendees">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <Users size={18} className="text-cyan-500" /> Divers Going
        <span className="text-xs bg-cyan-100 text-cyan-600 px-2 py-0.5 rounded-full font-bold">{attendees.length}</span>
      </h2>
      <p className="text-xs text-slate-400 mb-4">Other divers who booked this experience</p>
      <div className="flex flex-wrap gap-3">
        {attendees.map(a => (
          <button key={a.id} onClick={() => navigate(`/user/${a.id}`)} className="flex items-center gap-2 bg-white hover:bg-cyan-50 rounded-xl px-3 py-2 border border-slate-100 transition-colors" data-testid="attendee-card">
            {a.profile_photo ? (
              <img src={a.profile_photo} alt={a.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-bold">
                {a.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-700">{a.name}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                {a.certification_level && <span className="text-cyan-500 font-semibold">{a.certification_level === 'open_water' ? 'OW' : a.certification_level === 'advanced_open_water' ? 'AOW' : a.certification_level}</span>}
                {a.compatibility > 0 && <span className="text-emerald-500">{a.compatibility}% match</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
