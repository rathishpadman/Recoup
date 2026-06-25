# Phase 6 — Browser Look & Feel (Premium / Modern-App Bar)

**Status:** Complete · **Mode:** static visual review of rendered screenshots + design-token system
**Bar:** Linear / Stripe / Vercel-tier enterprise SaaS
**Scope:** `tokens.css`, `cockpit/app/styles.css`, and rendered screenshots under `output/playwright/manual-qa/` and `output/playwright/e2e/` (dashboard 1440, case workspace, cited-answer drawer, agent-trace map).

> This phase judges **whether it looks and feels premium**, not whether the wiring is correct (that is Phases 1–5).

## Design-system assessment (`tokens.css`)

The token system is **genuinely high-craft** and is the foundation of the premium feel:

- **"Editorial Enterprise" concept** — zinc neutral ramp + a single restrained accent (`#C2410C` burnt orange) reserved for risk emphasis only. This is disciplined, Linear-grade color governance.
- **Typography with intent** — `IBM Plex Sans` (UI), `IBM Plex Mono` (numbers/IDs/hex only), `Newsreader` serif for editorial/hero/empty-state accents. Using a serif for editorial moments is a sophisticated, modern-publication move.
- **8px spacing scale, 2-tier elevation only, 6-step radius scale** — restraint that reads as premium rather than busy.
- **Motion tokens** (`150/200/250ms`, shared cubic-bezier easing) **with `prefers-reduced-motion` support** (`tokens.css:111-113`) — accessibility-aware motion.
- **Light-first with a scoped dark "command-center"** theme for monitoring.

This system alone puts the project in the top tier of hackathon UI quality.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 6.1 | Visual hierarchy & spacing rhythm | C | ✅ Pass (mostly) | Dashboard/worklist (`maya-beat-02-dashboard-1440.png`) and case workspace (`maya-palette-03-case.png`) have clear hierarchy, generous spacing, a tidy KPI strip, and a well-composed three-zone layout. |
| 6.2 | Typography scale & legibility | C | ✅ Pass | Mono for the `$8,200.00` figure and record IDs; sans for UI; serif accents. Looks intentional and premium. |
| 6.3 | Color / contrast coherence | C | ✅ Pass | Coherent zinc system; semantic status colors (success/info/warning/danger/dispute/escalated); light + scoped dark. WCAG-oriented text/bg/border triplets. |
| 6.4 | Component polish | H | ✅ Pass | shadcn cards, tables, tabs, badges, sheets with consistent radius/shadow/border tokens. Reads as a real product. |
| 6.5 | Density & information design | H | ⚠️ Partial | KPI strip and case views are well-balanced. **The Agent-Trace map is overwhelming** — a dense wall of dozens of small near-identical cards (`maya-palette-07-agent-trace.png`), worst in the dark theme. The cited-answer drawer (`maya-palette-06-query-answer.png`) is also badge-heavy. |
| 6.6 | Motion / feedback | H | ⚠️ Partial | Motion tokens exist, but the query dock **explicitly disables animation** (`query-evidence-dock.tsx:225` `animation: "none"`, `backdrop-blur-none`) — pragmatic for test stability but it makes the marquee drawer feel static rather than "alive." |
| 6.7 | Responsive integrity (375/768/1024/1440) | H | ✅ Pass (needs live confirm) | Screenshots exist at all four widths; components use `min-w-0`, `truncate`, `flex-wrap` extensively (good overflow hygiene). Recommend a live pass to confirm no clipping. |
| 6.8 | Empty / loading / error states | M | ✅ Pass | Designed `Alert` states for standby, connecting, blocked, error (Phase 5 evidence) — not raw. |
| 6.9 | Iconography consistency | M | ✅ Pass | Single `lucide-react` family, `data-icon` sizing, decorative icons `aria-hidden`. |
| 6.10 | Brand identity | M | ✅ Pass | "Recoup" mark, "Maya Forensics" surface, "Maya Patel" persona, consistent accent. Coherent product identity. |

## The one thing that holds back the "wow": the Agent-Trace map

`maya-palette-07-agent-trace.png` shows the trace as a long, dark, near-uniform grid of small cards. For a *governed multi-agent* product, the agent trace is the **single most important visual proof point** — it is where a judge should instantly *see* "Forensics Investigator → Recovery Drafter, with cited evidence." Right now it reads as a data dump, not a story.

> **Proposed action (highest visual ROI):** Reshape the trace into a **horizontal agent-pipeline flow** — a small number of large nodes (Supervisor → Investigator → Retrieval → Decision → Recovery Drafter) connected by labeled handoff arrows, with per-node detail collapsed behind expansion/hover. Keep the full table as a "details" disclosure below. Cap visible nodes and virtualize the rest.
> **Expert citations:**
> - Judges reward legible agent behavior — the winning "LORE" project was praised as feeling "like a product, not a hackathon project," specifically for making *multi-agent routing logic* legible ([Devpost — judging tips](https://info.devpost.com/blog/hackathon-judging-tips)).
> - Cross-agent observability should be *visual and navigable*, not a flat dump ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)).
> - The OpenAI Agents SDK models execution as agents/handoffs/tool-calls — mirroring that graph visually is the idiomatic representation ([OpenAI Agents SDK JS/TS](https://openai.github.io/openai-agents-js/)).

### Secondary look-and-feel actions

**6.5 — Progressive disclosure in the cited-answer drawer [M].**
> **Proposed action:** Lead with the answer + top 3 citations; collapse the long evidence-metadata/source-connector lists behind "Show all evidence." Reduce simultaneous badge count.
> **Expert citation:** Modern enterprise UIs favor progressive disclosure to manage density (general Stripe/Linear-tier IA practice; supports "clarity over polish" — [Devpost — judging tips](https://info.devpost.com/blog/hackathon-judging-tips)).

**6.6 — Re-enable tasteful motion for the demo [M].**
> **Proposed action:** Restore the sheet slide/backdrop transition (guarded by `prefers-reduced-motion`) for live demos; keep an env/test flag to disable it during E2E. A 200ms drawer slide using the existing `--motion-base`/`--easing` tokens makes the marquee interaction feel alive.
> **Expert citation:** Restrained motion is a hallmark of premium apps; the token system already defines the right durations/easing and a reduced-motion fallback (`tokens.css:86-88, 111-113`).

## How to *verify* look & feel live (recommended next step)

A static screenshot review can't confirm motion, hover, focus-visible, or responsive clipping. To close that gap (browser testing scoped **exclusively to look & feel**, per your direction):

1. Start API + cockpit, log in as Maya, navigate to `/forensics/shadcn`.
2. Use the **chrome-devtools MCP `lighthouse_audit`** for an objective **Performance / Accessibility / Best-Practices** score (premium apps clear ~90+ on a11y/best-practices).
3. Use **Playwright/chrome-devtools** to capture hover/focus states and a `performance_start_trace` to confirm 60fps on drawer open and trace render.
4. Resize 375→1440 and screenshot each breakpoint to confirm no overflow/clipping.

I can run this live pass on request (it requires booting the app).

## Phase 6 score

- Pass: 8/10.
- Partial: 2 (trace-map density, disabled motion) — both **visual polish**, both fixable in hours.

**Verdict:** The cockpit is **already premium-tier** on system design, typography, color, and component polish — clearly above typical hackathon UIs. The single highest-impact visual fix is **reshaping the Agent-Trace map into a legible agent-flow diagram**; that one change converts the strongest technical differentiator into the strongest *visual* one.
