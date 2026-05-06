import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Waves, Plus, X, ChevronDown, CheckCircle, AlertTriangle,
  Droplets, Activity, Gauge, Settings as SettingsIcon, ArrowDown, TrendingUp
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { Row, MetricTile, Pill, ContextHelp } from './SharedComponents';

const GAS_PRESETS = [
  { label: 'Air', fo2: 0.21 }, { label: 'EAN28', fo2: 0.28 }, { label: 'EAN32', fo2: 0.32 },
  { label: 'EAN36', fo2: 0.36 }, { label: 'EAN40', fo2: 0.40 },
];

function PlannerTab() {
  const [depth, setDepth] = useState(18);
  const [fo2, setFo2] = useState(0.21);
  const [time, setTime] = useState(40);
  const [tankSize, setTankSize] = useState(12);
  const [sac, setSac] = useState(15);
  const [gfHigh, setGfHigh] = useState(85);
  const [plan, setPlan] = useState(null);
  const [ndlTable, setNdlTable] = useState([]);
  const [showAdv, setShowAdv] = useState(false);
  const [showHelp, setShowHelp] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calculate = useCallback(async () => {
    try {
      const [p, n] = await Promise.all([
        axios.post('/dive-planner/calculate', { depth, fo2, planned_time: time, tank_size: tankSize, sac_rate: sac, gf_low: 30, gf_high: gfHigh }),
        axios.get(`/dive-planner/ndl-table?fo2=${fo2}&gf=${gfHigh}`),
      ]);
      setPlan(p.data);
      setNdlTable(n.data.table);
    } catch (e) { /* silent */ }
  }, [depth, fo2, time, tankSize, sac, gfHigh]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { calculate(); }, [calculate]);

  const gasLabel = fo2 === 0.21 ? 'Air' : `EAN${Math.round(fo2 * 100)}`;
  const filteredNdl = useMemo(() => ndlTable.filter(r => r.within_mod), [ndlTable]);

  return (
    <div className="space-y-5" data-testid="planner-tab">
      <ContextHelp show={showHelp} onDismiss={() => setShowHelp(false)} onShow={() => setShowHelp(true)}
        title="Dive Planner"
        text="Use the sliders on the left to set how deep you want to go and for how long. The planner calculates whether your dive is safe. Green = you're good. Red = you need to change something. Pick your breathing gas (Air is standard, EAN32/36 = Nitrox lets you stay longer but limits depth). Every number has a (?) icon — tap it to learn what it means and why it matters."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Depth</label>
            <div className="flex items-baseline gap-2 mt-1"><span className="text-3xl font-black text-cyan-600">{depth}</span><span className="text-slate-400">m</span></div>
            <input type="range" min={3} max={60} value={depth} onChange={e => setDepth(+e.target.value)} className="w-full mt-2 range-cyan" style={{ '--val': `${((depth - 3) / 57) * 100}%` }} data-testid="depth-slider" />
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Bottom Time</label>
            <div className="flex items-baseline gap-2 mt-1"><span className="text-3xl font-black text-violet-600">{time}</span><span className="text-slate-400">min</span></div>
            <input type="range" min={5} max={120} value={time} onChange={e => setTime(+e.target.value)} className="w-full mt-2 range-violet" style={{ '--val': `${((time - 5) / 115) * 100}%` }} data-testid="time-slider" />
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5">
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Gas Mix</label>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {GAS_PRESETS.map(g => (
                <button key={g.label} onClick={() => setFo2(g.fo2)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${fo2 === g.fo2 ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{g.label}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setShowAdv(!showAdv)} className="text-[10px] text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1 px-1">
            <SettingsIcon size={10} /> Advanced <ChevronDown size={10} className={showAdv ? 'rotate-180' : ''} />
          </button>
          {showAdv && (
            <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] text-slate-400 block mb-1">Tank (L)</label><input type="number" value={tankSize} onChange={e => setTankSize(+e.target.value)} className="input-field text-sm w-full" /></div>
                <div><label className="text-[9px] text-slate-400 block mb-1">SAC (L/min)</label><input type="number" value={sac} onChange={e => setSac(+e.target.value)} className="input-field text-sm w-full" /></div>
              </div>
              <div><label className="text-[9px] text-slate-400 block mb-1">GF High: {gfHigh}%</label><input type="range" min={50} max={100} value={gfHigh} onChange={e => setGfHigh(+e.target.value)} className="w-full range-amber" style={{ '--val': `${((gfHigh - 50) / 50) * 100}%` }} /></div>
            </div>
          )}
        </div>

        {plan && (
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className={`rounded-2xl p-4 border flex items-center gap-3 ${plan.safety.all_ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`} data-testid="safety-banner">
              {plan.safety.all_ok ? <CheckCircle size={20} className="text-emerald-500" /> : <AlertTriangle size={20} className="text-red-500" />}
              <div>
                <p className={`font-bold text-sm ${plan.safety.all_ok ? 'text-emerald-700' : 'text-red-700'}`}>{plan.safety.all_ok ? 'Plan OK' : 'Check Plan'}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <Pill ok={plan.deco.within_ndl} label={`NDL ${plan.deco.ndl}m`} />
                  <Pill ok={plan.safety.depth_ok} label={`MOD ${plan.gas.mod}m`} />
                  <Pill ok={plan.safety.gas_ok} label={`Gas ${plan.gas.gas_needed}L`} />
                  <Pill ok={plan.safety.cns_ok} label={`CNS ${plan.safety.cns_percent}%`} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricTile label="NDL" value={plan.deco.ndl} unit="min" ok={plan.deco.within_ndl} helpKey="ndl" />
              <MetricTile label="Total Time" value={plan.plan.total_time} unit="min" helpKey="duration" />
              <MetricTile label="pO2" value={plan.gas.ppo2} unit="bar" ok={plan.gas.ppo2 <= 1.4} helpKey="ppo2" />
              <MetricTile label="CNS" value={plan.safety.cns_percent} unit="%" ok={plan.safety.cns_ok} helpKey="cns" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="gas-info">
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Droplets size={12} className="text-cyan-500" /> Gas</p>
                <div className="space-y-1.5 text-xs">
                  <Row label="Mix" value={plan.gas.mix} helpKey="nitrox" /><Row label="MOD" value={`${plan.gas.mod}m`} warn={!plan.safety.depth_ok} helpKey="mod" /><Row label="EAD" value={`${plan.gas.ead}m`} helpKey="ead" />
                  <Row label="pO2" value={`${plan.gas.ppo2}`} warn={plan.gas.ppo2 > 1.4} helpKey="ppo2" /><Row label="pN2" value={`${plan.gas.ppn2}`} helpKey="ppn2" />
                  <div className="border-t border-slate-100 pt-1.5 mt-1.5" />
                  <Row label="Gas Needed" value={`${plan.gas.gas_needed}L`} warn={!plan.safety.gas_ok} /><Row label="Available" value={`${plan.gas.gas_available}L`} />
                </div>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="dive-plan-info">
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Activity size={12} className="text-violet-500" /> Plan</p>
                <div className="space-y-1.5 text-xs">
                  <Row label="Bottom Time" value={`${plan.plan.planned_time}min`} /><Row label="Ascent" value={`${plan.plan.ascent_time}min`} />
                  <Row label="Safety Stop" value={plan.plan.safety_stop_min > 0 ? `${plan.plan.safety_stop_min}min @ 5m` : 'N/A'} />
                  <Row label="Total" value={`${plan.plan.total_time}min`} bold />
                  <div className="border-t border-slate-100 pt-1.5 mt-1.5" />
                  <Row label="NDL" value={`${plan.deco.ndl}min`} warn={!plan.deco.within_ndl} helpKey="ndl" /><Row label="GF" value={`${plan.deco.gf_low}/${plan.deco.gf_high}`} helpKey="gf" />
                  <Row label="CNS" value={`${plan.safety.cns_percent}%`} warn={!plan.safety.cns_ok} helpKey="cns" /><Row label="OTU" value={plan.safety.otu} helpKey="otu" />
                </div>
              </div>
            </div>

            {plan.tissues && (
              <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="tissues">
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Gauge size={12} className="text-amber-500" /> Tissue Loading</p>
                <div className="space-y-1">
                  {plan.tissues.map(t => (
                    <div key={t.compartment} className="flex items-center gap-2">
                      <span className="text-[8px] text-slate-400 w-5 text-right">T{t.compartment}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(t.saturation_pct, 100)}%`, background: t.saturation_pct > 90 ? '#ef4444' : t.saturation_pct > 70 ? '#f59e0b' : '#0e7490' }} />
                      </div>
                      <span className={`text-[9px] font-bold w-8 text-right ${t.saturation_pct > 90 ? 'text-red-500' : t.saturation_pct > 70 ? 'text-amber-500' : 'text-cyan-600'}`}>{t.saturation_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="ndl-table">
              <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><ArrowDown size={12} className="text-blue-500" /> NDL Table — {gasLabel}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {filteredNdl.map(r => (
                  <div key={r.depth} className={`rounded-xl p-2 text-center border ${r.depth === depth ? 'bg-cyan-50 border-cyan-300' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-sm font-black text-slate-800">{r.depth}m</p>
                    <p className={`text-[10px] font-bold ${r.ndl > 60 ? 'text-emerald-500' : r.ndl > 20 ? 'text-amber-500' : 'text-red-500'}`}>{r.ndl >= 999 ? 'No Limit' : `${r.ndl}min`}</p>
                  </div>
                ))}
              </div>
            </div>

            <RepetitivePlanner fo2={fo2} gfHigh={gfHigh} />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PlannerTab);

function RepetitivePlanner({ fo2, gfHigh }) {
  const [dives, setDives] = useState([
    { depth: 18, duration: 40, fo2: fo2, surface_interval: 0 },
    { depth: 12, duration: 50, fo2: fo2, surface_interval: 60 },
  ]);
  const [result, setResult] = useState(null);

  const updateDive = (idx, field, value) => {
    const d = [...dives];
    d[idx] = { ...d[idx], [field]: value };
    setDives(d);
  };

  const calculate = async () => {
    try {
      const res = await axios.post('/dive-planner/repetitive', { dives, gf_high: gfHigh });
      setResult(res.data);
    } catch (e) { toast.error('Calculation failed'); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { calculate(); }, [dives, gfHigh]);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="repetitive-planner">
      <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5"><TrendingUp size={12} className="text-violet-500" /> Repetitive Dive Planner</p>
      <p className="text-[10px] text-slate-400 mb-3">Plan multiple dives with surface intervals. Tissue off-gassing is calculated between dives.</p>
      <div className="space-y-2 mb-3">
        {dives.map((d, i) => (
          <div key={`k${i}`} className="bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-cyan-600 w-8">#{i + 1}</span>
            <label className="flex items-center gap-1 text-[11px] text-slate-500"><span>Depth</span><input type="number" value={d.depth} onChange={e => updateDive(i, 'depth', +e.target.value)} className="w-14 bg-white border border-slate-200 rounded-lg text-xs py-1 px-2 text-center font-bold outline-none focus:border-cyan-400" />m</label>
            <label className="flex items-center gap-1 text-[11px] text-slate-500"><span>Time</span><input type="number" value={d.duration} onChange={e => updateDive(i, 'duration', +e.target.value)} className="w-14 bg-white border border-slate-200 rounded-lg text-xs py-1 px-2 text-center font-bold outline-none focus:border-cyan-400" />min</label>
            {i > 0 && <label className="flex items-center gap-1 text-[11px] text-slate-500"><span>SI</span><input type="number" value={d.surface_interval} onChange={e => updateDive(i, 'surface_interval', +e.target.value)} className="w-14 bg-white border border-slate-200 rounded-lg text-xs py-1 px-2 text-center font-bold outline-none focus:border-cyan-400" />min</label>}
            {dives.length > 2 && (
              <button onClick={() => setDives(dives.filter((_, j) => j !== i))} className="ml-auto px-2 py-1 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg text-[10px] font-semibold flex items-center gap-0.5" data-testid={`remove-dive-${i}`}>
                <X size={10} /> Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => setDives([...dives, { depth: 12, duration: 30, fo2, surface_interval: 60 }])}
        className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-cyan-600 hover:border-cyan-300 hover:bg-cyan-50/30 flex items-center justify-center gap-1.5 transition-colors" data-testid="add-dive-btn">
        <Plus size={14} /> Add Dive
      </button>
      {result && (
        <div className="space-y-1.5 mt-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Results</p>
          {result.dives.map(d => (
            <div key={d.dive_number} className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between flex-wrap gap-1 ${d.within_ndl ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
              <span className="font-bold text-slate-700">Dive {d.dive_number}: {d.depth}m / {d.duration}min</span>
              <div className="flex gap-3 text-[11px]">
                <span className={`font-semibold ${d.within_ndl ? 'text-emerald-600' : 'text-red-600'}`}>NDL {d.ndl}min</span>
                <span className="text-slate-500">CNS {d.cns_percent}%</span>
                <span className="text-slate-500">Tissue {d.max_tissue_loading}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
