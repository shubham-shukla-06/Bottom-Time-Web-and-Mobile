import { X, Plus, Trash2, ChevronDown } from 'lucide-react';

export function TripTray({ items, trip, show, onToggle, onRemove, onViewListing, trips, onSwitchTrip, onNewTrip, onDeleteTrip }) {
  if (!trip && items.length === 0 && trips.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-40" data-testid="trip-tray">
      <button onClick={onToggle}
        className="w-full bg-slate-900 text-white px-6 py-3 flex items-center justify-between hover:bg-slate-800 transition-colors"
        data-testid="trip-tray-toggle">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-cyan-400 flex items-center justify-center text-xs font-bold">{items.length}</div>
          <span className="text-sm font-semibold">{trip?.name || 'Trip Planner'}</span>
        </div>
        <ChevronDown size={18} className={`transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>

      {show && (
        <div className="bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgb(0,0,0,0.1)] max-h-[50vh] overflow-y-auto fade-in" data-testid="trip-panel">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {trips.map(t => (
                <button key={t.id} onClick={() => onSwitchTrip(t)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${t.id === trip?.id ? 'bg-cyan-400 text-white' : 'bg-slate-100 text-slate-600'}`}
                  data-testid="trip-tab">{t.name}</button>
              ))}
              <button onClick={onNewTrip} className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1" data-testid="new-trip-btn"><Plus size={10} /> New</button>
              {trip && <button onClick={onDeleteTrip} className="px-3 py-1 rounded-full text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 ml-auto" data-testid="delete-trip-btn"><Trash2 size={10} className="inline mr-0.5" /> Delete</button>}
            </div>

            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={item.listing_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 group" data-testid="trip-item">
                    <span className="w-6 h-6 rounded-full bg-cyan-50 text-cyan-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    {item.listing?.image_url && <img src={item.listing.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" loading="lazy" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate cursor-pointer hover:text-cyan-400" onClick={() => onViewListing(item.listing_id)}>{item.listing_name || item.listing?.name}</p>
                      {item.listing?.location && <p className="text-[10px] text-slate-400">{item.listing.location}</p>}
                    </div>
                    <button onClick={() => onRemove(item.listing_id)} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all" data-testid="remove-trip-item"><X size={14} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-slate-400 py-4">Add listings from the grid above using the + button</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
