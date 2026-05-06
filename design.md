# Bottom Time — Design Rules (MANDATORY)

> **All agents (main + sub-agents) MUST read this file before writing any layout code.**
> These are platform-specific gotchas discovered the hard way. Violating any rule below will produce broken UI in production preview.

---

## Rule 1 — NEVER use `space-y-*` for vertical spacing between sibling cards/sections

### Why
The Emergent code-tracking transform wraps certain JSX expressions in **inline instrumentation `<span>` wrappers** at runtime. The patterns that get wrapped include (but are not limited to):

- React Fragment children: `<>...</>`
- Conditional rendering: `{cond && <Card />}`
- Component invocations rendered conditionally: `{cond ? <Card /> : null}`
- Sometimes plain component invocations like `<MyCard />`

Tailwind's `space-y-N` works by emitting `> * + * { margin-top: <N>; }`. When the sibling is an instrumentation `<span>` (which is `display: inline` by default), the browser **silently discards `margin-top`** — inline elements ignore vertical margins per CSS spec. Result: cards collapse against each other with zero visible gap, even though the class is on the parent and DevTools shows the rule applied.

### Visible symptom
Two `<div>` cards are direct siblings of a `space-y-6` parent in source code, but render flush against each other (0 px gap). DevTools shows `margin-top: 24px` computed on the child but the layout ignores it.

### The fix — use `flex flex-col gap-N` instead
```jsx
// ❌ BAD — silently breaks when any child is wrapped in an inline span
<div className="space-y-6">
  <Card1 />
  {cond && <Card2 />}     {/* wrapped in <span> → margin-top ignored */}
  <Card3 />
</div>

// ✅ GOOD — gap is enforced by the flex container, blockifies all children
<div className="flex flex-col gap-6">
  <Card1 />
  {cond && <Card2 />}     {/* still wrapped, but flex blockifies the span */}
  <Card3 />
</div>
```

Why `flex flex-col gap-N` works: flex items are *blockified* by the flex formatting context (display:inline → display:block for layout purposes), and `gap` is enforced at the **parent** level, not via per-child margins. The 24 px shows up regardless of child display type.

### When this rule applies
- ANY container that holds 2+ stacked sibling cards or sections.
- ANY container where one or more children are conditionally rendered (`{cond && ...}`, ternaries, mapped arrays with potential nulls).
- Dashboard layouts, settings pages, multi-section pages, modals with stacked sections.

### When `space-y-*` is acceptable
- Only inside a card, between **plain text/heading/inline elements** that are guaranteed never to be wrapped (no conditionals, no Fragments, no extracted components). Even then, prefer `flex flex-col gap-N` for safety.

---

## Rule 2 — NEVER use bare `<>` Fragments inside a layout container

### Why
React Fragments compile to runtime markers that the platform transform turns into a single inline `<span>` wrapper containing all the fragment's children. This collapses N children into 1 inline-display sibling — same root cause as Rule 1, with the additional consequence that **all** the fragment's children become positionally welded together, not just the conditional ones.

### Visible symptom
You wrote 3 sibling cards inside a `<>...</>` and only the first one gets the parent's margin/gap; the others render with no spacing.

### The fix — wrap fragment contents in an explicit layout div
```jsx
// ❌ BAD
{empty ? (
  <EmptyState />
) : (
  <>
    <StatsRow />
    <ByPlatformCard />
    <TopListingsCard />
  </>
)}

// ✅ GOOD
{empty ? (
  <EmptyState />
) : (
  <div className="flex flex-col gap-6">
    <StatsRow />
    <ByPlatformCard />
    <TopListingsCard />
  </div>
)}
```

---

## Rule 3 — Extract conditional cards into named sub-components

### Why
Inline `{cond && <div>...</div>}` is the most-aggressively-wrapped JSX pattern. Extracting the conditional into a sub-component that returns `null` when not needed gives you cleaner DOM and a stable layout slot.

### The pattern
```jsx
// ❌ BAD — inline conditional, gets wrapped, breaks spacing
<div className="flex flex-col gap-6">
  <Header />
  {scope === 'admin' && data.top_operators?.length > 0 && (
    <div className="bg-white p-5">...</div>
  )}
  {data.top_listings?.length > 0 && (
    <div className="bg-white p-5">...</div>
  )}
</div>

// ✅ GOOD — sub-component, parent JSX is clean, spacing is robust
function TopOperatorsCard({ data, scope }) {
  if (!(scope === 'admin' && data.top_operators?.length > 0)) return null;
  return <div className="bg-white p-5">...</div>;
}

function TopListingsCard({ data, scope }) {
  if (!(data.top_listings?.length > 0 && scope !== 'admin')) return null;
  return <div className="bg-white p-5">...</div>;
}

// Use as siblings:
<div className="flex flex-col gap-6">
  <Header />
  <TopOperatorsCard data={data} scope={scope} />
  <TopListingsCard data={data} scope={scope} />
</div>
```

This works for both `space-y-*` and `flex gap-*`, but you should **still prefer `flex gap-*`** for the parent (per Rule 1).

---

## Rule 4 — Reuse design-system components, never shadow them

### Why
Forking a design-system component (e.g. defining a local `StatCard` inside a tab when one already exists in `OperatorPrimitives.js`) causes silent visual divergence: different padding, border-radius, hover states across tabs of the same dashboard. This was the root cause of the original "Share Tracking stat cards look different" complaint.

### The rule
Before defining a new component named `Card`, `StatCard`, `Badge`, `Button`, `EmptyState`, etc., **grep the codebase**:

```bash
grep -rn "function StatCard\|export const StatCard\|const StatCard" /app/frontend/src/
```

If it already exists, **import and reuse it**. If you genuinely need a variant, prefer a `variant` prop on the canonical component over a fork.

---

## Rule 5 — Card hover treatment: cyan outline + soft shadow + 200 ms transition

For consistency across the app, every interactive/clickable card uses this exact hover treatment:

```jsx
className="bg-white border border-slate-100 hover:border-cyan-300 rounded-2xl p-5 hover:shadow-md transition-[box-shadow,border-color] duration-200"
```

Notes:
- `transition-[box-shadow,border-color]` (not `transition-all`) — `transition-all` is more expensive and can interfere with transforms.
- `duration-200` is the system default; use it everywhere.
- For stat-card style components, also wrap the icon in `group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-200` and put `group` on the parent.

---

## Rule 6 — Use the 4 / 8 / 12 / 16 / 24 / 32 spacing scale only

The Tailwind classes that map to this scale are: `gap-1` (4), `gap-2` (8), `gap-3` (12), `gap-4` (16), `gap-6` (24), `gap-8` (32). **Do not** invent intermediate values like `gap-5` or `mt-7` "to make it look right" — that's the symptom of a deeper layout issue (usually a violation of Rules 1–3).

If a `gap-6` container looks "too tight" or "too loose", the cause is almost always:
1. Inline-wrapped children (apply Rules 1–3)
2. Inconsistent internal `p-N` padding across sibling cards (use the same `p-5` on every card-of-card)
3. A heading using `mb-1 + p mb-4` instead of a single wrapper `<div className="mb-4">{heading}{intro}</div>`

---

## Rule 7 — Card heading + intro paragraph pattern

Always wrap a card's heading + optional intro paragraph in a single block with the spacing on the **wrapper**, not via `mb-X` on the heading itself. This keeps the heading→content gap identical across all cards.

```jsx
// ❌ BAD — gap depends on h3's mb-1 + p's height + p's mb-4 = unpredictable
<div className="bg-white p-5">
  <h3 className="text-sm font-bold mb-1">Title</h3>
  <p className="text-xs mb-4">Intro</p>
  {content}
</div>

// ✅ GOOD — gap is exactly mb-4 (16 px), heading + intro flow naturally
<div className="bg-white p-5">
  <div className="mb-4">
    <h3 className="text-sm font-bold">Title</h3>
    <p className="text-xs text-slate-400 mt-0.5">Intro</p>
  </div>
  {content}
</div>
```

---

## Rule 8 — `data-testid` on every interactive element and every user-facing data display

Required on: buttons, links, form inputs, dropdowns, modals, toasts, error/success messages, balance/count displays, status badges, and any element that shows data the user reads or acts on.

Naming: kebab-case, describe the function, not the styling. Use unique IDs per page/component. Example: `data-testid="share-dive-${id}"` not `data-testid="cyan-pill"`.

---

## Rule 9 — Use `modal={false}` on Radix Popover / DropdownMenu / Dialog inside forms, and NEVER use Radix `Select` for form fields

### Why
Radix UI dropdown primitives default to `modal={true}`. In modal mode they wrap their overlay in `react-remove-scroll`, which on open:
1. Sets `overflow: hidden` on `<body>`
2. Adds `padding-right: <scrollbar width>px` to `<body>` to prevent the content-area width from changing when the scrollbar disappears

**Problem with our layout:** `Navbar`, `Footer`, and most page containers use `max-w-[1600px] mx-auto`. When `<body>` gains 17 px of `padding-right`, the `mx-auto` container re-centers against the new (narrower) width → every centered element snaps ~8.5 px to the left for the duration the dropdown is open. Fixed-position elements like the scroll-to-top button stay anchored to the right, so they appear to shift relative to the content. **Net effect: the entire UI jumps every time a form dropdown opens.**

### `@radix-ui/react-select` is a trap — do NOT use it for form fields

Unlike `Dialog`, `Popover`, and `DropdownMenu`, **`Select` does not accept `modal={false}`**. It ALWAYS engages `react-remove-scroll`. You cannot disable the body padding-right injection. There is no prop, no CSS override, no workaround that avoids the shift without breaking the component.

For any `<select>`-style field in a form, use one of:
- **Native HTML `<select>` with a custom chevron** via `background-image` inline SVG (preferred — zero shift, zero dependency, OS picker is fine for most UIs).
- **Radix `DropdownMenu` with `modal={false}`** if you need more custom styling than a native select allows.

```jsx
// ❌ BAD — Radix Select always locks body scroll, always causes mx-auto shift
import { Select, SelectTrigger, ... } from '../components/ui/select';
<Select value={v} onValueChange={setV} modal={false}>  {/* modal prop is IGNORED */}
  ...
</Select>

// ❌ BAD — wrapping native <select> in <label> can interfere with click-to-open
//          on some Safari/Firefox builds. Also do NOT use background-image chevron
//          — `appearance: none` + bg-image can break the picker entirely.
<label>
  <span>Topic *</span>
  <select style={{ appearance: 'none', backgroundImage: 'url(...chevron...)' }}>
    ...
  </select>
</label>

// ✅ GOOD — plain div wrapper, absolute-positioned Lucide chevron with pointer-events:none
<div className="mb-4">
  <div className="text-xs font-semibold text-slate-700 mb-1.5">
    Topic <span className="text-rose-500">*</span>
  </div>
  <div className="relative">
    <select
      value={v}
      onChange={e => setV(e.target.value)}
      className="w-full h-11 pl-4 pr-10 bg-white border border-slate-200 rounded-lg text-sm cursor-pointer appearance-none"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown
      size={16}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
    />
  </div>
</div>
```

For non-Select Radix primitives (Popover hover cards, DropdownMenu action menus), `modal={false}` DOES work and is the correct choice inside forms.

### When `modal={true}` IS correct
- True modal Dialogs / AlertDialogs that need to block all outside interaction and trap focus.
- Auth modals, confirmation dialogs, full-screen sheets.

For these, use `modal={true}` (the default) — the scroll lock is desired behavior. The shift is masked by the modal overlay covering the page.

### Do NOT try to fix this by
- Adding `scrollbar-gutter: stable` to `<html>`. It becomes **additive** with Radix's own compensation (double-compensation → 34 px shift instead of 17). Only works if you've also disabled Radix's internal compensation, which isn't exposed as a prop on `Select`.
- Forcing `body { padding-right: 0 !important }` — breaks scroll-lock compensation for legitimate modal dialogs too.
- Removing `mx-auto` from the layout — treats the symptom, redesigns the whole layout system.
- Setting `modal={false}` on Radix `Select` — silently ignored, feels like it worked until you measure.

---

## Quick Self-Check Before Committing Layout Code

Before saying "spacing fixed", run through this checklist:

- [ ] Is the parent container `flex flex-col gap-N` (not `space-y-N`)?
- [ ] Are conditional siblings extracted into sub-components that return null?
- [ ] No bare `<>` Fragment wrapping multiple stacked siblings?
- [ ] All sibling cards use the same `p-5` (or whichever) padding consistently?
- [ ] Heading + intro inside cards wrapped in `<div className="mb-4">`?
- [ ] No design-system component shadowed by a local copy with different padding/radius?
- [ ] Hover treatment matches Rule 5 on every clickable card?
- [ ] All gap values are from the 4/8/12/16/24/32 scale?
- [ ] Every Radix `Select` / `Popover` / `DropdownMenu` inside a form has `modal={false}` (Rule 9)?

If any answer is "no", fix it before screenshotting.

---

## Real cases this file prevents

1. **Share Tracking tab — cards collapsed against each other**: `space-y-6` parent + `<>` Fragment + inline `{cond && <Card />}`. Fixed by Rules 1, 2, 3.
2. **Share Tracking tab — stat cards looked taller than Overview tab**: Local `StatCard` shadowed the canonical one with `p-4` instead of `p-3.5` and `justify-between` instead of `gap-2`. Fixed by Rule 4.
3. **Operator "My Listings" cards — inconsistent heights**: Conditional thumbnail rendering caused asymmetry between cards with/without photos. Fixed by always rendering a thumbnail (real image or placeholder).
4. **Operator dashboard — duplicate "Create Listing" CTA**: Top-level button + per-section button both existed. Fixed by removing the redundant one (single source of truth).
5. **Contact page form — entire UI jumped ~8 px left when Topic dropdown opened**: default `modal={true}` on Radix Select engaged `react-remove-scroll`, which added 17 px body padding-right, causing `mx-auto` content to re-center. Fixed by Rule 9 (`modal={false}`).

---

**Last updated:** Feb 2026
**Authority:** This file overrides any conflicting guidance in handoff summaries. Main agents must read it on startup and apply Rules 1–3 reflexively, without being asked.
