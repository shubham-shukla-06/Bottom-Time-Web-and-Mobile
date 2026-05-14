/**
 * BuddiesListSkeleton — loading state for the Community → Buddies tab.
 *
 * Matches `src/components/connect/BuddiesTab.tsx` diver-card layout:
 * avatar (42 px) + name/location/chips stack + connect button on the right.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function BuddiesListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.host} testID="buddies-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={42} height={42} borderRadius={21} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="42%" height={11} />
            <View style={styles.chipsRow}>
              <Skeleton width={56} height={18} borderRadius={999} />
              <Skeleton width={64} height={18} borderRadius={999} />
            </View>
          </View>
          <Skeleton width={84} height={28} borderRadius={999} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 140, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 14, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  chipsRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
});

export default BuddiesListSkeleton;
