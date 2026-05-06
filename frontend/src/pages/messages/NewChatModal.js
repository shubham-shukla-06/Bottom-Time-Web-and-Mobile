import { useState, useEffect } from 'react';
import { X, Users, Search, Send, Plus } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';

export default function NewChatModal({ onClose, onSelectDirect, onGroupCreated }) {
  const [buddies, setBuddies] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBuddies(); }, []);

  const fetchBuddies = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/community/connections');
      setBuddies(res.data.buddies || []);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  const filtered = buddies.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.buddy?.name?.toLowerCase().includes(q) || b.buddy?.location_country?.toLowerCase().includes(q);
  });

  const toggleSelect = (buddyId) => {
    setSelected(prev => prev.includes(buddyId) ? prev.filter(id => id !== buddyId) : [...prev, buddyId]);
  };

  const handleAction = async () => {
    if (selected.length === 1) {
      onSelectDirect(selected[0]);
    } else if (selected.length >= 2) {
      setCreating(true);
      try {
        const res = await axios.post('/messages/group-thread', { participant_ids: selected, name: groupName || undefined });
        toast.success('Group created!');
        onGroupCreated(res.data);
      } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create group'); }
      finally { setCreating(false); }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4" data-testid="new-chat-modal">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold">New Chat</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400" data-testid="close-new-chat"><X size={20} /></button>
        </div>

        {/* Group name input (shown when 2+ selected) */}
        {selected.length >= 2 && (
          <div className="px-4 pt-4">
            <input
              type="text"
              placeholder="Group name (optional)"
              className="input-field w-full text-sm"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              data-testid="group-name-input"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selected.map(id => {
                const b = buddies.find(b => b.buddy?.id === id);
                return b ? (
                  <span key={id} className="px-2.5 py-1 bg-cyan-50 text-cyan-400 rounded-full text-xs font-medium flex items-center gap-1">
                    {b.buddy.name}
                    <button onClick={() => toggleSelect(id)} className="hover:text-red-500"><X size={12} /></button>
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search buddies..."
              className="input-field w-full text-sm" style={{ paddingLeft: '2.5rem' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              data-testid="buddy-search-input"
            />
          </div>
        </div>

        {/* Buddy list */}
        <div className="flex-1 overflow-y-auto">
          {loading && filtered.length === 0 ? (
            <BuddyGridSkeleton count={4} />
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {filtered.map(b => {
                const initials = b.buddy?.name?.split(' ').map(n => n[0]).join('').slice(0, 2);
                const isSelected = selected.includes(b.buddy.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleSelect(b.buddy.id)}
                    className={`w-full flex items-center gap-3 p-4 transition-colors text-left ${isSelected ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
                    data-testid="buddy-chat-option"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-400 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">{b.buddy?.name}</h3>
                      {b.buddy?.location_country && (
                        <p className="text-xs text-slate-400">{b.buddy.location_city ? `${b.buddy.location_city}, ` : ''}{b.buddy.location_country}</p>
                      )}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-cyan-400 border-cyan-400 text-white' : 'border-slate-200'}`}>
                      {isSelected && <Check size={14} />}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">
              <Users className="mx-auto mb-2" size={24} />
              {buddies.length === 0
                ? <p>No approved connections yet.<br />Connect with divers first!</p>
                : <p>No buddies match "{search}"</p>
              }
            </div>
          )}
        </div>

        {/* Action button */}
        {selected.length > 0 && (
          <div className="p-4 border-t border-slate-100">
            <button
              onClick={handleAction}
              disabled={creating}
              className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              data-testid="start-chat-action-btn"
            >
              {creating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : selected.length === 1 ? (
                <><MessageCircle size={16} /> Open Chat</>
              ) : (
                <><Users size={16} /> Create Group ({selected.length})</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
