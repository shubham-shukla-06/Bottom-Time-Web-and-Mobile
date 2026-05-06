import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Mail, Trash2, Download, ChevronLeft, ChevronRight, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { SECTION_DESC } from './constants';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { BulkSelectCheckbox } from '../../components/admin/BulkSelectCheckbox';
import { BulkActionBar } from '../../components/admin/BulkActionBar';
import { BulkConfirmDialog } from '../../components/admin/BulkConfirmDialog';

export default function WaitlistSection() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const items = data?.items || [];
  const sel = useBulkSelect(items, (it) => it.email);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetch = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await axios.get(`/waitlist/admin?page=${p}&limit=50`);
      setData(res.data);
      sel.clear();
    } catch (e) { toast.error('Failed to load waitlist'); }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetch(page); }, [page, fetch]);

  const handleRemove = async (email) => {
    if (!window.confirm(`Remove ${email} from the waitlist?`)) return;
    try {
      await axios.delete(`/waitlist/admin/${encodeURIComponent(email)}`);
      toast.success('Removed');
      fetch(page);
    } catch (e) { toast.error('Failed to remove'); }
  };

  const handleBulkDelete = async () => {
    try {
      const res = await axios.post('/admin/bulk/waitlist/delete', { emails: sel.selected });
      toast.success(`${res.data.processed} removed from waitlist`);
      fetch(page);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk delete failed');
      throw e;
    }
  };

  const handleExport = () => {
    if (!items.length) return;
    const csv = 'Email,Joined At\n' + items.map(i => `${i.email},${i.joined_at}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `waitlist_page_${page}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div data-testid="waitlist-section">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">Waitlist</h2>
        <p className="text-xs text-slate-500 mt-1">{SECTION_DESC.waitlist || 'Manage launch waitlist signups from the Coming Soon page.'}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-100 p-4" data-testid="waitlist-display-total">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1"><Users size={13} /> Display Total</div>
          <p className="text-2xl font-bold text-slate-900">{data?.display_total ?? '-'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Shown on Coming Soon page</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4" data-testid="waitlist-real-signups">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1"><Mail size={13} /> Real Signups</div>
          <p className="text-2xl font-bold text-cyan-500">{data?.total ?? '-'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Actual email signups</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4" data-testid="waitlist-base-count">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1"><Clock size={13} /> Base Offset</div>
          <p className="text-2xl font-bold text-slate-400">{data?.base_count ?? '-'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Starting count (social proof)</p>
        </div>
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        count={sel.count}
        total={items.length}
        onClear={sel.clear}
        actions={[
          {
            key: 'delete',
            label: 'Remove',
            tone: 'danger',
            icon: <Trash2 size={13} />,
            onClick: () => setConfirmOpen(true),
            testid: 'waitlist-bulk-delete-btn',
          },
        ]}
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Email Signups</p>
          <button onClick={handleExport} disabled={!items.length} className="text-xs text-cyan-500 hover:text-cyan-600 font-medium flex items-center gap-1 disabled:opacity-40" data-testid="waitlist-export-btn">
            <Download size={12} /> Export CSV
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : items.length > 0 ? (
          <>
            <table className="w-full text-sm" data-testid="waitlist-table">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 font-medium">
                  <th className="px-4 py-2.5 w-8">
                    <BulkSelectCheckbox
                      checked={sel.allSelected}
                      indeterminate={sel.someSelected}
                      onChange={sel.toggleAll}
                      testid="waitlist-select-all"
                      ariaLabel="Select all waitlist rows"
                    />
                  </th>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Joined</th>
                  <th className="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.email} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors" data-testid="waitlist-row">
                    <td className="px-4 py-3">
                      <BulkSelectCheckbox
                        checked={sel.isSelected(item.email)}
                        onChange={() => sel.toggle(item.email)}
                        testid={`waitlist-select-${item.email}`}
                        ariaLabel={`Select ${item.email}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{(page - 1) * 50 + i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(item.joined_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleRemove(item.email)} className="text-slate-300 hover:text-red-400 transition-colors" data-testid="waitlist-remove-btn">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">Page {data.page} of {data.pages}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30" data-testid="waitlist-prev">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30" data-testid="waitlist-next">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center">
            <Mail className="mx-auto text-slate-300 mb-2" size={32} />
            <p className="text-sm text-slate-500">No signups yet</p>
          </div>
        )}
      </div>

      <BulkConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        title="Remove from waitlist"
        description={<>You're about to permanently remove <strong>{sel.count}</strong> signup{sel.count === 1 ? '' : 's'} from the waitlist. This cannot be undone.</>}
        confirmLabel={`Remove ${sel.count}`}
        tone="danger"
      />
    </div>
  );
}
