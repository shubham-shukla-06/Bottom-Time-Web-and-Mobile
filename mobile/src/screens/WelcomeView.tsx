/**
 * 🔒 LOCKED — Mobile Auth Flow (approved 2026-05-06)
 *
 * This file is part of the locked welcome/auth flow. Do NOT modify
 * layout, animations, sheet height, or keyboard behavior without
 * explicit user approval. Critical pinned values:
 *   - SHEET_H cap 350 / min 290
 *   - VISIBLE_OPEN_TOP 180
 *   - ANIM_DURATION 200ms, Easing.out(Easing.cubic)
 *   - Sheet anchored bottom: 0, grows in height on keyboard
 *   - Pagination zIndex 1, Sheet zIndex 10
 *
 * Bug fixes only with explicit approval. See /app/memory/MOBILE_AUTH_LOCKED.md
 */

/**
 * Welcome / login splash — entry screen for unauthenticated users.
 *
 * Carousel slides auto-rotate every 4 s. The active pagination dot animates
 * a cyan progress bar (0 → 100 % over the slide duration) and resets on
 * manual swipe. Title is centered. Legal text is on two centered lines and
 * opens Terms / Privacy in an in-app browser via expo-web-browser.
 *
 * Continue tap branches on `POST /api/auth/login-init`:
 *   • 200 → existing account → send OTP → /verify
 *   • 404 → new account     → /signup (capture name + role + phone)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Platform, Easing,
  useWindowDimensions, Animated, Keyboard, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Icon from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useUIStore from '../stores/uiStore';
import { Colors } from '../constants/colors';
import { toast } from '../components/Toast';
import {
  isBiometricAvailable, getBiometricType, biometricLabel,
  type BiometricKind,
} from '../services/biometric';
import { isBiometricEnabled } from '../services/secureSession';
import { runPostLoginBiometricHook } from '../utils/postLoginBiometricHook';

const ROTATE_MS = 4000;
const TERMS_URL = 'https://project-scanner-44.preview.emergentagent.com/terms';
const PRIVACY_URL = 'https://project-scanner-44.preview.emergentagent.com/privacy';

const GoogleMark = ({ size = 22 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.5 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.7l6.2 5.2c-.4.4 6.5-4.7 6.5-14.9 0-1.3-.1-2.4-.4-3.5z" />
  </Svg>
);
const MicrosoftMark = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 23 23">
    <Path fill="#f25022" d="M1 1h10v10H1z" />
    <Path fill="#00a4ef" d="M1 12h10v10H1z" />
    <Path fill="#7fba00" d="M12 1h10v10H12z" />
    <Path fill="#ffb900" d="M12 12h10v10H12z" />
  </Svg>
);
const AppleMark = ({ size = 26 }: { size?: number }) => (
  <Icon name="logo-apple" size={size} color="#000" />
);

// A slide can be a bundled require()'d asset OR an admin-managed row from
// `GET /api/welcome-slides`. Both shapes converge on a `source` prop the
// renderer hands to `<Image contentFit="cover">` — no client-side
// focal-point or zoom math anymore (the server delivers an already-cropped
// JPEG matching the visible-area aspect, see backend/welcome_visible.py).
interface BundledSlide {
  kind: 'bundled';
  id: string;
  source: number;            // result of require(...)
  credit: string;
  show_attribution: true;
}

interface RemoteSlide {
  kind: 'remote';
  id: string;
  source: { uri: string };
  credit: string | null;
  show_attribution: boolean;
}

type Slide = BundledSlide | RemoteSlide;

// Baked-in 4-slide fallback — used on first paint (while the admin list
// loads) and whenever the server returns an empty list.
const FALLBACK_SLIDES: BundledSlide[] = [
  { kind: 'bundled', id: 'whale-sharks', source: require('../../assets/welcome/whale-sharks.jpg'), credit: 'Photo by Kevin Charit',    show_attribution: true },
  { kind: 'bundled', id: 'jellyfish',    source: require('../../assets/welcome/jellyfish.jpg'),    credit: 'Photo by Karan Karnik',    show_attribution: true },
  { kind: 'bundled', id: 'sea-turtle',   source: require('../../assets/welcome/sea-turtle.jpg'),   credit: 'Photo by Sercan Jenkins',  show_attribution: true },
  { kind: 'bundled', id: 'yellow-tang',  source: require('../../assets/welcome/yellow-tang.jpg'),  credit: 'Photo by Craig Lovelidge', show_attribution: true },
];

// Resolve the api client's baseURL (eg https://…/api) so we can turn the
// server-relative `image_url` ("/api/uploads/welcome/xxx.jpg") into a
// full URL expo-image can fetch.
function toAbsoluteUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  const base = (api.defaults?.baseURL || '').replace(/\/api\/?$/, '');
  // image_url already starts with /api/uploads/... — prefix host only.
  return `${base}${imageUrl}`;
}

export default function WelcomeView() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const setGuest = useUIStore((s) => s.setGuestMode);
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const HERO_H = Math.round(SCREEN_H * 0.6);
  // Fixed-height bottom sheet that floats over the carousel — large enough
  // to fit title + email + Continue + biometric pill + 3 social pills +
  // 2-line legal. Cap bumped 350 → 410 in Sixth Addendum (see
  // /app/memory/MOBILE_AUTH_LOCKED.md) to absorb the Face ID button
  // addition; floor stays at 290 and the SCREEN_H * 0.5 formula remains.
  const SHEET_H = Math.min(410, Math.max(290, Math.round(SCREEN_H * 0.5) - 10));

  const [slides, setSlides] = useState<Slide[]>(FALLBACK_SLIDES);
  const [activeIdx, setActiveIdx] = useState(0);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | 'microsoft' | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Biometric login button state — see "Biometric login" section below.
  // `bioAvailable` gates the button's visibility (only mounts when the OS
  // reports biometric hardware enrolled); `bioEnabled` flips the button
  // between active-tap-to-resume and muted-tap-to-explain. `noBioModal`
  // controls the small "No passkey on this device" sheet shown when a user
  // taps the muted button.
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioKind, setBioKind] = useState<BiometricKind>('generic');
  const [noBioModal, setNoBioModal] = useState(false);
  const flatRef = useRef<FlatList<Slide>>(null);

  // Load biometric capability + device-enrollment state on mount. Re-runs
  // on focus would be nice but the welcome screen doesn't have a useFocus
  // effect today — single-load on mount is sufficient since enrollment can
  // only happen elsewhere (verify / GlobalBiometricSheet) and after that
  // the user is navigated away from this screen.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    (async () => {
      const [avail, enab, kind] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
        getBiometricType(),
      ]);
      if (!alive) return;
      setBioAvailable(avail);
      setBioEnabled(enab);
      setBioKind(kind);
    })();
    return () => { alive = false; };
  }, []);

  // Animated progress driving the active pagination dot's inner cyan bar.
  const progress = useRef(new Animated.Value(0)).current;

  // Keyboard behaviour: sheet stays anchored to `bottom: 0`; its height grows
  // to (VISIBLE_OPEN_TOP + kbH) so the visible region above the keyboard is
  // exactly VISIBLE_OPEN_TOP px tall — just enough for title + email +
  // Continue. Social row + legal flow below and are obscured by the keyboard.
  // Snappy fixed 200ms ease-out cubic — overrides the OS keyboard duration.
  const VISIBLE_OPEN_TOP = 180;
  const ANIM_DURATION = 200;
  const ANIM_EASING = Easing.out(Easing.cubic);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const sheetHeight = useRef(new Animated.Value(SHEET_H)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: any) => {
      const kbH = e?.endCoordinates?.height || 0;
      setKeyboardVisible(true);
      Animated.timing(sheetHeight, {
        toValue: VISIBLE_OPEN_TOP + kbH,
        duration: ANIM_DURATION,
        easing: ANIM_EASING,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      Animated.timing(sheetHeight, {
        toValue: SHEET_H,
        duration: ANIM_DURATION,
        easing: ANIM_EASING,
        useNativeDriver: false,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom, sheetHeight, SHEET_H, ANIM_EASING]);

  // Fetch admin-managed welcome slides. On empty / error the fallback
  // set remains in place (initial state). The public payload is minimal —
  // server already cropped the JPEG to the visible-area aspect.
  useEffect(() => {
    let alive = true;
    api.get('/welcome-slides')
      .then((res) => {
        if (!alive) return;
        const rows = res.data?.slides;
        if (!Array.isArray(rows) || rows.length === 0) return;
        const mapped: RemoteSlide[] = rows.map((r: any) => ({
          kind: 'remote',
          id: String(r.id),
          source: { uri: toAbsoluteUrl(r.image_url) },
          credit: r.attribution_text ?? null,
          show_attribution: !!r.show_attribution,
        }));
        setSlides(mapped);
      })
      .catch(() => { /* keep fallback */ });
    return () => { alive = false; };
  }, []);

  // Auto-rotate carousel + drive progress animation each cycle.
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1, duration: ROTATE_MS, useNativeDriver: false,
    });
    anim.start();
    if (slides.length <= 1) return () => { anim.stop(); };
    const t = setTimeout(() => {
      setActiveIdx((cur) => {
        const next = (cur + 1) % slides.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, ROTATE_MS);
    return () => { clearTimeout(t); anim.stop(); };
  }, [activeIdx, slides.length, progress]);

  // Branch on Continue: existing user → /verify, new user → /signup.
  const onContinue = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setErrMsg('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setErrMsg(null);
    try {
      let exists = false;
      let phoneHint: string | undefined;
      try {
        const r = await api.post('/auth/login-init', { email: trimmed });
        exists = true;
        phoneHint = r.data?.phone_hint;
      } catch (e: any) {
        if (e?.response?.status === 404) exists = false;
        else throw e;
      }
      if (exists) {
        await api.post('/auth/send-otp', { identifier: trimmed });
        router.push({ pathname: '/verify', params: { email: trimmed, phone_hint: phoneHint || '' } });
      } else {
        router.push({ pathname: '/signup', params: { email: trimmed } });
      }
    } catch (e: any) {
      setErrMsg(e?.response?.data?.detail || 'Could not continue. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSocial = async (provider: 'google' | 'apple' | 'microsoft') => {
    if (busy) return;
    setBusy(provider);
    setErrMsg(null);
    try {
      if (provider === 'apple') {
        const { startAppleSignIn } = await import('../utils/oauth');
        const r = await startAppleSignIn();
        if (r.status === 'cancelled') return;
        if (r.status === 'unsupported' || r.status === 'error') {
          toast.error(r.error || 'Apple sign-in failed. Please try again or use email.');
          return;
        }
        if (r.status === 'logged_in' && r.access_token && r.user) {
          await login({
            access_token: r.access_token,
            user: r.user,
            refresh_token: r.refresh_token ?? undefined,
            session_id: r.session_id ?? undefined,
            refresh_expires_at: r.refresh_expires_at != null ? String(r.refresh_expires_at) : undefined,
          });
          // Post-login biometric-enrollment hook — fire-and-forget. Opens
          // the GlobalBiometricSheet (mounted at app root) above whatever
          // route we navigate to next when biometric hardware exists but
          // isn't yet enrolled.
          runPostLoginBiometricHook(false);
          // After login: if welcome was pushed on top of another
          // screen (e.g. listing/[id] → "Sign in required" → push
          // /welcome), pop back to it. Only fall back to /(tabs) for
          // the initial app-launch flow where /_layout reached us via
          // router.replace and there is no stack to go back to.
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)');
        } else if (r.status === 'needs_setup') {
          // Parity with Google/MS branch below + canonical web Apple flow
          // (WEB_APPLE_AUTH_LOCKED.md invariant #3): first-time Apple
          // users land on /signup carrying email + name from the Apple
          // identity-token claims, so the phone-OTP completion step can
          // finish account setup.
          router.push({ pathname: '/signup', params: { email: r.email || '', name: r.name || '' } });
        }
        return;
      }
      const oauth = await import('../utils/oauth');
      const r = provider === 'google' ? await oauth.startGoogleSignIn() : await oauth.startMicrosoftSignIn();
      if (r.status === 'cancelled') return;
      if (r.status === 'unsupported') {
        toast.error(`${provider === 'google' ? 'Google' : 'Microsoft'} sign-in not available in Expo Go. Please use email.`);
        return;
      }
      if (r.status === 'error') { toast.error(r.error || 'Sign-in failed'); return; }
      if (r.status === 'logged_in' && r.access_token && r.user) {
        await login({
          access_token: r.access_token,
          user: r.user,
          refresh_token: r.refresh_token ?? undefined,
          session_id: r.session_id ?? undefined,
          refresh_expires_at: r.refresh_expires_at != null ? String(r.refresh_expires_at) : undefined,
        });
        // Same post-login biometric-enrollment hook as the Apple branch
        // above — covers Google + Microsoft OAuth.
        runPostLoginBiometricHook(false);
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      } else if (r.status === 'needs_setup') {
        router.push({ pathname: '/signup', params: { email: r.email || '', name: r.name || '' } });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  };

  const skip = () => {
    setGuest(true);
    // Same dismiss-or-replace pattern as the login-success handlers
    // (welcome.tsx single-screen variant): if welcome was pushed on
    // top of another screen (e.g. listing/[id] → "Sign in" prompt
    // → push /welcome → user taps Skip), pop back to the caller
    // instead of replacing with a NEW (tabs) layer stacked on top
    // of the listing modal (which produced the 3-layer Discover-
    // on-listing-on-Discover stack). Falls back to replace for
    // initial app-launch flow where welcome is the root.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const onMomentumEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIdx(idx);
  };

  const showApple = Platform.OS === 'ios';
  const socialBtnCount = showApple ? 3 : 2;
  const gap = 8;
  const socialBtnWidth = useMemo(() => (SCREEN_W - 24 * 2 - gap * (socialBtnCount - 1)) / socialBtnCount, [SCREEN_W, socialBtnCount]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* Carousel — fills the WHOLE screen edge-to-edge behind the sheet */}
      <View style={StyleSheet.absoluteFill}>
        <FlatList
          ref={flatRef}
          data={slides}
          keyExtractor={(s) => s.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          renderItem={({ item }) => {
            // Visible-area height + a small bleed past the bottom edge so
            // the carousel image extends ≈28 px BEHIND the auth sheet's
            // rounded top corners. That way the corner radius cuts into
            // image, not flat white space (a visual nicety the design
            // calls for — restored 2026-05-12). The credit text still
            // sits at `bottom: 30` of the inner clip View so its absolute
            // position relative to the sheet top edge is unchanged.
            const SHEET_CORNER_RADIUS = 44;
            const visibleH = SCREEN_H - SHEET_H + SHEET_CORNER_RADIUS;
            // One-time diagnostic for the credit-rendering bug — confirms
            // each slide reaches the renderer with both attribution fields.
            // Keep it cheap (logs once per renderItem call which Flatlist
            // de-dupes via item recycling).
            if (__DEV__ && item.kind === 'remote') {
              console.log('[welcome] slide', {
                id: item.id,
                show_attribution: item.show_attribution,
                credit: item.credit,
              });
            }
            return (
              <View style={[styles.slide, { width: SCREEN_W, height: SCREEN_H }]}>
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: SCREEN_W,
                    height: visibleH,
                    overflow: 'hidden',
                    backgroundColor: '#0b1220',
                  }}
                >
                  <Image
                    source={item.source as any}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={300}
                    cachePolicy="memory-disk"
                    priority="high"
                  />
                  {/* Credit text MUST live inside the visible-area View so
                      it stacks above the absolute-fill Image on Android
                      (Android ignores JSX order for sibling z-stacking
                      without explicit elevation/zIndex). We bumped the
                      clip View 28 px below the sheet's top edge to let
                      image bleed behind the rounded corners — bumping
                      the credit `bottom` by the same 28 px keeps it
                      visually anchored 30 px above the sheet's top
                      edge, same vertical position as before. */}
                  {item.show_attribution && item.credit ? (
                    <Text
                      style={[styles.slideCredit, { bottom: 30 + SHEET_CORNER_RADIUS }]}
                      numberOfLines={1}
                    >
                      {item.credit}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />

        {/* Skip pill — glassmorphic, sits below the camera island */}
        <View style={[styles.skipPillWrap, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={skip} style={({ pressed }) => [pressed && { opacity: 0.8 }]} testID="welcome-skip-btn" hitSlop={10}>
            <BlurView intensity={40} tint="dark" style={styles.skipPill}>
              <Text style={styles.skipText}>Skip</Text>
            </BlurView>
          </Pressable>
        </View>

        {/* Animated pagination dots — hidden while the keyboard is open so
            they don't end up visually overlapping the expanded sheet. */}
        <View style={[styles.dotRow, { bottom: SHEET_H + 16, display: keyboardVisible ? 'none' : 'flex' }]} pointerEvents="none">
          {slides.map((_, i) => {
            const isActive = i === activeIdx;
            return (
              <View key={i} style={[styles.dot, isActive && styles.dotActive]}>
                {isActive ? (
                  <Animated.View
                    style={[
                      styles.dotProgress,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }) as any,
                      },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* Bottom auth sheet — absolutely positioned. On keyboard show, the
          sheet's `bottom` rises to keyboard top and `height` shrinks to 240
          (clipping social row + legal via overflow:hidden). */}
      <Animated.View
        style={[styles.sheet, { height: sheetHeight, overflow: 'hidden', zIndex: 10 }]}
      >
          <Text style={styles.sheetTitle}>Log in or sign up</Text>

          <View style={styles.inputWrap}>
            <TextInput
              value={email}
              onChangeText={(v: string) => { setEmail(v); setErrMsg(null); }}
              placeholder="Enter your email"
              placeholderTextColor={Colors.slate400}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              testID="welcome-email-input"
              onSubmitEditing={onContinue}
              returnKeyType="go"
            />
          </View>

          <Pressable
            onPress={onContinue}
            disabled={submitting}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }, submitting && { opacity: 0.7 }]}
            testID="welcome-continue-btn"
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </Pressable>

          {errMsg ? <Text style={styles.errMsg} testID="welcome-error">{errMsg}</Text> : null}

          {/* Biometric login button — mobile equivalent of the web passkey
              quick-sign-in. Renders only when the OS reports biometric
              hardware + enrolled OS-level credential (Face ID / Touch ID /
              Fingerprint). When `bioEnabled` is true (user has enrolled a
              biometric session on this device, `bt_biometric_enabled='1'`),
              tap routes to /biometric-resume which prompts the OS and
              exchanges the SecureStore refresh token for a fresh access
              token. When false, the button stays VISIBLE but muted; tap
              opens an explainer sheet so the user knows what to do next
              ("sign in via another method to enroll"). */}
          {bioAvailable ? (
            <Pressable
              onPress={() => {
                if (bioEnabled) router.push('/biometric-resume');
                else setNoBioModal(true);
              }}
              style={({ pressed }) => [
                styles.bioBtn,
                !bioEnabled && styles.bioBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
              testID="welcome-biometric-btn"
            >
              {bioKind === 'face' ? (
                <ScanFace
                  size={20}
                  color={bioEnabled ? Colors.slate900 : Colors.slate500}
                  strokeWidth={1.8}
                />
              ) : (
                <Fingerprint
                  size={20}
                  color={bioEnabled ? Colors.slate900 : Colors.slate500}
                  strokeWidth={1.8}
                />
              )}
              <Text
                style={[
                  styles.bioBtnText,
                  !bioEnabled && styles.bioBtnTextDisabled,
                ]}
                numberOfLines={1}
              >
                Sign in with {biometricLabel(bioKind)}
              </Text>
            </Pressable>
          ) : null}

          {/* Social row — alphabetical: Apple → Google → Microsoft */}
          <View style={styles.socialRow}>
            {showApple ? (
              <SocialBtn width={socialBtnWidth} loading={busy === 'apple'} disabled={!!busy} onPress={() => onSocial('apple')} testID="welcome-social-apple">
                <AppleMark />
              </SocialBtn>
            ) : null}
            <SocialBtn width={socialBtnWidth} loading={busy === 'google'} disabled={!!busy} onPress={() => onSocial('google')} testID="welcome-social-google">
              <GoogleMark />
            </SocialBtn>
            <SocialBtn width={socialBtnWidth} loading={busy === 'microsoft'} disabled={!!busy} onPress={() => onSocial('microsoft')} testID="welcome-social-microsoft">
              <MicrosoftMark />
            </SocialBtn>
          </View>

          {/* Legal — two centered lines */}
          <View style={styles.legalWrap} testID="welcome-legal">
            <Text style={styles.legalLine}>By continuing, you agree to our</Text>
            <View style={styles.legalLinkRow}>
              <Text style={styles.legalLink} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {/* silent */})}>
                Terms of Service
              </Text>
              <Text style={styles.legalSep}>  ·  </Text>
              <Text style={styles.legalLink} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {/* silent */})}>
                Privacy Policy
              </Text>
            </View>
          </View>
      </Animated.View>

      {/* "No passkey on this device" modal — fires when the muted biometric
          button is tapped (i.e. hardware exists but `bt_biometric_enabled`
          is unset). Single OK button dismisses; no destructive action. */}
      <Modal
        visible={noBioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setNoBioModal(false)}
      >
        <View style={styles.noBioBackdrop}>
          <View style={styles.noBioCard} testID="welcome-no-passkey-sheet">
            <Text style={styles.noBioTitle}>No passkey on this device</Text>
            <Text style={styles.noBioBody}>
              Sign in via another method to enroll a passkey on this device.
            </Text>
            <Pressable
              onPress={() => setNoBioModal(false)}
              style={({ pressed }) => [styles.noBioOk, pressed && { opacity: 0.85 }]}
              testID="welcome-no-passkey-ok"
            >
              <Text style={styles.noBioOkText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SocialBtn({ width, loading, disabled, onPress, testID, children }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.socialBtn,
        { width },
        pressed && { backgroundColor: Colors.slate50 },
        disabled && !loading && { opacity: 0.5 },
      ]}
      testID={testID}
    >
      {loading ? <ActivityIndicator size="small" color={Colors.slate700} /> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  carouselWrap: { width: '100%', position: 'relative', backgroundColor: '#0b1220' },
  slide: { justifyContent: 'flex-end' },
  slideCredit: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
    letterSpacing: 0.1,
  },

  skipPillWrap: { position: 'absolute', right: 16, zIndex: 20 },
  skipPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 9999, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  skipText: { color: '#ffffff', fontSize: 13, fontWeight: '600', fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold' },

  dotRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5, zIndex: 1,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.32)', overflow: 'hidden',
  },
  dotActive: { width: 32, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.32)' },
  dotProgress: { height: '100%', backgroundColor: Colors.cyan400, borderRadius: 999 },

  // Sheet — absolutely positioned bottom card that floats over the carousel.
  // Carousel image is visible behind the rounded top corners.
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.white,
    paddingTop: 24, paddingHorizontal: 24, paddingBottom: 28,
    borderTopLeftRadius: 44, borderTopRightRadius: 44,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: -6 }, elevation: 14,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700', color: Colors.slate900, marginBottom: 14,
    textAlign: 'center', alignSelf: 'center',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },

  inputWrap: {
    height: 52, borderRadius: 9999,
    backgroundColor: Colors.slate50,
    borderWidth: 1, borderColor: Colors.slate200,
    marginBottom: 12, justifyContent: 'center',
  },
  input: {
    height: 52, paddingHorizontal: 24, fontSize: 15, color: Colors.slate900, textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_400Regular',
  },
  primaryBtn: {
    height: 52, borderRadius: 9999, backgroundColor: Colors.cyan400,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  primaryBtnText: {
    color: Colors.white, fontSize: 16, fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },
  errMsg: { color: Colors.accent, fontSize: 12, marginBottom: 10, textAlign: 'center' },

  socialRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  socialBtn: {
    height: 52, borderRadius: 9999, borderWidth: 1, borderColor: Colors.slate200,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },

  // Biometric login button — sits between the primary CTA and the social
  // row. Slim 44 px pill (the sheet is height-locked at 290-350 so this
  // intentionally leaves the legal text snug at the bottom). Disabled
  // state uses opacity 0.55 + slate-300 fill per Phase-3 brief.
  bioBtn: {
    height: 44, borderRadius: 9999,
    borderWidth: 1, borderColor: Colors.slate200,
    backgroundColor: Colors.slate50,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    marginBottom: 12,
  },
  bioBtnDisabled: {
    backgroundColor: Colors.slate100,
    borderColor: Colors.slate200,
    opacity: 0.55,
  },
  bioBtnText: {
    fontSize: 14, fontWeight: '600', color: Colors.slate900,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },
  bioBtnTextDisabled: { color: Colors.slate500, fontWeight: '500' },

  // "No passkey on this device" modal — small centred card overlay.
  noBioBackdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)', paddingHorizontal: 32,
  },
  noBioCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
    width: '100%', maxWidth: 360,
    alignItems: 'center',
  },
  noBioTitle: {
    fontSize: 17, fontWeight: '700', color: Colors.slate900,
    textAlign: 'center', marginBottom: 8,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold',
  },
  noBioBody: {
    fontSize: 14, color: Colors.slate600, textAlign: 'center', lineHeight: 20,
    marginBottom: 18,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_400Regular',
  },
  noBioOk: {
    height: 44, paddingHorizontal: 32, borderRadius: 9999,
    backgroundColor: Colors.cyan500,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
  },
  noBioOkText: {
    color: Colors.white, fontSize: 15, fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold',
  },

  legalWrap: { alignItems: 'center', paddingHorizontal: 8 },
  legalLine: {
    fontSize: 11, color: Colors.slate500, textAlign: 'center', lineHeight: 16,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_400Regular',
  },
  legalLinkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  legalLink: {
    fontSize: 11, color: Colors.cyan500, textDecorationLine: 'underline', textAlign: 'center', lineHeight: 16,
    fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_500Medium',
  },
  legalSep: { fontSize: 11, color: Colors.slate500, lineHeight: 16 },
});

