import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Navbar from '../components/Navbar';
import { Send, ArrowLeft, MessageCircle, Plus, Search, X, Users, Check, CheckCheck, Wifi, WifiOff } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { MessageThreadListSkeleton, BuddyGridSkeleton } from '../components/Skeletons';
import NewChatModal from './messages/NewChatModal';

export default function Messages() {
  const user = useAuthStore(s => s.user);
  const [searchParams] = useSearchParams();
  const openWithUser = searchParams.get('with');

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
  const bottomRef = useRef(null);
  const wsRef = useRef(null);
  const activeThreadRef = useRef(null);
  activeThreadRef.current = activeThread;
  const typingTimerRef = useRef(null);
  const typingClearTimers = useRef({});

  // WebSocket connection
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
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_message') {
            const msg = data.message;
            if (activeThreadRef.current === data.thread_id) {
              setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
            }
            fetchThreads();
          } else if (data.type === 'typing') {
            setTypingUsers(prev => ({ ...prev, [data.thread_id]: data.user_name || 'Someone' }));
            // Auto-clear after 3s
            const key = data.thread_id;
            clearTimeout(typingClearTimers.current[key]);
            typingClearTimers.current[key] = setTimeout(() => {
              setTypingUsers(prev => { const n = { ...prev }; delete n[key]; return n; });
            }, 3000);
          } else if (data.type === 'stop_typing') {
            setTypingUsers(prev => { const n = { ...prev }; delete n[data.thread_id]; return n; });
          } else if (data.type === 'read_receipt') {
            // Mark messages as read
            if (data.message_ids) {
              setReadMessageIds(prev => {
                const next = new Set(prev);
                data.message_ids.forEach(id => next.add(id));
                return next;
              });
            }
          }
        } catch (e) { /* silent */ }
      };

      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(pingTimer);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchThreads(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (openWithUser && user) openThreadWith(openWithUser);
  }, [openWithUser, user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeThread) fetchMessages(activeThread);
  }, [activeThread]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/messages/threads');
      setThreads(res.data.threads);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  const openThreadWith = async (userId) => {
    try {
      const res = await axios.get(`/messages/thread-with/${userId}`);
      setActiveThread(res.data.thread_id);
      setActiveThreadData({ type: 'direct', other_user: res.data.other_user });
      setShowNewChat(false);
    } catch (e) { toast.error('Failed to open chat'); }
  };

  const openGroupThread = (threadId, threadData) => {
    setActiveThread(threadId);
    setActiveThreadData(threadData);
    setShowNewChat(false);
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
      // Stop typing indicator on send
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
    if (t.type === 'group') {
      setActiveThreadData({ type: 'group', name: t.name, participants: t.participants });
    } else {
      setActiveThreadData({ type: 'direct', other_user: t.other_user });
    }
  };

  const handleGroupCreated = (data) => {
    fetchThreads();
    openGroupThread(data.thread_id, { type: 'group', name: data.name, participants: data.participants });
  };

  const isGroup = activeThreadData?.type === 'group';
  const headerName = isGroup ? (activeThreadData?.name || 'Group') : (activeThreadData?.other_user?.name || threads.find(t => t.thread_id === activeThread)?.other_user?.name || '');
  const headerInitials = isGroup ? null : headerName?.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12 py-8" data-testid="messages-page">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chat</h1>
            <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${wsConnected ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`} data-testid="ws-status">
              {wsConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {wsConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <button onClick={() => setShowNewChat(true)} className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm" data-testid="new-chat-btn">
            <Plus size={16} /> New Chat
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[500px]">
          {/* Thread list */}
          <div className={`md:col-span-1 border border-slate-100 rounded-2xl overflow-hidden ${activeThread ? 'hidden md:block' : ''}`}>
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-sm">Conversations</h3>
            </div>
            {loading && threads.length === 0 ? (
              <MessageThreadListSkeleton count={5} />
            ) : threads.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {threads.map(t => (
                  <button key={t.thread_id} onClick={() => selectThread(t)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${activeThread === t.thread_id ? 'bg-cyan-50' : ''}`} data-testid="thread-item">
                    <div className="flex items-center gap-3">
                      {t.type === 'group' ? (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-white flex items-center justify-center flex-shrink-0">
                          <Users size={16} />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-400 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {t.other_user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-sm truncate">
                            {t.type === 'group' ? t.name : t.other_user?.name}
                          </span>
                          {t.unread > 0 && <span className="w-5 h-5 bg-cyan-400 text-white text-xs rounded-full flex items-center justify-center">{t.unread}</span>}
                        </div>
                        <p className="text-xs text-slate-400 truncate">
                          {typingUsers[t.thread_id] ? (
                            <span className="text-cyan-400 font-medium">{typingUsers[t.thread_id]} is typing...</span>
                          ) : t.last_message}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                <MessageCircle className="mx-auto mb-2" size={24} />
                <p>No conversations yet</p>
                <button onClick={() => setShowNewChat(true)} className="text-cyan-400 font-semibold text-sm mt-2 hover:underline" data-testid="start-first-chat">
                  Start your first chat
                </button>
              </div>
            )}
          </div>

          {/* Message view */}
          <div className={`md:col-span-2 border border-slate-100 rounded-2xl flex flex-col overflow-hidden ${!activeThread ? 'hidden md:flex' : ''}`}>
            {activeThread ? (
              <>
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                  <button onClick={() => { setActiveThread(null); setActiveThreadData(null); }} className="md:hidden p-1" data-testid="back-btn"><ArrowLeft size={18} /></button>
                  {isGroup ? (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-white flex items-center justify-center">
                      <Users size={14} />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-400 text-white flex items-center justify-center font-bold text-xs">
                      {headerInitials}
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-sm">{headerName}</span>
                    {isGroup && activeThreadData?.participants && (
                      <p className="text-xs text-slate-400">{activeThreadData.participants.length} members</p>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[400px]">
                  {messages.length === 0 && (
                    <p className="text-center text-slate-400 text-sm py-8">Start the conversation!</p>
                  )}
                  {messages.map(m => {
                    const isMine = m.from_id === user?.id;
                    const isRead = isMine && (m.read === true || readMessageIds.has(m.id) || (m.read_by && m.read_by.length > 1));
                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`} data-testid="message-bubble">
                        <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMine ? 'bg-cyan-400 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                          {isGroup && !isMine && (
                            <p className="text-xs font-semibold mb-1 text-cyan-400">{m.from_name}</p>
                          )}
                          {m.content}
                          <div className={`flex items-center gap-1 mt-1 ${isMine ? 'text-cyan-200 justify-end' : 'text-slate-400'}`}>
                            <span className="text-xs">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMine && (
                              isRead
                                ? <CheckCheck size={14} className="text-white" data-testid="read-receipt-double" />
                                : <Check size={14} className="text-cyan-200" data-testid="read-receipt-single" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Typing indicator */}
                  {activeThread && typingUsers[activeThread] && (
                    <div className="flex justify-start" data-testid="typing-indicator">
                      <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">{typingUsers[activeThread]}</span>
                        <span className="flex gap-0.5">
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="p-4 border-t border-slate-100">
                  <div className="flex gap-2">
                    <input type="text" className="input-field flex-1 text-sm" placeholder="Type a message..." value={newMsg}
                      onChange={e => { setNewMsg(e.target.value); sendTyping(); }} onKeyDown={e => e.key === 'Enter' && sendMessage()} data-testid="message-input" />
                    <button onClick={sendMessage} className="btn-primary px-4 py-2" data-testid="send-message-btn"><Send size={16} /></button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                <div className="text-center">
                  <MessageCircle className="mx-auto mb-2" size={32} />
                  <p>Select a conversation or</p>
                  <button onClick={() => setShowNewChat(true)} className="text-cyan-400 font-semibold mt-1 hover:underline" data-testid="new-chat-prompt">start a new chat</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelectDirect={(userId) => { openThreadWith(userId); }}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}

