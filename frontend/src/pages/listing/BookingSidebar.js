import { useState, useMemo } from 'react';
import { CalendarDays, CheckCircle, Loader2, Minus, Plus } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useRazorpay } from 'react-razorpay';
import useAuthStore from '../../stores/authStore';
import { Calendar } from '../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { formatPrice, formatLineTotal, convertAndRound } from '../../utils/currency';
import ComplianceDialog from './ComplianceDialog';
import { getStoredAttribution } from '../../hooks/useShareTracking';

export default function BookingSidebar({ listing, user, openAuth, id, currency, exchangeRates, availableDates }) {
  const { Razorpay } = useRazorpay();
  const listCur = listing?.currency || 'USD'; // the currency the operator listed in
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingParticipants, setBookingParticipants] = useState(1);
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingSaving, setBookingSaving] = useState(false);
  const [checkoutTax, setCheckoutTax] = useState(null);
  const [showCompliance, setShowCompliance] = useState(false);
  const [complianceData, setComplianceData] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const availableModifiers = useMemo(() => ({ available: availableDates.map(d => new Date(d + 'T12:00:00')) }), [availableDates]);
  const availableModifierStyles = useMemo(() => ({ available: { fontWeight: 700, color: '#0e7490' } }), []);

  const maxPerBooking = listing?.max_per_booking || listing?.max_participants || 20;

  // Client-side price: convert from listing currency to user's display currency
  const unitDisplay = convertAndRound(listing?.price || 0, listCur, currency, exchangeRates);
  const lineTotal = Math.round(unitDisplay * bookingParticipants * 100) / 100;

  const [taxLoading, setTaxLoading] = useState(false);

  const fetchTax = (participants) => {
    if (listing?.price > 0 && user) {
      setTaxLoading(true);
      axios.post('/tax/calculate-checkout', { listing_id: id, participants })
        .then(r => setCheckoutTax(r.data))
        .catch(() => {})
        .finally(() => setTaxLoading(false));
    }
  };

  const updateParticipants = (val) => {
    const clamped = Math.max(1, Math.min(maxPerBooking, val));
    setBookingParticipants(clamped);
    fetchTax(clamped);
  };

  const handlePayClick = async () => {
    if (!bookingDate) { toast.error('Please select a date'); return; }
    try {
      const res = await axios.post('/tax/booking-compliance', {
        listing_id: id,
        participants: bookingParticipants,
        residence_country: user?.location_country || '',
      });
      setComplianceData(res.data);
      setShowCompliance(true);
    } catch (e) {
      handleBook();
    }
  };

  const handleComplianceConfirm = (residenceCountry, updatedCompliance) => {
    setShowCompliance(false);
    const finalCompliance = updatedCompliance || complianceData;
    if (updatedCompliance) setComplianceData(updatedCompliance);
    if (residenceCountry && residenceCountry !== user?.location_country) {
      axios.put('/auth/profile', { location_country: residenceCountry })
        .then(() => { useAuthStore.getState().setUser({ ...user, location_country: residenceCountry }); })
        .catch(() => {});
    }
    handleBook(finalCompliance);
  };

  const handleBook = async (complianceOverride) => {
    const compliance = complianceOverride || complianceData;
    setBookingSaving(true);
    try {
      const attribution = getStoredAttribution(id) || {};
      const bookingRes = await axios.post('/bookings', { listing_id: id, date: bookingDate, participants: bookingParticipants, notes: bookingNotes || null, ...attribution });
      const bookingData = bookingRes.data;
      // Indian residents: charge in INR (tax compliance). Everyone else: charge in their display currency.
      let payAmount, payCurrency;
      if (compliance) {
        const isIndianResident = compliance.is_indian_resident;
        if (isIndianResident) {
          payAmount = compliance.total_inr;
          payCurrency = 'INR';
        } else {
          // Convert from listing currency to user's display currency
          payAmount = convertAndRound(compliance.total_list || compliance.total_inr, compliance.list_currency || listCur, currency, exchangeRates);
          payCurrency = currency;
        }
      } else if (checkoutTax && checkoutTax.total_amount) {
        payAmount = convertAndRound(checkoutTax.total_amount, checkoutTax.listing_currency || listCur, currency, exchangeRates);
        payCurrency = currency;
      } else {
        payAmount = convertAndRound((listing.price || 0) * bookingParticipants, listCur, currency, exchangeRates);
        payCurrency = currency;
      }

      if (payAmount > 0) {
        const orderRes = await axios.post('/payments/create-order', {
          amount: payAmount, currency: payCurrency, display_currency: payCurrency,
          idempotency_key: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `book-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          booking_id: bookingData.id,
          base_amount: checkoutTax?.base_total || payAmount, gst_rate: checkoutTax?.gst_rate || 0, gst_amount: checkoutTax?.gst_amount || 0,
          igst: checkoutTax?.igst || 0, cgst: checkoutTax?.cgst || 0, sgst: checkoutTax?.sgst || 0,
          sac_hsn: checkoutTax?.sac_hsn || '', is_export: checkoutTax?.is_export || false,
          tcs_amount: compliance?.tcs_amount || 0,
          origin_url: window.location.origin,
        });

        // ── Phase 4-P3: Provider routing — Stripe path (non-INR bookings) ──
        if (orderRes.data.provider === 'stripe') {
          try {
            sessionStorage.setItem('bt_stripe_pending', JSON.stringify({
              session_id: orderRes.data.session_id,
              booking_id: bookingData.id,
              cart_checkout: false,
            }));
          } catch (e) { /* webhook fallback */ }
          window.location.href = orderRes.data.session_url;
          return;
        }

        if (orderRes.data.mock) {
          await axios.post('/payments/mock-verify', { order_id: orderRes.data.order_id });
          toast.success('Booking confirmed & payment processed!');
          setShowBooking(false);
        } else {
          const options = {
            key: orderRes.data.key_id, amount: orderRes.data.amount, currency: orderRes.data.currency, order_id: orderRes.data.order_id,
            name: 'Bottom Time', description: listing.name,
            handler: async (response) => {
              try { await axios.post('/payments/verify', { razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }); toast.success('Booking confirmed & payment successful!'); setShowBooking(false); }
              catch (e) { toast.error('Payment verification failed'); }
              setBookingSaving(false);
            },
            modal: { ondismiss: () => setBookingSaving(false) },
            prefill: { name: user?.name, email: user?.email, contact: user?.phone },
            theme: { color: '#0e7490' }
          };
          new Razorpay(options).open();
          return;
        }
      } else {
        toast.success('Booking request sent!');
        setShowBooking(false);
      }
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to book'); }
    finally { setBookingSaving(false); }
  };

  // Format helpers — convert from listing's currency to user's display currency
  const fmtUnit = formatPrice(listing?.price || 0, currency, exchangeRates, listCur);
  const fmtTotal = formatLineTotal(listing?.price || 0, bookingParticipants, currency, exchangeRates, listCur);

  return (
    <div className="sticky top-24 bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-6">
      <div className="mb-6">
        {listing.price ? (
          <div>
            <p className="text-xs text-slate-400 mb-1">Price from</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-cyan-400">{fmtUnit}</span>
              <span className="text-slate-400 text-sm">/ person</span>
            </div>
          </div>
        ) : (
          <p className="text-xl font-bold text-slate-700">Contact for pricing</p>
        )}
      </div>

      <button className="btn-primary w-full mb-3 text-base" data-testid="book-now-btn"
        onClick={() => { if (!user) { openAuth(); } else { const next = !showBooking; setShowBooking(next); if (next) fetchTax(bookingParticipants); } }}>
        {showBooking ? 'Cancel' : 'Book Now'}
      </button>

      {showBooking && (
        <div className="mb-4 space-y-3 fade-in" data-testid="booking-form">
          <div>
            <label className="block text-xs font-medium mb-1">Select Date</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="booking-date-trigger"
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm text-left transition-all duration-150
                    ${bookingDate
                      ? 'border-cyan-300 bg-cyan-50/50 text-slate-800 font-medium'
                      : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'}`}
                >
                  <CalendarDays size={16} className={bookingDate ? 'text-cyan-500' : 'text-slate-400'} />
                  {bookingDate
                    ? new Date(bookingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Pick a dive date'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200 shadow-xl" align="start" side="bottom" sideOffset={6}>
                <Calendar mode="single" selected={bookingDate ? new Date(bookingDate + 'T12:00:00') : undefined}
                  onSelect={(date) => { if (date) { setBookingDate(date.toISOString().split('T')[0]); setCalendarOpen(false); } }}
                  disabled={availableDates.length > 0
                    ? (date) => !availableDates.includes(date.toISOString().split('T')[0])
                    : (date) => date < new Date(new Date().setHours(0,0,0,0))}
                  modifiers={availableDates.length > 0 ? availableModifiers : undefined}
                  modifiersStyles={availableDates.length > 0 ? availableModifierStyles : undefined}
                  fromDate={new Date()} className="p-3" fixedWeeks />
              </PopoverContent>
            </Popover>
          </div>

          {/* Participants — matches shop page stepper */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">Participants</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => updateParticipants(bookingParticipants - 1)}
                disabled={bookingParticipants <= 1}
                className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                data-testid="participants-minus"><Minus size={14} /></button>
              <span className="text-sm font-bold w-8 text-center" data-testid="booking-participants-count">{bookingParticipants}</span>
              <button type="button" onClick={() => updateParticipants(bookingParticipants + 1)}
                disabled={bookingParticipants >= maxPerBooking}
                className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                data-testid="participants-plus"><Plus size={14} /></button>
              <span className="text-xs text-slate-400 ml-1">{bookingParticipants === 1 ? 'person' : 'people'}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Notes (optional)</label>
            <textarea className="input-field text-sm h-16 py-2" placeholder="Special requests, certifications..." value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} data-testid="booking-notes" />
          </div>

          {/* Price breakdown — matches cart OrderSummary style */}
          {listing?.price > 0 && (
            <div className="bg-slate-50 rounded-2xl p-5" data-testid="checkout-tax-breakdown">
              <h3 className="font-bold text-sm mb-3">Order Summary</h3>
              <div className="space-y-1.5 text-sm mb-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 line-clamp-1 flex-1">{fmtUnit} x {bookingParticipants}</span>
                  <span className="font-medium ml-2 text-right">{fmtTotal}</span>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-slate-200 pt-2">
                <div className="flex justify-between text-sm font-bold"><span>Sub-Total</span><span className="text-right">{fmtTotal}</span></div>
                <div className="flex justify-between text-sm" data-testid="booking-gst-line">
                  <span className="text-slate-500">Goods and Services Tax</span>
                  <span className="text-right">
                    {taxLoading ? (
                      <span className="flex items-center gap-1.5 text-slate-400 text-xs"><Loader2 size={12} className="animate-spin" />Please wait</span>
                    ) : checkoutTax && checkoutTax.gst_rate > 0 ? (
                      formatPrice(checkoutTax.gst_amount, currency, exchangeRates, checkoutTax.listing_currency || listCur)
                    ) : (
                      <span className="text-slate-400 text-xs">N/A</span>
                    )}
                  </span>
                </div>
                {!taxLoading && checkoutTax && checkoutTax.gst_rate > 0 && checkoutTax.tax_category_description && (
                  <p className="text-[9px] text-slate-400 -mt-0.5 pl-1">
                    Category: {checkoutTax.tax_category_description}
                    {checkoutTax.sac_hsn_code ? ` (SAC ${checkoutTax.sac_hsn_code})` : ''}
                  </p>
                )}
                {listing?.country && (
                  <div className="flex justify-between text-xs text-slate-400"><span>Operator country</span><span>{listing.country}</span></div>
                )}
                <div className="flex justify-between font-bold border-t border-slate-200 pt-1.5">
                  <span className="text-xl">Grand Total</span>
                  <span className="text-xl text-cyan-600 text-right">
                    {taxLoading ? (
                      <span className="flex items-center gap-1.5 text-slate-400 text-xs font-normal"><Loader2 size={12} className="animate-spin" />Please wait</span>
                    ) : checkoutTax && checkoutTax.gst_rate > 0 ? (
                      formatPrice(checkoutTax.total_amount, currency, exchangeRates, checkoutTax.listing_currency || listCur)
                    ) : fmtTotal}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button className="btn-primary w-full text-base" disabled={!bookingDate || bookingSaving || taxLoading} onClick={handlePayClick} data-testid="submit-booking-btn">
            {bookingSaving ? 'Processing...' : taxLoading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />Please wait</span> : listing?.price > 0 ? `Pay & Book (${checkoutTax && checkoutTax.gst_rate > 0 ? formatPrice(checkoutTax.total_amount, currency, exchangeRates, checkoutTax.listing_currency || listCur) : fmtTotal})` : 'Send Booking Request'}
          </button>
        </div>
      )}

      <button className="btn-outline w-full" data-testid="contact-btn" onClick={() => toast.info('Messaging system coming soon!')}>Contact Operator</button>

      <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
        <p className="text-xs text-slate-500 flex items-center gap-1.5"><CheckCircle className="text-cyan-500 flex-shrink-0" size={14} />Free cancellation up to 24 hours before</p>
        <p className="text-xs text-slate-500 flex items-center gap-1.5"><CheckCircle className="text-cyan-500 flex-shrink-0" size={14} />Secure payment through platform</p>
      </div>

      {showCompliance && complianceData && (
        <ComplianceDialog compliance={complianceData} user={user} currency={currency} exchangeRates={exchangeRates} onConfirm={handleComplianceConfirm} onClose={() => setShowCompliance(false)} />
      )}
    </div>
  );
}
