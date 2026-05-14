/**
 * DestinationsGridSkeleton — loading state for /destinations.
 *
 * Mirrors the destinations grid (2 columns, ~180 px tall image cards with
 * a country label and a stat-chips row overlaid at the bottom). Skeleton
 * geometry matches `app/destinations/index.tsx` styles.card.
 */
import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

const W = (Dimensions.get('window').width - 16 * 2 - 12) / 2;

export function DestinationsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.host} testID="destinations-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.card, { width: W }]}>
          <Skeleton width={W} height={180} borderRadius={14} />
          <View style={styles.overlay}>
            <Skeleton width="60%" height={14} />
            <View style={{ height: 8 }} />
            <View style={styles.chipsRow}>
              <Skeleton width={48} height={18} borderRadius={999} />
              <Skeleton width={56} height={18} borderRadius={999} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  card: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden' },
  overlay: { padding: 10 },
  chipsRow: { flexDirection: 'row', gap: 6 },
});

export default DestinationsGridSkeleton;
