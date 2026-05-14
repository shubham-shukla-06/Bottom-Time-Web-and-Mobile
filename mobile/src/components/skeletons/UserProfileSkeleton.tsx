/**
 * UserProfileSkeleton — loading state for /user/[id] (public user profile).
 * Avatar + name + bio + stats row + recent-dives strip.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../Skeleton';
import { Colors } from '../../constants/colors';

export function UserProfileSkeleton() {
  return (
    <View style={styles.host} testID="user-profile-skeleton">
      <View style={styles.headerRow}>
        <Skeleton width={88} height={88} borderRadius={44} />
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Skeleton width="70%" height={20} />
          <View style={{ height: 8 }} />
          <Skeleton width="50%" height={13} />
          <View style={{ height: 12 }} />
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Skeleton width={28} height={18} />
              <View style={{ height: 4 }} />
              <Skeleton width={36} height={10} />
            </View>
            <View style={styles.statCell}>
              <Skeleton width={28} height={18} />
              <View style={{ height: 4 }} />
              <Skeleton width={50} height={10} />
            </View>
            <View style={styles.statCell}>
              <Skeleton width={28} height={18} />
              <View style={{ height: 4 }} />
              <Skeleton width={40} height={10} />
            </View>
          </View>
        </View>
      </View>
      <View style={{ height: 16 }} />
      <Skeleton width="100%" height={12} />
      <View style={{ height: 6 }} />
      <Skeleton width="88%" height={12} />
      <View style={{ height: 6 }} />
      <Skeleton width="55%" height={12} />
      <View style={{ height: 24 }} />
      <Skeleton width="38%" height={16} />
      <View style={{ height: 12 }} />
      <View style={styles.diveRow}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={110} height={130} borderRadius={12} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 16 },
  statCell: { alignItems: 'flex-start' },
  diveRow: { flexDirection: 'row', gap: 12 },
});

export default UserProfileSkeleton;
