import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Wrench, Plus, X, Trash2, Edit3, AlertTriangle, CheckCircle } from 'lucide-react';

const CATEGORIES = ['BCD', 'Regulator', 'Wetsuit', 'Mask', 'Fins', 'Tank', 'Computer', 'Torch', 'Camera', 'SMB', 'Other'];
const CONDITIONS = ['new', 'good', 'fair', 'needs_service', 'retired'];

export default function OperatorEquipment() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', category: 'BCD', serial_number: '', quantity: 1, available: 1,
    condition: 'good', rental_price: 0, purchase_date: '', last_service_date: '',
    next_service_date: '', notes: '',
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchEquipment(); }, []);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/operator-listings/equipment');
      setItems(res.data.equipment || []);
    } catch (e) { toast.error('Failed to load equipment'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    try {
      if (editing) {
        await axios.put(`/operator-listings/equipment/${editing}`, form);
        toast.success('Equipment updated');
      } else {
        await axios.post('/operator-listings/equipment', form);
        toast.success('Equipment added');
      }
      setShowForm(false);
      setEditing(null);
      resetForm();
      fetchEquipment();
    } catch (e) { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this equipment?')) return;
    try {
      await axios.delete(`/operator-listings/equipment/${id}`);
      toast.success('Deleted');
      fetchEquipment();
    } catch (e) { toast.error('Failed to delete'); }
  };

  const startEdit = (item) => {
    setForm({ ...item });
    setEditing(item.id);
    setShowForm(true);
  };

  const resetForm = () => setForm({ name: '', category: 'BCD', serial_number: '', quantity: 1, available: 1, condition: 'good', rental_price: 0, purchase_date: '', last_service_date: '', next_service_date: '', notes: '' });

  const needsService = items.filter(i => i.condition === 'needs_service' || (i.next_service_date && new Date(i.next_service_date) <= new Date()));
  const totalItems = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalAvail = items.reduce((s, i) => s + (i.available || 0), 0);

  if (loading) return (
    <div className="space-y-3 py-4" data-testid="equipment-skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={`k${i}`} className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
          <div className="h-4 w-32 bg-slate-200/70 skeleton-shimmer rounded-md" />
          <div className="h-3 w-48 bg-slate-200/70 skeleton-shimmer rounded-md" />
          <div className="flex gap-3">
            <div className="h-3 w-16 bg-slate-200/70 skeleton-shimmer rounded-md" />
            <div className="h-3 w-16 bg-slate-200/70 skeleton-shimmer rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="operator-equipment">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{items.length} equipment types tracked</span>
        <button onClick={() => { resetForm(); setEditing(null); setShowForm(true); }} className="btn-primary text-xs flex items-center gap-1.5" data-testid="add-equipment-btn">
          <Plus size={14} /> Add Equipment
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Types</p>
          <p className="text-2xl font-bold text-slate-700">{items.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Total Units</p>
          <p className="text-2xl font-bold text-cyan-500">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Available</p>
          <p className="text-2xl font-bold text-green-500">{totalAvail}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-xs text-slate-500">Needs Service</p>
          <p className={`text-2xl font-bold ${needsService.length > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{needsService.length}</p>
        </div>
      </div>

      {/* Service Alerts */}
      {needsService.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800">Service Required</p>
            <p className="text-[10px] text-amber-600">{needsService.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Equipment Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Equipment</th>
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Category</th>
              <th className="text-center py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Qty</th>
              <th className="text-center py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Avail</th>
              <th className="text-left py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Condition</th>
              <th className="text-right py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Rental $</th>
              <th className="text-right py-2.5 px-4 font-semibold text-slate-500 text-[10px] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50" data-testid="equipment-row">
                <td className="py-2.5 px-4">
                  <p className="font-medium text-slate-800">{item.name}</p>
                  {item.serial_number && <p className="text-[9px] text-slate-400">S/N: {item.serial_number}</p>}
                </td>
                <td className="py-2.5 px-4 text-slate-500">{item.category}</td>
                <td className="py-2.5 px-4 text-center text-slate-600">{item.quantity}</td>
                <td className="py-2.5 px-4 text-center">
                  <span className={item.available > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>{item.available}</span>
                </td>
                <td className="py-2.5 px-4">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    item.condition === 'good' || item.condition === 'new' ? 'bg-green-100 text-green-700' :
                    item.condition === 'fair' ? 'bg-amber-100 text-amber-700' :
                    item.condition === 'needs_service' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                  }`}>{item.condition?.replace('_', ' ')}</span>
                </td>
                <td className="py-2.5 px-4 text-right font-medium">${item.rental_price || 0}</td>
                <td className="py-2.5 px-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => startEdit(item)} className="p-1 rounded text-slate-400 hover:text-cyan-600 hover:bg-cyan-50"><Edit3 size={12} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">No equipment tracked yet</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="equipment-form-modal">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold">{editing ? 'Edit Equipment' : 'Add Equipment'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <input className="input-field text-sm" placeholder="Equipment Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} data-testid="equip-name" />
              <div className="grid grid-cols-2 gap-3">
                <select className="input-field text-sm" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="input-field text-sm" value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}>
                  {CONDITIONS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <input className="input-field text-sm" placeholder="Serial Number" value={form.serial_number} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Total Qty</label>
                  <input type="number" className="input-field text-sm" min="0" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Available</label>
                  <input type="number" className="input-field text-sm" min="0" value={form.available} onChange={e => setForm(p => ({ ...p, available: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Rental $/day</label>
                  <input type="number" className="input-field text-sm" min="0" value={form.rental_price} onChange={e => setForm(p => ({ ...p, rental_price: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Last Service</label>
                  <input type="date" className="input-field text-sm" value={form.last_service_date} onChange={e => setForm(p => ({ ...p, last_service_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Next Service</label>
                  <input type="date" className="input-field text-sm" value={form.next_service_date} onChange={e => setForm(p => ({ ...p, next_service_date: e.target.value }))} />
                </div>
              </div>
              <textarea className="input-field text-sm h-16 resize-none" placeholder="Notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} className="flex-1 btn-primary py-2 text-sm" data-testid="save-equipment-btn">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
