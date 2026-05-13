import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { Text } from '../../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../../src/components/Icon';
import api from '../../../src/api/client';
import { Colors } from '../../../src/constants/colors';
import useAuthStore from '../../../src/stores/authStore';

export default function SpeciesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [species, setSpecies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSighting, setShowSighting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/marine-life/species/${id}`);
      setSpecies(res.data);
    } catch {/* silent */} finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator size="large" color={Colors.cyan400} /></View></SafeAreaView>;
  if (!species) return <SafeAreaView style={styles.container}><View style={styles.center}><Text>Species not found</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} testID="species-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="species-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{species.name}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.cyan400} />}>
        {species.photo_url ? <Image source={{ uri: species.photo_url }} style={styles.hero} /> : (
          <View style={[styles.hero, { backgroundColor: Colors.slate100, alignItems: 'center', justifyContent: 'center' }]}><Icon name="fish" size={50} color={Colors.slate300} /></View>
        )}
        <View style={styles.body}>
          <Text style={styles.title}>{species.name}</Text>
          <Text style={styles.sci}>{species.scientific_name}</Text>
          <View style={styles.chips}>
            {species.iconic_taxon ? <View style={styles.chip}><Text style={styles.chipText}>{species.iconic_taxon}</Text></View> : null}
            {species.rank ? <View style={styles.chip}><Text style={styles.chipText}>{species.rank}</Text></View> : null}
            {species.observations_count != null ? <View style={styles.chip}><Icon name="eye-outline" size={10} /><Text style={styles.chipText}> {species.observations_count} observations</Text></View> : null}
          </View>
          {species.conservation_status && (
            <View style={styles.consBox}>
              <Icon name="alert-circle-outline" size={16} color="#b45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.consTitle}>Conservation: {species.conservation_status}</Text>
                {species.conservation_authority && <Text style={styles.consBy}>per {species.conservation_authority}</Text>}
              </View>
            </View>
          )}
          {species.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bodyText}>{String(species.description).replace(/<[^>]+>/g, '').slice(0, 500)}</Text>
              {species.wikipedia_url ? (
                <Text style={styles.linkText} testID="species-wiki-link">{species.wikipedia_url}</Text>
              ) : null}
            </View>
          )}
          {species.taxonomy && species.taxonomy.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Taxonomy</Text>
              {species.taxonomy.map((t: any, i: number) => (
                <View key={i} style={styles.taxRow}>
                  <Text style={styles.taxRank}>{t.rank}</Text>
                  <Text style={styles.taxName}>{t.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.cta}>
        <TouchableOpacity style={styles.logBtn} onPress={() => {
          if (!user) { router.push('/welcome'); return; }
          setShowSighting(true);
        }} testID="log-sighting-btn">
          <Icon name="add-circle" size={18} color={Colors.white} />
          <Text style={styles.logText}>Log a sighting</Text>
        </TouchableOpacity>
      </View>

      <SightingModal visible={showSighting} onClose={() => setShowSighting(false)} species={species} />
    </SafeAreaView>
  );
}

function SightingModal({ visible, onClose, species }: { visible: boolean; onClose: () => void; species: any }) {
  const [dives, setDives] = useState<any[]>([]);
  const [diveId, setDiveId] = useState<string>('');
  const [count, setCount] = useState('1');
  const [behaviour, setBehaviour] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDone(false); setErr(null);
    api.get('/dive-logs').then((r) => {
      const list = r.data?.dive_logs || r.data?.dives || r.data || [];
      setDives(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length && !diveId) setDiveId(list[0].id);
    }).catch(() => {});
  }, [visible]);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await api.post('/marine-life/sightings', {
        taxon_id: species.taxon_id,
        species_name: species.name,
        scientific_name: species.scientific_name,
        dive_log_id: diveId || null,
        count: Number(count) || 1,
        behaviour,
      });
      setDone(true);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to log sighting');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet} testID="sighting-modal">
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log {species.name} sighting</Text>
            <TouchableOpacity onPress={onClose} testID="sighting-close-btn"><Icon name="close" size={22} color={Colors.slate700} /></TouchableOpacity>
          </View>
          {done ? (
            <View style={styles.successBox}>
              <Icon name="checkmark-circle" size={36} color={Colors.success} />
              <Text style={styles.successText}>Sighting submitted! Pending verification.</Text>
              <TouchableOpacity onPress={onClose} style={styles.submitBtn} testID="sighting-done-btn"><Text style={styles.submitText}>Done</Text></TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <Text style={styles.fieldLabel}>Dive (optional)</Text>
              <View style={{ gap: 6 }}>
                {dives.length === 0 ? <Text style={styles.hintText}>No dives yet — sighting will still be saved.</Text> : null}
                {dives.slice(0, 6).map((d: any) => (
                  <TouchableOpacity key={d.id} onPress={() => setDiveId(d.id)} style={[styles.diveOption, diveId === d.id && styles.diveOptionActive]} testID={`pick-dive-${d.id}`}>
                    <Icon name={diveId === d.id ? 'radio-button-on' : 'radio-button-off'} size={14} color={diveId === d.id ? Colors.cyan500 : Colors.slate400} />
                    <Text style={[styles.diveOptionText, diveId === d.id && { color: Colors.cyan500, fontWeight: '700' }]} numberOfLines={1}>
                      Dive #{d.dive_number || '–'} · {d.site_name || d.location || 'Site'} · {d.date ? new Date(d.date).toLocaleDateString() : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Count</Text>
              <TextInput value={count} onChangeText={setCount} keyboardType="numeric" style={styles.input} testID="sighting-count" />
              <Text style={styles.fieldLabel}>Behaviour / notes</Text>
              <TextInput value={behaviour} onChangeText={setBehaviour} multiline placeholder="e.g. swimming alone in coral garden" style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} testID="sighting-behaviour" />
              {err && <Text style={styles.errorText}>{err}</Text>}
              <TouchableOpacity onPress={submit} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.5 }]} testID="sighting-submit-btn">
                {busy ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.submitText}>Submit sighting</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 10 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  hero: { width: '100%', height: 250 },
  body: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.slate900 },
  sci: { fontSize: 14, fontStyle: 'italic', color: Colors.slate500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: Colors.slate100 },
  chipText: { fontSize: 11, color: Colors.slate700, fontWeight: '600' },
  consBox: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#fef3c7', alignItems: 'center', marginTop: 4 },
  consTitle: { fontSize: 12, fontWeight: '700', color: '#b45309' },
  consBy: { fontSize: 10, color: '#b45309' },
  section: { marginTop: 8, gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  bodyText: { fontSize: 13, color: Colors.slate700, lineHeight: 19 },
  linkText: { fontSize: 12, color: Colors.cyan500 },
  taxRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  taxRank: { fontSize: 11, fontWeight: '700', color: Colors.slate500, width: 80, textTransform: 'uppercase' },
  taxName: { fontSize: 12, color: Colors.slate900 },
  cta: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  logBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.cyan500 },
  logText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.slate500 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.slate900 },
  diveOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: 'transparent' },
  diveOptionActive: { borderColor: Colors.cyan500, backgroundColor: Colors.cyan100 },
  diveOptionText: { fontSize: 12, color: Colors.slate700, flex: 1 },
  hintText: { fontSize: 12, color: Colors.slate500 },
  errorText: { fontSize: 12, color: Colors.accent },
  submitBtn: { paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.cyan500, alignItems: 'center', marginTop: 8 },
  submitText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  successBox: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  successText: { fontSize: 14, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
});
