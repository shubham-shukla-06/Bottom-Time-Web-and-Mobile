import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { BookOpen, Users, Target, Activity, Waves, ArrowDownRight, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader, Tile, Card, ChartCard, RankList, Loader } from './primitives';
import { TT_STYLE, TICK_SM, TICK_SM_11 } from './constants';
import { useAutoRefresh } from './useAutoRefresh';

export default function PathwaySection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/pathway').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="pathway-section">
      <SectionHeader title="Dive Pathway & Learning" sectionKey="pathway" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total Dive Logs" value={d.total_logs} icon={BookOpen} color="cyan" />
        <Tile label="Loggers" value={d.users_with_logs} icon={Users} color="blue" />
        <Tile label="Log Adoption" value={`${d.log_adoption_pct}%`} icon={Target} color={d.log_adoption_pct > 30 ? 'emerald' : 'amber'} />
        <Tile label="Avg Dives/Logger" value={d.avg_dives_per_logger} icon={Activity} color="violet" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Avg Depth" value={`${d.dive_stats.avg_depth}m`} icon={Waves} color="blue" />
        <Tile label="Max Depth" value={`${d.dive_stats.max_depth}m`} icon={ArrowDownRight} color="indigo" />
        <Tile label="Avg Duration" value={`${d.dive_stats.avg_duration}min`} icon={Activity} color="teal" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Onboarding Funnel" sub="Signup > Onboard > Book">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[
              { stage: 'Total Divers', count: d.total_divers },
              { stage: 'Onboarded', count: d.onboarded },
              { stage: 'Booked', count: d.pathway_to_booking },
            ]} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={TICK_SM} />
              <YAxis type="category" dataKey="stage" tick={TICK_SM_11} width={90} />
              <RTooltip contentStyle={TT_STYLE} />
              <Bar dataKey="count" fill="#0891b2" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card title="Certification Levels" icon={Star}>
          <RankList items={d.certification_distribution?.map(c => ({ name: c.level || 'Unknown', value: c.count })) || []} />
        </Card>
      </div>
    </div>
  );
}
