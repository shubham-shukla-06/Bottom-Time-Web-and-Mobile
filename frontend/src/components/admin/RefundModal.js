import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

// Phase 4-P4 — Locked behavior. See /app/memory/REFUNDS_LOCKED.md F1.
// Typed-confirm + amount + reason → POST /admin/refunds/create.
export default function RefundModal({ kind, target, onClose, onSuccess }) {
  const orderNumber = target.order_number || target.id;
  const totalDisplay = target.amount_display ?? target.total ?? target.total_price ?? 0;
  const currency = (target.display_currency || target.currency || 'INR').toUpperCase();
  const fxLocked = target.fx_rate_locked || 1;
  const alreadyRefunded = target.refunded_amount_display || 0;
  const refundable = Math.max(0, Number(totalDisplay) - Number(alreadyRefunded));
  const provider = target.payment_provider || '?';

  const [amount, setAmount] = useState(refundable.toFixed(2));
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !submitting && Number(amount) > 0 && Number(amount) <= refundable + 0.001 && reason.trim().length > 3 && confirmText.trim() === orderNumber;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await axios.post('/admin/refunds/create', {
        kind, id: target.id, amount_to_refund_display: Number(amount), reason: reason.trim(),
      });
      const r = res.data;
      if (r.status === 'failed') {
        toast.error(`Refund failed: ${r.provider_error || 'provider error'}`);
      } else {
        const isMock = r.status === 'mock_processed';
        toast.success(`${isMock ? '[MOCK] ' : ''}Refund ${r.status}: ${currency} ${r.amount_display} → INR ${r.amount_inr.toFixed(2)} (${provider})`);
        onSuccess?.(r);
        onClose();
      }
    } catch (e) { toast.error(e.response?.data?.detail || 'Refund creation failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="refund-modal">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Initiate refund</h3>
            <p className="text-xs text-slate-500 mt-0.5">{orderNumber} · {provider} · {currency}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg" data-testid="refund-close-btn"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">FX audit trail</p>
              <p className="leading-relaxed">Refund INR is computed using the ORIGINAL order's locked FX (₹{fxLocked}/{currency}), not current rate. Already refunded: {currency} {Number(alreadyRefunded).toFixed(2)}.</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">Refund amount ({currency})</label>
            <input type="number" step="0.01" min="0" max={refundable} value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400" data-testid="refund-amount-input" />
            <p className="text-[11px] text-slate-500 mt-1">Max refundable: {currency} {refundable.toFixed(2)} · Will record as INR {(Number(amount) * Number(fxLocked)).toFixed(2)}</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400 resize-none" placeholder="Customer cancelled, item OOS, etc." data-testid="refund-reason-input" />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">Type <code className="text-cyan-600">{orderNumber}</code> to confirm</label>
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400 font-mono" data-testid="refund-confirm-input" />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50" data-testid="refund-cancel-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5" data-testid="refund-submit-btn">
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Refunding…</> : `Refund ${currency} ${Number(amount || 0).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
