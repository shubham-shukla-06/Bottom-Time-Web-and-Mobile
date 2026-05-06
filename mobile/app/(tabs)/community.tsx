import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

const TABS = [
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline' as const },
  { key: 'buddies', label: 'Buddies', icon: 'people-outline' as const },
];

export default function CommunityScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('feed');
  const [posts, setPosts] = useState<any[]>([]);
  const [buddies, setBuddies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (tab === 'feed') {
        const res = await api.get('/social/feed');
        setPosts(res.data.posts || res.data || []);
      } else {
        const res = await api.get('/buddy-finder');
        setBuddies(res.data.buddies || res.data || []);
      }
    } catch (e) {
      console.log('Community fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <View style={styles.authIcon}>
            <Ionicons name="people" size={32} color={Colors.cyan400} />
          </View>
          <Text style={styles.authTitle}>Connect</Text>
          <Text style={styles.authSubtitle}>Your dive community — feed, buddies, and more.</Text>
          <TouchableOpacity
            style={styles.authBtn}
            onPress={() => router.push('/auth')}
            testID="connect-signin"
          >
            <Text style={styles.authBtnText}>Dive in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="community-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Connect</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow} testID="connect-tabs">
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
            testID={`connect-tab-${t.key}`}
          >
            <Ionicons name={t.icon} size={16} color={tab === t.key ? Colors.white : Colors.slate400} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.cyan400} />
        </View>
      ) : tab === 'feed' ? (
        <FlatList
          data={posts}
          keyExtractor={(item, i) => item.id || String(i)}
          renderItem={({ item }) => (
            <View style={styles.postCard} testID={`post-${item.id}`}>
              <View style={styles.postHeader}>
                <View style={styles.postAvatar}>
                  <Text style={styles.postAvatarText}>{(item.author_name || 'U')[0]}</Text>
                </View>
                <View>
                  <Text style={styles.postAuthor}>{item.author_name || 'Diver'}</Text>
                  <Text style={styles.postTime}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</Text>
                </View>
              </View>
              <Text style={styles.postContent}>{item.content || item.text || ''}</Text>
              {item.likes != null && (
                <View style={styles.postFooter}>
                  <Ionicons name="heart-outline" size={16} color={Colors.slate400} />
                  <Text style={styles.postLikes}>{item.likes}</Text>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to share something!</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={buddies}
          keyExtractor={(item, i) => item.id || String(i)}
          renderItem={({ item }) => (
            <View style={styles.buddyCard} testID={`buddy-${item.id}`}>
              <View style={styles.buddyAvatar}>
                <Text style={styles.buddyAvatarText}>{(item.name || 'U')[0]}</Text>
              </View>
              <View style={styles.buddyInfo}>
                <Text style={styles.buddyName}>{item.name || 'Diver'}</Text>
                <Text style={styles.buddyMeta}>
                  {item.location_country || ''}{item.total_dives ? ` • ${item.total_dives} dives` : ''}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No buddies found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.slate900 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white },
  tabBtnActive: { backgroundColor: Colors.cyan400 },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.slate400 },
  tabTextActive: { color: Colors.white },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  postCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center' },
  postAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.cyan500 },
  postAuthor: { fontSize: 14, fontWeight: '600', color: Colors.slate900 },
  postTime: { fontSize: 11, color: Colors.slate400 },
  postContent: { fontSize: 14, color: Colors.slate700, lineHeight: 20 },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  postLikes: { fontSize: 12, color: Colors.slate500 },
  buddyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight },
  buddyAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  buddyAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.cyan400 },
  buddyInfo: { flex: 1 },
  buddyName: { fontSize: 15, fontWeight: '600', color: Colors.slate900 },
  buddyMeta: { fontSize: 12, color: Colors.slate500, marginTop: 2 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.slate700 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 4 },
  authPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  authIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  authTitle: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginBottom: 20 },
  authBtn: { backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  authBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
