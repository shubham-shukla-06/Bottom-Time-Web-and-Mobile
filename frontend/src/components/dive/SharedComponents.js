import { HelpCircle, X } from 'lucide-react';
import { HelpTip } from '../DiveEducation';

export const TYPE_COLORS = {
  reef: '#10b981', wreck: '#f59e0b', night: '#6366f1', cave: '#64748b',
  drift: '#06b6d4', deep: '#3b82f6', shore: '#22c55e', boat: '#0ea5e9',
  recreational: '#0e7490', other: '#94a3b8',
};

export const TOOLTIP_STYLE = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
  fontSize: 11, color: '#334155', padding: '6px 10px',
};

export function StatTile({ label, value, icon: Icon, subtitle, helpKey }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-2.5 sm:p-3.5 hover:shadow-sm transition-shadow" data-testid="stat-tile">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-cyan-500" />
        <span className="text-[8px] sm:text-[9px] text-slate-400 uppercase tracking-wider font-bold truncate">{label}</span>
        {helpKey && <HelpTip termKey={helpKey} size={9} />}
      </div>
      <div className="text-base sm:text-lg font-black text-slate-900">{value}</div>
      {subtitle && <p className="text-[8px] text-slate-300 mt-0.5 hidden sm:block">{subtitle}</p>}
    </div>
  );
}

export function RecordCard({ title, value, site, date, color }) {
  const bg = { blue: 'bg-blue-50 border-blue-100', violet: 'bg-violet-50 border-violet-100', cyan: 'bg-cyan-50 border-cyan-100' };
  const txt = { blue: 'text-blue-600', violet: 'text-violet-600', cyan: 'text-cyan-600' };
  return (
    <div className={`${bg[color]} border rounded-2xl p-3 sm:p-4`} data-testid="record-card">
      <p className="text-[8px] sm:text-[9px] text-slate-400 uppercase tracking-wider font-bold">{title}</p>
      <p className={`text-xl sm:text-2xl font-black ${txt[color]}`}>{value}</p>
      <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">{site} &middot; {date?.slice(0, 10)}</p>
    </div>
  );
}

export function ChartCard({ title, children, testId, subtitle }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid={testId}>
      <p className="text-xs font-bold text-slate-700 mb-0.5">{title}</p>
      {subtitle && <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

export function MiniStat({ label, value }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-2.5 sm:p-3.5 text-center hover:shadow-sm transition-shadow">
      <p className="text-[8px] sm:text-[9px] text-slate-400 uppercase tracking-wider font-bold truncate mb-1">{label}</p>
      <p className="text-base sm:text-lg font-black text-slate-900">{value}</p>
    </div>
  );
}

export function QRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-bold text-slate-700">{value}</span>
    </div>
  );
}

export function Row({ label, value, warn, bold, helpKey }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400 flex items-center gap-0.5">{label}{helpKey && <HelpTip termKey={helpKey} size={10} />}</span>
      <span className={`font-semibold ${warn ? 'text-red-500' : bold ? 'font-black text-slate-900' : 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

export function MetricTile({ label, value, unit, ok, helpKey }) {
  return (
    <div className={`border rounded-xl p-3 text-center ${ok === false ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
      <p className="text-[9px] text-slate-400 uppercase font-bold flex items-center justify-center gap-0.5">
        {label}{helpKey && <HelpTip termKey={helpKey} size={10} />}
      </p>
      <p className={`text-xl font-black ${ok === false ? 'text-red-600' : 'text-slate-900'}`}>
        {value}<span className="text-xs text-slate-400 font-normal ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

export function Pill({ ok, label }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? '\u2713' : '\u2717'} {label}
    </span>
  );
}

export function EmptyChart() {
  return <div className="h-[180px] flex items-center justify-center text-slate-400 text-xs">Log some dives to see charts</div>;
}

export function ContextHelp({ show, onDismiss, onShow, title, text }) {
  if (!show) {
    return (
      <button onClick={onShow} className="text-xs text-cyan-500 font-semibold flex items-center gap-1.5 hover:text-cyan-600 mb-2 transition-colors" data-testid="show-help-btn">
        <HelpCircle size={14} /> What am I looking at?
      </button>
    );
  }
  return (
    <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4 sm:p-5 relative mb-1" data-testid="context-help">
      <button onClick={onDismiss} className="absolute top-3 right-3 text-cyan-400 hover:text-cyan-600 transition-colors"><X size={14} /></button>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
          <HelpCircle size={16} className="text-cyan-600" />
        </div>
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-slate-800 mb-1">{title}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}
