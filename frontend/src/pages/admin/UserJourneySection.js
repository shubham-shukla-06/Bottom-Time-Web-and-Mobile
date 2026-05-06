import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, BookOpen, DollarSign, Star, Users, Target, Activity, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader, Tile, Card, RoleBadge, Loader, EmptyState } from './primitives';
import { TT_STYLE, TICK_SM, TICK_SM_DARK } from './constants';

export default function UserJourneySection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [journey, setJourney] = useState(null);
  const [aggJourneys, setAggJourneys] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingJourney, setLoadingJourney] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { axios.get('/cmd/journeys').then(r => setAggJourneys(r.data)).catch(() => {}); }, []);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try { const r = await axios.get(`/admin/users?search=${encodeURIComponent(searchQuery)}`); setUsers(r.data.users?.slice(0, 20) || []); } catch (e) { /* silent */ } finally { setLoading(false); }
  };

  const loadJourney = async (userId) => {
    setLoadingJourney(true); setSelectedUser(userId);
    try { const r = await axios.get(`/cmd/journey/${userId}`); setJourney(r.data); }
    catch (e) { toast.error('Failed to load journey'); } finally { setLoadingJourney(false); }
  };

  const eventStyles = {
    utm_landing: { color: 'text-violet-700', bg: 'bg-violet-100', label: 'UTM Landing' },
    signup: { color: 'text-cyan-400', bg: 'bg-cyan-100', label: 'Signup' },
    onboarded: { color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Onboarded' },
    page_view: { color: 'text-slate-600', bg: 'bg-slate-100', label: 'Page View' },
    search: { color: 'text-blue-700', bg: 'bg-blue-100', label: 'Search' },
    listing_click: { color: 'text-indigo-700', bg: 'bg-indigo-100', label: 'Listing Click' },
    booking: { color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Booking' },
    review: { color: 'text-amber-700', bg: 'bg-amber-100', label: 'Review' },
  };

  return (
    <div className="space-y-5" data-testid="journeys-section">
      <SectionHeader title="User Journey Mapping" sectionKey="journeys" />
      <Card title="Find User" icon={Search}>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input placeholder="Search by name or email..." className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-cyan-400"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchUsers()} data-testid="journey-search" />
          </div>
          <button onClick={searchUsers} className="px-3 py-1.5 bg-cyan-400 text-white text-xs font-semibold rounded-lg hover:bg-cyan-300" data-testid="journey-search-btn">Search</button>
        </div>
        {loading && <Loader />}
        {users.length > 0 && (
          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
            {users.map(u => (
              <button key={u.id} onClick={() => loadJourney(u.id)}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${selectedUser === u.id ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-50 border border-transparent'}`}
                data-testid="journey-user-row">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-400 flex items-center justify-center text-[9px] font-bold">{u.name?.charAt(0)}</div>
                  <div><p className="text-xs font-semibold text-slate-800">{u.name}</p><p className="text-[9px] text-slate-400">{u.email}</p></div>
                </div>
                <RoleBadge role={u.role} />
              </button>
            ))}
          </div>
        )}
      </Card>
      {loadingJourney && <Loader />}
      {journey && !loadingJourney && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label="First Touch" value={journey.first_touch?.source || 'Direct'} icon={Target} color="violet" />
            <Tile label="Bookings" value={journey.bookings} icon={BookOpen} color="blue" />
            <Tile label="Revenue" value={`$${journey.total_revenue}`} icon={DollarSign} color="emerald" />
            <Tile label="Reviews" value={journey.reviews} icon={Star} color="amber" />
            <Tile label="Connections" value={journey.connections} icon={Users} color="cyan" />
          </div>
          <Card title={`Journey: ${journey.user?.name}`} icon={Clock}>
            <div className="relative ml-3 border-l-2 border-slate-200 space-y-0">
              {journey.timeline?.map((evt, i) => {
                const style = eventStyles[evt.type] || { color: 'text-slate-600', bg: 'bg-slate-100', label: evt.type };
                return (
                  <div key={`evt-${evt.timestamp || i}`} className="flex items-start gap-3 py-2 pl-4 relative" data-testid="journey-event">
                    <div className={`absolute -left-[7px] top-3 w-3 h-3 rounded-full ${style.bg} border-2 border-white`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${style.bg} ${style.color}`}>{style.label}</span>
                        <span className="text-[9px] text-slate-400">{evt.date?.split('T')[0]}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5">{evt.data}</p>
                    </div>
                  </div>
                );
              })}
              {(!journey.timeline || journey.timeline.length === 0) && <EmptyState text="No events recorded" />}
            </div>
          </Card>
        </div>
      )}
      {aggJourneys?.first_actions?.length > 0 && (
        <Card title="First Action After Signup" icon={Activity}>
          <p className="text-[10px] text-slate-500 mb-2">Based on {aggJourneys.sample_size} users</p>
          <ResponsiveContainer width="100%" height={Math.min(aggJourneys.first_actions.length * 40 + 20, 300)}>
            <BarChart data={aggJourneys.first_actions.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={TICK_SM} />
              <YAxis type="category" dataKey="action" tick={TICK_SM_DARK} width={100} />
              <RTooltip contentStyle={TT_STYLE} />
              <Bar dataKey="count" fill="#0891b2" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
