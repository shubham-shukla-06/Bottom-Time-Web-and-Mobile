/**
 * MessagesSkeleton — loading state for /messages (conversation list).
 * Each row: avatar + 2-line preview + timestamp + unread dot.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function MessagesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.host} testID="messages-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={styles.body}>
            <View style={styles.topRow}>
              <Skeleton width="40%" height={14} />
              <Skeleton width={40} height={10} />
            </View>
            <View style={{ height: 6 }} />
            <Skeleton width="85%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  body: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

export default MessagesSkeleton;
