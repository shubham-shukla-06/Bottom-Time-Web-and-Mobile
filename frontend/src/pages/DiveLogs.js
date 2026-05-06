import { useState, useEffect, useRef, useMemo } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import { Plus, Waves, MapPin, Calendar, Thermometer, Eye, Clock, Trash2, Edit3, Star, Search, X, Anchor, ImagePlus, Upload, Monitor, ChevronDown, ChevronUp, Check, FileText, Activity } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Footer from '../components/Footer';
import { DiveLogListSkeleton } from '../components/Skeletons';

const CHART_TICK_STYLE = { fontSize: 9, fill: '#94a3b8' };
const CHART_TOOLTIP_STYLE = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 };

const DIVE_TYPES = [
  { value: 'reef', label: 'Reef' },
  { value: 'wreck', label: 'Wreck' },
  { value: 'night', label: 'Night' },
  { value: 'cave', label: 'Cave' },
  { value: 'drift', label: 'Drift' },
  { value: 'deep', label: 'Deep' },
  { value: 'shore', label: 'Shore' },
  { value: 'boat', label: 'Boat' },
];

const TYPE_COLORS = {
  reef: 'bg-emerald-50 text-emerald-700', wreck: 'bg-amber-50 text-amber-700',
  night: 'bg-indigo-50 text-indigo-700', cave: 'bg-slate-100 text-slate-700',
  drift: 'bg-cyan-50 text-cyan-400', deep: 'bg-blue-50 text-blue-700',
  shore: 'bg-green-50 text-green-700', boat: 'bg-sky-50 text-sky-700',
};

export default function DiveLogs() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingLog, setEditingLog] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchLogs = async (q) => {
    setLoading(true);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : '';
      const res = await axios.get(`/dive-log${params}`);
      setLogs(res.data.logs);
      setStats(res.data.stats);
    } catch (e) { toast.error('Failed to load dive logs'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) fetchLogs(); }, [user]);

  const deleteLog = async (id) => {
    if (!window.confirm('Delete this dive log?')) return;
    try {
      await axios.delete(`/dive-log/${id}`);
      toast.success('Log deleted');
      fetchLogs(search);
    } catch (e) { toast.error('Failed to delete'); }
  };

  const openEdit = (log) => { setEditingLog(log); setShowForm(true); };
  const openCreate = () => { setEditingLog(null); setShowForm(true); };

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-[1600px] mx-auto px-6 md:px-12 py-20 text-center">
          <Anchor className="text-slate-300 mx-auto mb-4" size={56} />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Your Dive Log</h1>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">Track every dive — depth, duration, conditions, and more. <button onClick={() => openAuth()} className="text-cyan-400 font-semibold hover:underline">Dive in</button> to start logging.</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 md:px-12 py-8" data-testid="dive-logs-page">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Dive Log</h1>
            <p className="text-slate-500 text-sm">Track every dive, build your logbook</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="flex items-center gap-2 text-sm px-4 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors" data-testid="import-dives-btn">
              <Monitor size={16} /> Import from Computer
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm" data-testid="add-dive-btn">
              <Plus size={16} /> Log Dive
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Dives" value={stats.total || 0} icon={Anchor} color="cyan" />
          <StatCard label="Max Depth" value={`${stats.max_depth || 0}m`} icon={Waves} color="blue" />
          <StatCard label="Avg Depth" value={`${stats.avg_depth || 0}m`} icon={Waves} color="teal" />
          <StatCard label="Total Time" value={`${stats.total_time || 0} min`} icon={Clock} color="violet" />
          <StatCard label="Countries" value={stats.countries || 0} icon={MapPin} color="green" />
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
          <input type="text" placeholder="Search by site or location..." className="input-field w-full text-sm bg-white" style={{ paddingLeft: '2.5rem' }}
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLogs(search)} data-testid="dive-log-search" />
        </div>

        {loading && logs.length === 0 ? (
          <DiveLogListSkeleton count={5} />
        ) : logs.length > 0 ? (
          <div className="flex flex-col gap-3">
            {logs.map(log => (
              <LogCard key={log.id} log={log} onEdit={() => openEdit(log)} onDelete={() => deleteLog(log.id)} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Waves className="text-slate-300 mx-auto mb-4" size={48} />
            <h3 className="text-lg font-bold mb-1">{search ? 'No dives match your search' : 'No dives logged yet'}</h3>
            <p className="text-slate-500 text-sm">{search ? 'Try a different search term' : 'Start tracking your underwater adventures'}</p>
          </div>
        )}

        {showForm && (
          <DiveLogForm
            log={editingLog}
            onClose={() => { setShowForm(false); setEditingLog(null); }}
            onSaved={() => { setShowForm(false); setEditingLog(null); fetchLogs(search); }}
          />
        )}

        {showImport && (
          <DiveComputerImport
            onClose={() => setShowImport(false)}
            onImported={() => { setShowImport(false); fetchLogs(search); }}
          />
        )}
      </div>
      <Footer />
    </div>
  );
}

/* ====== LOG CARD ====== */
function LogCard({ log, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const hasProfile = log.profile?.length > 2;
  
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-md transition-all" data-testid="dive-log-entry">
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm">{log.site_name}</h3>
              {log.dive_type && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${TYPE_COLORS[log.dive_type] || 'bg-slate-100 text-slate-600'}`} data-testid="dive-type-badge">
                  {log.dive_type}
                </span>
              )}
              {log.source && log.source !== 'manual' && (
                <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[9px] font-bold">{log.source}</span>
              )}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={10} /> {log.location}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-slate-400 mr-1">{log.date?.slice(0, 10)}</span>
            {hasProfile && (
              <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-cyan-50 text-slate-400 hover:text-cyan-500 transition-colors" data-testid="expand-profile-btn" title="View depth profile">
                <Activity size={14} />
              </button>
            )}
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-cyan-50 text-slate-400 hover:text-cyan-400 transition-colors" data-testid="edit-log-btn"><Edit3 size={14} /></button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" data-testid="delete-log-btn"><Trash2 size={14} /></button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 mb-2">
          {log.max_depth != null && <span className="flex items-center gap-1"><Waves size={13} className="text-blue-500" /> {log.max_depth}m</span>}
          {log.duration != null && <span className="flex items-center gap-1"><Clock size={13} className="text-violet-500" /> {log.duration} min</span>}
          {log.visibility && <span className="flex items-center gap-1"><Eye size={13} className="text-cyan-400" /> {log.visibility}</span>}
          {log.water_temp != null && <span className="flex items-center gap-1"><Thermometer size={13} className="text-orange-500" /> {log.water_temp}°C</span>}
          {log.buddy && <span className="flex items-center gap-1 text-slate-500">Buddy: {log.buddy}</span>}
          {log.computer_model && <span className="text-xs text-slate-400">{log.computer_model}</span>}
        </div>

        {log.rating > 0 && (
          <div className="flex gap-0.5 mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} size={14} className={s <= log.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
            ))}
          </div>
        )}

        {log.notes && <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3 mt-1">{log.notes}</p>}
        {log.photos && log.photos.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide" data-testid="dive-photos">
            {log.photos.map((url, i) => (
              <img key={`k${i}`} src={url} alt={`Dive photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover flex-shrink-0 border border-slate-100" loading="lazy" />
            ))}
          </div>
        )}
      </div>

      {/* Expanded Depth Profile */}
      {expanded && hasProfile && (
        <div className="border-t border-slate-100 bg-slate-50 p-4" data-testid="inline-profile">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Depth Profile ({log.profile.length} points)</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={log.profile.filter((_, i) => i % Math.max(1, Math.floor(log.profile.length / 100)) === 0)}>
                <defs>
                  <linearGradient id={`profile-${log.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0e7490" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time_seconds" tick={CHART_TICK_STYLE} axisLine={false}
                  tickFormatter={(v) => v != null ? `${Math.floor(v / 60)}m` : ''} />
                <YAxis reversed tick={CHART_TICK_STYLE} axisLine={false} unit="m" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v, name) => [`${v}m`, 'Depth']}
                  labelFormatter={(v) => v != null ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : ''} />
                <Area type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={2} fill={`url(#profile-${log.id})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====== FORM MODAL (Create + Edit) ====== */
function DiveLogForm({ log, onClose, onSaved }) {
  const isEdit = !!log;
  const [form, setForm] = useState({
    site_name: log?.site_name || '',
    location: log?.location || '',
    date: log?.date || new Date().toISOString().split('T')[0],
    dive_type: log?.dive_type || '',
    max_depth: log?.max_depth?.toString() || '',
    duration: log?.duration?.toString() || '',
    buddy: log?.buddy || '',
    visibility: log?.visibility || '',
    water_temp: log?.water_temp?.toString() || '',
    notes: log?.notes || '',
    rating: log?.rating || 0,
    photos: log?.photos || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef(null);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.site_name || !form.location || !form.date) { toast.error('Fill in site, location, and date'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        max_depth: form.max_depth ? parseFloat(form.max_depth) : null,
        duration: form.duration ? parseInt(form.duration) : null,
        water_temp: form.water_temp ? parseFloat(form.water_temp) : null,
        rating: form.rating || null,
        dive_type: form.dive_type || null,
        visibility: form.visibility || null, buddy: form.buddy || null, notes: form.notes || null,
        photos: form.photos.length > 0 ? form.photos : null,
      };
      if (isEdit) {
        await axios.put(`/dive-log/${log.id}`, payload);
        toast.success('Dive log updated!');
      } else {
        await axios.post('/dive-log', payload);
        toast.success('Dive logged!');
      }
      onSaved();
    } catch (e) { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4" data-testid="dive-log-form">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Dive' : 'Log a Dive'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" data-testid="close-log-form"><X size={20} /></button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Site + Location */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dive Site *</label>
            <input className="input-field" placeholder="e.g., Blue Hole" value={form.site_name} onChange={e => set('site_name', e.target.value)} data-testid="log-site_name" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Location *</label>
            <input className="input-field" placeholder="e.g., Dahab, Egypt" value={form.location} onChange={e => set('location', e.target.value)} data-testid="log-location" />
          </div>

          {/* Date + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date *</label>
              <input type="date" className="input-field" value={form.date} onChange={e => set('date', e.target.value)} data-testid="log-date" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dive Type</label>
              <select className="input-field" value={form.dive_type} onChange={e => set('dive_type', e.target.value)} data-testid="log-dive_type">
                <option value="">Select type</option>
                {DIVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Depth + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Max Depth (m)</label>
              <input type="number" className="input-field" placeholder="18" value={form.max_depth} onChange={e => set('max_depth', e.target.value)} data-testid="log-max_depth" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Duration (min)</label>
              <input type="number" className="input-field" placeholder="45" value={form.duration} onChange={e => set('duration', e.target.value)} data-testid="log-duration" />
            </div>
          </div>

          {/* Temp + Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Water Temp (°C)</label>
              <input type="number" className="input-field" placeholder="26" value={form.water_temp} onChange={e => set('water_temp', e.target.value)} data-testid="log-water_temp" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Visibility</label>
              <input className="input-field" placeholder="Good / 15m" value={form.visibility} onChange={e => set('visibility', e.target.value)} data-testid="log-visibility" />
            </div>
          </div>

          {/* Buddy */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dive Buddy</label>
            <input className="input-field" placeholder="Name" value={form.buddy} onChange={e => set('buddy', e.target.value)} data-testid="log-buddy" />
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Rating</label>
            <div className="flex gap-1" data-testid="log-rating">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} type="button" onClick={() => set('rating', form.rating === s ? 0 : s)}
                  className="p-1 hover:scale-110 transition-transform">
                  <Star size={24} className={s <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 hover:text-amber-300'} />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
            <textarea className="input-field h-24 py-2.5" placeholder="What did you see? How was the dive?" value={form.notes} onChange={e => set('notes', e.target.value)} data-testid="log-notes" />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Photos</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.photos.map((url, i) => (
                <div key={`k${i}`} className="relative group">
                  <img src={url} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-slate-100" loading="lazy" />
                  <button onClick={() => set('photos', form.photos.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={10} />
                  </button>
                </div>
              ))}
              {form.photos.length < 6 && (
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="h-16 w-16 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-cyan-400 hover:text-cyan-400 transition-colors"
                  data-testid="add-dive-photo-btn"
                >
                  {uploadingPhoto ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400" /> : <ImagePlus size={18} />}
                </button>
              )}
            </div>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="dive-photo-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
                setUploadingPhoto(true);
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  const res = await axios.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  set('photos', [...form.photos, res.data.url]);
                } catch (err) { toast.error('Upload failed'); }
                finally { setUploadingPhoto(false); e.target.value = ''; }
              }}
            />
            <p className="text-[10px] text-slate-400">Up to 6 photos, max 5MB each</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 btn-primary py-2.5 text-sm font-semibold" data-testid="submit-dive-log">
            {saving ? 'Saving...' : isEdit ? 'Update Dive' : 'Log This Dive'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====== STAT CARD ====== */
function StatCard({ label, value, icon: Icon, color }) {
  const colorMap = {
    cyan: 'from-cyan-500 to-cyan-400', blue: 'from-blue-500 to-blue-700',
    teal: 'from-teal-500 to-teal-700', violet: 'from-violet-500 to-violet-700',
    green: 'from-green-500 to-green-700',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 hover:shadow-md transition-shadow" data-testid="dive-stat">
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center mb-2`}>
        <Icon size={13} className="text-white" />
      </div>
      <div className="text-base font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-400 font-medium">{label}</div>
    </div>
  );
}


/* ====== DIVE COMPUTER IMPORT ====== */
function DiveComputerImport({ onClose, onImported }) {
  const [brands, setBrands] = useState([]);
  const [parsedDives, setParsedDives] = useState(null);
  const [sourceFile, setSourceFile] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState(null);
  const fileRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get('/dive-import/supported-brands').then(r => setBrands(r.data.brands || [])).catch(() => {});
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/dive-import/parse', fd);
      setParsedDives(res.data.dives);
      setSourceFile(file.name);
      toast.success(`Found ${res.data.count} dive(s) in ${file.name}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to parse file');
    } finally { setUploading(false); e.target.value = ''; }
  };

  const handleImport = async () => {
    if (!parsedDives?.length) return;
    setImporting(true);
    try {
      const res = await axios.post('/dive-import/import', { dives: parsedDives, source_file: sourceFile });
      toast.success(res.data.message);
      onImported();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="dive-import-modal">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Import from Dive Computer</h2>
            <p className="text-xs text-slate-500">Upload FIT, UDDF, or Subsurface XML files</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Upload Area */}
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/30 transition-all" data-testid="upload-drop-zone">
            <Upload size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600 mb-1">{uploading ? 'Parsing...' : 'Click to upload dive file'}</p>
            <p className="text-xs text-slate-400">Supports .fit (Garmin/Suunto), .uddf, .xml (Subsurface)</p>
            <input ref={fileRef} type="file" accept=".fit,.uddf,.xml" className="hidden" onChange={handleFileUpload} />
          </div>

          {/* Parsed Dives Preview */}
          {parsedDives && (
            <div className="flex flex-col gap-3" data-testid="parsed-dives">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-green-500" />
                  <span className="text-sm font-bold text-slate-800">{parsedDives.length} dive{parsedDives.length !== 1 ? 's' : ''} found</span>
                  <span className="text-xs text-slate-400">from {sourceFile}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {parsedDives.map((d, i) => (
                  <div key={`k${i}`} className="flex items-center justify-between bg-slate-50 rounded-lg p-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      <div>
                        <p className="font-medium text-slate-700">{d.date ? new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}</p>
                        {d.location && <p className="text-[10px] text-slate-400">{d.location}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-500">
                      <span>{d.max_depth}m</span>
                      <span>{d.duration_minutes} min</span>
                      {d.water_temp_min != null && <span>{d.water_temp_min}°C</span>}
                      {d.profile?.length > 0 && <span className="text-cyan-500">{d.profile.length} pts</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supported Brands */}
          {!parsedDives && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3">Supported Dive Computers</h3>
              <div className="flex flex-col gap-2">
                {brands.map(b => (
                  <div key={b.brand} className="border border-slate-100 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedBrand(expandedBrand === b.brand ? null : b.brand)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50" data-testid={`brand-${b.brand}`}>
                      <div className="flex items-center gap-3">
                        <Monitor size={14} className="text-cyan-500" />
                        <span className="text-sm font-semibold text-slate-700">{b.brand}</span>
                        <div className="flex gap-1">
                          {b.formats.map(f => (
                            <span key={f} className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 text-[9px] font-bold rounded">{f}</span>
                          ))}
                        </div>
                      </div>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${expandedBrand === b.brand ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedBrand === b.brand && (
                      <div className="px-4 pb-3 border-t border-slate-50">
                        <p className="text-xs text-slate-500 mt-2 mb-1">{b.notes}</p>
                        <p className="text-[10px] text-slate-400">Models: {b.models.join(', ')}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          {parsedDives ? (
            <div className="flex gap-2">
              <button onClick={() => { setParsedDives(null); setSourceFile(''); }}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Upload Different File</button>
              <button onClick={handleImport} disabled={importing}
                className="px-5 py-2.5 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-2" data-testid="confirm-import-btn">
                <FileText size={14} /> {importing ? 'Importing...' : `Import ${parsedDives.length} Dive${parsedDives.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

