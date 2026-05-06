import { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import {
  Waves, Heart, Flame, Zap, Anchor, Globe, MapPin, Clock,
  MessageCircle, Users, Trophy, CheckCircle, Fish, Star
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { FeedListSkeleton } from '../../components/Skeletons';

const REACTIONS = [
  { key: 'heart', icon: Heart, label: 'Love', color: 'text-red-500' },
  { key: 'stoke', icon: Zap, label: 'Stoked!', color: 'text-amber-500' },
  { key: 'epic', icon: Star, label: 'Epic', color: 'text-violet-500' },
  { key: 'fire', icon: Flame, label: 'Fire', color: 'text-orange-500' },
  { key: 'jealous', icon: Globe, label: 'Take me!', color: 'text-emerald-500' },
];

const TYPE_ICONS = {
  new_dive: Waves, sighting: Fish, bucket_list_complete: CheckCircle,
  group_booking: Users, badge_earned: Trophy,
};
const TYPE_LABELS = {
  new_dive: 'logged a dive', sighting: 'spotted marine life',
  bucket_list_complete: 'checked off a bucket list site',
  group_booking: 'booked a group trip', badge_earned: 'earned a badge',
};

export default function FeedTab() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchFeed = useCallback(async (skip = 0) => {
    if (skip === 0) setLoading(true);
    try {
      const res = await axios.get(`/feed?skip=${skip}&limit=20`);
      if (skip === 0) setItems(res.data.items);
      else setItems(prev => [...prev, ...res.data.items]);
      setHasMore(res.data.has_more);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) fetchFeed(); }, [user, fetchFeed]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const react = useCallback(async (itemId, reaction) => {
    try {
      const res = await axios.post(`/feed/${itemId}/react`, { reaction });
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        viewer_reaction: res.data.reacted ? res.data.reaction : null,
        reaction_count: i.reaction_count + (res.data.reacted ? 1 : -1),
      } : i));
    } catch (e) { toast.error('Failed'); }
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 220,
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  if (loading && items.length === 0) {
    return <FeedListSkeleton count={4} />;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
        <Waves className="text-slate-200 mx-auto mb-3" size={48} />
        <h3 className="font-bold text-slate-700 mb-1">No activity yet</h3>
        <p className="text-slate-400 text-sm">Connect with divers to see their activity here.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto" data-testid="feed-tab-content">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map(virtualRow => {
          const item = items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="pb-4"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              <FeedCard item={item} onReact={react} />
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button onClick={() => fetchFeed(items.length)} className="w-full py-3 text-sm text-cyan-500 font-semibold hover:bg-white rounded-xl transition-colors" data-testid="load-more-feed">
          Load more
        </button>
      )}
    </div>
  );
}

const FeedCard = memo(function FeedCard({ item, onReact }) {
  const navigate = useNavigate();
  const [showReactions, setShowReactions] = useState(false);
  const Icon = TYPE_ICONS[item.type] || Waves;
  const label = TYPE_LABELS[item.type] || 'shared an update';
  const data = item.data || {};

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-sm transition-all" data-testid="feed-card">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(`/user/${item.user_id}`)} className="flex-shrink-0">
            {item.user_photo ? (
              <img src={item.user_photo} alt="" className="w-10 h-10 rounded-full object-cover" loading="lazy" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold">
                {item.user_name?.charAt(0)}
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              <button onClick={() => navigate(`/user/${item.user_id}`)} className="font-bold text-slate-800 hover:text-cyan-500">{item.user_name}</button>
              <span className="text-slate-400 ml-1">{label}</span>
            </p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock size={9} /> {timeAgo(item.created_at)}</p>
          </div>
          <Icon size={18} className="text-cyan-400 flex-shrink-0" />
        </div>

        {item.type === 'new_dive' && (
          <div className="bg-slate-50 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Anchor size={14} className="text-blue-500" />
              <span className="text-sm font-bold text-slate-800">{data.site_name || 'Unknown Site'}</span>
              {data.dive_number && <span className="text-[10px] bg-cyan-100 text-cyan-600 px-1.5 py-0.5 rounded-full font-bold">#{data.dive_number}</span>}
            </div>
            {data.location && <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-1"><MapPin size={9} /> {data.location}</p>}
            <div className="flex gap-3 text-xs text-slate-500">
              {data.max_depth > 0 && <span className="text-blue-600 font-semibold">{data.max_depth}m</span>}
              {data.duration > 0 && <span className="text-violet-600 font-semibold">{data.duration}min</span>}
            </div>
          </div>
        )}

        {item.type === 'sighting' && (
          <div className="bg-emerald-50 rounded-xl p-3 mb-3">
            <p className="text-sm text-emerald-700 font-semibold flex items-center gap-1.5 mb-1"><Fish size={14} /> Spotted {data.count || 0} species</p>
            <div className="flex flex-wrap gap-1">
              {(data.species || []).map(s => (
                <span key={s} className="px-2 py-0.5 bg-white text-emerald-600 rounded-full text-[10px] font-semibold">{s}</span>
              ))}
            </div>
          </div>
        )}

        {item.type === 'bucket_list_complete' && (
          <div className="bg-amber-50 rounded-xl p-3 mb-3">
            <p className="text-sm text-amber-700 font-semibold flex items-center gap-1.5"><CheckCircle size={14} /> Checked off: {data.site_name}</p>
            {data.location && <p className="text-[10px] text-amber-500 mt-0.5">{data.location}</p>}
          </div>
        )}

        {item.type === 'group_booking' && (
          <div className="bg-violet-50 rounded-xl p-3 mb-3">
            <p className="text-sm text-violet-700 font-semibold flex items-center gap-1.5"><Users size={14} /> Group trip: {data.trip_name}</p>
            <p className="text-xs text-violet-500 mt-0.5">{data.listing_name} with {data.members} divers on {data.date}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
          <div className="relative">
            <button
              onClick={() => setShowReactions(!showReactions)}
              className={`flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded-lg ${item.viewer_reaction ? 'bg-cyan-50 text-cyan-600' : 'text-slate-400 hover:bg-slate-50'}`}
              data-testid={`react-btn-${item.id}`}
            >
              {item.viewer_reaction ? (
                (() => { const r = REACTIONS.find(r => r.key === item.viewer_reaction); return r ? <r.icon size={14} className={r.color} /> : <Heart size={14} />; })()
              ) : <Heart size={14} />}
              <span className="font-semibold">{item.reaction_count || 0}</span>
            </button>
            {showReactions && (
              <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 bg-white rounded-full shadow-lg border border-slate-100 p-1 z-10" data-testid="reaction-picker">
                {REACTIONS.map(r => (
                  <button key={r.key} onClick={() => { onReact(item.id, r.key); setShowReactions(false); }}
                    className={`p-1.5 rounded-full hover:bg-slate-50 transition-transform hover:scale-125 ${item.viewer_reaction === r.key ? 'bg-cyan-50' : ''}`}
                    title={r.label} data-testid={`reaction-${r.key}`}>
                    <r.icon size={16} className={r.color} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
