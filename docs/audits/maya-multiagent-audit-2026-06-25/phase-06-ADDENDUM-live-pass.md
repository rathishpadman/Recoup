# Phase 6 Addendum — Live Look-and-Feel Browser Pass

**Status:** Complete · **Mode:** LIVE (Playwright driving the running app)
**Date:** 2026-06-25
**Environment:** API `:4317` + cockpit `:3000` already running in **real-backend mode** (live Supabase data, not fixtures). Logged in as **Maya** via the real `/login` → `/api/demo-login` → Supabase RPC flow.
**Scope:** premium look-and-feel only (per direction) — render quality, responsive integrity, console health, accessibility signals. Not functional wiring.

Screenshots captured: `live-pass-screenshots/live-maya-forensics-1440.png`, `live-maya-forensics-375.png`, `live-maya-agent-trace-1440.png`.

## Live results

| Check | Result | Evidence |
|---|---|---|
| Login flow (real) | ✅ Works | Maya login via Supabase-verified RPC → redirected to `/forensics/shadcn` |
| Console health | ✅ **0 errors, 0 warnings** | `browser_console_messages` after load |
| Desktop render (1440) | ✅ Premium | `live-maya-forensics-1440.png` — matches the static palette pass; KPI strip, source readiness, worklist, case panel all render cleanly with live data |
| Responsive (375 mobile) | ✅ No broken layout | Root `scrollWidth = 360 < 375` → **no page-level horizontal overflow**; KPI cards stack to a single column; sidebar collapses to a hamburger; tables scroll internally (acceptable). `live-maya-forensics-375.png` |
| Agent-trace density | ⚠️ Confirmed (state-dependent) | Pre-query trace is a tidy 3-column node grid (`live-maya-agent-trace-1440.png`); the dense "wall" appears as the trace grows post-query (matches static Phase 6.5 finding) |
| Accessibility signals | ✅ Strong | `lang="en"`; **0/31 buttons missing an accessible name**; **0/1 inputs missing a label**; 0 images missing alt; single `<h1>`; `main`+`nav` landmarks present; 38 focusable elements |

## Interpretation

- **The premium feel holds up live**, with real backend data and a clean console — not just in curated screenshots. This is a meaningful trust signal: the app renders correctly against live Supabase, not fixtures.
- **Responsive is genuinely solid.** The mobile layout degrades gracefully (single-column cards, collapsed nav) with no page overflow — a common failure point that this build handles.
- **Accessibility is real, not accidental.** Zero unnamed buttons across 31 interactive controls and zero unlabeled inputs is a result most production apps don't achieve; this corroborates the static Phase 5.7 assessment and would score well on a Lighthouse a11y audit.
- **The agent-trace density issue is confirmed and remains the top visual fix** (Phase 6.5 / 10.5). Live, the pre-query map is fine; it's the post-query expansion that becomes a wall. The recommended horizontal agent-flow reshape stands.

## Minor live-only nits

| # | Observation | Action |
|---|---|---|
| L-1 | At 375px the header truncates to "Welcome ..." / "Here's what's happ..." | Confirm truncation is intentional; consider a shorter mobile header string so it doesn't read as clipped. |
| L-2 | The current view exposed 2 landmarks (`main`,`nav`) | Consider adding a `<header>`/`role="banner"` and `<footer>` landmark for richer screen-reader navigation. |
| L-3 | `aria-live` regions = 0 on the worklist view | Expected — the live region lives in the query dock (Phase 5.1). No action; noted for completeness. |

## Not run (would need heavier setup)

- **Full Lighthouse performance/LCP trace** — requires the chrome-devtools MCP's own browser + re-login. The objective a11y/structure probe above covers most of the Lighthouse *accessibility/best-practices* signal; a formal Lighthouse run is still recommended for **Performance/LCP** numbers before the final demo.
- **Hover/focus-state capture and motion timing** — the app currently disables the query-dock animation (Phase 6.6); re-enable tasteful motion before capturing.

## Verdict (live-confirmed)

Phase 6's conclusion stands and is now **live-verified**: the cockpit is **premium-tier and production-clean** (zero console errors, real-backend render, solid responsive, strong a11y). The **single highest-impact visual fix remains the Agent-Trace map** — reshape it into a legible horizontal agent-flow diagram with progressive disclosure.
