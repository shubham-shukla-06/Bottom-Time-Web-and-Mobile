import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { DollarSign, BookOpen, TrendingUp, ShoppingBag, Target, Users, Package, Layers } from 'lucide-react';
import { SectionHeader, Tile, Card, ChartCard, AreaChartSimple, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function RevenueSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/revenue').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="revenue-section">
      <SectionHeader title="Revenue & Unit Economics" sectionKey="revenue" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total Revenue" value={`$${d.total_revenue.toLocaleString()}`} icon={DollarSign} color="emerald" />
        <Tile label="Booking GBV" value={`$${d.booking_gbv.toLocaleString()}`} icon={BookOpen} color="cyan" />
        <Tile label="Commission" value={`$${d.booking_commission.toLocaleString()}`} icon={TrendingUp} color="blue" />
        <Tile label="Shop Revenue" value={`$${d.shop_revenue.toLocaleString()}`} icon={ShoppingBag} color="violet" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Take Rate" value={`${d.take_rate}%`} icon={Target} color="amber" />
        <Tile label="Rev / Diver" value={`$${d.rev_per_diver}`} icon={Users} color="cyan" />
        <Tile label="GBV / Shop" value={`$${d.rev_per_shop}`} icon={Package} color="emerald" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Daily Revenue" sub="Booking revenue trend">
          <AreaChartSimple data={d.daily_revenue?.slice(-30) || []} dataKey="revenue" color="#f59e0b" prefix="$" />
        </ChartCard>
        <Card title="Revenue by Dive Type" icon={Layers}>
          <div className="space-y-2">
            {d.revenue_by_type?.map(r => (
              <div key={r.type} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-700 font-medium capitalize">{r.type}</span>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-slate-500">{r.bookings} bookings</span>
                  <span className="text-xs text-emerald-700 font-semibold">${r.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
