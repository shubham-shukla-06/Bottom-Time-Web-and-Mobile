import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../src/components/Icon';
import api from '../src/api/client';
import { Colors } from '../src/constants/colors';

const GAS_PRESETS = [
  { label: 'Air', fo2: 0.21 },
  { label: 'EAN32', fo2: 0.32 },
  { label: 'EAN36', fo2: 0.36 },
  { label: 'EAN40', fo2: 0.40 },
];

export default function DivePlannerScreen() {
  const router = useRouter();
  const [depth, setDepth] = useState('18');
  const [plannedTime, setPlannedTime] = useState('45');
  const [fo2, setFo2] = useState(0.21);
  const [tankSize, setTankSize] = useState('12');
  const [sacRate, setSacRate] = useState('15');
  const [gfLow, setGfLow] = useState('30');
  const [gfHigh, setGfHigh] = useState('85');
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/dive-planner/calculate', {
        depth: Number(depth),
        fo2,
        planned_time: Number(plannedTime),
        tank_size: Number(tankSize),
        sac_rate: Number(sacRate),
        gf_low: Number(gfLow),
        gf_high: Number(gfHigh),
      });
      setPlan(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to calculate plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="dive-planner-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="dp-back-btn">
          <Icon name="arrow-back" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dive planner</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Bühlmann ZH-L16C with gradient factors. Tweak your dive parameters and we&apos;ll compute NDL, gas needs, deco status and tissue saturation.</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.row}>
            <Field label="Max depth (m)" style={{ flex: 1 }}>
              <TextInput value={depth} onChangeText={setDepth} keyboardType="decimal-pad" style={styles.input} testID="planner-depth" />
            </Field>
            <Field label="Time (min)" style={{ flex: 1 }}>
              <TextInput value={plannedTime} onChangeText={setPlannedTime} keyboardType="number-pad" style={styles.input} testID="planner-time" />
            </Field>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gas mix</Text>
          <View style={styles.gasRow}>
            {GAS_PRESETS.map((g) => {
              const active = fo2 === g.fo2;
              return (
                <TouchableOpacity key={g.label} onPress={() => setFo2(g.fo2)}
                  style={[styles.gasChip, active && styles.gasChipActive]}
                  testID={`planner-gas-${g.label}`}>
                  <Text style={[styles.gasChipText, active && styles.gasChipTextActive]}>{g.label}</Text>
                  <Text style={[styles.gasChipFo2, active && { color: Colors.white }]}>FO₂ {Math.round(g.fo2 * 100)}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.row}>
            <Field label="Tank (L)" style={{ flex: 1 }}>
              <TextInput value={tankSize} onChangeText={setTankSize} keyboardType="decimal-pad" style={styles.input} testID="planner-tank" />
            </Field>
            <Field label="SAC (L/min)" style={{ flex: 1 }}>
              <TextInput value={sacRate} onChangeText={setSacRate} keyboardType="decimal-pad" style={styles.input} testID="planner-sac" />
            </Field>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gradient factors</Text>
          <View style={styles.row}>
            <Field label="GF low (%)" style={{ flex: 1 }}>
              <TextInput value={gfLow} onChangeText={setGfLow} keyboardType="number-pad" style={styles.input} testID="planner-gf-low" />
            </Field>
            <Field label="GF high (%)" style={{ flex: 1 }}>
              <TextInput value={gfHigh} onChangeText={setGfHigh} keyboardType="number-pad" style={styles.input} testID="planner-gf-high" />
            </Field>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle" size={16} color={Colors.accent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity onPress={calculate} disabled={loading} style={[styles.calcBtn, loading && { opacity: 0.6 }]}
          testID="planner-calculate-btn">
          {loading ? <ActivityIndicator size="small" color={Colors.white} /> : (
            <>
              <Icon name="calculator" size={16} color={Colors.white} />
              <Text style={styles.calcText}>Calculate plan</Text>
            </>
          )}
        </TouchableOpacity>

        {plan && <PlanResult plan={plan} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanResult({ plan }: { plan: any }) {
  const safetyOk = plan?.safety?.all_ok;
  return (
    <View style={{ gap: 14 }} testID="planner-result">
      <View style={[styles.resultBanner, { backgroundColor: safetyOk ? '#ecfdf5' : '#fef2f2', borderColor: safetyOk ? '#a7f3d0' : '#fecaca' }]}>
        <Icon name={safetyOk ? 'shield-checkmark' : 'warning'} size={18} color={safetyOk ? Colors.success : Colors.accent} />
        <Text style={[styles.resultBannerText, { color: safetyOk ? Colors.success : Colors.accent }]}>
          {safetyOk ? 'All checks passed — plan is within limits.' : 'Plan flags warnings. Review the details below.'}
        </Text>
      </View>

      <View style={styles.kpiRow}>
        <Kpi label="NDL at depth" value={`${plan.deco?.ndl ?? '—'} min`} ok={plan.safety?.cns_ok && (plan.plan?.planned_time <= plan.deco?.ndl)} />
        <Kpi label="MOD" value={`${plan.gas?.mod ?? '—'} m`} ok={plan.safety?.depth_ok} />
        <Kpi label="ppO₂" value={`${plan.gas?.ppo2 ?? '—'}`} ok={(plan.gas?.ppo2 ?? 0) <= 1.4} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plan summary</Text>
        <Row label="Depth" value={`${plan.plan?.depth} m`} />
        <Row label="Bottom time" value={`${plan.plan?.planned_time} min`} />
        <Row label="Ascent + safety stop" value={`${plan.plan?.ascent_time} min`} />
        <Row label="Total run time" value={`${plan.plan?.total_time} min`} bold />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gas plan</Text>
        <Row label="Mix" value={plan.gas?.mix || '—'} />
        <Row label="EAD" value={`${plan.gas?.ead ?? '—'} m`} />
        <Row label="ppN₂" value={`${plan.gas?.ppn2 ?? '—'}`} />
        <Row label="Gas needed" value={`${plan.gas?.gas_needed} L`} />
        <Row label="Usable gas" value={`${plan.gas?.gas_available} L`} />
        <Row label="Reserve" value={`${plan.gas?.gas_reserve} L`} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety</Text>
        <Row label="CNS" value={`${plan.safety?.cns_percent}%`} />
        <Row label="OTU" value={`${plan.safety?.otu}`} />
        <Row label="Within NDL" value={plan.deco?.within_ndl ? 'Yes' : 'No'} />
        <Row label="Gas OK" value={plan.safety?.gas_ok ? 'Yes' : 'No'} />
        <Row label="Depth ≤ MOD" value={plan.safety?.depth_ok ? 'Yes' : 'No'} />
        <Row label="GF" value={`${plan.deco?.gf_low}/${plan.deco?.gf_high}`} />
      </View>

      <View style={styles.section} testID="planner-ndl-table">
        <Text style={styles.sectionTitle}>NDL table</Text>
        <View style={styles.tableHead}>
          <Text style={styles.tableHeadCell}>Depth</Text>
          <Text style={styles.tableHeadCell}>NDL (min)</Text>
        </View>
        {(plan.ndl_table || []).map((row: any) => (
          <View key={row.depth} style={styles.tableRow}>
            <Text style={styles.tableCell}>{row.depth} m</Text>
            <Text style={[styles.tableCell, { fontWeight: '700', color: row.ndl > 9999 ? Colors.success : Colors.slate900 }]}>
              {row.ndl >= 999 ? '∞' : row.ndl}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tissue saturation</Text>
        <Text style={styles.helperText}>Loading per Bühlmann compartment after planned bottom time.</Text>
        {(plan.tissues || []).map((t: any) => {
          const pct = Math.min(100, Math.max(0, t.saturation_pct));
          const tint = pct > 90 ? Colors.accent : pct > 70 ? '#f59e0b' : Colors.cyan500;
          return (
            <View key={t.compartment} style={styles.tissueRow}>
              <Text style={styles.tissueLabel}>#{t.compartment}</Text>
              <View style={styles.tissueBar}>
                <View style={[styles.tissueFill, { width: `${pct}%`, backgroundColor: tint }]} />
              </View>
              <Text style={styles.tissuePct}>{pct.toFixed(0)}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: '700', fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

function Kpi({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  const color = ok ? Colors.success : Colors.accent;
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <View style={[styles.kpiDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
  intro: { fontSize: 13, color: Colors.slate500, lineHeight: 18 },
  section: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight, gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.slate700 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.slate900 },
  gasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gasChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  gasChipActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  gasChipText: { fontSize: 13, fontWeight: '700', color: Colors.slate700 },
  gasChipTextActive: { color: Colors.white },
  gasChipFo2: { fontSize: 9, color: Colors.slate500, marginTop: 2, fontWeight: '600' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  calcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: Colors.cyan500 },
  calcText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  resultBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'flex-start', gap: 4 },
  kpiLabel: { fontSize: 10, color: Colors.slate500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 18, fontWeight: '700' },
  kpiDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rowLabel: { fontSize: 13, color: Colors.slate500, fontWeight: '600' },
  rowValue: { fontSize: 13, color: Colors.slate900, fontWeight: '500', textAlign: 'right' },
  helperText: { fontSize: 12, color: Colors.slate500, marginBottom: 6 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingBottom: 6 },
  tableHeadCell: { flex: 1, fontSize: 11, fontWeight: '700', color: Colors.slate500, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tableCell: { flex: 1, fontSize: 13, color: Colors.slate900 },
  tissueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  tissueLabel: { width: 32, fontSize: 11, color: Colors.slate500, fontWeight: '600' },
  tissueBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.slate100, overflow: 'hidden' },
  tissueFill: { height: 8, borderRadius: 4 },
  tissuePct: { width: 44, textAlign: 'right', fontSize: 11, color: Colors.slate700, fontWeight: '600' },
});
