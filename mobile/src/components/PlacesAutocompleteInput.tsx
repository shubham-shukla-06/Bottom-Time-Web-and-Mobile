/**
 * PlacesAutocompleteInput — Google Places autocomplete text input.
 *
 * - Wraps a TextInput. Calls Google Places Autocomplete API (debounced
 *   250ms) on each change.
 * - Renders a dropdown of predictions below the input.
 * - On selecting a prediction, calls Place Details API to resolve the
 *   chosen prediction's lat/lng + formatted address, then fires
 *   onSelect({ name, address, lat, lng }).
 * - Zero external dependencies — uses the fetch API directly. Key comes
 *   from `EXPO_PUBLIC_GOOGLE_MAPS_KEY` env var.
 *
 * Notes:
 * - Predictions are session-grouped via a single sessiontoken so Google
 *   bills the autocomplete + details together at session-pricing.
 * - Network failures gracefully fall back to the plain text input — the
 *   user can still type freely and submit a location with no
 *   coordinates if needed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  type TextInputProps,
} from 'react-native';
import { Text } from './Text';
import { Colors } from '../constants/colors';

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
const AUTOCOMPLETE_URL =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
}

interface PlacesSelection {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface Props extends Omit<TextInputProps, 'onChange' | 'onChangeText'> {
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (sel: PlacesSelection) => void;
  containerStyle?: any;
  inputStyle?: any;
  testID?: string;
}

function genSessionToken() {
  // Loose RFC4122-ish token. Google only requires it to be opaque and
  // session-unique; cryptographic strength isn't relevant.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function PlacesAutocompleteInput({
  value,
  onChangeText,
  onSelect,
  placeholder = 'Search a place',
  containerStyle,
  inputStyle,
  testID,
  ...rest
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionTokenRef = useRef<string>(genSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch predictions whenever `value` changes, debounced 250 ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 2 || !GMAPS_KEY) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `${AUTOCOMPLETE_URL}?input=${encodeURIComponent(value)}&types=geocode&sessiontoken=${sessionTokenRef.current}&key=${GMAPS_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        const list: Prediction[] = (data?.predictions || []).slice(0, 5);
        setPredictions(list);
        setOpen(list.length > 0);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const choose = useCallback(
    async (p: Prediction) => {
      setOpen(false);
      setPredictions([]);
      if (!GMAPS_KEY) return;
      setLoading(true);
      try {
        const url = `${DETAILS_URL}?place_id=${encodeURIComponent(p.place_id)}&fields=geometry,name,formatted_address&sessiontoken=${sessionTokenRef.current}&key=${GMAPS_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        const loc = data?.result?.geometry?.location;
        const name: string = data?.result?.name || p.structured_formatting?.main_text || p.description;
        const address: string = data?.result?.formatted_address || p.description;
        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          onChangeText(address);
          onSelect({ name, address, lat: loc.lat, lng: loc.lng });
        } else {
          // No geometry returned — still update the text but skip coords.
          onChangeText(address);
        }
        // New session for the next pick.
        sessionTokenRef.current = genSessionToken();
      } catch {
        // Swallow — text remains as-is.
      } finally {
        setLoading(false);
      }
    },
    [onChangeText, onSelect],
  );

  return (
    <View style={[styles.host, containerStyle]} testID={testID}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.slate500}
          style={[styles.input, inputStyle]}
          onFocus={() => { if (predictions.length > 0) setOpen(true); }}
          onBlur={() => { setTimeout(() => setOpen(false), 150); }}
          {...rest}
        />
        {loading && (
          <ActivityIndicator size="small" color={Colors.cyan500} style={styles.spinner} />
        )}
      </View>
      {open && predictions.length > 0 && (
        <View style={styles.dropdown} testID="places-dropdown">
          {predictions.map((p) => (
            <TouchableOpacity
              key={p.place_id}
              style={styles.row}
              onPress={() => choose(p)}
              activeOpacity={0.7}
              testID={`places-prediction-${p.place_id}`}
            >
              <Text style={styles.rowMain} numberOfLines={1}>
                {p.structured_formatting?.main_text || p.description}
              </Text>
              {p.structured_formatting?.secondary_text ? (
                <Text style={styles.rowSecondary} numberOfLines={1}>
                  {p.structured_formatting.secondary_text}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'relative',
    zIndex: 10,
  },
  inputRow: {
    position: 'relative',
  },
  input: {
    backgroundColor: Colors.slate100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.slate900,
  },
  spinner: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.slate200,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  rowMain: {
    fontSize: 14,
    color: Colors.slate900,
    fontWeight: '500',
  },
  rowSecondary: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate500,
  },
});

export default PlacesAutocompleteInput;
