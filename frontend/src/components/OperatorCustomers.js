import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, UserPlus, X, Search, Phone, Mail, Award, Hash } from 'lucide-react';

export default function OperatorCustomers() {
  const [onlineCustomers, setOnlineCustomers] = useState([]);
  const [walkinCustomers, setWalkinCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', certification_level: '', num_dives: 0, source: 'walk-in', notes: '' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/operator-listings/customers');
      setOnlineCustomers(res.data.online_customers || []);
      setWalkinCustomers(res.data.walkin_customers || []);
    } catch (e) { toast.error('Failed to load customers'); }
    finally { setLoading(false); }
  };

  const addWalkin = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    try {
      await axios.post('/operator-listings/customers/walkin', form);
      toast.success('Customer added');
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '', certification_level: '', num_dives: 0, source: 'walk-in', notes: '' });
      fetchCustomers();
    } catch (e) { toast.error('Failed to add'); }
  };

  const allCustomers = [
    ...onlineCustomers.map(c => ({ ...c, type: 'online' })),
    ...walkinCustomers.map(c => ({ ...c, type: 'walkin' })),
  ].filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="space-y-3 py-4" data-testid="customers-skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={`k${i}`} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-3">
          <div className="w-9 h-9 rounded-full bg-slate-200/70 skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-28 bg-slate-200/70 skeleton-shimmer rounded-md" />
            <div className="h-3 w-40 bg-slate-200/70 skeleton-shimmer rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="operator-customers">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input placeholder="Search customers..." className="bg-slate-50 border border-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-cyan-400 w-64"
              value={search} onChange={e => setSearch(e.target.value)} data-testid="customer-search" />
          </div>
          <span className="text-xs text-slate-400">{allCustomers.length} customers</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs flex items-center gap-1.5" data-testid="add-walkin-btn">
          <UserPlus size={14} /> Add Walk-in
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Online Bookings</p>
          <p className="text-2xl font-bold text-cyan-500">{onlineCustomers.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Walk-ins</p>
          <p className="text-2xl font-bold text-slate-700">{walkinCustomers.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-2xl font-bold text-slate-900">{onlineCustomers.length + walkinCustomers.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Customer</th>
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Contact</th>
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Source</th>
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Bookings</th>
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Cert Level</th>
            </tr>
          </thead>
          <tbody>
            {allCustomers.map(c => (
              <tr key={c.id || c.user_id} className="border-b border-slate-50 hover:bg-slate-50/50" data-testid="customer-row">
                <td className="py-2.5 px-4 font-medium text-slate-800">{c.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{c.email || c.phone || '-'}</td>
                <td className="py-2.5 px-4">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.type === 'online' ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.type === 'online' ? 'Online' : c.source || 'Walk-in'}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-600">{c.total_bookings || c.num_dives || '-'}</td>
                <td className="py-2.5 px-4 text-slate-600">{c.certification_level || '-'}</td>
              </tr>
            ))}
            {allCustomers.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Walk-in Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="add-walkin-modal">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold">Add Walk-in Customer</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <input className="input-field text-sm" placeholder="Full Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} data-testid="walkin-name" />
              <div className="grid grid-cols-2 gap-3">
                <input className="input-field text-sm" placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                <input className="input-field text-sm" placeholder="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select className="input-field text-sm" value={form.certification_level} onChange={e => setForm(p => ({ ...p, certification_level: e.target.value }))}>
                  <option value="">Certification Level</option>
                  <option value="None">None</option>
                  <option value="Open Water">Open Water</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Rescue">Rescue</option>
                  <option value="Divemaster">Divemaster</option>
                  <option value="Instructor">Instructor</option>
                </select>
                <input type="number" className="input-field text-sm" placeholder="# of dives" value={form.num_dives || ''} onChange={e => setForm(p => ({ ...p, num_dives: parseInt(e.target.value) || 0 }))} />
              </div>
              <select className="input-field text-sm" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                <option value="walk-in">Walk-in</option>
                <option value="referral">Referral</option>
                <option value="phone">Phone Call</option>
                <option value="social_media">Social Media</option>
                <option value="hotel">Hotel / Resort</option>
                <option value="other">Other</option>
              </select>
              <textarea className="input-field text-sm h-16 resize-none" placeholder="Notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={addWalkin} className="flex-1 btn-primary py-2 text-sm" data-testid="save-walkin-btn">Save Customer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
