import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, Package, X, Check, AlertTriangle, Upload } from 'lucide-react';
import { useBulkSelect } from '../../hooks/useBulkSelect';
import { BulkSelectCheckbox } from '../../components/admin/BulkSelectCheckbox';
import { BulkActionBar } from '../../components/admin/BulkActionBar';
import { BulkConfirmDialog } from '../../components/admin/BulkConfirmDialog';

export default function InventorySection() {
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [bulkAction, setBulkAction] = useState(null); // 'in_stock' | 'out_of_stock' | 'delete' | null

  const sel = useBulkSelect(products, (p) => p.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/products');
      setProducts(res.data.products);
      setSummary(res.data.summary);
      sel.clear();
    } catch (e) { toast.error('Failed to load products'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try { await axios.delete(`/admin/products/${id}`); toast.success('Deleted'); fetchProducts(); }
    catch (e) { toast.error('Failed to delete'); }
  };

  const handleToggleStock = async (product) => {
    try {
      await axios.put(`/admin/products/${product.id}`, { in_stock: !product.in_stock });
      fetchProducts();
    } catch (e) { toast.error('Failed to update'); }
  };

  const handleBulk = async () => {
    if (!bulkAction) return;
    try {
      const res = await axios.post('/admin/bulk/products/action', { ids: sel.selected, action: bulkAction });
      const verb = bulkAction === 'delete' ? 'deleted' : bulkAction === 'in_stock' ? 'marked in stock' : 'marked out of stock';
      toast.success(`${res.data.processed} product(s) ${verb}`);
      fetchProducts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk action failed');
      throw e;
    }
  };

  if (loading) return <div className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400 mx-auto"></div></div>;

  return (
    <div className="space-y-6" data-testid="inventory-section">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Products', value: summary.total, color: 'text-slate-700' },
          { label: 'Active', value: summary.active, color: 'text-green-600' },
          { label: 'Out of Stock', value: summary.out_of_stock, color: 'text-red-500' },
          { label: 'Total Stock', value: summary.total_stock, color: 'text-cyan-600' },
          { label: 'Total Sold', value: summary.total_sold, color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <p className="text-[10px] text-slate-500 font-semibold">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value?.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Add Product */}
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm" data-testid="add-product-btn">
          <Plus size={14} /> Add Product
        </button>
      </div>

      <BulkActionBar
        count={sel.count}
        total={products.length}
        onClear={sel.clear}
        actions={[
          { key: 'in_stock', label: 'Mark In Stock', tone: 'success', icon: <Check size={13} />, onClick: () => setBulkAction('in_stock'), testid: 'inv-bulk-in-stock' },
          { key: 'out_of_stock', label: 'Mark Out of Stock', tone: 'default', icon: <AlertTriangle size={13} />, onClick: () => setBulkAction('out_of_stock'), testid: 'inv-bulk-out-of-stock' },
          { key: 'delete', label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => setBulkAction('delete'), testid: 'inv-bulk-delete' },
        ]}
      />

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50/50">
                <th className="p-3 w-8">
                  <BulkSelectCheckbox
                    checked={sel.allSelected}
                    indeterminate={sel.someSelected}
                    onChange={sel.toggleAll}
                    testid="inv-select-all"
                    ariaLabel="Select all products"
                  />
                </th>
                <th className="p-3">Product</th>
                <th className="p-3">Category</th>
                <th className="p-3">Price</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Sold</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50" data-testid="product-row">
                  <td className="p-3">
                    <BulkSelectCheckbox
                      checked={sel.isSelected(p.id)}
                      onChange={() => sel.toggle(p.id)}
                      testid={`inv-select-${p.id}`}
                      ariaLabel={`Select ${p.name}`}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-slate-100" loading="lazy" />
                      <div>
                        <p className="font-semibold line-clamp-1">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.category === 'merch' ? 'bg-violet-50 text-violet-700' : p.category === 'essentials' ? 'bg-cyan-50 text-cyan-700' : 'bg-emerald-50 text-emerald-700'}`}>{p.category === 'essentials' ? 'Essentials' : p.category}</span></td>
                  <td className="p-3">
                    <span className="font-semibold">${p.price?.toFixed(2)}</span>
                    {p.compare_at_price && p.compare_at_price > p.price && (
                      <span className="text-[10px] text-slate-400 line-through ml-1">${p.compare_at_price?.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`font-semibold ${p.stock <= 0 ? 'text-red-500' : p.stock < 10 ? 'text-amber-500' : 'text-slate-700'}`}>
                      {p.stock <= 0 ? '0' : p.stock}
                    </span>
                    {p.stock > 0 && p.stock < 10 && <AlertTriangle size={12} className="inline ml-1 text-amber-500" />}
                  </td>
                  <td className="p-3 text-slate-500">{p.sold_count}</td>
                  <td className="p-3">
                    <button onClick={() => handleToggleStock(p)} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold cursor-pointer ${p.in_stock ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
                      {p.in_stock ? 'In Stock' : 'Out of Stock'}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg" data-testid={`edit-${p.id}`}><Edit3 size={14} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" data-testid={`delete-${p.id}`}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <ProductFormModal
          product={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); fetchProducts(); }}
        />
      )}

      <BulkConfirmDialog
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulk}
        title={bulkAction === 'delete' ? 'Delete products' : bulkAction === 'in_stock' ? 'Mark products in stock' : 'Mark products out of stock'}
        description={
          <>You're about to update <strong>{sel.count}</strong> product{sel.count === 1 ? '' : 's'}.{' '}
          {bulkAction === 'delete' ? 'This permanently removes them from the catalogue and cannot be undone.' : bulkAction === 'in_stock' ? 'These products will become purchasable in the shop.' : 'These products will be hidden from the shop but kept in inventory.'}
          </>
        }
        confirmLabel={bulkAction === 'delete' ? `Delete ${sel.count}` : `Update ${sel.count}`}
        tone={bulkAction === 'delete' ? 'danger' : 'primary'}
        requireTypedConfirmation={bulkAction === 'delete' ? 'DELETE' : null}
      />
    </div>
  );
}

function ProductFormModal({ product, onClose, onSaved }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'merch',
    description: product?.description || '',
    price: product?.price?.toString() || '',
    compare_at_price: product?.compare_at_price?.toString() || '',
    image_url: product?.image_url || '',
    images: product?.images || [],
    sizes: product?.sizes?.join(', ') || '',
    stock: product?.stock?.toString() || '100',
    weight: product?.weight?.toString() || '0.3',
    in_stock: product?.in_stock ?? true,
    highlights: product?.highlights?.join(', ') || '',
    tax_category: product?.tax_category || '',
    country_of_origin: product?.country_of_origin || 'India',
    manufacturer: product?.manufacturer || '',
    manufacturer_address: product?.manufacturer_address || '',
    importer: product?.importer || '',
    net_quantity: product?.net_quantity || '',
    warranty: product?.warranty || '',
    return_policy: product?.return_policy || '15-day easy return',
    delivery_estimate: product?.delivery_estimate || '5-7 business days',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [taxPreview, setTaxPreview] = useState(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-detect tax category when name changes and no manual override
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (form.tax_category || !form.name || form.name.length < 3) { setTaxPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.post('/admin/products/tax-preview', { name: form.name, category: form.category });
        setTaxPreview(res.data);
      } catch { setTaxPreview(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [form.name, form.category, form.tax_category]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/admin/products/upload-image', fd);
      if (!form.image_url) {
        set('image_url', res.data.url);
      } else {
        set('images', [...form.images, res.data.url]);
      }
      toast.success('Image uploaded');
    } catch (err) { toast.error('Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const removeImage = (idx) => {
    set('images', form.images.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price) { toast.error('Name and price are required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price) : null,
        stock: parseInt(form.stock) || 0,
        weight: parseFloat(form.weight) || 0.3,
        sizes: form.sizes ? form.sizes.split(',').map(s => s.trim()).filter(Boolean) : [],
        highlights: form.highlights ? form.highlights.split(',').map(h => h.trim()).filter(Boolean) : [],
        tax_category: form.tax_category || null,
      };
      if (isEdit) {
        await axios.put(`/admin/products/${product.id}`, payload);
        toast.success('Product updated');
      } else {
        await axios.post('/admin/products', payload);
        toast.success('Product created');
      }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4" data-testid="product-form-modal">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Image */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Product Images</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {form.image_url && (
                <div className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-100">
                  <img src={form.image_url} alt="Main" className="w-full h-full object-cover" loading="lazy" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5">Main</span>
                </div>
              )}
              {form.images.map((img, i) => (
                <div key={`k${i}`} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-100">
                  <img src={img} alt={`Extra ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  <button onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input-field text-sm flex-1" placeholder="Main image URL" value={form.image_url} onChange={e => set('image_url', e.target.value)} />
              <label className="px-3 py-2 text-sm font-semibold border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 flex items-center gap-1">
                <Upload size={14} /> {uploading ? '...' : 'Upload'}
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </label>
            </div>
            <p className="text-[9px] text-slate-400 mt-1">First upload sets main image. Additional uploads add to gallery.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Name *</label>
              <input className="input-field text-sm" value={form.name} onChange={e => set('name', e.target.value)} data-testid="product-name-input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Category</label>
              <select className="input-field text-sm" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="merch">Merch</option>
                <option value="gear">Gear</option>
                <option value="essentials">Dive Essentials</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Description</label>
            <textarea className="input-field text-sm h-16" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Price *</label>
              <input type="number" className="input-field text-sm" value={form.price} onChange={e => set('price', e.target.value)} data-testid="product-price-input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Compare Price</label>
              <input type="number" className="input-field text-sm" placeholder="Original price" value={form.compare_at_price} onChange={e => set('compare_at_price', e.target.value)} data-testid="compare-price-input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Stock</label>
              <input type="number" className="input-field text-sm" value={form.stock} onChange={e => set('stock', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Weight (kg)</label>
              <input type="number" step="0.1" min="0.1" className="input-field text-sm" placeholder="0.3" value={form.weight} onChange={e => set('weight', e.target.value)} data-testid="product-weight-input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Tax Category</label>
            <select className="input-field text-sm" value={form.tax_category} onChange={e => set('tax_category', e.target.value)} data-testid="tax-category-select">
                <option value="">Auto-detect</option>
                <option value="tshirts">T-shirts (5%)</option>
                <option value="apparel">Apparel (5%)</option>
                <option value="bags">Bags (18%)</option>
                <option value="accessories">Accessories (5%)</option>
                <option value="mugs_ceramic">Mugs (5%)</option>
                <option value="bottles_metal">Metal Bottles (18%)</option>
                <option value="dive_gear">Dive Gear (18%)</option>
                <option value="dive_suits">Dive Suits (5%)</option>
                <option value="electronics">Electronics (18%)</option>
                <option value="books">Books (0%)</option>
                <option value="stickers_prints">Stickers (5%)</option>
                <option value="footwear">Footwear (5%)</option>
                <option value="towels">Towels (5%)</option>
                <option value="watches">Watches (18%)</option>
                <option value="safety_kits">Safety Kits (12%)</option>
                <option value="sunscreen">Sunscreen/Care (18%)</option>
                <option value="phone_cases">Phone Cases (18%)</option>
                <option value="bottles_plastic">Plastic Bottles (5%)</option>
                <option value="magnets">Magnets/Souvenirs (18%)</option>
                <option value="general_merch">General (18%)</option>
            </select>
            {!form.tax_category && taxPreview && (
              <div className={`mt-1.5 px-3 py-2 rounded-lg text-xs ${taxPreview.gst_rate <= 5 ? 'bg-emerald-50 text-emerald-700' : taxPreview.gst_rate <= 12 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`} data-testid="tax-preview-banner">
                <p className="font-semibold">Auto-detected: {taxPreview.detected_category} — {taxPreview.gst_rate}% GST</p>
                <p className="text-[10px] opacity-75 mt-0.5">HSN: {taxPreview.hsn_code} · {taxPreview.description}</p>
                <p className="text-[10px] opacity-75">Wrong category? Select the correct one from the dropdown above.</p>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Sizes (comma separated)</label>
            <input className="input-field text-sm" placeholder="S, M, L, XL" value={form.sizes} onChange={e => set('sizes', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Highlights (comma separated)</label>
            <input className="input-field text-sm" placeholder="100% cotton, Machine washable" value={form.highlights} onChange={e => set('highlights', e.target.value)} />
          </div>
          {/* India Compliance Fields */}
          <div className="border-t border-slate-100 pt-3 mt-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">India Marketplace Compliance</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Country of Origin *</label>
                <input className="input-field text-sm" value={form.country_of_origin} onChange={e => set('country_of_origin', e.target.value)} data-testid="country-origin-input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Manufacturer / Brand</label>
                <input className="input-field text-sm" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Manufacturer Address</label>
              <input className="input-field text-sm" placeholder="City, State, Country" value={form.manufacturer_address} onChange={e => set('manufacturer_address', e.target.value)} />
            </div>
            <div className="mt-2">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Importer Details (if imported)</label>
              <input className="input-field text-sm" placeholder="Importer name & address" value={form.importer} onChange={e => set('importer', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Net Quantity</label>
                <input className="input-field text-sm" placeholder="e.g., 1 piece, 100ml" value={form.net_quantity} onChange={e => set('net_quantity', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Warranty</label>
                <input className="input-field text-sm" placeholder="e.g., 1-year" value={form.warranty} onChange={e => set('warranty', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Return Policy</label>
                <input className="input-field text-sm" value={form.return_policy} onChange={e => set('return_policy', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Delivery Estimate</label>
                <input className="input-field text-sm" value={form.delivery_estimate} onChange={e => set('delivery_estimate', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 btn-primary py-2.5 text-sm" data-testid="save-product-btn">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
