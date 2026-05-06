import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, BarChart3, Layers, Save } from 'lucide-react';
import { SectionHeader, Card, SortableTable, IconBtn, Loader, EmptyState } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { BulkSelectCheckbox } from '../../components/admin/BulkSelectCheckbox';
import { BulkActionBar } from '../../components/admin/BulkActionBar';
import { BulkConfirmDialog } from '../../components/admin/BulkConfirmDialog';

export default function CampaignsSection() {
  const [campaigns, setCampaigns] = useState([]);
  const [perf, setPerf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sel = useBulkSelect(campaigns, (c) => c.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [c, p] = await Promise.all([axios.get('/admin/campaigns'), axios.get('/cmd/campaign-performance')]);
      setCampaigns(c.data.campaigns); setPerf(p.data);
      if (!silent) sel.clear();
    } catch (e) { /* silent */ } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  const delCampaign = async (id) => {
    if (!window.confirm('Delete campaign?')) return;
    try { await axios.delete(`/admin/campaigns/${id}`); toast.success('Deleted'); fetchData(); } catch (e) { toast.error('Failed'); }
  };

  const handleBulkDelete = async () => {
    try {
      const res = await axios.post('/admin/bulk/campaigns/delete', { ids: sel.selected });
      toast.success(`${res.data.processed} campaign(s) deleted`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk delete failed');
      throw e;
    }
  };

  return (
    <div className="space-y-5" data-testid="campaigns-section">
      <SectionHeader title="Campaigns & UTM Generator" sectionKey="campaigns" />
      <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-cyan-400 text-white text-xs font-semibold rounded-lg hover:bg-cyan-300 flex items-center gap-1.5" data-testid="create-campaign-btn"><Plus size={13} /> New Campaign</button>

      <BulkActionBar
        count={sel.count}
        total={campaigns.length}
        onClear={sel.clear}
        actions={[
          { key: 'delete', label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => setConfirmOpen(true), testid: 'campaigns-bulk-delete' },
        ]}
      />

      {loading ? <Loader /> : (
        <>
          {perf?.campaigns?.length > 0 && (
            <Card title="Campaign Performance" icon={BarChart3}>
              <SortableTable data={perf.campaigns} testId="campaign-perf-table" columns={[
                {
                  key: '_select',
                  label: (
                    <BulkSelectCheckbox
                      checked={sel.allSelected}
                      indeterminate={sel.someSelected}
                      onChange={sel.toggleAll}
                      testid="campaigns-select-all"
                      ariaLabel="Select all campaigns"
                    />
                  ),
                  sortable: false,
                  render: (_, row) => (
                    <BulkSelectCheckbox
                      checked={sel.isSelected(row.id)}
                      onChange={() => sel.toggle(row.id)}
                      testid={`campaign-select-${row.id}`}
                      ariaLabel={`Select ${row.campaign_name}`}
                    />
                  ),
                },
                { key: 'campaign_name', label: 'Campaign', className: 'font-semibold text-slate-800' },
                { key: 'source', label: 'Source' }, { key: 'medium', label: 'Medium' },
                { key: 'hits', label: 'Hits', className: 'text-blue-700' },
                { key: 'users_acquired', label: 'Users' },
                { key: 'bookings', label: 'Bookings', className: 'text-cyan-400' },
                { key: 'revenue', label: 'Revenue', className: 'text-emerald-700 font-semibold', render: v => `$${v}` },
                { key: 'spend', label: 'Spend', render: v => `$${v || 0}` },
                { key: 'cac', label: 'CAC', render: v => <span className={v > 50 ? 'text-red-600 font-semibold' : 'text-emerald-700'}>${v}</span> },
                { key: 'id', label: '', sortable: false, render: (_, row) => <IconBtn icon={Trash2} onClick={() => delCampaign(row.id)} color="red" testId="del-campaign" /> },
              ]} />
            </Card>
          )}
          {campaigns.length > 0 && !perf?.campaigns?.length && (
            <Card title="Saved Campaigns" icon={Layers}>
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-2 py-1 text-[11px] text-slate-500">
                  <BulkSelectCheckbox
                    checked={sel.allSelected}
                    indeterminate={sel.someSelected}
                    onChange={sel.toggleAll}
                    testid="campaigns-saved-select-all"
                    ariaLabel="Select all campaigns"
                  />
                  <span>Select all ({campaigns.length})</span>
                </div>
                {campaigns.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg" data-testid="saved-campaign">
                    <div className="flex items-center gap-3">
                      <BulkSelectCheckbox
                        checked={sel.isSelected(c.id)}
                        onChange={() => sel.toggle(c.id)}
                        testid={`saved-campaign-select-${c.id}`}
                        ariaLabel={`Select ${c.campaign_name}`}
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800">{c.campaign_name}</span>
                        <span className="text-[10px] text-slate-400 ml-2">{c.source} / {c.medium}</span>
                      </div>
                    </div>
                    <IconBtn icon={Trash2} onClick={() => delCampaign(c.id)} color="red" testId="del-saved" />
                  </div>
                ))}
              </div>
            </Card>
          )}
          {!campaigns.length && !perf?.campaigns?.length && <EmptyState text="No campaigns yet. Create one to start tracking." />}
        </>
      )}
      {showCreate && <CampaignModal onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); fetchData(); }} />}

      <BulkConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        title="Delete campaigns"
        description={<>You're about to permanently delete <strong>{sel.count}</strong> campaign{sel.count === 1 ? '' : 's'}. UTM tracking data collected for these campaigns is preserved, but the campaigns themselves will no longer appear. This cannot be undone.</>}
        confirmLabel={`Delete ${sel.count}`}
        tone="danger"
      />
    </div>
  );
}

function CampaignModal({ onClose, onSave }) {
  const [f, setF] = useState({ campaign_name: '', source: 'google', medium: 'paid', content: '', term: '', destination: '/', operator_id: '', spend: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const baseUrl = process.env.REACT_APP_BACKEND_URL?.replace('/api', '') || window.location.origin;
  const utmUrl = `${baseUrl}${f.destination}?utm_source=${encodeURIComponent(f.source)}&utm_medium=${encodeURIComponent(f.medium)}&utm_campaign=${encodeURIComponent(f.campaign_name)}${f.content ? '&utm_content=' + encodeURIComponent(f.content) : ''}${f.term ? '&utm_term=' + encodeURIComponent(f.term) : ''}${f.operator_id ? '&ref=' + encodeURIComponent(f.operator_id) : ''}`;

  const save = async () => {
    if (!f.campaign_name || !f.source) { toast.error('Campaign name and source required'); return; }
    setSaving(true);
    try { await axios.post('/admin/campaigns', { ...f, spend: f.spend ? parseFloat(f.spend) : 0 }); toast.success('Campaign created'); onSave(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } finally { setSaving(false); }
  };

  const copy = () => { navigator.clipboard?.writeText(utmUrl).then(() => toast.success('URL copied!')).catch(() => {}); };
  const cls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-400";

  let QRCode = null;
  try { QRCode = require('qrcode.react').QRCodeSVG; } catch (e) { /* silent */ }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()} data-testid="campaign-modal">
        <h3 className="text-base font-bold mb-3">Create Campaign & UTM Link</h3>
        <div className="space-y-2.5">
          <input className={cls} placeholder="Campaign Name" value={f.campaign_name} onChange={e => set('campaign_name', e.target.value)} data-testid="cm-name" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] font-semibold text-slate-500">Source</label><select className={cls} value={f.source} onChange={e => set('source', e.target.value)} data-testid="cm-source"><option>google</option><option>facebook</option><option>instagram</option><option>tiktok</option><option>email</option><option>shop_referral</option><option>instructor_referral</option><option>event_qr</option><option>organic</option></select></div>
            <div><label className="text-[10px] font-semibold text-slate-500">Medium</label><select className={cls} value={f.medium} onChange={e => set('medium', e.target.value)} data-testid="cm-medium"><option>paid</option><option>organic</option><option>email</option><option>referral</option><option>social</option><option>offline</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={cls} placeholder="Content (creative variant)" value={f.content} onChange={e => set('content', e.target.value)} data-testid="cm-content" />
            <input className={cls} placeholder="Term (keyword/audience)" value={f.term} onChange={e => set('term', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] font-semibold text-slate-500">Destination</label><select className={cls} value={f.destination} onChange={e => set('destination', e.target.value)} data-testid="cm-dest"><option value="/">/</option><option value="/discover">/discover</option><option value="/events">/events</option><option value="/shop">/shop</option><option value="/pathways">/pathways</option><option value="/community">/community</option></select></div>
            <input className={cls} placeholder="Operator ID (optional)" value={f.operator_id} onChange={e => set('operator_id', e.target.value)} />
          </div>
          <input className={cls} type="number" placeholder="Budget / Spend ($)" value={f.spend} onChange={e => set('spend', e.target.value)} data-testid="cm-spend" />
          <textarea className={`${cls} h-12 resize-none`} placeholder="Notes" value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        {f.campaign_name && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Generated UTM URL</span>
              <button onClick={copy} className="text-[10px] text-cyan-400 font-semibold hover:underline" data-testid="copy-url">Copy</button>
            </div>
            <p className="text-[10px] text-slate-700 break-all font-mono bg-white p-2 rounded border border-slate-100" data-testid="utm-url">{utmUrl}</p>
            {QRCode && <div className="mt-3 flex justify-center"><QRCode value={utmUrl} size={120} /></div>}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-cyan-400 text-white rounded-lg hover:bg-cyan-300 disabled:opacity-50 font-medium flex items-center gap-1" data-testid="cm-save"><Save size={14} /> {saving ? 'Saving...' : 'Save Campaign'}</button>
        </div>
      </div>
    </div>
  );
}
