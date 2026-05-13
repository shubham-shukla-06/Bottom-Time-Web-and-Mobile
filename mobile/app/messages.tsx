import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';

function timeAgo(d?: string) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(d).toLocaleDateString();
}

export default function MessagesScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await api.get('/messages/threads');
      setThreads(res.data?.threads || []);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchThreads();
    // poll thread list every 5s while focused
    pollRef.current = setInterval(fetchThreads, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchThreads]));

  return (
    <SafeAreaView style={styles.container} testID="messages-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="msg-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={() => setShowNewChat(true)} testID="new-chat-btn">
          <Icon name="add-circle" size={26} color={Colors.cyan500} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.thread_id}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchThreads(); }} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="messages-empty">
              <Icon name="chatbubbles-outline" size={40} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>Tap + to start a new chat with one of your buddies.</Text>
              <TouchableOpacity style={styles.emptyCta} onPress={() => setShowNewChat(true)} testID="empty-new-chat-btn">
                <Icon name="add" size={16} color={Colors.white} />
                <Text style={styles.emptyCtaText}>Start a chat</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: t }) => {
            const isGroup = t.type === 'group';
            const name = isGroup ? (t.name || 'Group') : (t.other_user?.name || 'Diver');
            const initials = (name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <TouchableOpacity
                style={styles.threadRow}
                onPress={() => router.push({ pathname: '/thread/[id]', params: { id: t.thread_id } })}
                testID={`thread-${t.thread_id}`}>
                <View style={[styles.avatar, isGroup && styles.avatarGroup]}>
                  {isGroup ? (
                    <Icon name="people" size={18} color={Colors.white} />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.threadTop}>
                    <Text style={styles.threadName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.threadTime}>{timeAgo(t.last_time)}</Text>
                  </View>
                  <View style={styles.threadBottom}>
                    <Text style={styles.threadLast} numberOfLines={1}>{t.last_message || 'Start the conversation'}</Text>
                    {t.unread > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{t.unread > 9 ? '9+' : t.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      <NewChatModal
        visible={showNewChat}
        onClose={() => setShowNewChat(false)}
        onSelectDirect={(uid) => {
          setShowNewChat(false);
          router.push({ pathname: '/thread/[userId]', params: { userId: uid, kind: 'with' } });
        }}
        onGroupCreated={(threadId) => {
          setShowNewChat(false);
          fetchThreads();
          router.push({ pathname: '/thread/[id]', params: { id: threadId } });
        }}
      />
    </SafeAreaView>
  );
}

function NewChatModal({ visible, onClose, onSelectDirect, onGroupCreated }: {
  visible: boolean;
  onClose: () => void;
  onSelectDirect: (uid: string) => void;
  onGroupCreated: (threadId: string) => void;
}) {
  const [buddies, setBuddies] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected([]); setGroupName(''); setSearch('');
    setLoading(true);
    api.get('/community/connections').then((res) => {
      setBuddies(res.data?.buddies || []);
    }).catch(() => setBuddies([])).finally(() => setLoading(false));
  }, [visible]);

  const filtered = buddies.filter((b) => !search ||
    (b.buddy?.name || '').toLowerCase().includes(search.toLowerCase()));

  const submit = async () => {
    if (selected.length === 1) {
      onSelectDirect(selected[0]);
      return;
    }
    if (selected.length >= 2) {
      setCreating(true);
      try {
        const res = await api.post('/messages/group-thread', {
          participant_ids: selected,
          name: groupName || undefined,
        });
        onGroupCreated(res.data?.thread_id);
      } catch {/* silent */}
      finally { setCreating(false); }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet} testID="new-chat-modal">
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New chat</Text>
            <TouchableOpacity onPress={onClose} testID="close-new-chat">
              <Icon name="close" size={22} color={Colors.slate700} />
            </TouchableOpacity>
          </View>

          {selected.length >= 2 && (
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name (optional)"
              style={styles.modalInput}
              testID="group-name-input"
            />
          )}

          <View style={styles.searchRow}>
            <Icon name="search" size={14} color={Colors.slate400} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search buddies…"
              style={styles.searchInput}
              testID="buddy-search-input"
            />
          </View>

          {loading ? (
            <View style={{ padding: 20 }}><ActivityIndicator color={Colors.cyan400} /></View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(b) => b.id}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={styles.emptyText}>{buddies.length === 0 ? 'No approved connections yet. Connect with divers first!' : 'No buddies match your search.'}</Text>
                </View>
              }
              renderItem={({ item: b }) => {
                const isSel = selected.includes(b.buddy?.id);
                return (
                  <TouchableOpacity
                    style={[styles.buddyOption, isSel && styles.buddyOptionActive]}
                    onPress={() => setSelected((prev) => isSel ? prev.filter((x) => x !== b.buddy?.id) : [...prev, b.buddy?.id])}
                    testID={`buddy-option-${b.buddy?.id}`}>
                    <View style={styles.optAvatar}>
                      <Text style={styles.optAvatarText}>{(b.buddy?.name || 'U').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optName}>{b.buddy?.name}</Text>
                      {b.buddy?.location_country && <Text style={styles.optSub}>{b.buddy.location_country}</Text>}
                    </View>
                    <View style={[styles.checkBox, isSel && styles.checkBoxActive]}>
                      {isSel && <Icon name="checkmark" size={12} color={Colors.white} />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {selected.length > 0 && (
            <TouchableOpacity onPress={submit} disabled={creating}
              style={[styles.startBtn, creating && { opacity: 0.5 }]}
              testID="start-chat-btn">
              {creating ? <ActivityIndicator color={Colors.white} /> :
                selected.length === 1 ?
                  <><Icon name="chatbubble" size={14} color={Colors.white} /><Text style={styles.startBtnText}>Open chat</Text></> :
                  <><Icon name="people" size={14} color={Colors.white} /><Text style={styles.startBtnText}>Create group ({selected.length})</Text></>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: Colors.white },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  avatarGroup: { backgroundColor: '#0d9488' },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  threadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  threadName: { fontSize: 15, fontWeight: '700', color: Colors.slate900, flex: 1 },
  threadTime: { fontSize: 11, color: Colors.slate400 },
  threadBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  threadLast: { flex: 1, fontSize: 13, color: Colors.slate500 },
  unreadBadge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  unreadText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  sep: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 70 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  emptyCtaText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.slate50, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.slate900 },
  buddyOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12 },
  buddyOptionActive: { backgroundColor: Colors.cyan50 },
  optAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  optAvatarText: { color: Colors.white, fontWeight: '700' },
  optName: { fontSize: 14, fontWeight: '600', color: Colors.slate900 },
  optSub: { fontSize: 11, color: Colors.slate500 },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  emptyText: { fontSize: 13, color: Colors.slate500, textAlign: 'center' },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.cyan500 },
  startBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
