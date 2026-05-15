import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import useCartStore from '../stores/cartStore';
import Navbar from '../components/Navbar';
import { ShoppingCart, ArrowLeft, CheckCircle, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useRazorpay } from 'react-razorpay';
import { CartSkeleton } from '../components/Skeletons';
import { CartItemList, SavedItemList, WishlistItemList } from './cart/CartItems';
import { AddressList, CarrierSelector, AddressForm, OrderSummary } from './cart/ShippingStep';
import { formatPrice, formatLineTotal, convertAndRound, getCurrencySymbol } from '../utils/currency';
import { computeCartTotals } from '../utils/cartCalc';
import { CURRENCY_OPTIONS } from '../hooks/useDiscoverFilters';

export default function Cart() {
  const user = useAuthStore(s => s.user);
  const globalRefreshCart = useCartStore(s => s.refreshCart);
  const cartItems = useCartStore(s => s.cartItems);
  const cartTotal = useCartStore(s => s.cartTotal);
  const clearCart = useCartStore(s => s.clearCart);
  const currency = useUIStore(s => s.currency);
  const exchangeRates = useUIStore(s => s.exchangeRates);
  const setGlobalCurrency = useUIStore(s => s.setCurrency);
  const refreshWishlist = useUIStore(s => s.refreshWishlist);
  const navigate = useNavigate();
  const { Razorpay } = useRazorpay();
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cartTax, setCartTax] = useState(null);
  const [step, setStep] = useState('cart');

  // ═══════════════════════════════════════════════════════════════
  // CART CURRENCY — tracks which currency the cart displays in.
  // Auto-switches to INR when a domestic (India) address is selected,
  // reverts to global currency for international addresses.
  // User can also manually override via the currency selector.
  // This is the currency that Order Summary, line items, AND
  // Razorpay all use — they must always match.
  // ═══════════════════════════════════════════════════════════════
  const [cartCurrency, setCartCurrency] = useState(currency);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [shipping, setShipping] = useState({ name: '', phone: '', country_code: '', house_number: '', street_address: '', address_line2: '', landmark: '', city: '', state: '', pincode: '', country: '', label: '' });
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [savedItems, setSavedItems] = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [defaultAddrId, setDefaultAddrId] = useState(null);
  const [selectedAddrId, setSelectedAddrId] = useState(null);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);
  const [deliveryEstimate, setDeliveryEstimate] = useState(null);
  const [shippingRates, setShippingRates] = useState(null);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const [shippingCost, setShippingCost] = useState(0);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(null);
  const reqClass = (val) => triedSave && !val ? '!border-red-400 !ring-red-100' : '';

  // Currency formatting — uses cartCurrency (not global currency) for consistency
  // cartCurrency auto-switches to INR for India addresses, user's choice otherwise
  const fmt = (amount, sourceCurrency = 'USD') => formatPrice(amount, cartCurrency, exchangeRates, sourceCurrency);
  const fmtLine = (unitPrice, qty, sourceCurrency = 'USD') => formatLineTotal(unitPrice, qty, cartCurrency, exchangeRates, sourceCurrency);
  const fmtShipping = (inr) => formatPrice(inr, cartCurrency, exchangeRates, 'INR');

  // Close currency picker on outside click
  useEffect(() => {
    if (!showCurrencyPicker) return;
    const handler = (e) => {
      if (!e.target.closest('[data-testid="cart-currency-selector"]')) {
        setShowCurrencyPicker(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showCurrencyPicker]);

  // ─── Data fetching ──────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await globalRefreshCart();
      try { const res = await axios.post('/tax/calculate-cart', {}); setCartTax(res.data); } catch (e) { /* silent */ }
      setLoading(false);
    };
    init();
    fetchAddresses(); fetchSaved(); fetchWishlist();
  }, []);

  const refreshCartAndTax = async (shippingCountry, shippingState) => {
    if (shippingCountry) setCartTax(null);
    await globalRefreshCart();
    const payload = {};
    if (shippingCountry) payload.shipping_country = shippingCountry;
    if (shippingState) payload.shipping_state = shippingState;
    try { const res = await axios.post('/tax/calculate-cart', payload); setCartTax(res.data); } catch (e) { /* silent */ }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step === 'shipping' && selectedAddrId && !shippingRates) {
      const addr = addresses.find(a => a.id === selectedAddrId);
      if (addr?.pincode) fetchDeliveryEstimate(addr.pincode, addr.country);
      if (addr?.country) refreshCartAndTax(addr.country, addr.state);
    }
  }, [step, selectedAddrId, addresses]);

  const fetchAddresses = async () => {
    try {
      const res = await axios.get('/user/addresses');
      setAddresses(res.data.addresses || []);
      setDefaultAddrId(res.data.default_id || null);
      if (res.data.default_id && !selectedAddrId) setSelectedAddrId(res.data.default_id);
    } catch (e) { /* silent */ }
  };

  const fetchDeliveryEstimate = async (pincode, country) => {
    if (!pincode || pincode.length < 4) { setDeliveryEstimate(null); setShippingRates(null); setShippingCost(0); setSelectedCarrier(null); setLoadingShipping(false); return; }
    setDeliveryEstimate(null); setShippingRates(null); setSelectedCarrier(null); setShippingCost(0); setLoadingShipping(true);
    try {
      const shippingPayload = cartItems.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
      const [simpleRes, ratesRes] = await Promise.all([
        axios.get(`/delivery-estimate-simple?pincode=${pincode}&country=${encodeURIComponent(country || 'India')}`),
        axios.post('/shipping/rates', { delivery_pincode: pincode, delivery_country: country || 'India', cart_items: shippingPayload })
      ]);
      setDeliveryEstimate(simpleRes.data);
      setShippingRates(ratesRes.data);
      if (ratesRes.data.cheapest) { setSelectedCarrier(ratesRes.data.cheapest); setShippingCost(ratesRes.data.cheapest.rate); }
    } catch (e) { setDeliveryEstimate(null); setShippingRates(null); } finally { setLoadingShipping(false); }
  };

  const fetchSaved = async () => { try { setSavedItems((await axios.get('/cart/saved-for-later')).data.items || []); } catch (e) { /* silent */ } };
  const fetchWishlist = async () => { try { setWishlistItems((await axios.get('/wishlist/products')).data.products || []); } catch (e) { /* silent */ } };

  // ─── Cart actions ──────────────────────────────────────────
  const removeItem = async (productId) => { try { await axios.delete(`/cart/${productId}`); toast.success('Removed'); refreshCartAndTax(); } catch (e) { toast.error('Failed to remove'); } };
  const updateQuantity = async (productId, size, newQty) => {
    setUpdatingItem(`${productId}-${size || ''}`);
    try { await axios.put(`/cart/update?product_id=${productId}&quantity=${newQty}${size ? `&size=${size}` : ''}`); await refreshCartAndTax(); } catch (e) { toast.error('Failed to update'); }
    finally { setUpdatingItem(null); }
  };
  const handleSaveForLater = async (productId, size) => { try { await axios.post(`/cart/save-for-later?product_id=${productId}${size ? `&size=${size}` : ''}`); toast.success('Saved for later'); refreshCartAndTax(); fetchSaved(); } catch (e) { toast.error('Failed'); } };
  const handleMoveToCart = async (productId) => { try { await axios.post(`/cart/move-to-cart?product_id=${productId}`); toast.success('Moved to cart'); refreshCartAndTax(); fetchSaved(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed to move to cart'); } };
  const handleMoveToWishlist = async (productId) => { try { await axios.post(`/wishlist/product/${productId}/add`); await axios.delete(`/cart/${productId}`); toast.success('Moved to wishlist'); refreshCartAndTax(); refreshWishlist(); fetchWishlist(); } catch (e) { toast.error('Failed'); } };
  const handleRemoveSaved = async (productId) => { try { await axios.delete(`/cart/saved-for-later/${productId}`); fetchSaved(); } catch (e) { /* silent */ } };
  const handleWishlistToCart = async (productId) => { try { await axios.post(`/cart/add?product_id=${productId}&quantity=1`); await axios.post(`/wishlist/product/${productId}`); toast.success('Moved to cart'); refreshCartAndTax(); fetchWishlist(); refreshWishlist(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed to move to cart'); } };
  const handleRemoveWishlist = async (productId) => { try { await axios.post(`/wishlist/product/${productId}`); fetchWishlist(); refreshWishlist(); } catch (e) { /* silent */ } };

  // ─── Address actions ──────────────────────────────────────────
  const getSelectedAddress = () => addresses.find(a => a.id === selectedAddrId);
  const selectCarrier = (carrier) => { setSelectedCarrier(carrier); setShippingCost(carrier.rate); };
  const deleteAddress = async (id) => { await axios.delete(`/user/addresses/${id}`); if (selectedAddrId === id) setSelectedAddrId(null); fetchAddresses(); };
  const setDefault = async (id) => { await axios.put(`/user/addresses/${id}/default`); setDefaultAddrId(id); toast.success('Default address set'); };
  const onAddressSelect = (a) => {
    setSelectedAddrId(a.id);
    fetchDeliveryEstimate(a.pincode, a.country);
    refreshCartAndTax(a.country, a.state);
    // Auto-switch cart currency: India address → INR, international → global currency
    if (a.country?.toLowerCase() === 'india') {
      setCartCurrency('INR');
    } else {
      setCartCurrency(currency);
    }
  };
  const onEditAddress = (a) => { setEditingAddr(a); setTriedSave(false); setShipping({ ...a, house_number: '', street_address: a.address_line1 || '', landmark: a.landmark || '' }); setShowAddrForm(true); };
  const onAddNew = () => { setEditingAddr(null); setTriedSave(false); setShipping({ name: '', phone: '', country_code: '', house_number: '', street_address: '', address_line2: '', landmark: '', city: '', state: '', pincode: '', country: '', label: '' }); setShowAddrForm(true); };
  const saveAddress = async () => {
    if (!shipping.name || !shipping.phone || !shipping.country_code || !shipping.house_number || !shipping.street_address || !shipping.city || !shipping.state || !shipping.pincode || !shipping.country) { setTriedSave(true); toast.error('Fill all required fields'); return; }
    const address_line1 = [shipping.house_number, shipping.street_address].filter(Boolean).join(', ');
    const data = { name: shipping.name, phone: shipping.phone, country_code: shipping.country_code, address_line1, address_line2: shipping.address_line2, landmark: shipping.landmark, city: shipping.city, state: shipping.state, pincode: shipping.pincode, country: shipping.country, label: shipping.label };
    try {
      if (editingAddr) { await axios.put(`/user/addresses/${editingAddr.id}`, data); toast.success('Address updated'); }
      else { data.is_default = addresses.length === 0; const res = await axios.post('/user/addresses', data); setSelectedAddrId(res.data.id); toast.success('Address saved'); }
      setShowAddrForm(false); setEditingAddr(null);
      const savedCountry = shipping.country;
      const savedState = shipping.state;
      const savedPincode = shipping.pincode;
      setShipping({ name: '', phone: '', country_code: '', house_number: '', street_address: '', address_line2: '', landmark: '', city: '', state: '', pincode: '', country: '', label: '' });
      fetchAddresses();
      if (savedCountry) refreshCartAndTax(savedCountry, savedState);
      if (savedPincode) fetchDeliveryEstimate(savedPincode, savedCountry);
      // Auto-switch cart currency based on saved address country
      if (savedCountry?.toLowerCase() === 'india') setCartCurrency('INR');
      else setCartCurrency(currency);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
  };

  // ─── Promo & Checkout ──────────────────────────────────────────
  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return; setPromoLoading(true);
    try { const res = await axios.post('/promo-codes/validate', { code: promoCode, order_total: cartTax?.totals?.total || cartTotal, applies_to: 'shop' }); setPromoResult(res.data); toast.success(`${res.data.description} applied!`); }
    catch (e) { setPromoResult(null); toast.error(e.response?.data?.detail || 'Invalid code'); }
    finally { setPromoLoading(false); }
  };
  const removePromo = () => { setPromoResult(null); setPromoCode(''); };

  // ═══════════════════════════════════════════════════════════════
  // CHECKOUT HANDLER — Uses totals from computeCartTotals().
  // DO NOT recompute amounts here. The `totals` object (above)
  // ensures display and payment use identical numbers.
  // ═══════════════════════════════════════════════════════════════
  const handleCheckout = async () => {
    if (!getSelectedAddress()) { toast.error('Please select a shipping address'); return; }
    setCheckingOut(true); setStep('paying');
    // Recompute totals at checkout time with shipping included
    const checkoutTotals = computeCartTotals({
      cartItems, cartTax,
      shippingCostINR: shippingCost,
      displayCurrency: cartCurrency,
      exchangeRates, promoResult, cartTotal,
    });
    try {
      const res = await axios.post('/payments/create-order', {
        amount: checkoutTotals.razorpayAmount,
        currency: checkoutTotals.razorpayCurrency,
        cart_checkout: true,
        base_amount: checkoutTotals.baseUSD,
        gst_amount: checkoutTotals.gstUSD,
        shipping_amount: checkoutTotals.shippingUSD,
        shipping_carrier: selectedCarrier?.carrier,
        is_export: !cartTax?.is_domestic,
      });
      const createOrder = async (paymentId) => {
        const addr = getSelectedAddress();
        const order = await axios.post('/orders/create', { payment_id: paymentId, shipping: addr, currency: cartCurrency, gst_amount: checkoutTotals.gstUSD });
        if (promoResult) await axios.post('/promo-codes/apply', { code: promoResult.code, order_id: order.data.id, discount: checkoutTotals.discountDisplay }).catch(() => {});
      };
      if (res.data.mock) {
        const verifyRes = await axios.post('/payments/mock-verify', { order_id: res.data.order_id });
        if (verifyRes.data.verified) { await createOrder(verifyRes.data.payment_id); setPaymentSuccess(true); clearCart(); }
        setCheckingOut(false); return;
      }
      const options = { key: res.data.key_id, amount: res.data.amount, currency: res.data.currency, order_id: res.data.order_id, name: 'Bottom Time', description: 'Shop Purchase',
        handler: async (response) => { try { const verifyRes = await axios.post('/payments/verify', { razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }); if (verifyRes.data.verified) { await createOrder(verifyRes.data.payment_id); setPaymentSuccess(true); clearCart(); } } catch (e) { toast.error('Payment verification failed'); } setCheckingOut(false); },
        modal: { ondismiss: () => { setCheckingOut(false); setStep('shipping'); } },
        prefill: { name: getSelectedAddress()?.name, email: user?.email, contact: getSelectedAddress()?.phone || user?.phone },
        theme: { color: '#0e7490' }
      };
      new Razorpay(options).open();
    } catch (e) { toast.error(e.response?.data?.detail || 'Checkout failed'); setCheckingOut(false); setStep('shipping'); }
  };

  // ─── Render ──────────────────────────────────────────

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-white"><Navbar />
        <div className="max-w-lg mx-auto px-6 py-20 text-center" data-testid="payment-success">
          <CheckCircle className="text-green-500 mx-auto mb-4" size={64} />
          <h2 className="text-3xl font-bold mb-2">Order Placed!</h2>
          <p className="text-slate-500 mb-8">Thank you for your purchase. We'll notify you when it ships.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/orders')} className="btn-primary px-6 py-2.5" data-testid="view-orders-btn">View Orders</button>
            <button onClick={() => navigate('/shop')} className="px-6 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50" data-testid="continue-shopping-btn">Continue Shopping</button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CART TOTALS — Single source of truth via computeCartTotals().
  // DO NOT compute totals inline. Always use `totals.*` below.
  // See /src/utils/cartCalc.js for the formula and currency logic.
  // ═══════════════════════════════════════════════════════════════
  const totals = computeCartTotals({
    cartItems,
    cartTax,
    shippingCostINR: step === 'shipping' ? shippingCost : 0,
    displayCurrency: cartCurrency,
    exchangeRates,
    promoResult,
    cartTotal,
  });
  const displaySubtotal = totals.displaySubtotal;
  const gstAmount = totals.gstDisplay;
  const shippingInDisplay = totals.shippingDisplay;
  const payTotal = totals.grandTotal;
  const discount = totals.discountDisplay;
  // fmtVal: formats a value already in cartCurrency (no conversion)
  const fmtVal = (v) => formatPrice(v, cartCurrency, exchangeRates, cartCurrency);

  return (
    <div className="min-h-screen bg-white"><Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-12 py-8" data-testid="cart-page">
        <button onClick={() => step === 'shipping' ? setStep('cart') : navigate('/shop')} className="flex items-center gap-2 text-slate-500 hover:text-cyan-400 mb-6 text-sm font-medium transition-colors" data-testid="back-btn">
          <ArrowLeft size={18} /> {step === 'shipping' ? 'Back to Cart' : 'Back to Shop'}
        </button>
        <div className="flex items-center gap-2 mb-6 text-xs font-semibold">
          <span className={step === 'cart' ? 'text-cyan-600' : 'text-slate-400'}>Cart</span><span className="text-slate-300">→</span>
          <span className={step === 'shipping' ? 'text-cyan-600' : 'text-slate-400'}>Shipping</span><span className="text-slate-300">→</span>
          <span className={step === 'paying' ? 'text-cyan-600' : 'text-slate-400'}>Payment</span>
        </div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{step === 'shipping' ? 'Shipping Address' : 'Your Cart'}</h1>
          {/* Currency selector — matches Discover page pattern */}
          <div className="relative" data-testid="cart-currency-selector">
            <button
              onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
              data-testid="cart-currency-btn"
            >
              {CURRENCY_OPTIONS.find(c => c.code === cartCurrency)?.symbol || cartCurrency}
              <span className="text-[10px] text-slate-400">{cartCurrency}</span>
              <ChevronDown size={10} />
            </button>
            {showCurrencyPicker && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 max-h-52 overflow-y-auto w-36" data-testid="cart-currency-dropdown">
                {CURRENCY_OPTIONS.map(c => (
                  <button
                    key={c.code}
                    onClick={() => { setCartCurrency(c.code); setGlobalCurrency(c.code); setShowCurrencyPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${cartCurrency === c.code ? 'font-bold text-cyan-400 bg-cyan-50' : 'text-slate-600'}`}
                    data-testid={`cart-cur-${c.code}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && cartItems.length === 0 && savedItems.length === 0 && wishlistItems.length === 0 ? (
          <CartSkeleton count={3} />
        ) : cartItems.length > 0 || savedItems.length > 0 || wishlistItems.length > 0 ? (
          <>
            {step === 'cart' && (
              <>
                <CartItemList cartItems={cartItems} fmt={fmt} fmtLine={fmtLine} updatingItem={updatingItem} updateQuantity={updateQuantity} removeItem={removeItem} handleSaveForLater={handleSaveForLater} handleMoveToWishlist={handleMoveToWishlist} />
                <div className="bg-slate-50 rounded-2xl p-5">
                  <div className="mb-4">
                    {promoResult ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2" data-testid="promo-applied">
                        <div><span className="text-xs font-bold text-green-700">{promoResult.code}</span><span className="text-xs text-green-600 ml-2">{promoResult.description}</span></div>
                        <button onClick={removePromo} className="text-xs text-red-500 hover:text-red-600 font-semibold" data-testid="remove-promo-btn">Remove</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input className="input-field text-sm flex-1" placeholder="Promo code" value={promoCode} onChange={e => setPromoCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleApplyPromo()} data-testid="promo-input" />
                        <button onClick={handleApplyPromo} disabled={promoLoading || !promoCode.trim()} className="px-4 py-2 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50" data-testid="apply-promo-btn">{promoLoading ? '...' : 'Apply'}</button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm font-bold"><span>Sub-Total</span><span>{fmtVal(displaySubtotal)}</span></div>
                    <div className="flex justify-between text-sm" data-testid="cart-gst-line"><span className="text-slate-500">Goods and Services Tax</span><span className="text-slate-400 text-sm font-bold">Calculated at shipping</span></div>
                    <div className="flex justify-between text-sm" data-testid="cart-shipping-line"><span className="text-slate-500">Shipping</span><span className="text-slate-400 text-sm font-bold">Calculated at shipping</span></div>
                    {discount > 0 && <div className="flex justify-between text-sm text-green-600" data-testid="cart-discount-line"><span>Discount</span><span className="font-semibold">-{fmtVal(discount)}</span></div>}
                    <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-bold text-xl">Grand Total</span><span className="text-slate-400 text-xl font-bold">Calculated at shipping</span></div>
                  </div>
                  <button onClick={() => setStep('shipping')} className="btn-primary w-full text-sm" data-testid="proceed-shipping-btn">Proceed to Shipping</button>
                </div>
                <SavedItemList savedItems={savedItems} fmt={fmt} handleMoveToCart={handleMoveToCart} handleRemoveSaved={handleRemoveSaved} />
                <WishlistItemList wishlistItems={wishlistItems} fmt={fmt} handleWishlistToCart={handleWishlistToCart} handleRemoveWishlist={handleRemoveWishlist} />
              </>
            )}
            {step === 'shipping' && (
              <>
                {!showAddrForm && <AddressList addresses={addresses} defaultAddrId={defaultAddrId} selectedAddrId={selectedAddrId} onSelect={onAddressSelect} onSetDefault={setDefault} onEdit={onEditAddress} onDelete={deleteAddress} onAddNew={onAddNew} />}
                {selectedAddrId && !showAddrForm && <CarrierSelector loadingShipping={loadingShipping} deliveryEstimate={deliveryEstimate} shippingRates={shippingRates} selectedCarrier={selectedCarrier} selectedCity={getSelectedAddress()?.city} onSelectCarrier={selectCarrier} fmtShipping={fmtShipping} />}
                {showAddrForm && <AddressForm shipping={shipping} setShipping={setShipping} editingAddr={editingAddr} onSave={saveAddress} onCancel={() => { setShowAddrForm(false); setEditingAddr(null); }} reqClass={reqClass} />}
                <OrderSummary cartItems={cartItems} cartTax={cartTax} displaySubtotal={displaySubtotal} gstAmount={gstAmount} shippingCost={shippingCost} shippingDisplay={shippingInDisplay} selectedCarrier={selectedCarrier} selectedAddrId={selectedAddrId} loadingShipping={loadingShipping} fmt={fmt} fmtLine={fmtLine} fmtVal={fmtVal} fmtShipping={fmtShipping} payTotal={payTotal} checkingOut={checkingOut} onCheckout={handleCheckout} />
              </>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <ShoppingCart className="text-slate-300 mx-auto mb-4" size={56} />
            <h3 className="text-xl font-bold mb-2">Your cart is empty</h3>
            <p className="text-slate-500 mb-6">Add some gear or merch to get started</p>
            <button onClick={() => navigate('/shop')} className="btn-primary px-6 py-2.5">Browse Shop</button>
          </div>
        )}
      </div>
    </div>
  );
}
