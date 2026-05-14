import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../HapticTouchable';
import { Text } from '../Text';
import { useRouter } from 'expo-router';
import Icon from '../Icon';
import api from '../../api/client';
import { FeedListSkeleton } from '../skeletons/FeedListSkeleton';
import { Colors } from '../../constants/colors';
import useTabBarOnScroll from '../../hooks/useTabBarOnScroll';
import { triggerHaptic } from '../../../src/utils/haptics';

const REACTIONS: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; color: string }[] = [
  { key: 'heart', icon: 'heart', label: 'Love', color: '#ef4444' },
  { key: 'stoke', icon: 'flash', label: 'Stoked', color: '#f59e0b' },
  { key: 'epic', icon: 'star', label: 'Epic', color: '#8b5cf6' },
  { key: 'fire', icon: 'flame', label: 'Fire', color: '#f97316' },
  { key: 'jealous', icon: 'globe', label: 'Take me', color: '#10b981' },
];

const TYPE_LABELS: Record<string, string> = {
  new_dive: 'logged a dive',
  sighting: 'spotted marine life',
  bucket_list_complete: 'checked off a bucket list site',
  group_booking: 'booked a group trip',
  badge_earned: 'earned a badge',
};
const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_dive: 'water',
  sighting: 'fish',
  bucket_list_complete: 'checkmark-circle',
  group_booking: 'people',
  badge_earned: 'trophy',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export default function FeedTab() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const onListScroll = useTabBarOnScroll();

  const fetchFeed = useCallback(async (skip = 0) => {
    try {
      const res = await api.get(`/feed?skip=${skip}&limit=20`);
      const newItems = res.data?.items || [];
      if (skip === 0) setItems(newItems);
      else setItems((prev) => [...prev, ...newItems]);
      setHasMore(res.data?.has_more || false);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchFeed(0); }, [fetchFeed]);

  const onRefresh = () => { try { void triggerHaptic('selection'); } catch {/* noop */} setRefreshing(true); fetchFeed(0); };
  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchFeed(items.length);
  };

  const react = async (itemId: string, reaction: string) => {
    setPickerForId(null);
    // optimistic
    setItems((prev) => prev.map((i) => {
      if (i.id !== itemId) return i;
      const wasSame = i.viewer_reaction === reaction;
      const hadAny = !!i.viewer_reaction;
      let count = i.reaction_count || 0;
      if (wasSame) count -= 1;
      else if (!hadAny) count += 1;
      return { ...i, viewer_reaction: wasSame ? null : reaction, reaction_count: Math.max(0, count) };
    }));
    try {
      const res = await api.post(`/feed/${itemId}/react`, { reaction });
      setItems((prev) => prev.map((i) => i.id === itemId ? {
        ...i,
        viewer_reaction: res.data?.reacted ? res.data.reaction : null,
      } : i));
    } catch {
      // revert by refetching
      fetchFeed(0);
    }
  };

  if (loading) {
    return <FeedListSkeleton />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => item.id || String(i)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan400} />}
      onScroll={onListScroll}
      scrollEventThrottle={16}
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      ListEmptyComponent={
        <View style={styles.emptyContainer} testID="feed-empty">
          <Icon name="water-outline" size={40} color={Colors.slate300} />
          <Text style={styles.emptyTitle}>No activity yet</Text>
          <Text style={styles.emptySubtitle}>Connect with divers to see their dives, sightings and trips here.</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? <View style={{ padding: 16, alignItems: 'center' }}><ActivityIndicator size="small" color={Colors.cyan400} /></View> : null
      }
      renderItem={({ item }) => (
        <FeedCard
          item={item}
          onReact={react}
          pickerOpen={pickerForId === item.id}
          onTogglePicker={() => setPickerForId((cur) => cur === item.id ? null : item.id)}
          onUserPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } })}
        />
      )}
    />
  );
}

function FeedCard({ item, onReact, pickerOpen, onTogglePicker, onUserPress }: {
  item: any;
  onReact: (id: string, reaction: string) => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onUserPress: () => void;
}) {
  // NOTE: was previously `const Icon = TYPE_ICONS[item.type] ...` which
  // shadowed the imported `Icon` component and crashed render with
  // "View config getter callback for component 'water' must be a function".
  // Renamed to avoid the shadow.
  const iconName = TYPE_ICONS[item.type] || 'water';
  const label = TYPE_LABELS[item.type] || 'shared an update';
  const data = item.data || {};
  const viewerReaction = REACTIONS.find((r) => r.key === item.viewer_reaction);

  return (
    <View style={styles.card} testID={`feed-card-${item.id}`}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={onUserPress} testID={`feed-author-${item.user_id}`}>
          {item.user_photo ? (
            <Image source={{ uri: item.user_photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{(item.user_name || 'U').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLine} numberOfLines={1}>
            <Text style={styles.authorName} onPress={onUserPress}>{item.user_name || 'Diver'} </Text>
            <Text style={styles.subtleText}>{label}</Text>
          </Text>
          <Text style={styles.timeText}>
            <Icon name="time-outline" size={9} /> {timeAgo(item.created_at)}
          </Text>
        </View>
        <Icon name={iconName} size={18} color={Colors.cyan500} />
      </View>

      {item.type === 'new_dive' && (
        <View style={styles.dataBox}>
          <View style={styles.dataRow}>
            <Icon name="anchor" size={14} color="#3b82f6" />
            <Text style={styles.siteName}>{data.site_name || 'Unknown site'}</Text>
            {data.dive_number ? (
              <View style={styles.divePill}><Text style={styles.divePillText}>#{data.dive_number}</Text></View>
            ) : null}
          </View>
          {data.location && (
            <Text style={styles.locText}><Icon name="location-outline" size={10} /> {data.location}</Text>
          )}
          <View style={styles.metricsRow}>
            {data.max_depth > 0 && <Text style={[styles.metric, { color: '#3b82f6' }]}>{data.max_depth}m</Text>}
            {data.duration > 0 && <Text style={[styles.metric, { color: '#8b5cf6' }]}>{data.duration}min</Text>}
          </View>
        </View>
      )}

      {item.type === 'sighting' && (
        <View style={[styles.dataBox, { backgroundColor: '#ecfdf5' }]}>
          <Text style={[styles.spottedText, { color: '#047857' }]}>
            <Icon name="fish" size={13} /> Spotted {data.count || 0} species
          </Text>
          <View style={styles.speciesRow}>
            {(data.species || []).map((s: string) => (
              <View key={s} style={styles.speciesChip}>
                <Text style={styles.speciesText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {item.type === 'bucket_list_complete' && (
        <View style={[styles.dataBox, { backgroundColor: '#fffbeb' }]}>
          <Text style={[styles.spottedText, { color: '#b45309' }]}>
            <Icon name="checkmark-circle" size={13} /> Checked off: {data.site_name}
          </Text>
          {data.location && <Text style={[styles.locText, { color: '#d97706' }]}>{data.location}</Text>}
        </View>
      )}

      {item.type === 'group_booking' && (
        <View style={[styles.dataBox, { backgroundColor: '#f5f3ff' }]}>
          <Text style={[styles.spottedText, { color: '#6d28d9' }]}>
            <Icon name="people" size={13} /> Group trip: {data.trip_name}
          </Text>
          <Text style={[styles.locText, { color: '#7c3aed' }]}>
            {data.listing_name} with {data.members} divers on {data.date}
          </Text>
        </View>
      )}

      {pickerOpen && (
        <View style={styles.reactionPicker} testID={`reaction-picker-${item.id}`}>
          {REACTIONS.map((r) => (
            <TouchableOpacity key={r.key} onPress={() => onReact(item.id, r.key)}
              style={[styles.reactionBtn, item.viewer_reaction === r.key && styles.reactionBtnActive]}
              testID={`reaction-${r.key}-${item.id}`}>
              <Icon name={r.icon} size={20} color={r.color} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, viewerReaction && styles.actionBtnActive]}
          onPress={onTogglePicker}
          testID={`react-btn-${item.id}`}>
          <Icon name={(viewerReaction?.icon as any) || 'heart-outline'} size={14}
            color={viewerReaction?.color || Colors.slate500} />
          <Text style={[styles.actionText, viewerReaction && { color: Colors.cyan500 }]}>
            {item.reaction_count || 0}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight, marginTop: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate700, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.borderLight, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  headerLine: { fontSize: 13 },
  authorName: { fontWeight: '700', color: Colors.slate900 },
  subtleText: { color: Colors.slate500 },
  timeText: { fontSize: 10, color: Colors.slate400, marginTop: 2 },
  dataBox: { backgroundColor: Colors.slate50, borderRadius: 12, padding: 10, gap: 6 },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  siteName: { fontSize: 13, fontWeight: '700', color: Colors.slate900, flex: 1 },
  divePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: Colors.cyan100 },
  divePillText: { fontSize: 10, fontWeight: '700', color: Colors.cyan500 },
  locText: { fontSize: 11, color: Colors.slate500 },
  metricsRow: { flexDirection: 'row', gap: 12 },
  metric: { fontSize: 12, fontWeight: '700' },
  spottedText: { fontSize: 13, fontWeight: '700' },
  speciesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  speciesChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.white },
  speciesText: { fontSize: 10, fontWeight: '600', color: '#047857' },
  reactionPicker: { flexDirection: 'row', gap: 4, padding: 6, borderRadius: 999, backgroundColor: Colors.slate50, alignSelf: 'flex-start' },
  reactionBtn: { padding: 6, borderRadius: 999 },
  reactionBtnActive: { backgroundColor: Colors.cyan100 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  actionBtnActive: { backgroundColor: Colors.cyan50 },
  actionText: { fontSize: 12, fontWeight: '600', color: Colors.slate500 },
});
