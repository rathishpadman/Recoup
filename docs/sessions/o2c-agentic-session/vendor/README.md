# Vendored presentation assets

reveal.js 6.0.1, fetched from npm and committed here rather than loaded from a CDN.

The published artifact runs under a strict CSP that blocks every external host, and the
deck is also presented from a local file with no network. Both require the framework to be
inlined into `index.html` at build time — see `../build.mjs`.

Reveal's own themes are deliberately not vendored. The deck derives its palette, type and
spacing from the repository design system (`/tokens.css`) so it matches the product.

| File | Source | Purpose |
|---|---|---|
| `reveal.js` | `dist/reveal.js` | Core framework |
| `reveal.css` | `dist/reveal.css` | Core layout and transitions |
| `notes.js` | `dist/plugin/notes/notes.js` | Speaker view |
| `zoom.js` | `dist/plugin/zoom/zoom.js` | Alt/ctrl-click zoom into a diagram region |

## Local modification

`notes.js` has its non-ASCII characters rewritten as `\uXXXX` escapes. The behaviour is
identical; it keeps the built `index.html` pure ASCII so rendering cannot depend on the
browser guessing an encoding. Re-apply after any version bump.
