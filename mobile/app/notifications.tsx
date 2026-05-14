import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../src/components/HapticTouchable';
import { Text } from '../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';
import { confirmDialog } from '../src/utils/confirm';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  booking_new: 'mail',
  booking_update: 'cube',
  connection_request: 'person-add',
  connection_accepted: 'people',
  new_message: 'chatbubble-ellipses',
  listing_approved: 'checkmark-circle',
  listing_rejected: 'close-circle',
  operator_application: 'document-text',
  operator_approved: 'shield-checkmark',
  operator_declined: 'close-circle',
  payment_received: 'cash',
};

const COLOR_MAP: Record<string, { bg: string; fg: string }> = {
  booking_new: { bg: Colors.cyan100, fg: Colors.cyan500 },
  booking_update: { bg: '#dcfce7', fg: '#15803d' },
  connection_request: { bg: '#dbeafe', fg: '#1d4ed8' },
  connection_accepted: { bg: '#d1fae5', fg: '#047857' },
  new_message: { bg: '#ede9fe', fg: '#6d28d9' },
  listing_approved: { bg: '#dcfce7', fg: '#15803d' },
  listing_rejected: { bg: '#fee2e2', fg: '#dc2626' },
  operator_application: { bg: '#fef3c7', fg: '#b45309' },
  operator_approved: { bg: '#dcfce7', fg: '#15803d' },
  operator_declined: { bg: '#fee2e2', fg: '#dc2626' },
  payment_received: { bg: '#d1fae5', fg: '#047857' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hrs ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return d.toLocaleDateString();
}

function resolveTarget(n: any): { type: 'route'; pathname: string; params?: any } | { type: 'error'; message: string } | null {
  const data = n?.data || {};
  switch (n?.type) {
    case 'new_message':
      if (data.thread_id) return { type: 'route', pathname: '/thread/[id]', params: { id: data.thread_id } };
      return { type: 'route', pathname: '/messages' };
    case 'connection_request':
    case 'connection_accepted': {
      const userId = data.from_user_id || data.user_id;
      if (userId) return { type: 'route', pathname: '/user/[id]', params: { id: userId } };
      return { type: 'route', pathname: '/(tabs)/community' };
    }
    case 'booking_new':
    case 'booking_update':
    case 'payment_received':
      if (data.booking_id) return { type: 'route', pathname: '/booking/[id]', params: { id: data.booking_id } };
      return { type: 'route', pathname: '/my-bookings' };
    case 'listing_approved':
    case 'listing_rejected':
      if (data.listing_id) return { type: 'route', pathname: '/listing/[id]', params: { id: data.listing_id } };
      return null;
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/notifications?limit=100');
      setItems(res.data?.notifications || []);
      setUnread(res.data?.unread_count || 0);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]));

  const markAllRead = async () => {
    try { await api.put('/notifications/read-all'); } catch {/* silent */}
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Delete notification?',
      message: 'This notification will be removed permanently.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setItems((prev) => prev.filter((n) => n.id !== id));
    try { await api.delete(`/notifications/${id}`); } catch {/* silent */}
  };

  const handleClick = async (n: any) => {
    if (!n.read) {
      try { await api.put(`/notifications/${n.id}/read`); } catch {/* silent */}
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      setUnread((u) => Math.max(0, u - 1));
    }
    const target = resolveTarget(n);
    if (!target) return; // no deep link
    if (target.type === 'route') router.push({ pathname: target.pathname as any, params: target.params || {} });
  };

  return (
    <SafeAreaView style={styles.container} testID="notifications-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="notif-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unread > 0 && <Text style={styles.headerSub}>{unread} unread</Text>}
        </View>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead} testID="mark-all-read-btn">
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="notifications-empty">
              <Icon name="notifications-outline" size={40} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>You'll see updates here when something happens.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item: n }) => {
            const Icon = ICON_MAP[n.type] || 'notifications';
            const colors = COLOR_MAP[n.type] || { bg: Colors.slate100, fg: Colors.slate600 };
            return (
              <View style={[styles.row, !n.read && styles.rowUnread]} testID={`notif-${n.id}`}>
                <TouchableOpacity onPress={() => handleClick(n)} style={styles.rowMain} testID={`notif-tap-${n.id}`}>
                  <View style={[styles.icon, { backgroundColor: colors.bg }]}>
                    <Icon name={Icon} size={16} color={colors.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.rowTitle, !n.read && { fontWeight: '700' }]} numberOfLines={1}>{n.title}</Text>
                      {!n.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.rowMessage} numberOfLines={2}>{n.message}</Text>
                    <Text style={styles.rowTime}>{formatTime(n.created_at)}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(n.id)} style={styles.deleteBtn} testID={`notif-delete-${n.id}`}>
                  <Icon name="trash-outline" size={14} color={Colors.slate400} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  headerSub: { fontSize: 11, color: Colors.slate500 },
  markAll: { fontSize: 12, fontWeight: '700', color: Colors.cyan500 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white },
  rowUnread: { backgroundColor: '#ecfeff' },
  rowMain: { flex: 1, flexDirection: 'row', gap: 12, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.slate900, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.cyan500 },
  rowMessage: { fontSize: 13, color: Colors.slate500, marginTop: 2 },
  rowTime: { fontSize: 10, color: Colors.slate400, marginTop: 4 },
  deleteBtn: { padding: 14 },
  sep: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 66 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
});
