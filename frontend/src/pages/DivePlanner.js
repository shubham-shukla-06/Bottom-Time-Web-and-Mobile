import { useState, useEffect, useMemo } from 'react';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Waves, AlertTriangle, CheckCircle, Gauge, Wind, Droplets, Clock, ArrowDown, Shield, Activity, Settings, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, RadialBarChart, RadialBar } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';

const TT = { background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 12, fontSize: 11, color: '#fff', padding: '8px 12px' };

const GAS_PRESETS = [
  { label: 'Air', fo2: 0.21 },
  { label: 'EAN28', fo2: 0.28 },
  { label: 'EAN32', fo2: 0.32 },
  { label: 'EAN36', fo2: 0.36 },
  { label: 'EAN40', fo2: 0.40 },
  { label: 'EAN50', fo2: 0.50 },
  { label: 'O2', fo2: 1.0 },
];

export default function DivePlanner() {
  const user = useAuthStore(s => s.user);
  const openAuth = useUIStore(s => s.openAuth);
  const [depth, setDepth] = useState(18);
  const [fo2, setFo2] = useState(0.21);
  const [plannedTime, setPlannedTime] = useState(45);
  const [tankSize, setTankSize] = useState(12);
  const [sacRate, setSacRate] = useState(15);
  const [gfLow, setGfLow] = useState(30);
  const [gfHigh, setGfHigh] = useState(85);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ndlTable, setNdlTable] = useState([]);

  const calculate = async () => {
    if (!user) { openAuth(); return; }
    setLoading(true);
    try {
      const [planRes, ndlRes] = await Promise.all([
        axios.post('/dive-planner/calculate', { depth, fo2, planned_time: plannedTime, tank_size: tankSize, sac_rate: sacRate, gf_low: gfLow, gf_high: gfHigh }),
        axios.get(`/dive-planner/ndl-table?fo2=${fo2}&gf=${gfHigh}`),
      ]);
      setPlan(planRes.data);
      setNdlTable(ndlRes.data.table);
    } catch (e) { toast.error('Calculation failed'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) calculate();
  }, [depth, fo2, plannedTime, tankSize, sacRate, gfLow, gfHigh]);

  const gasLabel = useMemo(() => fo2 === 0.21 ? 'Air' : `EAN${Math.round(fo2 * 100)}`, [fo2]);
  const filteredNdl = useMemo(() => ndlTable.filter(r => r.within_mod), [ndlTable]);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Waves className="text-cyan-500 mx-auto mb-4" size={48} />
            <h1 className="text-2xl font-bold mb-2">Dive Planner</h1>
            <p className="text-slate-400 mb-4">Plan your dives safely with Bühlmann ZH-L16C algorithm</p>
            <button onClick={() => openAuth()} className="px-6 py-3 bg-cyan-500 rounded-xl font-bold hover:bg-cyan-400">Sign in to plan</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 md:px-12 py-8" data-testid="dive-planner-page">
        <div className="mb-6">
          <p className="text-cyan-400 text-xs font-bold uppercase tracking-widest mb-1">Dive Planner</p>
          <h1 className="text-3xl font-black tracking-tight">Plan Your Dive</h1>
          <p className="text-slate-500 text-sm mt-1">Bühlmann ZH-L16C decompression model</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: Controls */}
          <div className="flex flex-col gap-5">
            {/* Depth Slider */}
            <ControlBox>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Planned Depth</label>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-cyan-400">{depth}</span>
                <span className="text-lg text-slate-500">meters</span>
              </div>
              <input type="range" min={3} max={60} value={depth} onChange={e => setDepth(+e.target.value)}
                className="w-full mt-3 range-cyan" style={{ '--val': `${((depth - 3) / 57) * 100}%` }} data-testid="depth-slider" />
              <div className="flex justify-between text-[9px] text-slate-600 mt-1"><span>3m</span><span>60m</span></div>
            </ControlBox>

            {/* Bottom Time */}
            <ControlBox>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Bottom Time</label>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-violet-400">{plannedTime}</span>
                <span className="text-lg text-slate-500">min</span>
              </div>
              <input type="range" min={5} max={120} value={plannedTime} onChange={e => setPlannedTime(+e.target.value)}
                className="w-full mt-3 range-violet" style={{ '--val': `${((plannedTime - 5) / 115) * 100}%` }} data-testid="time-slider" />
            </ControlBox>

            {/* Gas Mix */}
            <ControlBox>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Gas Mix</label>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {GAS_PRESETS.map(g => (
                  <button key={g.label} onClick={() => setFo2(g.fo2)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${fo2 === g.fo2 ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    data-testid={`gas-${g.label}`}>
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-xs text-slate-400">O2%:</span>
                <input type="number" min={21} max={100} value={Math.round(fo2 * 100)} onChange={e => setFo2(Math.min(1, Math.max(0.21, e.target.value / 100)))}
                  className="w-16 bg-slate-800 border border-slate-700 rounded-lg text-center text-sm font-bold py-1 outline-none focus:border-cyan-500" data-testid="fo2-input" />
              </div>
            </ControlBox>

            {/* Advanced Settings */}
            <ControlBox>
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center justify-between w-full" data-testid="advanced-toggle">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5"><Settings size={12} /> Advanced</span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {showAdvanced && (
                <div className="flex flex-col gap-3 mt-3 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1">Tank Size (L)</label>
                      <input type="number" value={tankSize} onChange={e => setTankSize(+e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold py-1.5 px-2 outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1">SAC (L/min)</label>
                      <input type="number" value={sacRate} onChange={e => setSacRate(+e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold py-1.5 px-2 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1">GF Low (%)</label>
                      <input type="range" min={15} max={100} value={gfLow} onChange={e => setGfLow(+e.target.value)}
                        className="w-full range-amber" style={{ '--val': `${((gfLow - 15) / 85) * 100}%` }} />
                      <span className="text-xs font-bold text-amber-400">{gfLow}%</span>
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1">GF High (%)</label>
                      <input type="range" min={50} max={100} value={gfHigh} onChange={e => setGfHigh(+e.target.value)}
                        className="w-full range-amber" style={{ '--val': `${((gfHigh - 50) / 50) * 100}%` }} />
                      <span className="text-xs font-bold text-amber-400">{gfHigh}%</span>
                    </div>
                  </div>
                </div>
              )}
            </ControlBox>
          </div>

          {/* CENTER + RIGHT: Results */}
          {plan && (
            <div className="lg:col-span-2 space-y-5">
              {/* Safety Status Banner */}
              <div className={`rounded-2xl p-4 border flex items-center gap-4 ${plan.safety.all_ok ? 'bg-emerald-500/10 border-emerald-800' : 'bg-red-500/10 border-red-800'}`} data-testid="safety-banner">
                {plan.safety.all_ok ? <CheckCircle size={24} className="text-emerald-400" /> : <AlertTriangle size={24} className="text-red-400" />}
                <div>
                  <p className={`font-bold text-sm ${plan.safety.all_ok ? 'text-emerald-300' : 'text-red-300'}`}>
                    {plan.safety.all_ok ? 'Dive Plan is Safe' : 'Warning: Check Plan'}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs">
                    <StatusPill ok={plan.deco.within_ndl} label={`NDL: ${plan.deco.ndl}min`} />
                    <StatusPill ok={plan.safety.depth_ok} label={`MOD: ${plan.gas.mod}m`} />
                    <StatusPill ok={plan.safety.gas_ok} label={`Gas: ${plan.gas.gas_needed}L`} />
                    <StatusPill ok={plan.safety.cns_ok} label={`CNS: ${plan.safety.cns_percent}%`} />
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="NDL" value={`${plan.deco.ndl}`} unit="min" color={plan.deco.within_ndl ? 'cyan' : 'red'} icon={Clock} />
                <MetricCard label="Total Time" value={`${plan.plan.total_time}`} unit="min" color="violet" icon={Clock} />
                <MetricCard label="pO2" value={`${plan.gas.ppo2}`} unit="bar" color={plan.gas.ppo2 <= 1.4 ? 'cyan' : 'red'} icon={Wind} />
                <MetricCard label="CNS" value={`${plan.safety.cns_percent}`} unit="%" color={plan.safety.cns_ok ? 'emerald' : 'red'} icon={Shield} />
              </div>

              {/* Gas & Deco Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Gas Info */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5" data-testid="gas-info">
                  <p className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2"><Droplets size={14} className="text-cyan-400" /> Gas Analysis</p>
                  <div className="flex flex-col gap-2.5">
                    <InfoRow label="Gas Mix" value={plan.gas.mix} />
                    <InfoRow label="fO2" value={`${(plan.gas.fo2 * 100).toFixed(0)}%`} />
                    <InfoRow label="MOD (pO2 1.4)" value={`${plan.gas.mod}m`} warn={!plan.safety.depth_ok} />
                    <InfoRow label="EAD" value={`${plan.gas.ead}m`} />
                    <InfoRow label="pO2" value={`${plan.gas.ppo2} bar`} warn={plan.gas.ppo2 > 1.4} />
                    <InfoRow label="pN2" value={`${plan.gas.ppn2} bar`} />
                    <div className="border-t border-slate-800 pt-2 mt-2">
                      <InfoRow label="Gas Needed" value={`${plan.gas.gas_needed}L`} warn={!plan.safety.gas_ok} />
                      <InfoRow label="Gas Available" value={`${plan.gas.gas_available}L`} />
                      <InfoRow label="SAC Rate" value={`${plan.gas.sac_rate} L/min`} />
                    </div>
                  </div>
                </div>

                {/* Deco Info */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5" data-testid="deco-info">
                  <p className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2"><Activity size={14} className="text-violet-400" /> Dive Plan</p>
                  <div className="flex flex-col gap-2.5">
                    <InfoRow label="Bottom Time" value={`${plan.plan.planned_time} min`} />
                    <InfoRow label="Ascent Time" value={`${plan.plan.ascent_time} min`} />
                    <InfoRow label="Safety Stop" value={plan.plan.safety_stop_min > 0 ? `${plan.plan.safety_stop_min} min @ 5m` : 'Not required'} />
                    <InfoRow label="Total Dive Time" value={`${plan.plan.total_time} min`} bold />
                    <div className="border-t border-slate-800 pt-2 mt-2">
                      <InfoRow label="NDL" value={`${plan.deco.ndl} min`} warn={!plan.deco.within_ndl} />
                      <InfoRow label="GF" value={`${plan.deco.gf_low}/${plan.deco.gf_high}`} />
                      <InfoRow label="CNS" value={`${plan.safety.cns_percent}%`} warn={!plan.safety.cns_ok} />
                      <InfoRow label="OTU" value={`${plan.safety.otu}`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tissue Saturation */}
              {plan.tissues && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5" data-testid="tissue-saturation">
                  <p className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2"><Gauge size={14} className="text-amber-400" /> Tissue Compartment Loading</p>
                  <div className="flex flex-col gap-1.5">
                    {plan.tissues.map(t => (
                      <div key={t.compartment} className="flex items-center gap-3">
                        <span className="text-[9px] text-slate-500 w-6 text-right">T{t.compartment}</span>
                        <span className="text-[8px] text-slate-600 w-12">{t.half_time}m</span>
                        <div className="flex-1 h-3.5 bg-slate-800 rounded-full overflow-hidden relative">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(t.saturation_pct, 100)}%`,
                              background: t.saturation_pct > 90 ? '#ef4444' : t.saturation_pct > 70 ? '#f59e0b' : t.saturation_pct > 50 ? '#06b6d4' : '#0e7490',
                            }} />
                        </div>
                        <span className={`text-[10px] font-bold w-10 text-right ${t.saturation_pct > 90 ? 'text-red-400' : t.saturation_pct > 70 ? 'text-amber-400' : 'text-cyan-400'}`}>
                          {t.saturation_pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-600 mt-2">Bars show N2 loading relative to M-value for each tissue half-time</p>
                </div>
              )}

              {/* NDL Table */}
              {ndlTable.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5" data-testid="ndl-table">
                  <p className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2"><ArrowDown size={14} className="text-blue-400" /> NDL Table — {gasLabel}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {filteredNdl.map(r => (
                      <div key={r.depth}
                        className={`rounded-xl p-2.5 text-center border transition-all ${r.depth === depth ? 'bg-cyan-500/20 border-cyan-600' : 'bg-slate-800/50 border-slate-800 hover:border-slate-700'}`}>
                        <p className="text-lg font-black text-white">{r.depth}m</p>
                        <p className={`text-xs font-bold ${r.ndl > 60 ? 'text-emerald-400' : r.ndl > 20 ? 'text-amber-400' : 'text-red-400'}`}>
                          {r.ndl >= 999 ? 'No Limit' : `${r.ndl} min`}
                        </p>
                        <p className="text-[9px] text-slate-500">pO2: {r.ppo2}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ControlBox({ children }) {
  return <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">{children}</div>;
}

function MetricCard({ label, value, unit, color, icon: Icon }) {
  const colors = { cyan: 'from-cyan-500/20 border-cyan-900/50 text-cyan-400', violet: 'from-violet-500/20 border-violet-900/50 text-violet-400', emerald: 'from-emerald-500/20 border-emerald-900/50 text-emerald-400', red: 'from-red-500/20 border-red-900/50 text-red-400', amber: 'from-amber-500/20 border-amber-900/50 text-amber-400' };
  const c = colors[color] || colors.cyan;
  return (
    <div className={`bg-gradient-to-b ${c} border rounded-2xl p-4`} data-testid={`metric-${label.toLowerCase()}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} />
        <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-white">{value}</span>
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
      {ok ? '\u2713' : '\u2717'} {label}
    </span>
  );
}

function InfoRow({ label, value, warn, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs ${bold ? 'font-black text-white' : 'font-semibold'} ${warn ? 'text-red-400' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}
