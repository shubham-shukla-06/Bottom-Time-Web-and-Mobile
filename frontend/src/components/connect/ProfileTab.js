import { useState, useEffect } from 'react';
import useAuthStore from '../../stores/authStore';
import {
  MapPin, Award, Waves, Anchor, Globe, Heart, Star, MessageCircle,
  Send, Clock, Fish, Check, Camera, Shield, Sparkles
} from 'lucide-react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';
import useTabParam from '../../hooks/useTabParam';
import { ProfileTabSkeleton } from '../../components/Skeletons';

const CERT_LABELS = {
  open_water: 'Open Water', advanced_open_water: 'Advanced OW',
  rescue: 'Rescue Diver', divemaster: 'Divemaster', instructor: 'Instructor'
};
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

export default function ProfileTab() {
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [species, setSpecies] = useState([]);
  const [bucketList, setBucketList] = useState([]);
  const [section, setSection] = useTabParam('section', 'dives', ['dives', 'species', 'badges', 'bucket']);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/diver-profile/${user.id}?viewer_id=${user.id}`);
        setData(res.data);
      } catch (e) { /* silent */ } finally { setLoading(false); }
    };
    fetchProfile();
    axios.get(`/species/user/${user.id}`).then(r => setSpecies(r.data.species || [])).catch(() => {});
    axios.get(`/bucket-list/user/${user.id}`).then(r => setBucketList(r.data.items || [])).catch(() => {});
  }, [user]);

  if (loading && !data) return <ProfileTabSkeleton />;
  if (!data) return <div className="text-center py-16 text-slate-400 text-sm">Unable to load profile</div>;

  const { profile: p, stats, badges, recent_dives } = data;
  const cert = CERT_LABELS[p.certification_level];

  const SECTIONS = [
    { key: 'dives', label: 'Dives', count: stats.total_dives },
    { key: 'species', label: 'Species', count: species.length },
    { key: 'badges', label: 'Badges', count: badges.length },
    { key: 'bucket', label: 'Bucket List', count: bucketList.length },
  ];

  return (
    <div data-testid="profile-tab-content">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          {p.profile_photo ? (
            <img src={p.profile_photo} alt={p.name} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow" loading="lazy" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-lg font-bold border-2 border-white shadow">
              {(p.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate" data-testid="my-profile-name">{p.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
              {p.location_country && <span className="flex items-center gap-0.5"><MapPin size={10} /> {p.location_city ? `${p.location_city}, ` : ''}{p.location_country}</span>}
              {cert && <span className="flex items-center gap-0.5 bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-semibold"><Award size={9} /> {cert}</span>}
            </div>
            {p.bio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.bio}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 pt-3 border-t border-slate-100">
          <StatItem label="Dives" value={stats.total_dives} />
          <StatItem label="Max Depth" value={`${stats.max_depth}m`} />
          <StatItem label="Bottom Time" value={`${stats.total_time}min`} />
          <StatItem label="Countries" value={stats.countries} />
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-50 rounded-lg p-1">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`h-8 flex-1 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 whitespace-nowrap ${section === s.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            data-testid={`profile-section-${s.key}`}>
            {s.label}
            {s.count > 0 && <span className={`text-[9px] px-1 py-0.5 rounded-full ${section === s.key ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-200 text-slate-500'}`}>{s.count}</span>}
          </button>
        ))}
      </div>

      {/* Dives Grid */}
      {section === 'dives' && (
        recent_dives.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recent_dives.map(dive => (
              <div key={dive.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-sm transition-all" data-testid="my-dive-card">
                {dive.profile?.length > 2 && (
                  <div className="px-3 pt-2">
                    <div className="h-12">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dive.profile.filter((_, i) => i % Math.max(1, Math.floor(dive.profile.length / 40)) === 0)}>
                          <defs><linearGradient id={`mp-${dive.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.15} /><stop offset="95%" stopColor="#0891b2" stopOpacity={0.02} /></linearGradient></defs>
                          <YAxis reversed hide domain={['dataMin', 'dataMax']} />
                          <Area type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={1.5} fill={`url(#mp-${dive.id})`} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div className="p-3 pt-1.5">
                  <h3 className="font-bold text-sm text-slate-800 truncate">{dive.site_name || 'Unknown Site'}</h3>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin size={9} /> {dive.location} <span className="ml-1">{dive.date?.slice(0, 10)}</span>
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 mt-1.5">
                    {dive.max_depth > 0 && <span className="text-blue-600 font-semibold">{dive.max_depth}m</span>}
                    {dive.duration > 0 && <span className="text-violet-600 font-semibold">{dive.duration}min</span>}
                    {dive.water_temp != null && <span className="text-amber-600 font-semibold">{dive.water_temp}°C</span>}
                  </div>
                  {dive.rating > 0 && (
                    <div className="flex gap-0.5 mt-1">{[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= dive.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
            <Anchor className="text-slate-200 mx-auto mb-2" size={36} />
            <p className="font-bold text-slate-700 text-sm mb-1">No dives yet</p>
            <p className="text-slate-400 text-xs">Log your first dive from the Dashboard.</p>
          </div>
        )
      )}

      {/* Species */}
      {section === 'species' && (
        species.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {species.map(s => (
              <div key={s.species} className="bg-white rounded-2xl border border-slate-100 p-3 hover:shadow-sm transition-shadow" data-testid="my-species-card">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mb-1.5"><Fish size={14} className="text-emerald-500" /></div>
                <p className="text-sm font-bold text-slate-800">{s.species}</p>
                <p className="text-[10px] text-slate-400">Spotted {s.count}x</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
            <Fish className="text-slate-200 mx-auto mb-2" size={36} />
            <p className="font-bold text-slate-700 text-sm mb-1">No species logged</p>
            <p className="text-slate-400 text-xs">Tag marine life sightings on your dives.</p>
          </div>
        )
      )}

      {/* Badges */}
      {section === 'badges' && (
        badges.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {badges.map(b => {
              const Icon = BADGE_ICONS[b.key] || Star;
              const grad = BADGE_COLORS[b.key] || 'from-slate-400 to-slate-500';
              return (
                <div key={b.key} className="bg-white rounded-2xl border border-slate-100 p-3 text-center hover:shadow-sm transition-shadow" data-testid={`my-badge-${b.key}`}>
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center mx-auto mb-1.5`}><Icon size={16} className="text-white" /></div>
                  <p className="text-xs font-bold text-slate-800">{b.label}</p>
                  <p className="text-[9px] text-slate-400">{b.desc}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
            <Sparkles className="text-slate-200 mx-auto mb-2" size={36} />
            <p className="font-bold text-slate-700 text-sm mb-1">No badges yet</p>
            <p className="text-slate-400 text-xs">Badges are earned by logging dives.</p>
          </div>
        )
      )}

      {/* Bucket List */}
      {section === 'bucket' && (
        bucketList.length > 0 ? (
          <div className="space-y-2">
            {bucketList.map(b => (
              <div key={b.id} className={`bg-white rounded-2xl border p-3 flex items-start gap-2.5 ${b.completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`} data-testid="my-bucket-item">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${b.completed ? 'bg-emerald-500 text-white' : 'border-2 border-slate-200'}`}>
                  {b.completed && <Check size={10} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${b.completed ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>{b.site_name}</p>
                  {b.location && <p className="text-[10px] text-slate-400 flex items-center gap-0.5"><MapPin size={8} /> {b.location}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
            <Globe className="text-slate-200 mx-auto mb-2" size={36} />
            <p className="font-bold text-slate-700 text-sm mb-1">No bucket list items</p>
            <p className="text-slate-400 text-xs">Dream dive sites will appear here.</p>
          </div>
        )
      )}
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div className="text-center flex-1">
      <p className="text-base font-black text-slate-900">{value}</p>
      <p className="text-[9px] text-slate-400 font-medium">{label}</p>
    </div>
  );
}
