import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import { Colors } from '../constants/colors';

interface BookingSheetProps {
  visible: boolean;
  onClose: () => void;
  listing: any;
}

function isoDateRegex(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function plusDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BookingSheet({ visible, onClose, listing }: BookingSheetProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [date, setDate] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [participants, setParticipants] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const maxPerBooking = listing?.max_per_booking || 6;
  const unitPrice = Number(listing?.price || 0);
  const total = unitPrice * participants;
  const currency = listing?.currency || 'USD';

  const quickDates = useMemo(() => {
    return [3, 7, 14, 30].map((n) => plusDaysISO(n));
  }, []);

  useEffect(() => {
    if (!visible || !listing?.id) return;
    setErrorMsg(null);
    setDateError(null);
    setSubmitting(false);
    if (!date) setDate(plusDaysISO(7));
    setLoadingAvail(true);
    api
      .get(`/listings/${listing.id}/availability`)
      .then((res) => {
        setAvailableDates(res.data?.available_dates || []);
      })
      .catch(() => {
        setAvailableDates([]);
      })
      .finally(() => setLoadingAvail(false));
  }, [visible, listing?.id]);

  const validateDate = (d: string) => {
    if (!isoDateRegex(d)) return 'Use YYYY-MM-DD format';
    if (d < todayISO()) return 'Date must be today or later';
    return null;
  };

  const handleConfirm = async () => {
    setErrorMsg(null);
    const dErr = validateDate(date);
    if (dErr) {
      setDateError(dErr);
      return;
    }
    setDateError(null);
    if (!user) {
      onClose();
      router.push('/auth');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        listing_id: listing.id,
        date,
        participants,
        notes: notes.trim() || null,
      };
      const res = await api.post('/bookings', payload);
      const bookingId = res.data?.id;
      onClose();
      // Reset form for next time
      setNotes('');
      setParticipants(1);
      router.push({ pathname: '/booking/confirmation', params: { bookingId } });
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Booking failed. Please try again.';
      setErrorMsg(typeof msg === 'string' ? msg : 'Booking failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity activeOpacity={1} style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet} testID="booking-sheet">
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              Book {listing?.title || listing?.name || 'Experience'}
            </Text>
            <TouchableOpacity onPress={onClose} testID="booking-sheet-close">
              <Ionicons name="close" size={24} color={Colors.slate600} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Date input */}
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateInputRow}>
              <Ionicons name="calendar-outline" size={18} color={Colors.slate500} />
              <TextInput
                style={styles.dateInput}
                value={date}
                onChangeText={(v) => {
                  setDate(v);
                  setDateError(null);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.slate400}
                autoCapitalize="none"
                autoCorrect={false}
                testID="booking-date-input"
              />
            </View>
            {dateError && <Text style={styles.fieldError}>{dateError}</Text>}

            <View style={styles.quickDateRow}>
              {quickDates.map((qd) => (
                <TouchableOpacity
                  key={qd}
                  style={[styles.quickDateChip, date === qd && styles.quickDateChipActive]}
                  onPress={() => {
                    setDate(qd);
                    setDateError(null);
                  }}
                  testID={`booking-quick-${qd}`}
                >
                  <Text style={[styles.quickDateText, date === qd && styles.quickDateTextActive]}>
                    {new Date(qd + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loadingAvail ? (
              <View style={styles.availLoading}>
                <ActivityIndicator size="small" color={Colors.cyan500} />
                <Text style={styles.availLoadingText}>Checking availability…</Text>
              </View>
            ) : availableDates.length > 0 ? (
              <View style={styles.availList}>
                <Text style={styles.helper}>Operator suggests:</Text>
                <View style={styles.availChips}>
                  {availableDates.slice(0, 6).map((ad) => (
                    <TouchableOpacity
                      key={ad}
                      style={[styles.availChip, date === ad && styles.availChipActive]}
                      onPress={() => setDate(ad)}
                    >
                      <Text style={[styles.availChipText, date === ad && styles.availChipTextActive]}>
                        {ad}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.helper}>
                On-demand operator — pick any date and they will confirm.
              </Text>
            )}

            {/* Participants */}
            <Text style={[styles.label, { marginTop: 24 }]}>Divers</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, participants <= 1 && styles.stepBtnDisabled]}
                onPress={() => setParticipants(Math.max(1, participants - 1))}
                disabled={participants <= 1}
                testID="booking-participants-minus"
              >
                <Ionicons name="remove" size={20} color={Colors.slate900} />
              </TouchableOpacity>
              <Text style={styles.stepValue} testID="booking-participants-value">
                {participants}
              </Text>
              <TouchableOpacity
                style={[styles.stepBtn, participants >= maxPerBooking && styles.stepBtnDisabled]}
                onPress={() => setParticipants(Math.min(maxPerBooking, participants + 1))}
                disabled={participants >= maxPerBooking}
                testID="booking-participants-plus"
              >
                <Ionicons name="add" size={20} color={Colors.slate900} />
              </TouchableOpacity>
              <Text style={styles.stepHelper}>up to {maxPerBooking}</Text>
            </View>

            {/* Notes */}
            <Text style={[styles.label, { marginTop: 24 }]}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any requests, certs, gear sizing…"
              placeholderTextColor={Colors.slate400}
              multiline
              numberOfLines={3}
              testID="booking-notes-input"
            />

            {/* Total */}
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalSub}>
                  {currency} {unitPrice.toFixed(2)} × {participants}
                </Text>
              </View>
              <Text style={styles.totalValue} testID="booking-total">
                {currency} {total.toFixed(2)}
              </Text>
            </View>

            {errorMsg && (
              <View style={styles.errorBox} testID="booking-error">
                <Ionicons name="alert-circle" size={16} color={Colors.accent} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={submitting}
              testID="booking-confirm-btn"
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.slate900} />
              ) : (
                <Text style={styles.confirmText}>
                  {user ? `Confirm booking · ${currency} ${total.toFixed(2)}` : 'Sign in to book'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: 520,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.slate200, marginVertical: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.slate900, marginRight: 12 },
  body: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.slate700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  helper: { fontSize: 12, color: Colors.slate500, marginTop: 8 },
  fieldError: { fontSize: 12, color: Colors.accent, marginTop: 6 },
  dateInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  dateInput: { flex: 1, fontSize: 15, color: Colors.slate900 },
  quickDateRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  quickDateChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.slate100, borderWidth: 1, borderColor: 'transparent' },
  quickDateChipActive: { backgroundColor: Colors.cyan50, borderColor: Colors.cyan400 },
  quickDateText: { fontSize: 12, fontWeight: '600', color: Colors.slate600 },
  quickDateTextActive: { color: Colors.cyan500 },
  availLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  availLoadingText: { fontSize: 12, color: Colors.slate500 },
  availList: { marginTop: 12 },
  availChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  availChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.slate50, borderWidth: 1, borderColor: Colors.border },
  availChipActive: { backgroundColor: Colors.cyan50, borderColor: Colors.cyan400 },
  availChipText: { fontSize: 12, color: Colors.slate600 },
  availChipTextActive: { color: Colors.cyan500, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  stepBtnDisabled: { opacity: 0.4 },
  stepValue: { fontSize: 22, fontWeight: '700', color: Colors.slate900, minWidth: 40, textAlign: 'center' },
  stepHelper: { fontSize: 12, color: Colors.slate500 },
  notesInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.slate900, minHeight: 70, textAlignVertical: 'top' },
  totalRow: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.borderLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: Colors.slate500 },
  totalSub: { fontSize: 12, color: Colors.slate400, marginTop: 2 },
  totalValue: { fontSize: 22, fontWeight: '700', color: Colors.slate900 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.white },
  confirmBtn: { backgroundColor: Colors.cyan400, paddingVertical: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmText: { fontSize: 15, fontWeight: '700', color: Colors.slate900 },
});
