import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';

export default function EventsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/events');
      setEvents(res.data?.events || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const rsvp = async (id: string) => {
    if (!user) { router.push('/welcome'); return; }
    setBusy(id);
    try {
      await api.post(`/events/${id}/rsvp`);
      await load();
    } catch {/* silent */} finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={styles.container} testID="events-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="events-back-btn">
          <Ionicons name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Events</Text>
        <View style={{ width: 22 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="events-empty">
              <Ionicons name="calendar-outline" size={42} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No upcoming events</Text>
              <Text style={styles.emptySub}>Check back soon for community meetups.</Text>
            </View>
          }
          renderItem={({ item: e }) => {
            const attending = (e.attendees || []).includes(user?.id);
            return (
              <View style={styles.card} testID={`event-${e.id}`}>
                {e.image_url ? <Image source={{ uri: e.image_url }} style={styles.cover} /> : null}
                <View style={{ padding: 14, gap: 6 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>{e.title}</Text>
                    {e.event_type && <View style={styles.typePill}><Text style={styles.typeText}>{e.event_type}</Text></View>}
                  </View>
                  {e.date && <Text style={styles.meta}><Ionicons name="calendar-outline" size={11} /> {new Date(e.date).toLocaleString()}</Text>}
                  {e.location && <Text style={styles.meta}><Ionicons name="location-outline" size={11} /> {e.location}</Text>}
                  {e.description && <Text style={styles.desc} numberOfLines={3}>{e.description}</Text>}
                  <View style={styles.footer}>
                    <Text style={styles.attendeeText}>
                      <Ionicons name="people-outline" size={11} /> {(e.attendees || []).length} going
                    </Text>
                    <TouchableOpacity onPress={() => rsvp(e.id)} disabled={busy === e.id}
                      style={[styles.rsvpBtn, attending && styles.rsvpBtnActive]} testID={`event-rsvp-${e.id}`}>
                      {busy === e.id ? <ActivityIndicator size="small" color={attending ? Colors.cyan500 : Colors.white} /> :
                        <Text style={[styles.rsvpText, attending && { color: Colors.cyan500 }]}>{attending ? 'Going ✓' : 'RSVP'}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.slate700, marginTop: 8 },
  emptySub: { fontSize: 12, color: Colors.slate500, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderLight },
  cover: { width: '100%', height: 140, backgroundColor: Colors.slate100 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.slate900 },
  typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.cyan100 },
  typeText: { fontSize: 9, fontWeight: '700', color: Colors.cyan500, textTransform: 'uppercase' },
  meta: { fontSize: 12, color: Colors.slate500 },
  desc: { fontSize: 12, color: Colors.slate600, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  attendeeText: { fontSize: 11, color: Colors.slate500, fontWeight: '600' },
  rsvpBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.cyan500 },
  rsvpBtnActive: { backgroundColor: Colors.cyan100, borderWidth: 1, borderColor: Colors.cyan500 },
  rsvpText: { color: Colors.white, fontWeight: '700', fontSize: 12 },
});
