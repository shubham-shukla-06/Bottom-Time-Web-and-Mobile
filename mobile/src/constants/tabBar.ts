/**
 * Tab bar geometry — shared constants.
 *
 * Single source of truth for the floating-pill tab bar dimensions used by
 * `app/(tabs)/_layout.tsx`. Hoisted here so other tab screens can compute
 * their bottom content padding without magic-numbering the tab bar height
 * or duplicating the import path.
 *
 * `TAB_BAR_HEIGHT`     — fixed pill height. Used for translateY hide-anim
 *                        and downstream content padding.
 * `TAB_BAR_SIDE_INSET` — horizontal inset from screen edges to the pill
 *                        (matches Discover's search-row chrome).
 *
 * For tab-screen content (ScrollView / FlatList contentContainerStyle),
 * the correct paddingBottom is:
 *     TAB_BAR_HEIGHT + insets.bottom + 24
 * (24 = breathing room between the last content row and the pill top).
 */
export const TAB_BAR_HEIGHT = 60;
export const TAB_BAR_SIDE_INSET = 14;
