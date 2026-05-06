import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { TrendingUp, MousePointerClick, Inbox, CheckCircle, Loader2, Share2 } from 'lucide-react';
import { StatCard } from '../pages/operator/OperatorPrimitives';

const SOURCE_COLORS = {
  whatsapp: 'bg-emerald-500',
  x: 'bg-slate-800',
  facebook: 'bg-blue-600',
  telegram: 'bg-sky-500',
  linkedin: 'bg-sky-700',
  email: 'bg-slate-600',
  sms: 'bg-violet-500',
  instagram: 'bg-pink-500',
  direct: 'bg-slate-500',
  newsletter: 'bg-amber-500',
};


function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}


function TopOperatorsCard({ data, scope }) {
  if (!(scope === 'admin' && data.top_operators?.length > 0)) return null;
  return (
    <div className="bg-white border border-slate-100 hover:border-cyan-300 rounded-2xl p-5 hover:shadow-md transition-[box-shadow,border-color] duration-200">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800">Top operators by share-driven traffic</h3>
      </div>
      <div className="space-y-2">
        {data.top_operators.map(o => (
          <div key={o.operator_id} className="flex items-center justify-between text-xs py-2 border-b border-slate-50 last:border-0" data-testid={`row-op-${o.operator_id}`}>
            <span className="font-semibold text-slate-700">{o.operator_name || 'Unknown'}</span>
            <span><span className="font-bold text-slate-700">{o.clicks}</span> clicks <span className="text-slate-400">({o.uniques} unique)</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}


function TopListingsCard({ data, scope }) {
  if (!(data.top_listings?.length > 0 && scope !== 'admin')) return null;
  return (
    <div className="bg-white border border-slate-100 hover:border-cyan-300 rounded-2xl p-5 hover:shadow-md transition-[box-shadow,border-color] duration-200">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800">Top listings by click volume</h3>
      </div>
      <div className="space-y-2">
        {data.top_listings.map(l => (
          <div key={l.listing_id} className="flex items-center justify-between text-xs py-2 border-b border-slate-50 last:border-0" data-testid={`row-listing-${l.listing_id}`}>
            <span className="font-semibold text-slate-700 truncate max-w-md">{l.title || 'Untitled'}</span>
            <span className="font-bold text-slate-700">{l.clicks} clicks</span>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function ShareAnalyticsTab({ scope = 'operator' }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = scope === 'admin' ? `/admin/share-analytics?days=${days}` : `/operator/share-analytics?days=${days}`;
      const res = await axios.get(url);
      setData(res.data);
    } catch (e) {
      setData(null);
    } finally { setLoading(false); }
  }, [days, scope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxClicks = useMemo(() => {
    if (!data?.by_source) return 0;
    return Math.max(...data.by_source.map(s => s.clicks), 0);
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-cyan-400" size={28} /></div>;
  }

  const empty = !data || data.total_clicks === 0;
  const heading = scope === 'admin' ? 'Share Analytics — Global' : 'Share Analytics';

  return (
    <div className="space-y-6" data-testid="share-analytics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Share2 size={18} className="text-cyan-400" /> {heading}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Clicks &amp; bookings broken down by the platform you shared on</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-full p-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all ${days === d ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} data-testid={`range-${d}d`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <Share2 size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 mb-1">No tracked clicks yet</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">Open the <strong>Share</strong> modal on any listing, pick the platforms you'll post on, and we'll start showing each platform's clicks &amp; conversions here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Clicks" value={data.total_clicks} icon={<MousePointerClick size={16} className="text-cyan-500" />} />
            <StatCard label="Bookings" value={data.total_bookings} icon={<Inbox size={16} className="text-amber-500" />} />
            <StatCard label="Confirmed" value={data.total_confirmed} icon={<CheckCircle size={16} className="text-emerald-500" />} />
            <StatCard label="Click → Booking" value={`${data.conv_rate}%`} icon={<TrendingUp size={16} className="text-violet-500" />} />
          </div>

          <div className="bg-white border border-slate-100 hover:border-cyan-300 rounded-2xl p-5 hover:shadow-md transition-[box-shadow,border-color] duration-200">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-800">By platform</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Each row is a tracked link you generated. <span className="italic">"diver_share"</span> = clicks where a diver shared this listing.</p>
            </div>
            <div className="space-y-3">
              {data.by_source.map(s => {
                const color = SOURCE_COLORS[s.source] || 'bg-slate-400';
                return (
                  <div key={s.source} data-testid={`row-source-${s.source}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <span className="font-semibold text-slate-700 capitalize">{s.source.replace(/_/g, ' ')}</span>
                        <span className="text-slate-400">({s.uniques} unique)</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-bold text-slate-700">{s.clicks}</span>
                        <span className="text-slate-400"> · {s.bookings || 0} books</span>
                        {s.conv_rate > 0 && <span className="ml-1 text-emerald-600 font-semibold">{s.conv_rate}%</span>}
                      </div>
                    </div>
                    <Bar value={s.clicks} max={maxClicks} color={color} />
                  </div>
                );
              })}
            </div>
          </div>

          {scope === 'admin' ? <TopOperatorsCard data={data} scope={scope} /> : <TopListingsCard data={data} scope={scope} />}
        </div>
      )}
    </div>
  );
}
