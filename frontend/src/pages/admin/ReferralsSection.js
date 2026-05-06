import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, X, Copy, Tag, Users, TrendingUp, ToggleLeft, ToggleRight } from 'lucide-react';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { BulkSelectCheckbox } from '../../components/admin/BulkSelectCheckbox';
import { BulkActionBar } from '../../components/admin/BulkActionBar';
import { BulkConfirmDialog } from '../../components/admin/BulkConfirmDialog';

export default function ReferralsSection() {
  const [codes, setCodes] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [bulkAction, setBulkAction] = useState(null); // 'activate' | 'deactivate' | 'delete' | null

  const sel = useBulkSelect(codes, (c) => c.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCodes(); }, []);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/promo-codes');
      setCodes(res.data.promo_codes);
      setSummary(res.data.summary);
      sel.clear();
    } catch (e) { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this promo code?')) return;
    try { await axios.delete(`/admin/promo-codes/${id}`); toast.success('Deleted'); fetchCodes(); }
    catch (e) { toast.error('Failed'); }
  };

  const handleToggle = async (code) => {
    try {
      await axios.put(`/admin/promo-codes/${code.id}`, { active: !code.active });
      fetchCodes();
    } catch (e) { toast.error('Failed'); }
  };

  const handleBulk = async () => {
    if (!bulkAction) return;
    try {
      const res = await axios.post('/admin/bulk/promo-codes/action', { ids: sel.selected, action: bulkAction });
      toast.success(`${res.data.processed} code(s) ${bulkAction === 'delete' ? 'deleted' : bulkAction + 'd'}`);
      fetchCodes();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk action failed');
      throw e;
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => toast.success(`Copied: ${code}`));
  };

  if (loading) return <div className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto"></div></div>;

  const bulkLabels = { activate: 'Activate', deactivate: 'Deactivate', delete: 'Delete' };
  const bulkTones = { activate: 'primary', deactivate: 'warning', delete: 'danger' };

  return (
    <div className="space-y-6" data-testid="referrals-section">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <Tag size={18} className="text-cyan-600 mx-auto mb-1" />
          <p className="text-2xl font-bold">{summary.total}</p>
          <p className="text-[10px] text-slate-500 font-semibold">Total Codes</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <TrendingUp size={18} className="text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-600">{summary.active}</p>
          <p className="text-[10px] text-slate-500 font-semibold">Active</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <Users size={18} className="text-indigo-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-indigo-600">{summary.total_uses}</p>
          <p className="text-[10px] text-slate-500 font-semibold">Total Uses</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {codes.length > 0 && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer" data-testid="promos-select-all-label">
            <BulkSelectCheckbox
              checked={sel.allSelected}
              indeterminate={sel.someSelected}
              onChange={sel.toggleAll}
              testid="promos-select-all"
              ariaLabel="Select all promo codes"
            />
            Select all ({codes.length})
          </label>
        )}
        <div className="flex-1" />
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm" data-testid="create-promo-btn">
          <Plus size={14} /> Create Code
        </button>
      </div>

      <BulkActionBar
        count={sel.count}
        total={codes.length}
        onClear={sel.clear}
        actions={[
          { key: 'activate', label: 'Activate', tone: 'success', icon: <ToggleRight size={13} />, onClick: () => setBulkAction('activate'), testid: 'promos-bulk-activate' },
          { key: 'deactivate', label: 'Deactivate', tone: 'default', icon: <ToggleLeft size={13} />, onClick: () => setBulkAction('deactivate'), testid: 'promos-bulk-deactivate' },
          { key: 'delete', label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => setBulkAction('delete'), testid: 'promos-bulk-delete' },
        ]}
      />

      {/* Codes List */}
      <div className="space-y-3">
        {codes.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="promo-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <BulkSelectCheckbox
                  checked={sel.isSelected(c.id)}
                  onChange={() => sel.toggle(c.id)}
                  testid={`promo-select-${c.id}`}
                  ariaLabel={`Select ${c.code}`}
                />
                <button onClick={() => copyCode(c.code)} className="font-mono font-bold text-lg bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1.5" data-testid="copy-code">
                  {c.code} <Copy size={13} className="text-slate-400" />
                </button>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  c.source === 'influencer' ? 'bg-purple-50 text-purple-700' :
                  c.source === 'operator' ? 'bg-cyan-50 text-cyan-700' :
                  c.source === 'referral' ? 'bg-amber-50 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{c.source}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleToggle(c)} className="p-1.5 rounded-lg hover:bg-slate-100" data-testid={`toggle-${c.id}`}>
                  {c.active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} className="text-slate-400" />}
                </button>
                <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg"><Edit3 size={14} /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              <span><strong className="text-slate-700">{c.type === 'percentage' ? `${c.value}% off` : `$${c.value} off`}</strong></span>
              {c.max_discount && <span>Max: ${c.max_discount}</span>}
              {c.min_order > 0 && <span>Min order: ${c.min_order}</span>}
              <span>Used: {c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ''}</span>
              <span>Per user: {c.per_user_limit}</span>
              <span>Applies to: {c.applies_to}</span>
              {c.influencer_name && <span>Influencer: {c.influencer_name}</span>}
              {c.expires_at && <span>Expires: {new Date(c.expires_at).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
        {codes.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
            <Tag size={40} className="text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-lg mb-1">No promo codes yet</h3>
            <p className="text-slate-500 text-sm">Create codes for marketing, operators, or influencers</p>
          </div>
        )}
      </div>

      {showForm && (
        <PromoFormModal
          code={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); fetchCodes(); }}
        />
      )}

      <BulkConfirmDialog
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulk}
        title={`${bulkLabels[bulkAction] || ''} promo codes`}
        description={
          <>You're about to <strong>{bulkAction}</strong> <strong>{sel.count}</strong> promo code{sel.count === 1 ? '' : 's'}.{' '}
          {bulkAction === 'delete' ? 'This cannot be undone.' : bulkAction === 'activate' ? 'Active codes can be redeemed by users immediately.' : 'Deactivated codes will no longer be redeemable.'}
          </>
        }
        confirmLabel={`${bulkLabels[bulkAction] || 'Confirm'} ${sel.count}`}
        tone={bulkTones[bulkAction] || 'danger'}
      />
    </div>
  );
}

function PromoFormModal({ code, onClose, onSaved }) {
  const isEdit = !!code;
  const [form, setForm] = useState({
    code: code?.code || '',
    type: code?.type || 'percentage',
    value: code?.value?.toString() || '10',
    max_discount: code?.max_discount?.toString() || '',
    min_order: code?.min_order?.toString() || '0',
    usage_limit: code?.usage_limit?.toString() || '0',
    per_user_limit: code?.per_user_limit?.toString() || '1',
    applies_to: code?.applies_to || 'all',
    source: code?.source || 'marketing',
    influencer_name: code?.influencer_name || '',
    operator_id: code?.operator_id || '',
    expires_at: code?.expires_at?.split('T')[0] || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.code && !isEdit) { toast.error('Code is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        value: parseFloat(form.value) || 0,
        max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
        min_order: parseFloat(form.min_order) || 0,
        usage_limit: parseInt(form.usage_limit) || 0,
        per_user_limit: parseInt(form.per_user_limit) || 1,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      if (isEdit) {
        await axios.put(`/admin/promo-codes/${code.id}`, payload);
        toast.success('Updated');
      } else {
        await axios.post('/admin/promo-codes', payload);
        toast.success('Code created');
      }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4" data-testid="promo-form-modal">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Code' : 'Create Promo Code'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!isEdit && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Code *</label>
              <input className="input-field text-sm font-mono uppercase" placeholder="DIVE20" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} data-testid="promo-code-input" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Type</label>
              <select className="input-field text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">{form.type === 'percentage' ? 'Discount %' : 'Discount $'}</label>
              <input type="number" className="input-field text-sm" value={form.value} onChange={e => set('value', e.target.value)} data-testid="promo-value-input" />
            </div>
          </div>
          {form.type === 'percentage' && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Max Discount Cap ($)</label>
              <input type="number" className="input-field text-sm" placeholder="No cap" value={form.max_discount} onChange={e => set('max_discount', e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Min Order ($)</label>
              <input type="number" className="input-field text-sm" value={form.min_order} onChange={e => set('min_order', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Expires</label>
              <input type="date" className="input-field text-sm" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Total Usage Limit</label>
              <input type="number" className="input-field text-sm" placeholder="0 = unlimited" value={form.usage_limit} onChange={e => set('usage_limit', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Per User Limit</label>
              <input type="number" className="input-field text-sm" value={form.per_user_limit} onChange={e => set('per_user_limit', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Applies To</label>
              <select className="input-field text-sm" value={form.applies_to} onChange={e => set('applies_to', e.target.value)}>
                <option value="all">Everything</option>
                <option value="shop">Shop Only</option>
                <option value="bookings">Bookings Only</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Source</label>
              <select className="input-field text-sm" value={form.source} onChange={e => set('source', e.target.value)}>
                <option value="marketing">Marketing</option>
                <option value="operator">Operator</option>
                <option value="influencer">Influencer</option>
                <option value="referral">Referral</option>
              </select>
            </div>
          </div>
          {form.source === 'influencer' && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Influencer Name</label>
              <input className="input-field text-sm" placeholder="@divergirl" value={form.influencer_name} onChange={e => set('influencer_name', e.target.value)} />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 btn-primary py-2.5 text-sm" data-testid="save-promo-btn">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
