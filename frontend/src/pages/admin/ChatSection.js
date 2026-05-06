import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { MessageCircle, Users, Globe, Activity, BarChart3, Bell, Target } from 'lucide-react';
import { SectionHeader, Tile, Loader } from './primitives';
import { useAutoRefresh } from './useAutoRefresh';

export default function ChatSection() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    axios.get('/cmd/chat').then(r => setD(r.data)).catch(() => { if (!silent) toast.error('Failed'); }).finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), 30000);

  if (loading) return <Loader />;

  return (
    <div className="space-y-5" data-testid="chat-section">
      <SectionHeader title="Chat & Communication" sectionKey="chat" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Total Threads" value={d.total_threads} icon={MessageCircle} color="cyan" />
        <Tile label="DMs" value={d.dm_threads} icon={Users} color="blue" />
        <Tile label="Groups" value={d.group_threads} icon={Globe} color="violet" />
        <Tile label="Total Messages" value={d.total_messages} icon={Activity} color="emerald" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Avg Msgs/Thread" value={d.avg_per_thread} icon={BarChart3} color="sky" />
        <Tile label="Unread" value={d.unread_messages} icon={Bell} color={d.unread_messages > 20 ? 'red' : 'amber'} />
        <Tile label="Chat > Booking" value={d.chat_to_booking} icon={Target} color="emerald" />
      </div>
    </div>
  );
}
