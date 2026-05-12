import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import FeedTab from '../../src/components/connect/FeedTab';
import BuddiesTab from '../../src/components/connect/BuddiesTab';

const TABS = [
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline' as const },
  { key: 'buddies', label: 'Buddies', icon: 'people-outline' as const },
];

export default function CommunityScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('feed');
  const [unreadMessages, setUnreadMessages] = useState(0);

  const fetchUnreads = useCallback(async () => {
    try {
      const res = await api.get('/messages/threads');
      const total = (res.data?.threads || []).reduce((sum: number, t: any) => sum + (t.unread || 0), 0);
      setUnreadMessages(total);
    } catch {
      setUnreadMessages(0);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (user) fetchUnreads();
  }, [user, fetchUnreads]));

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <View style={styles.authIcon}><Icon name="people" size={32} color={Colors.cyan500} /></View>
          <Text style={styles.authTitle}>Connect</Text>
          <Text style={styles.authSubtitle}>Your dive community — feed, buddies, messages, and notifications.</Text>
          <TouchableOpacity style={styles.authBtn} onPress={() => router.push('/welcome')} testID="connect-signin">
            <Text style={styles.authBtnText}>Dive in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="community-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Connect</Text>
          <Text style={styles.subtitle}>Your dive community</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')} testID="open-notifications-btn">
            <Icon name="notifications-outline" size={20} color={Colors.slate700} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/messages')} testID="open-messages-btn">
            <Icon name="chatbubbles-outline" size={20} color={Colors.slate700} />
            {unreadMessages > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadMessages > 9 ? '9+' : String(unreadMessages)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabRow} testID="connect-tabs">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(t.key)} testID={`connect-tab-${t.key}`}>
              <Icon name={t.icon} size={15} color={active ? Colors.white : Colors.slate400} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'feed' ? <FeedTab /> : <BuddiesTab />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  subtitle: { fontSize: 13, color: Colors.slate500, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  tabBtnActive: { backgroundColor: Colors.cyan400, borderColor: Colors.cyan400 },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.slate400 },
  tabTextActive: { color: Colors.white },
  authPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  authIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  authTitle: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginBottom: 20 },
  authBtn: { backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  authBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
