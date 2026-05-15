import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Package, Truck, Tag, MapPin, Clock, CheckCircle, XCircle, Search, Printer, Calendar, Eye, ChevronDown, ExternalLink, Undo2 } from 'lucide-react';
import { SectionHeader, Tile, EmptyState, Loader } from './primitives';
import RefundModal from '../../components/admin/RefundModal';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-slate-100 text-slate-600',
};

export default function FulfillmentSection() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOrders(); }, [filterStatus]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.fulfillment = filterStatus;
      if (search) params.search = search;
      const res = await axios.get('/fulfillment/orders', { params });
      setOrders(res.data.orders);
      setSummary(res.data.summary);
    } catch (e) { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  };

  const createShipment = async (orderId) => {
    setActionLoading(orderId);
    try {
      const res = await axios.post(`/fulfillment/orders/${orderId}/create-shipment`, { weight: 0.5, length: 20, breadth: 15, height: 10 });
      toast.success(`Shipment created: ${res.data.shipment_id}`);
      fetchOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create shipment'); }
    finally { setActionLoading(null); }
  };

  const generateLabel = async (orderId) => {
    setActionLoading(orderId);
    try {
      const res = await axios.post(`/fulfillment/orders/${orderId}/generate-label`);
      if (res.data.label_url) window.open(res.data.label_url, '_blank');
      toast.success('Label generated');
      fetchOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to generate label'); }
    finally { setActionLoading(null); }
  };

  const schedulePickup = async (orderId) => {
    setActionLoading(orderId);
    try {
      await axios.post(`/fulfillment/orders/${orderId}/schedule-pickup`, {});
      toast.success('Pickup scheduled');
      fetchOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to schedule pickup'); }
    finally { setActionLoading(null); }
  };

  const updateStatus = async (orderId, status) => {
    setActionLoading(orderId);
    try {
      await axios.put(`/fulfillment/orders/${orderId}/status`, { fulfillment_status: status });
      toast.success(`Status updated to ${status}`);
      fetchOrders();
    } catch (e) { toast.error('Failed to update status'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="fulfillment-section">
      <SectionHeader title="Order Fulfillment" sectionKey="fulfillment" sub="Manage shipments, labels, and pickups via Shiprocket" />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Tile label="Total Orders" value={summary.total} icon={Package} color="slate" />
        <Tile label="Pending" value={summary.pending} icon={Clock} color="cyan" />
        <Tile label="Processing" value={summary.processing} icon={Truck} color="cyan" />
        <Tile label="Shipped" value={summary.shipped} icon={Truck} color="cyan" />
        <Tile label="Delivered" value={summary.delivered} icon={CheckCircle} color="cyan" />
        <Tile label="Cancelled" value={summary.cancelled} icon={XCircle} color="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input placeholder="Search orders, customers..." className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-cyan-400"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchOrders()} data-testid="fulfillment-search" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-3 py-2 outline-none" data-testid="fulfillment-filter">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? <EmptyState text="No orders found" /> : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow" data-testid={`order-card-${order.id}`}>
              {/* Order Header */}
              <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{order.order_number}</p>
                    <p className="text-[10px] text-slate-500">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">{order.user_name}</p>
                    <p className="text-[10px] text-slate-400">{order.user_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900">{order.currency} {order.total?.toFixed(2)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[order.fulfillment_status] || STATUS_COLORS.pending}`}>
                    {order.fulfillment_status || 'pending'}
                  </span>
                  <span className="text-xs text-slate-300">{order.item_count} items</span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${expandedOrder === order.id ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded Details */}
              {expandedOrder === order.id && (
                <div className="border-t border-slate-100 p-4 space-y-4">
                  {/* Items */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Items</p>
                    <div className="space-y-2">
                      {order.items?.map((item, i) => (
                        <div key={`k${i}`} className="flex items-center gap-3 text-xs">
                          {item.product_image && <img src={item.product_image} alt="" className="w-10 h-10 rounded object-cover" loading="lazy" />}
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{item.product_name}</p>
                            {item.size && <p className="text-[10px] text-slate-400">Size: {item.size}</p>}
                          </div>
                          <span className="text-slate-500">x{item.quantity}</span>
                          <span className="font-semibold text-slate-700">{order.currency} {item.line_total?.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shipping Address */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ship To</p>
                    <div className="text-xs text-slate-600 flex items-start gap-2">
                      <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">{order.shipping?.name}</p>
                        <p>{order.shipping?.address_line1}{order.shipping?.address_line2 ? `, ${order.shipping.address_line2}` : ''}</p>
                        <p>{order.shipping?.city}, {order.shipping?.state} {order.shipping?.pincode}</p>
                        <p>{order.shipping?.country} | {order.shipping?.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Shiprocket Info */}
                  {order.shiprocket_shipment_id && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Shipment Info</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-400">SR Order:</span> <span className="font-medium">{order.shiprocket_order_id}</span></div>
                        <div><span className="text-slate-400">Shipment:</span> <span className="font-medium">{order.shiprocket_shipment_id}</span></div>
                        {order.tracking_number && <div><span className="text-slate-400">Tracking:</span> <span className="font-medium">{order.tracking_number}</span></div>}
                        {order.pickup_scheduled && <div><span className="text-slate-400">Pickup:</span> <span className="font-medium text-green-600">Scheduled</span></div>}
                      </div>
                      {order.label_url && (
                        <a href={order.label_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700">
                          <ExternalLink size={10} /> View Label
                        </a>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    {!order.shiprocket_shipment_id && order.fulfillment_status !== 'cancelled' && (
                      <button onClick={() => createShipment(order.id)} disabled={actionLoading === order.id}
                        className="px-3 py-1.5 bg-cyan-500 text-white text-[11px] font-semibold rounded-lg hover:bg-cyan-600 disabled:opacity-50" data-testid={`create-shipment-${order.id}`}>
                        <Truck size={12} className="inline mr-1" /> Create Shipment
                      </button>
                    )}
                    {order.shiprocket_shipment_id && !order.label_url && (
                      <button onClick={() => generateLabel(order.id)} disabled={actionLoading === order.id}
                        className="px-3 py-1.5 bg-slate-700 text-white text-[11px] font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50" data-testid={`gen-label-${order.id}`}>
                        <Printer size={12} className="inline mr-1" /> Print Label
                      </button>
                    )}
                    {order.shiprocket_shipment_id && !order.pickup_scheduled && (
                      <button onClick={() => schedulePickup(order.id)} disabled={actionLoading === order.id}
                        className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50" data-testid={`schedule-pickup-${order.id}`}>
                        <Calendar size={12} className="inline mr-1" /> Schedule Pickup
                      </button>
                    )}
                    {order.fulfillment_status === 'processing' && (
                      <button onClick={() => updateStatus(order.id, 'shipped')} disabled={actionLoading === order.id}
                        className="px-3 py-1.5 bg-green-500 text-white text-[11px] font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50" data-testid={`mark-shipped-${order.id}`}>
                        <CheckCircle size={12} className="inline mr-1" /> Mark Shipped
                      </button>
                    )}
                    {order.fulfillment_status === 'shipped' && (
                      <button onClick={() => updateStatus(order.id, 'delivered')} disabled={actionLoading === order.id}
                        className="px-3 py-1.5 bg-green-600 text-white text-[11px] font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50" data-testid={`mark-delivered-${order.id}`}>
                        <CheckCircle size={12} className="inline mr-1" /> Mark Delivered
                      </button>
                    )}
                    {order.fulfillment_status !== 'cancelled' && order.fulfillment_status !== 'delivered' && (
                      <button onClick={() => updateStatus(order.id, 'cancelled')} disabled={actionLoading === order.id}
                        className="px-3 py-1.5 bg-red-100 text-red-600 text-[11px] font-semibold rounded-lg hover:bg-red-200 disabled:opacity-50" data-testid={`cancel-order-${order.id}`}>
                        <XCircle size={12} className="inline mr-1" /> Cancel
                      </button>
                    )}
                    {order.payment_status === 'paid' || order.payment_status === 'partially_refunded' ? (
                      <button onClick={() => setRefundTarget(order)}
                        className="px-3 py-1.5 bg-orange-100 text-orange-700 text-[11px] font-semibold rounded-lg hover:bg-orange-200" data-testid={`refund-btn-${order.id}`}>
                        <Undo2 size={12} className="inline mr-1" /> Refund
                      </button>
                    ) : null}
                    {order.fx_rate_locked && order.display_currency !== 'INR' && (
                      <span className="ml-auto text-[10px] text-slate-500 self-center" data-testid={`fx-line-${order.id}`}>
                        FX ₹{order.fx_rate_locked}/{order.display_currency} · INR {Number(order.amount_inr || 0).toFixed(2)}
                        {order.refunded_amount_inr > 0 && (<span className="ml-1 text-orange-600">· refunded ₹{Number(order.refunded_amount_inr).toFixed(2)}</span>)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {refundTarget && (
        <RefundModal kind="order" target={refundTarget} onClose={() => setRefundTarget(null)} onSuccess={() => fetchOrders()} />
      )}
    </div>
  );
}
