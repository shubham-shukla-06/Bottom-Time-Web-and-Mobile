# Iteration 1 — Filter Panel (Zomato-parity)

## What was implemented
- **FilterPanel component** (`/app/frontend/src/components/FilterPanel.js`):
  - Slide-over dialog from right side of screen (640px max-width)
  - Two-pane layout: left rail (100px) with section icons + labels, right pane with filter options
  - Sections: Type (5 pills), Destination (7+ pills from API), Level (3 pills), Budget (dual-range slider), Dates (calendar picker)
  - Header: "Filters and sorting" + "Clear all" + close (X) button
  - Footer: "Close" + "Show results" (active only when filters selected)
  - Count badges on left rail icons showing active filter count per section
  - Active section indicator (cyan accent line on right edge of rail)
  - Keyboard accessible: Escape to close, backdrop click to close

- **Active Filter Chips** on Discover page:
  - Horizontal scrollable bar of cyan pills below search bar
  - Each chip shows filter label + X to remove
  - "Clear all" button at end
  - Filters button shows "Filters · N" count

- **Dual-range Budget Slider**:
  - Slider component updated to render multiple thumbs when value array passed
  - Budget section shows min-max range: $0 – $5000+
  - Currency display (non-editable, shows global currency)

- **Guest Gating**:
  - Non-authenticated users see only 6 listings
  - Gradient fade overlay + lock icon + "Log in to discover all listings" CTA card
  - Clicking CTA opens auth modal

## Mobile-to-web mapping decisions
| Mobile FilterSheet | Web FilterPanel |
|---|---|
| BottomSheet (slides up from bottom) | Slide-over panel (slides in from right) |
| PanResponder pull-down dismiss | Click backdrop or Escape to dismiss |
| Active filter chips (horizontal) | Same — horizontal scrollable bar |
| Rail icons + labels (vertical) | Same — 100px left rail |
| Dual-thumb slider (priceMin/priceMax) | Same — Radix Slider with dual thumbs |
| Calendar modal for dates | Inline calendar in Dates section |

## Dependencies installed
None — all dependencies already present (Radix Slider, react-day-picker, etc.)

## Known issues / deferred items
- Currency switching within the filter panel is display-only (global currency change happens at store level)
- Recently Viewed section was removed during refactor — could be re-added later
- Mobile has animated search placeholder cycling — not yet on web
