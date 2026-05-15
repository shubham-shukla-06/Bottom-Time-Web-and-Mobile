import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Database, Layers, Bell, Activity } from 'lucide-react';
import { SectionHeader, Tile, Card, PieChartSimple, Loader, EmptyState } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';
import CompanySettingsCard from './CompanySettingsCard';

export default function PlatformSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/platform').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="platform-section">
      <SectionHeader title="Platform Performance" sectionKey="platform" />
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Collections" value={d.database_collections} icon={Database} color="cyan" />
        <Tile label="Total Documents" value={d.total_documents.toLocaleString()} icon={Layers} color="blue" />
        <Tile label="Notif Read Rate" value={`${d.notifications.read_rate}%`} icon={Bell} color={d.notifications.read_rate > 50 ? 'emerald' : 'amber'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Collection Sizes" icon={Database}>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {d.collection_sizes?.map(c => (
              <div key={c.name} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-600 font-mono">{c.name}</span>
                <span className="text-xs text-slate-800 font-semibold">{c.docs.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Event Tracking" icon={Activity}>
          {d.event_distribution?.length > 0 ? <PieChartSimple data={d.event_distribution} nameKey="type" dataKey="count" /> : <EmptyState text="No events tracked yet" />}
        </Card>
      </div>
      <CompanySettingsCard />
    </div>
  );
}
