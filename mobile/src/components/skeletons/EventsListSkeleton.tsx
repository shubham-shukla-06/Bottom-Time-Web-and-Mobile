/**
 * EventsListSkeleton — loading state for /events.
 * Each row: hero image + title + date pill + location row.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function EventsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.host} testID="events-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width="100%" height={160} borderRadius={14} />
          <View style={{ height: 12 }} />
          <View style={styles.row}>
            <Skeleton width={70} height={20} borderRadius={999} />
            <Skeleton width={90} height={12} />
          </View>
          <View style={{ height: 10 }} />
          <Skeleton width="78%" height={18} />
          <View style={{ height: 8 }} />
          <Skeleton width="50%" height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.borderLight },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

export default EventsListSkeleton;
