import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';
import useTabBarOnScroll from '../../src/hooks/useTabBarOnScroll';
import { TAB_BAR_HEIGHT } from '../../src/constants/tabBar';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [profile, setProfile] = useState<any>(null);
  const onProfileScroll = useTabBarOnScroll();
  const insets = useSafeAreaInsets();
  // Bottom padding clears the floating-pill tab bar (TAB_BAR_HEIGHT + home-
  // indicator safe-area + 24 px breathing room) so the Log out button is
  // fully tappable instead of being hidden behind the glass pill.
  const scrollBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 24;

  useEffect(() => {
    if (user) setProfile(user);
  }, [user]);

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Logout',
      message: 'Are you sure you want to log out?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    await logout();
    router.replace('/');
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <View style={styles.authIcon}>
            <Icon name="person" size={32} color={Colors.cyan400} />
          </View>
          <Text style={styles.authTitle}>Profile</Text>
          <Text style={styles.authSubtitle}>Sign in to manage your profile and settings.</Text>
          <TouchableOpacity
            style={styles.authBtn}
            onPress={() => router.push('/welcome')}
            testID="profile-signin-btn"
          >
            <Text style={styles.authBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="profile-screen">
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        onScroll={onProfileScroll}
        scrollEventThrottle={16}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.name || 'U')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.userName}>{user.name || 'Diver'}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          {user.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user.role}</Text>
            </View>
          )}
        </View>

        {/* Profile Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Info</Text>
          <ProfileRow icon="location-outline" label="Location" value={user.location_country || 'Not set'} />
          <ProfileRow icon="ribbon-outline" label="Certification" value={user.certification_agency?.toUpperCase() || 'Not set'} />
          <ProfileRow icon="water-outline" label="Total Dives" value={user.total_dives != null ? String(user.total_dives) : 'Not set'} />
          <ProfileRow icon="globe-outline" label="Experience" value={user.experience_level || 'Not set'} />
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/my-bookings')}
            testID="my-bookings-btn"
          >
            <Icon name="calendar-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>My Bookings</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/trips')}
            testID="my-trips-btn"
          >
            <Icon name="airplane-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Trips</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/destinations')}
            testID="destinations-btn"
          >
            <Icon name="globe-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Destinations</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/marine-life')}
            testID="marine-life-btn"
          >
            <Icon name="fish-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Marine Life</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/events')}
            testID="events-btn"
          >
            <Icon name="sparkles-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Events</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/pathways')}
            testID="pathways-btn"
          >
            <Icon name="school-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Beginner Pathways</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          {(user.role === 'operator' || user.role === 'instructor') && (
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/operator')}
              testID="operator-dashboard-btn"
            >
              <Icon name="briefcase-outline" size={20} color={Colors.cyan500} />
              <Text style={[styles.settingText, { color: Colors.cyan500, fontWeight: '700' }]}>Operator Dashboard</Text>
              <Icon name="chevron-forward" size={18} color={Colors.cyan500} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/orders')}
            testID="my-orders-btn"
          >
            <Icon name="receipt-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>My Orders</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/wishlist')}
            testID="my-wishlist-btn"
          >
            <Icon name="heart-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Wishlist</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/bucket-list')}
            testID="my-bucket-list-btn"
          >
            <Icon name="map-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Bucket List</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/notifications')}
            testID="notifications-btn"
          >
            <Icon name="notifications-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Notifications</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/profile/security')}
            testID="profile-security-btn"
          >
            <Icon name="shield-checkmark-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Security</Text>
            <Icon name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
          <Icon name="log-out-outline" size={20} color={Colors.accent} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <View style={styles.profileRowLeft}>
        <Icon name={icon} size={18} color={Colors.slate500} />
        <Text style={styles.profileRowLabel}>{label}</Text>
      </View>
      <Text style={styles.profileRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  scrollContent: {},
  profileHeader: { alignItems: 'center', paddingVertical: 24, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '700', color: Colors.cyan500 },
  userName: { fontSize: 20, fontWeight: '700', color: Colors.slate900 },
  userEmail: { fontSize: 13, color: Colors.slate500, marginTop: 4 },
  roleBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.cyan50 },
  roleText: { fontSize: 12, fontWeight: '600', color: Colors.cyan500, textTransform: 'capitalize' },
  section: { marginTop: 16, backgroundColor: Colors.white, borderRadius: 16, marginHorizontal: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate900, marginBottom: 12 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  profileRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileRowLabel: { fontSize: 14, color: Colors.slate600 },
  profileRowValue: { fontSize: 14, fontWeight: '500', color: Colors.slate900 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  settingText: { flex: 1, fontSize: 14, color: Colors.slate700 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  logoutText: { fontSize: 14, fontWeight: '600', color: Colors.accent },
  authPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  authIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  authTitle: { fontSize: 22, fontWeight: '700', color: Colors.slate900, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: Colors.slate500, textAlign: 'center', marginBottom: 20 },
  authBtn: { backgroundColor: Colors.cyan400, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  authBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
});
