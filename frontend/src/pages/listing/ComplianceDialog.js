import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, AlertTriangle, CheckCircle, X, ChevronDown, Search } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { COUNTRY_NAMES } from '../../pages/cart/countries';
import { formatPrice } from '../../utils/currency';

/**
 * Pre-payment compliance dialog for bookings.
 * Handles: country of residence confirmation, Goods and Services Tax display, Tax Collected at Source + PAN for overseas tours.
 */

function CountryDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = COUNTRY_NAMES.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="input-field flex items-center justify-between w-full text-left text-sm"
        data-testid="residence-country-select">
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>{value || 'Select country'}</span>
        <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="border border-cyan-300 rounded-xl overflow-hidden shadow-sm" data-testid="residence-country-select">
      <div className="p-2.5 border-b border-slate-100 flex items-center gap-2 bg-white">
        <Search size={14} className="text-slate-400 flex-shrink-0" />
        <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search country..." className="w-full text-sm py-0.5 focus:outline-none bg-transparent text-slate-900 placeholder-slate-400" />
      </div>
      <div className="max-h-48 overflow-y-auto bg-white">
        {filtered.length > 0 ? filtered.map(c => (
          <button key={c} type="button"
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-cyan-50 ${value === c ? 'text-cyan-600 font-semibold bg-cyan-50' : 'text-slate-800'}`}
            onClick={() => { onChange(c); setOpen(false); setSearch(''); }}>
            {c}
          </button>
        )) : (
          <p className="text-center text-slate-400 text-sm py-4">No countries found</p>
        )}
      </div>
    </div>
  );
}

export default function ComplianceDialog({ compliance: initialCompliance, user, currency, exchangeRates, onConfirm, onClose }) {
  const [residenceCountry, setResidenceCountry] = useState(initialCompliance?.residence_country || user?.location_country || '');
  const [panNumber, setPanNumber] = useState('');
  const [panName, setPanName] = useState('');
  const [panSaving, setPanSaving] = useState(false);
  const [panSaved, setPanSaved] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [step, setStep] = useState('residence');
  const [c, setC] = useState(initialCompliance || {});

  const isIndia = residenceCountry.trim().toLowerCase() === 'india';
  const listCur = c.list_currency || 'USD';
  // Indian residents see INR (tax compliance); everyone else sees their selected currency
  const fmtAmount = isIndia
    ? (v) => '₹' + v?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (v) => formatPrice(v, currency, exchangeRates, listCur);
  const fmtINR = (v) => '₹' + v?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const profileCountry = user?.location_country || '';
  const countryMismatch = residenceCountry && profileCountry && residenceCountry.trim().toLowerCase() !== profileCountry.trim().toLowerCase();

  const handleConfirmResidence = async () => {
    if (!residenceCountry.trim()) { toast.error('Please select your country of residence'); return; }
    try {
      const res = await axios.post('/tax/booking-compliance', {
        listing_id: c.listing_id,
        participants: c.participants,
        residence_country: residenceCountry,
      });
      setC(res.data);
    } catch (e) { console.debug('Compliance re-fetch failed:', e.message); }
    setStep('review');
  };

  const validatePanFormat = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

  const [panError, setPanError] = useState('');

  const handleSubmitPan = async () => {
    const pan = panNumber.trim().toUpperCase();
    if (!validatePanFormat(pan)) { toast.error('Invalid PAN format. Must be 10 characters like ABCDE1234F'); return; }
    if (!panName.trim()) { toast.error('Please enter the name as printed on your PAN card'); return; }

    setPanSaving(true);
    setPanError('');
    try {
      const res = await axios.post('/tax/store-pan', {
        pan_number: pan,
        name_on_pan: panName.trim(),
      });
      if (res.data.success && res.data.govt_verified) {
        toast.success('PAN verified against government records');
        setPanSaved(true);
        // Re-fetch compliance — rate drops to 2%
        try {
          const updated = await axios.post('/tax/booking-compliance', {
            listing_id: c.listing_id, participants: c.participants, residence_country: residenceCountry,
          });
          setC(updated.data);
        } catch (e) { console.debug('Compliance update after PAN failed:', e.message); }
      } else {
        // Govt verification failed — PAN not stored, stays at 4%
        setPanError(res.data.message || 'PAN verification failed. TCS of 4% will be charged.');
        setPanNumber('');
        setPanName('');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to verify PAN');
    } finally {
      setPanSaving(false);
    }
  };

  const handleProceed = async () => {
    if (c.tcs_applies && !acknowledged) { toast.error('Please acknowledge the TCS terms to proceed'); return; }
    try {
      await axios.post('/tax/booking-acknowledgment', {
        listing_id: c.listing_id,
        listing_name: c.listing_name,
        residence_country: residenceCountry,
        is_overseas: c.is_overseas,
        gst_acknowledged: c.gst_applies,
        tcs_acknowledged: c.tcs_applies && acknowledged,
        tcs_rate: c.tcs_rate,
        tcs_amount: c.tcs_amount,
        base_amount_inr: c.base_inr,
        total_amount_inr: c.total_inr,
        participants: c.participants,
      });
    } catch (e) { console.debug('Booking acknowledgment failed:', e.message); }
    onConfirm(residenceCountry, c);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] overflow-y-auto" data-testid="compliance-dialog" onClick={onClose}>
      <div className="flex items-center justify-center min-h-full py-8 px-4">
        <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-cyan-500" />
            <h2 className="font-bold text-base">Tax Compliance</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400" data-testid="close-compliance"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Step 1: Confirm residence */}
          {step === 'residence' && (
            <>
              <p className="text-sm text-slate-600">Before completing your booking, please confirm your country of residence. This determines applicable taxes.</p>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Country of Residence</label>
                <CountryDropdown value={residenceCountry} onChange={setResidenceCountry} />
              </div>
              {countryMismatch && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3" data-testid="country-mismatch-warning">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Your profile lists <strong>{profileCountry}</strong> as your country, but you selected <strong>{residenceCountry}</strong>. If this is correct, your profile will be updated on proceeding.
                  </p>
                </div>
              )}
              <button onClick={handleConfirmResidence} className="btn-primary w-full text-sm" data-testid="confirm-residence-btn">Continue</button>
            </>
          )}

          {/* Step 2: Review taxes */}
          {step === 'review' && (
            <>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm text-slate-500" data-testid="tax-breakdown-review">
                <div className="flex justify-between"><span>Experience</span><span className="text-right max-w-[200px] truncate">{c.listing_name}</span></div>
                <div className="flex justify-between"><span>Experience country</span><span>{c.listing_country}</span></div>
                <div className="flex justify-between"><span>Your country of residence</span><span>{residenceCountry}</span></div>
                <div className="flex justify-between"><span>Participants</span><span>{c.participants}</span></div>
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex justify-between"><span>Base amount</span><span>{fmtAmount(isIndia ? c.base_inr : (c.base_list || c.base_inr))}</span></div>
                  {c.gst_applies && c.gst_amount > 0 && (
                    <>
                      <div className="flex justify-between"><span>Goods and Services Tax ({c.gst_rate}%)</span><span>{fmtAmount(isIndia ? c.gst_amount : (c.gst_list || c.gst_amount))}</span></div>
                      {c.gst_category && <p className="text-[9px] text-slate-400 -mt-0.5">Category: {c.gst_category}{c.gst_sac_code ? ` (SAC ${c.gst_sac_code})` : ''}</p>}
                    </>
                  )}
                  {!c.gst_applies && <div className="flex justify-between text-green-600"><span>Goods and Services Tax</span><span>Not applicable</span></div>}
                  {c.tcs_applies ? (
                      <div className="flex justify-between text-amber-700"><span>Tax Collected at Source ({c.tcs_rate}%)</span><span>{fmtAmount(isIndia ? c.tcs_amount : (c.tcs_list || c.tcs_amount))}</span></div>
                  ) : (
                    <div className="flex justify-between text-green-600"><span>Tax Collected at Source</span><span>Not applicable</span></div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 mt-1 text-slate-900"><span className="font-bold">Grand Total</span><span className="font-bold">{fmtAmount(isIndia ? c.total_inr : (c.total_list || c.total_inr))}</span></div>
                  {!isIndia && c.gst_applies && (
                    <p className="text-xs text-slate-400 mt-1">Prices shown in your selected currency. Goods and Services Tax calculated at {fmtINR(c.gst_amount)} (INR equivalent) for compliance purposes.</p>
                  )}
                </div>
              </div>

              {/* TCS section for Indian residents booking overseas */}
              {c.tcs_applies && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3 text-xs text-center" data-testid="tcs-section">
                  <div>
                    <AlertTriangle size={28} className="text-amber-600 mx-auto mb-2" />
                    <p className="font-bold text-amber-800">Tax Collected at Source on Overseas Tour Package</p>
                    <p className="text-amber-700 mt-2 leading-relaxed">
                      As per Section 206C(1G) of the Income Tax Act, a TCS of {c.tcs_rate}% ({(c.pan_on_file || panSaved) ? 'with PAN' : 'without PAN'}) is applicable on overseas tour packages purchased by Indian residents.
                    </p>
                    <p className="text-amber-700 mt-2 leading-relaxed">
                      This TCS of <strong>{fmtINR(c.tcs_amount)}</strong> will be reflected in your Form 26AS and can be claimed as credit while filing your income tax return.
                    </p>
                  </div>

                  {/* Acknowledgment */}
                  <label className="flex items-center justify-center gap-2 cursor-pointer py-2" data-testid="tcs-acknowledge-label">
                    <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="accent-amber-600" data-testid="tcs-acknowledge-checkbox" />
                    <span className="text-amber-800 font-medium">I acknowledge</span>
                  </label>

                  {/* PAN collection — only if PAN not on file */}
                  {!c.pan_on_file && !panSaved && (
                    <div className="bg-white rounded-lg p-3 border border-amber-100 space-y-3 mt-2">
                      <p className="font-semibold text-slate-700 text-center">
                        Furnish PAN to reduce TCS from 4% to 2%
                      </p>

                      <div>
                        <label className="block font-semibold text-slate-500 mb-1 text-center">PAN Number</label>
                        <input className="input-field text-sm uppercase text-center" maxLength={10} placeholder="ABCDE1234F" value={panNumber}
                          onChange={e => setPanNumber(e.target.value.toUpperCase())}
                          data-testid="pan-input" />
                        {panNumber.length === 10 && !validatePanFormat(panNumber) && (
                          <p className="text-red-500 mt-0.5 text-center">Invalid format. PAN must be 5 letters + 4 digits + 1 letter</p>
                        )}
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-500 mb-1 text-center">
                          Full Name (exactly as printed on PAN card)
                        </label>
                        <input className="input-field text-sm text-center" placeholder="e.g., JOHN DOE" value={panName}
                          onChange={e => setPanName(e.target.value)}
                          data-testid="pan-name-input" />
                      </div>

                      {panError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center" data-testid="pan-verification-error">
                          <AlertTriangle size={14} className="text-red-500 mx-auto mb-1" />
                          <p className="text-red-700">{panError}</p>
                        </div>
                      )}

                      <button onClick={handleSubmitPan} disabled={panSaving || panNumber.length < 10 || !panName.trim()}
                        className="w-full px-3 py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50"
                        data-testid="save-pan-btn">
                        {panSaving ? 'Verifying against govt. records...' : 'Verify & Save PAN'}
                      </button>
                    </div>
                  )}

                  {(c.pan_on_file || panSaved) && (
                    <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 rounded-lg p-2.5" data-testid="pan-verified">
                      <CheckCircle size={14} /> PAN on file — 2% TCS rate applied
                    </div>
                  )}
                </div>
              )}

              <div className="pt-1">
                <button onClick={handleProceed} disabled={c.tcs_applies && !acknowledged} className="w-full btn-primary py-2.5 text-sm font-semibold disabled:opacity-50" data-testid="proceed-payment-btn">
                  Proceed to Payment
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}
