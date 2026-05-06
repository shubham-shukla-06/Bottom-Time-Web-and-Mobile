import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, Eye, BookOpen, Target, Star, MessageCircle, ArrowUpRight, ArrowDownRight, Package, TrendingUp, Globe } from 'lucide-react';
import { SectionHeader, Tile, Card, Th, RankList, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function DiscoverSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/discover').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;
  const funnel = d.funnel;

  return (
    <div className="space-y-5" data-testid="discover-section">
      <SectionHeader title="Discover & Booking Marketplace" sectionKey="discover" />
      <div className="grid grid-cols-5 gap-3">
        <Tile label="Searches" value={funnel.searches} icon={Search} color="indigo" />
        <Tile label="Listing Views" value={funnel.listing_views} icon={Eye} color="blue" />
        <Tile label="Bookings" value={funnel.bookings} icon={BookOpen} color="emerald" />
        <Tile label="Search > View" value={`${funnel.search_to_view}%`} icon={ArrowUpRight} color="cyan" />
        <Tile label="View > Book" value={`${funnel.view_to_book}%`} icon={Target} color="amber" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Avg Rating" value={d.avg_rating} icon={Star} color="yellow" />
        <Tile label="Review Coverage" value={`${d.review_coverage}%`} icon={MessageCircle} color="violet" />
        <Tile label="Cancel Rate" value={`${d.cancel_rate}%`} icon={ArrowDownRight} color={d.cancel_rate > 10 ? 'red' : 'emerald'} />
      </div>
      <Card title="Supply: Listings by Type" icon={Package}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100"><Th>Type</Th><Th>Active</Th><Th>Pending</Th><Th>Total</Th><Th>Bookings</Th><Th>Revenue</Th></tr></thead>
            <tbody>{Object.entries(d.supply).map(([type, s]) => (
              <tr key={type} className="border-b border-slate-50">
                <td className="py-2 px-3 font-semibold text-slate-800 capitalize">{type}</td>
                <td className="py-2 px-3 text-emerald-700">{s.active || 0}</td>
                <td className="py-2 px-3 text-amber-600">{s.pending || 0}</td>
                <td className="py-2 px-3 text-slate-600">{s.total}</td>
                <td className="py-2 px-3 text-blue-700">{d.demand[type]?.bookings || 0}</td>
                <td className="py-2 px-3 text-emerald-700 font-semibold">${d.demand[type]?.revenue || 0}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Top Booked Listings" icon={TrendingUp}>
          <RankList items={d.top_booked?.map(b => ({ name: b.name, value: `${b.count} bookings`, sub: `$${b.revenue}` })) || []} />
        </Card>
        <Card title="Pricing by Country" icon={Globe}>
          <RankList items={d.price_by_country?.map(p => ({ name: p.country, value: `$${p.avg_price} avg`, sub: `${p.listings} listings` })) || []} />
        </Card>
      </div>
    </div>
  );
}
