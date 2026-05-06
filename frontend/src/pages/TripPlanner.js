import { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  Plus, MapPin, Calendar, Users, ThumbsUp, Trash2, Send, UserPlus, X,
  Globe, Clock, ChevronRight, Anchor, Star, Check, ArrowLeft
} from 'lucide-react';
import axios from 'axios';
import { TripListSkeleton, TripDetailSkeleton } from '../components/Skeletons';
import { toast } from 'sonner';

export default function TripPlanner() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/trips');
      setTrips(res.data.trips || []);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) fetchTrips();
    else setLoading(false);
  }, [user, fetchTrips]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openCreate = useCallback(() => setShowCreate(true), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closeCreate = useCallback(() => setShowCreate(false), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCreated = useCallback(() => {
    setShowCreate(false);
    fetchTrips();
  }, [fetchTrips]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleOpenTrip = useCallback((tripId) => {
    navigate(`/trips/${tripId}`);
  }, [navigate]);

  if (!user) return (
    <div className="min-h-screen bg-slate-50 flex flex-col"><Navbar />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-4"><Globe size={28} className="text-cyan-500" /></div>
          <h2 className="text-xl font-bold mb-2">Plan a Group Trip</h2>
          <p className="text-slate-500 text-sm mb-4 max-w-sm">Create trip plans, invite buddies, and book dive experiences together.</p>
          <button onClick={openAuth} className="h-10 px-6 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold transition-colors" data-testid="trip-dive-in">Dive in</button>
        </div>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8" data-testid="trip-planner-page">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Trip Planner</h1>
            <p className="text-slate-500 text-sm mt-0.5">Plan group dive trips with your buddies</p>
          </div>
          <button onClick={openCreate} className="h-10 px-5 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm self-start sm:self-auto" data-testid="create-trip-btn">
            <Plus size={15} /> New Trip
          </button>
        </div>

        {loading && trips.length === 0 ? (
          <TripListSkeleton count={3} />
        ) : trips.length > 0 ? (
          <div className="space-y-4">
            {trips.map(trip => (
              <TripCard key={trip.id} trip={trip} userId={user.id} onOpen={handleOpenTrip} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Globe className="text-slate-200 mx-auto mb-3" size={48} />
            <h3 className="font-bold text-slate-700 mb-1 text-lg">No trips yet</h3>
            <p className="text-slate-400 text-sm mb-4">Create your first group dive trip!</p>
            <button onClick={openCreate} className="h-10 px-5 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold" data-testid="create-first-trip-btn">
              <Plus size={15} className="inline mr-1" /> Create Trip
            </button>
          </div>
        )}
      </div>

      {showCreate && <CreateTripModal onClose={closeCreate} onCreated={handleCreated} />}
      <Footer />
    </div>
  );
}

const TripCard = memo(function TripCard({ trip, userId, onOpen }) {
  const STATUS_STYLES = {
    planning: 'bg-amber-50 text-amber-600', confirmed: 'bg-emerald-50 text-emerald-600', completed: 'bg-slate-100 text-slate-500',
  };
  const confirmedCount = trip.members?.filter(m => m.status === 'confirmed').length || 0;
  const myStatus = trip.members?.find(m => m.user_id === userId)?.status;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 hover:shadow-md transition-all cursor-pointer" onClick={() => onOpen(trip.id)} data-testid="trip-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-base sm:text-lg text-slate-900 truncate">{trip.name}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${STATUS_STYLES[trip.status] || STATUS_STYLES.planning}`}>{trip.status}</span>
            {myStatus === 'invited' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-600">Invited</span>}
          </div>
          {trip.destination && <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={11} /> {trip.destination}{trip.country ? `, ${trip.country}` : ''}</p>}
        </div>
        <ChevronRight size={18} className="text-slate-300 flex-shrink-0 mt-1" />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {trip.start_date && <span className="flex items-center gap-1"><Calendar size={12} /> {trip.start_date}{trip.end_date ? ` — ${trip.end_date}` : ''}</span>}
        <span className="flex items-center gap-1"><Users size={12} /> {confirmedCount}/{trip.max_members || 8}</span>
        {trip.listings?.length > 0 && <span className="flex items-center gap-1"><Anchor size={12} /> {trip.listings.length} listing{trip.listings.length !== 1 ? 's' : ''}</span>}
      </div>

      {/* Member avatars */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-50">
        {trip.members?.slice(0, 6).map((m, i) => (
          <div key={`k${i}`} className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-[9px] font-bold border-2 border-white -ml-1 first:ml-0" title={m.name}>
            {m.profile_photo ? <img src={m.profile_photo} alt="" className="w-full h-full rounded-full object-cover" loading="lazy" /> : m.name?.charAt(0)}
          </div>
        ))}
        {(trip.members?.length || 0) > 6 && <span className="text-[10px] text-slate-400 ml-1">+{trip.members.length - 6}</span>}
      </div>
    </div>
  );
});

const CreateTripModal = memo(function CreateTripModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', destination: '', country: '', start_date: '', end_date: '', max_members: 6, description: '' });
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useCallback((k, v) => setForm(prev => ({ ...prev, [k]: v })), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const submit = useCallback(async () => {
    if (!form.name.trim()) { toast.error('Trip name required'); return; }
    setSaving(true);
    try {
      await axios.post('/trips', form);
      toast.success('Trip created!');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  }, [form, onCreated]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="create-trip-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-lg">New Trip</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" data-testid="create-trip-close-btn"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Trip Name *</label>
            <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="e.g., Bali Diving March 2026" value={form.name} onChange={e => set('name', e.target.value)} data-testid="trip-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Destination</label>
              <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="e.g., Bali" value={form.destination} onChange={e => set('destination', e.target.value)} data-testid="trip-dest-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Country</label>
              <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="e.g., Indonesia" value={form.country} onChange={e => set('country', e.target.value)} data-testid="trip-country-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Start Date</label>
              <input type="date" className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" value={form.start_date} onChange={e => set('start_date', e.target.value)} data-testid="trip-start-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">End Date</label>
              <input type="date" className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" value={form.end_date} onChange={e => set('end_date', e.target.value)} data-testid="trip-end-input" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Max Group Size</label>
            <select className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" value={form.max_members} onChange={e => set('max_members', +e.target.value)} data-testid="trip-size-input">
              {[2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(n => <option key={n} value={n}>{n} divers</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea className="w-full bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 outline-none focus:border-cyan-400 h-20 resize-none" placeholder="What kind of diving? Any special requirements?" value={form.description} onChange={e => set('description', e.target.value)} data-testid="trip-desc-input" />
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50" data-testid="create-trip-cancel-btn">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold" data-testid="submit-trip-btn">
            {saving ? 'Creating...' : 'Create Trip'}
          </button>
        </div>
      </div>
    </div>
  );
});
