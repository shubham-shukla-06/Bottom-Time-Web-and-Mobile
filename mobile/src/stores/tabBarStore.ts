/**
 * Shared tab-bar visibility store — Zomato-style hide-on-scroll.
 *
 * Every scrollable tab surface calls `useTabBarOnScroll()` and attaches
 * the returned `onScroll` handler. Internally it reports raw scroll Y
 * to this store, which:
 *   • Records `lastY` so we can compute direction (down vs up).
 *   • Hides the bar after the user has scrolled DOWN by `HIDE_DELTA`px
 *     beyond the last "settled" position.
 *   • Reveals the bar after the user has scrolled UP by `SHOW_DELTA`px.
 *   • Ignores micro-twitches under the threshold so a 1-px scroll
 *     wobble doesn't toggle the bar (Zomato uses this same heuristic).
 *   • Always reveals on `onScrollEndDrag` momentum reaching y ≤ 4 px
 *     so the bar is back at the top of every list.
 *
 * The tab `_layout.tsx` subscribes to `hidden` and drives the bar's
 * translateY + opacity through `Animated.Value`s.
 */
import { create } from 'zustand';

const HIDE_DELTA = 14;   // need 14px DOWN-swipe past the anchor to hide
const SHOW_DELTA = 8;    // 8px UP-swipe is enough to bring it back

interface TabBarState {
  hidden: boolean;
  /** Last Y the bar's visibility was "settled" at. */
  anchorY: number;
  setHidden: (next: boolean) => void;
  /** Report a new scroll Y from the active surface. */
  reportScrollY: (y: number) => void;
  /** Force-show. Used when a screen mounts / lists scroll to top. */
  reset: () => void;
}

export const useTabBarStore = create<TabBarState>((set, get) => ({
  hidden: false,
  anchorY: 0,
  setHidden: (next) => {
    if (get().hidden !== next) set({ hidden: next, anchorY: 0 });
  },
  reportScrollY: (y) => {
    const { hidden, anchorY } = get();
    // Near the top of any list — always reveal.
    if (y <= 4) {
      if (hidden) set({ hidden: false, anchorY: y });
      else set({ anchorY: y });
      return;
    }
    const delta = y - anchorY;
    if (!hidden && delta > HIDE_DELTA) {
      set({ hidden: true, anchorY: y });
    } else if (hidden && delta < -SHOW_DELTA) {
      set({ hidden: false, anchorY: y });
    } else if (Math.abs(delta) > 40) {
      // Long swipe in same direction — re-anchor so subsequent reversal
      // works on small-delta basis.
      set({ anchorY: y });
    }
  },
  reset: () => set({ hidden: false, anchorY: 0 }),
}));
