import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Package, BookOpen, DollarSign, X, ChevronRight, Globe, TrendingUp, Star, Users, Layers, ArrowDownRight, Navigation } from 'lucide-react';
import { SectionHeader, Tile, Card, SortableTable, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

const REV_TYPE_COLUMNS = [
  { key: 'type', label: 'Type', className: 'font-semibold text-slate-800 capitalize' },
  { key: 'bookings', label: 'Bookings', className: 'text-blue-700' },
  { key: 'revenue', label: 'Revenue', className: 'text-emerald-700 font-semibold', render: v => `$${v}` },
];

const TOP_LISTINGS_COLUMNS = [
  { key: 'name', label: 'Listing', className: 'font-semibold text-slate-800' },
  { key: 'type', label: 'Type', className: 'capitalize' },
  { key: 'location', label: 'Location' },
  { key: 'price', label: 'Price', render: v => v ? `$${v}` : '-' },
  { key: 'rating', label: 'Rating', className: 'text-amber-600', render: v => v || '-' },
];

export default function DrillDownSection({ country, setCountry }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const params = country ? `?country=${encodeURIComponent(country)}` : '';
    axios.get(`/cmd/drilldown${params}`)
      .then(r => setD(r.data))
      .catch(() => { if (!silent) toast.error('Failed'); })
      .finally(() => setLoading(false));
  }, [country]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="drilldown-section">
      <SectionHeader title="Drill-Down Explorer" sectionKey="drilldown" />
      <div className="flex items-center gap-1.5 text-xs" data-testid="drilldown-breadcrumb">
        <button onClick={() => setCountry(null)} className={`font-semibold ${!country ? 'text-cyan-400' : 'text-slate-500 hover:text-cyan-400'}`}>Global</button>
        {country && <>
          <ChevronRight size={12} className="text-slate-400" />
          <span className="font-semibold text-cyan-400">{country}</span>
          <button onClick={() => setCountry(null)} className="ml-1 p-0.5 rounded hover:bg-slate-100"><X size={11} className="text-slate-400" /></button>
        </>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Listings" value={d.total_listings} icon={Package} color="cyan" />
        <Tile label="Bookings" value={d.total_bookings} icon={BookOpen} color="blue" />
        <Tile label="Revenue" value={`$${d.total_revenue.toLocaleString()}`} icon={DollarSign} color="emerald" />
        <Tile label="Cancel Rate" value={`${d.cancel_rate}%`} icon={ArrowDownRight} color={d.cancel_rate > 10 ? 'red' : 'emerald'} />
      </div>
      {d.avg_rating > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Avg Rating" value={d.avg_rating} icon={Star} color="yellow" />
          <Tile label="Operators" value={d.operators?.length || 0} icon={Users} color="violet" />
        </div>
      )}
      {d.revenue_by_type?.length > 0 && (
        <Card title={country ? `Revenue by Type in ${country}` : 'Revenue by Type (Global)'} icon={Layers}>
          <SortableTable data={d.revenue_by_type} testId="drilldown-rev-table" columns={REV_TYPE_COLUMNS} />
        </Card>
      )}
      {d.top_listings?.length > 0 && (
        <Card title={country ? `Top Listings in ${country}` : 'Top Listings (Global)'} icon={TrendingUp}>
          <SortableTable data={d.top_listings} testId="drilldown-listings-table" columns={TOP_LISTINGS_COLUMNS} />
        </Card>
      )}
      {!country && d.available_countries?.length > 0 && (
        <Card title="Explore by Country" icon={Globe}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {d.available_countries.map(c => (
              <button key={c.country} onClick={() => setCountry(c.country)}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50 transition-colors text-left"
                data-testid={`drilldown-country-${c.country}`}>
                <div><p className="text-xs font-semibold text-slate-800">{c.country}</p><p className="text-[10px] text-slate-500">{c.listings} listings</p></div>
                <div className="text-right"><p className="text-[10px] text-emerald-700 font-semibold">${c.avg_price} avg</p><ChevronRight size={12} className="text-slate-400 ml-auto" /></div>
              </button>
            ))}
          </div>
        </Card>
      )}
      {country && d.operators?.length > 0 && (
        <Card title={`Operators in ${country}`} icon={Users}>
          <div className="space-y-1.5">
            {d.operators.map(o => (
              <div key={o.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-slate-50">
                <div className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-400 flex items-center justify-center text-[9px] font-bold">{o.name?.charAt(0)}</div>
                <span className="text-xs font-medium text-slate-800">{o.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
