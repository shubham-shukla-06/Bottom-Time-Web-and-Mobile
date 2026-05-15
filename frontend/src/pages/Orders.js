import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import { Package, Truck, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, MapPin, Loader2 } from 'lucide-react';
import { OrderListSkeleton } from '../components/Skeletons';
import axios from 'axios';
import { toast } from 'sonner';
import useHighlightOnNavigate from '../hooks/useHighlightOnNavigate';

const STATUS_CONFIG = {
  confirmed: { icon: CheckCircle, color: 'text-cyan-600', bg: 'bg-cyan-50', label: 'Confirmed' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Cancelled' },
};
const FULFILLMENT_CONFIG = {
  pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Pending' },
  processing: { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Processing' },
  ready_to_ship: { icon: Package, color: 'text-violet-600', bg: 'bg-violet-50', label: 'Ready to Ship' },
  pickup_scheduled: { icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Pickup Scheduled' },
  shipped: { icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Shipped' },
  in_transit: { icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'In Transit' },
  out_for_delivery: { icon: MapPin, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Out for Delivery' },
  delivered: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'Delivered' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Cancelled' },
};

export default function Orders() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [trackingData, setTrackingData] = useState({});
  const [trackingLoading, setTrackingLoading] = useState({});

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) { navigate('/'); return; }
    (async () => {
      try {
        const res = await axios.get('/orders');
        setOrders(res.data.orders);
      } catch (e) { toast.error('Failed to load orders'); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const fetchTracking = async (orderId, awbCode) => {
    if (trackingData[orderId]) return; // Already fetched
    setTrackingLoading(p => ({ ...p, [orderId]: true }));
    try {
      const res = await axios.get(`/shipping/track/${awbCode}`);
      setTrackingData(p => ({ ...p, [orderId]: res.data }));
    } catch (e) {
      toast.error('Failed to fetch tracking');
    } finally {
      setTrackingLoading(p => ({ ...p, [orderId]: false }));
    }
  };

  // ?highlight=<order_id> from an order_update notification → scroll + ring
  useHighlightOnNavigate({
    ready: !loading,
    onMissing: () => toast.error('That order no longer exists.'),
  });

  if (!user) return null;
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-12 py-8" data-testid="orders-page">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">My Orders</h1>

        {loading && orders.length === 0 ? (
          <OrderListSkeleton count={4} />
        ) : orders.length > 0 ? (
          <div className="flex flex-col gap-4">
            {orders.map(order => {
              const isOpen = expanded === order.id;
              const f = FULFILLMENT_CONFIG[order.fulfillment_status] || FULFILLMENT_CONFIG.pending;
              const FIcon = f.icon;
              const awb = order.awb_code || order.tracking_number;
              const tracking = trackingData[order.id];
              const isTrackingLoading = trackingLoading[order.id];
              return (
                <div key={order.id} className="border border-slate-100 rounded-2xl overflow-hidden" data-testid="order-card">
                  <button onClick={() => setExpanded(isOpen ? null : order.id)} className="w-full p-4 sm:p-5 flex items-center gap-4 text-left hover:bg-slate-50/50 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${f.bg}`}>
                      <FIcon size={18} className={f.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm" data-testid="order-number">{order.order_number}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${f.bg} ${f.color}`}>{f.label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {order.item_count} item{order.item_count > 1 ? 's' : ''}</p>
                    </div>
                    <span className="font-bold text-sm">{order.currency} {order.total?.toLocaleString()}</span>
                    {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 border-t border-slate-100 pt-4 flex flex-col gap-4 fade-in">
                      {/* Items */}
                      <div className="flex flex-col gap-3">
                        {order.items?.map((item, i) => (
                          <div key={`k${i}`} className="flex items-center gap-3">
                            <img src={item.product_image} alt={item.product_name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-slate-50" loading="lazy" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm line-clamp-1">{item.product_name}</p>
                              <p className="text-xs text-slate-500">Qty: {item.quantity}{item.size ? ` · Size: ${item.size}` : ''}</p>
                            </div>
                            <span className="text-sm font-semibold">${item.line_total?.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Summary */}
                      <div className="bg-slate-50 rounded-xl p-3 flex flex-col gap-1 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{order.currency} {order.subtotal?.toLocaleString()}</span></div>
                        {order.gst_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{order.currency} {order.gst_amount?.toLocaleString()}</span></div>}
                        <div className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Total</span><span>{order.currency} {order.total?.toLocaleString()}</span></div>
                        {order.refunded_amount_display > 0 && (
                          <div className="flex justify-between text-orange-600 border-t border-slate-200 pt-1" data-testid={`order-refunded-${order.id}`}>
                            <span>Refunded</span>
                            <span className="font-semibold">-{order.currency} {order.refunded_amount_display.toLocaleString()}</span>
                          </div>
                        )}
                        {(order.display_currency || order.currency) !== 'INR' && order.fx_rate_locked && (
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed border-t border-slate-200 pt-1" data-testid={`order-fx-line-${order.id}`}>
                            Currency: {order.display_currency || order.currency} · FX Rate: ₹{Number(order.fx_rate_locked).toFixed(2)} per {order.display_currency || order.currency}
                            {order.fx_locked_at ? ` · Locked at: ${new Date(order.fx_locked_at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}
                            {order.amount_inr ? ` · ₹${Number(order.amount_inr).toLocaleString()} received` : ''}
                          </p>
                        )}
                      </div>

                      {/* Shipping */}
                      <div className="text-xs text-slate-500">
                        <p className="font-semibold text-slate-700 mb-1">Shipping to:</p>
                        <p>{order.shipping?.name}</p>
                        <p>{order.shipping?.address_line1}{order.shipping?.address_line2 ? `, ${order.shipping.address_line2}` : ''}</p>
                        <p>{order.shipping?.city}{order.shipping?.state ? `, ${order.shipping.state}` : ''} - {order.shipping?.pincode}</p>
                      </div>

                      {/* Order Tracking */}
                      {awb ? (
                        <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid="order-tracking-section">
                          <div className="bg-indigo-50 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Truck size={14} className="text-indigo-600" />
                              <span className="text-xs font-bold text-indigo-700">
                                {order.courier_name || 'Carrier'} · AWB: {awb}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {order.tracking_url && (
                                <a href={order.tracking_url} target="_blank" rel="noreferrer"
                                  className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 underline" data-testid="external-track-link">
                                  Track on Shiprocket
                                </a>
                              )}
                              {!tracking && (
                                <button
                                  onClick={() => fetchTracking(order.id, awb)}
                                  disabled={isTrackingLoading}
                                  className="text-[10px] font-bold bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                  data-testid="track-order-btn"
                                >
                                  {isTrackingLoading ? <Loader2 size={12} className="animate-spin" /> : 'Track Order'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Tracking Timeline */}
                          {tracking && (
                            <div className="p-4" data-testid="tracking-timeline">
                              {/* Current Status */}
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                  <Truck size={14} className="text-green-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{tracking.current_status || 'Status unavailable'}</p>
                                  {tracking.estimated_delivery && (
                                    <p className="text-[11px] text-slate-500">
                                      Est. delivery: {tracking.estimated_delivery}
                                    </p>
                                  )}
                                </div>
                                {tracking.mock && (
                                  <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium ml-auto">Demo</span>
                                )}
                              </div>

                              {/* Activity Timeline */}
                              {tracking.activities?.length > 0 && (
                                <div className="flex flex-col gap-0 ml-4 border-l-2 border-slate-200">
                                  {tracking.activities.map((act, idx) => (
                                    <div key={`k${idx}`} className="pl-4 pb-3 relative" data-testid={`tracking-activity-${idx}`}>
                                      <div className={`absolute -left-[7px] top-0.5 w-3 h-3 rounded-full border-2 ${
                                        idx === 0 ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'
                                      }`} />
                                      <p className="text-xs font-semibold text-slate-800">{act.activity || act.status}</p>
                                      <p className="text-[10px] text-slate-500">
                                        {act.location && <span>{act.location} · </span>}
                                        {act.date && new Date(act.date).toLocaleString('en-IN', {
                                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                        })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-2">
                          <Clock size={14} className="text-slate-400" />
                          <span className="text-xs text-slate-500">Tracking will be available once the order is shipped</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20">
            <Package className="text-slate-300 mx-auto mb-4" size={56} />
            <h3 className="text-xl font-bold mb-2">No orders yet</h3>
            <p className="text-slate-500 mb-6">Your purchases will appear here</p>
            <button onClick={() => navigate('/shop')} className="btn-primary px-6 py-2.5" data-testid="browse-shop-btn">Browse Shop</button>
          </div>
        )}
      </div>
    </div>
  );
}
