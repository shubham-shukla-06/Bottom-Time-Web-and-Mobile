/**
 * FeedListSkeleton — loading state for the Community → Feed tab.
 *
 * Mirrors `src/components/connect/FeedTab.tsx` post-card layout:
 * avatar + author/time stack on top, data-box (site/species/etc.), and
 * a reaction action row at the bottom. Same border-radius / palette as
 * the live FeedCard so the skeleton-to-content transition is seamless.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function FeedListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.host} testID="feed-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          {/* Header: avatar + name/time stack + type icon */}
          <View style={styles.cardHeader}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="72%" height={13} />
              <Skeleton width={56} height={10} />
            </View>
            <Skeleton width={18} height={18} borderRadius={9} />
          </View>

          {/* Data box: site title + metrics row */}
          <View style={styles.dataBox}>
            <Skeleton width="78%" height={14} />
            <View style={{ height: 8 }} />
            <Skeleton width="50%" height={11} />
            <View style={{ height: 10 }} />
            <View style={styles.metricsRow}>
              <Skeleton width={48} height={12} />
              <Skeleton width={58} height={12} />
            </View>
          </View>

          {/* Reaction action row */}
          <View style={styles.actions}>
            <Skeleton width={56} height={22} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140, gap: 12 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dataBox: { backgroundColor: Colors.slate50, borderRadius: 12, padding: 10 },
  metricsRow: { flexDirection: 'row', gap: 12 },
  actions: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
});

export default FeedListSkeleton;
