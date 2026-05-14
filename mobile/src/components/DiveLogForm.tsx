import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { Colors } from '../constants/colors';
import { PlacesAutocompleteInput } from './PlacesAutocompleteInput';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export const DIVE_TYPES: { value: string; label: string }[] = [
  { value: 'reef', label: 'Reef' },
  { value: 'wreck', label: 'Wreck' },
  { value: 'night', label: 'Night' },
  { value: 'cave', label: 'Cave' },
  { value: 'drift', label: 'Drift' },
  { value: 'deep', label: 'Deep' },
  { value: 'shore', label: 'Shore' },
  { value: 'boat', label: 'Boat' },
];

export interface DiveLogFormValues {
  site_name: string;
  location: string;
  date: string;
  dive_type: string;
  max_depth: string;
  avg_depth: string;
  duration: string;
  buddy: string;
  visibility: string;
  water_temp: string;
  air_temp: string;
  notes: string;
  rating: number;
  gas_mix: string;
  tank_size: string;
  tank_start_pressure: string;
  tank_end_pressure: string;
  weight: string;
  suit_type: string;
  current: string;
  surface_conditions: string;
  entry_type: string;
  water_type: string;
  gps_lat: number | null;
  gps_lng: number | null;
}

export const EMPTY_FORM = (): DiveLogFormValues => ({
  site_name: '',
  location: '',
  date: new Date().toISOString().slice(0, 10),
  dive_type: '',
  max_depth: '',
  avg_depth: '',
  duration: '',
  buddy: '',
  visibility: '',
  water_temp: '',
  air_temp: '',
  notes: '',
  rating: 0,
  gas_mix: '',
  tank_size: '',
  tank_start_pressure: '',
  tank_end_pressure: '',
  weight: '',
  suit_type: '',
  current: '',
  surface_conditions: '',
  entry_type: '',
  water_type: '',
  gps_lat: null,
  gps_lng: null,
});

export function logToForm(log: any): DiveLogFormValues {
  const f = EMPTY_FORM();
  if (!log) return f;
  const keys: (keyof DiveLogFormValues)[] = [
    'site_name', 'location', 'date', 'dive_type', 'buddy', 'visibility',
    'notes', 'gas_mix', 'suit_type', 'current', 'surface_conditions',
    'entry_type', 'water_type',
  ];
  keys.forEach((k) => {
    const v = (log as any)[k];
    if (v != null) (f as any)[k] = String(v);
  });
  const numKeys: (keyof DiveLogFormValues)[] = [
    'max_depth', 'avg_depth', 'duration', 'water_temp', 'air_temp',
    'tank_size', 'tank_start_pressure', 'tank_end_pressure', 'weight',
  ];
  numKeys.forEach((k) => {
    const v = (log as any)[k];
    if (v != null && v !== '') (f as any)[k] = String(v);
  });
  if (log.date) f.date = String(log.date).slice(0, 10);
  if (typeof log.rating === 'number') f.rating = log.rating;
  if (typeof log.gps_lat === 'number') f.gps_lat = log.gps_lat;
  if (typeof log.gps_lng === 'number') f.gps_lng = log.gps_lng;
  return f;
}

export function formToPayload(f: DiveLogFormValues) {
  const num = (s: string) => (s === '' ? null : Number(s));
  const int = (s: string) => (s === '' ? null : parseInt(s, 10));
  const str = (s: string) => (s === '' ? null : s);
  return {
    site_name: f.site_name,
    location: f.location,
    date: f.date,
    dive_type: str(f.dive_type),
    max_depth: num(f.max_depth),
    avg_depth: num(f.avg_depth),
    duration: int(f.duration),
    buddy: str(f.buddy),
    visibility: str(f.visibility),
    water_temp: num(f.water_temp),
    air_temp: num(f.air_temp),
    notes: str(f.notes),
    rating: f.rating || null,
    gas_mix: str(f.gas_mix),
    tank_size: num(f.tank_size),
    tank_start_pressure: int(f.tank_start_pressure),
    tank_end_pressure: int(f.tank_end_pressure),
    weight: num(f.weight),
    suit_type: str(f.suit_type),
    current: str(f.current),
    surface_conditions: str(f.surface_conditions),
    entry_type: str(f.entry_type),
    water_type: str(f.water_type),
    gps_lat: f.gps_lat,
    gps_lng: f.gps_lng,
  };
}

interface Props {
  initial?: DiveLogFormValues;
  saving?: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (payload: ReturnType<typeof formToPayload>) => void;
  errorMessage?: string | null;
}

export default function DiveLogForm({
  initial,
  saving = false,
  submitLabel = 'Save dive',
  onCancel,
  onSubmit,
  errorMessage,
}: Props) {
  const [form, setForm] = useState<DiveLogFormValues>(initial || EMPTY_FORM());
  const [validationError, setValidationError] = useState<string | null>(null);
  const setField = <K extends keyof DiveLogFormValues>(key: K, val: DiveLogFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const submit = () => {
    setValidationError(null);
    if (!form.site_name.trim() || !form.location.trim() || !form.date.trim()) {
      setValidationError('Site, location and date are required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date.trim())) {
      setValidationError('Date must be in YYYY-MM-DD format.');
      return;
    }
    onSubmit(formToPayload(form));
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {(validationError || errorMessage) && (
        <View style={styles.errorBanner} testID="dive-form-error">
          <Icon name="alert-circle" size={16} color={Colors.accent} />
          <Text style={styles.errorText}>{validationError || errorMessage}</Text>
        </View>
      )}

      <Section title="Where & when">
        <Field label="Dive site *">
          <TextInput value={form.site_name} onChangeText={(v) => setField('site_name', v)}
            placeholder="e.g. Blue Hole" style={styles.input} testID="log-site_name" />
        </Field>
        <Field label="Location *">
          <PlacesAutocompleteInput
            value={form.location}
            onChangeText={(v) => setField('location', v)}
            onSelect={({ address, lat, lng }) => {
              setField('location', address);
              setField('gps_lat', lat);
              setField('gps_lng', lng);
            }}
            placeholder="e.g. Dahab, Egypt"
            testID="log-location"
          />
        </Field>
        <Field label="Pin on map">
          {/* Tap the map to drop a pin; drag the marker to fine-tune.
              Both actions sync back into gps_lat / gps_lng so the
              submitted dive log carries precise coordinates. */}
          <View style={styles.mapWrap}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              region={
                form.gps_lat != null && form.gps_lng != null
                  ? { latitude: form.gps_lat, longitude: form.gps_lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
                  : { latitude: 0, longitude: 20, latitudeDelta: 80, longitudeDelta: 80 }
              }
              scrollEnabled
              zoomEnabled
              onPress={(e) => {
                const c = e.nativeEvent.coordinate;
                setField('gps_lat', c.latitude);
                setField('gps_lng', c.longitude);
              }}
              testID="log-map"
            >
              {form.gps_lat != null && form.gps_lng != null && (
                <Marker
                  draggable
                  coordinate={{ latitude: form.gps_lat, longitude: form.gps_lng }}
                  pinColor={Colors.cyan500}
                  onDragEnd={(e) => {
                    const c = e.nativeEvent.coordinate;
                    setField('gps_lat', c.latitude);
                    setField('gps_lng', c.longitude);
                  }}
                />
              )}
            </MapView>
            {form.gps_lat == null && (
              <View style={styles.mapHintRow} pointerEvents="none">
                <Text style={styles.mapHintText}>
                  Search above or tap the map to drop a pin
                </Text>
              </View>
            )}
          </View>
        </Field>
        <View style={styles.row}>
          <Field label="Date *" style={{ flex: 1 }}>
            <TextInput value={form.date} onChangeText={(v) => setField('date', v)}
              placeholder="YYYY-MM-DD" style={styles.input} testID="log-date" autoCapitalize="none" />
          </Field>
          <Field label="Type" style={{ flex: 1 }}>
            <ChipPicker
              value={form.dive_type}
              options={DIVE_TYPES}
              onChange={(v) => setField('dive_type', v)}
              testIDPrefix="dive-type"
            />
          </Field>
        </View>
      </Section>

      <Section title="Profile">
        <View style={styles.row}>
          <Field label="Max depth (m)" style={{ flex: 1 }}>
            <TextInput value={form.max_depth} onChangeText={(v) => setField('max_depth', v)}
              placeholder="18" keyboardType="decimal-pad" style={styles.input} testID="log-max_depth" />
          </Field>
          <Field label="Avg depth (m)" style={{ flex: 1 }}>
            <TextInput value={form.avg_depth} onChangeText={(v) => setField('avg_depth', v)}
              placeholder="12" keyboardType="decimal-pad" style={styles.input} testID="log-avg_depth" />
          </Field>
        </View>
        <View style={styles.row}>
          <Field label="Duration (min)" style={{ flex: 1 }}>
            <TextInput value={form.duration} onChangeText={(v) => setField('duration', v)}
              placeholder="45" keyboardType="number-pad" style={styles.input} testID="log-duration" />
          </Field>
          <Field label="Visibility" style={{ flex: 1 }}>
            <TextInput value={form.visibility} onChangeText={(v) => setField('visibility', v)}
              placeholder="Good / 15m" style={styles.input} testID="log-visibility" />
          </Field>
        </View>
      </Section>

      <Section title="Conditions">
        <View style={styles.row}>
          <Field label="Water temp (°C)" style={{ flex: 1 }}>
            <TextInput value={form.water_temp} onChangeText={(v) => setField('water_temp', v)}
              placeholder="26" keyboardType="decimal-pad" style={styles.input} testID="log-water_temp" />
          </Field>
          <Field label="Air temp (°C)" style={{ flex: 1 }}>
            <TextInput value={form.air_temp} onChangeText={(v) => setField('air_temp', v)}
              placeholder="30" keyboardType="decimal-pad" style={styles.input} testID="log-air_temp" />
          </Field>
        </View>
        <View style={styles.row}>
          <Field label="Current" style={{ flex: 1 }}>
            <TextInput value={form.current} onChangeText={(v) => setField('current', v)}
              placeholder="None / mild / strong" style={styles.input} testID="log-current" />
          </Field>
          <Field label="Surface" style={{ flex: 1 }}>
            <TextInput value={form.surface_conditions} onChangeText={(v) => setField('surface_conditions', v)}
              placeholder="Calm / choppy" style={styles.input} testID="log-surface_conditions" />
          </Field>
        </View>
        <View style={styles.row}>
          <Field label="Entry" style={{ flex: 1 }}>
            <ChipPicker
              value={form.entry_type}
              options={[{ value: 'shore', label: 'Shore' }, { value: 'boat', label: 'Boat' }]}
              onChange={(v) => setField('entry_type', v)}
              testIDPrefix="entry-type"
            />
          </Field>
          <Field label="Water" style={{ flex: 1 }}>
            <ChipPicker
              value={form.water_type}
              options={[{ value: 'salt', label: 'Salt' }, { value: 'fresh', label: 'Fresh' }]}
              onChange={(v) => setField('water_type', v)}
              testIDPrefix="water-type"
            />
          </Field>
        </View>
      </Section>

      <Section title="Gas & gear">
        <View style={styles.row}>
          <Field label="Gas mix" style={{ flex: 1 }}>
            <TextInput value={form.gas_mix} onChangeText={(v) => setField('gas_mix', v)}
              placeholder="Air / EAN32" style={styles.input} testID="log-gas_mix" />
          </Field>
          <Field label="Tank size (L)" style={{ flex: 1 }}>
            <TextInput value={form.tank_size} onChangeText={(v) => setField('tank_size', v)}
              placeholder="12" keyboardType="decimal-pad" style={styles.input} testID="log-tank_size" />
          </Field>
        </View>
        <View style={styles.row}>
          <Field label="Start pressure (bar)" style={{ flex: 1 }}>
            <TextInput value={form.tank_start_pressure} onChangeText={(v) => setField('tank_start_pressure', v)}
              placeholder="200" keyboardType="number-pad" style={styles.input} testID="log-tank_start_pressure" />
          </Field>
          <Field label="End pressure (bar)" style={{ flex: 1 }}>
            <TextInput value={form.tank_end_pressure} onChangeText={(v) => setField('tank_end_pressure', v)}
              placeholder="50" keyboardType="number-pad" style={styles.input} testID="log-tank_end_pressure" />
          </Field>
        </View>
        <View style={styles.row}>
          <Field label="Weight (kg)" style={{ flex: 1 }}>
            <TextInput value={form.weight} onChangeText={(v) => setField('weight', v)}
              placeholder="6" keyboardType="decimal-pad" style={styles.input} testID="log-weight" />
          </Field>
          <Field label="Suit" style={{ flex: 1 }}>
            <TextInput value={form.suit_type} onChangeText={(v) => setField('suit_type', v)}
              placeholder="3mm wetsuit" style={styles.input} testID="log-suit_type" />
          </Field>
        </View>
      </Section>

      <Section title="Notes">
        <Field label="Buddy">
          <TextInput value={form.buddy} onChangeText={(v) => setField('buddy', v)}
            placeholder="Buddy name" style={styles.input} testID="log-buddy" />
        </Field>
        <Field label="Rating">
          <View style={styles.starRow} testID="log-rating">
            {[1, 2, 3, 4, 5].map((s) => (
              <TouchableOpacity key={s} onPress={() => setField('rating', form.rating === s ? 0 : s)}
                testID={`rating-star-${s}`} style={{ paddingHorizontal: 4 }}>
                <Icon name={s <= form.rating ? 'star' : 'star-outline'} size={26}
                  color={s <= form.rating ? '#f59e0b' : Colors.slate300} />
              </TouchableOpacity>
            ))}
          </View>
        </Field>
        <Field label="Notes">
          <TextInput value={form.notes} onChangeText={(v) => setField('notes', v)}
            placeholder="What did you see? How was the dive?" style={[styles.input, styles.textarea]}
            multiline numberOfLines={4} testID="log-notes" />
        </Field>
      </Section>

      <View style={styles.footer}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} testID="form-cancel-btn">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} disabled={saving} style={[styles.submitBtn, saving && { opacity: 0.6 }]}
          testID="submit-dive-log">
          {saving ? <ActivityIndicator size="small" color={Colors.white} /> : (
            <Text style={styles.submitText}>{submitLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionInner}>{children}</View>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChipPicker({
  value, options, onChange, testIDPrefix,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testIDPrefix: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(active ? '' : o.value)}
            style={[styles.chip, active && styles.chipActive]}
            testID={`${testIDPrefix}-${o.value}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  sectionInner: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight, gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.slate700 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.slate900, backgroundColor: Colors.white },
  // Map widget under the location field — fixed 200 px, rounded; user
  // taps to drop a pin or drags the marker to fine-tune.
  mapWrap: { height: 200, borderRadius: 16, overflow: 'hidden', position: 'relative', backgroundColor: Colors.slate100 },
  map: { ...StyleSheet.absoluteFillObject },
  mapHintRow: {
    position: 'absolute', left: 0, right: 0, bottom: 12,
    alignItems: 'center',
  },
  mapHintText: {
    fontSize: 12, color: Colors.slate500, backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.cyan400, borderColor: Colors.cyan400 },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.slate600 },
  chipTextActive: { color: Colors.white },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.slate600 },
  submitBtn: { flex: 2, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500, alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
