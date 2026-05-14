# WEB REGRESSIONS — LOCKED

Updated: 2026-05-14
Pinned commits producing the current state:
- `eec4785` — `web/onboarding: restore missing sonner toast import (fixes ReferenceError on validation + save)`
- `d8931fa` — `web/dive-log: repoint Navbar import to canonical components/Navbar (Dashboard.js orphan removed)`

Both fixes were ratified by the user after a function-level feature-diff audit
against the historical reference codebase at
`/tmp/bottom-time-source/Bottom-Time-main/`.

Locked by user directive. Any future agent MUST NOT modify the lines below
without explicit human permission for that specific change.

---

## Locked files & lines

### 1. `/app/frontend/src/pages/Onboarding.js` — toast import

**Required line (line 6, in the imports block):**
```js
import { toast } from 'sonner';
```

**Why this MUST remain**

`Onboarding.js` has four `toast.error(...)` / `toast.success(...)` call sites
in the user-flow code path:

| Line | Call | Trigger |
|---|---|---|
| 173 | `toast.error('Please make a selection');` | `handleNext()` when `canAdvance()` returns false |
| 182 | `toast.error('Please select your experience level first');` | `handleSubmit()` when experience is unset |
| 211 | `toast.success("You're all set!");` | successful save — fires before `navigate(dest)` |
| 222 | `toast.error(error.response?.data?.detail || 'Failed to save profile');` | save failure |

Without the `sonner` import, `toast` resolves to `undefined`, every call site
throws `ReferenceError: toast is not defined`, and crucially the success path
on line 211 short-circuits `navigate(dest)` so the user can never complete
onboarding even when the API call succeeds.

The import was historically present in the reference codebase. It was dropped
during an earlier refactor that consolidated the `COUNTRIES` constant into
`/app/frontend/src/data/countries.js`. The toast import was collateral damage
of that refactor and must not be dropped again.

**Forbidden change**
- Removing or renaming the `import { toast } from 'sonner';` line.
- Replacing `toast.error`/`toast.success` with `console.error`/`alert` instead
  of fixing the import (we use `sonner` consistently across the app).

---

### 2. `/app/frontend/src/pages/DiveLog.js` — Navbar import

**Required line (line 5, in the imports block):**
```js
import Navbar from '../components/Navbar';
```

**Why this MUST remain**

`DiveLog.js` historically imported `{ Navbar }` (named) from a sibling
`pages/Dashboard.js`. That `Dashboard.js` file is intentionally deleted from
`/app/frontend/src/pages/` because it was dead-code orphan in the reference
codebase itself — never referenced by `routes.js` in either tree, never
mounted as a screen, and its only outbound consumer was this single
`DiveLog.js` import.

The reference reference codebase carries `Dashboard.js` only because nobody
deleted it during the migration from a homebrew Navbar to the canonical
`components/Navbar.js`. `/app` correctly deleted the orphan but missed
this transitive import in `DiveLog.js`, leaving the bundle with a
`Module not found` webpack error that broke the entire web frontend.

The canonical `Navbar` component is exported as a **default** export from
`/app/frontend/src/components/Navbar.js` (line 9):
```js
export default function Navbar() { ... }
```
It takes **no props** — matches `DiveLog.js`'s call site `<Navbar />`
at line 77 exactly. No compat shim is needed.

**Forbidden changes**
- Reverting to `import { Navbar } from './Dashboard';` — this breaks the
  bundle (Module not found).
- Restoring `/app/frontend/src/pages/Dashboard.js` from the reference codebase
  to "fix" the import — this resurrects dead code that was never routed and
  duplicates the canonical Navbar with a stale, inferior in-file version.
- Switching to named import (`import { Navbar } from '../components/Navbar'`)
  — `Navbar.js` exports default; the named form resolves to `undefined`.

---

## Files that MUST NOT exist

| Path | Why it must stay deleted |
|---|---|
| `/app/frontend/src/pages/Dashboard.js` | Dead-code orphan in the reference codebase itself. Not referenced by `routes.js`. Its only purpose was to export a named `Navbar` consumed exclusively by `DiveLog.js`, which has now been repointed to the canonical Navbar (see lock #2 above). Restoring this file would reintroduce a duplicate `Navbar` component, a duplicate `<Dashboard>` page nobody routes to, and an inferior stale UI. |

If you find yourself wanting to recreate `pages/Dashboard.js` to satisfy some
new import, **stop**: the correct fix is to import from
`/app/frontend/src/components/Navbar.js` (canonical) instead.

---

## How to verify these locks are intact

```bash
# Lock 1 — toast import present
grep -F "import { toast } from 'sonner';" /app/frontend/src/pages/Onboarding.js

# Lock 2 — Navbar import points at components/Navbar
grep -F "import Navbar from '../components/Navbar';" /app/frontend/src/pages/DiveLog.js

# Forbidden file absent
test ! -e /app/frontend/src/pages/Dashboard.js && echo "OK: Dashboard.js correctly absent"

# Bundle compiles clean
tail -n 20 /var/log/supervisor/frontend.out.log | grep -E "webpack compiled|Failed to compile"
```

All four checks must pass before any web feature work is declared done.
