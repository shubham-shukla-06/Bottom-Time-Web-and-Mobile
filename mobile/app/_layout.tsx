import React, { useEffect } from 'react';
import { Stack, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import useAuthStore from '../src/stores/authStore';
import useUIStore from '../src/stores/uiStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GlobalBiometricSheet from '../src/components/auth/GlobalBiometricSheet';

SplashScreen.preventAutoHideAsync().catch(() => {/* noop */});

// Global fallback so every Text / TextInput that omits `fontFamily` renders
// in Outfit instead of the OS default. Applied at module load (before the
// first render) so the very first commit of every screen is already Outfit.
// Caller-supplied `fontFamily` still wins because RN's array-style merge
// preserves the original-style order; we prepend the default. Idempotent —
// running this block twice yields the same result, since we read whatever
// `defaultProps.style` already is and prepend the Outfit default once per
// process. The non-null assertions keep the typed defaultProps fields happy
// in TS strict mode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(RNText as any).defaultProps = (RNText as any).defaultProps || {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(RNText as any).defaultProps.style = [{ fontFamily: 'Outfit_400Regular' }, (RNText as any).defaultProps.style].flat().filter(Boolean);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(RNTextInput as any).defaultProps = (RNTextInput as any).defaultProps || {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(RNTextInput as any).defaultProps.style = [{ fontFamily: 'Outfit_400Regular' }, (RNTextInput as any).defaultProps.style].flat().filter(Boolean);

// React Navigation's `DefaultTheme.colors.background` is `rgb(242, 242, 242)`
// (= #f2f2f2 — the iOS grouped-table grey). React Navigation paints this
// inline on the per-screen container view, one ancestor above our screen
// component. It leaks through behind the white listing-detail-screen
// whenever a child's layer doesn't fully cover the scene wrapper (sticky
// CTA bar bleed-through, transform stacking contexts, home-indicator
// inset, etc.) — visible as the cream band the user reported.
//
// Surgical fix at the ACTUAL owner: provide a theme to `ThemeProvider`
// (which wraps the navigator) with `colors.background: '#ffffff'`. Single
// inline-style write at the OS-native ancestor, no per-screen shotgun.
const AppTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#ffffff' },
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser);
  const token = useAuthStore((s) => s.token);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const authLoading = useAuthStore((s) => s.loading);
  const guestMode = useUIStore((s) => s.guestMode);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    fetchCurrentUser();
    // Currency: restore user's last picked currency from secure storage and
    // fetch USD-base FX rates so `useCurrency.format` can actually convert
    // (without these, the picker would only swap the symbol — see
    // src/hooks/useCurrency.ts for the loading-state fallback).
    useUIStore.getState().hydrateCurrency();
    useUIStore.getState().fetchExchangeRates();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {/* noop */});
  }, [fontsLoaded]);

  // Redirect logic:
  //   • If we have a stored access token in storage → user lands in /(tabs).
  //   • Else, if biometric resume is enabled, route to /biometric-resume so
  //     the splash auto-prompts and exchanges the refresh token for a fresh
  //     access token. Falls through to /welcome on failure.
  //   • Else (and not in guest mode) → /welcome.
  // `signup`, `verify`, `auth`, and `biometric-resume` are auth-flow routes
  // and are whitelisted so the redirect doesn't bounce the user mid-flow.
  useEffect(() => {
    if (!fontsLoaded || authLoading) return;
    const AUTH_ROUTES = ['index', 'welcome', 'auth', 'signup', 'verify', 'biometric-resume'];
    const onAuthRoute = AUTH_ROUTES.includes(segments[0] as string)
      || segments.length === 0; // root '/' (the index route)
    if (token) return; // already signed in
    if (!onAuthRoute) {
      if (biometricEnabled && segments[0] !== 'biometric-resume') {
        router.replace('/biometric-resume');
      }
      // Note: previously we also did `router.replace('/welcome')`
      // here for the unauthenticated path. Now the navigator's
      // root route is `index`, which renders <WelcomeView /> INLINE
      // when there is no token — no slide animation on cold launch.
      // The in-app /welcome route still slides up when pushed from
      // listing/[id] etc. (see Stack.Screen below).
    }
  }, [fontsLoaded, authLoading, token, biometricEnabled, guestMode, segments, router]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <ThemeProvider value={AppTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            // CRITICAL for iOS native: `@react-navigation/native-stack`
            // (which expo-router uses on iOS) does NOT read its scene
            // background from the JS ThemeProvider — it has its own
            // `contentStyle` that defaults to the platform system grey
            // (#f2f2f7 / systemGroupedBackground on iOS). Without this
            // explicit override, the iOS native screen wrapper paints
            // grey behind our content, visible behind the "You might
            // also like" rail and beneath the sticky CTA bar whenever
            // the screen's white container doesn't fully cover the
            // scene (transforms, home-indicator inset, shadow alpha).
            contentStyle: { backgroundColor: '#ffffff' },
          }}
        >
        {/* Cold-launch entry. Renders <WelcomeView /> INLINE (see
            app/index.tsx) when unauthenticated — no slide animation
            on app launch. animation:'none' on the route itself so
            the index mount is instantaneous. */}
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen
          name="welcome"
          options={{
            headerShown: false,
            // In-app entry path (e.g. listing/[id] → "Sign in" prompt
            // pushes /welcome). fullScreenModal covers the viewport
            // 100%; slide_from_bottom animates it up and — on Skip /
            // login success — DOWN (native-stack reverse). Cold-
            // launch unauthenticated users no longer hit this route:
            // the navigator's root `index` renders <WelcomeView />
            // inline, so the slide animation is in-app-only.
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: '#ffffff' },
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="signup" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="verify" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="biometric-resume" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="profile/security" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="listing/[id]"
          options={{
            headerShown: false,
            // Listing detail is a MODAL SHEET presented OVER Discover.
            // `transparentModal` keeps the previous screen (Discover)
            // mounted and visible behind, so the pull-to-dismiss
            // gesture can scale + translate the listing card down and
            // reveal Discover underneath. `slide_from_bottom` gives
            // the modal-feel entry animation. `contentStyle: { ...
            // backgroundColor: 'transparent' }` is CRITICAL — without
            // it the navigator paints its own opaque scene background
            // and Discover would be hidden during dismiss.
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            // Tighten enter/exit so the navigator's own exit animation
            // is short and overlaps cleanly with the PanResponder's
            // 150 ms pullY translate — eliminates the previous freeze
            // gap between "card off-screen" and "Discover visible".
            animationDuration: 200,
            // Disable native iOS swipe-from-edge dismiss — we own
            // dismiss entirely via the PanResponder on the card.
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="my-bookings" options={{ headerShown: false }} />
        <Stack.Screen name="booking/confirmation" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="dive-log/new" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="dive-log/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="dive-planner" options={{ headerShown: false }} />
        <Stack.Screen name="surface-log/index" options={{ headerShown: false }} />
        <Stack.Screen name="surface-log/new" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="messages" options={{ headerShown: false }} />
        <Stack.Screen name="thread/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="thread/[userId]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ headerShown: false }} />
        <Stack.Screen name="checkout" options={{ headerShown: false }} />
        <Stack.Screen name="order-confirmation" options={{ headerShown: false }} />
        <Stack.Screen name="orders" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="wishlist" options={{ headerShown: false }} />
        <Stack.Screen name="bucket-list" options={{ headerShown: false }} />
        <Stack.Screen name="trips/index" options={{ headerShown: false }} />
        <Stack.Screen name="trips/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="marine-life/index" options={{ headerShown: false }} />
        <Stack.Screen name="marine-life/species/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="events/index" options={{ headerShown: false }} />
        <Stack.Screen name="destinations/index" options={{ headerShown: false }} />
        <Stack.Screen name="pathways/index" options={{ headerShown: false }} />
        <Stack.Screen name="operator/index" options={{ headerShown: false }} />
      </Stack>
      {/* Global biometric-enrollment sheet. Mounted at the navigator root
          (NOT inside (tabs)/_layout, which is locked) so it overlays any
          post-login route. Visibility controlled by biometricPromptStore,
          opened by runPostLoginBiometricHook(false) — see
          src/utils/postLoginBiometricHook.ts. */}
      <GlobalBiometricSheet />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
