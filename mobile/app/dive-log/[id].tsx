import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import { confirmDialog } from '../../src/utils/confirm';
import DiveLogForm, { logToForm } from '../../src/components/DiveLogForm';
import DepthProfileChart from '../../src/components/DepthProfileChart';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { DiveLogDetailSkeleton } from '../../src/components/skeletons/DiveLogDetailSkeleton';

function pretty(v: any, suffix = '') {
  if (v === null || v === undefined || v === '') return '—';
  return `${v}${suffix}`;
}

export default function DiveLogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/dive-log');
      const list: any[] = res.data?.logs || [];
      const found = list.find((l) => l.id === id);
      setLog(found || null);
      if (!found) setError('Dive log not found.');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load dive');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete dive log?',
      message: 'This will permanently remove this dive from your logbook.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete(`/dive-log/${id}`);
      router.back();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const submitEdit = async (payload: any) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/dive-log/${id}`, payload);
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Web-parity: dive share modal (downloadPNG + native share + copy text).
  // Mobile uses the `/dive-log/{id}/share-card` backend endpoint to fetch
  // the canonical `share_text` and dispatches it via the native
  // RN `Share` API (same dialog used by listing/[id].tsx).
  const onShare = useCallback(async () => {
    try {
      const res = await api.get(`/dive-log/${id}/share-card`);
      const text: string = res.data?.share_text || 'Logged a dive on Bottom Time';
      await Share.share({ message: text, title: 'My dive' });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to build share card');
    }
  }, [id]);

  // Web-parity: CSV/JSON export. Hits the backend export endpoint, writes
  // the result into the app's cache directory, then invokes the OS share
  // sheet to let the user save / send the file.
  const onExport = useCallback(async (format: 'csv' | 'json') => {
    try {
      const res = await api.get(`/dive-log/${id}/export/${format}`);
      const body = format === 'csv'
        ? (res.data?.csv || '')
        : JSON.stringify(res.data?.dive || res.data, null, 2);
      const safeName = (log?.site_name || 'dive').replace(/[^a-z0-9_-]+/gi, '_');
      const filename = `${safeName}_${log?.date || 'export'}.${format}`;
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, body);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: format === 'csv' ? 'text/csv' : 'application/json',
          dialogTitle: `Export dive as ${format.toUpperCase()}`,
          UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
        });
      } else {
        await Share.share({ message: body });
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || `Failed to export ${format.toUpperCase()}`);
    }
  }, [id, log?.site_name, log?.date]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <DiveLogDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (editing && log) {
    return (
      <SafeAreaView style={styles.container} testID="dive-log-edit-screen">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setEditing(false)} testID="edit-cancel-btn">
            <Icon name="close" size={22} color={Colors.slate900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit dive</Text>
          <View style={{ width: 22 }} />
        </View>
        <DiveLogForm
          initial={logToForm(log)}
          saving={saving}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={submitEdit}
          errorMessage={error}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="dive-log-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="dl-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dive log</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onShare} testID="share-log-btn" disabled={!log}>
            <Icon name="share-outline" size={22} color={log ? Colors.cyan500 : Colors.slate300} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditing(true)} testID="edit-log-btn" disabled={!log}>
            <Icon name="create-outline" size={22} color={log ? Colors.cyan500 : Colors.slate300} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {error && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={Colors.accent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {log && (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Icon name="water" size={26} color={Colors.cyan500} />
              </View>
              <Text style={styles.heroTitle}>{log.site_name || 'Unknown site'}</Text>
              <Text style={styles.heroLocation}>
                <Icon name="location-outline" size={12} /> {log.location || '—'}
              </Text>
              {log.dive_type ? (
                <View style={styles.typePill}>
                  <Text style={styles.typeText}>{log.dive_type}</Text>
                </View>
              ) : null}
              {log.rating ? (
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Icon key={s} name={s <= log.rating ? 'star' : 'star-outline'} size={16}
                      color={s <= log.rating ? '#f59e0b' : Colors.slate300} />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.statsRow}>
              <Stat icon="water-outline" label="Max depth" value={pretty(log.max_depth, 'm')} />
              <Stat icon="time-outline" label="Duration" value={pretty(log.duration, 'min')} />
              <Stat icon="thermometer-outline" label="Water" value={pretty(log.water_temp, '°C')} />
            </View>

            {log.profile && log.profile.length > 2 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Depth profile</Text>
                <DepthProfileChart profile={log.profile} testID="depth-profile-chart" />
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Where & when</Text>
              <Row label="Date" value={(log.date || '').slice(0, 10) || '—'} />
              <Row label="Buddy" value={pretty(log.buddy)} />
              <Row label="Visibility" value={pretty(log.visibility)} />
              <Row label="Air temp" value={pretty(log.air_temp, '°C')} />
            </View>

            {/* Interactive map — read-only. Only rendered when the log
                has gps_lat + gps_lng. Legacy logs without coordinates
                skip this section entirely (no awkward empty panel). */}
            {typeof log.gps_lat === 'number' && typeof log.gps_lng === 'number' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Map</Text>
                <View style={styles.mapWrap}>
                  <MapView
                    provider={PROVIDER_GOOGLE}
                    style={StyleSheet.absoluteFillObject}
                    initialRegion={{
                      latitude: log.gps_lat,
                      longitude: log.gps_lng,
                      latitudeDelta: 0.05,
                      longitudeDelta: 0.05,
                    }}
                    scrollEnabled
                    zoomEnabled
                  >
                    <Marker
                      coordinate={{ latitude: log.gps_lat, longitude: log.gps_lng }}
                      pinColor={Colors.cyan500}
                      title={log.site_name || undefined}
                      description={log.location || undefined}
                    />
                  </MapView>
                  <TouchableOpacity
                    onPress={() => {
                      // Cross-platform deep link. Google Maps URL works in
                      // every device's default map app (iOS opens Apple
                      // Maps if Google isn't installed; Android opens the
                      // Google Maps app directly).
                      const url = Platform.select({
                        ios: `https://www.google.com/maps/search/?api=1&query=${log.gps_lat},${log.gps_lng}`,
                        default: `https://www.google.com/maps/search/?api=1&query=${log.gps_lat},${log.gps_lng}`,
                      });
                      Linking.openURL(url!).catch(() => {});
                    }}
                    style={styles.mapOpenPill}
                    activeOpacity={0.85}
                    testID="dive-log-map-open-pill"
                  >
                    <Icon name="navigate-outline" size={13} color={Colors.cyan500} />
                    <Text style={styles.mapOpenPillText}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile</Text>
              <Row label="Avg depth" value={pretty(log.avg_depth, 'm')} />
              <Row label="Current" value={pretty(log.current)} />
              <Row label="Surface" value={pretty(log.surface_conditions)} />
              <Row label="Entry" value={pretty(log.entry_type)} />
              <Row label="Water" value={pretty(log.water_type)} />
            </View>

            {(log.gas_mix || log.tank_size || log.tank_start_pressure || log.tank_end_pressure || log.weight || log.suit_type) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gas & gear</Text>
                <Row label="Gas mix" value={pretty(log.gas_mix)} />
                <Row label="Tank size" value={pretty(log.tank_size, ' L')} />
                <Row label="Start pressure" value={pretty(log.tank_start_pressure, ' bar')} />
                <Row label="End pressure" value={pretty(log.tank_end_pressure, ' bar')} />
                <Row label="SAC" value={pretty(log.sac_rate, ' L/min')} />
                <Row label="Weight" value={pretty(log.weight, ' kg')} />
                <Row label="Suit" value={pretty(log.suit_type)} />
              </View>
            )}

            {log.notes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notes}>{log.notes}</Text>
              </View>
            ) : null}

            <View style={styles.exportRow}>
              <TouchableOpacity onPress={() => onExport('csv')} style={styles.exportBtn} testID="export-csv-btn">
                <Icon name="download-outline" size={16} color={Colors.cyan500} />
                <Text style={styles.exportText}>Export CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onExport('json')} style={styles.exportBtn} testID="export-json-btn">
                <Icon name="code-slash-outline" size={16} color={Colors.cyan500} />
                <Text style={styles.exportText}>Export JSON</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onDelete} disabled={deleting} style={[styles.deleteBtn, deleting && { opacity: 0.6 }]}
              testID="delete-log-btn">
              {deleting ? <ActivityIndicator size="small" color={Colors.accent} /> : (
                <>
                  <Icon name="trash-outline" size={18} color={Colors.accent} />
                  <Text style={styles.deleteText}>Delete dive log</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Icon name={icon} size={16} color={Colors.cyan500} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  exportRow: { flexDirection: 'row', gap: 12 },
  exportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.cyan500,
    backgroundColor: Colors.white,
  },
  exportText: { fontSize: 13, fontWeight: '600', color: Colors.cyan500 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  heroCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.borderLight },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.cyan50, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '700', color: Colors.slate900, textAlign: 'center' },
  heroLocation: { fontSize: 13, color: Colors.slate500 },
  typePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: Colors.cyan50, marginTop: 4 },
  typeText: { fontSize: 11, fontWeight: '700', color: Colors.cyan500, textTransform: 'uppercase', letterSpacing: 0.5 },
  starRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', gap: 4, padding: 14, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.slate900 },
  statLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, gap: 8 },
  // Read-only interactive map at the bottom of the detail. Fixed height
  // mirrors the other detail-card stat blocks for visual rhythm.
  mapWrap: { height: 240, borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: Colors.slate100 },
  mapOpenPill: {
    position: 'absolute', right: 12, bottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  mapOpenPillText: { fontSize: 12, fontWeight: '600', color: Colors.cyan500 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rowLabel: { fontSize: 13, color: Colors.slate500, fontWeight: '600' },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 13, color: Colors.slate900, fontWeight: '500' },
  notes: { fontSize: 14, color: Colors.slate700, lineHeight: 20 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.white },
  deleteText: { fontSize: 14, fontWeight: '700', color: Colors.accent },
});
