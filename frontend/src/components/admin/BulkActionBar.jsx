import { X } from 'lucide-react';

/**
 * Sticky action bar shown at the top of an admin list whenever 1+ rows are selected.
 *
 * Props:
 *   count: number — how many items are currently selected
 *   total?: number — total on this page (shown as "X of Y selected")
 *   onClear: () => void
 *   actions: Array<{
 *      key: string,
 *      label: string,
 *      icon?: ReactNode,
 *      tone?: "default" | "danger" | "success" | "primary",  (default "default")
 *      onClick: () => void,
 *      disabled?: boolean,
 *      testid?: string,
 *   }>
 */
export function BulkActionBar({ count, total, onClear, actions = [] }) {
  if (count === 0) return null;

  const toneClasses = {
    default: 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-cyan-300',
    danger: 'bg-white hover:bg-rose-50 border-slate-200 text-rose-600 hover:border-rose-300',
    success: 'bg-white hover:bg-emerald-50 border-slate-200 text-emerald-700 hover:border-emerald-300',
    primary: 'bg-slate-900 hover:bg-slate-800 border-slate-900 text-white',
  };

  return (
    <div
      className="sticky top-4 z-30 mb-4 bg-white border border-cyan-200 rounded-2xl shadow-lg px-4 py-3 flex flex-wrap items-center gap-3"
      data-testid="bulk-action-bar"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-cyan-500 text-white text-xs font-bold" data-testid="bulk-action-count">
          {count}
        </span>
        <span className="text-sm font-semibold text-slate-900">
          selected{total ? <span className="text-slate-400 font-normal"> of {total}</span> : null}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            data-testid={a.testid || `bulk-action-${a.key}`}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${toneClasses[a.tone || 'default']}`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          data-testid="bulk-action-clear-btn"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
          aria-label="Clear selection"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
