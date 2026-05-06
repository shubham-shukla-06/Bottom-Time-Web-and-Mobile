import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, AlertTriangle, TrendingUp, Star, Activity } from 'lucide-react';
import { SectionHeader, Tile, Card, SortableTable, RoleBadge, Loader, EmptyState } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

const CHANNEL_COLUMNS = [
  { key: 'channel', label: 'Channel', className: 'font-semibold text-slate-800' },
  { key: 'users', label: 'Users' },
  { key: 'bookings', label: 'Bookings', className: 'text-blue-700' },
  { key: 'revenue', label: 'Revenue', className: 'text-emerald-700 font-semibold', render: v => `$${v}` },
  { key: 'conversion', label: 'Conversion', render: v => `${v}%` },
];

const QUALITY_COLUMNS = [
  { key: 'channel', label: 'Channel', className: 'font-semibold text-slate-800' },
  { key: 'users', label: 'Users' },
  { key: 'booking_rate', label: 'Booking Rate', className: 'text-blue-700', render: v => `${v}%` },
  { key: 'revenue', label: 'Revenue', className: 'text-emerald-700 font-semibold', render: v => `$${v}` },
  { key: 'reviews', label: 'Reviews' },
  { key: 'connections', label: 'Connections' },
  { key: 'refund_rate', label: 'Refund Rate', render: (v) => <span className={v > 10 ? 'text-red-600 font-semibold' : 'text-emerald-700'}>{v}%</span> },
];

export default function MarketingSection() {
  const [d, setD] = useState(null);
  const [ret, setRet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attrModel, setAttrModel] = useState('first_touch');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([axios.get(`/cmd/marketing?model=${attrModel}`), axios.get('/cmd/retention')])
      .then(([m, r]) => { setD(m.data); setRet(r.data); })
      .catch(() => { if (!silent) toast.error('Failed'); })
      .finally(() => setLoading(false));
  }, [attrModel]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="marketing-section">
      <SectionHeader title="Marketing & Attribution" sectionKey="marketing" />
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 w-fit" data-testid="attribution-model-selector">
        {[{ key: 'first_touch', label: 'First Touch' }, { key: 'last_touch', label: 'Last Touch' }, { key: 'linear', label: 'Linear' }, { key: 'time_decay', label: 'Time Decay' }].map(m => (
          <button key={m.key} onClick={() => setAttrModel(m.key)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${attrModel === m.key ? 'bg-cyan-400 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            data-testid={`attr-model-${m.key}`}>{m.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Tracked Users" value={d.total_tracked_users} icon={Users} color="cyan" />
        <Tile label="UTM Events" value={d.total_utm_events} icon={Activity} color="blue" />
        <Tile label="Untracked" value={d.untracked_users} icon={AlertTriangle} color={d.untracked_users > d.total_tracked_users ? 'amber' : 'emerald'} />
      </div>
      <Card title={`Revenue by Channel (${attrModel.replace('_', ' ')})`} icon={TrendingUp}>
        {d.channels?.length > 0 ? (
          <SortableTable data={d.channels} testId="channel-table" columns={[
            { key: 'channel', label: 'Channel', className: 'font-semibold text-slate-800' },
            { key: 'users', label: 'Users' },
            { key: 'bookings', label: 'Bookings', className: 'text-blue-700' },
            { key: 'revenue', label: 'Revenue', className: 'text-emerald-700 font-semibold', render: v => `$${v}` },
            { key: 'conversion', label: 'Conversion', render: v => `${v}%` },
          ]} />
        ) : <EmptyState text="No attributed data yet. Add UTM parameters to your marketing links." />}
      </Card>
      {ret?.channels?.length > 0 && (
        <Card title="User Quality by Channel" icon={Star}>
          <SortableTable data={ret.channels} testId="quality-table" columns={QUALITY_COLUMNS} />
        </Card>
      )}
    </div>
  );
}
