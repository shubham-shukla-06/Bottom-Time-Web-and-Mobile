import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { SectionHeader, Card, SortableTable, RoleBadge, Loader, EmptyState } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function OperatorSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/operator-attribution').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="operator-section">
      <SectionHeader title="Operator & Partner Attribution" sectionKey="operators" />
      {d.leaderboard?.length > 0 ? (
        <Card title="Operator Leaderboard" icon={Star}>
          <SortableTable data={d.leaderboard} testId="operator-table" columns={[
            { key: 'name', label: 'Operator', className: 'font-semibold text-slate-800' },
            { key: 'role', label: 'Role', render: v => <RoleBadge role={v} /> },
            { key: 'referral_visits', label: 'Referral Visits', className: 'text-blue-700' },
            { key: 'referred_users', label: 'Referred Users' },
            { key: 'bookings', label: 'Bookings', className: 'text-cyan-400' },
            { key: 'revenue', label: 'Revenue', className: 'text-emerald-700 font-semibold', render: v => `$${v}` },
            { key: 'cancellations', label: 'Cancels', render: v => <span className={v > 0 ? 'text-red-600' : 'text-slate-400'}>{v}</span> },
            { key: 'avg_rating', label: 'Avg Rating', className: 'text-amber-600', render: v => v || '-' },
          ]} />
        </Card>
      ) : <EmptyState text="No operators yet" />}
    </div>
  );
}
