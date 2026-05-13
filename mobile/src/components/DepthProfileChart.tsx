import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from './Text';
import { LineChart } from 'react-native-gifted-charts';
import { Colors } from '../constants/colors';

interface ProfilePoint {
  time_seconds?: number;
  depth?: number;
}

interface Props {
  profile: ProfilePoint[];
  height?: number;
  testID?: string;
}

/**
 * Renders a depth/time chart for a dive profile.
 * Y-axis shows depth (m, inverted so deeper = lower).
 * Profile is downsampled to keep ~80 points max.
 */
export default function DepthProfileChart({ profile, height = 180, testID }: Props) {
  const data = useMemo(() => {
    if (!profile || profile.length < 2) return [];
    const step = Math.max(1, Math.floor(profile.length / 80));
    const sampled = profile.filter((_, i) => i % step === 0);
    return sampled.map((p) => ({
      value: -(p.depth ?? 0), // invert so deeper points are below the axis line
      label: '',
    }));
  }, [profile]);

  const maxDepth = useMemo(
    () => Math.max(0, ...profile.map((p) => p.depth ?? 0)),
    [profile]
  );

  if (!data.length) {
    return (
      <View style={[styles.empty, { height }]} testID={testID}>
        <Text style={styles.emptyText}>No depth profile data</Text>
      </View>
    );
  }

  const chartWidth = Math.max(Dimensions.get('window').width - 80, 220);

  return (
    <View testID={testID}>
      <Text style={styles.label}>Depth profile · {profile.length} pts · max {maxDepth}m</Text>
      <View style={styles.chartWrap}>
        <LineChart
          data={data}
          height={height}
          width={chartWidth}
          color={Colors.cyan500}
          thickness={2}
          startFillColor={Colors.cyan400}
          endFillColor={Colors.cyan100}
          startOpacity={0.5}
          endOpacity={0.05}
          areaChart
          curved
          hideDataPoints
          noOfSections={4}
          yAxisColor={Colors.borderLight}
          xAxisColor={Colors.borderLight}
          yAxisTextStyle={{ fontSize: 9, color: Colors.slate400 }}
          rulesColor={Colors.borderLight}
          rulesType="dashed"
          initialSpacing={2}
          spacing={Math.max(2, chartWidth / Math.max(data.length, 1))}
          adjustToWidth
          formatYLabel={(v: string) => `${Math.abs(parseFloat(v)).toFixed(0)}m`}
          disableScroll
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.slate50, borderRadius: 12 },
  emptyText: { fontSize: 12, color: Colors.slate400 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.slate400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chartWrap: { backgroundColor: Colors.slate50, borderRadius: 12, padding: 8, paddingRight: 16, alignItems: 'center', overflow: 'hidden' },
});
