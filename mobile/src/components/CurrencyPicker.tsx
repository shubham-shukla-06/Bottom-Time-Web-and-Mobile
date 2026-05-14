/**
 * Currency picker — mirrors web's Navbar currency dropdown.
 * Uses uiStore.currency + setCurrency. Persists via SecureStore + PUT /auth/profile.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { HapticTouchable as TouchableOpacity } from './HapticTouchable';
import { Text } from './Text';
import Icon from './Icon';
import { Colors } from '../constants/colors';
import useUIStore, { CURRENCY_SYMBOLS } from '../stores/uiStore';

const CURRENCIES = ['USD','EUR','GBP','INR','AUD','CAD','JPY','THB','IDR','MYR','PHP','SGD','NZD','BRL','MXN'];

export default function CurrencyPicker({ testID }: { testID?: string }) {
  const currency = useUIStore((s) => s.currency);
  const setCurrency = useUIStore((s) => s.setCurrency);
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={styles.btn} testID={testID || 'currency-picker'}>
        <Text style={styles.code}>{currency}</Text>
        <Icon name="chevron-down" size={11} color={Colors.slate600} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={styles.overlay}>
          <View style={styles.sheet} testID="currency-sheet">
            <Text style={styles.sheetTitle}>Choose currency</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity key={c} onPress={async () => { await setCurrency(c); setOpen(false); }}
                  style={[styles.row, currency === c && styles.rowActive]}
                  testID={`currency-${c}`}>
                  <Text style={[styles.symbol, currency === c && { color: Colors.cyan500 }]}>{CURRENCY_SYMBOLS[c] || ''}</Text>
                  <Text style={[styles.name, currency === c && { color: Colors.cyan500, fontWeight: '700' }]}>{c}</Text>
                  {currency === c ? <Icon name="checkmark" size={16} color={Colors.cyan500} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.slate100 },
  code: { fontSize: 12, fontWeight: '700', color: Colors.slate800, fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '90%', maxWidth: 340, backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 8 },
  sheetTitle: { fontSize: 14, fontWeight: '700', color: Colors.slate900, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
  rowActive: { backgroundColor: Colors.cyan100 },
  symbol: { width: 24, fontSize: 14, fontWeight: '700', color: Colors.slate600 },
  name: { flex: 1, fontSize: 13, color: Colors.slate800, fontWeight: '500' },
});
