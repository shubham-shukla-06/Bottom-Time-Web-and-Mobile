import { useState } from 'react';
import { Bell, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function AlertsBanner({ alerts, onNavigate }) {
  const [dismissed, setDismissed] = useState(new Set());
  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (!visible.length) return null;

  const styles = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  const icons = {
    critical: <AlertCircle size={14} className="text-red-600 flex-shrink-0" />,
    warning: <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />,
    info: <Info size={14} className="text-blue-600 flex-shrink-0" />,
  };

  return (
    <div className="mb-5 space-y-2" data-testid="alerts-banner">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={14} className="text-slate-500" />
        <span className="text-xs font-bold text-slate-700">{visible.length} Active Alert{visible.length !== 1 ? 's' : ''}</span>
      </div>
      {visible.map(a => (
        <div key={a.id} className={`flex items-start gap-2.5 p-3 rounded-lg border ${styles[a.severity]}`} data-testid={`alert-${a.id}`}>
          {icons[a.severity]}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">{a.title}</p>
            <p className="text-[10px] mt-0.5 opacity-80">{a.message}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onNavigate(a.section)} className="text-[9px] font-semibold px-2 py-1 rounded bg-white/50 hover:bg-white/80" data-testid={`alert-go-${a.id}`}>View</button>
            <button onClick={() => setDismissed(p => new Set([...p, a.id]))} className="p-0.5 rounded hover:bg-white/50"><X size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
