/**
 * Cold-launch root route.
 *
 * Behaviour (decided by token state):
 *   • Authenticated (or biometric-enabled) → router.replace into the
 *     appropriate destination. The redirect happens in _layout.tsx's
 *     useEffect (it watches `token`, `biometricEnabled`, `guestMode`,
 *     and `segments`).
 *   • Unauthenticated → render <WelcomeView /> INLINE. This is the
 *     critical distinction vs the previous design that pushed
 *     /welcome from _layout.tsx: an inline render has no Stack
 *     animation, so cold launch shows welcome instantly with no
 *     slide and no double-mount flash.
 *
 * In-app navigation to /welcome (e.g. listing → Sign in prompt)
 * still uses the dedicated /welcome route, which IS animated
 * (slide_from_bottom) because it's pushed onto the stack.
 *
 * While auth state is still hydrating we render an empty white View
 * so the user sees a blank canvas (matches WelcomeView's bg) rather
 * than briefly-rendered tabs.
 */
import React from 'react';
import { View } from 'react-native';
import useAuthStore from '../src/stores/authStore';
import useUIStore from '../src/stores/uiStore';
import WelcomeView from '../src/screens/WelcomeView';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const authLoading = useAuthStore((s) => s.loading);
  const guestMode = useUIStore((s) => s.guestMode);

  if (authLoading) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  // Authenticated or guest-mode: _layout.tsx's useEffect handles the
  // replace into /(tabs) (or /biometric-resume). Render a blank
  // canvas in the meantime — the redirect happens in the same tick.
  if (token || guestMode) {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  // Unauthenticated cold launch: render welcome INLINE — no slide.
  return <WelcomeView />;
}
