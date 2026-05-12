import React, { useEffect } from 'react';
import { Stack, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import useAuthStore from '../src/stores/authStore';
import useUIStore from '../src/stores/uiStore';

SplashScreen.preventAutoHideAsync().catch(() => {/* noop */});

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
    const AUTH_ROUTES = ['welcome', 'auth', 'signup', 'verify', 'biometric-resume'];
    const onAuthRoute = AUTH_ROUTES.includes(segments[0] as string);
    if (token) return; // already signed in
    if (!onAuthRoute) {
      if (biometricEnabled && segments[0] !== 'biometric-resume') {
        router.replace('/biometric-resume');
      } else if (!guestMode) {
        router.replace('/welcome');
      }
    }
  }, [fontsLoaded, authLoading, token, biometricEnabled, guestMode, segments, router]);

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="verify" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="biometric-resume" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="profile/security" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
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
    </>
  );
}
