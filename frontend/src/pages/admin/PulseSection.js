import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, BookOpen, DollarSign, TrendingUp, AlertTriangle, Zap, Activity, Target, Package, ShoppingBag, Star, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader, Tile, Card, ChartCard, MiniStat, AreaChartSimple, PieChartSimple, Loader } from './primitives';
import { TT_STYLE } from './constants';
import { useAutoRefresh } from './useAutoRefresh';

export default function PulseSection() {
  const [d, setD] = useState(null);
  const [g, setG] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([axios.get('/cmd/pulse'), axios.get('/cmd/growth')])
      .then(([p, gr]) => { setD(p.data); setG(gr.data); })
      .catch(() => { if (!silent) toast.error('Failed to load pulse'); })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  const tiles = [
    { label: 'Active Divers', value: d.active_divers, icon: Users, color: 'cyan' },
    { label: 'Active Shops', value: d.active_shops, icon: Package, color: 'emerald' },
    { label: 'Active Instructors', value: d.active_instructors, icon: Star, color: 'violet' },
    { label: 'Bookings Today', value: d.bookings_today, icon: BookOpen, color: 'blue' },
    { label: 'Bookings MTD', value: d.bookings_mtd, icon: Target, color: 'sky' },
    { label: 'GBV (All Time)', value: `$${d.gbv.toLocaleString()}`, icon: DollarSign, color: 'amber' },
    { label: 'Net Revenue', value: `$${d.net_revenue.toLocaleString()}`, icon: TrendingUp, color: 'emerald' },
    { label: 'Shop Revenue', value: `$${d.shop_revenue.toLocaleString()}`, icon: ShoppingBag, color: 'orange' },
    { label: 'Refund Rate', value: `${d.refund_rate}%`, icon: ArrowDownRight, color: d.refund_rate > 5 ? 'red' : 'emerald' },
  ];

  return (
    <div className="space-y-5" data-testid="pulse-section">
      <SectionHeader title="Platform Pulse" sectionKey="pulse" />
      {(d.action_required.pending_users > 0 || d.action_required.pending_listings > 0 || d.action_required.pending_reports > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3" data-testid="action-required">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">Action Required</p>
            <div className="flex gap-4 mt-1 text-xs text-amber-700">
              {d.action_required.pending_users > 0 && <span>{d.action_required.pending_users} users awaiting approval</span>}
              {d.action_required.pending_listings > 0 && <span>{d.action_required.pending_listings} listings pending review</span>}
              {d.action_required.pending_reports > 0 && <span>{d.action_required.pending_reports} reports to review</span>}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">
        {tiles.map(t => <Tile key={t.label} {...t} />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card title="Last 24 Hours" icon={Zap}>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="New Users" value={d.changes_24h.users} />
            <MiniStat label="New Bookings" value={d.changes_24h.bookings} />
            <MiniStat label="Messages" value={d.changes_24h.messages} />
            <MiniStat label="Reviews" value={d.changes_24h.reviews} />
          </div>
        </Card>
        <Card title="Last 7 Days" icon={Activity}>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="New Users" value={d.changes_7d.users} />
            <MiniStat label="New Listings" value={d.changes_7d.listings} />
            <MiniStat label="Bookings" value={d.changes_7d.bookings} />
            <MiniStat label="Total Users" value={d.total_users} />
          </div>
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="User Growth" sub="Daily signups">
          <AreaChartSimple data={g?.daily_signups?.slice(-30) || []} dataKey="count" color="#0891b2" />
        </ChartCard>
        <ChartCard title="User Roles" sub="Account distribution">
          <PieChartSimple data={g?.role_distribution || []} nameKey="role" dataKey="count" />
        </ChartCard>
      </div>
    </div>
  );
}
