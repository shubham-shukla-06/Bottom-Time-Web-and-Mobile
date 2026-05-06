import { useState, useMemo } from 'react';
import { Info, Filter, ChevronDown, ChevronUp, X } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { SECTION_DESC, METRIC_TIPS, PIE_COLORS, TT_STYLE, TICK_SM } from './constants';

export function SectionHeader({ title, sub, sectionKey }) {
  return (
    <div className="mb-1" data-testid={`section-header-${sectionKey}`}>
      <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {!sub && SECTION_DESC[sectionKey] && <p className="text-xs text-slate-500 mt-0.5">{SECTION_DESC[sectionKey]}</p>}
    </div>
  );
}

export function InfoTip({ label }) {
  const tip = METRIC_TIPS[label];
  if (!tip) return null;
  return (
    <span className="group relative inline-flex ml-1 cursor-help" data-testid={`info-tip-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <Info size={10} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-slate-900 text-white text-[9px] rounded-md whitespace-nowrap max-w-[220px] text-wrap z-50 shadow-lg">{tip}</span>
    </span>
  );
}

export function Tile({ label, value, icon: Icon, color }) {
  const colors = { cyan: 'bg-cyan-50 text-cyan-700', slate: 'bg-slate-50 text-slate-700', red: 'bg-red-50 text-red-700' };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start gap-3 hover:shadow-sm transition-shadow" data-testid={`tile-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color] || colors.cyan}`}><Icon size={15} /></div>
      <div className="min-w-0"><p className="text-[10px] text-slate-500 font-medium flex items-center">{label}<InfoTip label={label} /></p><p className="text-base font-bold text-slate-900 truncate">{value ?? '—'}</p></div>
    </div>
  );
}

export function MiniStat({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-slate-500 flex items-center">{label}<InfoTip label={label} /></span>
      <span className="text-xs font-bold text-slate-800">{value ?? '—'}</span>
    </div>
  );
}

export function Card({ title, icon: Icon, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3"><Icon size={14} className="text-slate-400" /><span className="text-xs font-bold text-slate-800">{title}</span></div>
      {children}
    </div>
  );
}

export function ChartCard({ title, sub, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-800 mb-0.5">{title}</p>
      {sub && <p className="text-[10px] text-slate-400 mb-3">{sub}</p>}
      {children}
    </div>
  );
}

export function SortableTable({ data, columns, testId }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [filterText, setFilterText] = useState('');
  const [colFilters, setColFilters] = useState({});
  const [showColFilters, setShowColFilters] = useState(false);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const setColFilter = (key, val) => setColFilters(p => ({ ...p, [key]: val }));

  const sortableColumns = useMemo(() => columns.filter(c => c.sortable !== false), [columns]);

  const colUniqueVals = useMemo(() => {
    const vals = {};
    columns.forEach(c => {
      if (c.sortable === false) return;
      const unique = [...new Set((data || []).map(r => String(r[c.key] ?? '')))].filter(Boolean).sort();
      if (unique.length <= 30 && unique.length > 1) vals[c.key] = unique;
    });
    return vals;
  }, [data, columns]);

  const sorted = useMemo(() => {
    let rows = [...(data || [])];
    if (filterText) {
      const q = filterText.toLowerCase();
      rows = rows.filter(r => columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
    }
    Object.entries(colFilters).forEach(([key, val]) => {
      if (val) rows = rows.filter(r => String(r[key] ?? '').toLowerCase().includes(val.toLowerCase()));
    });
    if (sortKey) {
      rows.sort((a, b) => {
        let va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
        if (typeof va === 'string') va = va.replace(/[$,%]/g, '');
        if (typeof vb === 'string') vb = vb.replace(/[$,%]/g, '');
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na;
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return rows;
  }, [data, columns, sortKey, sortDir, filterText, colFilters]);

  const activeFilterCount = Object.values(colFilters).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-2.5 top-2 text-slate-400" size={12} />
          <input placeholder="Filter all columns..." className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg pl-7 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-400" value={filterText} onChange={e => setFilterText(e.target.value)} data-testid="table-filter" />
        </div>
        <button onClick={() => setShowColFilters(!showColFilters)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${showColFilters || activeFilterCount > 0 ? 'bg-cyan-50 border-cyan-200 text-cyan-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          data-testid="toggle-col-filters">
          <Filter size={10} /> Columns {activeFilterCount > 0 && <span className="bg-cyan-400 text-white px-1 rounded text-[8px]">{activeFilterCount}</span>}
        </button>
        {activeFilterCount > 0 && <button onClick={() => setColFilters({})} className="text-[10px] text-red-500 hover:text-red-700 font-semibold" data-testid="clear-col-filters">Clear</button>}
        <span className="text-[10px] text-slate-400">{sorted.length} rows</span>
      </div>
      {showColFilters && (
        <div className="flex gap-1.5 mb-2 flex-wrap" data-testid="col-filters-row">
          {sortableColumns.map(c => (
            <div key={c.key}>
              {colUniqueVals[c.key] ? (
                <select value={colFilters[c.key] || ''} onChange={e => setColFilter(c.key, e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-[10px] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-400 min-w-[80px]" data-testid={`col-filter-${c.key}`}>
                  <option value="">{c.label}: All</option>
                  {colUniqueVals[c.key].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input placeholder={c.label} value={colFilters[c.key] || ''} onChange={e => setColFilter(c.key, e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-[10px] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-400 w-[80px] placeholder:text-slate-400" data-testid={`col-filter-${c.key}`} />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid={testId}>
          <thead><tr className="border-b border-slate-100 bg-slate-50">
            {columns.map(c => (
              <th key={c.key} onClick={() => c.sortable !== false && handleSort(c.key)}
                className={`text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[9px] select-none ${c.sortable !== false ? 'cursor-pointer hover:text-slate-800' : ''} ${c.align === 'right' ? 'text-right' : ''}`}>
                <span className="inline-flex items-center gap-0.5">{c.label}
                  {c.sortable !== false && sortKey === c.key && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                  {colFilters[c.key] && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 ml-0.5" />}
                </span>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.id || row.key || i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" data-testid="table-row">
                {columns.map(c => (
                  <td key={c.key} className={`py-2 px-3 ${c.align === 'right' ? 'text-right' : ''} ${c.className || 'text-slate-700'}`}>
                    {c.render ? c.render(row[c.key], row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={columns.length}><EmptyState text="No data" /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AreaChartSimple({ data, dataKey, color, prefix = '' }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data}>
        <defs><linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.15} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={TICK_SM} tickFormatter={d => d?.slice(5)} />
        <YAxis tick={TICK_SM} tickFormatter={v => `${prefix}${v}`} />
        <RTooltip contentStyle={TT_STYLE} formatter={v => [`${prefix}${v}`, dataKey]} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#g-${color})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PieChartSimple({ data, nameKey, dataKey }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
          {data?.map((_, i) => <Cell key={`k${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <RTooltip contentStyle={TT_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function RankList({ items }) {
  return (
    <div className="space-y-2">{items?.slice(0, 10).map((it, i) => (
      <div key={`k${i}`} className="flex items-center gap-2.5">
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
        <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-800 truncate">{it.name}</p>{it.sub && <p className="text-[9px] text-slate-400">{it.sub}</p>}</div>
        <span className="text-xs font-semibold text-slate-600">{it.value}</span>
      </div>
    ))}</div>
  );
}

export function Th({ children, right }) {
  return <th className={`${right ? 'text-right' : 'text-left'} py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[9px]`}>{children}</th>;
}

export function IconBtn({ icon: Icon, onClick, color, testId }) {
  const cm = { cyan: 'hover:bg-cyan-50 hover:text-cyan-600', red: 'hover:bg-red-50 hover:text-red-600', slate: 'hover:bg-slate-100 hover:text-slate-700' };
  return <button onClick={onClick} className={`p-1 rounded text-slate-400 transition-colors ${cm[color] || cm.cyan}`} data-testid={testId}><Icon size={12} /></button>;
}

export function RoleBadge({ role }) {
  const c = { diver: 'bg-slate-100 text-slate-700', operator: 'bg-cyan-100 text-cyan-700', instructor: 'bg-cyan-50 text-cyan-600', admin: 'bg-cyan-200 text-cyan-800' };
  return <span className={`ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${c[role] || 'bg-slate-100 text-slate-500'}`}>{role}</span>;
}

export function StatusBadge({ status }) {
  const c = { active: 'bg-cyan-100 text-cyan-700', pending: 'bg-slate-100 text-slate-600', pending_approval: 'bg-slate-100 text-slate-600', confirmed: 'bg-cyan-100 text-cyan-700', suspended: 'bg-red-100 text-red-700', rejected: 'bg-slate-100 text-slate-500', cancelled: 'bg-red-100 text-red-700', dismissed: 'bg-slate-100 text-slate-500', action_taken: 'bg-slate-200 text-slate-700' };
  const l = status === 'pending_approval' ? 'Pending' : status === 'action_taken' ? 'Actioned' : status;
  return <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold capitalize ${c[status] || 'bg-slate-100 text-slate-500'}`}>{l || 'active'}</span>;
}

export function Loader() {
  return (
    <div className="space-y-4 py-4" data-testid="admin-loader-skeleton">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`k${i}`} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="h-3 w-16 bg-slate-200/70 skeleton-shimmer rounded-md" />
            <div className="h-5 w-10 bg-slate-200/70 skeleton-shimmer rounded-md" />
          </div>
        ))}
      </div>
      <div className="h-48 w-full bg-slate-200/70 skeleton-shimmer rounded-xl" />
    </div>
  );
}

export function EmptyState({ text }) {
  return <div className="text-center py-8 text-slate-400 text-xs">{text}</div>;
}
