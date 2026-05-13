import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/trips/${id}`);
      setTrip(res.data);
    } catch {/* silent */}
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const vote = async (listingId: string) => {
    try {
      await api.post(`/trips/${id}/listings/${listingId}/vote`);
      load();
    } catch {/* silent */}
  };

  const removeTrip = async () => {
    const ok = await confirmDialog({
      title: 'Delete trip?',
      message: 'This will remove the trip for everyone. This cannot be undone.',
      confirmText: 'Delete', cancelText: 'Keep', destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/trips/${id}`);
      router.replace('/trips');
    } catch {/* silent */}
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View></SafeAreaView>;
  }
  if (!trip) {
    return <SafeAreaView style={styles.container}><View style={styles.center}><Text style={styles.errorText}>Trip not found</Text></View></SafeAreaView>;
  }

  const isOrganizer = trip.creator_id === user?.id;

  return (
    <SafeAreaView style={styles.container} testID="trip-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="trip-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
        {isOrganizer ? (
          <TouchableOpacity onPress={removeTrip} testID="trip-delete-btn">
            <Icon name="trash-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.cyan400} />}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.heroDest}>
              <Icon name="location" size={13} color={Colors.cyan500} /> {trip.destination || 'Destination TBD'}{trip.country ? `, ${trip.country}` : ''}
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{trip.status}</Text>
            </View>
          </View>
          {(trip.start_date || trip.end_date) && (
            <Text style={styles.heroDates}>
              <Icon name="calendar-outline" size={11} /> {trip.start_date ? new Date(trip.start_date).toLocaleDateString() : '?'} – {trip.end_date ? new Date(trip.end_date).toLocaleDateString() : '?'}
            </Text>
          )}
          {trip.description && <Text style={styles.heroDesc}>{trip.description}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members ({(trip.members || []).length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {(trip.members || []).map((m: any) => (
              <View key={m.user_id} style={styles.memberCard} testID={`trip-member-${m.user_id}`}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(m.name || 'U').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.memberRole}>{m.role}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Listings ({(trip.listings || []).length})</Text>
          {(trip.listings || []).length === 0 ? (
            <Text style={styles.emptyHint}>No listings added yet. From a listing's page, tap "Add to trip".</Text>
          ) : (
            (trip.listings || []).map((l: any) => {
              const voted = (l.votes || []).includes(user?.id);
              return (
                <View key={l.listing_id} style={styles.listingRow} testID={`trip-listing-${l.listing_id}`}>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.listing_id } })}>
                    {l.image_url ? <Image source={{ uri: l.image_url }} style={styles.listingImg} /> : (
                      <View style={[styles.listingImg, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}>
                        <Icon name="image-outline" size={18} color={Colors.slate300} />
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listingName} numberOfLines={1}>{l.name}</Text>
                    <Text style={styles.listingMeta} numberOfLines={1}><Icon name="location-outline" size={11} /> {l.location}</Text>
                    <Text style={styles.listingPrice}>{l.currency} {l.price}</Text>
                  </View>
                  <TouchableOpacity onPress={() => vote(l.listing_id)} style={[styles.voteBtn, voted && styles.voteBtnActive]} testID={`trip-vote-${l.listing_id}`}>
                    <Icon name={voted ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={voted ? Colors.white : Colors.slate600} />
                    <Text style={[styles.voteText, voted && { color: Colors.white }]}>{(l.votes || []).length}</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: Colors.slate500 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 10 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  heroCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.borderLight },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroDest: { fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  heroDates: { fontSize: 12, color: Colors.slate500 },
  heroDesc: { fontSize: 13, color: Colors.slate600, marginTop: 4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: Colors.cyan100 },
  statusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: Colors.cyan500 },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.borderLight },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  memberCard: { width: 80, alignItems: 'center', gap: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.cyan500, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: 18 },
  memberName: { fontSize: 11, fontWeight: '700', color: Colors.slate900 },
  memberRole: { fontSize: 9, color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyHint: { fontSize: 12, color: Colors.slate500, textAlign: 'center', padding: 12 },
  listingRow: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, backgroundColor: Colors.slate50, alignItems: 'center' },
  listingImg: { width: 56, height: 56, borderRadius: 8 },
  listingName: { fontSize: 13, fontWeight: '700', color: Colors.slate900 },
  listingMeta: { fontSize: 11, color: Colors.slate500 },
  listingPrice: { fontSize: 12, fontWeight: '700', color: Colors.cyan500, marginTop: 2 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  voteBtnActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  voteText: { fontSize: 11, fontWeight: '700', color: Colors.slate700 },
});
