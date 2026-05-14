import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import useAuthStore from '../../src/stores/authStore';
import { Colors } from '../../src/constants/colors';
import { triggerHaptic } from '../../src/utils/haptics';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  planning: { bg: Colors.cyan100, fg: Colors.cyan500 },
  confirmed: { bg: '#dcfce7', fg: Colors.success },
  completed: { bg: Colors.slate100, fg: Colors.slate600 },
};

export default function TripsListScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/trips');
      setTrips(res.data?.trips || []);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Icon name="airplane" size={36} color={Colors.cyan500} />
          <Text style={styles.emptyTitle}>Sign in to plan trips</Text>
          <TouchableOpacity onPress={() => router.push('/welcome')} style={styles.cta} testID="trips-signin-btn">
            <Text style={styles.ctaText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="trips-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="trips-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trips</Text>
        <TouchableOpacity onPress={() => setShowNew(true)} testID="new-trip-btn">
          <Icon name="add-circle" size={26} color={Colors.cyan500} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.cyan400} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="trips-empty">
              <Icon name="map-outline" size={42} color={Colors.slate300} />
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={styles.emptySubtitle}>Plan a group dive trip with your buddies.</Text>
              <TouchableOpacity onPress={() => setShowNew(true)} style={styles.cta} testID="empty-new-trip-btn">
                <Icon name="add" size={16} color={Colors.white} />
                <Text style={styles.ctaText}>Create trip</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: t }) => {
            const colors = STATUS_COLORS[t.status] || STATUS_COLORS.planning;
            const cover = (t.listings || []).find((l: any) => l.image_url)?.image_url;
            return (
              <TouchableOpacity onPress={() => router.push({ pathname: '/trips/[id]', params: { id: t.id } })}
                style={styles.card} testID={`trip-${t.id}`}>
                {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : (
                  <View style={[styles.cover, { backgroundColor: Colors.cyan100, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name="map" size={26} color={Colors.cyan500} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>{t.name}</Text>
                    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
                      <Text style={[styles.pillText, { color: colors.fg }]}>{t.status}</Text>
                    </View>
                  </View>
                  {t.destination && <Text style={styles.dest}><Icon name="location-outline" size={11} /> {t.destination}{t.country ? `, ${t.country}` : ''}</Text>}
                  {(t.start_date || t.end_date) && (
                    <Text style={styles.dates}>
                      {t.start_date ? new Date(t.start_date).toLocaleDateString() : '?'} – {t.end_date ? new Date(t.end_date).toLocaleDateString() : '?'}
                    </Text>
                  )}
                  <View style={styles.metaRow}>
                    <View style={styles.metaChip}><Icon name="people" size={10} color={Colors.cyan500} /><Text style={styles.metaText}>{(t.members || []).length}</Text></View>
                    <View style={styles.metaChip}><Icon name="bookmark" size={10} color={Colors.success} /><Text style={styles.metaText}>{(t.listings || []).length}</Text></View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <NewTripModal visible={showNew} onClose={() => setShowNew(false)} onCreated={(id) => {
        setShowNew(false); router.push({ pathname: '/trips/[id]', params: { id } });
      }} />
    </SafeAreaView>
  );
}

function NewTripModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [country, setCountry] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Trip name is required'); return; }
    setBusy(true);
    try {
      const res = await api.post('/trips', {
        name: name.trim(), destination, country,
        start_date: start || null, end_date: end || null,
        description,
      });
      try { void triggerHaptic('success'); } catch {/* noop */}
      onCreated(res.data?.id);
      setName(''); setDestination(''); setCountry(''); setStart(''); setEnd(''); setDescription('');
    } catch (e: any) {
      try { void triggerHaptic('error'); } catch {/* noop */}
      setError(e?.response?.data?.detail || 'Failed to create trip');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet} testID="new-trip-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New trip</Text>
              <TouchableOpacity onPress={onClose} testID="close-new-trip">
                <Icon name="close" size={22} color={Colors.slate700} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <Field label="Trip name *" value={name} onChange={setName} testID="trip-name-input" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Destination" value={destination} onChange={setDestination} testID="trip-destination-input" containerStyle={{ flex: 1 }} />
                <Field label="Country" value={country} onChange={setCountry} testID="trip-country-input" containerStyle={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Start date (YYYY-MM-DD)" value={start} onChange={setStart} testID="trip-start-input" containerStyle={{ flex: 1 }} />
                <Field label="End date (YYYY-MM-DD)" value={end} onChange={setEnd} testID="trip-end-input" containerStyle={{ flex: 1 }} />
              </View>
              <Field label="Notes" value={description} onChange={setDescription} multiline testID="trip-desc-input" />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity onPress={submit} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.5 }]} testID="submit-new-trip">
                {busy ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.submitText}>Create trip</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange, containerStyle, multiline, testID }: any) {
  return (
    <View style={[{ gap: 4 }, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline}
        style={[styles.input, multiline && { minHeight: 60, textAlignVertical: 'top' }]} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate800, marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.cyan500 },
  ctaText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  card: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight },
  cover: { width: 80, height: 80, borderRadius: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.slate900 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dest: { fontSize: 11, color: Colors.slate500 },
  dates: { fontSize: 11, color: Colors.slate500 },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.slate50 },
  metaText: { fontSize: 10, fontWeight: '700', color: Colors.slate700 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.slate500 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.slate900 },
  errorText: { fontSize: 12, color: Colors.accent },
  submitBtn: { paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.cyan500, alignItems: 'center', marginTop: 8 },
  submitText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
