/**
 * TripsListSkeleton — loading state for /trips index.
 * Each row: trip name + date range + destination + listing-thumb strip.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function TripsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.host} testID="trips-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.row}>
            <Skeleton width="60%" height={18} />
            <Skeleton width={70} height={12} />
          </View>
          <View style={{ height: 8 }} />
          <Skeleton width="40%" height={12} />
          <View style={{ height: 14 }} />
          <View style={styles.thumbRow}>
            <Skeleton width={56} height={56} borderRadius={10} />
            <Skeleton width={56} height={56} borderRadius={10} />
            <Skeleton width={56} height={56} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thumbRow: { flexDirection: 'row', gap: 8 },
});

export default TripsListSkeleton;
