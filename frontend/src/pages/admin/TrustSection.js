import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Flag, AlertTriangle, CheckCircle, Ban, Star, Shield } from 'lucide-react';
import { SectionHeader, Tile, Card, PieChartSimple, RankList, RoleBadge, StatusBadge, Loader, EmptyState } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function TrustSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/trust').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  const handleAction = async (reportId, action) => {
    const notes = action !== 'dismiss' ? window.prompt(`Note for ${action}:`, '') : '';
    if (notes === null) return;
    try {
      await axios.put(`/admin/reports/${reportId}?action=${action}&notes=${encodeURIComponent(notes || '')}`);
      toast.success(`Report ${action}ed`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="space-y-5" data-testid="trust-section">
      <SectionHeader title="Trust, Safety & Compliance" sectionKey="trust" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total Reports" value={d.total_reports} icon={Flag} color="red" />
        <Tile label="Pending" value={d.pending} icon={AlertTriangle} color={d.pending > 0 ? 'amber' : 'emerald'} />
        <Tile label="Actioned" value={d.actioned} icon={CheckCircle} color="emerald" />
        <Tile label="Suspended Users" value={d.suspended_users} icon={Ban} color={d.suspended_users > 0 ? 'red' : 'emerald'} />
      </div>
      {d.by_reason?.length > 0 && <Card title="Reports by Reason" icon={Flag}><PieChartSimple data={d.by_reason} nameKey="reason" dataKey="count" /></Card>}
      {d.low_rated_listings?.length > 0 && (
        <Card title="Low-Rated Listings (Below 3.0)" icon={Star}>
          <RankList items={d.low_rated_listings.map(l => ({ name: l.name, value: `${l.avg_rating} avg`, sub: `${l.reviews} reviews` }))} />
        </Card>
      )}
      <Card title="Recent Reports" icon={Flag}>
        {d.recent_reports?.length > 0 ? (
          <div className="space-y-3">
            {d.recent_reports.map(r => (
              <div key={r.id} className="border border-slate-100 rounded-lg p-3" data-testid="trust-report-card">
                <div className="flex items-start justify-between mb-2">
                  <div><span className="text-xs font-bold text-slate-800">{r.reported_name}</span><RoleBadge role={r.reported_role} /><span className="text-[10px] text-slate-400 ml-2">by {r.reporter_name}</span></div>
                  <div className="flex items-center gap-2"><span className="px-2 py-0.5 bg-red-50 text-red-700 text-[9px] font-bold rounded">{r.reason}</span><StatusBadge status={r.status} /></div>
                </div>
                {r.details && <p className="text-[11px] text-slate-500 mb-2">{r.details}</p>}
                {r.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => handleAction(r.id, 'warn')} className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold rounded-lg hover:bg-amber-100" data-testid="trust-warn-btn">Warn</button>
                    <button onClick={() => handleAction(r.id, 'suspend')} className="px-2 py-1 bg-red-50 border border-red-200 text-red-700 text-[10px] font-semibold rounded-lg hover:bg-red-100" data-testid="trust-suspend-btn">Suspend</button>
                    <button onClick={() => handleAction(r.id, 'dismiss')} className="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-semibold rounded-lg hover:bg-slate-100" data-testid="trust-dismiss-btn">Dismiss</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <EmptyState text="No reports" />}
      </Card>
    </div>
  );
}
