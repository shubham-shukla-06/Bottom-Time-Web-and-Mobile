import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, Bell, Activity, Heart, Target, Shield } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader, Tile, Card, MiniStat, Loader } from './primitives';
import { TT_STYLE, TICK_SM, TICK_SM_11 } from './constants';
import { useAutoRefresh } from './useAutoRefresh';

export default function CommunitySection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/community').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="community-section">
      <SectionHeader title="Community & Social Graph" sectionKey="community" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total Connections" value={d.total_connections} icon={Users} color="cyan" />
        <Tile label="Pending Requests" value={d.pending_requests} icon={Bell} color="amber" />
        <Tile label="Avg Connections" value={d.avg_connections} icon={Activity} color="blue" />
        <Tile label="Total Wishlists" value={d.total_wishlists} icon={Heart} color="rose" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Booking Impact: Connected vs Solo" icon={Target}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[
              { segment: 'Connected Users', booked: d.connected_who_booked },
              { segment: 'Solo Users', booked: d.solo_who_booked },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="segment" tick={TICK_SM_11} />
              <YAxis tick={TICK_SM} />
              <RTooltip contentStyle={TT_STYLE} />
              <Bar dataKey="booked" fill="#0891b2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Trust Signals" icon={Shield}>
          <div className="space-y-3">
            <MiniStat label="Divers with Certifications" value={d.with_certifications} />
            <MiniStat label="Total Divers" value={d.total_divers} />
            <MiniStat label="Certification Rate" value={`${d.total_divers > 0 ? Math.round(d.with_certifications / d.total_divers * 100) : 0}%`} />
          </div>
        </Card>
      </div>
    </div>
  );
}
