import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, Package, Settings, Search, Ban, Trash2, UserCheck, CheckCircle, XCircle, Plus, X, Edit3, Save, Shield } from 'lucide-react';
import { SectionHeader, Card, Th, IconBtn, RoleBadge, StatusBadge, Loader, EmptyState } from './primitives';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import useTabParam from '../../hooks/useTabParam';
import { BulkSelectCheckbox } from '../../components/admin/BulkSelectCheckbox';
import { BulkActionBar } from '../../components/admin/BulkActionBar';
import { BulkConfirmDialog } from '../../components/admin/BulkConfirmDialog';

export default function ManageSection() {
  const [sub, setSub] = useTabParam('sub', 'users', ['users', 'listings', 'admins']);
  const tabs = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'listings', label: 'Listings', icon: Package },
    { key: 'admins', label: 'Admin Access', icon: Settings },
  ];

  return (
    <div className="space-y-4" data-testid="manage-section">
      <SectionHeader title="Manage" sectionKey="manage" />
      <div className="flex gap-1 bg-white rounded-lg p-1 border border-slate-200 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${sub === t.key ? 'bg-cyan-400 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            data-testid={`manage-tab-${t.key}`}><t.icon size={12} /> {t.label}</button>
        ))}
      </div>
      {sub === 'users' && <ManageUsers />}
      {sub === 'listings' && <ManageListings />}
      {sub === 'admins' && <ManageAdmins />}
    </div>
  );
}

function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleF, setRoleF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [bulkAction, setBulkAction] = useState(null); // 'suspend' | 'activate' | 'delete' | null

  // Only non-admins are selectable (admins are protected)
  const selectable = users.filter(u => u.role !== 'admin');
  const sel = useBulkSelect(selectable, (u) => u.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams(); if (search) p.append('search', search); if (roleF) p.append('role', roleF); if (statusF) p.append('status', statusF);
    try { const r = await axios.get(`/admin/users?${p}`); setUsers(r.data.users); sel.clear(); } catch (e) { /* silent */ } finally { setLoading(false); }
  }, [search, roleF, statusF]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [roleF, statusF, fetchUsers]);

  const act = async (id, action) => {
    if (action === 'delete' && !window.confirm('Delete permanently?')) return;
    try { action === 'delete' ? await axios.delete(`/admin/users/${id}`) : await axios.put(`/admin/users/${id}/${action}`); toast.success('Done'); fetchUsers(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleBulk = async () => {
    if (!bulkAction) return;
    try {
      const res = await axios.post('/admin/bulk/users/action', { ids: sel.selected, action: bulkAction });
      toast.success(`${res.data.processed} user(s) ${bulkAction === 'delete' ? 'deleted' : bulkAction + 'd'}`);
      if (res.data.failed > 0) toast.error(`${res.data.failed} failed`);
      fetchUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk action failed');
      throw e;
    }
  };

  const bulkLabels = { suspend: 'Suspend', activate: 'Activate', delete: 'Delete' };
  const bulkTones = { suspend: 'warning', activate: 'primary', delete: 'danger' };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid="manage-users">
      <div className="p-3 border-b border-slate-200 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2.5 top-2 text-slate-400" size={13} /><input placeholder="Search..." className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-cyan-400" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUsers()} data-testid="manage-user-search" /></div>
        <select value={roleF} onChange={e => setRoleF(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none" data-testid="manage-role-filter"><option value="">All Roles</option><option value="diver">Diver</option><option value="operator">Operator</option><option value="instructor">Instructor</option><option value="admin">Admin</option></select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none" data-testid="manage-status-filter"><option value="">All Status</option><option value="active">Active</option><option value="pending_approval">Pending</option><option value="suspended">Suspended</option></select>
      </div>

      <div className="px-3 pt-3">
        <BulkActionBar
          count={sel.count}
          total={selectable.length}
          onClear={sel.clear}
          actions={[
            { key: 'activate', label: 'Activate', tone: 'success', icon: <UserCheck size={13} />, onClick: () => setBulkAction('activate'), testid: 'mg-bulk-activate' },
            { key: 'suspend', label: 'Suspend', tone: 'default', icon: <Ban size={13} />, onClick: () => setBulkAction('suspend'), testid: 'mg-bulk-suspend' },
            { key: 'delete', label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => setBulkAction('delete'), testid: 'mg-bulk-delete' },
          ]}
        />
      </div>

      {loading ? <Loader /> : (
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50 border-b border-slate-100">
          <th className="py-2.5 px-3 w-8">
            <BulkSelectCheckbox
              checked={sel.allSelected}
              indeterminate={sel.someSelected}
              onChange={sel.toggleAll}
              testid="mg-users-select-all"
              ariaLabel="Select all users"
            />
          </th>
          <Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Joined</Th><Th right>Actions</Th></tr></thead><tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50" data-testid="manage-user-row">
              <td className="py-2.5 px-3">
                {u.role !== 'admin' ? (
                  <BulkSelectCheckbox
                    checked={sel.isSelected(u.id)}
                    onChange={() => sel.toggle(u.id)}
                    testid={`mg-user-select-${u.id}`}
                    ariaLabel={`Select ${u.name}`}
                  />
                ) : (
                  <BulkSelectCheckbox checked={false} onChange={() => {}} disabled ariaLabel="Admin users cannot be bulk-selected" />
                )}
              </td>
              <td className="py-2.5 px-3"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-400 flex items-center justify-center text-[9px] font-bold">{u.name?.charAt(0)}</div><div><p className="font-semibold text-slate-800">{u.name}</p><p className="text-[9px] text-slate-400">{u.email}</p></div></div></td>
              <td className="py-2.5 px-3"><RoleBadge role={u.role} /></td>
              <td className="py-2.5 px-3"><StatusBadge status={u.status} /></td>
              <td className="py-2.5 px-3 text-slate-500">{u.created_at?.split('T')[0]}</td>
              <td className="py-2.5 px-3"><div className="flex gap-1 justify-end">
                {u.status === 'active' && u.role !== 'admin' && <IconBtn icon={Ban} onClick={() => act(u.id, 'suspend')} color="amber" testId="mg-suspend" />}
                {u.status === 'pending_approval' && <IconBtn icon={CheckCircle} onClick={() => act(u.id, 'approve')} color="emerald" testId="mg-approve" />}
                {(u.status === 'suspended' || u.status === 'rejected') && <IconBtn icon={UserCheck} onClick={() => act(u.id, 'activate')} color="emerald" testId="mg-activate" />}
                {u.role !== 'admin' && <IconBtn icon={Trash2} onClick={() => act(u.id, 'delete')} color="red" testId="mg-delete" />}
              </div></td>
            </tr>
          ))}
        </tbody></table>{users.length === 0 && <EmptyState text="No users" />}</div>
      )}

      <BulkConfirmDialog
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulk}
        title={`${bulkLabels[bulkAction] || ''} users`}
        description={
          <>You're about to <strong>{bulkAction}</strong> <strong>{sel.count}</strong> user{sel.count === 1 ? '' : 's'}.{' '}
          {bulkAction === 'delete'
            ? 'This permanently deletes the accounts and all their connections. This cannot be undone.'
            : bulkAction === 'suspend'
              ? 'Suspended users cannot sign in or use the platform until reactivated.'
              : 'Activated users regain full access to the platform.'}
          </>
        }
        confirmLabel={`${bulkLabels[bulkAction] || 'Confirm'} ${sel.count}`}
        tone={bulkTones[bulkAction] || 'danger'}
        requireTypedConfirmation={bulkAction === 'delete' ? 'DELETE' : null}
      />
    </div>
  );
}

function ManageListings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [modal, setModal] = useState(null);
  const [bulkAction, setBulkAction] = useState(null); // 'approve' | 'reject' | 'delete' | null

  const sel = useBulkSelect(listings, (l) => l.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchListings = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams(); if (search) p.append('search', search); if (statusF) p.append('status', statusF);
    try { const r = await axios.get(`/admin/listings?${p}`); setListings(r.data.listings); sel.clear(); } catch (e) { /* silent */ } finally { setLoading(false); }
  }, [search, statusF]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchListings(); }, [statusF, fetchListings]);

  const act = async (id, action) => {
    if (action === 'delete' && !window.confirm('Delete?')) return;
    try { action === 'delete' ? await axios.delete(`/admin/listings/${id}`) : await axios.put(`/admin/listings/${id}/${action}`); toast.success('Done'); fetchListings(); } catch (e) { toast.error('Failed'); }
  };

  const handleBulk = async () => {
    if (!bulkAction) return;
    try {
      const res = await axios.post('/admin/bulk/listings/action', { ids: sel.selected, action: bulkAction });
      toast.success(`${res.data.processed} listing(s) ${bulkAction === 'delete' ? 'deleted' : bulkAction + 'd'}`);
      if (res.data.failed > 0) toast.error(`${res.data.failed} failed`);
      fetchListings();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk action failed');
      throw e;
    }
  };

  const bulkLabels = { approve: 'Approve', reject: 'Reject', delete: 'Delete' };
  const bulkTones = { approve: 'primary', reject: 'warning', delete: 'danger' };

  return (
    <div className="space-y-3" data-testid="manage-listings">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2.5 top-2 text-slate-400" size={13} /><input placeholder="Search..." className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-cyan-400" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchListings()} data-testid="mg-listing-search" /></div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none" data-testid="mg-listing-status"><option value="">All</option><option value="active">Active</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select>
          <button onClick={() => setModal({})} className="px-3 py-1.5 bg-cyan-400 text-white text-[11px] font-semibold rounded-lg hover:bg-cyan-300 flex items-center gap-1" data-testid="mg-create-listing"><Plus size={12} /> New</button>
        </div>

        <div className="px-3 pt-3">
          <BulkActionBar
            count={sel.count}
            total={listings.length}
            onClear={sel.clear}
            actions={[
              { key: 'approve', label: 'Approve', tone: 'success', icon: <CheckCircle size={13} />, onClick: () => setBulkAction('approve'), testid: 'mg-list-bulk-approve' },
              { key: 'reject', label: 'Reject', tone: 'default', icon: <XCircle size={13} />, onClick: () => setBulkAction('reject'), testid: 'mg-list-bulk-reject' },
              { key: 'delete', label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => setBulkAction('delete'), testid: 'mg-list-bulk-delete' },
            ]}
          />
        </div>

        {loading ? <Loader /> : (
          <div className="divide-y divide-slate-50">
            {listings.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 bg-slate-50/60 text-xs text-slate-500">
                <BulkSelectCheckbox
                  checked={sel.allSelected}
                  indeterminate={sel.someSelected}
                  onChange={sel.toggleAll}
                  testid="mg-listings-select-all"
                  ariaLabel="Select all listings"
                />
                <span>Select all ({listings.length})</span>
              </div>
            )}
            {listings.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 hover:bg-slate-50" data-testid="mg-listing-row">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <BulkSelectCheckbox
                    checked={sel.isSelected(l.id)}
                    onChange={() => sel.toggle(l.id)}
                    testid={`mg-listing-select-${l.id}`}
                    ariaLabel={`Select ${l.name}`}
                  />
                  {l.image_url ? <img src={l.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" loading="lazy" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package size={16} className="text-slate-400" /></div>}
                  <div className="min-w-0"><p className="text-xs font-semibold text-slate-800 truncate">{l.name}</p><p className="text-[9px] text-slate-500">{l.location} {l.country && `· ${l.country}`} {l.price && `· $${l.price}`}</p></div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={l.status} />
                  <IconBtn icon={Edit3} onClick={() => setModal(l)} color="blue" testId="mg-edit-listing" />
                  {l.status === 'pending' && <><button onClick={() => act(l.id, 'approve')} className="px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded" data-testid="mg-approve-listing">Approve</button><button onClick={() => act(l.id, 'reject')} className="px-2 py-0.5 border border-red-200 text-red-600 text-[9px] font-bold rounded" data-testid="mg-reject-listing">Reject</button></>}
                  <IconBtn icon={Trash2} onClick={() => act(l.id, 'delete')} color="red" testId="mg-delete-listing" />
                </div>
              </div>
            ))}
            {listings.length === 0 && <EmptyState text="No listings" />}
          </div>
        )}
      </div>
      {modal && <ListingFormModal listing={modal.id ? modal : null} onClose={() => setModal(null)} onSave={() => { setModal(null); fetchListings(); }} />}

      <BulkConfirmDialog
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulk}
        title={`${bulkLabels[bulkAction] || ''} listings`}
        description={
          <>You're about to <strong>{bulkAction}</strong> <strong>{sel.count}</strong> listing{sel.count === 1 ? '' : 's'}.{' '}
          {bulkAction === 'delete'
            ? 'This permanently removes the listings. This cannot be undone.'
            : bulkAction === 'approve'
              ? 'Approved listings become publicly visible and operators are notified.'
              : 'Rejected listings are hidden and operators are notified.'}
          </>
        }
        confirmLabel={`${bulkLabels[bulkAction] || 'Confirm'} ${sel.count}`}
        tone={bulkTones[bulkAction] || 'danger'}
        requireTypedConfirmation={bulkAction === 'delete' ? 'DELETE' : null}
      />
    </div>
  );
}

function ListingFormModal({ listing, onClose, onSave }) {
  const isEdit = !!listing;
  const [f, setF] = useState({ name: listing?.name || '', type: listing?.type || 'dives', description: listing?.description || '', location: listing?.location || '', country: listing?.country || '', price: listing?.price || '', currency: listing?.currency || 'USD', duration: listing?.duration || '', image_url: listing?.image_url || '', highlights: (listing?.highlights || []).join(', ') });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.name || !f.location || !f.country) { toast.error('Name, location, country required'); return; }
    setSaving(true);
    try { const payload = { ...f, price: f.price ? parseFloat(f.price) : null, highlights: f.highlights.split(',').map(h => h.trim()).filter(Boolean) }; isEdit ? await axios.put(`/admin/listings/${listing.id}/edit`, payload) : await axios.post('/admin/listings', payload); toast.success(isEdit ? 'Updated' : 'Created'); onSave(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } finally { setSaving(false); }
  };
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const cls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-400";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()} data-testid="listing-form-modal">
        <h3 className="text-base font-bold mb-3">{isEdit ? 'Edit Listing' : 'New Listing'}</h3>
        <div className="space-y-2.5">
          <input placeholder="Name" className={cls} value={f.name} onChange={e => set('name', e.target.value)} data-testid="lf-name" />
          <div className="grid grid-cols-2 gap-2">
            <select className={cls} value={f.type} onChange={e => set('type', e.target.value)} data-testid="lf-type"><option value="dives">Dives</option><option value="courses">Courses</option><option value="liveaboards">Liveaboards</option><option value="day_trips">Day Trips</option><option value="snorkeling">Snorkeling</option></select>
          </div>
          <textarea placeholder="Description" className={`${cls} h-16 resize-none`} value={f.description} onChange={e => set('description', e.target.value)} data-testid="lf-desc" />
          <div className="grid grid-cols-2 gap-2"><input placeholder="Location" className={cls} value={f.location} onChange={e => set('location', e.target.value)} data-testid="lf-loc" /><input placeholder="Country" className={cls} value={f.country} onChange={e => set('country', e.target.value)} data-testid="lf-country" /></div>
          <div className="grid grid-cols-3 gap-2"><input type="number" placeholder="Price" className={cls} value={f.price} onChange={e => set('price', e.target.value)} data-testid="lf-price" /><input placeholder="Currency" className={cls} value={f.currency} onChange={e => set('currency', e.target.value)} /><input placeholder="Duration" className={cls} value={f.duration} onChange={e => set('duration', e.target.value)} /></div>
          <input placeholder="Image URL" className={cls} value={f.image_url} onChange={e => set('image_url', e.target.value)} data-testid="lf-img" />
          {f.image_url && <img src={f.image_url} alt="Preview" className="w-full h-28 object-cover rounded-lg" loading="lazy" />}
          <input placeholder="Highlights (comma-separated)" className={cls} value={f.highlights} onChange={e => set('highlights', e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-cyan-400 text-white rounded-lg hover:bg-cyan-300 disabled:opacity-50 font-medium flex items-center gap-1" data-testid="lf-save"><Save size={14} /> {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function ManageAdmins() {
  const [admins, setAdmins] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [isSuper, setIsSuper] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchAdmins = useCallback(async () => { setLoading(true); try { const r = await axios.get('/admin/settings/admins'); setAdmins(r.data.admins); setSuperAdmins(r.data.super_admins); setIsSuper(r.data.is_super_admin); } catch (e) { /* silent */ } finally { setLoading(false); } }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);
  const add = async () => { if (!email.trim()) return; try { await axios.post('/admin/settings/admins', { email: email.trim() }); toast.success('Added'); setEmail(''); fetchAdmins(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } };
  const remove = async (id, name) => { if (!window.confirm(`Remove ${name}?`)) return; try { await axios.delete(`/admin/settings/admins/${id}`); toast.success('Removed'); fetchAdmins(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } };
  if (loading) return <Loader />;

  return (
    <div className="max-w-xl space-y-4" data-testid="manage-admins">
      <Card title="Admin Accounts" icon={Shield}>
        <div className="space-y-2 mb-4">{admins.map(a => (
          <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50" data-testid="ma-admin-row">
            <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-400 flex items-center justify-center text-[10px] font-bold">{a.name?.charAt(0)}</div><span className="text-xs font-semibold text-slate-800">{a.name}</span><span className="text-[10px] text-slate-400">{a.email}</span>{superAdmins.includes(a.email) && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-bold rounded">SUPER</span>}</div>
            {isSuper && !superAdmins.includes(a.email) && <button onClick={() => remove(a.id, a.name)} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600" data-testid="ma-remove"><X size={13} /></button>}
          </div>
        ))}</div>
        {isSuper && <div className="flex gap-2"><input placeholder="User email..." className="flex-1 bg-slate-50 border border-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-cyan-400" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} data-testid="ma-email" /><button onClick={add} className="px-4 py-2 bg-cyan-400 text-white text-xs font-semibold rounded-lg hover:bg-cyan-300 flex items-center gap-1" data-testid="ma-add"><Plus size={12} /> Add</button></div>}
      </Card>
      <Card title="Super Admins (Hardcoded)" icon={Shield}><div className="space-y-1">{superAdmins.map(e => <div key={e} className="flex items-center gap-2 py-1"><Shield size={11} className="text-amber-600" /><span className="text-xs text-slate-700">{e}</span></div>)}</div></Card>
    </div>
  );
}
