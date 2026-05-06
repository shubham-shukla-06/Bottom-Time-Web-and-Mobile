import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { Calendar } from '../../components/ui/calendar';
import { Skeleton } from '../../components/ui/skeleton';

export default function AvailabilityModal({ listing, onClose }) {
  const [selectedDates, setSelectedDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fetchDates = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/listings/${listing.id}/availability`);
        setSelectedDates((res.data.available_dates || []).map(d => new Date(d + 'T12:00:00')));
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    };
    fetchDates();
  }, [listing.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dates = selectedDates.map(d => d.toISOString().split('T')[0]).sort();
      await axios.put(`/listings/${listing.id}/availability`, { available_dates: dates });
      toast.success(`${dates.length} dates saved!`);
      onClose();
    } catch (e) { toast.error('Failed to save availability'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4" data-testid="availability-modal">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold">Set Availability</h2>
            <p className="text-xs text-slate-400">{listing.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={20} /></button>
        </div>
        <div className="p-5">
          <p className="text-sm text-slate-500 mb-3">Click dates to toggle availability. Green = available.</p>
          {loading ? (
            <div className="py-10 space-y-3"><Skeleton className="h-8 w-full rounded-lg" /><Skeleton className="h-48 w-full rounded-xl" /></div>
          ) : (
            <Calendar mode="multiple" selected={selectedDates} onSelect={setSelectedDates} fromDate={new Date()} numberOfMonths={1} className="mx-auto" data-testid="availability-calendar" />
          )}
          <p className="text-xs text-slate-400 mt-2 text-center">{selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected</p>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary py-2.5 text-sm font-semibold" data-testid="save-availability-btn">{saving ? 'Saving...' : 'Save Availability'}</button>
        </div>
      </div>
    </div>
  );
}
