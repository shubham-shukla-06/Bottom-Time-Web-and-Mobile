/**
 * 🔒 LOCKED — Mobile Auth Flow (approved 2026-05-06)
 *
 * Phone input with country code picker + digits-only field.
 * Used in /app/mobile/app/signup.tsx step 3.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  FlatList,
  Modal,
  Platform,
} from 'react-native';
import { HapticPressable as Pressable } from './HapticPressable';
import { Text } from './Text';
import Icon from './Icon';
import { Colors } from '../constants/colors';
import { COUNTRIES, type Country } from '../constants/countries';

// Re-export so existing imports `import PhoneInput, { COUNTRIES, Country }` keep working.
export { COUNTRIES };
export type { Country };

type Props = {
  country: Country;
  onCountryChange: (c: Country) => void;
  number: string;
  onNumberChange: (v: string) => void;
  testID?: string;
};

export const PhoneInput: React.FC<Props> = ({
  country, onCountryChange, number, onNumberChange, testID = 'phone-input',
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(q) || c.code.includes(q) || c.iso.toLowerCase().includes(q)
    );
  }, [filter]);

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.codeBox}
        onPress={() => setPickerOpen(true)}
        testID={`${testID}-country`}
      >
        <Text style={styles.flag}>{country.flag}</Text>
        <Text style={styles.dial}>{country.code}</Text>
        <Icon name="chevron-down" size={14} color={Colors.slate500} />
      </Pressable>
      <View style={styles.numberBox}>
        <TextInput
          value={number}
          onChangeText={(v) => onNumberChange(v.replace(/\D/g, ''))}
          placeholder="Phone number"
          placeholderTextColor={Colors.slate400}
          keyboardType="phone-pad"
          maxLength={15}
          style={styles.numberField}
          testID={`${testID}-number`}
        />
      </View>

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.sheetRoot}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Choose your country</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Icon name="close" size={26} color={Colors.slate900} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Icon name="search" size={16} color={Colors.slate400} />
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder="Search by country, code, or dial code"
              placeholderTextColor={Colors.slate400}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              testID={`${testID}-search`}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            windowSize={10}
            renderItem={({ item }) => {
              const active = item.iso === country.iso;
              return (
                <Pressable
                  onPress={() => { onCountryChange(item); setPickerOpen(false); setFilter(''); }}
                  style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: Colors.slate50 }]}
                  testID={`${testID}-item-${item.iso}`}
                >
                  <Text style={styles.listFlag}>{item.flag}</Text>
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={[styles.listDial, active && { color: Colors.cyan500, fontWeight: '700' }]}>{item.code}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  codeBox: {
    height: 52, borderRadius: 16, backgroundColor: Colors.slate50,
    borderWidth: 1, borderColor: Colors.slate200,
    paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  flag: { fontSize: 20 },
  dial: { fontSize: 14, fontWeight: '600', color: Colors.slate900 },
  numberBox: {
    flex: 1, height: 52, borderRadius: 16, backgroundColor: Colors.slate50,
    borderWidth: 1, borderColor: Colors.slate200, justifyContent: 'center',
  },
  numberField: {
    height: 52, paddingHorizontal: 18, fontSize: 15, color: Colors.slate900,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
  },
  sheetRoot: { flex: 1, backgroundColor: Colors.white },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: Colors.slate100,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.slate900 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, paddingHorizontal: 14, height: 44,
    borderRadius: 12, backgroundColor: Colors.slate50,
    borderWidth: 1, borderColor: Colors.slate200,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.slate900 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderColor: Colors.slate100,
  },
  listFlag: { fontSize: 22 },
  listName: { flex: 1, fontSize: 15, color: Colors.slate900 },
  listDial: { fontSize: 14, color: Colors.slate500 },
});

export default PhoneInput;
