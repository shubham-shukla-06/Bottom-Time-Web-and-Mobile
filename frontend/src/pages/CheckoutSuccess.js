import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import axios from 'axios';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState('loading');
  const [attempts, setAttempts] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sessionId) pollStatus();
  }, [sessionId, attempts]);

  const pollStatus = async () => {
    if (attempts >= 5) { setStatus('timeout'); return; }
    try {
      const res = await axios.get(`/checkout/status/${sessionId}`);
      if (res.data.payment_status === 'paid') {
        setStatus('success');
      } else if (res.data.status === 'expired') {
        setStatus('expired');
      } else {
        setTimeout(() => setAttempts(a => a + 1), 2000);
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
            <button onClick={() => navigate('/shop')} className="btn-primary px-8 py-3" data-testid="continue-shopping-btn">Continue Shopping</button>
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
