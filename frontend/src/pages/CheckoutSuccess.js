import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import axios from 'axios';
import useCartStore from '../stores/cartStore';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState('loading');
  const [attempts, setAttempts] = useState(0);
  const clearCart = useCartStore(s => s.clearCart);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sessionId) pollStatus();
  }, [sessionId, attempts]);

  const finalizeOrder = async (txn) => {
    // Read shipping/cart context stashed by Cart.js handleCheckout before redirect.
    let pending = null;
    try {
      const raw = sessionStorage.getItem('bt_stripe_pending');
      pending = raw ? JSON.parse(raw) : null;
    } catch (e) { /* ignore */ }

    if (pending?.cart_checkout && pending.shipping) {
      try {
        await axios.post('/orders/create', {
          payment_id: txn.payment_id || sessionId,
          shipping: pending.shipping,
          currency: pending.currency || txn.currency,
          gst_amount: pending.gst_amount || 0,
        });
        if (pending.promo) {
          await axios.post('/promo-codes/apply', { code: pending.promo.code, discount: pending.promo.discount }).catch(() => {});
        }
        clearCart();
      } catch (e) {
        // Order creation can fail if cart is already empty (idempotent reload).
        // Webhook has already marked the payment paid; user can refresh /orders.
        console.warn('Order finalize failed:', e?.response?.data?.detail || e.message);
      }
    }

    try { sessionStorage.removeItem('bt_stripe_pending'); } catch (e) { /* ignore */ }
  };

  const pollStatus = async () => {
    if (attempts >= 8) { setStatus('timeout'); return; }
    try {
      // Phase 4-P3: Stripe status endpoint (replaces legacy /checkout/status)
      const res = await axios.get(`/payments/stripe/session/${sessionId}`);
      if (res.data.payment_status === 'paid') {
        await finalizeOrder(res.data);
        setStatus('success');
      } else if (res.data.status === 'expired') {
        setStatus('expired');
      } else {
        setTimeout(() => setAttempts(a => a + 1), 1500);
      }
    } catch (e) {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-6 py-20 text-center" data-testid="checkout-success-page">
        {status === 'loading' && (
          <div className="fade-in">
            <Loader className="animate-spin text-cyan-400 mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-bold mb-2">Processing payment...</h2>
            <p className="text-slate-500">Please wait while we confirm your payment</p>
          </div>
        )}
        {status === 'success' && (
          <div className="fade-in">
            <CheckCircle className="text-green-500 mx-auto mb-4" size={64} />
            <h2 className="text-3xl font-bold mb-2">Payment Successful!</h2>
            <p className="text-slate-500 mb-8">Thank you for your purchase. Your order is being processed.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/orders')} className="btn-primary px-6 py-3" data-testid="view-orders-btn">View Orders</button>
              <button onClick={() => navigate('/shop')} className="px-6 py-3 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50" data-testid="continue-shopping-btn">Continue Shopping</button>
            </div>
          </div>
        )}
        {(status === 'error' || status === 'expired' || status === 'timeout') && (
          <div className="fade-in">
            <XCircle className="text-red-400 mx-auto mb-4" size={64} />
            <h2 className="text-2xl font-bold mb-2">{status === 'timeout' ? 'Payment pending' : 'Payment issue'}</h2>
            <p className="text-slate-500 mb-8">Please check your email for confirmation or contact support.</p>
            <button onClick={() => navigate('/shop')} className="btn-primary px-8 py-3">Back to Shop</button>
          </div>
        )}
      </div>
    </div>
  );
}
