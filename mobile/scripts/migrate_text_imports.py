"""One-shot migration: swap `Text` imported from 'react-native' for the
`Text` wrapper at /app/mobile/src/components/Text.tsx.

Handles both single-line and multi-line named-import blocks. Inserts the
wrapper import on the line immediately after the original RN import
statement, using a path relative to each file.

Files explicitly EXCLUDED (locked or welcome-auth-flow):
  app/(tabs)/_layout.tsx, app/(tabs)/index.tsx, app/listing/[id].tsx,
  app/welcome.tsx, app/signup.tsx, app/verify.tsx, app/biometric-resume.tsx,
  src/screens/WelcomeView.tsx,
  src/components/auth/BiometricEnrollmentSheet.tsx,
  src/components/auth/SocialAuthButtons.tsx,
  src/components/Text.tsx (wrapper itself).

This script is idempotent — running it twice on a migrated file is a no-op
because the RN import no longer contains `Text`.
"""
from __future__ import annotations
import os
import re
import sys
from pathlib import Path

MOBILE = Path('/app/mobile')
WRAPPER = MOBILE / 'src' / 'components' / 'Text.tsx'

EXCLUDE = {
    MOBILE / 'app' / '(tabs)' / '_layout.tsx',
    MOBILE / 'app' / '(tabs)' / 'index.tsx',
    MOBILE / 'app' / 'listing' / '[id].tsx',
    MOBILE / 'app' / 'welcome.tsx',
    MOBILE / 'app' / 'signup.tsx',
    MOBILE / 'app' / 'verify.tsx',
    MOBILE / 'app' / 'biometric-resume.tsx',
    MOBILE / 'src' / 'screens' / 'WelcomeView.tsx',
    MOBILE / 'src' / 'components' / 'auth' / 'BiometricEnrollmentSheet.tsx',
    MOBILE / 'src' / 'components' / 'auth' / 'SocialAuthButtons.tsx',
    MOBILE / 'src' / 'components' / 'Text.tsx',
}

# Match a full `import { ... } from 'react-native';` block (single or multi-line).
RN_IMPORT_RE = re.compile(
    r"""import\s*\{([^}]*)\}\s*from\s*['"]react-native['"];?""",
    re.MULTILINE | re.DOTALL,
)


def relative_wrapper_import(file_path: Path) -> str:
    """Return e.g. '../src/components/Text' for app-level files."""
    rel = os.path.relpath(WRAPPER.with_suffix(''), start=file_path.parent)
    # Always use forward slashes for JS imports.
    rel = rel.replace(os.sep, '/')
    if not rel.startswith('.'):
        rel = './' + rel
    return rel


def migrate_one(path: Path) -> tuple[bool, str]:
    src = path.read_text()
    m = RN_IMPORT_RE.search(src)
    if not m:
        return False, 'no rn-import block'
    inner = m.group(1)
    # Tokenise the named imports, preserving any inline comments by stripping them.
    raw_tokens = [t.strip() for t in inner.split(',')]
    if not any(t == 'Text' for t in raw_tokens if t):
        return False, 'Text not in named imports'
    # Drop Text and any empty trailing tokens.
    kept = [t for t in raw_tokens if t and t != 'Text']
    if kept:
        # Reformat preserving line shape:
        # If original was multi-line (contained newline inside braces), keep multi-line.
        if '\n' in inner:
            joined = ',\n  '.join(kept)
            new_block = f"import {{\n  {joined},\n}} from 'react-native';"
        else:
            new_block = "import { " + ", ".join(kept) + " } from 'react-native';"
    else:
        # Edge case: file imported only Text. Replace with the wrapper import only.
        new_block = ""
    # Build wrapper import line.
    wrapper_path = relative_wrapper_import(path)
    wrapper_line = f"import {{ Text }} from '{wrapper_path}';"
    # Compose final import region.
    if new_block:
        replacement = new_block + '\n' + wrapper_line
    else:
        replacement = wrapper_line
    new_src = src[:m.start()] + replacement + src[m.end():]
    if new_src == src:
        return False, 'no-op'
    path.write_text(new_src)
    return True, 'migrated'


def main() -> int:
    targets: list[Path] = []
    for root in (MOBILE / 'app', MOBILE / 'src'):
        for p in root.rglob('*.tsx'):
            if p in EXCLUDE:
                continue
            text = p.read_text()
            # Quick filter: must mention 'Text' AND 'react-native'.
            if 'react-native' not in text or 'Text' not in text:
                continue
            targets.append(p)

    migrated, skipped = [], []
    for p in targets:
        ok, why = migrate_one(p)
        if ok:
            migrated.append(p)
        else:
            skipped.append((p, why))

    print(f"Migrated: {len(migrated)}")
    for p in migrated:
        print(f"  + {p.relative_to(MOBILE)}")
    print(f"Skipped: {len(skipped)}")
    for p, why in skipped:
        print(f"  - {p.relative_to(MOBILE)}  ({why})")
    return 0


if __name__ == '__main__':
    sys.exit(main())
