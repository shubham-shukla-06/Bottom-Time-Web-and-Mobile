import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (user) setProfile(user);
  }, [user]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <View style={styles.authIcon}>
            <Ionicons name="person" size={32} color={Colors.cyan400} />
          </View>
          <Text style={styles.authTitle}>Profile</Text>
          <Text style={styles.authSubtitle}>Sign in to manage your profile and settings.</Text>
          <TouchableOpacity
            style={styles.authBtn}
            onPress={() => router.push('/auth')}
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            <Ionicons name="calendar-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>My Bookings</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} testID="edit-profile-btn">
            <Ionicons name="create-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} testID="notifications-btn">
            <Ionicons name="notifications-outline" size={20} color={Colors.slate600} />
            <Text style={styles.settingText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.slate400} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={20} color={Colors.accent} />
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
        <Ionicons name={icon} size={18} color={Colors.slate500} />
        <Text style={styles.profileRowLabel}>{label}</Text>
      </View>
      <Text style={styles.profileRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  scrollContent: { paddingBottom: 40 },
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
