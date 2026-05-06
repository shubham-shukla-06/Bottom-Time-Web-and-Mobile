import { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import { Send, ArrowLeft, MessageCircle, Plus, Search, X, Users, Check, CheckCheck, Wifi, WifiOff } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { MessageThreadListSkeleton, ChatAreaSkeleton } from '../../components/Skeletons';

export default function MessagesTab() {
  const user = useAuthStore(s => s.user);
  const [searchParams] = useSearchParams();
  const openWithUser = searchParams.get('with');
  const openThreadId = searchParams.get('thread');

  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [activeThreadData, setActiveThreadData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [readMessageIds, setReadMessageIds] = useState(new Set());
  const threadListRef = useRef(null);
  const messageListRef = useRef(null);
  const wsRef = useRef(null);
  const activeThreadRef = useRef(null);
  activeThreadRef.current = activeThread;
  const typingTimerRef = useRef(null);
  const typingClearTimers = useRef({});

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    const token = sessionStorage.getItem('token');
    if (!token) return;

    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = backendUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/api/ws/messages?token=${token}`;

    let ws;
    let reconnectTimer;
    let pingTimer;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setWsConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_message') {
            const msg = data.message;
            if (activeThreadRef.current === data.thread_id) {
              setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            }
            fetchThreads();
          } else if (data.type === 'typing') {
            setTypingUsers(prev => ({ ...prev, [data.thread_id]: data.user_name || 'Someone' }));
            const key = data.thread_id;
            clearTimeout(typingClearTimers.current[key]);
            typingClearTimers.current[key] = setTimeout(() => {
              setTypingUsers(prev => { const n = { ...prev }; delete n[key]; return n; });
            }, 3000);
          } else if (data.type === 'stop_typing') {
            setTypingUsers(prev => { const n = { ...prev }; delete n[data.thread_id]; return n; });
          } else if (data.type === 'read_receipt') {
            if (data.message_ids) {
              setReadMessageIds(prev => { const next = new Set(prev); data.message_ids.forEach(id => next.add(id)); return next; });
            }
          }
        } catch (e) { /* silent */ }
      };
      ws.onclose = () => { setWsConnected(false); clearInterval(pingTimer); reconnectTimer = setTimeout(connect, 3000); };
      ws.onerror = () => { ws.close(); };
      wsRef.current = ws;
    };

    connect();
    return () => { clearTimeout(reconnectTimer); clearInterval(pingTimer); if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); } };
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchThreads(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (openWithUser && user) openThreadWith(openWithUser); }, [openWithUser, user]);
  // Deep-link: ?thread=<id> opens that thread when it appears in the loaded list,
  // or surfaces a toast once if the thread isn't in the user's inbox.
  const threadDeepLinkHandledRef = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openThreadId || !user || loading || threadDeepLinkHandledRef.current) return;
    threadDeepLinkHandledRef.current = true;
    const found = threads.find(t => t.thread_id === openThreadId);
    if (found) {
      setActiveThread(openThreadId);
      const otherUser = found.other_user || null;
      setActiveThreadData(found.type === 'group'
        ? { type: 'group', name: found.name }
        : { type: 'direct', other_user: otherUser });
    } else {
      toast.error('This conversation no longer exists.');
    }
  }, [openThreadId, threads, loading, user]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeThread) fetchMessages(activeThread); }, [activeThread]);

  const threadVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => threadListRef.current,
    estimateSize: () => 72,
    overscan: 6,
  });

  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messageListRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!messages.length) return;
    messageVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, messageVirtualizer]);

  const fetchThreads = async () => {
    setLoading(true);
    try { const res = await axios.get('/messages/threads'); setThreads(res.data.threads); } catch (e) { /* silent */ } finally { setLoading(false); }
  };

  const openThreadWith = async (userId) => {
    try {
      const res = await axios.get(`/messages/thread-with/${userId}`);
      setActiveThread(res.data.thread_id);
      setActiveThreadData({ type: 'direct', other_user: res.data.other_user });
      setShowNewChat(false);
    } catch (e) { toast.error('Failed to open chat'); }
  };

  const fetchMessages = async (threadId) => {
    try {
      const res = await axios.get(`/messages/${threadId}`);
      setMessages(res.data.messages);
      if (res.data.type === 'group' && res.data.participants) {
        setActiveThreadData(prev => prev ? { ...prev, participants: res.data.participants } : { type: 'group', participants: res.data.participants });
      }
    } catch (e) { /* silent */ }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeThread) return;
    try {
      const isGroup = activeThread.startsWith('group_');
      if (isGroup) {
        await axios.post('/messages', { thread_id: activeThread, content: newMsg });
      } else {
        const toId = activeThreadData?.other_user?.id || threads.find(t => t.thread_id === activeThread)?.other_user?.id;
        if (!toId) return;
        await axios.post('/messages', { to_id: toId, content: newMsg });
      }
      setNewMsg('');
      sendStopTyping();
      fetchMessages(activeThread);
      fetchThreads();
    } catch (e) { toast.error('Failed to send'); }
  };

  const sendTyping = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !activeThread) return;
    wsRef.current.send(JSON.stringify({ type: 'typing', thread_id: activeThread, user_name: user?.name || '' }));
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(sendStopTyping, 2500);
  };

  const sendStopTyping = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !activeThread) return;
    wsRef.current.send(JSON.stringify({ type: 'stop_typing', thread_id: activeThread }));
    clearTimeout(typingTimerRef.current);
  };

  const selectThread = (t) => {
    setActiveThread(t.thread_id);
    setActiveThreadData(t.type === 'group' ? { type: 'group', name: t.name, participants: t.participants } : { type: 'direct', other_user: t.other_user });
  };

  const handleGroupCreated = (data) => {
    fetchThreads();
    setActiveThread(data.thread_id);
    setActiveThreadData({ type: 'group', name: data.name, participants: data.participants });
    setShowNewChat(false);
  };

  const isGroup = activeThreadData?.type === 'group';
  const headerName = isGroup ? (activeThreadData?.name || 'Group') : (activeThreadData?.other_user?.name || threads.find(t => t.thread_id === activeThread)?.other_user?.name || '');
  const headerInitials = isGroup ? null : headerName?.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div data-testid="messages-tab-content">
      <div className="flex items-center justify-between mb-4">
        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${wsConnected ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`} data-testid="ws-status">
          {wsConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
          {wsConnected ? 'Live' : 'Offline'}
        </span>
        <button onClick={() => setShowNewChat(true)} className="h-8 px-4 bg-cyan-400 hover:bg-cyan-500 text-white rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors" data-testid="new-chat-btn">
          <Plus size={13} /> New Chat
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-[450px]">
        {/* Thread list */}
        <div className={`md:col-span-1 border border-slate-100 rounded-2xl overflow-hidden bg-white ${activeThread ? 'hidden md:block' : ''}`}>
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <p className="font-bold text-xs text-slate-500">Conversations</p>
          </div>
          {loading && threads.length === 0 ? (
            <MessageThreadListSkeleton count={5} />
          ) : threads.length > 0 ? (
            <div ref={threadListRef} className="max-h-[400px] overflow-y-auto">
              <div style={{ height: threadVirtualizer.getTotalSize(), position: 'relative' }}>
                {threadVirtualizer.getVirtualItems().map(virtualRow => {
                  const t = threads[virtualRow.index];
                  if (!t) return null;
                  return (
                    <button key={t.thread_id} data-index={virtualRow.index} ref={threadVirtualizer.measureElement} onClick={() => selectThread(t)}
                      className={`w-full text-left p-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeThread === t.thread_id ? 'bg-cyan-50' : ''}`}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                      data-testid="thread-item">
                      <div className="flex items-center gap-2.5">
                        {t.type === 'group' ? (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-white flex items-center justify-center flex-shrink-0"><Users size={14} /></div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                            {t.other_user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-xs truncate">{t.type === 'group' ? t.name : t.other_user?.name}</span>
                            {t.unread > 0 && <span className="w-4 h-4 bg-cyan-400 text-white text-[9px] rounded-full flex items-center justify-center">{t.unread}</span>}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">
                            {typingUsers[t.thread_id] ? <span className="text-cyan-400 font-medium">{typingUsers[t.thread_id]} typing...</span> : t.last_message}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs">
              <MessageCircle className="mx-auto mb-2" size={20} />
              <p>No conversations yet</p>
            </div>
          )}
        </div>

        {/* Message view */}
        <div className={`md:col-span-2 border border-slate-100 rounded-2xl flex flex-col overflow-hidden bg-white ${!activeThread ? 'hidden md:flex' : ''}`}>
          {activeThread ? (
            <>
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
                <button onClick={() => { setActiveThread(null); setActiveThreadData(null); }} className="md:hidden p-1" data-testid="back-to-threads"><ArrowLeft size={16} /></button>
                {isGroup ? (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-white flex items-center justify-center"><Users size={12} /></div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-white flex items-center justify-center font-bold text-[9px]">{headerInitials}</div>
                )}
                <div>
                  <span className="font-bold text-sm">{headerName}</span>
                  {isGroup && activeThreadData?.participants && <p className="text-[10px] text-slate-400">{activeThreadData.participants.length} members</p>}
                </div>
              </div>
              <div ref={messageListRef} className="flex-1 overflow-y-auto p-3 max-h-[350px]">
                {messages.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-6">Start the conversation!</p>
                ) : (
                  <div style={{ height: messageVirtualizer.getTotalSize(), position: 'relative' }}>
                    {messageVirtualizer.getVirtualItems().map(virtualRow => {
                      const m = messages[virtualRow.index];
                      if (!m) return null;
                      const isMine = m.from_id === user?.id;
                      const isRead = isMine && (m.read === true || readMessageIds.has(m.id));
                      return (
                        <div key={m.id || virtualRow.key} data-index={virtualRow.index} ref={messageVirtualizer.measureElement}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'} pb-2`}
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                          data-testid="message-bubble">
                          <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isMine ? 'bg-cyan-400 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                            {isGroup && !isMine && <p className="text-[10px] font-semibold mb-0.5 text-cyan-400">{m.from_name}</p>}
                            {m.content}
                            <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'text-cyan-200 justify-end' : 'text-slate-400'}`}>
                              <span className="text-[10px]">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMine && (isRead ? <CheckCheck size={12} className="text-white" /> : <Check size={12} className="text-cyan-200" />)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {activeThread && typingUsers[activeThread] && (
                  <div className="flex justify-start" data-testid="typing-indicator">
                    <div className="bg-slate-100 rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-medium">{typingUsers[activeThread]}</span>
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-slate-100">
                <div className="flex gap-2">
                  <input type="text" className="flex-1 h-9 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" placeholder="Type a message..."
                    value={newMsg} onChange={e => { setNewMsg(e.target.value); sendTyping(); }} onKeyDown={e => e.key === 'Enter' && sendMessage()} data-testid="message-input" />
                  <button onClick={sendMessage} className="h-9 w-9 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl flex items-center justify-center transition-colors" data-testid="send-msg-btn"><Send size={14} /></button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              <div className="text-center">
                <MessageCircle className="mx-auto mb-2" size={28} />
                <p className="text-xs">Select a conversation or</p>
                <button onClick={() => setShowNewChat(true)} className="text-cyan-400 font-semibold text-xs mt-1 hover:underline">start a new chat</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onSelectDirect={openThreadWith} onGroupCreated={handleGroupCreated} />}
    </div>
  );
}

function NewChatModal({ onClose, onSelectDirect, onGroupCreated }) {
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
    try { const res = await axios.get('/community/connections'); setBuddies(res.data.buddies || []); } catch (e) { /* silent */ } finally { setLoading(false); }
  };

  const filtered = buddies.filter(b => !search || b.buddy?.name?.toLowerCase().includes(search.toLowerCase()));
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleAction = async () => {
    if (selected.length === 1) { onSelectDirect(selected[0]); }
    else if (selected.length >= 2) {
      setCreating(true);
      try {
        const res = await axios.post('/messages/group-thread', { participant_ids: selected, name: groupName || undefined });
        toast.success('Group created!');
        onGroupCreated(res.data);
      } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
      finally { setCreating(false); }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="new-chat-modal">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-bold text-base">New Chat</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        {selected.length >= 2 && (
          <div className="px-4 pt-3">
            <input type="text" placeholder="Group name (optional)" className="w-full h-9 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:border-cyan-400" value={groupName} onChange={e => setGroupName(e.target.value)} data-testid="group-name-input" />
          </div>
        )}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input type="text" placeholder="Search buddies..." className="w-full h-9 bg-white border border-slate-200 rounded-xl text-sm pl-9 pr-3 outline-none focus:border-cyan-400" value={search} onChange={e => setSearch(e.target.value)} autoFocus data-testid="buddy-search" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && filtered.length === 0 ? <BuddyGridSkeleton count={4} /> : filtered.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {filtered.map(b => {
                const isSelected = selected.includes(b.buddy.id);
                return (
                  <button key={b.id} onClick={() => toggleSelect(b.buddy.id)}
                    className={`w-full flex items-center gap-3 p-3 transition-colors text-left ${isSelected ? 'bg-cyan-50' : 'hover:bg-slate-50'}`} data-testid="buddy-chat-option">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                      {b.buddy?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{b.buddy?.name}</p>
                      {b.buddy?.location_country && <p className="text-[10px] text-slate-400">{b.buddy.location_country}</p>}
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-cyan-400 border-cyan-400 text-white' : 'border-slate-200'}`}>
                      {isSelected && <Check size={12} />}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs"><Users className="mx-auto mb-2" size={20} /><p>No buddies found</p></div>
          )}
        </div>
        {selected.length > 0 && (
          <div className="p-3 border-t border-slate-100">
            <button onClick={handleAction} disabled={creating} className="w-full h-9 bg-cyan-400 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50" data-testid="start-chat-btn">
              {creating ? '...' : selected.length === 1 ? <><MessageCircle size={14} /> Open Chat</> : <><Users size={14} /> Create Group ({selected.length})</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
