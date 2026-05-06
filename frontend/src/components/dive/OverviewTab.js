import { useState, useMemo, Suspense, lazy, memo } from 'react';
import {
  Anchor, MapPin, Clock, Activity, Globe, Waves, Trophy, Thermometer, Users
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Sector, ComposedChart, Bar, Line, CartesianGrid, BarChart
} from 'recharts';
import { StatTile, RecordCard, ChartCard, QRow, EmptyChart, ContextHelp, TYPE_COLORS, TOOLTIP_STYLE } from './SharedComponents';
import { Skeleton } from '../ui/skeleton';

const DiveSiteMap = lazy(() => import('../DiveSiteMap'));

const ActivePieShape = ({ cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value }) => {
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const mx = cx + (outerRadius + 18) * cos;
  const my = cy + (outerRadius + 18) * sin;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 3} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={1} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 14} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.3} />
      <text x={mx} y={my} textAnchor={cos >= 0 ? 'start' : 'end'} fill={fill} fontSize={11} fontWeight={700}>{value}</text>
    </g>
  );
};

function OverviewTab({ stats, logs, onChangeTab }) {
  const [activePie, setActivePie] = useState(-1);
  const depthTimeline = useMemo(() =>
    logs.filter(l => l.max_depth && l.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-20)
      .map(l => ({ date: l.date?.slice(5, 10), depth: l.max_depth, temp: l.water_temp, site: l.site_name })),
    [logs]);
  const typeData = useMemo(() => Object.entries(stats.type_counts || {}).map(([name, value]) => ({ name, value, fill: TYPE_COLORS[name] || '#94a3b8' })), [stats]);
  const monthlyData = useMemo(() => (stats.monthly || []).slice(-12).map(m => ({ month: m.month?.slice(5), dives: m.dives, depth: m.avg_depth, temp: m.avg_temp })), [stats]);
  const depthDist = stats.depth_distribution || [];
  const records = stats.records || {};
  const topBuddies = stats.top_buddies || [];
  const [showHelp, setShowHelp] = useState(true);
  const TT = TOOLTIP_STYLE;
  const tempData = useMemo(() =>
    logs.filter(l => l.water_temp != null).sort((a, b) => a.date?.localeCompare(b.date)).slice(-15)
      .map(l => ({ date: l.date?.slice(5, 10), temp: l.water_temp })),
    [logs]);

  return (
    <div className="space-y-5" data-testid="overview-tab">
      <ContextHelp show={showHelp} onDismiss={() => setShowHelp(false)} onShow={() => setShowHelp(true)}
        title="Your diving overview"
        text="This page shows everything about your diving life at a glance. The numbers at the top summarise your dives. Below you'll find charts showing your depth history, what types of dives you do, a world map of where you've dived, and your dive activity calendar. Tap the (?) icon next to any number to learn what it means."
      />

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <StatTile label="Total Dives" value={stats.total || 0} icon={Anchor} subtitle="Dives completed" />
        <StatTile label="Max Depth" value={`${stats.max_depth || 0}m`} icon={Waves} subtitle="Deepest you've been" helpKey="depth" />
        <StatTile label="Avg Depth" value={`${stats.avg_depth || 0}m`} icon={Activity} subtitle="Average across dives" />
        <StatTile label="Bottom Time" value={(() => { const t = stats.total_time || 0; return t >= 60 ? `${Math.floor(t/60)}h ${t%60}m` : `${t}min`; })()} icon={Clock} subtitle="Total time underwater" helpKey="duration" />
        <StatTile label="Dive Sites" value={stats.unique_sites || 0} icon={MapPin} subtitle="Unique locations" />
        <StatTile label="Countries" value={stats.countries || 0} icon={Globe} subtitle="Nations explored" />
      </div>

      {Object.keys(records).length > 0 && (
        <div data-testid="personal-records" className="mt-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Trophy size={12} className="text-amber-400" /> Personal Records</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {records.deepest && <RecordCard title="Deepest" value={`${records.deepest.value}m`} site={records.deepest.site} date={records.deepest.date} color="blue" />}
            {records.longest && <RecordCard title="Longest" value={`${records.longest.value}min`} site={records.longest.site} date={records.longest.date} color="violet" />}
            {records.coldest && <RecordCard title="Coldest" value={`${records.coldest.value}°C`} site={records.coldest.site} date={records.coldest.date} color="cyan" />}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Depth Timeline" subtitle="Your recent dive depths — each dot is one dive, deeper = lower on the chart" testId="depth-chart">
          {depthTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={depthTimeline}>
                <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} /><stop offset="95%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
                <YAxis reversed tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} unit="m" />
                <Tooltip contentStyle={TT} formatter={(v) => [`${v}m`, 'Depth']} />
                <Area type="monotone" dataKey="depth" stroke="#0e7490" strokeWidth={2} fill="url(#dg)" dot={{ fill: '#0e7490', r: 3, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Monthly Activity" subtitle="How many dives you did each month, with the orange line showing average depth" testId="monthly-chart">
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} unit="m" />
                <Tooltip contentStyle={TT} />
                <Bar yAxisId="l" dataKey="dives" fill="#0e7490" radius={[4, 4, 0, 0]} name="Dives" />
                <Line yAxisId="r" type="monotone" dataKey="depth" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} name="Avg Depth" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Dive Types" subtitle="The different kinds of dives you've done — reef, wreck, cave, etc." testId="type-chart">
          {typeData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart><Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={2} strokeWidth={0}
                  activeIndex={activePie} activeShape={ActivePieShape}
                  onClick={(_, i) => setActivePie(prev => prev === i ? -1 : i)}
                  style={{ cursor: 'pointer' }}>
                  {typeData.map((e, i) => <Cell key={`k${i}`} fill={e.fill} opacity={activePie >= 0 && activePie !== i ? 0.4 : 1} />)}
                </Pie><Tooltip contentStyle={TT} /></PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">{typeData.map((t, i) => (
                <div key={t.name} className={`flex items-center gap-2 text-xs cursor-pointer rounded-lg px-1.5 py-0.5 transition-all ${activePie === i ? 'bg-slate-100 scale-105' : 'hover:bg-slate-50'}`}
                  onClick={() => setActivePie(prev => prev === i ? -1 : i)}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.fill, opacity: activePie >= 0 && activePie !== i ? 0.4 : 1 }} />
                  <span className="capitalize text-slate-600 flex-1">{t.name}</span>
                  <span className="font-bold text-slate-800">{t.value}</span>
                </div>
              ))}</div>
            </div>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Depth Distribution" subtitle="Most of your dives fall in these depth ranges — see where you spend the most time" testId="depth-dist">
          {depthDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={depthDist} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
                <YAxis type="category" dataKey="range" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} width={50} />
                <Tooltip contentStyle={TT} formatter={(v) => [`${v} dives`]} />
                <Bar dataKey="count" fill="#0e7490" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      <ChartCard title="Dive Site Map" testId="site-map">
        <Suspense fallback={<div className="h-[360px] flex items-center justify-center"><Skeleton className="w-full h-full rounded-xl" /></div>}>
          <DiveSiteMap />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard title="Dive Buddies" testId="buddies">
          {topBuddies.length > 0 ? (
            <div className="space-y-2.5">{topBuddies.map((b, i) => (
              <div key={b.name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-cyan-50 text-cyan-600 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="text-sm text-slate-700 flex-1">{b.name}</span>
                <span className="text-xs font-bold text-cyan-600">{b.dives}</span>
              </div>
            ))}</div>
          ) : <p className="text-xs text-slate-400 text-center py-4">Add buddies to your dives</p>}
        </ChartCard>

        <ChartCard title="Water Temperature" testId="temp-chart">
          {tempData.length > 2 ? (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={tempData}>
                <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} unit="°" />
                <Tooltip contentStyle={TT} formatter={(v) => [`${v}°C`]} />
                <Area type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2} fill="url(#tg)" dot={{ fill: '#f59e0b', r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-4">Log water temps to see trends</p>}
        </ChartCard>

        <ChartCard title="Quick Stats" testId="quick-stats">
          <div className="space-y-2.5">
            <QRow label="Avg Duration" value={`${stats.avg_duration || 0} min`} />
            <QRow label="Longest Dive" value={`${stats.longest_dive || 0} min`} />
            <QRow label="Avg Temp" value={stats.avg_temp != null ? `${stats.avg_temp}°C` : '—'} />
            <QRow label="Temp Range" value={stats.min_temp != null ? `${stats.min_temp}° — ${stats.max_temp}°C` : '—'} />
            <QRow label="Unique Sites" value={stats.unique_sites || 0} />
          </div>
        </ChartCard>
      </div>

    </div>
  );
}

export default memo(OverviewTab);
