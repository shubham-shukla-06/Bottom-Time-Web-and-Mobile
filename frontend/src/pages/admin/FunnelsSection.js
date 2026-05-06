import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Target, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader, Card, RankList, Loader } from './primitives';
import { TT_STYLE, TICK_SM, TICK_SM_11 } from './constants';
import { useAutoRefresh } from './useAutoRefresh';

export default function FunnelsSection() {
  const [d, setD] = useState(null);
  const [journeys, setJourneys] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([axios.get('/cmd/funnels'), axios.get('/cmd/journeys')])
      .then(([f, j]) => { setD(f.data); setJourneys(j.data); })
      .catch(() => { if (!silent) toast.error('Failed'); })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;
  const funnelNames = { acquisition: 'Visit > Signup > Activate > Book', events: 'Event Views > RSVPs', commerce: 'Product Views > Purchase', chat_to_booking: 'Chat > Booking', pathway: 'Onboard > Booking' };

  return (
    <div className="space-y-5" data-testid="funnels-section">
      <SectionHeader title="Full-Funnel Visibility" sectionKey="funnels" />
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.entries(d || {}).map(([key, funnel]) => (
          <Card key={key} title={funnelNames[key] || key} icon={Target}>
            <ResponsiveContainer width="100%" height={funnel.steps.length * 50 + 20}>
              <BarChart data={funnel.steps} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={TICK_SM} />
                <YAxis type="category" dataKey="name" tick={TICK_SM_11} width={100} />
                <RTooltip contentStyle={TT_STYLE} />
                <Bar dataKey="count" fill="#0891b2" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </div>
      {journeys?.first_actions?.length > 0 && (
        <Card title="First Feature Used After Signup" icon={Activity}>
          <p className="text-[10px] text-slate-400 mb-2">Sample: {journeys.sample_size} users</p>
          <RankList items={journeys.first_actions.map(a => ({ name: a.action, value: `${a.count} users` }))} />
        </Card>
      )}
    </div>
  );
}
