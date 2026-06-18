# O2C Collections Design System — v3.1 "Editorial Enterprise"

A merge of two source systems for a hackathon-ready receivables product:

- **O2C Collections (v2.0)** — the right *substance*: a data-dense command center for receivables teams, with semantic finance tokens, table/chart standards, aging colors, AI-risk transparency, and accessibility rules.
- **ElevenLabs design analysis** — the right *restraint*: an editorial, magazine-calm marketing language built on warm neutrals, one expressive display face, generous whitespace, and a single atmospheric "color moment" instead of chromatic noise.

**The thesis:** keep all of O2C's enterprise bones, and borrow ElevenLabs' editorial discipline only at the *edges*, so the product reads as credible finance software **and** looks designed. That gap — credible *and* crafted — is what wins judging panels who have seen ten Tailwind-blue dashboards already.

> ElevenLabs is a *marketing brand*, not a product UI. Its pastel gradient orbs and 300-weight serif headlines do not belong in a worklist. We take its *principles* (restraint, warm neutrals, editorial type, one signature moment), not its surfaces.

---

## 1. What changed from v2.0

| Area | v2.0 | v3.1 |
| --- | --- | --- |
| Primary accent | SaaS blue `#175CD3` | **Petrol teal `#0C6E6B`** — distinctive, trustworthy, not the default blue |
| Neutrals | Cool slate (`#0F172A` / `#F8FAFC`) | **Warm-cool low-chroma ramp** — calmer, less "admin panel" |
| Type | Plex Sans / one family | **Newsreader (editorial) + IBM Plex Sans (data) + IBM Plex Mono (metadata)** |
| Color philosophy | Six brand hues competing | **One anchor + semantic status only** — color earns its place |
| Dark mode | Listed | **Defined**: scoped to live monitoring command-center only |
| "Wow" | None | **One signature atmospheric moment** at auth / exec view / empty states |
| AI | Mentioned | **First-class**: next-best-action + reason codes are core components |

**Hard rule that protects the blend:** the operational core (worklist, account detail, drawers) stays dense, sober, and chromatically quiet. The editorial calm — serif display, whitespace, atmospheric bloom — appears **only** at the margins: login, executive cash view, empty states, section intros. Never inside a 50-row table.

---

## 2. Color

Use semantic tokens, never raw hex in components.

### Brand — Petrol

| Token | Hex | Usage |
| --- | --- | --- |
| `color.primary` | `#0C6E6B` | Primary actions, active nav, links |
| `color.primary.hover` | `#0A5755` | Hover |
| `color.primary.active` | `#084746` | Press |
| `color.primary.deep` | `#053B3B` | Dark brand surfaces, on-selection text |
| `color.primary.subtle` | `#DCEEED` | Selected row, info tint, icon plates |
| `color.accent` | `#C2410C` | High-priority CTA / risk emphasis — sparing |

### Neutrals — warm-cool ramp (low chroma, faint teal family)

| Token | Hex |
| --- | --- |
| `neutral.900` (ink) | `#131A19` |
| `neutral.700` | `#324341` |
| `neutral.500` | `#6B7A78` |
| `neutral.300` | `#C7CFCE` |
| `neutral.100` | `#EEF1F1` |
| `neutral.50` (canvas) | `#F7F8F8` |
| `white` | `#FFFFFF` |

### Text & surface

| Token | Hex |
| --- | --- |
| `text.primary` | `#131A19` |
| `text.secondary` | `#4B5C5A` |
| `text.muted` | `#6B7A78` |
| `bg.canvas` | `#F7F8F8` |
| `bg.surface` | `#FFFFFF` |
| `bg.subtle` | `#EEF1F1` |
| `border.default` | `#D6DCDB` |
| `border.subtle` | `#E6EAEA` |
| `focus` | `#0C6E6B` |

### Status — never color alone; pair color + icon + text

| Status | Text | Background | Border | Icon |
| --- | --- | --- | --- | --- |
| Success / Paid | `#166534` | `#DCFCE7` | `#86EFAC` | check-circle |
| Info / Assigned | `#075985` | `#E0F2FE` | `#7DD3FC` | info |
| Warning / Due soon | `#92400E` | `#FEF3C7` | `#FBBF24` | alert-triangle |
| Danger / Overdue | `#991B1B` | `#FEE2E2` | `#FCA5A5` | octagon-alert |
| Dispute | `#5B21B6` | `#EDE9FE` | `#C4B5FD` | message-square-warning |
| Escalated | `#9A3412` | `#FFEDD5` | `#FDBA74` | arrow-up-right |
| Neutral / Closed | `#334155` | `#F1F5F9` | `#CBD5E1` | circle |

### Aging buckets — chart-safe, retained from v2.0

| Bucket | Color |
| --- | --- |
| Current | `#16A34A` |
| 1–30 | `#0284C7` |
| 31–60 | `#D97706` |
| 61–90 | `#EA580C` |
| 90+ | `#DC2626` |
| Disputed | `#7C3AED` (add pattern/icon in charts) |

### Atmosphere — the signature (decoration only)

Soft radial blooms used **only** behind editorial moments — never as button fills, text, or component backgrounds.

| Token | Hex |
| --- | --- |
| `atmos.mint` | `#BFE3DE` |
| `atmos.sand` | `#F2E4D0` |
| `atmos.sky` | `#CFE0EC` |

### Color rules

- WCAG AA contrast: 4.5:1 normal text, 3:1 large text/UI glyphs.
- Status never relies on color alone — always color + icon + label.
- Charts never rely on red/green alone — add labels, patterns, or line styles.
- One brand anchor (petrol). Resist adding a second decorative hue.
- Reserve `accent` orange/red for actionable risk, never decoration.

---

## 3. Typography

Three families, each with a job.

| Family | Role | Weights |
| --- | --- | --- |
| **Newsreader** (serif) | Editorial edges — hero, exec view, empty states, section intros | 300 / 400 |
| **IBM Plex Sans** | All interface, body, tables, data | 400 / 500 / 600 / 700 |
| **IBM Plex Mono** | Numerals, IDs, timestamps, amounts, hex — **numbers only** | 400 / 500 |

> Substitutes are open-source and already chosen — no licensing risk (ElevenLabs' Waldenburg was licensed; Newsreader replaces its editorial role for free).

### Scale

| Token | Family | Size | Weight | Line | Usage |
| --- | --- | ---: | ---: | ---: | --- |
| `type.display` | Newsreader | 32–58px | 300 | 1.04 | Editorial hero, exec headline |
| `type.h1` | Plex Sans | 24px | 700 | 32px | Page titles |
| `type.h2` | Plex Sans | 20px | 600 | 28px | Section titles |
| `type.h3` | Plex Sans | 16px | 600 | 24px | Card / panel titles |
| `type.body` | Plex Sans | 14px | 400 | 22px | Body, table cells |
| `type.body.mobile` | Plex Sans | 16px | 400 | 24px | Mobile body / inputs |
| `type.label` | Plex Sans | 13px | 600 | 18px | Field labels, table headers |
| `type.amount` | Plex Mono | 16px | 500 | 22px | Financial values, KPI numbers |
| `type.micro-label` | Newsreader *italic* | 13–14px | 400 | — | Group/section sub-labels (e.g. *Brand — petrol*) |
| `type.caption` | Plex Sans | 12px | 400/500 | 16px | Metadata, helper, card labels (sentence case) |

### Labeling & micro-typography (the anti-generic rules)

These rules are what separate a hand-crafted premium system from default AI/template output. Follow them strictly.

- **No all-caps, letter-spaced "eyebrow" labels.** Do not use `text-transform: uppercase` + wide `letter-spacing` for section or group labels — it is the strongest tell of generated UI. 
- **Group/section sub-labels use Newsreader italic**, sentence case, in `text.muted` (e.g. *Brand — petrol*, *Aging buckets — chart-safe*). This is the editorial signature.
- **Card/KPI labels are quiet sentence-case Plex Sans** at 12px / weight 500 in `text.muted` — e.g. "Total past due", not "TOTAL PAST DUE".
- **Mono is for numbers only** — amounts, IDs, days, timestamps, hex, scores. Never set running labels or prose in mono.
- **Tighten the display + UI.** Apply `letter-spacing: -0.01em` to UI text and `-0.5px to -1.8px` to Newsreader display sizes. This negative tracking is a core part of the premium register.

### Rules

- All numbers use `font-variant-numeric: tabular-nums` — amounts, dates, aging days, scores, KPIs.
- Newsreader is light (300) and reserved for calm surfaces — **never** for dense data or table headers.
- No body text below 12px; keep table values at 13–14px.
- Sentence case for labels and actions. Line length 60–75 chars for long-form.

### Iconography

- **Phosphor Icons**, regular weight (~1.5px stroke), sized 14–22px. Chosen over the ubiquitous Lucide/Feather defaults for a less templated, more refined feel.
- Use icons sparingly — pair with status chips and primary affordances, not decoratively on every label.
- Icon-only controls require an `aria-label` and tooltip.

---

## 4. Spacing, radius, elevation

- **Spacing:** 8px base — `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`.
- **Radius:** `xs 2 · sm 4 · md 6 (buttons) · lg 8 (inputs/cards) · 12 (panels) · 16 (editorial blocks)`. Crisp, never soft/playful in the work surfaces; the larger 12–16px radii are reserved for editorial cards.
- **Elevation:** `flat` (1px border) · `sm 0 1px 2px rgba(15,23,42,.06)` · `md 0 8px 16px rgba(15,23,42,.10)`. Two tiers only. Avoid nested cards.

---

## 5. App shell & density

| Element | Size |
| --- | ---: |
| Sidebar | 252px expanded · 72px collapsed |
| Header | 56px |
| Page padding | 24 desktop · 16 tablet · 12 mobile |
| Table row | 44px default · 36px compact (user-controlled) |
| Drawer | 420px standard · 560px detailed |
| Modal | 480 / 640 / 800 |

Grouped navigation (Operate / Resolve / Govern / System) and role-based landing screens carry over unchanged from v2.0 — they are correct.

---

## 6. Dark command-center mode

Light-first. Dark is **only** for live monitoring dashboards (NOC-style wall displays, manager monitors) — never the default workspace.

| Token | Hex |
| --- | --- |
| `bg.canvas.dark` | `#081312` |
| `bg.surface.dark` | `#0E1F1D` |
| `bg.subtle.dark` | `#15302D` |
| `border.dark` | `#24433F` |
| `text.primary.dark` | `#ECF4F2` |
| `text.secondary.dark` | `#9FB2AF` |
| `text.muted.dark` | `#6F8581` |
| `primary.dark` | `#2EC4BB` |
| `success.dark` | `#4ADE80` |
| `danger.dark` | `#F87171` |

Do not infer dark contrast from light tokens — these are tuned separately.

---

## 7. AI & agent transparency (the hackathon edge)

Agentic AI is the differentiator the judges reward. The system makes the *reasoning* visible, not just the output.

**Next-Best-Action panel** — required content:
- Recommended action (e.g. "Call customer").
- **Why** — explicit reason codes: "45 days past due · no contact in 18 days · exposure $82,400".
- Primary action + secondary alternatives.
- Dismiss / defer **with reason** (feeds the agent).

**Risk score** — never a bare number:
- Level (low / medium / high / critical) + score + top reason codes + last-updated + manual-override indicator.
- "View factors" available before asking the user to trust it.

**AI copy patterns** — drafted emails, suggested promises, and summaries are always labeled as AI-generated, editable, and reversible.

---

## 8. Component standards (carried + tightened)

Buttons (action-named labels, 36/44px min, visible 2px focus ring), KPI cards (label + value + delta + scope + drill-down), status chips (text + icon), tables (sticky header, sticky first column, right-aligned numerics, loading/empty/error/permission states), forms & drawers (visible labels, inline validation, autosave, confirm-on-close), timeline (actor + timestamp + object + outcome) — all retained from v2.0 §8 with the v3.1 tokens applied.

---

## 9. Motion

Clarify state, don't entertain. Hover 150ms · drawer 200–250ms · row expand 180–220ms. Atmospheric blooms drift slowly (16–22s) and only on editorial surfaces. Respect `prefers-reduced-motion` — blooms and chart entrances become static.

---

## 10. How the system scores the brief

| Criterion | How the design earns it |
| --- | --- |
| **Innovation** | Agentic next-best-action with visible reason codes — the AI's reasoning is a UI, not a black box. |
| **Impact & measurement** | KPI strip with deltas, DSO trend, expected-collections forecast make recovery gains measurable on screen. |
| **Real-world relevance** | Built around the collector's real day: worklist → account → promise → dispute → escalate. |
| **Use of AI capabilities** | Risk explanations, draft emails, suggested actions are first-class, transparent components. |
| **Technical excellence** | Semantic tokens, a11y rules, virtualization, loading/empty/error states signal production-readiness. |
| **Scalability** | One token set drives light, dark, density, and every role — repeatable across teams and clients. |

---

## 11. Do / Don't

**Do**
- Anchor on petrol `#0C6E6B`; let status colors carry meaning.
- Use Newsreader only at the calm edges; Plex Sans for all work surfaces.
- Pair every status with icon + text.
- Reserve the atmospheric bloom for one moment per surface.

**Don't**
- Don't bring gradient orbs or serif display into the worklist or any dense table.
- Don't add a second decorative brand hue.
- Don't use dark mode as the default workspace.
- Don't show a risk score or AI suggestion without its reason codes.
- Don't drop body or table text below 12px.

---

## 12. Developer handoff (build with Codex)

Machine-readable artifacts live at repo root or under `design-system/` after staging:

| File | Purpose |
| --- | --- |
| `tokens.json` | All tokens as structured data — colors, type, spacing, layout, motion. The source of truth. |
| `tokens.css` | The same tokens as CSS custom properties (light `:root` + `[data-theme="dark"]`). Drop into the app and reference with `var(--…)`. |
| `codex-handoff.md` | Recommended stack, a ready-to-paste Codex kickoff prompt, the MVP build order, and guardrails. |

**To start development:** open `dev/codex-handoff.md`, copy the kickoff prompt into Codex, and point it at this spec plus `dev/tokens.json`. Tell it explicitly: *use the tokens as the source of truth — do not invent colors, fonts, spacing, or radii.* Recommended stack is Next.js App Router + React + TypeScript + Tailwind (config mapped from `tokens.json`) + Vercel AI SDK + Radix UI + TanStack Table + Recharts + Phosphor. Build in this order: shell → primitives → Forensics cockpit → evidence drawer/HITL → Credit/Arbitration cockpit → CFO summary → states.

---

*Deliverables: this spec + machine-readable tokens (`tokens.json`, `tokens.css`) + a live showcase page (`O2C Design System v3.1.dc.html`) rendering every token, type ramp, component, pattern, the signature editorial moment, and the dark command-center demo.*
