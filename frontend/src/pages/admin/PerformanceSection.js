import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Activity, Zap, Database, Server, ArrowDown, ArrowUp, Clock, BarChart3, Gauge, HardDrive, Wifi } from 'lucide-react';
import { SectionHeader, Tile, Card } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#06b6d4', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];
const TT = Object.freeze({ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 });
const TICK_XS_PERF = Object.freeze({ fontSize: 9 });
const TICK_XS_STROKE = '#94a3b8';

function MiniStat({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={`text-xs font-bold ${color || 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ value, good, warn }) {
  const color = value <= good ? 'bg-emerald-100 text-emerald-700' : value <= warn ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color}`}>{value}ms</span>;
}

export default function PerformanceSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/perf')
      .then(r => setD(r.data))
      .catch(() => { if (!silent) toast.error('Failed to load perf data'); })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 10000);

  if (loading || !d) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" /></div>;

  const s = d.summary;

  return (
    <div className="space-y-5" data-testid="performance-section">
      <SectionHeader title="Performance Monitor" sectionKey="performance" sub="Real-time API response times, cache efficiency, and system health. Auto-refreshes every 10s." />

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Avg Response" value={<StatusBadge value={s.avg_ms} good={100} warn={300} />} icon={Zap} color="cyan" />
        <Tile label="P95 Latency" value={<StatusBadge value={s.p95_ms} good={200} warn={500} />} icon={Clock} color="cyan" />
        <Tile label="Requests/sec" value={s.rps} icon={Activity} color="cyan" />
        <Tile label="Error Rate" value={`${s.error_rate}%`} icon={Server} color={s.error_rate > 5 ? 'red' : 'cyan'} />
      </div>

      {/* Cache + Compression + Indexes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="cache-stats">
          <div className="flex items-center gap-2 mb-3"><HardDrive size={14} className="text-cyan-500" /><span className="text-xs font-bold text-slate-800">API Cache</span></div>
          <div className="text-2xl font-black text-cyan-600 mb-1">{d.cache.hit_rate}%</div>
          <p className="text-[10px] text-slate-400 mb-3">Cache Hit Rate</p>
          <MiniStat label="Hits" value={d.cache.hits.toLocaleString()} color="text-emerald-600" />
          <MiniStat label="Misses" value={d.cache.misses.toLocaleString()} color="text-amber-600" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="compression-stats">
          <div className="flex items-center gap-2 mb-3"><ArrowDown size={14} className="text-emerald-500" /><span className="text-xs font-bold text-slate-800">GZip Compression</span></div>
          <div className="text-2xl font-black text-emerald-600 mb-1">{d.compression.ratio}%</div>
          <p className="text-[10px] text-slate-400 mb-3">Compressed Responses</p>
          <MiniStat label="Total Requests" value={d.compression.total_requests.toLocaleString()} />
          <MiniStat label="Compressed" value={d.compression.compressed.toLocaleString()} color="text-emerald-600" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="index-stats">
          <div className="flex items-center gap-2 mb-3"><Database size={14} className="text-blue-500" /><span className="text-xs font-bold text-slate-800">MongoDB Indexes</span></div>
          <div className="text-2xl font-black text-blue-600 mb-1">{d.indexes?.total || 0}</div>
          <p className="text-[10px] text-slate-400 mb-3">Active Indexes</p>
          <MiniStat label="Collections" value={d.indexes?.collections || 0} />
          <MiniStat label="Indexes/Collection" value={d.indexes?.total && d.indexes?.collections ? (d.indexes.total / d.indexes.collections).toFixed(1) : '0'} />
        </div>
      </div>

      {/* Throughput Timeline + Response Distribution */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Throughput (Last 60s)" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={d.timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={TICK_XS_PERF} stroke={TICK_XS_STROKE} />
              <YAxis tick={TICK_XS_PERF} stroke={TICK_XS_STROKE} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="requests" stroke="#06b6d4" fill="#cffafe" strokeWidth={2} name="Requests" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Response Time Distribution" icon={Gauge}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={d.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={TICK_XS_PERF} stroke={TICK_XS_STROKE} />
              <YAxis tick={TICK_XS_PERF} stroke={TICK_XS_STROKE} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" name="Requests" radius={[4, 4, 0, 0]}>
                {d.distribution.map((_, i) => <Cell key={`k${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Latency percentiles + Status codes */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="latency-percentiles">
          <div className="flex items-center gap-2 mb-3"><Clock size={14} className="text-slate-400" /><span className="text-xs font-bold text-slate-800">Latency Percentiles</span></div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-slate-400 mb-1">P50</div>
              <div className="text-lg font-black text-slate-700">{s.p50_ms}<span className="text-[10px] text-slate-400 ml-0.5">ms</span></div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">P95</div>
              <div className="text-lg font-black text-amber-600">{s.p95_ms}<span className="text-[10px] text-slate-400 ml-0.5">ms</span></div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">P99</div>
              <div className="text-lg font-black text-red-500">{s.p99_ms}<span className="text-[10px] text-slate-400 ml-0.5">ms</span></div>
            </div>
          </div>
          <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden flex">
            <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(s.p50_ms / (s.p99_ms || 1) * 100, 100)}%` }} />
            <div className="bg-amber-400 h-full" style={{ width: `${Math.min((s.p95_ms - s.p50_ms) / (s.p99_ms || 1) * 100, 100)}%` }} />
            <div className="bg-red-400 h-full flex-1" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-emerald-600">Fast</span>
            <span className="text-[9px] text-red-500">Slow</span>
          </div>
        </div>
        <Card title="Status Code Distribution" icon={Wifi}>
          {d.status_codes.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={d.status_codes} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={50} innerRadius={25}>
                    {d.status_codes.map((_, i) => <Cell key={`k${i}`} fill={i === 0 ? '#06b6d4' : i === 1 ? '#f59e0b' : '#ef4444'} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {d.status_codes.map((sc, i) => (
                  <div key={sc.status} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? '#06b6d4' : i === 1 ? '#f59e0b' : '#ef4444' }} />
                    <span className="text-xs font-semibold text-slate-700">{sc.status}</span>
                    <span className="text-xs text-slate-400">{sc.count} reqs</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-6">No requests in last 60s</p>
          )}
        </Card>
      </div>

      {/* Endpoint Table */}
      <Card title="Slowest Endpoints" icon={ArrowUp}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="endpoint-table">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 text-slate-400 font-medium">Endpoint</th>
                <th className="text-right py-2 text-slate-400 font-medium">Requests</th>
                <th className="text-right py-2 text-slate-400 font-medium">Avg (ms)</th>
                <th className="text-right py-2 text-slate-400 font-medium">Max (ms)</th>
                <th className="text-right py-2 text-slate-400 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {d.endpoints.map((ep, i) => (
                <tr key={`k${i}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2 font-mono text-slate-700 max-w-xs truncate">{ep.endpoint}</td>
                  <td className="py-2 text-right text-slate-600">{ep.requests}</td>
                  <td className="py-2 text-right">
                    <span className={`font-semibold ${ep.avg_ms < 100 ? 'text-emerald-600' : ep.avg_ms < 300 ? 'text-amber-600' : 'text-red-600'}`}>
                      {ep.avg_ms}
                    </span>
                  </td>
                  <td className="py-2 text-right text-slate-500">{ep.max_ms}</td>
                  <td className="py-2 text-right">
                    <span className={ep.error_rate > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}>{ep.error_rate}%</span>
                  </td>
                </tr>
              ))}
              {d.endpoints.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-slate-400">No endpoint data yet. Interact with the app to generate metrics.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
