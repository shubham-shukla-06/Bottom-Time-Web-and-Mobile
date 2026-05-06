import { memo } from 'react';
import { MapPin, Star, Eye, Edit3, Trash2, CalendarDays } from 'lucide-react';
import { OperatorDashboardSkeleton } from '../../components/Skeletons';

export const ListingCard = memo(function ListingCard({ listing: l, onView, onEdit, onDelete, onAvailability }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all group" data-testid="operator-listing">
      <div className="relative h-40 overflow-hidden">
        <img src={l.image_url} alt={l.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        <StatusBadge status={l.status} className="absolute top-3 right-3" />
        {l.type && <span className="absolute bottom-3 left-3 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold rounded-full">{l.type.replace('_', ' ')}</span>}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-sm line-clamp-1 mb-1">{l.name}</h3>
        <p className="text-xs text-slate-400 flex items-center gap-1 mb-2"><MapPin size={10} />{l.location}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {l.price && <span className="text-sm font-bold text-cyan-400">${l.price}</span>}
            {l.rating && <span className="text-xs text-slate-500 flex items-center gap-0.5"><Star size={10} />{l.rating}</span>}
          </div>
          <div className="flex gap-1">
            {onAvailability && <button onClick={onAvailability} className="p-1.5 rounded-lg hover:bg-cyan-50 text-slate-400 hover:text-cyan-500 transition-colors" title="Set availability" data-testid="availability-btn"><CalendarDays size={14} /></button>}
            {onView && <button onClick={onView} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" data-testid="view-listing-btn"><Eye size={14} /></button>}
            {onEdit && <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-cyan-50 text-slate-400 hover:text-cyan-400 transition-colors" data-testid="edit-listing-btn"><Edit3 size={14} /></button>}
            {onDelete && <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" data-testid="delete-listing-btn"><Trash2 size={14} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
});

export const StatCard = memo(function StatCard({ label, value, color, icon }) {
  return (
    <div className="group bg-white rounded-xl border border-slate-100 hover:border-cyan-300 p-3.5 hover:shadow-md transition-[box-shadow,border-color] duration-200" data-testid="operator-stat">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-200">{icon}</span>
        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-black text-slate-900">{value ?? 0}</div>
    </div>
  );
});

export const StatusBadge = memo(function StatusBadge({ status, className = '' }) {
  const styles = { active: 'bg-cyan-50 text-cyan-700', pending: 'bg-slate-100 text-slate-600', confirmed: 'bg-cyan-50 text-cyan-700', rejected: 'bg-red-50 text-red-600', cancelled: 'bg-slate-100 text-slate-500' };
  return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${styles[status] || 'bg-slate-100 text-slate-500'} ${className}`} data-testid="status-badge">{status || 'active'}</span>;
});

export const Loader = memo(function Loader() {
  return <OperatorDashboardSkeleton />;
});

export const EmptyState = memo(function EmptyState({ icon, title, desc }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
      <div className="text-slate-300 mx-auto mb-4 flex justify-center">{icon}</div>
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-slate-500 text-sm">{desc}</p>
    </div>
  );
});
