import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import {
  MapPin, Waves, UserPlus, UserCheck, UserMinus, Users, Search, MessageCircle,
  Check, X, Clock, Sparkles, Anchor, Award, Zap, Heart
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { BuddyGridSkeleton } from '../../components/Skeletons';

const CERT_LABELS = { open_water: 'OW', advanced_open_water: 'AOW', rescue: 'Rescue', divemaster: 'DM', instructor: 'Instructor' };

export default function BuddiesTab() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState('matches');
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [buddies, setBuddies] = useState([]);
  const [pending, setPending] = useState([]);
  const [sentIds, setSentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState([]);
  const [matches, setMatches] = useState([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try { const m = await axios.get('/buddy-finder/matches?limit=20'); setMatches(m.data.matches || []); } catch (e) { /* silent */ } finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?country=${search}` : '';
      const res = await axios.get(`/community/profiles${params}`);
      setProfiles(res.data.profiles);
    } catch (e) { /* silent */ } finally { setLoading(false); }
  }, [search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchConnections = useCallback(async () => {
    try {
      const res = await axios.get('/community/connections');
      setBuddies(res.data.buddies);
      setPending(res.data.pending);
      setSent(res.data.sent || []);
      setSentIds(res.data.sent_ids || []);
    } catch (e) { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    fetchConnections();
    if (subTab === 'browse') fetchProfiles();
    if (subTab === 'matches') fetchMatches();
  }, [subTab, user, fetchConnections, fetchProfiles, fetchMatches]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleConnect = useCallback(async (userId) => {
    try {
      await axios.post(`/community/connect/${userId}`);
      toast.success('Buddy request sent!');
      setSentIds(prev => [...prev, userId]);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleRespond = useCallback(async (connId, action) => {
    try {
      await axios.put(`/community/connections/${connId}?action=${action}`);
      toast.success(action === 'accept' ? 'Connected!' : 'Declined');
      fetchConnections();
    } catch (e) { toast.error('Failed'); }
  }, [fetchConnections]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDisconnect = useCallback(async (userId) => {
    try {
      await axios.delete(`/community/connect/${userId}`);
      toast.success('Disconnected');
      fetchConnections();
    } catch (e) { toast.error('Failed'); }
  }, [fetchConnections]);

  const SUB_TABS = useMemo(() => ([
    { key: 'matches', label: 'For You', icon: Sparkles },
    { key: 'browse', label: 'Browse', icon: Search },
    { key: 'requests', label: 'Requests', count: pending.length + sent.length },
    { key: 'buddies', label: 'My Buddies', count: buddies.length },
  ]), [pending.length, sent.length, buddies.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSubTabChange = useCallback((nextTab) => setSubTab(nextTab), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearchChange = useCallback((event) => setSearch(event.target.value), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearchKeyDown = useCallback((event) => {
    if (event.key === 'Enter') {
      fetchProfiles();
    }
  }, [fetchProfiles]);

  return (
    <div data-testid="buddies-tab-content">
      <div className="flex gap-1 mb-4 bg-slate-50 rounded-lg p-1">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => handleSubTabChange(t.key)}
            className={`h-8 flex-1 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${subTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            data-testid={`subtab-${t.key}`}>
            {t.icon && <t.icon size={12} />} {t.label}
            {t.count > 0 && <span className={`text-[9px] px-1 py-0.5 rounded-full ${subTab === t.key ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-200 text-slate-500'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {subTab === 'matches' && (
        loading && matches.length === 0 ? <BuddyGridSkeleton count={4} /> : matches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {matches.map(m => <MatchCard key={m.id} profile={m} isSent={sentIds.includes(m.id)} onConnect={() => handleConnect(m.id)} />)}
          </div>
        ) : <Empty title="No matches yet" sub="We'll find buddies as more divers join" />
      )}

      {subTab === 'browse' && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input type="text" placeholder="Filter by country..." className="w-full h-9 bg-white border border-slate-200 rounded-xl text-sm pl-9 pr-3 outline-none focus:border-cyan-400"
              value={search} onChange={handleSearchChange} onKeyDown={handleSearchKeyDown} data-testid="browse-search" />
          </div>
          {loading && profiles.length === 0 ? <BuddyGridSkeleton count={4} /> : profiles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profiles.map(p => <BrowseCard key={p.id} profile={p} isSent={sentIds.includes(p.id)} onConnect={() => handleConnect(p.id)} />)}
            </div>
          ) : <Empty title="No divers found" sub="Try a different country filter" />}
        </>
      )}

      {subTab === 'requests' && (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Received</p>
              <div className="space-y-2">
                {pending.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 p-3" data-testid="request-card">
                    <Avatar name={p.buddy?.name} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm">{p.buddy?.name}</h3>
                      {p.buddy?.location_country && <p className="text-[10px] text-slate-400">{p.buddy.location_country}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => handleRespond(p.id, 'accept')} className="w-8 h-8 rounded-full bg-cyan-400 text-white flex items-center justify-center hover:bg-cyan-500" data-testid="accept-btn"><Check size={14} /></button>
                      <button onClick={() => handleRespond(p.id, 'reject')} className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500" data-testid="reject-btn"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sent.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sent</p>
              <div className="space-y-2">
                {sent.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 p-3 opacity-70" data-testid="sent-card">
                    <Avatar name={s.buddy?.name} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm">{s.buddy?.name}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold flex items-center gap-0.5"><Clock size={9} /> Pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pending.length === 0 && sent.length === 0 && <Empty title="No requests" sub="Send or receive buddy requests" />}
        </div>
      )}

      {subTab === 'buddies' && (
        buddies.length > 0 ? (
          <div className="space-y-2">
            {buddies.map(b => (
              <div key={b.id} className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 p-3 hover:shadow-sm transition-all" data-testid="buddy-card">
                <div className="cursor-pointer" onClick={() => navigate(`/user/${b.buddy?.id}`)}><Avatar name={b.buddy?.name} photo={b.buddy?.profile_photo} /></div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/user/${b.buddy?.id}`)}>
                  <h3 className="font-bold text-sm hover:text-cyan-500 transition-colors">{b.buddy?.name}</h3>
                  {b.buddy?.location_country && <p className="text-[10px] text-slate-400">{b.buddy.location_country}</p>}
                </div>
                <button onClick={() => handleDisconnect(b.buddy?.id)} className="p-1.5 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" data-testid="disconnect-btn"><UserMinus size={14} /></button>
              </div>
            ))}
          </div>
        ) : <Empty title="No buddies yet" sub="Use the For You tab to find dive buddies" />
      )}
    </div>
  );
}

const MatchCard = memo(function MatchCard({ profile: p, isSent, onConnect }) {
  const navigate = useNavigate();
  const score = p.compatibility || 0;
  const scoreColor = score >= 75 ? 'text-emerald-500 bg-emerald-50' : score >= 50 ? 'text-amber-500 bg-amber-50' : 'text-slate-400 bg-slate-50';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3 hover:shadow-sm transition-all" data-testid="match-card">
      <div className="flex items-start gap-2.5 mb-2">
        <div className="cursor-pointer" onClick={() => navigate(`/user/${p.id}`)}><Avatar name={p.name} photo={p.profile_photo} size={36} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-slate-800 truncate cursor-pointer hover:text-cyan-500" onClick={() => navigate(`/user/${p.id}`)}>{p.name}</h3>
          {p.location_country && <p className="text-[10px] text-slate-400 flex items-center gap-0.5"><MapPin size={9} /> {p.location_city ? `${p.location_city}, ` : ''}{p.location_country}</p>}
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-black ${scoreColor}`} data-testid="match-score">{score}%</div>
      </div>
      <div className="flex flex-wrap gap-1 mb-2.5">
        {p.certification_level && <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded-full text-[9px] font-semibold flex items-center gap-0.5"><Award size={8} /> {CERT_LABELS[p.certification_level]}</span>}
        {p.total_dives > 0 && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-semibold flex items-center gap-0.5"><Anchor size={8} /> {p.total_dives} dives</span>}
      </div>
      <button onClick={onConnect} disabled={isSent}
        className={`w-full h-8 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${isSent ? 'bg-slate-100 text-slate-400' : 'bg-cyan-400 hover:bg-cyan-500 text-white'}`}
        data-testid="connect-btn">
        {isSent ? <><Clock size={12} /> Pending</> : <><UserPlus size={12} /> Send Buddy Request</>}
      </button>
    </div>
  );
});

const BrowseCard = memo(function BrowseCard({ profile: p, isSent, onConnect }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-sm transition-all" data-testid="browse-card">
      <div className="relative h-28 overflow-hidden bg-slate-200 cursor-pointer" onClick={() => navigate(`/user/${p.id}`)}>
        {p.profile_photo ? (
          <img src={p.profile_photo} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center">
            <span className="text-white text-2xl font-bold opacity-60">{p.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
          </div>
        )}
        {p.certification_level && <span className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 backdrop-blur-sm text-cyan-600 rounded-full text-[9px] font-bold">{CERT_LABELS[p.certification_level]}</span>}
      </div>
      <div className="p-3">
        <h3 className="font-bold text-sm mb-1 truncate cursor-pointer hover:text-cyan-500" onClick={() => navigate(`/user/${p.id}`)}>{p.name}</h3>
        {p.location_country && <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mb-1"><MapPin size={9} /> {p.location_country}</p>}
        {p.total_dives > 0 && <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mb-2"><Waves size={9} /> {p.total_dives} dives</p>}
        <button onClick={onConnect} disabled={isSent}
          className={`w-full h-8 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${isSent ? 'bg-slate-100 text-slate-400' : 'border border-slate-200 text-slate-600 hover:bg-cyan-400 hover:text-white hover:border-cyan-400'}`}
          data-testid="connect-btn">
          {isSent ? <><Clock size={12} /> Pending</> : <><UserPlus size={12} /> Connect</>}
        </button>
      </div>
    </div>
  );
});

const Avatar = memo(function Avatar({ name, photo, size = 32 }) {
  if (photo) return <img src={photo} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} loading="lazy" />;
  return (
    <div className="rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white font-bold flex-shrink-0" style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
    </div>
  );
});

const Loader = memo(function Loader() {
  return <BuddyGridSkeleton count={4} />;
});

const Empty = memo(function Empty({ title, sub }) {
  return (
    <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
      <Users className="text-slate-200 mx-auto mb-2" size={36} />
      <h3 className="font-bold text-slate-700 mb-1 text-sm">{title}</h3>
      <p className="text-slate-400 text-xs">{sub}</p>
    </div>
  );
});
