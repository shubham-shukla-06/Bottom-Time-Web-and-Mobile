/**
 * BookingsListSkeleton — loading state for /my-bookings.
 * Each row: status pill + listing thumbnail + title + date + total.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function BookingsListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.host} testID="bookings-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.headerRow}>
            <Skeleton width={84} height={20} borderRadius={999} />
            <Skeleton width={70} height={12} />
          </View>
          <View style={{ height: 12 }} />
          <View style={styles.body}>
            <Skeleton width={72} height={72} borderRadius={12} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width="80%" height={14} />
              <View style={{ height: 8 }} />
              <Skeleton width="55%" height={12} />
              <View style={{ height: 10 }} />
              <Skeleton width="40%" height={16} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  body: { flexDirection: 'row', alignItems: 'center' },
});

export default BookingsListSkeleton;
