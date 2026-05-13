import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

/**
 * Thread screen. Two URL shapes:
 *   /thread/[id]                        – id is the thread_id (DM `uidA_uidB` or `group_xxx`)
 *   /thread/[userId]?kind=with          – open or create a DM thread with that user
 */
export default function ThreadScreen() {
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [other, setOther] = useState<any>(null);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);

  // Resolve thread id (handle the `with` flow)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (kind === 'with' && id) {
          const res = await api.get(`/messages/thread-with/${id}`);
          if (!mounted) return;
          setThreadId(res.data?.thread_id);
          setOther(res.data?.other_user);
        } else if (id) {
          setThreadId(id);
          if (id.startsWith('group_')) {
            try {
              const res = await api.get(`/messages/thread-info/${id}`);
              if (mounted) setGroupInfo(res.data);
            } catch {/* silent */}
          } else {
            // resolve other user from threads list
            try {
              const res = await api.get('/messages/threads');
              const t = (res.data?.threads || []).find((x: any) => x.thread_id === id);
              if (mounted && t) setOther(t.other_user);
            } catch {/* silent */}
          }
        }
      } catch {
        if (mounted) router.back();
      }
    })();
    return () => { mounted = false; };
  }, [id, kind, router]);

  const fetchMessages = useCallback(async (tid: string) => {
    try {
      const res = await api.get(`/messages/${tid}`);
      const msgs = res.data?.messages || [];
      // only update if changed (avoid relayout flicker on poll)
      const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
      if (lastId !== lastMsgIdRef.current || msgs.length !== messages.length) {
        setMessages(msgs);
        lastMsgIdRef.current = lastId;
      }
      if (res.data?.type === 'group' && res.data?.participants) {
        setGroupInfo((prev: any) => ({ ...(prev || {}), participants: res.data.participants, type: 'group' }));
      }
    } catch {/* silent */}
    finally { setLoading(false); }
  }, [messages.length]);

  // initial fetch + poll every 3s while screen is open
  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    fetchMessages(threadId);
    pollRef.current = setInterval(() => fetchMessages(threadId), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [threadId, fetchMessages]);

  // auto-scroll to last message when count changes
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const isGroup = !!threadId?.startsWith('group_');
  const headerName = isGroup ? (groupInfo?.name || 'Group') : (other?.name || 'Diver');

  const send = async () => {
    if (!text.trim() || !threadId || sending) return;
    setSending(true);
    const content = text.trim();
    setText('');
    try {
      if (isGroup) {
        await api.post('/messages', { thread_id: threadId, content });
      } else {
        const toId = other?.id;
        if (toId) await api.post('/messages', { to_id: toId, content });
        else await api.post('/messages', { thread_id: threadId, content });
      }
      await fetchMessages(threadId);
    } catch {
      // silent — user can retry
    } finally { setSending(false); }
  };

  return (
    <SafeAreaView style={styles.container} testID="thread-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="thread-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <View style={[styles.avatar, isGroup && styles.avatarGroup]}>
          {isGroup ? (
            <Icon name="people" size={14} color={Colors.white} />
          ) : (
            <Text style={styles.avatarText}>{(headerName || 'U').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerName}</Text>
          {isGroup && groupInfo?.participants ? (
            <Text style={styles.headerSub}>{groupInfo.participants.length} members</Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m, i) => m.id || String(i)}
            contentContainerStyle={styles.messagesContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="chatbubble-ellipses-outline" size={36} color={Colors.slate300} />
                <Text style={styles.emptyTitle}>Say hello</Text>
                <Text style={styles.emptySubtitle}>Start the conversation by sending a message below.</Text>
              </View>
            }
            renderItem={({ item: m, index }) => {
              const mine = m.from_id === me?.id;
              const showName = isGroup && !mine && (index === 0 || messages[index - 1]?.from_id !== m.from_id);
              return (
                <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]} testID={`msg-${m.id}`}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    {showName && <Text style={styles.bubbleName}>{m.from_name}</Text>}
                    <Text style={[styles.bubbleText, mine && { color: Colors.white }]}>{m.content}</Text>
                    <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={Colors.slate400}
            style={styles.input}
            multiline
            testID="message-input"
          />
          <TouchableOpacity
            onPress={send}
            disabled={!text.trim() || sending}
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            testID="send-msg-btn">
            {sending ? <ActivityIndicator size="small" color={Colors.white} /> :
              <Icon name="paper-plane" size={16} color={Colors.white} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  avatarGroup: { backgroundColor: '#0d9488' },
  avatarText: { color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  headerSub: { fontSize: 11, color: Colors.slate500 },
  messagesContent: { padding: 14, gap: 4, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row', marginBottom: 4 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  bubbleMine: { backgroundColor: Colors.cyan500, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: Colors.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.borderLight },
  bubbleName: { fontSize: 11, fontWeight: '700', color: Colors.cyan500, marginBottom: 2 },
  bubbleText: { fontSize: 14, color: Colors.slate800, lineHeight: 19 },
  bubbleTime: { fontSize: 9, color: Colors.slate400, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  input: { flex: 1, backgroundColor: Colors.slate50, borderRadius: 22, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 14, color: Colors.slate900, maxHeight: 100, minHeight: 40 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
});
