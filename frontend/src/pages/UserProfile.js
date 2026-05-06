import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  MapPin, Award, Waves, ArrowLeft, Star, MessageCircle, UserPlus, UserCheck,
  Clock, Anchor, Globe, Heart, Send, Trash2, ChevronDown, ChevronUp,
  Shield, Sparkles, Flag, Camera, X, Check, Fish
} from 'lucide-react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { Marker } from '@vis.gl/react-google-maps';
import SafeMapWrapper from '../components/SafeMapWrapper';
import axios from 'axios';
import { toast } from 'sonner';
import useTabParam from '../hooks/useTabParam';
import { UserProfileSkeleton } from '../components/Skeletons';

const CERT_LABELS = {
  open_water: 'Open Water', advanced_open_water: 'Advanced OW',
  rescue: 'Rescue Diver', divemaster: 'Divemaster', instructor: 'Instructor'
};
const EXP_LABELS = { never: 'Beginner', try_dive: 'Try Dive', certified: 'Certified' };
const BADGE_ICONS = {
  first_dive: Waves, '50_dives': Star, century: Award, deep_diver: Anchor,
  abyss: Anchor, globe_trotter: Globe, world_diver: Globe,
  night_owl: Camera, wreck_explorer: Shield, bottom_timer: Clock,
};
const BADGE_COLORS = {
  first_dive: 'from-cyan-400 to-teal-500', '50_dives': 'from-amber-400 to-orange-500',
  century: 'from-violet-400 to-purple-600', deep_diver: 'from-blue-500 to-indigo-600',
  abyss: 'from-slate-600 to-slate-800', globe_trotter: 'from-emerald-400 to-green-600',
  world_diver: 'from-teal-500 to-cyan-600', night_owl: 'from-indigo-500 to-violet-600',
  wreck_explorer: 'from-amber-500 to-red-500', bottom_timer: 'from-rose-400 to-pink-600',
};

const KNOWN_COORDS = {
  'bali': { lat: -8.34, lng: 115.09 }, 'indonesia': { lat: -2.5, lng: 118.0 },
  'maldives': { lat: 3.2, lng: 73.22 }, 'egypt': { lat: 27.18, lng: 33.83 },
  'thailand': { lat: 9.0, lng: 98.0 }, 'mexico': { lat: 20.4, lng: -87.3 },
  'australia': { lat: -16.9, lng: 145.7 }, 'philippines': { lat: 10.3, lng: 123.9 },
};

function getSiteCoords(site) {
  if (site.gps_lat && site.gps_lng) return { lat: site.gps_lat, lng: site.gps_lng };
  const loc = (site.location || '').toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_COORDS)) {
    if (loc.includes(key)) return coords;
  }
  return null;
}

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useTabParam('tab', 'dives', ['dives', 'map', 'badges', 'species', 'bucket']);
  const [showReport, setShowReport] = useState(false);
  const [likedDives, setLikedDives] = useState(new Set());
  const [species, setSpecies] = useState([]);
  const [bucketList, setBucketList] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const vid = user?.id || '';
      const res = await axios.get(`/diver-profile/${userId}?viewer_id=${vid}`);
      setData(res.data);
      setLikedDives(new Set(res.data.viewer_likes || []));
    } catch (e) {
      toast.error('Failed to load profile');
      navigate(-1);
    } finally { setLoading(false); }
  }, [userId, user?.id, navigate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Fetch species and bucket list for the user profile
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    axios.get(`/species/user/${userId}`).then(r => setSpecies(r.data.species || [])).catch(() => {});
    axios.get(`/bucket-list/user/${userId}`).then(r => setBucketList(r.data.items || [])).catch(() => {});
  }, [userId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleLike = useCallback(async (diveId) => {
    try {
      const res = await axios.post(`/diver-profile/dive/${diveId}/like`);
      setLikedDives(prev => {
        const next = new Set(prev);
        if (res.data.liked) next.add(diveId); else next.delete(diveId);
        return next;
      });
      setData(prev => ({
        ...prev,
        recent_dives: prev.recent_dives.map(d =>
          d.id === diveId ? { ...d, like_count: (d.like_count || 0) + (res.data.liked ? 1 : -1) } : d
        ),
      }));
    } catch (e) { toast.error('Please sign in to like'); }
  }, []);

  const safeData = data || { profile: {}, stats: {}, badges: [], recent_dives: [], dive_sites: [], connections: {}, is_following: false };
  const { profile: p, stats, badges, recent_dives, dive_sites, connections, is_following } = safeData;
  const initials = useMemo(() => (
    (p.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  ), [p.name]);
  const cert = useMemo(() => CERT_LABELS[p.certification_level], [p.certification_level]);
  const mapSites = useMemo(() => (
    dive_sites.map(s => ({ ...s, coords: getSiteCoords(s) })).filter(s => s.coords)
  ), [dive_sites]);

  const TABS = useMemo(() => ([
    { key: 'dives', label: 'Dives', count: stats.total_dives || 0 },
    { key: 'map', label: 'Map', count: mapSites.length },
    { key: 'species', label: 'Species', count: species.length },
    { key: 'badges', label: 'Badges', count: badges.length },
    { key: 'bucket', label: 'Bucket List', count: bucketList.length },
  ]), [stats.total_dives, mapSites.length, species.length, badges.length, bucketList.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleTabChange = useCallback((nextTab) => setActiveTab(nextTab), [setActiveTab]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleMarkerClick = useCallback((site) => setSelectedSite(site), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleMarkerClose = useCallback(() => setSelectedSite(null), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleBack = useCallback(() => navigate(-1), [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <UserProfileSkeleton />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6" data-testid="user-profile-page">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 mb-4 transition-colors text-sm" data-testid="back-btn">
          <ArrowLeft size={16} /> Back
        </button>

        {/* Profile Header */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-5" data-testid="profile-header">
          <div className="h-28 sm:h-36 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMjAgMEMyMCAyMCAwIDIwIDAgNDBDMjAgNDAgMjAgMjAgNDAgMjBDNDAgMCA0MCAwIDIwIDBaIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9zdmc+')] opacity-30" />
          </div>
          <div className="px-5 sm:px-8 pb-6 -mt-14 relative">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              {p.profile_photo ? (
                <img src={p.profile_photo} alt={p.name} className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white shadow-lg" loading="lazy" />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-lg">
                  {initials}
                </div>
              )}
              <div className="flex-1 sm:pb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900" data-testid="profile-name">{p.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                  {p.location_country && (
                    <span className="flex items-center gap-1"><MapPin size={12} /> {p.location_city ? `${p.location_city}, ` : ''}{p.location_country}</span>
                  )}
                  {cert && <span className="flex items-center gap-1 bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full font-semibold"><Award size={11} /> {cert}</span>}
                  {p.member_since && <span className="text-slate-400">Member since {p.member_since.slice(0, 4)}</span>}
                </div>
                {p.bio && <p className="text-sm text-slate-600 mt-2 max-w-lg">{p.bio}</p>}
              </div>
              {/* Actions */}
              {user && user.id !== userId && (
                <div className="flex gap-2 sm:self-end sm:pb-1">
                  <FollowButton userId={userId} isFollowing={is_following} />
                  <button onClick={() => navigate(`/messages?with=${userId}`)} className="h-9 px-4 text-sm border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors" data-testid="send-message-btn">
                    <MessageCircle size={14} /> Message
                  </button>
                </div>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex gap-6 mt-5 pt-4 border-t border-slate-100">
              <StatItem label="Dives" value={stats.total_dives} />
              <StatItem label="Max Depth" value={`${stats.max_depth}m`} />
              <StatItem label="Bottom Time" value={`${stats.total_time}min`} />
              <StatItem label="Countries" value={stats.countries} />
              <StatItem label="Connections" value={connections} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 shadow-sm border border-slate-100" data-testid="profile-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)}
              className={`h-9 flex-1 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${activeTab === t.key ? 'bg-cyan-400 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              data-testid={`tab-${t.key}`}>
              {t.label}
              {t.count > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-white/20' : 'bg-slate-100'}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Dives Tab */}
        {activeTab === 'dives' && (
          <div className="flex flex-col gap-4" data-testid="dives-tab">
            {recent_dives.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {recent_dives.map(dive => (
                  <DiveCard key={dive.id} dive={dive} liked={likedDives.has(dive.id)} onLike={toggleLike} isOwner={user?.id === userId} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                <Anchor className="text-slate-200 mx-auto mb-3" size={40} />
                <p className="font-bold text-slate-700 mb-1">No dives yet</p>
                <p className="text-sm text-slate-400">This diver hasn't logged any dives.</p>
              </div>
            )}
          </div>
        )}

        {/* Map Tab — defer rendering to prevent IntersectionObserver error */}
        {activeTab === 'map' && (
          <MapTabContent mapSites={mapSites} />
        )}

        {/* Badges Tab */}
        {activeTab === 'badges' && (
          <div data-testid="badges-tab">
            {badges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {badges.map(b => {
                  const Icon = BADGE_ICONS[b.key] || Star;
                  const grad = BADGE_COLORS[b.key] || 'from-slate-400 to-slate-500';
                  return (
                    <div key={b.key} className="bg-white rounded-2xl border border-slate-100 p-4 text-center hover:shadow-md transition-shadow" data-testid={`badge-${b.key}`}>
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center mx-auto mb-2`}>
                        <Icon size={20} className="text-white" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">{b.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{b.desc}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                <Sparkles className="text-slate-200 mx-auto mb-3" size={40} />
                <p className="font-bold text-slate-700 mb-1">No badges yet</p>
                <p className="text-sm text-slate-400">Badges are earned by logging dives.</p>
              </div>
            )}
          </div>
        )}

        {/* Species Tab */}
        {activeTab === 'species' && (
          <div data-testid="species-tab">
            {species.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {species.map(s => (
                  <div key={s.species} className="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-sm transition-shadow" data-testid="species-card">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                      <Fish size={18} className="text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">{s.species}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Spotted {s.count}x</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                <Fish className="text-slate-300 mx-auto mb-3" size={40} />
                <p className="font-bold text-slate-700 mb-1">No species logged yet</p>
                <p className="text-sm text-slate-400">Tag marine life sightings on dives to build a species log.</p>
              </div>
            )}
          </div>
        )}

        {/* Bucket List Tab */}
        {activeTab === 'bucket' && (
          <div data-testid="bucket-tab">
            {bucketList.length > 0 ? (
              <div className="space-y-3">
                {bucketList.map(b => (
                  <div key={b.id} className={`bg-white rounded-2xl border p-4 flex items-start gap-3 ${b.completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`} data-testid="bucket-item">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${b.completed ? 'bg-emerald-500 text-white' : 'border-2 border-slate-200'}`}>
                      {b.completed && <Check size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${b.completed ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>{b.site_name}</p>
                      {b.location && <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin size={9} /> {b.location}{b.country ? `, ${b.country}` : ''}</p>}
                      {b.why && <p className="text-xs text-slate-500 mt-1 italic">"{b.why}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                <Globe className="text-slate-200 mx-auto mb-3" size={40} />
                <p className="font-bold text-slate-700 mb-1">No bucket list items</p>
                <p className="text-sm text-slate-400">Dream dive sites will appear here.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
      {showReport && <ReportModal targetId={userId} targetName={p?.name} onClose={() => setShowReport(false)} />}
    </div>
  );
}


const DiveCard = memo(function DiveCard({ dive, liked, onLike, isOwner }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const hasProfile = dive.profile?.length > 2;

  const profileData = useMemo(() => {
    if (!hasProfile) return [];
    const step = Math.max(1, Math.floor(dive.profile.length / 50));
    return dive.profile.filter((_, i) => i % step === 0);
  }, [hasProfile, dive.profile]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await axios.get(`/diver-profile/dive/${dive.id}/comments`);
      setComments(res.data.comments);
    } catch (e) { /* silent */ }
    finally { setLoadingComments(false); }
  }, [dive.id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const submitComment = useCallback(async () => {
    if (!commentText.trim()) return;
    try {
      const res = await axios.post(`/diver-profile/dive/${dive.id}/comment`, { text: commentText });
      setComments(prev => [res.data, ...prev]);
      setCommentText('');
    } catch (e) { toast.error('Please sign in to comment'); }
  }, [commentText, dive.id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleComments = useCallback(() => {
    if (!showComments) loadComments();
    setShowComments(!showComments);
  }, [showComments, loadComments]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-md transition-all" data-testid="profile-dive-card">
      {hasProfile && (
        <div className="px-4 pt-3">
          <div className="h-16" style={{ minWidth: 100 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={50} minHeight={10}>
              <AreaChart data={profileData}>
                <defs><linearGradient id={`pd-${dive.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.2} /><stop offset="95%" stopColor="#0891b2" stopOpacity={0.02} /></linearGradient></defs>
                <YAxis reversed hide domain={['dataMin', 'dataMax']} />
                <Area type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={1.5} fill={`url(#pd-${dive.id})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="p-4 pt-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-slate-800 truncate">{dive.site_name || 'Unknown Site'}</h3>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              <MapPin size={9} /> {dive.location} <span className="ml-1">{dive.date?.slice(0, 10)}</span>
            </p>
          </div>
          {dive.dive_type && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold capitalize bg-cyan-50 text-cyan-600">{dive.dive_type}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 mt-2">
          {dive.max_depth > 0 && <span className="text-blue-600 font-semibold">{dive.max_depth}m</span>}
          {dive.duration > 0 && <span className="text-violet-600 font-semibold">{dive.duration}min</span>}
          {dive.water_temp != null && <span className="text-amber-600 font-semibold">{dive.water_temp}°C</span>}
          {dive.visibility && <span className="text-cyan-600">{dive.visibility}</span>}
        </div>

        {dive.rating > 0 && (
          <div className="flex gap-0.5 mt-1.5">{[1,2,3,4,5].map(s => <Star key={s} size={11} className={s <= dive.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />)}</div>
        )}

        {(dive.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {dive.tags.slice(0, 5).map(tag => (
              <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-semibold">{tag}</span>
            ))}
          </div>
        )}

        {/* Like / Comment actions */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-50">
          <button onClick={() => onLike(dive.id)} className="flex items-center gap-1 text-xs transition-colors" data-testid={`like-btn-${dive.id}`}>
            <Heart size={14} className={liked ? 'text-red-500 fill-red-500' : 'text-slate-400'} />
            <span className={liked ? 'text-red-500 font-semibold' : 'text-slate-400'}>{dive.like_count || 0}</span>
          </button>
          <button onClick={toggleComments} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors" data-testid={`comment-btn-${dive.id}`}>
            <MessageCircle size={14} />
            <span>{dive.comment_count || 0}</span>
          </button>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-3 pt-2 border-t border-slate-100 space-y-2" data-testid="comments-section">
            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitComment()}
                placeholder="Add a comment..."
                className="flex-1 h-8 bg-slate-50 border border-slate-200 rounded-lg text-xs px-3 outline-none focus:border-cyan-400"
                data-testid="comment-input"
              />
              <button onClick={submitComment} className="h-8 px-3 bg-cyan-400 text-white rounded-lg text-xs font-semibold hover:bg-cyan-500" data-testid="submit-comment-btn">
                <Send size={12} />
              </button>
            </div>
            {loadingComments ? (
              <div className="space-y-2 py-2">{Array.from({ length: 2 }).map((_, i) => <div key={`k${i}`} className="flex gap-2"><div className="w-6 h-6 rounded-full bg-slate-200/70 skeleton-shimmer flex-shrink-0" /><div className="flex-1 space-y-1"><div className="h-3 w-24 bg-slate-200/70 skeleton-shimmer rounded-md" /><div className="h-3 w-40 bg-slate-200/70 skeleton-shimmer rounded-md" /></div></div>)}</div>
            ) : comments.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2 text-xs" data-testid="comment-item">
                    <div className="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600 text-[8px] font-bold flex-shrink-0">
                      {(c.user_name || '?')[0]}
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold text-slate-700">{c.user_name}</span>
                      <span className="text-slate-500 ml-1.5">{c.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 text-center">No comments yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});


const FollowButton = memo(function FollowButton({ userId, isFollowing: initialFollow }) {
  const [following, setFollowing] = useState(initialFollow);
  const [loading, setLoading] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      if (following) {
        await axios.delete(`/community/connect/${userId}`);
        setFollowing(false);
        toast.success('Disconnected');
      } else {
        await axios.post(`/community/connect/${userId}`);
        setFollowing(true);
        toast.success('Connection request sent!');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setLoading(false); }
  }, [following, userId]);

  return (
    <button onClick={toggle} disabled={loading}
      className={`h-9 px-4 text-sm rounded-xl font-semibold flex items-center gap-1.5 transition-colors ${following ? 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500' : 'bg-cyan-400 text-white hover:bg-cyan-500'}`}
      data-testid="follow-btn">
      {following ? <><UserCheck size={14} /> Connected</> : <><UserPlus size={14} /> Connect</>}
    </button>
  );
});

const StatItem = memo(function StatItem({ label, value }) {
  return (
    <div className="text-center" data-testid="profile-stat">
      <p className="text-base sm:text-lg font-black text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400 font-medium">{label}</p>
    </div>
  );
});

function ReportModal({ targetId, targetName, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reasons = ["Misleading info", "Unsafe practices", "Inappropriate behavior", "Spam", "Fake profile", "Other"];

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    setSubmitting(true);
    try {
      await axios.post('/reports', { reported_id: targetId, reason, details, context_type: "profile" });
      toast.success('Report submitted.');
      onClose();
    } catch (e) { toast.error('Failed to submit report'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()} data-testid="report-modal">
        <h3 className="text-lg font-bold mb-1">Report {targetName}</h3>
        <p className="text-xs text-slate-500 mb-4">Help us keep the community safe.</p>
        <div className="space-y-2 mb-4">
          {reasons.map(r => (
            <label key={r} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${reason === r ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200'}`}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-cyan-400" data-testid={`report-reason-${r.toLowerCase().replace(/\s+/g, '-')}`} />
              <span className="text-sm text-slate-700">{r}</span>
            </label>
          ))}
        </div>
        <textarea placeholder="Additional details..." value={details} onChange={e => setDetails(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-cyan-400" data-testid="report-details" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100" data-testid="cancel-report-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium" data-testid="submit-report-btn">
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}


function MapTabContent({ mapSites }) {
  if (mapSites.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="map-tab">
        <div className="h-[420px] flex items-center justify-center text-slate-400 text-sm">No dive sites with location data</div>
      </div>
    );
  }
  return (
    <div data-testid="map-tab">
      <SafeMapWrapper
        center={mapSites[0]?.coords || { lat: 0, lng: 30 }}
        zoom={3}
        height={420}
        label="Dive Sites"
        className="bg-white rounded-2xl border border-slate-100"
      >
        {mapSites.map((site, i) => <Marker key={`k${i}`} position={site.coords} />)}
      </SafeMapWrapper>
    </div>
  );
}
