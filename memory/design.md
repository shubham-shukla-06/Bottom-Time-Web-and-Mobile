# Bottom Time — Mobile design rules (mirror of /app/design.md mobile section)

## Cyan-pill text colour
Cyan pills (`backgroundColor: Colors.cyan400` / `Colors.cyan500` / `#22d3ee`) ALWAYS render their text in `Colors.white`. Black/slate-900 text on cyan is forbidden — fails accessibility contrast (~2.5:1 for white vs ~7.5:1 for slate, but brand consistency wins) and breaks visual consistency with web's primary CTAs.
