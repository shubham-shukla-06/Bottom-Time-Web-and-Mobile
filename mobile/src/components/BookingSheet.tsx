/**
 * BookingSheet — booking flow with tax compliance breakdown (mirror of web's
 * Cart/booking summary). Tax is computed via `POST /api/tax/preview` for the
 * booking's listing+user country combo. Falls back to no tax if API fails or
 * no fee shown by web for the same context.
 *
 * Prices localized via `useCurrency().format(amount, listingCurrency)`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { HapticTouchable as TouchableOpacity } from './HapticTouchable';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useRouter } from 'expo-router';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import { Colors } from '../constants/colors';
import useCurrency from '../hooks/useCurrency';

const SCREEN_H = Dimensions.get('window').height;

interface BookingSheetProps {
  visible: boolean;
  onClose: () => void;
  listing: any;
}

function isoDateRegex(d: string) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

export default function BookingSheet({ visible, onClose, listing }: BookingSheetProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { format } = useCurrency();
  const insets = useSafeAreaInsets();

  // Swipe-down to dismiss — pan only the grabber/header zone so the
  // body's ScrollView keeps working normally. Threshold: 100 px or
  // velocity > 0.5.
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 100 || g.vy > 0.5) {
          Animated.timing(translateY, { toValue: SCREEN_H, duration: 200, useNativeDriver: true })
            .start(() => { translateY.setValue(0); onClose(); });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        }
      },
    }),
  ).current;
  // Reset slide-position whenever the sheet reopens.
  useEffect(() => { if (visible) translateY.setValue(0); }, [visible, translateY]);

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [date, setDate] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [participants, setParticipants] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tax, setTax] = useState<{ gst_amount?: number; tcs_amount?: number; total_tax?: number; rate_percent?: number; gst_label?: string } | null>(null);
  const [taxAck, setTaxAck] = useState(true); // checkbox; required when tax > 0

  const maxPerBooking = listing?.max_per_booking || 6;
  const unitPrice = Number(listing?.price || 0);
  const sourceCcy = listing?.currency || 'USD';
  const subtotal = unitPrice * participants;

  const quickDates = useMemo(() => [3, 7, 14, 30].map((n) => plusDaysISO(n)), []);

  // Reset on open
  useEffect(() => {
    if (!visible || !listing?.id) return;
    setErrorMsg(null);
    setDateError(null);
    setSubmitting(false);
    if (!date) setDate(plusDaysISO(7));
    setLoadingAvail(true);
    api.get(`/listings/${listing.id}/availability`)
      .then((res) => setAvailableDates(res.data?.available_dates || []))
      .catch(() => setAvailableDates([]))
      .finally(() => setLoadingAvail(false));
  }, [visible, listing?.id]);

  // Compute tax preview whenever listing or participants change.
  useEffect(() => {
    if (!visible || !listing?.id) { setTax(null); return; }
    let cancel = false;
    (async () => {
      try {
        const res = await api.post('/tax/preview', {
          listing_id: listing.id,
          base_amount: subtotal,
          participants,
          customer_country: user?.location_country || listing?.country,
        }).catch(() => ({ data: null }));
        if (cancel) return;
        const d = res?.data;
        if (d && (d.gst_amount || d.total_tax || d.tcs_amount)) {
          setTax({
            gst_amount: d.gst_amount || 0,
            tcs_amount: d.tcs_amount || 0,
            total_tax: d.total_tax || (d.gst_amount || 0) + (d.tcs_amount || 0),
            rate_percent: d.rate_percent,
            gst_label: d.gst_label || 'GST',
          });
        } else {
          setTax(null);
        }
      } catch {/* silent */}
    })();
    return () => { cancel = true; };
  }, [visible, listing?.id, subtotal, participants, user?.location_country]);

  const validateDate = (d: string) => {
    if (!isoDateRegex(d)) return 'Use YYYY-MM-DD format';
    if (d < todayISO()) return 'Date must be today or later';
    return null;
  };

  const handleConfirm = async () => {
    setErrorMsg(null);
    const dErr = validateDate(date);
    if (dErr) { setDateError(dErr); return; }
    setDateError(null);
    if (!user) { onClose(); router.push('/welcome'); return; }
    if (tax && (tax.total_tax || 0) > 0 && !taxAck) {
      setErrorMsg('Please acknowledge the tax breakdown to continue.');
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
      // Best-effort booking-level GST acknowledgment.
      if (bookingId && tax && (tax.total_tax || 0) > 0) {
        api.post('/tax/booking-acknowledgment', {
          booking_id: bookingId, acknowledged: true,
        }).catch(() => {/* silent */});
      }
      onClose();
      setNotes('');
      setParticipants(1);
      router.push({ pathname: '/booking/confirmation', params: { bookingId } });
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Booking failed.';
      setErrorMsg(typeof msg === 'string' ? msg : 'Booking failed.');
    } finally { setSubmitting(false); }
  };

  const grandTotal = subtotal + (tax?.total_tax || 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <TouchableOpacity activeOpacity={1} style={styles.backdropTap} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { marginTop: insets.top + 12, transform: [{ translateY }] },
          ]}
          testID="booking-sheet"
        >
          <View {...panResponder.panHandlers} style={styles.grabZone}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={1}>
                Book {listing?.title || listing?.name || 'Experience'}
              </Text>
              <TouchableOpacity onPress={onClose} testID="booking-sheet-close">
                <Icon name="close" size={24} color={Colors.slate600} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateInputRow}>
              <Icon name="calendar-outline" size={18} color={Colors.slate500} />
              <TextInput style={styles.dateInput} value={date}
                onChangeText={(v) => { setDate(v); setDateError(null); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.slate400}
                autoCapitalize="none" autoCorrect={false}
                testID="booking-date-input" />
            </View>
            {dateError && <Text style={styles.fieldError}>{dateError}</Text>}

            <View style={styles.quickDateRow}>
              {quickDates.map((qd) => (
                <TouchableOpacity key={qd}
                  style={[styles.quickDateChip, date === qd && styles.quickDateChipActive]}
                  onPress={() => { setDate(qd); setDateError(null); }}
                  testID={`booking-quick-${qd}`}>
                  <Text style={[styles.quickDateText, date === qd && styles.quickDateTextActive]}>
                    {new Date(qd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                    <TouchableOpacity key={ad}
                      style={[styles.availChip, date === ad && styles.availChipActive]}
                      onPress={() => setDate(ad)}>
                      <Text style={[styles.availChipText, date === ad && styles.availChipTextActive]}>{ad}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.helper}>On-demand operator — pick any date and they will confirm.</Text>
            )}

            <Text style={[styles.label, { marginTop: 22 }]}>Divers</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={[styles.stepBtn, participants <= 1 && styles.stepBtnDisabled]}
                onPress={() => setParticipants(Math.max(1, participants - 1))}
                disabled={participants <= 1}
                testID="booking-participants-minus">
                <Icon name="remove" size={20} color={Colors.slate900} />
              </TouchableOpacity>
              <Text style={styles.stepValue} testID="booking-participants-value">{participants}</Text>
              <TouchableOpacity style={[styles.stepBtn, participants >= maxPerBooking && styles.stepBtnDisabled]}
                onPress={() => setParticipants(Math.min(maxPerBooking, participants + 1))}
                disabled={participants >= maxPerBooking}
                testID="booking-participants-plus">
                <Icon name="add" size={20} color={Colors.slate900} />
              </TouchableOpacity>
              <Text style={styles.stepHelper}>up to {maxPerBooking}</Text>
            </View>

            <Text style={[styles.label, { marginTop: 22 }]}>Notes (optional)</Text>
            <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes}
              placeholder="Any requests, certs, gear sizing…"
              placeholderTextColor={Colors.slate400}
              multiline numberOfLines={3} testID="booking-notes-input" />

            {/* Price breakdown */}
            <View style={styles.summary} testID="booking-summary">
              <SumRow label={`${format(unitPrice, sourceCcy)} × ${participants}`} value={format(subtotal, sourceCcy)} />
              {tax && (tax.gst_amount || 0) > 0 ? (
                <SumRow label={`${tax.gst_label || 'GST'}${tax.rate_percent ? ` (${tax.rate_percent}%)` : ''}`}
                  value={format(tax.gst_amount || 0, sourceCcy)} testID="booking-row-gst" />
              ) : null}
              {tax && (tax.tcs_amount || 0) > 0 ? (
                <SumRow label="TCS" value={format(tax.tcs_amount || 0, sourceCcy)} testID="booking-row-tcs" />
              ) : null}
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 6, paddingTop: 6 }}>
                <SumRow label="Total" value={format(grandTotal, sourceCcy)} bold testID="booking-row-total" />
              </View>
            </View>

            {tax && (tax.total_tax || 0) > 0 ? (
              <TouchableOpacity onPress={() => setTaxAck((v) => !v)} style={styles.ackRow} testID="booking-tax-ack">
                <View style={[styles.ackBox, taxAck && styles.ackBoxActive]}>
                  {taxAck ? <Icon name="checkmark" size={12} color={Colors.white} /> : null}
                </View>
                <Text style={styles.ackText}>
                  I understand the booking total includes applicable {tax.gst_label || 'GST'} and acknowledge the tax breakdown shown above.
                </Text>
              </TouchableOpacity>
            ) : null}

            {errorMsg && (
              <View style={styles.errorBox} testID="booking-error">
                <Icon name="alert-circle" size={16} color={Colors.accent} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={submitting}
              testID="booking-confirm-btn">
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.confirmText}>
                  {user ? `Confirm · ${format(grandTotal, sourceCcy)}` : 'Sign in to book'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SumRow({ label, value, bold, testID }: { label: string; value: string; bold?: boolean; testID?: string }) {
  return (
    <View style={styles.summaryRow} testID={testID}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', color: Colors.slate900, fontSize: 15 }]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontSize: 18, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Card-on-card stack: the backdrop dim is light (rgba 0,0,0,0.15) so
  // the listing is still readable through the bezel above the sheet.
  // The sheet is positioned 12 px below the safe-area top via inline
  // `marginTop: insets.top + 12` so the listing peeks above.
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    flex: 1,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  grabZone: { paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.slate200, marginVertical: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.slate900, marginRight: 12 },
  body: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.slate700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
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
  summary: { marginTop: 22, padding: 14, borderRadius: 12, backgroundColor: Colors.slate50, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: Colors.slate600, fontWeight: '600' },
  summaryValue: { fontSize: 13, color: Colors.slate900, fontWeight: '700' },
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  ackBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.slate400, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ackBoxActive: { backgroundColor: Colors.cyan500, borderColor: Colors.cyan500 },
  ackText: { flex: 1, fontSize: 11, color: '#92400e', lineHeight: 15 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 13, color: Colors.accent },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: Colors.white },
  confirmBtn: { backgroundColor: Colors.cyan400, paddingVertical: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
