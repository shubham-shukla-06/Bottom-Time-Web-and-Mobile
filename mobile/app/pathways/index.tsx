import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import { Colors } from '../../src/constants/colors';

const PATHWAYS = [
  {
    id: 'open-water', title: 'Open Water Diver', level: 'Beginner', duration: '3-4 days', depth: '18m / 60ft',
    summary: 'Your first certification — required to dive without an instructor. Covers fundamentals: equipment, buoyancy, safety, and four open water dives.',
    cta: 'Find an Open Water course', filter: 'open-water-course',
    icon: 'water', tone: Colors.cyan500,
  },
  {
    id: 'advanced', title: 'Advanced Open Water', level: 'Intermediate', duration: '2-3 days', depth: '30m / 100ft',
    summary: '5 specialty dives: typically deep, navigation, plus three electives such as wreck, drift, photo, or night.',
    cta: 'Find an Advanced course', filter: 'advanced-course',
    icon: 'compass', tone: '#0ea5e9',
  },
  {
    id: 'rescue', title: 'Rescue Diver', level: 'Skilled', duration: '3-4 days', depth: '30m / 100ft',
    summary: 'The most rewarding course. Learn to anticipate, prevent, and manage problems for yourself and others underwater.',
    cta: 'Find a Rescue course', filter: 'rescue-course',
    icon: 'medkit', tone: Colors.accent,
  },
  {
    id: 'divemaster', title: 'Divemaster', level: 'Pro', duration: '4-6 weeks', depth: '40m / 130ft',
    summary: 'Your first professional rating. Internships at dive centers worldwide. Lead certified divers and assist instructors.',
    cta: 'Find a Divemaster course', filter: 'divemaster-course',
    icon: 'star', tone: '#7c3aed',
  },
  {
    id: 'specialties', title: 'Specialties', level: 'All levels', duration: '1-3 days each', depth: 'varies',
    summary: 'Nitrox, deep, wreck, drift, sidemount, photography, marine identification, and more.',
    cta: 'Browse specialties', filter: 'specialty-course',
    icon: 'sparkles', tone: '#0d9488',
  },
];

export default function PathwaysScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} testID="pathways-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="pathways-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Beginner Pathways</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>NEW TO DIVING?</Text>
          <Text style={styles.heroTitle}>Your scuba journey, mapped out.</Text>
          <Text style={styles.heroSub}>From your first breaths underwater to leading dives professionally — every certification, what to expect, and where to do it.</Text>
        </View>

        {PATHWAYS.map((p) => (
          <View key={p.id} style={styles.card} testID={`pathway-${p.id}`}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: p.tone }]}>
                <Icon name={p.icon as any} size={20} color={Colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{p.title}</Text>
                <Text style={styles.cardLevel}>{p.level}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}><Icon name="time-outline" size={11} color={Colors.slate500} /><Text style={styles.metaText}>{p.duration}</Text></View>
              <View style={styles.metaItem}><Icon name="trending-down-outline" size={11} color={Colors.slate500} /><Text style={styles.metaText}>{p.depth}</Text></View>
            </View>
            <Text style={styles.summary}>{p.summary}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.cta} testID={`pathway-cta-${p.id}`}>
              <Icon name="search-outline" size={14} color={Colors.cyan500} />
              <Text style={styles.ctaText}>{p.cta}</Text>
              <Icon name="arrow-forward" size={13} color={Colors.cyan500} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.footerCard}>
          <Icon name="bulb-outline" size={22} color={Colors.cyan500} />
          <Text style={styles.footerTitle}>Need help choosing?</Text>
          <Text style={styles.footerSub}>Reach out via the Connect tab — buddies and instructors are happy to advise.</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/community')} style={styles.connectBtn} testID="pathways-connect-btn">
            <Text style={styles.connectText}>Open Connect</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  heroCard: { backgroundColor: Colors.slate900, borderRadius: 18, padding: 20, gap: 8 },
  heroLabel: { color: Colors.cyan400, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  heroTitle: { color: Colors.white, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, lineHeight: 28 },
  heroSub: { color: '#cbd5e1', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.borderLight },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  cardLevel: { fontSize: 11, color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: Colors.slate600, fontWeight: '600' },
  summary: { fontSize: 13, color: Colors.slate700, lineHeight: 19 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.cyan100 },
  ctaText: { fontSize: 12, fontWeight: '700', color: Colors.cyan500 },
  footerCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 18, gap: 6, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  footerTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate900, marginTop: 4 },
  footerSub: { fontSize: 12, color: Colors.slate500, textAlign: 'center' },
  connectBtn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.cyan500 },
  connectText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
