/**
 * NotificationsSkeleton — loading state for /notifications.
 * Each row: avatar circle + 2-line text + timestamp.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function NotificationsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.host} testID="notifications-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={styles.body}>
            <Skeleton width="78%" height={13} />
            <View style={{ height: 6 }} />
            <Skeleton width="46%" height={11} />
          </View>
          <Skeleton width={36} height={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  body: { flex: 1 },
});

export default NotificationsSkeleton;
