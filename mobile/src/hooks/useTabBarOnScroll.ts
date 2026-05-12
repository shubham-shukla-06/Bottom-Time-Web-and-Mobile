/**
 * useTabBarOnScroll — attach to any scrollable surface (FlatList /
 * ScrollView / SectionList) to drive the global hide-on-scroll
 * behaviour of the tab bar.
 *
 *   const onScroll = useTabBarOnScroll();
 *   <FlatList onScroll={onScroll} scrollEventThrottle={16} ... />
 *
 * The hook returns a `useCallback`'d handler so consumers don't re-bind
 * on every render. It also fires `tabBarStore.reset()` on unmount so a
 * left-behind "hidden" state doesn't leak across tabs.
 */
import { useCallback, useEffect } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useTabBarStore } from '../stores/tabBarStore';

export default function useTabBarOnScroll() {
  const report = useTabBarStore((s) => s.reportScrollY);
  const reset = useTabBarStore((s) => s.reset);

  useEffect(() => {
    // Always show the bar when the screen mounts.
    reset();
    return () => reset();
  }, [reset]);

  return useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      report(e.nativeEvent.contentOffset.y);
    },
    [report],
  );
}
