import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { SurfaceLogListSkeleton } from '../components/Skeletons';
import useTabParam from '../hooks/useTabParam';
import {
  Waves, Plus, MapPin, Clock, Anchor, Heart, Zap, Star, Flame, Globe,
  Fish, Camera, Send, MessageCircle, ChevronDown, X, Thermometer, Check,
  Sparkles, Wind, Gift, Brain
} from 'lucide-react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';

const MOODS = [
  { key: 'stoked', label: 'Stoked', icon: Zap, color: 'text-amber-500' },
  { key: 'serene', label: 'Serene', icon: Wind, color: 'text-sky-400' },
  { key: 'adventurous', label: 'Adventurous', icon: Sparkles, color: 'text-violet-500' },
  { key: 'grateful', label: 'Grateful', icon: Gift, color: 'text-rose-400' },
  { key: 'tired', label: 'Tired but happy', icon: Anchor, color: 'text-slate-400' },
  { key: 'mind_blown', label: 'Mind blown', icon: Brain, color: 'text-fuchsia-500' },
];

const REACTIONS = [
  { key: 'stoke', icon: Zap, label: 'Stoked!', color: 'text-amber-500' },
  { key: 'heart', icon: Heart, label: 'Love', color: 'text-red-500' },
  { key: 'epic', icon: Star, label: 'Epic', color: 'text-violet-500' },
  { key: 'fire', icon: Flame, label: 'Fire', color: 'text-orange-500' },
  { key: 'jealous', icon: Globe, label: 'Take me!', color: 'text-emerald-500' },
];

export default function SurfaceLog() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam('tab', 'feed', ['feed', 'mine']);
  const [feedLogs, setFeedLogs] = useState([]);
  const [myLogs, setMyLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) { if (tab === 'feed') fetchFeed(); else fetchMine(); }
    else setLoading(false);
  }, [user, tab]);

  const fetchFeed = async () => {
    setLoading(true);
    try { const r = await axios.get('/surface-log/feed'); setFeedLogs(r.data.logs || []); } catch (e) { /* silent */ } finally { setLoading(false); }
  };

  const fetchMine = async () => {
    setLoading(true);
    try { const r = await axios.get('/surface-log'); setMyLogs(r.data.logs || []); } catch (e) { /* silent */ } finally { setLoading(false); }
  };

  const handleReact = async (logId, reaction) => {
    try {
      const r = await axios.post(`/surface-log/${logId}/react`, { reaction });
      const update = (logs) => logs.map(l => l.id === logId ? {
        ...l, viewer_reaction: r.data.reacted ? r.data.reaction : null,
        reaction_count: l.reaction_count + (r.data.reacted ? 1 : -1),
      } : l);
      setFeedLogs(update);
      setMyLogs(update);
    } catch (e) { /* react failed */ }
  };

  if (!user) return (
    <div className="min-h-screen bg-slate-50 flex flex-col"><Navbar />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-4"><Waves size={28} className="text-cyan-500" /></div>
          <h2 className="text-xl font-bold mb-2">Surface Log</h2>
          <p className="text-slate-500 text-sm mb-4 max-w-sm">Beautiful dive day journals — auto-generated from your dive data, shareable with friends.</p>
          <button onClick={openAuth} className="h-10 px-6 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold" data-testid="surface-signin">Dive in</button>
        </div>
      </div>
      <Footer />
    </div>
  );

  const TABS = [
    { key: 'feed', label: 'From Buddies' },
    { key: 'mine', label: 'My Logs' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8" data-testid="surface-log-page">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Surface Log</h1>
            <p className="text-slate-500 text-sm mt-0.5">Your dive day journals</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="h-10 px-5 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 self-start sm:self-auto" data-testid="create-log-btn">
            <Plus size={15} /> New Log
          </button>
        </div>

        <div className="flex gap-1.5 mb-6 bg-white rounded-xl p-1.5 shadow-sm border border-slate-100 w-fit" data-testid="surface-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`h-9 px-5 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? 'bg-cyan-400 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              data-testid={`tab-${t.key}`}>{t.label}</button>
          ))}
        </div>

        {loading && feedLogs.length === 0 && myLogs.length === 0 ? (
          <SurfaceLogListSkeleton count={4} />
        ) : (
          <div className="flex flex-col gap-5">
            {(tab === 'feed' ? feedLogs : myLogs).length > 0 ? (
              (tab === 'feed' ? feedLogs : myLogs).map(log => (
                <SurfaceLogCard key={log.id} log={log} onReact={handleReact} />
              ))
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
                <Waves className="text-slate-200 mx-auto mb-3" size={48} />
                <h3 className="font-bold text-slate-700 mb-1">{tab === 'feed' ? 'No logs from buddies yet' : 'No surface logs yet'}</h3>
                <p className="text-slate-400 text-sm mb-4">{tab === 'feed' ? 'Your buddies\' dive day journals will appear here.' : 'Create your first dive day journal!'}</p>
                {tab === 'mine' && (
                  <button onClick={() => setShowCreate(true)} className="h-9 px-5 bg-cyan-400 text-white rounded-xl text-sm font-bold" data-testid="create-first-log">
                    <Plus size={14} className="inline mr-1" /> Create Log
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && <CreateLogModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); setTab('mine'); fetchMine(); }} />}
      <Footer />
    </div>
  );
}


function SurfaceLogCard({ log, onReact }) {
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [showReactions, setShowReactions] = useState(false);

  const loadComments = async () => {
    try { const r = await axios.get(`/surface-log/${log.id}/comments`); setComments(r.data.comments || []); } catch (e) { /* silent */ }
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    try {
      const r = await axios.post(`/surface-log/${log.id}/comment`, { text: commentText });
      setComments(prev => [r.data, ...prev]);
      setCommentText('');
    } catch (e) { toast.error('Failed'); }
  };

  const mood = MOODS.find(m => m.key === log.mood);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="surface-log-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <button onClick={() => navigate(`/user/${log.user_id}`)} className="flex-shrink-0">
          {log.user_photo ? <img src={log.user_photo} alt="" className="w-10 h-10 rounded-full object-cover" loading="lazy" />
          : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold">{log.user_name?.charAt(0)}</div>}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => navigate(`/user/${log.user_id}`)} className="text-sm font-bold text-slate-800 hover:text-cyan-500">{log.user_name}</button>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <MapPin size={9} /> {log.location || log.sites?.join(', ')} <span className="mx-1">·</span> {log.date}
          </p>
        </div>
        {mood && <span className={`${mood.color}`} title={mood.label}><mood.icon size={20} /></span>}
      </div>

      {/* Dive Stats Banner */}
      <div className="mx-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 text-white mb-3">
        <div className="flex items-center gap-2 mb-3">
          <Anchor size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Dive Day</span>
          <span className="text-[10px] text-slate-400 ml-auto">{log.date}</span>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-lg sm:text-xl font-black">{log.dive_count}</p>
            <p className="text-[9px] text-slate-400">Dives</p>
          </div>
          <div>
            <p className="text-lg sm:text-xl font-black">{log.max_depth || 0}<span className="text-xs font-normal">m</span></p>
            <p className="text-[9px] text-slate-400">Max Depth</p>
          </div>
          <div>
            <p className="text-lg sm:text-xl font-black">{log.total_time || 0}<span className="text-xs font-normal">min</span></p>
            <p className="text-[9px] text-slate-400">Bottom Time</p>
          </div>
          <div>
            {log.water_temp ? <p className="text-lg sm:text-xl font-black">{log.water_temp}<span className="text-xs font-normal">°</span></p> : <p className="text-lg font-black">—</p>}
            <p className="text-[9px] text-slate-400">Temp</p>
          </div>
        </div>

        {/* Mini dive profiles */}
        {log.profiles?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="grid grid-cols-2 gap-2">
              {log.profiles.slice(0, 2).map((p, i) => (
                <div key={`k${i}`} className="bg-white/5 rounded-lg p-2">
                  <p className="text-[9px] text-slate-400 mb-1 truncate">{p.site_name}</p>
                  <div className="h-8">
                    <ResponsiveContainer width="100%" height="100%" minWidth={50} minHeight={8}>
                      <AreaChart data={p.profile || []}>
                        <YAxis reversed hide domain={['dataMin', 'dataMax']} />
                        <Area type="monotone" dataKey="depth" stroke="#22d3ee" strokeWidth={1} fill="#22d3ee15" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sites visited */}
      {log.sites?.length > 0 && (
        <div className="px-4 mb-2 flex flex-wrap gap-1">
          {log.sites.map(s => (
            <span key={s} className="px-2 py-0.5 bg-cyan-50 text-cyan-600 rounded-full text-[10px] font-semibold flex items-center gap-0.5"><MapPin size={8} /> {s}</span>
          ))}
        </div>
      )}

      {/* Species spotted */}
      {log.species?.length > 0 && (
        <div className="px-4 mb-2">
          <p className="text-[9px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1"><Fish size={9} /> Spotted</p>
          <div className="flex flex-wrap gap-1">
            {log.species.map(s => (
              <span key={s} className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-semibold">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Caption */}
      {log.caption && <p className="px-4 text-sm text-slate-700 mb-2">{log.caption}</p>}
      {log.highlight && <p className="px-4 text-xs text-slate-500 italic mb-2">Highlight: {log.highlight}</p>}

      {/* Photos */}
      {(log.dive_photos?.length > 0 || log.extra_photos?.length > 0) && (
        <div className="px-4 mb-3 flex gap-1.5 overflow-x-auto">
          {[...(log.dive_photos || []), ...(log.extra_photos || [])].slice(0, 4).map((url, i) => (
            <img key={`k${i}`} src={typeof url === 'string' ? url : url?.url} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" loading="lazy" />
          ))}
        </div>
      )}

      {/* Reactions + Comments */}
      <div className="px-4 pb-3 flex items-center gap-3 pt-2 border-t border-slate-50">
        <div className="relative">
          <button onClick={() => setShowReactions(!showReactions)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${log.viewer_reaction ? 'bg-cyan-50 text-cyan-600' : 'text-slate-400 hover:bg-slate-50'}`}
            data-testid={`react-btn-${log.id}`}>
            {log.viewer_reaction ? (() => { const r = REACTIONS.find(r => r.key === log.viewer_reaction); return r ? <r.icon size={14} className={r.color} /> : <Heart size={14} />; })() : <Heart size={14} />}
            <span className="font-semibold">{log.reaction_count || 0}</span>
          </button>
          {showReactions && (
            <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 bg-white rounded-full shadow-lg border border-slate-100 p-1 z-10" data-testid="reaction-picker">
              {REACTIONS.map(r => (
                <button key={r.key} onClick={() => { onReact(log.id, r.key); setShowReactions(false); }}
                  className={`p-1.5 rounded-full hover:bg-slate-50 hover:scale-125 transition-transform ${log.viewer_reaction === r.key ? 'bg-cyan-50' : ''}`} title={r.label}>
                  <r.icon size={16} className={r.color} />
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => { if (!showComments) loadComments(); setShowComments(!showComments); }}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg" data-testid={`comment-toggle-${log.id}`}>
          <MessageCircle size={14} /> <span>{log.comment_count || 0}</span>
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-50 space-y-2" data-testid="comments-section">
          <div className="flex gap-2">
            <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()}
              placeholder="Nice dive day!" className="flex-1 h-8 bg-slate-50 border border-slate-200 rounded-lg text-xs px-3 outline-none focus:border-cyan-400" data-testid="comment-input" />
            <button onClick={submitComment} className="h-8 px-3 bg-cyan-400 text-white rounded-lg text-xs font-semibold" data-testid="comment-submit"><Send size={12} /></button>
          </div>
          {comments.map(c => (
            <div key={c.id} className="flex gap-2 text-xs" data-testid="comment-item">
              <div className="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600 text-[8px] font-bold flex-shrink-0">{(c.user_name || '?')[0]}</div>
              <div><span className="font-semibold text-slate-700">{c.user_name}</span> <span className="text-slate-500">{c.text}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function CreateLogModal({ onClose, onCreated }) {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [mood, setMood] = useState('');
  const [highlight, setHighlight] = useState('');
  const [caption, setCaption] = useState('');
  const [creating, setCreating] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try { const r = await axios.get('/surface-log/dates/available'); setDates(r.data.dates || []); } catch (e) { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  const submit = async () => {
    if (!selectedDate) { toast.error('Pick a dive date'); return; }
    setCreating(true);
    try {
      await axios.post('/surface-log/generate', { date: selectedDate, mood, highlight, caption });
      toast.success('Surface Log created!');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="create-log-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-lg">New Surface Log</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Date picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">Pick a dive date</label>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={`k${i}`} className="p-3 rounded-xl border border-slate-100 space-y-2"><div className="h-4 w-20 bg-slate-200/70 skeleton-shimmer rounded-md" /><div className="h-3 w-12 bg-slate-200/70 skeleton-shimmer rounded-md" /></div>)}</div>
            ) : dates.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {dates.map(d => (
                  <button key={d.date} onClick={() => setSelectedDate(d.date)}
                    className={`p-3 rounded-xl border text-left transition-all ${selectedDate === d.date ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 hover:border-cyan-300'}`}
                    data-testid={`date-${d.date}`}>
                    <p className="text-sm font-bold text-slate-800">{d.date}</p>
                    <p className="text-[10px] text-slate-400">{d.dive_count} dive{d.dive_count !== 1 ? 's' : ''}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No dive dates without a Surface Log. Log some dives first!</p>
            )}
          </div>

          {/* Mood */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">How did you feel?</label>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(m => (
                <button key={m.key} onClick={() => setMood(mood === m.key ? '' : m.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${mood === m.key ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  data-testid={`mood-${m.key}`}>
                  <m.icon size={14} className={mood === m.key ? '' : m.color} /> {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Highlight */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Highlight of the day</label>
            <input className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400"
              placeholder="e.g., Saw my first manta ray!" value={highlight} onChange={e => setHighlight(e.target.value)} data-testid="highlight-input" />
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Caption</label>
            <textarea className="w-full bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 outline-none focus:border-cyan-400 h-20 resize-none"
              placeholder="Write about your dive day..." value={caption} onChange={e => setCaption(e.target.value)} data-testid="caption-input" />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={creating || !selectedDate}
            className="flex-1 h-10 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold disabled:opacity-50" data-testid="generate-log-btn">
            {creating ? 'Generating...' : 'Generate Log'}
          </button>
        </div>
      </div>
    </div>
  );
}
