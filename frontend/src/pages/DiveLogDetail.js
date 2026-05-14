import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ChevronLeft, MapPin, Waves, Clock, Thermometer, Eye, Star, Activity,
  Edit3, Trash2, Wind, Gauge, User, Anchor, Tag, Fish,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const LogDiveModal = lazy(() => import('../components/modals/LogDiveModal'));
const EnhancedProfileViewer = lazy(() => import('../components/EnhancedProfileViewer'));

const TYPE_COLORS = {
  reef: 'bg-emerald-50 text-emerald-600',
  wreck: 'bg-amber-50 text-amber-600',
  night: 'bg-indigo-50 text-indigo-600',
  cave: 'bg-slate-100 text-slate-700',
  drift: 'bg-cyan-50 text-cyan-600',
  deep: 'bg-blue-50 text-blue-600',
  shore: 'bg-green-50 text-green-600',
  boat: 'bg-sky-50 text-sky-600',
};
const CHART_TICK = { fontSize: 10, fill: '#94a3b8' };
const CHART_TT = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, color: '#334155', padding: '8px 12px' };

export default function DiveLogDetail() {
  const { logId } = useParams();
  const navigate = useNavigate();
  const [dive, setDive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const fetchDive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/dive-log/${logId}/export/json`);
      setDive(res.data?.dive || null);
    } catch (e) {
      if (e?.response?.status === 404) toast.error('Dive not found');
      else toast.error('Failed to load dive');
      setDive(null);
    } finally {
      setLoading(false);
    }
  }, [logId]);

  useEffect(() => { fetchDive(); }, [fetchDive]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this dive? This cannot be undone.')) return;
    try {
      await axios.delete(`/dive-log/${logId}`);
      toast.success('Dive deleted');
      navigate('/dive-logs');
    } catch (e) {
      toast.error('Failed to delete dive');
    }
  };

  const handleSaved = useCallback(() => { setEditing(false); fetchDive(); }, [fetchDive]);

  const profileData = useMemo(() => {
    if (!dive?.profile?.length || dive.profile.length < 2) return null;
    const step = Math.max(1, Math.floor(dive.profile.length / 120));
    return dive.profile.filter((_, i) => i % step === 0);
  }, [dive]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center" data-testid="dive-detail-loading">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md" data-testid="dive-detail-empty">
            <Anchor className="text-slate-300 mx-auto mb-4" size={48} />
            <h1 className="text-2xl font-bold mb-2">Dive not found</h1>
            <p className="text-slate-500 mb-6">This dive may have been deleted or you don't have access to it.</p>
            <Link to="/dive-logs" className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="back-to-dives-btn">
              <ChevronLeft size={16} /> Back to my dives
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-8" data-testid="dive-detail-page">
        {/* Back link */}
        <Link to="/dive-logs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-cyan-600 transition-colors mb-4" data-testid="back-to-dives-btn">
          <ChevronLeft size={14} /> Back to my dives
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate" data-testid="dive-site-name">{dive.site_name}</h1>
                {dive.dive_type && (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${TYPE_COLORS[dive.dive_type] || 'bg-slate-100 text-slate-600'}`} data-testid="dive-type-badge">
                    {dive.dive_type}
                  </span>
                )}
                {dive.source && dive.source !== 'manual' && (
                  <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[9px] font-bold uppercase">{dive.source}</span>
                )}
              </div>
              <p className="text-sm text-slate-500 flex items-center gap-1.5" data-testid="dive-location">
                <MapPin size={13} /> {dive.location || '—'}
              </p>
              <p className="text-xs text-slate-400 mt-1" data-testid="dive-date">
                {dive.date?.slice(0, 10) || '—'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setEditing(true)} className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold flex items-center gap-1.5 transition-colors" data-testid="edit-dive-btn">
                <Edit3 size={14} /> Edit
              </button>
              <button onClick={handleDelete} className="h-9 px-3 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 text-sm font-semibold flex items-center gap-1.5 transition-colors" data-testid="delete-dive-btn">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <Stat icon={Waves} label="Max depth" value={dive.max_depth != null ? `${dive.max_depth}m` : '—'} tone="blue" testId="stat-max-depth" />
            <Stat icon={Clock} label="Duration" value={dive.duration != null ? `${dive.duration} min` : '—'} tone="violet" testId="stat-duration" />
            <Stat icon={Thermometer} label="Water temp" value={dive.water_temp != null ? `${dive.water_temp}°C` : '—'} tone="orange" testId="stat-water-temp" />
            <Stat icon={Eye} label="Visibility" value={dive.visibility || '—'} tone="cyan" testId="stat-visibility" />
          </div>

          {/* Rating */}
          {dive.rating > 0 && (
            <div className="flex items-center gap-1 mt-4" data-testid="dive-rating">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={16} className={s <= dive.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
              ))}
            </div>
          )}
        </div>

        {/* Depth profile */}
        {profileData && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4" data-testid="depth-profile-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-700">Depth Profile</h2>
                <p className="text-[11px] text-slate-400">{dive.profile.length} points recorded</p>
              </div>
              <button onClick={() => setShowProfile(true)} className="h-8 px-3 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-semibold flex items-center gap-1.5 transition-colors" data-testid="open-profile-viewer-btn">
                <Activity size={12} /> Full analysis
              </button>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profileData}>
                  <defs>
                    <linearGradient id="dive-detail-profile" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0e7490" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time_seconds" tick={CHART_TICK} axisLine={false}
                    tickFormatter={(v) => v != null ? `${Math.floor(v / 60)}m` : ''} />
                  <YAxis reversed tick={CHART_TICK} axisLine={false} unit="m" />
                  <Tooltip contentStyle={CHART_TT}
                    formatter={(v) => [`${v}m`, 'Depth']}
                    labelFormatter={(v) => v != null ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : ''} />
                  <Area type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={2}
                    fill="url(#dive-detail-profile)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Gas / Tank / Conditions row */}
        {(dive.gas_mix || dive.sac_rate || dive.buddy || dive.current || dive.surface_conditions || dive.entry_type || dive.water_type) && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4" data-testid="dive-conditions-card">
            <h2 className="text-sm font-bold text-slate-700 mb-3">Conditions & Equipment</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {dive.gas_mix && <KV icon={Wind} label="Gas" value={dive.gas_mix} testId="kv-gas-mix" />}
              {dive.sac_rate > 0 && <KV icon={Gauge} label="SAC rate" value={`${dive.sac_rate} L/min`} testId="kv-sac" />}
              {dive.buddy && <KV icon={User} label="Buddy" value={dive.buddy} testId="kv-buddy" />}
              {dive.current && <KV icon={Waves} label="Current" value={dive.current} testId="kv-current" />}
              {dive.surface_conditions && <KV icon={Eye} label="Surface" value={dive.surface_conditions} testId="kv-surface" />}
              {dive.entry_type && <KV icon={Anchor} label="Entry" value={dive.entry_type} testId="kv-entry" />}
              {dive.water_type && <KV icon={Waves} label="Water" value={dive.water_type} testId="kv-water-type" />}
              {dive.computer_model && <KV icon={Activity} label="Computer" value={dive.computer_model} testId="kv-computer" />}
            </div>
          </div>
        )}

        {/* Notes */}
        {dive.notes && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4" data-testid="dive-notes-card">
            <h2 className="text-sm font-bold text-slate-700 mb-2">Notes</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{dive.notes}</p>
          </div>
        )}

        {/* Tags */}
        {dive.tags?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4" data-testid="dive-tags-card">
            <h2 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Tag size={13} /> Tags</h2>
            <div className="flex flex-wrap gap-1.5">
              {dive.tags.map((t, i) => (
                <span key={`t${i}`} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold" data-testid="dive-tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Sightings */}
        {dive.sightings?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4" data-testid="dive-sightings-card">
            <h2 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Fish size={13} /> Sightings</h2>
            <div className="flex flex-wrap gap-1.5">
              {dive.sightings.map((s, i) => (
                <span key={`s${i}`} className="px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 text-xs font-semibold" data-testid="dive-sighting">
                  {s.species || s.name || 'Unknown'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {dive.photos?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4" data-testid="dive-photos-card">
            <h2 className="text-sm font-bold text-slate-700 mb-3">Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {dive.photos.map((p, i) => {
                const url = typeof p === 'string' ? p : (p?.url || '');
                const src = url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${url}` : url;
                return (
                  <img key={`p${i}`} src={src} alt={`Dive ${i + 1}`} className="aspect-square w-full rounded-xl object-cover border border-slate-100" loading="lazy" data-testid="dive-photo" />
                );
              })}
            </div>
          </div>
        )}
      </main>

      <Footer />

      {/* Edit modal */}
      {editing && (
        <Suspense fallback={null}>
          <LogDiveModal dive={dive} onClose={() => setEditing(false)} onLogged={handleSaved} />
        </Suspense>
      )}

      {/* Profile analysis modal */}
      {showProfile && profileData && (
        <Suspense fallback={null}>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="profile-viewer-overlay">
            <EnhancedProfileViewer dive={dive} onClose={() => setShowProfile(false)} />
          </div>
        </Suspense>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone, testId }) {
  const tones = {
    blue: 'text-blue-500',
    violet: 'text-violet-500',
    orange: 'text-orange-500',
    cyan: 'text-cyan-500',
  };
  return (
    <div className="bg-slate-50 rounded-xl p-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={tones[tone] || 'text-slate-400'} />
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      </div>
      <p className="text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function KV({ icon: Icon, label, value, testId }) {
  return (
    <div className="flex items-start gap-2" data-testid={testId}>
      <Icon size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-700 truncate">{value}</p>
      </div>
    </div>
  );
}
