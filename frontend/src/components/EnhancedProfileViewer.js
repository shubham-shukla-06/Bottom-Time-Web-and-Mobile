import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Line } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, Shield, X, HelpCircle, ChevronDown } from 'lucide-react';

const TT = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, color: '#334155', padding: '8px 12px' };

// Inline explanations shown directly under each layer tab
const LAYER_EXPLAIN = {
  depth: {
    title: 'Depth Profile',
    desc: 'This chart shows how deep you went during the dive. The line goes DOWN as you descend deeper — just like sinking in the ocean. The flat part at the bottom is where you spent most of your time. The rise at the end is you coming back up to the surface.',
    legend: [
      { color: '#0891b2', label: 'Your depth', desc: 'The teal line traces your actual depth throughout the dive' },
      { color: '#f59e0b', label: 'Gas switch', desc: 'Dashed yellow lines mark where you changed your breathing gas (if applicable)', dashed: true },
    ],
  },
  ppo2: {
    title: 'Oxygen & Nitrogen Pressure',
    desc: 'As you go deeper, the gases you breathe become more concentrated. This chart tracks that. pO2 (oxygen pressure) must stay below 1.4 bar — above that, oxygen becomes toxic and can cause seizures. pN2 (nitrogen pressure) is what causes "the bends" if you surface too fast.',
    legend: [
      { color: '#f59e0b', label: 'pO2 — Oxygen pressure', desc: 'Should stay below the red 1.4 bar limit line' },
      { color: '#6366f1', label: 'pN2 — Nitrogen pressure', desc: 'Higher = more nitrogen dissolving in your body', dashed: true },
      { color: '#ef4444', label: '1.4 bar safety limit', desc: 'Crossing this means oxygen toxicity risk — ascend immediately', dashed: true },
    ],
  },
  ascent: {
    title: 'Ascent Rate — How Fast You Came Up',
    desc: 'Coming up too fast is the #1 cause of decompression sickness ("the bends"). This chart shows your speed going up. The safe limit is 9 metres per minute — roughly the speed of your smallest exhaled bubbles. Faster than 18m/min is dangerous.',
    legend: [
      { color: '#8b5cf6', label: 'Your ascent speed', desc: 'Peaks show moments you were rising' },
      { color: '#22c55e', label: 'Safe limit — 9 m/min', desc: 'Stay below this green line', dashed: true },
      { color: '#ef4444', label: 'Danger zone — 18 m/min', desc: 'Above this red line = high risk of DCS', dashed: true },
    ],
  },
  ceiling: {
    title: 'Decompression Ceiling',
    desc: 'The "ceiling" is the shallowest depth your body says you\'re allowed to go. If this line appears above zero, it means you MUST do a decompression stop — you can\'t go straight to the surface safely. For recreational divers, this should always be at zero (no deco required).',
    legend: [
      { color: '#0891b2', label: 'Your depth', desc: 'Where you actually were' },
      { color: '#ef4444', label: 'Deco ceiling', desc: 'The red zone means you must stop at this depth before going shallower' },
    ],
  },
};

export default function EnhancedProfileViewer({ dive, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState('depth');
  const [showExplain, setShowExplain] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.post(`/dive-log/${dive.id}/analyze-profile`);
        setAnalysis(res.data.analysis);
      } catch (e) { toast.error('Profile analysis failed'); }
      finally { setLoading(false); }
    })();
  }, [dive.id]);

  const data = useMemo(() => {
    if (!analysis) return [];
    const step = Math.max(1, Math.floor(analysis.length / 200));
    return analysis.filter((_, i) => i % step === 0);
  }, [analysis]);

  const hasWarnings = data.some(d => d.rate_status === 'danger' || d.rate_status === 'warning');
  const maxCeiling = Math.max(0, ...data.map(d => d.ceiling || 0));
  const maxPpo2 = Math.max(0, ...data.map(d => d.ppo2 || 0));
  const explain = LAYER_EXPLAIN[layer];

  const LAYERS = [
    { key: 'depth', label: 'Depth' },
    { key: 'ppo2', label: 'Oxygen & Nitrogen' },
    { key: 'ascent', label: 'Ascent Speed' },
    { key: 'ceiling', label: 'Deco Ceiling' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" data-testid="enhanced-profile-viewer">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-lg text-slate-900 truncate">{dive.site_name || 'Dive Profile'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{dive.location} &middot; {dive.date?.slice(0, 10)}{dive.computer_model ? ` &middot; ${dive.computer_model}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {/* Key stats — big and readable */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 border-b border-slate-100">
          <StatBox label="Max Depth" value={`${dive.max_depth}m`} sub="Deepest point reached" warn={false} />
          <StatBox label="Duration" value={`${dive.duration} min`} sub="Total time underwater" />
          <StatBox label="Water Temp" value={dive.water_temp != null ? `${dive.water_temp}°C` : '—'} sub="Temperature at depth" />
          <StatBox label="Safety" value={
            !hasWarnings && maxPpo2 <= 1.4 && maxCeiling === 0 ? 'All Good' :
            maxPpo2 > 1.4 ? 'pO2 High!' : hasWarnings ? 'Fast Ascent' : maxCeiling > 0 ? 'Deco Required' : 'OK'
          } sub={!hasWarnings && maxPpo2 <= 1.4 ? 'No issues detected' : 'Tap layers below to investigate'}
            warn={hasWarnings || maxPpo2 > 1.4 || maxCeiling > 0} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Layer tabs */}
          <div className="flex gap-1 px-4 sm:px-6 pt-3 pb-2 overflow-x-auto">
            {LAYERS.map(l => (
              <button key={l.key} onClick={() => { setLayer(l.key); setShowExplain(true); }}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${layer === l.key ? 'bg-cyan-400 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                data-testid={`layer-${l.key}`}>
                {l.label}
              </button>
            ))}
          </div>

          {/* Inline explanation — shows automatically when switching layers */}
          {showExplain && explain && (
            <div className="mx-4 sm:mx-6 mb-3 bg-cyan-50 border border-cyan-200 rounded-xl p-3 sm:p-4 relative" data-testid="layer-explanation">
              <button onClick={() => setShowExplain(false)} className="absolute top-2 right-2 text-cyan-400 hover:text-cyan-600"><X size={14} /></button>
              <p className="text-sm font-bold text-slate-800 mb-1 pr-6">{explain.title}</p>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">{explain.desc}</p>
              <div className="space-y-1.5">
                {explain.legend.map((item, i) => (
                  <div key={`k${i}`} className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-1.5">
                      {item.dashed ? (
                        <div className="w-5 h-0 border-t-2 border-dashed" style={{ borderColor: item.color }} />
                      ) : (
                        <div className="w-5 h-1.5 rounded-full" style={{ background: item.color }} />
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                      <span className="text-xs text-slate-500"> — {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!showExplain && (
            <button onClick={() => setShowExplain(true)} className="mx-4 sm:mx-6 mb-2 text-[11px] text-cyan-500 font-semibold flex items-center gap-1 hover:text-cyan-600">
              <HelpCircle size={12} /> What am I looking at?
            </button>
          )}

          {/* Chart */}
          <div className="px-2 sm:px-4">
            {loading ? (
              <div className="py-16"><div className="skeleton-shimmer rounded-xl bg-slate-200/70 w-full h-[300px]" /></div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time_seconds" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false}
                    tickFormatter={(v) => v != null ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : ''}
                    label={{ value: 'Time (min:sec)', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 10 }} />

                  <YAxis yAxisId="depth" reversed tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} unit="m"
                    label={{ value: 'Depth (metres)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }} />

                  {layer === 'depth' && (
                    <>
                      <defs><linearGradient id="depthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.2} /><stop offset="95%" stopColor="#0891b2" stopOpacity={0.02} /></linearGradient></defs>
                      <Area yAxisId="depth" type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={2.5} fill="url(#depthFill)" dot={false} />
                      {(dive.gas_switches || []).map((gs, i) => (
                        <ReferenceLine key={`gs-${gs.time_seconds}`} yAxisId="depth" x={gs.time_seconds} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: gs.gas_mix, fontSize: 10, fill: '#f59e0b' }} />
                      ))}
                    </>
                  )}

                  {layer === 'ppo2' && (
                    <>
                      <YAxis yAxisId="pp" orientation="right" tick={{ fontSize: 10, fill: '#f59e0b' }} axisLine={false} unit=" bar"
                        label={{ value: 'Pressure (bar)', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 10 }} />
                      <Area yAxisId="depth" type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={1} fill="none" dot={false} opacity={0.2} />
                      <Line yAxisId="pp" type="monotone" dataKey="ppo2" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="pO2" />
                      <Line yAxisId="pp" type="monotone" dataKey="ppn2" stroke="#6366f1" strokeWidth={2} dot={false} name="pN2" strokeDasharray="5 3" />
                      <ReferenceLine yAxisId="pp" y={1.4} stroke="#ef4444" strokeWidth={2} strokeDasharray="8 4" label={{ value: 'DANGER: 1.4 bar', fontSize: 10, fill: '#ef4444', fontWeight: 700 }} />
                    </>
                  )}

                  {layer === 'ascent' && (
                    <>
                      <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: '#8b5cf6' }} axisLine={false} unit=" m/m"
                        label={{ value: 'Speed (m/min)', angle: 90, position: 'insideRight', fill: '#8b5cf6', fontSize: 10 }} />
                      <Area yAxisId="depth" type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={1} fill="none" dot={false} opacity={0.2} />
                      <Line yAxisId="rate" type="monotone" dataKey="ascent_rate" stroke="#8b5cf6" strokeWidth={2.5} dot={false} name="Rate" />
                      <ReferenceLine yAxisId="rate" y={9} stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'SAFE: 9 m/min', fontSize: 10, fill: '#22c55e', fontWeight: 700 }} />
                      <ReferenceLine yAxisId="rate" y={18} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'DANGER: 18 m/min', fontSize: 10, fill: '#ef4444', fontWeight: 700 }} />
                    </>
                  )}

                  {layer === 'ceiling' && (
                    <>
                      <defs><linearGradient id="depthFill2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.2} /><stop offset="95%" stopColor="#0891b2" stopOpacity={0.02} /></linearGradient></defs>
                      <Area yAxisId="depth" type="monotone" dataKey="depth" stroke="#0891b2" strokeWidth={2.5} fill="url(#depthFill2)" dot={false} />
                      <Area yAxisId="depth" type="monotone" dataKey="ceiling" stroke="#ef4444" strokeWidth={2} fill="#ef444420" dot={false} name="Ceiling" />
                    </>
                  )}

                  <Tooltip contentStyle={TT} formatter={(v, name) => {
                    if (name === 'depth') return [`${v}m`, 'Depth'];
                    if (name === 'ppo2') return [`${v} bar`, 'Oxygen Pressure (pO2)'];
                    if (name === 'ppn2') return [`${v} bar`, 'Nitrogen Pressure (pN2)'];
                    if (name === 'ascent_rate') return [`${v} m/min`, 'Ascent Speed'];
                    if (name === 'ceiling') return [`${v}m`, 'Deco Ceiling'];
                    return [v, name];
                  }} labelFormatter={(v) => v != null ? `Time: ${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : ''} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, warn }) {
  return (
    <div className={`bg-white px-4 py-3 ${warn ? 'bg-red-50' : ''}`}>
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-black ${warn ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}
