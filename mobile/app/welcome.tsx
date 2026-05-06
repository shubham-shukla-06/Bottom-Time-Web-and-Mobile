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
  View, Text, ImageBackground, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Platform, Easing,
  useWindowDimensions, Animated, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import api from '../src/api/client';
import useAuthStore from '../src/stores/authStore';
import useUIStore from '../src/stores/uiStore';
import { Colors } from '../src/constants/colors';

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
const AppleMark = ({ size = 22 }: { size?: number }) => (
  <Ionicons name="logo-apple" size={size} color="#000" />
);

interface Slide { id: string; title: string; image: string; subtitle: string; }

const FALLBACK_SLIDES: Slide[] = [
  { id: 'fb1', title: 'Liveaboard in Maldives', subtitle: 'From $1,290 · Maldives', image: 'https://images.unsplash.com/photo-1559825481-12a05cc00344?w=1200&q=70' },
  { id: 'fb2', title: 'Open Water Course in Bali', subtitle: 'From $349 · Indonesia', image: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=1200&q=70' },
  { id: 'fb3', title: 'Reef Day Trip · Great Barrier Reef', subtitle: 'From $189 · Australia', image: 'https://images.unsplash.com/photo-1582967788606-a171c1080cb0?w=1200&q=70' },
  { id: 'fb4', title: 'Cenote Cave Diving · Tulum', subtitle: 'From $230 · Mexico', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1200&q=70' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const setGuest = useUIStore((s) => s.setGuestMode);
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const HERO_H = Math.round(SCREEN_H * 0.6);
  // Fixed-height bottom sheet that floats over the carousel — large enough
  // to fit title + email + Continue + 3 social pills + 2-line legal.
  const SHEET_H = Math.min(350, Math.max(290, Math.round(SCREEN_H * 0.5) - 10));

  const [slides, setSlides] = useState<Slide[]>(FALLBACK_SLIDES);
  const [activeIdx, setActiveIdx] = useState(0);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | 'microsoft' | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const flatRef = useRef<FlatList<Slide>>(null);

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

  // Load top-rated listings for the carousel.
  useEffect(() => {
    let alive = true;
    api.get('/listings?limit=6&sort_by=top_rated')
      .then((res) => {
        if (!alive) return;
        const items = res.data?.listings || res.data || [];
        if (Array.isArray(items) && items.length) {
          const mapped: Slide[] = items.slice(0, 5).map((l: any) => ({
            id: String(l.id),
            title: l.title || l.name || 'Dive experience',
            subtitle: `From $${Math.round(l.price || 0)} · ${l.country || l.location || 'Worldwide'}`,
            image: l.photos?.[0]?.url || l.images?.[0] || l.image_url || FALLBACK_SLIDES[0].image,
          }));
          if (mapped.length) setSlides(mapped);
        }
      })
      .catch(() => {/* keep fallback */});
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
        const { startAppleSignIn } = await import('../src/utils/oauth');
        const r = await startAppleSignIn();
        if (r.status === 'cancelled') return;
        if (r.status === 'unsupported' || r.status === 'error') {
          setErrMsg(r.error || 'Apple sign-in coming soon — please use email or Google for now.');
          return;
        }
        if (r.status === 'logged_in' && r.access_token && r.user) {
          await login(r.access_token, r.user);
          router.replace('/(tabs)');
        }
        return;
      }
      const oauth = await import('../src/utils/oauth');
      const r = provider === 'google' ? await oauth.startGoogleSignIn() : await oauth.startMicrosoftSignIn();
      if (r.status === 'cancelled') return;
      if (r.status === 'unsupported') {
        setErrMsg(`${provider === 'google' ? 'Google' : 'Microsoft'} sign-in not available in Expo Go. Please use email.`);
        return;
      }
      if (r.status === 'error') { setErrMsg(r.error || 'Sign-in failed'); return; }
      if (r.status === 'logged_in' && r.access_token && r.user) {
        await login(r.access_token, r.user);
        router.replace('/(tabs)');
      } else if (r.status === 'needs_setup') {
        router.push({ pathname: '/signup', params: { email: r.email || '', name: r.name || '' } });
      }
    } catch (e: any) {
      setErrMsg(e?.message || 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  };

  const skip = () => {
    setGuest(true);
    router.replace('/(tabs)');
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
          renderItem={({ item }) => (
            <ImageBackground source={{ uri: item.image }} style={[styles.slide, { width: SCREEN_W, height: SCREEN_H }]} resizeMode="cover">
              <View style={[styles.slideText, { bottom: SHEET_H + 70 }]}>
                <View style={styles.slideChip}>
                  <Text style={styles.slideChipText}>{item.subtitle}</Text>
                </View>
                <Text style={styles.slideTitle} numberOfLines={2}>{item.title}</Text>
              </View>
            </ImageBackground>
          )}
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

          {/* Social row */}
          <View style={styles.socialRow}>
            <SocialBtn width={socialBtnWidth} loading={busy === 'google'} disabled={!!busy} onPress={() => onSocial('google')} testID="welcome-social-google">
              <GoogleMark />
            </SocialBtn>
            {showApple ? (
              <SocialBtn width={socialBtnWidth} loading={busy === 'apple'} disabled={!!busy} onPress={() => onSocial('apple')} testID="welcome-social-apple">
                <AppleMark />
              </SocialBtn>
            ) : null}
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
  slideText: { paddingHorizontal: 24, position: 'absolute', left: 0, right: 0 },
  slideChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 10 },
  slideChipText: { fontSize: 11, fontWeight: '600', color: Colors.white, fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_600SemiBold', letterSpacing: 0.2 },
  slideTitle: { fontSize: 26, fontWeight: '700', color: Colors.white, lineHeight: 32, fontFamily: Platform.OS === 'web' ? 'Outfit, sans-serif' : 'Outfit_700Bold' },

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
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
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
    height: 52, paddingHorizontal: 24, fontSize: 15, color: Colors.slate900,
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
