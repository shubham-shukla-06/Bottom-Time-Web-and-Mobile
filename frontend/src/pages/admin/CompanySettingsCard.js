import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Building2, Save } from 'lucide-react';
import { Card } from './primitives';

// India states — keep in sync with backend GST registration list
const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];

/**
 * Company / GST Registration card — admin-editable seller settings.
 * Backs the singleton `site_settings` Mongo doc. Drives:
 *   - tax_engine.get_seller_state() → CGST+SGST vs IGST split
 *   - shipping pickup defaults (wired in Phase 3b)
 * Super-admin only on save (`PUT /admin/settings/company` returns 403 otherwise).
 */
export default function CompanySettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [envFallback, setEnvFallback] = useState(null);
  const [form, setForm] = useState({ seller_state: '', seller_pincode: '', seller_pickup_address: '', gst_registration_state: '' });

  const fetchSettings = useCallback(() => {
    setLoading(true);
    axios.get('/admin/settings/company')
      .then(r => {
        setResolved(r.data.resolved);
        setEnvFallback(r.data.env_fallback);
        // Prefer saved value, fall back to resolved (env). User can edit either.
        const s = r.data.saved || {};
        setForm({
          seller_state: s.seller_state || r.data.resolved.seller_state || '',
          seller_pincode: s.seller_pincode || r.data.resolved.seller_pincode || '',
          seller_pickup_address: s.seller_pickup_address || r.data.resolved.seller_pickup_address || '',
          gst_registration_state: s.gst_registration_state || r.data.resolved.gst_registration_state || '',
        });
      })
      .catch(() => toast.error('Failed to load company settings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const onSave = () => {
    if (!form.seller_state) { toast.error('Seller state is required'); return; }
    setSaving(true);
    axios.put('/admin/settings/company', form)
      .then(r => {
        setResolved(r.data.resolved);
        toast.success('Company settings saved — applies in ≤60s');
      })
      .catch(e => toast.error(e.response?.data?.detail || 'Save failed (super-admin only)'))
      .finally(() => setSaving(false));
  };

  if (loading) return <Card title="Company / GST Registration" icon={Building2}><div className="text-xs text-slate-400 py-4">Loading…</div></Card>;

  return (
    <Card title="Company / GST Registration" icon={Building2}>
      <div className="space-y-3" data-testid="company-settings-card">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Drives the CGST+SGST vs IGST split on every domestic cart-tax computation.
          Changes apply within 60 seconds (server-side cache TTL). Super-admin only.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Seller state</label>
            <select
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
              value={form.seller_state}
              onChange={e => setForm(f => ({ ...f, seller_state: e.target.value }))}
              data-testid="seller-state-select"
            >
              <option value="">Select…</option>
              {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">GST registration state</label>
            <select
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
              value={form.gst_registration_state}
              onChange={e => setForm(f => ({ ...f, gst_registration_state: e.target.value }))}
              data-testid="gst-registration-state-select"
            >
              <option value="">Same as seller state</option>
              {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Seller pincode</label>
            <input
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
              value={form.seller_pincode}
              onChange={e => setForm(f => ({ ...f, seller_pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              placeholder="400001"
              data-testid="seller-pincode-input"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Pickup address (city/area)</label>
            <input
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
              value={form.seller_pickup_address}
              onChange={e => setForm(f => ({ ...f, seller_pickup_address: e.target.value }))}
              placeholder="Mumbai"
              data-testid="seller-pickup-address-input"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-[10px] text-slate-400 leading-tight">
            <div>Env fallback: <span className="font-mono">{envFallback?.seller_state} · {envFallback?.seller_pincode} · {envFallback?.seller_pickup_address}</span></div>
            <div className="mt-0.5">Tax engine currently uses: <span className="font-semibold text-slate-600">{resolved?.seller_state}</span></div>
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 disabled:opacity-50"
            data-testid="save-company-settings-btn"
          >
            <Save size={12} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Card>
  );
}
