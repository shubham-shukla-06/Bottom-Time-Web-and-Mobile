import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle, AlertTriangle, Activity, ArrowDownRight, Layers } from 'lucide-react';
import { SectionHeader, Tile, Card, Th, StatusBadge, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function CashflowSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/cashflow').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="cashflow-section">
      <SectionHeader title="Cash Flow & Payments" sectionKey="cashflow" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Captured" value={`$${d.captured.toLocaleString()}`} icon={CheckCircle} color="emerald" />
        <Tile label="Failed" value={`$${d.failed.toLocaleString()}`} icon={AlertTriangle} color={d.failed > 0 ? 'red' : 'emerald'} />
        <Tile label="Pending" value={`$${d.pending.toLocaleString()}`} icon={Activity} color="amber" />
        <Tile label="Refunds" value={`$${d.refunds.toLocaleString()}`} icon={ArrowDownRight} color={d.refunds > 0 ? 'red' : 'emerald'} />
      </div>
      <Card title="Booking Status Breakdown" icon={Layers}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100"><Th>Status</Th><Th>Count</Th><Th>Value</Th></tr></thead>
            <tbody>{d.booking_status?.map(s => (
              <tr key={s.status} className="border-b border-slate-50">
                <td className="py-2 px-3"><StatusBadge status={s.status} /></td>
                <td className="py-2 px-3 text-slate-700">{s.count}</td>
                <td className="py-2 px-3 text-slate-700 font-semibold">${s.value.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
