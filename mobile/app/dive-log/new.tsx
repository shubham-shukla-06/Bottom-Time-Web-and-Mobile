import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/Icon';
import api from '../../src/api/client';
import { Colors } from '../../src/constants/colors';
import DiveLogForm, { EMPTY_FORM } from '../../src/components/DiveLogForm';

export default function NewDiveLogScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (payload: any) => {
    setError(null);
    setSaving(true);
    try {
      const res = await api.post('/dive-log', payload);
      const id = res.data?.id;
      if (id) {
        router.replace({ pathname: '/dive-log/[id]', params: { id } });
      } else {
        router.back();
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to save dive');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="new-dive-log-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="new-dive-back-btn">
          <Icon name="close" size={22} color={Colors.slate900} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log a dive</Text>
        <View style={{ width: 22 }} />
      </View>
      <DiveLogForm
        initial={EMPTY_FORM()}
        saving={saving}
        submitLabel="Log this dive"
        onCancel={() => router.back()}
        onSubmit={submit}
        errorMessage={error}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.slate50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.slate900 },
});
