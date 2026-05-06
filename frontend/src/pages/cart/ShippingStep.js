import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, ChevronDown, Search, Loader2 } from 'lucide-react';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { COUNTRIES } from './countries';

export function AddressList({ addresses, defaultAddrId, selectedAddrId, onSelect, onSetDefault, onEdit, onDelete, onAddNew }) {
  return (
    <div className="space-y-3 mb-6">
      {addresses.length > 0 ? addresses.map(a => (
        <div key={a.id} onClick={() => onSelect(a)}
          className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAddrId === a.id ? 'border-cyan-400 bg-cyan-50/50' : 'border-slate-100 hover:border-slate-200'}`}
          data-testid="address-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-slate-800">{a.name}</span>
                {a.label && <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{a.label}</span>}
                {defaultAddrId === a.id && <span className="text-[10px] font-semibold bg-cyan-100 text-cyan-600 px-2 py-0.5 rounded">Default</span>}
              </div>
              <p className="text-xs text-slate-500">{a.phone}</p>
              <p className="text-xs text-slate-500 mt-1">{a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''}</p>
              <p className="text-xs text-slate-500">{a.city}{a.state ? `, ${a.state}` : ''} — {a.pincode}, {a.country}</p>
            </div>
            <div className="flex items-center gap-0 shrink-0 ml-3 text-[10px]">
              {defaultAddrId !== a.id && <><button onClick={(e) => { e.stopPropagation(); onSetDefault(a.id); }} className="text-slate-400 hover:text-cyan-500 font-medium" data-testid="set-default-btn">Set Default</button><span className="text-slate-400 mx-1.5">|</span></>}
              <button onClick={(e) => { e.stopPropagation(); onEdit(a); }} className="text-slate-400 hover:text-cyan-500 font-medium" data-testid="edit-addr-btn">Edit</button>
              <span className="text-slate-400 mx-1.5">|</span>
              <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} className="text-slate-400 hover:text-red-500 font-medium" data-testid="delete-addr-btn">Delete</button>
            </div>
          </div>
        </div>
      )) : (
        <p className="text-sm text-slate-400 py-4 text-center">No saved addresses. Add one below.</p>
      )}
      <button onClick={onAddNew}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-400 hover:border-cyan-300 hover:text-cyan-500 transition-all" data-testid="add-address-btn">
        + Add New Address
      </button>
    </div>
  );
}

export function CarrierSelector({ loadingShipping, deliveryEstimate, shippingRates, selectedCarrier, selectedCity, onSelectCarrier, fmtShipping }) {
  return (
    <div className="mb-4" data-testid="carrier-selection">
      {loadingShipping && (
        <div className="space-y-3">
          <div className="bg-slate-200/70 skeleton-shimmer rounded-xl h-10 w-full" />
          <div className="bg-slate-200/70 skeleton-shimmer rounded-xl h-16 w-full" />
        </div>
      )}
      {!loadingShipping && deliveryEstimate && (
        <div className="bg-emerald-50 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2">
          <MapPin size={14} className="text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700">Delivering to {selectedCity} — Est. {deliveryEstimate.estimate}</span>
        </div>
      )}
      {!loadingShipping && shippingRates && shippingRates.rates?.length > 0 && (
        <div className="space-y-2" data-testid="carrier-options">
          {shippingRates.is_international && <p className="text-xs text-slate-500 mb-1">Choose your preferred international carrier:</p>}
          {shippingRates.rates.map((carrier, idx) => (
            <div key={`k${idx}`} onClick={() => onSelectCarrier(carrier)}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedCarrier?.carrier_id === carrier.carrier_id ? 'border-cyan-400 bg-cyan-50/50' : 'border-slate-200 hover:border-slate-300'}`}
              data-testid={`carrier-option-${idx}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedCarrier?.carrier_id === carrier.carrier_id ? 'border-cyan-400 bg-cyan-400' : 'border-slate-300'}`}>
                    {selectedCarrier?.carrier_id === carrier.carrier_id && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{carrier.carrier}</p>
                    <p className="text-[11px] text-slate-500">{carrier.estimated_days} days</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1.5 justify-end">
                    {shippingRates.cheapest?.carrier_id === carrier.carrier_id && (
                      <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded font-medium">Cheapest</span>
                    )}
                    {shippingRates.fastest?.carrier_id === carrier.carrier_id && shippingRates.fastest?.carrier_id !== shippingRates.cheapest?.carrier_id && (
                      <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium">Fastest</span>
                    )}
                    <span className="text-sm font-bold text-slate-800">{fmtShipping(carrier.rate)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">by {carrier.estimated_delivery}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loadingShipping && shippingRates?.mock && (
        <p className="text-[10px] text-slate-400 text-center mt-2">
          {shippingRates.is_international 
            ? 'Estimated international rates — ShiprocketX activation pending'
            : 'Demo shipping rates — Live rates with Shiprocket API'}
        </p>
      )}
    </div>
  );
}

export function AddressForm({ shipping, setShipping, editingAddr, onSave, onCancel, reqClass }) {
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const countryRef = useRef(null);
  const [dialSearch, setDialSearch] = useState('');
  const [showDialDropdown, setShowDialDropdown] = useState(false);
  const dialRef = useRef(null);
  const [pincodeLooking, setPincodeLooking] = useState(false);
  const pincodeTimer = useRef(null);

  const lookupPincode = useCallback(async (pincode, countryName) => {
    if (!pincode || pincode.length < 4 || !countryName) return;
    const iso = COUNTRIES.find(c => c.name === countryName)?.iso || '';
    const googleKey = process.env.REACT_APP_GOOGLE_MAPS_KEY;
    if (!googleKey) return;
    setPincodeLooking(true);
    try {
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey, 'X-Goog-FieldMask': 'places.addressComponents' },
        body: JSON.stringify({ textQuery: `${pincode}, ${countryName}`, includedRegionCodes: iso ? [iso] : [], maxResultCount: 1 }),
      });
      const data = await resp.json();
      const components = data.places?.[0]?.addressComponents || [];
      let city = '', state = '';
      for (const comp of components) {
        const types = comp.types || [];
        if (types.includes('locality')) city = comp.longText;
        else if (types.includes('sublocality_level_1') && !city) city = comp.longText;
        else if (types.includes('administrative_area_level_2') && !city) city = comp.longText;
        else if (types.includes('administrative_area_level_1')) state = comp.longText;
      }
      if (city || state) {
        setShipping(p => ({ ...p, city: city || p.city, state: state || p.state }));
      }
    } catch (e) { /* silent */ }
    finally { setPincodeLooking(false); }
  }, [setShipping]);

  const handlePincodeChange = (val) => {
    setShipping(p => ({ ...p, pincode: val }));
    clearTimeout(pincodeTimer.current);
    if (val.length >= 4 && shipping.country) {
      pincodeTimer.current = setTimeout(() => lookupPincode(val, shipping.country), 600);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (countryRef.current && !countryRef.current.contains(e.target)) setShowCountryDropdown(false);
      if (dialRef.current && !dialRef.current.contains(e.target)) setShowDialDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredCountries = COUNTRIES.filter(c => {
    const q = (countrySearch || shipping.country || '').toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.iso.toLowerCase().includes(q) || c.code.includes(countrySearch || '');
  });
  const filteredDialCodes = COUNTRIES.filter(c => {
    const q = dialSearch.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.code.includes(dialSearch) || c.iso.toLowerCase().includes(q);
  });
  const selectCountry = (c) => {
    setShipping(p => ({ ...p, country: c.name, country_code: c.code }));
    setCountrySearch('');
    setShowCountryDropdown(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6" data-testid="address-form">
      <h3 className="text-sm font-bold mb-3">{editingAddr ? 'Edit Address' : 'Add New Address'}</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Label (optional)</label>
          <input className="input-field text-sm" value={shipping.label} onChange={e => setShipping(p => ({...p, label: e.target.value}))} placeholder="e.g., Home, Office, Dive Center" data-testid="ship-label" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Full Name of Recipient *</label>
          <input className={`input-field text-sm ${reqClass(shipping.name)}`} value={shipping.name} onChange={e => setShipping(p => ({...p, name: e.target.value}))} placeholder="Full name" data-testid="ship-name" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Mobile Number *</label>
          <div className="flex gap-2">
            <div ref={dialRef} className="relative shrink-0" style={{ width: '82px' }}>
              <div className={`input-field text-sm flex items-center justify-between cursor-pointer !px-2.5 ${reqClass(shipping.country_code)}`} tabIndex={0}
                onClick={() => { setShowDialDropdown(!showDialDropdown); setDialSearch(''); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDialDropdown(!showDialDropdown); setDialSearch(''); } }}
                data-testid="ship-cc">
                <span className={shipping.country_code ? 'text-slate-800 font-medium' : 'text-slate-400'}>{shipping.country_code || 'Code'}</span>
                <ChevronDown size={12} className="text-slate-400" />
              </div>
              {showDialDropdown && (
                <div className="absolute z-50 w-56 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" data-testid="dial-code-dropdown">
                  <div className="p-2 border-b border-slate-100">
                    <input autoFocus className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400" placeholder="Search..." value={dialSearch} onChange={e => setDialSearch(e.target.value)} data-testid="dial-search-input" />
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {filteredDialCodes.map(c => (
                      <button key={c.iso} onClick={() => { setShipping(p => ({...p, country_code: c.code})); setShowDialDropdown(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 transition-colors flex items-center justify-between ${shipping.country_code === c.code ? 'bg-cyan-50 text-cyan-700 font-semibold' : 'text-slate-700'}`}
                        data-testid={`dial-option-${c.iso}`}>
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-slate-500 font-medium shrink-0 ml-2">{c.code}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input type="tel" maxLength={10} className={`input-field text-sm flex-1 min-w-0 ${reqClass(shipping.phone)}`} value={shipping.phone}
              onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setShipping(p => ({...p, phone: v})); }}
              placeholder="10-digit number" data-testid="ship-phone" />
          </div>
        </div>
        <div ref={countryRef} className="relative">
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Country of Delivery *</label>
          <div className={`input-field text-sm flex items-center justify-between cursor-pointer ${reqClass(shipping.country)}`} tabIndex={0}
            onClick={() => setShowCountryDropdown(!showCountryDropdown)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowCountryDropdown(!showCountryDropdown); } }}
            data-testid="ship-country">
            <span className={shipping.country ? 'text-slate-800' : 'text-slate-400'}>{shipping.country || 'Select country'}</span>
            <ChevronDown size={14} className="text-slate-400" />
          </div>
          {showCountryDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" data-testid="country-dropdown">
              <div className="p-2 border-b border-slate-100">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input autoFocus className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400" placeholder="Search country..." value={countrySearch} onChange={e => setCountrySearch(e.target.value)} data-testid="country-search-input" />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredCountries.map(c => (
                  <button key={c.iso} onClick={() => selectCountry(c)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 transition-colors flex items-center justify-between ${shipping.country === c.name ? 'bg-cyan-50 text-cyan-700 font-semibold' : 'text-slate-700'}`}
                    data-testid={`country-option-${c.iso}`}>
                    <span>{c.name}</span>
                    <span className="text-xs text-slate-400">{c.code}</span>
                  </button>
                ))}
                {filteredCountries.length === 0 && <p className="px-3 py-3 text-xs text-slate-400 text-center">No matching country</p>}
              </div>
            </div>
          )}
        </div>
        {!editingAddr && (
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Quick Search Address</label>
            <AddressAutocomplete
              placeholder="Type to search address..."
              country={COUNTRIES.find(c => c.name === shipping.country)?.iso || ''}
              onSelect={(addr, suggestion) => {
                let street = addr.address_line1 || '';
                if (addr.formatted_address && (!street || street === addr.city)) {
                  const parts = addr.formatted_address.split(',').map(s => s.trim());
                  const cityIdx = parts.findIndex(p => p === addr.city || p === addr.state || p === addr.country);
                  if (cityIdx > 0) street = parts.slice(0, Math.min(cityIdx, 2)).join(', ');
                  else if (parts.length >= 3) street = parts.slice(0, 2).join(', ');
                }
                let line2 = addr.address_line2 || '';
                if (!line2 && suggestion?.secondary_text) {
                  const sec = suggestion.secondary_text.replace(addr.city, '').replace(addr.state, '').replace(addr.country, '').replace(/,\s*,/g, ',').replace(/^[,\s]+|[,\s]+$/g, '');
                  if (sec && sec !== street) line2 = sec;
                }
                setShipping(p => ({ ...p, street_address: street, address_line2: line2, city: addr.city || '', state: addr.state || '', pincode: addr.pincode || '', country: addr.country || p.country }));
                const { toast } = require('sonner');
                toast.success('Address filled');
              }}
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">House / Flat / Unit Number *</label>
          <input className={`input-field text-sm ${reqClass(shipping.house_number)}`} value={shipping.house_number} onChange={e => setShipping(p => ({...p, house_number: e.target.value}))} placeholder="e.g., Flat 402, Unit B" data-testid="ship-house" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Building, Street, Locality</label>
          <input className={`input-field text-sm ${reqClass(shipping.street_address)}`} value={shipping.street_address} onChange={e => setShipping(p => ({...p, street_address: e.target.value}))} placeholder="Auto-filled from search or enter manually" data-testid="ship-street" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Address Line 2</label>
          <input className="input-field text-sm" value={shipping.address_line2} onChange={e => setShipping(p => ({...p, address_line2: e.target.value}))} placeholder="Additional address details" data-testid="ship-addr2" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Landmark</label>
          <input className="input-field text-sm" value={shipping.landmark} onChange={e => setShipping(p => ({...p, landmark: e.target.value}))} placeholder="e.g., Near Central Mall, Opposite Park" data-testid="ship-landmark" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">ZIP / PIN Code *</label>
            <div className="relative">
              <input className={`input-field text-sm ${reqClass(shipping.pincode)}`} value={shipping.pincode} onChange={e => handlePincodeChange(e.target.value)} placeholder="Enter pincode" data-testid="ship-pincode" />
              {pincodeLooking && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-cyan-400" />}
            </div>
            {!shipping.city && shipping.pincode?.length >= 4 && shipping.country && !pincodeLooking && (
              <button onClick={() => lookupPincode(shipping.pincode, shipping.country)} className="text-[10px] text-cyan-500 hover:text-cyan-600 font-medium mt-1" data-testid="lookup-pincode-btn">Look up city & state</button>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">City *</label>
            <input className={`input-field text-sm ${reqClass(shipping.city)}`} value={shipping.city} onChange={e => setShipping(p => ({...p, city: e.target.value}))} placeholder="Auto-filled" data-testid="ship-city" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">State *</label>
            <input className={`input-field text-sm ${reqClass(shipping.state)}`} value={shipping.state} onChange={e => setShipping(p => ({...p, state: e.target.value}))} placeholder="Auto-filled" data-testid="ship-state" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onSave} className="flex-1 py-2.5 bg-cyan-400 text-white rounded-xl text-sm font-bold hover:bg-cyan-500 transition-colors" data-testid="save-addr-btn">
            {editingAddr ? 'Update Address' : 'Save Address'}
          </button>
          <button onClick={onCancel} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════
 * ORDER SUMMARY COMPONENT — Display only, no calculations.
 * ALL numeric props (displaySubtotal, gstAmount, shippingDisplay,
 * payTotal) are PRE-COMPUTED in the user's display currency by
 * computeCartTotals() in Cart.js.
 *
 * DO NOT re-derive totals here. Just format and display.
 * ═══════════════════════════════════════════════════════════════
 */
export function OrderSummary({ cartItems, cartTax, displaySubtotal, gstAmount, shippingCost, shippingDisplay, selectedCarrier, selectedAddrId, loadingShipping, fmt, fmtLine, fmtVal, fmtShipping, payTotal, checkingOut, onCheckout }) {
  const renderGstValue = () => {
    if (!selectedAddrId) return <span className="text-slate-400 text-xs italic">Select address</span>;
    if (!cartTax) return <span className="flex items-center gap-1.5 text-slate-400 text-xs"><Loader2 size={12} className="animate-spin" />Please wait</span>;
    if (gstAmount > 0) return fmtVal(gstAmount);
    return <span className="text-slate-400 text-xs">N/A</span>;
  };

  const renderShippingValue = () => {
    if (!selectedAddrId) return <span className="text-slate-400 text-xs italic">Select address</span>;
    if (loadingShipping) return <span className="flex items-center gap-1.5 text-slate-400 text-xs"><Loader2 size={12} className="animate-spin" />Please wait</span>;
    if (shippingCost > 0) return fmtShipping(shippingCost);
    return <span className="text-slate-400 text-xs italic">Choose carrier</span>;
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-5">
      <h3 className="font-bold text-sm mb-3">Order Summary</h3>
      <div className="space-y-1.5 text-sm mb-3">
        {cartItems.map((item, i) => (
          <div key={`k${i}`} className="flex justify-between text-xs">
            <span className="text-slate-500 line-clamp-1 flex-1">{item.product?.name} x{item.quantity}</span>
            <span className="font-medium ml-2 text-right">{fmtLine ? fmtLine(item.product?.price, item.quantity, item.product?.currency || 'USD') : fmt(item.product?.price * item.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1.5 border-t border-slate-200 pt-2">
        <div className="flex justify-between text-sm font-bold"><span>Sub-Total</span><span className="text-right">{fmtVal(displaySubtotal)}</span></div>
        <div className="flex justify-between text-sm" data-testid="order-gst-line">
          <span className="text-slate-500">Goods and Services Tax</span>
          <span className="text-right">{renderGstValue()}</span>
        </div>
        {cartTax?.is_domestic && gstAmount > 0 && (
          cartTax.totals?.igst > 0 ? (
            <div className="flex justify-between text-xs text-slate-400 pl-2" data-testid="igst-breakdown">
              <span>IGST</span><span className="text-right">{fmtVal(gstAmount)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-xs text-slate-400 pl-2" data-testid="cgst-breakdown">
                <span>CGST</span><span className="text-right">{fmtVal(Math.round(gstAmount / 2 * 100) / 100)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 pl-2" data-testid="sgst-breakdown">
                <span>SGST</span><span className="text-right">{fmtVal(Math.round(gstAmount / 2 * 100) / 100)}</span>
              </div>
            </>
          )
        )}
        <div className="flex justify-between text-sm" data-testid="shipping-cost-line">
          <span className="text-slate-500">Shipping{shippingCost > 0 && selectedCarrier ? ` (${selectedCarrier.carrier})` : ''}</span>
          <span className="text-right">{renderShippingValue()}</span>
        </div>
        {/* Grand Total = Sub-Total + GST + Shipping - Discount. Computed by cartCalc.js */}
        <div className="flex justify-between font-bold border-t border-slate-200 pt-1.5"><span className="text-xl">Grand Total</span><span className="text-xl text-cyan-600 text-right">{fmtVal(payTotal)}</span></div>
      </div>
      <button onClick={onCheckout} disabled={checkingOut || !selectedCarrier} className="btn-primary w-full text-sm mt-4" data-testid="pay-now-btn">
        {checkingOut ? 'Processing...' : `Pay ${fmtVal(payTotal)}`}
      </button>
      {!selectedCarrier && selectedAddrId && (
        <p className="text-[10px] text-amber-500 text-center mt-2">Please select a shipping carrier above</p>
      )}
      <p className="text-[10px] text-slate-400 text-center mt-2">Secure payment powered by Razorpay</p>
    </div>
  );
}
