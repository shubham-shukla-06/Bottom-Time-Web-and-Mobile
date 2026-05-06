import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Globe, Zap, Users, Target, Layers, MapPin } from 'lucide-react';
import { SectionHeader, Tile, Card, PieChartSimple, RankList, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function EventsSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/events').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="events-section">
      <SectionHeader title="Events & Meetups" sectionKey="events" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total Events" value={d.total_events} icon={Globe} color="cyan" />
        <Tile label="Live Events" value={d.live_events} icon={Zap} color="emerald" />
        <Tile label="Total RSVPs" value={d.total_rsvps} icon={Users} color="blue" />
        <Tile label="Capacity Util." value={`${d.capacity_utilization}%`} icon={Target} color={d.capacity_utilization > 50 ? 'emerald' : 'amber'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Events by Type" icon={Layers}><PieChartSimple data={d.by_type || []} nameKey="type" dataKey="count" /></Card>
        <Card title="Events by Location" icon={MapPin}><RankList items={d.by_location?.map(l => ({ name: l.location, value: `${l.count} events` })) || []} /></Card>
      </div>
    </div>
  );
}
