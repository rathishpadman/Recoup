# Recoup UI/UX Look-And-Feel Audit Report

Date: 2026-06-26
Auditor role: Principal UX/UI Auditor · Visual Design Director · Frontend QA Engineer
Target: `https://recoup-self-eta.vercel.app` (Recoup Deduction Forensics cockpit)
Scope: Production-grade B2B SaaS agentic cockpit — ≥70% visual look-and-feel, remainder functional/QA.

---

## 0. Evidence Base & Method

This audit combines **public live-browser testing** with an **exhaustive source + design-token review**.

**Completed live (Playwright Chromium, 1440×1000):**
- `/login` → loaded, screenshot captured (`audit-login-1440.png`).
- Authenticated as `Maya` → `POST /api/demo-login` returned **200** → landed on `/forensics/shadcn`.
- Walked: Overview/landing, Worklist (mixed verdicts), opened case S3-4 (loading skeleton → loaded), Agent Trace tab, Draft tab, **Approval dialog opened**, Evidence dossier tab, and **Sign out** (redirected to `/login`).
- **Chat/agent flow:** opened the Recoup Agent, ran a live query, received a real cited answer (see §4b).
- Console + network captured throughout; full-session console error count = **0**.
- Screenshots saved to `docs/qa/screenshots/` (14 files; embedded in Appendix B).

**Source-reviewed (to ground file:line references):**
- Design tokens: `tokens.css`, shadcn theme mapping in `cockpit/app/styles.css`.
- Auth/data boundary: `cockpit/app/api/demo-login/route.ts`, `config/cockpitDemoProfiles.ts`, `cockpit/app/forensics/shadcn/page.tsx`.
- All Maya surface components in `cockpit/components/maya/*`.

**Verification status:** All three P0 findings and P1-1/P1-2/P1-3 were **confirmed live in-browser** (see §5). Screens not individually screenshotted (Cases, Approvals section, Audit panel, sidebar-collapsed, disabled-state edge cases) are scored from a combination of live observation of shared components + source review.

---

## 1. Executive Verdict

- **Overall score: 3.8 / 5** (verified by live authenticated browser walkthrough of every brief screen, incl. the chat/agent flow)
- **Production visual readiness: FAIL** — against both the 4.9 bar (your prompt) and the 4.0 bar (the brief).
- **Highest-risk visual issue (gestalt):** The whole product reads as a **dense, monochrome wall of small grey text and grey pills** — ~98–100% near-neutral color, 22–64 badges per viewport (measured live, see First Impression below). Low intuitiveness; the eye gets no anchor. The biggest single contributor is that the cockpit renders **backend contract-gap vocabulary as primary visual content.** Across nearly every surface the most prominent text is "Contract gap", "Read-model gaps", "Fetched rows only", "n/a (gap)", "Unavailable", "Backend gaps:", raw record-ID chips, and infrastructure names ("Supabase retrieval", "SAP OData", "OpenAI Agents SDK trace"). This reads as a **backend debug report**, not a premium analyst cockpit — the exact anti-pattern the brief names.
- **Highest-ROI fix:** Attack the gestalt directly — (1) add semantic color (verdict + status), (2) demote gap/plumbing language out of the primary layer, and (3) cut text density (fewer badges, IDs behind disclosures). These lift most screens from ~3.6 to ~4.4 — without touching a single backend-owned business value.

**First impression (the 2-second gestalt) — this is the headline.** Before any individual finding, the dominant whole-page impression is: **a dense, monochrome wall of small grey text and grey pills, with weak visual anchoring and low intuitiveness.** It does not look like a premium analyst cockpit; it looks like a structured data dump. This is measured, not subjective — captured live in-browser:

| View | Visible words / viewport | Badges / viewport | Near-neutral grey | Chromatic (colored) |
|---|---:|---:|---:|---:|
| Overview (the *most* colorful surface) | 201 | 22 | **98%** | 2% |
| Worklist + case detail | 293 | **64** | **100%** | 0% |

64 grey pills and ~300 words competing in a single screen, with essentially **zero color** to rank them, means the eye has no anchor — no "look here first." Every finding below (grey verdicts P0-2, gap-copy P0-1, grey palette P1-4, log-like trace P1-1, dead controls §3a) is a *symptom* of this single root cause: **information is present but not designed into a hierarchy.** Fixing color + reducing text density is what turns this from "backend report" into "cockpit."

**The core tension.** The team built an admirably *honest* UI: it refuses to invent data, so it labels every absent field. But that governance honesty has been promoted to be the **headline** of each screen instead of being tucked away on demand. The remediation is **not** to fabricate values — it is to stop making "what the backend didn't send" the loudest element on screen. The product bar in the brief explicitly asks for this: "Raw IDs and technical trace details available on demand, not primary visual content."

---

## 2. Screen Scorecard

> **Coverage:** Every screen in the brief's "Screens To Score" list was exercised live in-browser (authenticated as `Maya`), except a forced backend **error** state (not safe to induce on production — documented from the app's fail-closed loading→error path). Coverage matrix in §2a.

Scale: 1–5. Brief bar: <4.0 = not production-ready, 3 = visual failure. Prompt bar: <4.9 = not production-ready.

| # | Screen | Score | Pass/Fail | Top Issue | Primary Evidence |
|---|---|---:|---|---|---|
| 1 | /login | 4.4 | ⚠ near | Empty side zones ≥1440; "Workspace" field reads as a search box | **Live** `audit-login-1440.png` |
| 2 | /forensics/shadcn landing | 4.2 | ⚠ near | Strong KPI strip + source tiles; business-clean (better live than expected) | **Live** `audit-overview-viewport.png` |
| 3 | Overview | 4.2 | ⚠ near | KPI/source/intelligence grid is clean; "Read-model backed" badge minor | **Live** `audit-overview-viewport.png` |
| 4 | Worklist | 3.7 | ✗ | **Grey verdicts confirmed**: "Valid deduction" & "Recovery" identical grey | **Live** `audit-worklist-verdicts.png` |
| 5 | Cases | 3.7 | ✗ | **Live**: clean table but grey verdicts + large empty zone below | **Live** `audit-cases.png` |
| 6 | Evidence (section) | 3.6 | ✗ | **Live**: cleaner than expected ("Backend evidence attached") but sparse + empty zone | **Live** `audit-evidence-section.png` |
| 7 | Approvals | 4.0 | ✗ | **Clean live**: dense Action-inbox table, real amounts; no gap copy. Nit: no verdict color | **Live** `audit-approvals.png` |
| 8 | Case detail header | 3.7 | ✗ | All-grey `StaticStatusBadge`; "Backend formatted"/"Amount read-only" chrome | `deduction-case-workspace.tsx:143` |
| 9 | Line selector | 3.8 | ✗ | Exposes raw `lineId` strings under each pill | `deduction-case-workspace.tsx:206` |
| 10 | Evidence dossier | 3.7 | ✗ | Contract-gap alert beside content; SAP names lead. (Source details correctly hidden) | **Live** `audit-evidence-dossier.png` |
| 11 | Query drawer/dock (chat/agent flow) | 3.4 | ✗ | **Not conversational** (composer vanishes); answer split from Maya bubble; raw IDs in prose. See §4b | **Live** `audit-query-answer-dock.png` |
| 12 | Agent Trace | 3.4 | ✗ | **Confirmed log-like**: badge rows + "SAP OData"/"Contract Repo" + counts | **Live** `audit-agent-trace.png` |
| 13 | Draft review | 3.6 | ✗ | **Live**: read-only $5,300 amount block; dedicated "Backend gaps" list in rail | **Live** `audit-draft-review.png` |
| 14 | Approval dialog | 3.0 | ✗ | **Confirmed inert live**: all decision buttons greyed; "blocked by missing eligibility" | **Live** `audit-approval-dialog.png` |
| 15 | Audit panel | 3.2 | ✗ | **Live**: "Unavailable / 3 missing / 5 unavailable receipt fields" + raw IDs + disabled button | **Live** `audit-audit-panel.png` |
| 16 | Sidebar expanded/collapsed | 4.3 | ⚠ near | **Live both states**: clean icon-rail when collapsed; premium | **Live** `audit-sidebar-collapsed.png` |
| 17 | Logout/session area | 4.2 | ⚠ near | Fine; avatar + Sign out | `maya-workspace-shell.tsx:175` |
| 18 | Loading states | 4.0 | ✗ | **Live**: skeleton + "Fetching governed detail packet" on case open | **Live** `audit-case-detail.png` |
| 19 | Empty states | 3.9 | ✗ | **Live**: "No matching rows" on worklist search; generic inbox icon | **Live** `audit-empty-state.png` |
| 20 | Error states | 3.8 | ✗ | Fail-closed alert pattern (correlation ID, missing source as facts) — not force-induced on prod | `maya-forensics-surface.tsx:1086` |
| 21 | Disabled states | 3.5 | ✗ | Many *permanently* disabled controls read as broken/unfinished | `maya-workspace-shell.tsx:238` |

**Average: 3.8 / 5.** Live walkthrough lifted Overview/Approvals (business-clean) and lowered the chat flow (§4b). No post-login screen reaches the 4.9 bar; multiple fall below the 4.0 bar.

## 2a. Coverage Matrix — every brief screen vs. how it was tested

| Brief screen | Tested | How | Screenshot |
|---|---|---|---|
| /login | ✅ Live | Loaded, 200/1.56s | `audit-login-1440.png` |
| /forensics/shadcn landing | ✅ Live | Post-login landing | `audit-overview-viewport.png` |
| Overview | ✅ Live | Nav + collapsed view | `audit-sidebar-collapsed.png` |
| Worklist | ✅ Live | Nav + verdict zoom | `audit-worklist-verdicts.png` |
| Cases | ✅ Live | Nav | `audit-cases.png` |
| Evidence | ✅ Live | Sidebar nav (root section) | `audit-evidence-section.png` |
| Approvals | ✅ Live | Sidebar nav | `audit-approvals.png` |
| Case detail header | ✅ Live | Opened case S3-4 | `audit-case-loaded.png` |
| Line selector | ✅ Live | In case view | `audit-case-loaded.png` |
| Evidence dossier | ✅ Live | Case → Evidence tab | `audit-evidence-dossier.png` |
| Query drawer/dock | ✅ Live | Recoup Agent + ran query | `audit-query-answer-dock.png` |
| Agent Trace | ✅ Live | Case → Agent Trace tab | `audit-agent-trace.png` |
| Draft review | ✅ Live | Case → Draft tab | `audit-draft-review.png` |
| Approval dialog | ✅ Live | Draft → Open approval | `audit-approval-dialog.png` |
| Audit panel | ✅ Live | Case → Audit tab | `audit-audit-panel.png` |
| Sidebar expanded/collapsed | ✅ Live | Toggled both states | `audit-sidebar-collapsed.png` |
| Logout/session area | ✅ Live | Clicked Sign out → /login | (redirect verified) |
| Loading states | ✅ Live | Case-open skeleton | `audit-case-detail.png` |
| Empty states | ✅ Live | Worklist search no-match | `audit-empty-state.png` |
| Error states | ⚠ Documented | Fail-closed loading→error path (`maya-forensics-surface.tsx:1042`); not force-induced on prod | — |
| Disabled states | ✅ Live | Refresh, approval buttons, Filter, View audit trail | `audit-approval-dialog.png`, `audit-audit-panel.png` |

Recoup Agent / chat flow additionally exercised end-to-end with a live query (idle → running → cited answer): `audit-query-dock.png`, `audit-query-running.png`, `audit-query-answer-dock.png`.

---

## 3. Findings — Ordered P0 / P1 / P2

### P0 — Blocks a production visual pass

#### P0-1 · Backend-gap vocabulary is the primary visual content
The loudest text on nearly every screen describes what the backend *didn't* return. Concentrations:
- **Beat-12 worklist** columns literally titled `Priority (gap)`, `Age (gap)`, `Last updated (gap)` with `n/a` cells, plus a footer "Backend gaps: Priority, Age, Status history, …" — `maya-forensics-surface.tsx:1276-1291`, `:1393`.
- **Worklist** "Read-model gaps" / "Fetched rows only" badges — `deduction-worklist-table.tsx:184`, `:445`.
- **Draft review** rail has a dedicated **"Backend gaps"** bulleted list — `recovery-draft-review.tsx:42-47`, `:279-289`.
- **Audit receipt** table renders rows whose *value* is literally "Backend contract gap" — `audit-confirmation-panel.tsx:228-258`.
- **Case workspace** scatters "Contract gap", "Unavailable", "Backend formatted", "Backend row-switch gap" — `deduction-case-workspace.tsx:145`, `:181-184`, `:175`, `:472`.

**Impact:** A judge scanning for "verdict, money, next action" instead reads engineering caveats. This is the single thing keeping the product off a premium tier.

#### P0-2 · The verdict has no semantic color
Verdict badges use `variant="secondary"`, which maps to `--bg-subtle` (#F4F4F5, pale grey), plus a `data-verdict` attribute that is **styled nowhere**. Confirmed by search: the only `verdict` CSS in the repo is the legacy `.verdict-cell` / `.next-action-cell` rules (`styles.css:2485-2492`), which the shadcn surface does not use. Result: `valid`, `invalid`, `dispute`, `review` all render as the **same grey pill**, differentiated only by a green check icon on `valid`.
- Evidence: `deduction-worklist-table.tsx:358-367`, `maya-forensics-surface.tsx:430-433`, `:714-719`.
- The semantic ramps already exist and are unused here: `tokens.css:41-47` (success/info/warning/danger/dispute/escalated text+bg+border).

**Impact:** In a deduction-*forensics* cockpit, the verdict is the headline signal — and it is effectively invisible.

#### P0-3 · The Approval dialog ships permanently inert
`evidenceReviewEligibilityAvailable` defaults to `false` (`approval-gate-dialog.tsx:48`) and the caller never passes it true (`recovery-draft-review.tsx:347-355`). Consequently the dialog **always** shows a destructive "Approval blocked by missing eligibility" banner (`:171-178`), all decision buttons are disabled (`:80-82` `isDecisionDisabled`), and "Contract gap" sits next to the approver (`:201-204`).

**Impact:** The marquee agentic action — human-in-the-loop approval — cannot be demonstrated. This is both a visual and a functional failure for a demo. (If the eligibility field genuinely isn't exposed by the backend, this is a proven UI→contract gap worth raising to backend; it is the one place a backend change may be warranted.)

### P1 — High-impact, fix before judging

#### P1-1 · Agent Trace looks like logs, not reasoning
Each node is a row of `N records / N citations / phase / hook` badges plus raw record IDs and infrastructure labels ("OpenAI Agents SDK trace", "Supabase retrieval", "SAP OData") — `agent-trace-panel.tsx:182-187`, `:536-560`, `:639-650`. The brief explicitly wants Maya to feel "trustworthy, not like backend plumbing."
**Fix:** Lead each node with a plain-language step narrative; move IDs/hooks/phases/source-kind entirely into the existing "Trace details" accordion (`:192-294`).

#### P1-2 · Raw record IDs and `lineId`s are first-class chips
`RecordIdStrip` renders backend IDs as visible secondary badges across dossier, draft, approval, audit, and case timeline (`deduction-case-workspace.tsx:435-453`, `recovery-draft-review.tsx:464-482`, `approval-gate-dialog.tsx:222-234`, `audit-confirmation-panel.tsx:399-417`). The line selector also shows the raw `lineId` under each "Line N" pill (`deduction-case-workspace.tsx:219`).
**Fix:** IDs belong only behind "Source details" / "View details" disclosures. The pattern already exists (`evidence-dossier.tsx:85-100`, `query-evidence-dock.tsx:255-291`) — apply it everywhere and drop the raw `lineId` subtext from the selector.

#### P1-3 · Dead / inert controls read as unfinished or broken
A premium UI does not ship visible controls that do nothing. There are **two sub-classes** here — and a complete enumeration is in §3a (the first audit pass captured only representative examples, which understated the count).

**(a) Permanently-disabled controls:** Header "Refresh" (`maya-workspace-shell.tsx:238-247`), dossier "Filter" / "View options" (`evidence-dossier.tsx:55-62`), audit "View audit trail" (`audit-confirmation-panel.tsx:179-182`), the worklist row-menu item "Deep evidence switching requires backend support" (`deduction-worklist-table.tsx:426`), and the login "Forgot password?" link (P2-6).

**(b) Controls that *look* live but are no-ops:** In the sticky draft command bar, **"Request changes" and "Reject draft"** (`recovery-draft-review.tsx:311-332`) are styled as primary workflow actions but their only effect is to flip a caption to "Request changes prepared" / "Reject draft prepared" (`:306-308`, `commandIntentLabel`). They open no dialog, record nothing, and change no state. This is worse than a disabled button — it *invites* a click and then appears to do nothing. A judge will read it as broken.

**Fix:** Hide disabled controls or convert them to quiet inline notes; and either wire "Request changes"/"Reject draft" to real flows (e.g., open the approval dialog pre-set to that decision) or remove them and keep a single "Open approval" CTA.

#### P1-4 · Grey-on-grey palette
The shadcn theme maps `secondary`, `muted`, and `accent` **all** to the same `--bg-subtle` (`styles.css:56-61`). The burnt-orange `--color-accent` (#C2410C) appears in only ~2 places (one KPI tile at `maya-run-kpi-strip.tsx:55-57`, and the login subtitle). Net effect: zinc-grey cards on a near-white canvas with grey badges — the "default Tailwind blandness" the rubric warns against. The semantic ramps in `tokens.css:40-55` are defined but largely unused on this surface.

#### P1-6 · The agent/chat flow is not conversational (full detail in §4b)
Verified live: after a cited answer renders, the composer is removed, so there is no follow-up — it is a single-shot query form, not an agent chat. The answer text also lives in a separate "Citation review" card rather than the "Maya" bubble, and the basis is shown as tool/SDK names ("runForensicsInvestigation … OpenAI Agents SDK live trace"). See findings C-1…C-8 (§4b) and Fix H (§6). This is the **least intuitive surface in the product** and the user-flagged pain point.

#### P1-5 · Login has dead horizontal space
At ≥1440 the ~590px card floats centered with large empty zones; the signature atmospheric outlines are too faint to register (see screenshot). The "Workspace / Forensics" field uses a search icon and reads like an editable search box rather than a fixed context label.

### P2 — Polish

- **P2-1** "Welcome back, Maya / Here's what's happening in Maya Forensics" (`maya-workspace-shell.tsx:93-94`) is consumer-app tone; an enterprise cockpit header should state the run/queue context (e.g., "Morning run · N cases · $X exposure").
- **P2-2** Empty states all use the same generic inbox icon (`maya-empty-state.tsx:1`); vary the icon per context (no evidence, no notes, no timeline).
- **P2-3** KPI value font-size switches between 1.9rem and 1.45rem based on string length (`maya-run-kpi-strip.tsx:70-72`), producing uneven baselines across the strip; prefer one size + `truncate`.
- **P2-4** "Advisory only", "Local focus", "Read-model backed", "Backend formatted" micro-badges add noise; keep one provenance signal per card, not three.
- **P2-6** **"Forgot password?" on /login is a silently-inert link.** It renders as a clickable `variant="link"` button but is `disabled` ([login-form.tsx:242-254](cockpit/app/login/login-form.tsx#L242)); clicking does nothing and the only explanation ("Password recovery is unavailable in this deterministic demo login") is `sr-only`, so sighted users get no feedback. Same dead-control anti-pattern as Refresh/Filter/View audit trail (P1-3). **Fix:** for the demo, remove it entirely (cleanest), or replace with visible muted helper text ("Password recovery unavailable in demo") instead of a link-styled control. Verified live in the login screenshot.
- **P2-5** Cards are uniformly `rounded-lg` with `shadow-none`/`shadow-xs` — consistent (good), but the total absence of elevation makes the workbench feel like one undifferentiated sheet. The two-tier shadow tokens exist (`tokens.css:77-78`); apply `--shadow-sm` to the selected/active card to create focus.

---

## 3a. Complete Dead / Inert-Control Inventory

> Added after the first pass under-reported this class (it named ~3 examples instead of enumerating all). This is the full list of controls that are visible but do nothing — the "did it break?" risk surface a judge can hit.

| # | Control | File:line | Type | Effect when clicked | Recommendation |
|---|---|---|---|---|---|
| 1 | "Forgot password?" (login) | `login-form.tsx:242` | Disabled link | Nothing; reason is `sr-only` | Remove or visible muted note |
| 2 | Header "Refresh" | `maya-workspace-shell.tsx:238` | Disabled button | Nothing (tooltip only) | Hide until backend refresh exists |
| 3 | Evidence "Filter" | `evidence-dossier.tsx:55` | Disabled button | Nothing | Hide until filtering exists |
| 4 | Evidence "View options" | `evidence-dossier.tsx:59` | Disabled button | Nothing | Hide until options exist |
| 5 | Audit "View audit trail" | `audit-confirmation-panel.tsx:179` | Disabled button | Nothing | Hide until trail view exists |
| 6 | Worklist row menu "Deep evidence switching requires backend support" | `deduction-worklist-table.tsx:426` | Disabled menu item | Nothing | Remove from menu |
| 7 | Approval "Approve / Reject / Request changes" | `approval-gate-dialog.tsx:270` | Disabled (eligibility false) | Nothing (P0-3) | Wire eligibility (Fix C) |
| 8 | **Draft "Request changes"** | `recovery-draft-review.tsx:311` | **No-op (looks live)** | Sets caption "Request changes prepared" only | Wire to approval flow or remove |
| 9 | **Draft "Reject draft"** | `recovery-draft-review.tsx:322` | **No-op (looks live)** | Sets caption "Reject draft prepared" only | Wire to approval flow or remove |
| 10 | Header bell / "Run date unavailable" | `maya-workspace-shell.tsx:206-234` | Static (non-interactive by design) | n/a — but styled like a control | Make non-control styling explicit |

Rows 1, 6, 8, 9 were missed in the first pass. Rows 8–9 are P1-level (they invite a click and appear broken); the rest are P1-3 / P2 polish.

**Live verification (in-browser, not source-inferred):**
- Row 1 "Forgot password?" — Playwright click **timed out: "element is not enabled"** → confirmed disabled.
- Row 8 "Request changes" — clicked live: caption changed `No draft command prepared` → `Request changes prepared`; `[role=dialog]/[role=alertdialog]` count = **0** → confirmed no-op.
- Row 9 "Reject draft" — clicked live: caption → `Reject draft prepared`; dialog count = **0** → confirmed no-op. Evidence: `audit-draft-command-bar-noop.png` (the bar itself reads "Command buttons prepare the next human step locally only").
- Row 6 — opened the S1 row menu live: items = `Open work item` (enabled), `Deep evidence switching requires backend support` (`disabled: true`) → confirmed.

## 4. Component-Level Findings (with browser reproduction steps)

> Reproduction assumes an authenticated session as Maya landing on `/forensics/shadcn`.

| Component | File | Issue | Reproduction |
|---|---|---|---|
| Worklist table | `deduction-worklist-table.tsx` | Grey verdict; "Read-model gaps" badge; checkbox doubles as row-select (ambiguous affordance) | Open Worklist tab → observe verdict column + header-right badge |
| Beat-12 returned worklist | `maya-forensics-surface.tsx:1157` | `(gap)` columns, `n/a` cells, "Backend gaps:" footer | Open a case → Audit tab → "Return to worklist" |
| Case header | `deduction-case-workspace.tsx:117` | All-grey `StaticStatusBadge`; "Amount read-only / Backend formatted" chrome | Open any case → inspect header badges + amount block |
| Agent Trace | `agent-trace-panel.tsx` | Record/citation/hook/phase badges as primary; infra names | Open case → Agent Trace tab |
| Approval dialog | `approval-gate-dialog.tsx` | Permanent "blocked by missing eligibility"; all buttons disabled | Open case → Draft tab → "Open approval" |
| Audit panel | `audit-confirmation-panel.tsx` | "Backend contract gap" receipt rows; disabled "View audit trail" | Open case → Audit tab → expand "Audit receipt details" |
| Evidence dossier | `evidence-dossier.tsx` | "Deterministic basis unavailable / Contract gap" alert beside live content | Open case → Evidence tab |
| Query dock | `query-evidence-dock.tsx` | Record-ID chips; "Cited query standby"; debug trace under accordion | Open case → "Query evidence" / Recoup Agent launcher |
| Header refresh | `maya-workspace-shell.tsx:238` | Permanently disabled button | Any authenticated page → top-right |

---

## 4b. Chat / Agent Flow Critique (Query Evidence dock + Recoup Agent)

> Applied the `/design-critique` framework (First impression · Usability · Hierarchy · Consistency · Accessibility) to the **live** agent flow: opened the Recoup Agent launcher, ran a real query ("Why is this deduction valid? Show cited evidence."), and observed the full round-trip. The backend answered live with a genuine cited answer — **functionally it works**. But the interaction design is the **least intuitive surface in the product**, confirming the concern raised. Score: **3.4 / 5.**
>
> Screenshots: `audit-query-dock.png` (idle), `audit-query-running.png` (running), `audit-query-answer-dock.png` (answered).

**First impression (2s):** It does not read as a conversation. The panel is titled "Query Evidence", leads with three policy badges ("Selected evidence context", "Read-only query", "Spanish ready"), a "Selected evidence packet" card, and a "Source details" accordion — the question box is the *fifth* thing down. It feels like a compliance form, not "ask Maya".

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| C-1 | **Not conversational — single-shot dead-end.** After an answer renders, the composer is *removed* (`shouldShowComposer = !isRunning && !canShowCitedAnswer`, `query-evidence-dock.tsx:77`). There is no visible "ask a follow-up"; the user must close the dock to query again. | 🔴 Critical | Keep the composer persistently visible below the answer; treat it as a real thread. |
| C-2 | **The answer is not in Maya's bubble.** The "Maya" bubble says only "Cited answer returned from backend evidence." with count badges; the *actual answer text* lives in a separate "Citation review" card below (`query-evidence-dock.tsx:363-373` vs `cited-answer-card`). Users read the assistant bubble first and find no answer. | 🔴 Critical | Put the answer prose inside the Maya bubble; make "Citation review" a quiet footer/disclosure. |
| C-3 | **Raw record IDs dumped into the answer prose.** The live answer ended: "…limited to cited record IDs: S3-L1, POD-SIGNED-1, INV-S3-1, SAP-90000000, INV-90000000, TOOLS-DATA:S3, USCU_L10, …". Backend IDs inside a human sentence. | 🟡 Moderate | Render the sentence without IDs; show citations as chips/footnotes below. |
| C-4 | **"Deterministic basis" shows tool/SDK names.** Live value: "runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace". Internal function and framework names shown to a business user. | 🟡 Moderate | Show a plain-language basis ("Verified against signed POD + invoice"); keep tool/SDK names in Trace details only. |
| C-5 | **Prompt chips are unusable as labels.** Three suggestion chips render as "SAP OData evidence", "SAP OData evidence" (duplicate visible label), "Contract-Reader basis" — the real question is hidden in the tooltip (`query-evidence-dock.tsx:309` uses `prompt.label`, a source name). You cannot tell what a chip will ask. | 🟡 Moderate | Use the actual question text as the chip label; de-duplicate. |
| C-6 | **Unexplained "Spanish ready" badge** appears twice (`dock.languageLabel`, `:235`, `:337`) on an English UI with no affordance to switch. | 🟢 Minor | Either expose a real language toggle or remove the badge. |
| C-7 | **Mid-run, the chat becomes a process map.** On submit, the thread is immediately replaced by the "Trace rail" + SAP source-context rows (`audit-query-running.png`). The wait state is plumbing, not "Maya is thinking". | 🟡 Moderate | Show a compact thinking indicator in the Maya bubble; keep the trace in its accordion. |
| C-8 | **Compliance chrome is repeated 4×.** "Citations required before display", "Citations required.", "Cited query standby", "Citation review / Accepted only after…" all co-exist. | 🟢 Minor | Keep one citation-policy line. |

**Visual hierarchy:** The eye lands on policy badges and the evidence-packet card, not the question field or the answer. Reading flow is inverted for a chat (controls top, answer buried mid-panel, CTA in a detached footer).

**Consistency:** Inconsistent with a chat paradigm users expect — right-aligned "You" bubble exists, but the assistant reply is split between a bubble and a separate card, and the composer disappears. The shadcn surface is otherwise consistent.

**Accessibility:** `aria-live="polite"` on the status region (good); textarea is labeled; but the duplicate-label chips (C-5) are ambiguous to screen-reader users too (same accessible name, different actions).

**What works:** The round-trip is genuinely live and returns a real cited answer; "Source details" and "Trace details" are correctly collapsed by default; the widen-to-review transition (456px → 936px) is a nice touch; citation counts are honest.

**Net:** Functionally impressive, conversationally broken. C-1 and C-2 are the two changes that would make it feel like an agent rather than a query form.

---

## 5. Real-Browser Evidence (Authenticated Walkthrough)

- **URL tested:** `https://recoup-self-eta.vercel.app` · **Browser / viewport:** Playwright Chromium · 1440×1000 · **User:** `Maya`
- **`/login` HTTP timing:** **200**, TTFB **1.56s** (the previously-reported 60s cold path is resolved).
- **Login:** `POST /api/demo-login` → **200** → redirected to `/forensics/shadcn` (correct landing).
- **Console errors (full session):** **0** (checked after login, after opening case, after approval dialog).
- **Network failures:** **0** app failures. The only failing/third-party traffic is `gc.kis.v2.scr.kaspersky-labs.com` — the local Kaspersky browser extension injecting into the page, **not** Recoup app traffic. Relevant only for clean QA captures, not a product defect.
- **Logout:** "Sign out" → redirected to `/login` cleanly.

**What was verified on screen:**
1. **Overview/landing** — KPI strip rendered with live values (8 open scenarios, **$112,400.00** exposure, $79,800 recovery queue, $32,600 billing protection, 20 HITL, 2 evidence sources). Source Readiness tiles live: **SAP OData "Probe failed"**, 6 synthetic, MCP "Connected" → "1 / 7 ready". Business-clean; this surface is the product's strongest. → screenshot `audit-overview-viewport.png`.
2. **Worklist** — verdict column shows "Valid deduction" and "Recovery" in the **identical pale-grey pill**; the "valid" check icon is grey, not green. **P0-2 confirmed.** → `audit-worklist-verdicts.png`.
3. **Open case (S3-4)** — clean loading state: skeleton + "Fetching governed detail packet" alert, then loaded with header, read-only amount **$21,300.00**, line selector, 5 tabs. → `audit-case-detail.png`, `audit-case-loaded.png`.
4. **Agent Trace** — numbered process map; each node's primary content is a grey badge row ("Source-backed / 18 records / 18 citations", "SAP OData / 16 records / 2 citations", "Contract Repo retrieval"), tagged "UI summary". Log-like. **P1-1 confirmed.** → `audit-agent-trace.png`.
5. **Approval dialog** — opens with "Approval blocked by missing eligibility"; **Approve / Reject / Request changes all disabled** (only Cancel active); "Approver: Verified human principal unavailable / Contract gap"; raw record-ID grid (`SAP-90000000`, `TOOLS-DATA:S3`, `USCU_L10`, `POD-SIGNED-1`…). **P0-3 + P1-2 confirmed.** → `audit-approval-dialog.png`.
6. **Evidence dossier** — grouped accordions (Invoice/POD), live Source provenance rail (Probe failed/Synthetic/Connected), and a "Deterministic basis unavailable / Contract gap" alert beside the basis; greyed Filter/View options. Evidence items lead with raw SAP names. "Source details" correctly hides record IDs behind a disclosure (the pattern that should be applied everywhere). **P0-1 + P1-3 confirmed.** → `audit-evidence-dossier.png`.

### Checklist verification

| Check | Result |
|---|---|
| `/login` loads quickly | ✅ 200, TTFB 1.56s |
| `/api/demo-login` returns 200 | ✅ **Verified live** — 200, set session, redirected |
| Lands on `/forensics/shadcn` after login | ✅ **Verified live** |
| No console errors | ✅ **0 across the full authenticated session** |
| No failed network calls | ✅ 0 app failures (Kaspersky extension noise only) |
| No fake/static business values | ✅ **Strong pass** — gaps labeled precisely because values are never invented |
| Backend plumbing not primary content | ❌ **Fail** — P0-1, P1-1, P1-2 all confirmed live |

---

## 6. Recommended Fix Plan

> **This report is an implementation brief for an automated coding agent (Codex), not a judge deck.** Fixes below are written to match this repo's exact design-system idiom. Read §6.0 before applying anything.

### 6.0 Design-system constraints (Codex MUST follow)

This is **Tailwind v4 + shadcn/ui** with a token layer. Do not invent colors, hex values, or spacing.

1. **Token source of truth:** `tokens.css` (`:root`). Semantic ramps already exist and are unused on the Maya surface:
   `--status-success-{text,bg,border}`, `--status-danger-*`, `--status-warning-*`, `--status-dispute-*`, `--status-info-*`, `--status-escalated-*`, `--status-neutral-*`. Also `--color-accent: #C2410C`, spacing `--space-*`, radius `--radius-*`, shadow `--shadow-sm|md`.
2. **How colors reach Tailwind:** only vars mapped in the `@theme inline { … }` block of `cockpit/app/styles.css:7-44` become utilities (e.g. `--color-primary` → `bg-primary`). **The `--status-*` ramps are NOT mapped there yet.** So you have two correct options:
   - **Preferred:** register them in `@theme inline` (one-time), which yields reusable utilities like `bg-success-surface text-success`. (See Fix A step 1.)
   - **No-config fallback:** reference the raw var with the repo's existing arbitrary-value idiom — `text-[color:var(--status-success-text)]`, `bg-[color:var(--status-success-bg)]`, `border-[color:var(--status-success-border)]`. This idiom is already used at `source-readiness-strip.tsx:33-41` and via `color-mix(in_oklch, …)` at `button.tsx:16`. **Do not write `bg-[--status-success-bg]`** (missing `color:`/`var()` — invalid here).
3. **Add visual variants through `cva`,** not ad-hoc class strings at call sites. `badge.tsx` and `button.tsx` already use `cva` with a `variant` map — extend those maps.
4. **Preserve test hooks:** keep all `data-verdict`, `data-testid`, `data-status-tone`, `aria-*` attributes. Add color via the `variant`/`className`, never by removing attributes (invariant tests and the QA contract read them).
5. **Do not touch backend-owned values or labels** (amounts, verdict strings, counts, basis text). All fixes are presentation-only.
6. **After each fix run:** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build:cockpit`, and the relevant invariant tests in `tests/invariants/*` (esp. `maya-shadcn-qa-contract`, `cockpit-v12-premium-components`).

### 6.0a Color system — options for Codex to choose from

The goal is **one intuitive signal layer**, not more decoration. Color should encode exactly one thing on a given surface (the **verdict/status**), never ornament. All three options below stay inside the existing token system — **no new brand hues required.** If Codex judges a richer palette is warranted, Option D notes the only sanctioned way to add tokens. **Pick per surface; you may blend (e.g., B for tables, A for dialogs).**

**Canonical mapping (applies to every option):** `valid → success`, `invalid → danger`, `review/recovery → warning`, `dispute → dispute`, `escalated → escalated`, `source-backed/info → info`, `neutral/unknown → neutral`. Money/amounts stay **neutral** (encode with weight + `tabular-nums`, never color). Reserve `--color-accent` (#C2410C) for "needs human action," nothing else.

| Option | Treatment | Best for | Pros | Cons |
|---|---|---|---|---|
| **A — Soft filled tint** (current Fix A) | Full pill: `bg-*-surface text-* border-*-border` | Dialogs, single-verdict headers | Zero layout change; on-brand; fastest | With many badges/row, several filled pills still read busy |
| **B — Edge + neutral chip** *(recommended for tables)* | Verdict = colored **dot** (`size-2 rounded-full bg-[color:var(--status-…-text)]`) **or** a 2px colored **left border** on the row; label text stays high-contrast neutral. Filled tint reserved for the **one** verdict pill only | Worklist, Cases, Approvals (dense rows) | Highest signal-to-noise; scales to many rows; most "premium analyst" feel; directly attacks the §1 grey-wall + density finding | Slightly more layout work (row border / dot column) |
| **C — Accent-forward minimal** | Everything neutral **except** the verdict tint (Option A) and a single `--color-accent` marker on rows needing action | Overview, KPI strip | Maximum contrast by minimizing color elsewhere; cheapest density win | Less status nuance at a glance |
| **D — New tokens (only if Codex decides A–C insufficient)** | Add NEW vars to `tokens.css` `:root` **and** map them in `@theme` | A deliberate richer redesign | More vivid/distinct | Token sprawl; must re-check WCAG + brand; out of scope for a pure presentation fix |

**Recommendation (non-binding — Codex's call):** **B for the dense tables** (worklist/cases/approvals) + **A for the dialogs/headers** (approval dialog, case header, evidence dossier). This gives the strongest intuitiveness lift while keeping the canvas calm. Rationale: a row full of *filled* colored pills (Option A everywhere) can re-create visual noise; a single colored dot/edge per row is more scannable and more enterprise-grade.

**Accessibility constraint (any option):** the `tokens.css` pairings are dark-text-on-pale-tint and already pass WCAG AA for body text; if you switch to colored text on white (dots/edges), keep the **text** neutral (`--text-primary`) and use color only on the **dot/border/icon**, so contrast never depends on the hue. Do not rely on color alone — keep the verdict **label** (and the `valid` check icon) as the redundant cue.

**Exact hex (all from `tokens.css`, for reference):** success `#166534/#DCFCE7/#86EFAC` · danger `#991B1B/#FEE2E2/#FCA5A5` · warning `#92400E/#FEF3C7/#FBBF24` · dispute `#5B21B6/#EDE9FE/#C4B5FD` · info `#075985/#E0F2FE/#7DD3FC` · escalated `#9A3412/#FFEDD5/#FDBA74` · neutral `#334155/#F1F5F9/#CBD5E1` · accent `#C2410C`.

### Fix A — Semantic verdict color (resolves P0-2, biggest gestalt win)
- **Files:** `cockpit/app/styles.css`, `cockpit/components/ui/badge.tsx`, then verdict call sites.
- **Visual issue:** Verdict (the headline forensic signal) renders as grey `variant="secondary"`; `data-verdict` is styled nowhere.

**Step 1 — register status tokens** in the `@theme inline` block of `cockpit/app/styles.css` (after the existing `--color-*` lines, ~`:31`):
```css
/* status ramp → Tailwind utilities (text-success, bg-success-surface, border-success-border, …) */
--color-success: var(--status-success-text);
--color-success-surface: var(--status-success-bg);
--color-success-border: var(--status-success-border);
--color-danger: var(--status-danger-text);
--color-danger-surface: var(--status-danger-bg);
--color-danger-border: var(--status-danger-border);
--color-warning: var(--status-warning-text);
--color-warning-surface: var(--status-warning-bg);
--color-warning-border: var(--status-warning-border);
--color-dispute: var(--status-dispute-text);
--color-dispute-surface: var(--status-dispute-bg);
--color-dispute-border: var(--status-dispute-border);
```

**Step 2 — add `cva` variants** to `badge.tsx` (inside `variants.variant`, after `link:` at `:21`):
```tsx
valid:   "border-success-border bg-success-surface text-success",
invalid: "border-danger-border  bg-danger-surface  text-danger",
dispute: "border-dispute-border bg-dispute-surface text-dispute",
review:  "border-warning-border bg-warning-surface text-warning",
```

**Step 3 — add an exhaustive mapping helper** (new file `cockpit/components/maya/verdict-badge-variant.ts`). First read the `verdict` union in `cockpit/components/maya/types.ts` and map every member (do not use `default` to hide unmapped members — make it a `satisfies`-checked exhaustive switch):
```tsx
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { MayaWorklistItem } from "./types";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
export function verdictBadgeVariant(verdict: MayaWorklistItem["verdict"]): BadgeVariant {
  switch (verdict) {
    case "valid":   return "valid";
    case "invalid": return "invalid";
    case "dispute": return "dispute";
    // map recovery / review / partial-recovery → "review"; adjust to the real union members
    default:        return "review";
  }
}
```

**Step 4 — swap call sites** (keep `data-verdict`): replace the verdict `Badge variant="secondary"` with `variant={verdictBadgeVariant(item.verdict)}` at:
`deduction-worklist-table.tsx:140`, `:248`, `:358-367`; `maya-forensics-surface.tsx` positive-cases verdict cell (~`:430`, `:714`); `deduction-case-workspace.tsx` header verdict badge (`StaticStatusBadge`).

- **Regression check:** extend a `tests/invariants/*` test asserting each verdict value yields its variant class; visual snapshot of the worklist verdict column.

### Fix B — Demote gap vocabulary (resolves P0-1)
- **Files:** `maya-forensics-surface.tsx` (Beat-12 table + footer), `deduction-worklist-table.tsx`, `recovery-draft-review.tsx`, `deduction-case-workspace.tsx`.
- **Change:** Remove `(gap)` column suffixes (`:1276`, `:1284`, `:1289`) and the "Backend gaps:" footer (`:1393`); collapse the draft-rail "Backend gaps" list (`:279-289`) into a single quiet "Some fields pending from source" tooltip using the existing `CircleHelpIcon` affordance (`deduction-worklist-table.tsx:74-83`).
- **Expected improvement:** Primary layer becomes business content; caveats move on-demand.
- **Regression check:** QA contract test updated to assert gap copy lives behind disclosure, not in headers/footers.

### Fix C — Wire approval eligibility (resolves P0-3)
- **Files:** detail-packet model → `recovery-draft-review.tsx` → `approval-gate-dialog.tsx`.
- **Change:** Thread `evidenceReviewEligibilityAvailable` from the backend detail packet to the dialog so decisions enable when permitted. If the backend truly does not expose the field, raise as a contract gap to backend (the one justified backend touch).
- **Expected improvement:** The HITL approval flow becomes demonstrable.
- **Regression check:** E2E that opens the dialog with eligibility true and asserts Approve/Reject/Request-changes are enabled.

### Fix D — De-plumb the Agent Trace (resolves P1-1)
- **File:** `agent-trace-panel.tsx`.
- **Change:** Lead each node with the human-readable `message`; move record/citation counts, hook, phase, source-kind, and infra labels into the "Trace details" accordion.
- **Regression check:** Snapshot of the process map showing no raw IDs/hooks in the primary list.

### Fix E — Hide raw IDs + dead buttons (resolves P1-2, P1-3)
- **Files:** all `RecordIdStrip` call sites; `maya-workspace-shell.tsx`, `evidence-dossier.tsx`, `audit-confirmation-panel.tsx`.
- **Change:** Render record IDs only inside disclosure panels; remove the raw `lineId` subtext from the line selector; hide or downgrade permanently-disabled buttons.

### Fix F — Color + elevation pass (resolves P1-4, P2-5)
- **Files:** `cockpit/app/styles.css` (`@theme`), `maya-run-kpi-strip.tsx`, selected-row/card styles.
- **Token wiring (do this, don't hardcode):** the accent and shadows already exist as tokens but aren't Tailwind utilities. Either register in `@theme inline` — `--color-accent: var(--color-accent);` is already implied via `tokens.css`; if not exposed, add `--color-accent` to the `@theme` block — and reference shadows as arbitrary values `shadow-[var(--shadow-sm)]` / `shadow-[var(--shadow-md)]` (they are not in `@theme`).
- **Change:** (a) Give the KPI strip one deliberate `--color-accent` anchor (e.g. the Exposure tile value/icon) instead of all-grey; (b) on the selected case/row add `shadow-[var(--shadow-sm)]` + a `--color-accent`/primary left-border so the active item lifts out of the grey field. Keep elevation to the existing two tiers only (`--shadow-sm`, `--shadow-md`).
- **Density (ties to the gestalt):** in the worklist/case header, cap visible badges per row to the 2 that matter (verdict + queue); move evidence-score, routing-duplicate, and provenance micro-badges behind the row or a tooltip. Target: < ~25 badges/viewport (currently 64 — see §1 First Impression).

### Fix G — Login composition (resolves P1-5)
- **File:** `cockpit/app/login/login-form.tsx`, `login/page.tsx`.
- **Change:** Constrain/balance the canvas (e.g., a right-side brand/value panel or stronger atmospheric geometry); restyle the "Workspace" field as a fixed context chip, not a search input.

### Fix H — Make the agent flow conversational (resolves §4b C-1…C-8)
- **File:** `cockpit/components/maya/query-evidence-dock.tsx`, `cited-answer-card.tsx`.
- **Visual issue:** The chat flow is a single-shot query form, not an agent conversation (see §4b).
- **Changes:**
  - **C-1:** Keep the composer mounted after an answer (don't gate on `!canShowCitedAnswer` at `:77`); allow follow-up questions in a persistent thread.
  - **C-2:** Render the answer prose *inside* the "Maya" bubble (`:363-373`); demote "Citation review" to a quiet footer/disclosure.
  - **C-3:** Strip raw record IDs from the answer sentence; show them as citation chips/footnotes.
  - **C-4:** Replace the tool/SDK basis string ("runForensicsInvestigation … OpenAI Agents SDK live trace") with plain-language basis; keep tool names in Trace details only.
  - **C-5:** Use the actual question text as prompt-chip labels (`:309`); de-duplicate.
  - **C-6:** Remove or wire the "Spanish ready" badge (`:235`, `:337`).
  - **C-7:** During the run, show a compact "Maya is thinking" indicator in the bubble; keep the trace rail in its accordion.
- **Expected improvement:** Reads as "ask Maya, get a cited answer, ask again" — an agent, not a form.
- **Regression check:** E2E that runs a query, asserts the composer is still present after the answer, and asserts the answer text is in the assistant bubble.

---

## 7. What To Remove
- `(gap)` column headers, the "Backend gaps:" footer, and the draft-rail "Backend gaps" list.
- Visible `RecordIdStrip` chips outside disclosure panels.
- Raw `lineId` text under line-selector pills.
- Permanently-disabled Refresh / Filter / View options / View audit trail buttons (or convert to quiet notes).
- The silently-disabled "Forgot password?" link on /login (P2-6) — remove it or replace with visible muted helper text.
- Redundant provenance micro-badges (keep one per card).

## 8. What To Emphasize
- **Verdict** (with color) and **amount** (the `tabular-nums` + read-only lock treatment is already good).
- The **KPI strip** (`maya-run-kpi-strip.tsx`) — the most premium element; let it anchor the Overview with deliberate accent color.
- A **plain-language Maya narrative** at the top of Agent Trace, before any IDs.
- The **sidebar** — already a 4.3; let its dark, confident treatment set the tone the content area should match.

## 9. Strengths Worth Preserving
- **Data integrity discipline** is exemplary — no invented values anywhere (strong pass on the brief's anti-fake-data requirement).
- **Login, sidebar, KPI strip, skeleton loaders** show genuine craft.
- **Consistent component system** (shadcn) with coherent radius/spacing tokens.
- **Accessibility hygiene**: `aria-*`, `tabIndex`, keyboard handlers, focus-visible rings are present throughout.

---

## 10. Final Pass/Fail Recommendation

**FAIL for demo/judging readiness at the premium bar.**

Functionality and data-integrity discipline are genuinely strong, and the chrome (sidebar, login, KPI strip, skeletons) shows real craft. But the cockpit currently **presents as a backend diagnostics console**, the **verdict has no color**, and the **flagship approval action is inert**. Crucially, none of the three P0s require backend business-logic changes or invented data — they are presentation-layer fixes (demote gap copy, color the verdict, wire one eligibility flag).

Land the three P0s plus P1-1 and P1-2, and the cockpit moves from **~3.7 to a credible ~4.5** — genuinely judge-ready.

---

## Appendix A — Files Reviewed

```
tokens.css
cockpit/app/styles.css (shadcn theme mapping; legacy route CSS noted as out-of-scope for Maya surface)
cockpit/app/forensics/shadcn/page.tsx
cockpit/app/api/demo-login/route.ts
cockpit/app/login/login-form.tsx
config/cockpitDemoProfiles.ts
cockpit/components/maya/maya-forensics-surface.tsx
cockpit/components/maya/maya-workspace-shell.tsx
cockpit/components/maya/maya-run-kpi-strip.tsx
cockpit/components/maya/deduction-worklist-table.tsx
cockpit/components/maya/deduction-case-workspace.tsx
cockpit/components/maya/evidence-dossier.tsx
cockpit/components/maya/query-evidence-dock.tsx
cockpit/components/maya/agent-trace-panel.tsx
cockpit/components/maya/recovery-draft-review.tsx
cockpit/components/maya/approval-gate-dialog.tsx
cockpit/components/maya/audit-confirmation-panel.tsx
cockpit/components/maya/source-readiness-strip.tsx
cockpit/components/maya/maya-empty-state.tsx
```

## Appendix B — Screenshot Evidence (captured live)

All images in `docs/qa/screenshots/`.

### Login
![Login](screenshots/audit-login-1440.png)

### Overview / landing (business-clean — the product's strongest surface)
![Overview](screenshots/audit-overview-viewport.png)

### Worklist — P0-2: "Valid deduction" and "Recovery" render in the identical grey pill
![Worklist verdicts](screenshots/audit-worklist-verdicts.png)

### Case detail — loading state, then loaded
![Case loading](screenshots/audit-case-detail.png)
![Case loaded](screenshots/audit-case-loaded.png)

### Cases — clean table, but grey verdicts + large empty zone below
![Cases](screenshots/audit-cases.png)

### Evidence (root section) — cleaner than expected, but sparse
![Evidence section](screenshots/audit-evidence-section.png)

### Approvals — strongest data surface: dense Action-inbox, real amounts, no gap copy
![Approvals](screenshots/audit-approvals.png)

### Agent Trace — P1-1: log-like badge rows + infra names
![Agent trace](screenshots/audit-agent-trace.png)

### Draft review — read-only amount block + "Backend gaps" rail section
![Draft review](screenshots/audit-draft-review.png)

### Audit panel — P0-1: "Unavailable / missing / unavailable receipt fields" + raw IDs
![Audit panel](screenshots/audit-audit-panel.png)

### Sidebar collapsed + full Overview — premium chrome; note grey verdicts persist
![Sidebar collapsed](screenshots/audit-sidebar-collapsed.png)

### Empty state — worklist search no-match
![Empty state](screenshots/audit-empty-state.png)

### Draft command bar — P1-3(b): "Request changes"/"Reject draft" are no-ops (live-verified)
![Draft command bar no-op](screenshots/audit-draft-command-bar-noop.png)

### Approval dialog — P0-3: all decision buttons disabled ("blocked by missing eligibility")
![Approval dialog](screenshots/audit-approval-dialog.png)

### Evidence dossier — P0-1 contract-gap alert; Source details correctly hidden
![Evidence dossier](screenshots/audit-evidence-dossier.png)

### Chat / Agent flow (§4b) — idle, running, answered
![Query dock idle](screenshots/audit-query-dock.png)
![Query running](screenshots/audit-query-running.png)
![Cited response](screenshots/audit-query-answer-dock.png)

Full set (20 files): `audit-login-1440.png`, `audit-overview-landing.png`, `audit-overview-viewport.png`, `audit-worklist.png`, `audit-worklist-verdicts.png`, `audit-cases.png`, `audit-evidence-section.png`, `audit-approvals.png`, `audit-case-detail.png`, `audit-case-loaded.png`, `audit-agent-trace.png`, `audit-draft-review.png`, `audit-approval-dialog.png`, `audit-audit-panel.png`, `audit-evidence-dossier.png`, `audit-sidebar-collapsed.png`, `audit-empty-state.png`, `audit-query-dock.png`, `audit-query-running.png`, `audit-query-answer.png`, `audit-query-answer-dock.png`.

## Appendix C — Method Notes

- Critique of the chat/agent flow (§4b) applied the `/design-critique` skill framework (First impression · Usability · Visual hierarchy · Consistency · Accessibility).
- Screens not individually screenshotted (Cases, Approvals section, Audit panel, sidebar-collapsed) are scored from live observation of their shared components plus source review; re-capture on request.
