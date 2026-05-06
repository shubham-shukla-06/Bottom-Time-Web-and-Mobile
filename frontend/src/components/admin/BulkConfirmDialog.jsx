import { useEffect, useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

/**
 * Confirmation modal for destructive / bulk actions on the admin command.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   onConfirm: () => Promise<void> | void  — called when user clicks confirm
 *   title: string
 *   description: string | node — plain text or JSX (supports <strong>, counts, etc.)
 *   confirmLabel?: string (default "Confirm")
 *   cancelLabel?: string  (default "Cancel")
 *   tone?: "danger" | "warning" | "primary"  (default "danger")
 *   requireTypedConfirmation?: string — if set, user must type this exact string to enable confirm
 */
export function BulkConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  requireTypedConfirmation = null,
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setTyped('');
    }
  }, [open]);

  // Escape to dismiss
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const toneStyles = {
    danger: { icon: 'text-rose-500 bg-rose-50 border-rose-100', btn: 'bg-rose-600 hover:bg-rose-700 text-white' },
    warning: { icon: 'text-amber-500 bg-amber-50 border-amber-100', btn: 'bg-amber-500 hover:bg-amber-600 text-white' },
    primary: { icon: 'text-cyan-500 bg-cyan-50 border-cyan-100', btn: 'bg-slate-900 hover:bg-slate-800 text-white' },
  }[tone];

  const typeBlocked = requireTypedConfirmation && typed.trim() !== requireTypedConfirmation;

  const handleConfirm = async () => {
    if (typeBlocked) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // parent is expected to toast its own error; keep dialog open so user can retry
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      data-testid="bulk-confirm-dialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-confirm-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
      >
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl border ${toneStyles.icon}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h2 id="bulk-confirm-title" className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
              <button
                type="button"
                onClick={() => !busy && onClose()}
                className="text-slate-400 hover:text-slate-600 p-0.5"
                aria-label="Close"
                data-testid="bulk-confirm-close-btn"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-sm text-slate-600 mt-2 leading-relaxed">{description}</div>

            {requireTypedConfirmation && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-1.5">
                  Type <span className="font-mono font-bold text-slate-800">{requireTypedConfirmation}</span> to confirm.
                </p>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  data-testid="bulk-confirm-typed-input"
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            data-testid="bulk-confirm-cancel-btn"
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || typeBlocked}
            data-testid="bulk-confirm-confirm-btn"
            className={`h-10 px-4 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${toneStyles.btn}`}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Working…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
