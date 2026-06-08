import { useState } from 'react';
import { Plus, X, Upload, Camera, Video, Trash2, Wind, AlertTriangle, Stethoscope, GripVertical } from 'lucide-react';
import { LISTING_TYPES, DIFFICULTY_LEVELS, CERT_LEVELS, ROOM_TYPES } from './constants';
import SocialPreview from './SocialPreview';

export function BasicSection({ form, set }) {
  return (
    <div className="space-y-4" data-testid="section-basic">
      <h3 className="text-base font-bold text-slate-800">Basic Information</h3>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Listing Title *</label><input className="input-field" placeholder="e.g., 3-Day Coral Reef Adventure in Raja Ampat" value={form.title} onChange={e => set('title', e.target.value)} data-testid="listing-title" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Location *</label><input className="input-field" placeholder="e.g., Tulamben, Bali" value={form.location || ''} onChange={e => set('location', e.target.value)} data-testid="listing-location" /><p className="text-[10px] text-slate-400 mt-0.5">City, area or dive region</p></div>
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Country *</label><input className="input-field" placeholder="e.g., Indonesia" value={form.country || ''} onChange={e => set('country', e.target.value)} data-testid="listing-country" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Listing Type *</label><select className="input-field" value={form.listing_type} onChange={e => set('listing_type', e.target.value)} data-testid="listing-type">{LISTING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Total Available Slots</label><input type="number" className="input-field" min="1" value={form.max_slots} onChange={e => set('max_slots', e.target.value)} placeholder="e.g., 20" data-testid="max-slots" /><p className="text-[10px] text-slate-400 mt-0.5">Total spots available for this experience</p></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Per Booking</label><input type="number" className="input-field" min="1" value={form.max_per_booking} onChange={e => set('max_per_booking', e.target.value)} placeholder="e.g., 6" data-testid="max-per-booking" /><p className="text-[10px] text-slate-400 mt-0.5">Max participants in a single booking</p></div>
        <div />
      </div>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Description *</label><textarea className="input-field h-32 resize-none" placeholder="Describe the experience in detail..." value={form.description} onChange={e => set('description', e.target.value)} data-testid="listing-desc" /></div>
    </div>
  );
}

export function MediaSection({ form, listing, fileInputRef, videoInputRef, uploading, handleFileUpload, removePhoto, removeVideo, reorderPhotos, reorderVideos }) {
  const [dragPhotoIdx, setDragPhotoIdx] = useState(null);
  const [overPhotoIdx, setOverPhotoIdx] = useState(null);
  const [dragVideoIdx, setDragVideoIdx] = useState(null);
  const [overVideoIdx, setOverVideoIdx] = useState(null);

  const onPhotoDragStart = (e, i) => { setDragPhotoIdx(i); e.dataTransfer.effectAllowed = 'move'; };
  const onPhotoDragOver = (e, i) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (i !== overPhotoIdx) setOverPhotoIdx(i); };
  const onPhotoDrop = (e, i) => { e.preventDefault(); if (dragPhotoIdx !== null && dragPhotoIdx !== i) reorderPhotos(dragPhotoIdx, i); setDragPhotoIdx(null); setOverPhotoIdx(null); };
  const onPhotoDragEnd = () => { setDragPhotoIdx(null); setOverPhotoIdx(null); };

  const onVideoDragStart = (e, i) => { setDragVideoIdx(i); e.dataTransfer.effectAllowed = 'move'; };
  const onVideoDragOver = (e, i) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (i !== overVideoIdx) setOverVideoIdx(i); };
  const onVideoDrop = (e, i) => { e.preventDefault(); if (dragVideoIdx !== null && dragVideoIdx !== i) reorderVideos(dragVideoIdx, i); setDragVideoIdx(null); setOverVideoIdx(null); };
  const onVideoDragEnd = () => { setDragVideoIdx(null); setOverVideoIdx(null); };

  return (
    <div className="space-y-4" data-testid="section-media">
      <h3 className="text-base font-bold text-slate-800">Photos & Videos</h3>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Photos</label>
            {form.photos.length > 1 && <span className="ml-2 text-[10px] text-slate-400">Drag to reorder · the first photo is your social-card hero</span>}
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs text-cyan-600 font-semibold flex items-center gap-1 hover:text-cyan-700" data-testid="upload-photo-btn"><Upload size={12} /> Upload Photos</button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileUpload(e, 'photo')} />
        </div>
        {form.photos.length > 0 ? (
          <div className="grid grid-cols-4 gap-3">
            {form.photos.map((photo, i) => (
              <div
                key={`${photo.url}-${i}`}
                draggable
                onDragStart={e => onPhotoDragStart(e, i)}
                onDragOver={e => onPhotoDragOver(e, i)}
                onDrop={e => onPhotoDrop(e, i)}
                onDragEnd={onPhotoDragEnd}
                className={`relative group rounded-xl overflow-hidden aspect-square bg-slate-100 cursor-move transition-all ${dragPhotoIdx === i ? 'opacity-40 scale-95' : ''} ${overPhotoIdx === i && dragPhotoIdx !== i ? 'ring-2 ring-cyan-400 ring-offset-2' : ''}`}
                data-testid={`photo-tile-${i}`}
              >
                <img src={photo.url?.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${photo.url}` : photo.url} alt={photo.caption} className="w-full h-full object-cover pointer-events-none" loading="lazy" />
                <span className="absolute top-1 left-1 bg-slate-900/70 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"><GripVertical size={12} /></span>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"><button onClick={() => removePhoto(i)} className="p-1.5 bg-red-500 rounded-full text-white" data-testid={`remove-photo-${i}`}><Trash2 size={12} /></button></div>
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">{i === 0 ? 'HERO' : i + 1}</span>
              </div>
            ))}
          </div>
        ) : (
          <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-cyan-300 transition-colors">
            <Camera size={24} className="text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Click to upload photos (JPEG, PNG, WebP up to 10MB)</p>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Videos</label>
            {form.videos.length > 1 && <span className="ml-2 text-[10px] text-slate-400">Drag to reorder</span>}
          </div>
          <button onClick={() => videoInputRef.current?.click()} disabled={uploading} className="text-xs text-cyan-600 font-semibold flex items-center gap-1 hover:text-cyan-700" data-testid="upload-video-btn"><Upload size={12} /> Upload Video</button>
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => handleFileUpload(e, 'video')} />
        </div>
        {form.videos.length > 0 ? (
          <div className="space-y-2">{form.videos.map((vid, i) => (
            <div
              key={`${vid.url}-${i}`}
              draggable
              onDragStart={e => onVideoDragStart(e, i)}
              onDragOver={e => onVideoDragOver(e, i)}
              onDrop={e => onVideoDrop(e, i)}
              onDragEnd={onVideoDragEnd}
              className={`flex items-center gap-3 bg-slate-50 rounded-lg p-3 cursor-move transition-all ${dragVideoIdx === i ? 'opacity-40' : ''} ${overVideoIdx === i && dragVideoIdx !== i ? 'ring-2 ring-cyan-400' : ''}`}
              data-testid={`video-tile-${i}`}
            >
              <GripVertical size={14} className="text-slate-300" />
              <Video size={16} className="text-slate-400" />
              <span className="text-xs flex-1 truncate">{vid.caption || vid.url}</span>
              <button onClick={() => removeVideo(i)} className="text-red-400 hover:text-red-600" data-testid={`remove-video-${i}`}><Trash2 size={12} /></button>
            </div>
          ))}</div>
        ) : (
          <div onClick={() => videoInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-cyan-300 transition-colors">
            <Video size={24} className="text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Upload videos (MP4, WebM up to 50MB)</p>
          </div>
        )}
      </div>
      {uploading && <p className="text-xs text-cyan-600 animate-pulse">Uploading...</p>}
      <div className="pt-3 border-t border-slate-100">
        <SocialPreview listing={listing} />
      </div>
    </div>
  );
}

export function DiveSection({ form, set, addDiveSite, removeDiveSite, updateDiveSite }) {
  return (
    <div className="space-y-4" data-testid="section-dive">
      <h3 className="text-base font-bold text-slate-800">Dive Details</h3>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Number of Dives</label><input type="number" className="input-field" min="1" value={form.num_dives} onChange={e => set('num_dives', e.target.value)} data-testid="num-dives" /></div>
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Depth (m)</label><input type="number" className="input-field" value={form.max_depth} onChange={e => set('max_depth', e.target.value)} data-testid="max-depth" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Certification Required</label><select className="input-field" value={form.certification_required} onChange={e => set('certification_required', e.target.value)} data-testid="cert-required">{CERT_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={form.nitrox_available} onChange={e => set('nitrox_available', e.target.checked)} className="rounded border-slate-300 accent-cyan-600" data-testid="nitrox-check" /><Wind size={14} /> Nitrox Available</label>
          {form.nitrox_available && <div><label className="block text-[10px] text-slate-400 mb-1">Nitrox Price</label><input type="number" className="input-field w-24" value={form.nitrox_price} onChange={e => set('nitrox_price', e.target.value)} data-testid="nitrox-price" /></div>}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><label className="text-xs font-semibold text-slate-600">Dive Sites</label><button onClick={addDiveSite} className="text-xs text-cyan-600 font-semibold flex items-center gap-1" data-testid="add-dive-site"><Plus size={12} /> Add Site</button></div>
        <div className="space-y-3">{form.dive_sites.map((site, i) => (
          <div key={`k${i}`} className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-400 uppercase">Site {i + 1}</span>{form.dive_sites.length > 1 && <button onClick={() => removeDiveSite(i)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>}</div>
            <div className="grid grid-cols-2 gap-3"><input className="input-field text-sm" placeholder="Site name" value={site.name} onChange={e => updateDiveSite(i, 'name', e.target.value)} /><input type="number" className="input-field text-sm" placeholder="Max depth (m)" value={site.max_depth || ''} onChange={e => updateDiveSite(i, 'max_depth', e.target.value)} /></div>
            <textarea className="input-field text-sm h-16 resize-none" placeholder="Describe the dive site, marine life, conditions..." value={site.description} onChange={e => updateDiveSite(i, 'description', e.target.value)} />
          </div>
        ))}</div>
      </div>
    </div>
  );
}

export function GearSection({ form, set }) {
  return (
    <div className="space-y-4" data-testid="section-gear">
      <h3 className="text-base font-bold text-slate-800">Gear & Equipment</h3>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={form.gear_rental?.included} onChange={e => set('gear_rental.included', e.target.checked)} className="rounded border-slate-300 accent-cyan-600" data-testid="gear-included" />Full gear rental included in price</label>
      {!form.gear_rental?.included && (<><p className="text-xs text-slate-400">Set individual rental prices for each item:</p><div className="space-y-2">{form.gear_rental?.items?.map((item, i) => (
        <div key={item.name} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
          <label className="flex items-center gap-2 flex-1 text-xs text-slate-700 cursor-pointer"><input type="checkbox" checked={item.included} onChange={e => { const items = [...form.gear_rental.items]; items[i] = { ...items[i], included: e.target.checked }; set('gear_rental.items', items); }} className="rounded border-slate-300 accent-cyan-600" />{item.name}</label>
          {!item.included && <div className="flex items-center gap-1"><span className="text-[10px] text-slate-400">$</span><input type="number" className="input-field w-20 text-sm" placeholder="0" value={item.price || ''} onChange={e => { const items = [...form.gear_rental.items]; items[i] = { ...items[i], price: parseFloat(e.target.value) || 0 }; set('gear_rental.items', items); }} /></div>}
          {item.included && <span className="text-[10px] text-green-600 font-semibold">FREE</span>}
        </div>
      ))}</div></>)}
    </div>
  );
}

export function DatesSection({ form, set }) {
  return (
    <div className="space-y-4" data-testid="section-dates">
      <h3 className="text-base font-bold text-slate-800">Dates & Schedule</h3>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Schedule Type</label><select className="input-field" value={form.schedule_type} onChange={e => set('schedule_type', e.target.value)} data-testid="schedule-type"><option value="on_demand">On Demand (available anytime)</option><option value="fixed">Fixed Dates</option><option value="recurring">Recurring Schedule</option></select></div>
      {form.schedule_type === 'fixed' && (<div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Arrival Date</label><input type="date" className="input-field" value={form.arrival_date} onChange={e => set('arrival_date', e.target.value)} data-testid="arrival-date" /></div><div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Departure Date</label><input type="date" className="input-field" value={form.departure_date} onChange={e => set('departure_date', e.target.value)} data-testid="departure-date" /></div></div>)}
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Duration (days)</label><input type="number" className="input-field w-32" min="1" value={form.duration_days} onChange={e => set('duration_days', e.target.value)} data-testid="duration-days" /></div>
    </div>
  );
}

export function AccommodationSection({ form, set, addRoom, removeRoom, updateRoom }) {
  return (
    <div className="space-y-4" data-testid="section-accommodation">
      <h3 className="text-base font-bold text-slate-800">Accommodation</h3>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={form.accommodation?.included} onChange={e => set('accommodation.included', e.target.checked)} className="rounded border-slate-300 accent-cyan-600" data-testid="accommodation-included" />Accommodation included in this listing</label>
      {form.accommodation?.included && (<><div className="flex items-center justify-between"><p className="text-xs text-slate-500">Define room types with flat per-trip pricing:</p><button onClick={addRoom} className="text-xs text-cyan-600 font-semibold flex items-center gap-1" data-testid="add-room"><Plus size={12} /> Add Room Type</button></div>
        <div className="space-y-4">{form.accommodation?.rooms?.map((room, i) => (
          <div key={`k${i}`} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-400 uppercase">Room {i + 1}</span><button onClick={() => removeRoom(i)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[10px] text-slate-400 mb-1">Room Type</label><select className="input-field text-sm" value={room.type} onChange={e => updateRoom(i, 'type', e.target.value)}>{ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-[10px] text-slate-400 mb-1">Max Occupancy</label><input type="number" className="input-field text-sm" min="1" value={room.occupancy} onChange={e => updateRoom(i, 'occupancy', parseInt(e.target.value))} /></div>
            </div>
            <div><label className="block text-[10px] text-slate-400 mb-1">Room Name</label><input className="input-field text-sm" placeholder="e.g., Ocean View Suite" value={room.name} onChange={e => updateRoom(i, 'name', e.target.value)} /></div>
            <div><label className="block text-[10px] text-slate-400 mb-1">Description</label><textarea className="input-field text-sm h-16 resize-none" placeholder="Describe what's in the room..." value={room.description} onChange={e => updateRoom(i, 'description', e.target.value)} /></div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-1">Flat Per-Trip Pricing</p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-[10px] text-slate-400 mb-1">Single Occupancy</label><input type="number" className="input-field text-sm" placeholder="0" value={room.price_single || ''} onChange={e => updateRoom(i, 'price_single', parseFloat(e.target.value) || 0)} data-testid={`room-${i}-single`} /><p className="text-[9px] text-slate-300 mt-0.5">1 person, private room</p></div>
              <div><label className="block text-[10px] text-slate-400 mb-1">Double Occupancy</label><input type="number" className="input-field text-sm" placeholder="0" value={room.price_double || ''} onChange={e => updateRoom(i, 'price_double', parseFloat(e.target.value) || 0)} data-testid={`room-${i}-double`} /><p className="text-[9px] text-slate-300 mt-0.5">2 people per room (per person)</p></div>
              <div><label className="block text-[10px] text-slate-400 mb-1">Shared / Solo in Shared</label><input type="number" className="input-field text-sm" placeholder="0" value={room.price_shared || ''} onChange={e => updateRoom(i, 'price_shared', parseFloat(e.target.value) || 0)} data-testid={`room-${i}-shared`} /><p className="text-[9px] text-slate-300 mt-0.5">1 person, shareable room</p></div>
            </div>
          </div>
        ))}{(!form.accommodation?.rooms || form.accommodation.rooms.length === 0) && <p className="text-xs text-slate-400 text-center py-4">No rooms added yet. Click "Add Room Type" to define accommodation options.</p>}</div></>)}
    </div>
  );
}

export function InclusionsSection({ form, addListItem, removeListItem, updateListItem }) {
  return (
    <div className="space-y-4" data-testid="section-inclusions">
      <h3 className="text-base font-bold text-slate-800">What's Included / Excluded</h3>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2"><label className="text-xs font-semibold text-green-600">Included</label><button onClick={() => addListItem('inclusions')} className="text-xs text-cyan-600 font-semibold"><Plus size={12} className="inline" /> Add</button></div>
          <div className="space-y-2">{form.inclusions.map((item, i) => (<div key={`k${i}`} className="flex items-center gap-2"><span className="text-green-500 text-xs">+</span><input className="input-field text-sm flex-1" placeholder="e.g., All dive equipment" value={item} onChange={e => updateListItem('inclusions', i, e.target.value)} />{form.inclusions.length > 1 && <button onClick={() => removeListItem('inclusions', i)} className="text-red-400"><X size={12} /></button>}</div>))}</div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2"><label className="text-xs font-semibold text-red-500">Excluded</label><button onClick={() => addListItem('exclusions')} className="text-xs text-cyan-600 font-semibold"><Plus size={12} className="inline" /> Add</button></div>
          <div className="space-y-2">{form.exclusions.map((item, i) => (<div key={`k${i}`} className="flex items-center gap-2"><span className="text-red-400 text-xs">-</span><input className="input-field text-sm flex-1" placeholder="e.g., International flights" value={item} onChange={e => updateListItem('exclusions', i, e.target.value)} />{form.exclusions.length > 1 && <button onClick={() => removeListItem('exclusions', i)} className="text-red-400"><X size={12} /></button>}</div>))}</div>
        </div>
      </div>
    </div>
  );
}

export function PricingSection({ form, set }) {
  // Dispatch E — Live "Stored as ₹X.XX" preview using frankfurter rates from useUIStore
  const exchangeRates = (typeof window !== 'undefined' && window.__bt_exchange_rates_cached) || null;
  const computeInr = () => {
    const p = parseFloat(form.price);
    if (!p || isNaN(p)) return null;
    const cur = (form.currency || 'USD').toUpperCase();
    if (cur === 'INR') return p;
    const inrPerUsd = exchangeRates?.inrPerUsd;
    if (!inrPerUsd) return null;
    if (cur === 'USD') return p * Number(inrPerUsd);
    const rate = exchangeRates?.rates?.[cur];
    return rate ? (p / Number(rate)) * Number(inrPerUsd) : null;
  };
  const previewInr = computeInr();
  return (
    <div className="space-y-4" data-testid="section-pricing">
      <h3 className="text-base font-bold text-slate-800">Pricing</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Price per Person *</label>
          <input type="number" className="input-field text-lg font-bold" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} data-testid="price" />
          {previewInr !== null && (form.currency || 'USD').toUpperCase() !== 'INR' && (
            <p className="text-[11px] text-cyan-600 font-semibold mt-1" data-testid="price-inr-preview">
              Stored as ₹{previewInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (canonical INR)
            </p>
          )}
          {previewInr === null && form.price && (form.currency || 'USD').toUpperCase() !== 'INR' && (
            <p className="text-[11px] text-slate-400 mt-1">FX rates loading…</p>
          )}
        </div>
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Currency</label><select className="input-field" value={form.currency} onChange={e => set('currency', e.target.value)} data-testid="currency">{['USD', 'EUR', 'GBP', 'INR', 'THB', 'IDR', 'AUD', 'MYR', 'PHP', 'EGP', 'MXN'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
      </div>
    </div>
  );
}

export function PoliciesSection({ form, set }) {
  return (
    <div className="space-y-4" data-testid="section-policies">
      <h3 className="text-base font-bold text-slate-800">Policies & Legal</h3>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Cancellation Policy</label><textarea className="input-field h-20 resize-none text-sm" placeholder="e.g., Free cancellation up to 48 hours before the trip..." value={form.cancellation_policy} onChange={e => set('cancellation_policy', e.target.value)} data-testid="cancel-policy" /></div>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Refund Policy</label><textarea className="input-field h-20 resize-none text-sm" placeholder="Describe your refund terms..." value={form.refund_policy} onChange={e => set('refund_policy', e.target.value)} data-testid="refund-policy" /></div>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Terms & Conditions</label><textarea className="input-field h-24 resize-none text-sm" placeholder="General terms and conditions..." value={form.terms_conditions} onChange={e => set('terms_conditions', e.target.value)} data-testid="terms" /></div>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Legal Disclaimer</label><textarea className="input-field h-20 resize-none text-sm" placeholder="Any legal disclaimers..." value={form.legal_disclaimer} onChange={e => set('legal_disclaimer', e.target.value)} data-testid="legal-disclaimer" /></div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-amber-600" /><label className="text-xs font-bold text-amber-800">TCS Compliance (India)</label></div>
        <label className="flex items-center gap-2 text-xs text-amber-700 cursor-pointer"><input type="checkbox" checked={form.tcs_compliance?.applicable} onChange={e => set('tcs_compliance.applicable', e.target.checked)} className="rounded border-amber-300 accent-amber-600" data-testid="tcs-applicable" />This listing is subject to TCS for Indian customers</label>
        {form.tcs_compliance?.applicable && (<><div className="grid grid-cols-2 gap-3"><div><label className="block text-[10px] text-amber-600 mb-1">TCS Rate (%)</label><input type="number" className="input-field text-sm" value={form.tcs_compliance.rate} onChange={e => set('tcs_compliance.rate', parseFloat(e.target.value))} /></div></div><textarea className="input-field text-xs h-16 resize-none" value={form.tcs_compliance.disclaimer} onChange={e => set('tcs_compliance.disclaimer', e.target.value)} /></>)}
      </div>
    </div>
  );
}

export function DirectionsSection({ form, set }) {
  return (
    <div className="space-y-4" data-testid="section-directions">
      <h3 className="text-base font-bold text-slate-800">How to Get There</h3>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Nearest Airport</label><input className="input-field" placeholder="e.g., Ngurah Rai International Airport (DPS)" value={form.directions?.nearest_airport} onChange={e => set('directions.nearest_airport', e.target.value)} data-testid="nearest-airport" /></div>
      <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Getting There</label><textarea className="input-field h-24 resize-none text-sm" placeholder="Detailed directions..." value={form.directions?.text} onChange={e => set('directions.text', e.target.value)} data-testid="directions-text" /></div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={form.directions?.transfers_available} onChange={e => set('directions.transfers_available', e.target.checked)} className="rounded border-slate-300 accent-cyan-600" data-testid="transfers-check" />Airport transfers available</label>
        {form.directions?.transfers_available && <div className="flex items-center gap-1"><span className="text-xs text-slate-400">Transfer price: $</span><input type="number" className="input-field w-24 text-sm" value={form.directions?.transfer_price} onChange={e => set('directions.transfer_price', parseFloat(e.target.value))} data-testid="transfer-price" /></div>}
      </div>
    </div>
  );
}

export function MedicalSection({ form, set }) {
  return (
    <div className="space-y-4" data-testid="section-medical">
      <h3 className="text-base font-bold text-slate-800">Medical & Safety Requirements</h3>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={form.medical_waiver_required} onChange={e => set('medical_waiver_required', e.target.checked)} className="rounded border-slate-300 accent-cyan-600" data-testid="waiver-required" /><Stethoscope size={14} /> Require medical waiver before diving</label>
      <p className="text-xs text-slate-500">When enabled, customers must complete and sign a PADI Medical Statement form before participating.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><p className="text-xs text-blue-700">The standard PADI Participant Questionnaire will be presented to divers during booking. If any medical conditions are flagged, they will be required to obtain physician clearance.</p></div>
    </div>
  );
}
