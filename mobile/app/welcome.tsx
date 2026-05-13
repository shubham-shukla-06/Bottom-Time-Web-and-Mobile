/**
 * Welcome route — thin wrapper.
 *
 * The full welcome/login screen content lives in
 * `src/screens/WelcomeView.tsx` (moved out of this file on
 * 2026-05-13) so it can be rendered by BOTH:
 *
 *   • `app/welcome.tsx`  (this file) — pushed in-app from
 *     listing/[id]'s "Sign in" prompt. Stack.Screen config in
 *     `_layout.tsx` sets `presentation: 'fullScreenModal'` with
 *     `animation: 'slide_from_bottom'` so it slides up over the
 *     listing modal and slides DOWN on Skip / login success
 *     (native-stack reverse).
 *
 *   • `app/index.tsx` — cold-launch unauthenticated entry. Renders
 *     the SAME view INLINE (no Stack push), so there's no slide
 *     animation on app launch.
 */
import React from 'react';
import WelcomeView from '../src/screens/WelcomeView';

export default function WelcomeRoute() {
  return <WelcomeView />;
}
