import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from '../../src/components/HapticTouchable';
import { Text } from '../../src/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';

const MOODS = [
  { key: 'stoked', label: 'Stoked', icon: 'flash' as const },
  { key: 'serene', label: 'Serene', icon: 'leaf' as const },
  { key: 'adventurous', label: 'Adventurous', icon: 'sparkles' as const },
  { key: 'grateful', label: 'Grateful', icon: 'gift' as const },
  { key: 'tired', label: 'Tired but happy', icon: 'moon' as const },
  { key: 'mind_blown', label: 'Mind blown', icon: 'flame' as const },
];

export default function NewSurfaceLogScreen() {
  const router = useRouter();
  const [dates, setDates] = useState<{ date: string; dive_count: number }[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [mood, setMood] = useState('');
  const [highlight, setHighlight] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDates = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/surface-log/dates/available');
      const list = res.data?.dates || [];
      setDates(list);
      if (list.length && !selectedDate) setSelectedDate(list[0].date);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load dates');
    } finally {
      setLoadingDates(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadDates(); }, [loadDates]);

  const submit = async () => {
    if (!selectedDate) {
      setError('Pick a dive day to recap.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/surface-log/generate', { date: selectedDate, mood, highlight, caption });
      router.back();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to generate surface log');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="new-surface-log-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="sl-new-back-btn">
          <Icon name="close" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New surface log</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Surface logs auto-build from the dives you logged on a given day. Pick a date with dives and add the human side.</Text>

        {error && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={Colors.accent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pick a dive day</Text>
          {loadingDates ? (
            <ActivityIndicator size="small" color={Colors.cyan400} />
          ) : dates.length === 0 ? (
            <Text style={styles.emptyDates}>No dive days available — log a dive first, then come back here.</Text>
          ) : (
            <View style={styles.dateRow}>
              {dates.map((d) => {
                const active = selectedDate === d.date;
                return (
                  <TouchableOpacity key={d.date} onPress={() => setSelectedDate(d.date)}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    testID={`sl-date-${d.date}`}>
                    <Text style={[styles.dateChipDate, active && styles.dateChipDateActive]}>
                      {d.date}
                    </Text>
                    <Text style={[styles.dateChipCount, active && { color: Colors.white }]}>
                      {d.dive_count} dive{d.dive_count > 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How did the day feel?</Text>
          <View style={styles.moodRow}>
            {MOODS.map((m) => {
              const active = mood === m.key;
              return (
                <TouchableOpacity key={m.key} onPress={() => setMood(active ? '' : m.key)}
                  style={[styles.moodChip, active && styles.moodChipActive]}
                  testID={`sl-mood-${m.key}`}>
                  <Icon name={m.icon} size={14} color={active ? Colors.white : Colors.cyan500} />
                  <Text style={[styles.moodChipText, active && styles.moodChipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Highlight</Text>
          <TextInput
            value={highlight}
            onChangeText={setHighlight}
            placeholder="e.g. Saw my first manta ray!"
            style={styles.input}
            testID="sl-highlight-input"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Caption</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Write about your dive day…"
            style={[styles.input, styles.textarea]}
            multiline
            numberOfLines={4}
            testID="sl-caption-input"
          />
        </View>

        <TouchableOpacity onPress={submit} disabled={submitting || !selectedDate}
          style={[styles.submitBtn, (submitting || !selectedDate) && { opacity: 0.5 }]}
          testID="sl-generate-btn">
          {submitting ? <ActivityIndicator size="small" color={Colors.white} /> : (
            <>
              <Icon name="sunny" size={16} color={Colors.white} />
              <Text style={styles.submitText}>Generate surface log</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  intro: { fontSize: 13, color: Colors.slate500, lineHeight: 18 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight, gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center' },
  dateChipActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  dateChipDate: { fontSize: 12, fontWeight: '700', color: Colors.slate900 },
  dateChipDateActive: { color: Colors.white },
  dateChipCount: { fontSize: 10, color: Colors.slate500, marginTop: 2 },
  emptyDates: { fontSize: 13, color: Colors.slate500, fontStyle: 'italic' },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  moodChipActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  moodChipText: { fontSize: 12, fontWeight: '600', color: Colors.slate700 },
  moodChipTextActive: { color: Colors.white },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.slate900 },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500 },
  submitText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
