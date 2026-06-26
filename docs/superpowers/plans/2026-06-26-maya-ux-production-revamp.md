# Maya UX Production Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the Maya Deduction Forensics shadcn surface into a production-grade agentic analyst cockpit with clear visual hierarchy, unambiguous interactions, business-readable agent traceability, polished login/session controls, and real-browser QA coverage.

**Architecture:** Keep backend/read-model content unchanged and improve only presentation, component state, layout, accessibility, and test coverage. All business-visible dollars, verdicts, counts, recommended actions, evidence states, source readiness, and trace receipts must remain sourced from existing backend/API/read-model data with provenance; missing data must fail closed instead of being invented. The UI revamp is organized as small TDD slices across login/session, workspace shell, worklist, case header, line switcher, tabs, overview, evidence, agent trace, query launcher, and loading/error states.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, lucide-react, Vitest, Playwright-backed E2E scripts, Recoup cockpit API, existing Maya read models.

---

## 1. Scope And Non-Negotiables

### In Scope

- Login presentation, load-state feedback, password focus styling, and logout visibility.
- Production Vercel login and page-load performance diagnosis, including cold/warm timing and deployment telemetry.
- Maya workspace visual hierarchy and information layout.
- Worklist row interaction and selected-state clarity.
- Case detail command header, verdict prominence, amount read-only presentation, and positive valid-deduction highlighting.
- Line selector replacement for ambiguous `S2-L1` / `S2-L2` pill controls.
- Static badge vs clickable action vs selection vs navigation taxonomy.
- Overview density using backend-backed stats only.
- Agent Trace redesign from debug-card grid to business-readable timeline with collapsible technical receipts.
- Evidence and source detail grouping that surfaces business labels first and raw IDs second.
- Recoup Agent launcher on the logged-in workspace.
- Empty, loading, unavailable, disabled, and error states.
- Desktop real-browser QA. Mobile QA is deferred for this pass per owner direction on 2026-06-26.

### Out Of Scope

- No backend business rule changes.
- No new source mappings, thresholds, weights, model routing, or gold-label decisions.
- No new business metrics unless already present in backend/read-model data.
- No ERP write-back, autonomous dispatch, or approval bypass.
- No static or fixture data as product-visible replacement for missing backend data.

### Guardrails

| Guardrail | Required Behavior |
|---|---|
| I-1 / I-3 | UI must not compute or alter dollar amounts. Display backend-formatted/read-model values only. |
| I-7 / I-20 / I-23 | Any billing/recovery/approval action remains draft-only and human-gated. |
| I-12 | UI consumes canonical/read-model data; SAP/source details stay behind backend adapters. |
| I-17 / I-18 | Verdict and recovery/readiness states must retain cited record IDs and deterministic basis. |
| I-26 | No ERP mutation path or write-capable client can be introduced. |
| I-30 | Source provenance must stay honest; synthetic/unavailable sources cannot be styled as live. |

---

## 2. Current UX Findings To Fix

| Finding | Evidence From QA/User Feedback | Product Impact | Target State |
|---|---|---|---|
| Login exposes persona names | Login shows `Investigator`, `Reviewer`, `Maya`. | Feels like demo wiring rather than production login. | Normal login shows user/workspace credentials only; demo persona selector is hidden or dev-gated. |
| Login and page load can feel slow in production | User observed 10-20 seconds on the production Vercel URL; local warm browser timing is not sufficient evidence for this defect. | Users lack confidence before the product even starts. | Measure production cold/warm route timing, isolate Vercel function/render/API/source latency, and show polished pending states. |
| Password focus rectangle is harsh | Password input shows a hard rectangular blue outline. | Looks unfinished and visually noisy. | Accessible tokenized focus ring with consistent shadcn styling. |
| No logout | After login there is no visible session escape route. | Basic production session affordance missing. | Sidebar footer or user menu includes `Sign out`. |
| Page is grey and flat | Many panels, badges, tabs, and cards share similar grey weight. | User cannot instantly understand scenario/verdict/next step. | Clear surface hierarchy, semantic status color, stronger type scale. |
| Overview has large unused space | First viewport leaves material blank space. | Landing feels incomplete. | Backend-backed stats and positive valid-deduction signals fill the analyst overview. |
| Ambiguous line pills | Circled `S2-L1` / `S2-L2` look like passive tags. | Users cannot tell whether they are clickable or what changes. | Replace with a real `Line 1` / `Line 2` segmented control near selected-line context. |
| Static tags look clickable | Status badges and actions share similar pill treatment. | Users click labels that do not respond. | Static labels, actions, selections, and navigation each have distinct visuals and semantics. |
| Row actions are inconsistent | Prior browser QA found some rows opened case detail while others behaved differently. | Worklist feels unreliable. | One consistent row-open contract across all rows. |
| Agent Trace is too technical | Cards show `agent tool start`, `Live Agents SDK hook receipt`, `recordIds`. | Business users see plumbing instead of trust-building explanation. | Business timeline first; technical receipts collapsed. |
| Query/chat entry is hidden | No persistent Recoup Agent launcher after login. | Agentic product value is buried. | Bottom-right Recoup Agent launcher opens the grounded query dock. |

---

## 3. Design System Direction

### Surface And Color

Use a restrained enterprise SaaS palette with semantic accents:

```tsx
<section className="min-h-dvh bg-slate-50 text-slate-950">
```

```tsx
<div className="rounded-lg border border-slate-200 bg-white shadow-sm">
```

```tsx
<span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
  Valid deduction
</span>
```

```tsx
<span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
  Review required
</span>
```

```tsx
<span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
  Read-only
</span>
```

### Typography

| Role | Tailwind Direction |
|---|---|
| Page title | `text-2xl font-semibold tracking-normal text-slate-950` |
| Section title | `text-sm font-semibold text-slate-950` |
| Metadata label | `text-xs font-medium text-slate-500` |
| Body copy | `text-sm leading-6 text-slate-700` |
| Amounts | `font-mono tabular-nums text-2xl font-semibold text-slate-950` |
| Compact table data | `text-sm text-slate-700` |

### Interaction Taxonomy

| UI Element | Semantic Role | Tailwind Direction | Must Not |
|---|---|---|---|
| Status badge | Static state | `cursor-default select-none rounded-md ... ring-1` | No click handler, no pointer cursor, no hover action. |
| Action button | Performs an action | shadcn `Button`, `cursor-pointer`, visible hover/focus/pressed state | Must not look like a passive chip. |
| Selection control | Changes local selected item | `ToggleGroup` or segmented buttons with `aria-pressed` / selected state | Must not be a loose badge row. |
| Navigation | Moves between app sections | Sidebar item or `TabsTrigger` | Must not be mixed with status chips. |
| Disabled control | Temporarily unavailable action | Native `disabled`, reduced emphasis, tooltip/reason | Must not appear clickable without explanation. |

---

## 4. File Structure

### Likely Files To Modify

- `cockpit/app/login/page.tsx` - login route shell.
- `cockpit/app/login/login-form.tsx` - login form copy, persona display, focus/pending states.
- `cockpit/app/logout-button.tsx` - existing logout affordance to reuse or move into Maya shell.
- `cockpit/app/api/demo-logout/route.ts` - existing logout route; no business logic change expected.
- `cockpit/app/forensics/shadcn/page.tsx` - Maya route composition.
- `cockpit/components/maya/maya-workspace-shell.tsx` - sidebar, session controls, route chrome.
- `cockpit/components/maya/maya-forensics-surface.tsx` - top-level Maya composition and selected view state.
- `cockpit/components/maya/deduction-worklist-table.tsx` - row affordance, selected state, status/action separation.
- `cockpit/components/maya/deduction-case-workspace.tsx` - case header, line selector, tabs, overview layout.
- `cockpit/components/maya/agent-trace-panel.tsx` - timeline, collapsible technical receipts.
- `cockpit/components/maya/evidence-dossier.tsx` - evidence grouping and source detail presentation.
- `cockpit/components/maya/query-evidence-dock.tsx` - Recoup Agent dock behavior and launcher integration.
- `cockpit/components/maya/cited-answer-card.tsx` - cited answer and source collapse.
- `cockpit/components/maya/recovery-draft-review.tsx` - draft/readiness presentation.
- `cockpit/components/maya/audit-confirmation-panel.tsx` - audit proof hierarchy.
- `cockpit/components/maya/source-readiness-strip.tsx` - compact source health and tooltip detail.
- `cockpit/components/maya/maya-run-kpi-strip.tsx` - overview/KPI density.
- `cockpit/components/maya/maya-empty-state.tsx` - consistent empty/fail-closed states.
- `cockpit/app/styles.css` - token-level styles only; avoid route-specific bulk CSS.

### Likely Tests To Modify Or Add

- `tests/e2e/maya-real-backend-e2e.ts` - real backend browser journey and query tests.
- `tests/e2e/cockpit-premium-e2e.ts` - visual/interaction smoke coverage.
- `tests/invariants/maya-shadcn-qa-contract.test.ts` - UI contract assertions.
- `tests/invariants/cockpit-no-business-logic.test.ts` - no frontend dollar/verdict computation.
- `tests/invariants/maya-real-backend-contract.test.ts` - no fake/static data and provenance honesty.
- `tests/unit/cockpit-demo-auth.test.ts` - login/logout behavior.
- `tests/unit/cockpit.test.ts` - cockpit read-model presentation contracts.

---

## 5. Test Scenario Matrix

### Login And Session

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| L-01 | Login does not expose persona names | `/login` | Load page, inspect visible text. | `Investigator`, `Reviewer`, and `Maya` are not visible in normal login copy. |
| L-02 | Login pending state | `/login` | Submit valid demo credentials. | Button shows pending state within 300ms; page does not look frozen. |
| L-03 | Password focus polish | `/login` | Focus password input. | Focus ring is accessible and tokenized; no harsh full-width blue rectangle. |
| L-04 | Login timing budget | `/login` | Measure navigation and first meaningful render. | Warm local `/login` renders under 2s; slow state shows skeleton/pending UI. |
| L-05 | Logout visible after login | `/forensics/shadcn` | Log in and inspect sidebar/user area. | `Sign out` is visible and separate from normal navigation. |
| L-06 | Logout clears session | `/forensics/shadcn` | Click `Sign out`. | User returns to `/login`; protected page is not accessible without login. |

### Workspace Navigation

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| N-01 | Sidebar sections respond | `/forensics/shadcn` | Click Overview, Worklist, Cases, Evidence, Approvals. | Visible section changes; active sidebar item is clear. |
| N-02 | Tabs respond | Case detail | Click Overview, Evidence, Agent Trace, Draft, Audit. | Correct panel appears; active tab is clear and keyboard reachable. |
| N-03 | No dead controls | Full page | Enumerate visible buttons/links. | Every enabled control changes state, opens a panel, submits, or navigates. |
| N-04 | Disabled controls explain why | Full page | Inspect disabled controls such as Refresh. | Disabled controls have a visible or tooltip reason. |

### Worklist And Case Selection

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| W-01 | Row-open contract is consistent | Worklist | Click each visible row S1-S8. | All rows follow the same contract: either row opens case or explicit Open button does. |
| W-02 | Selected row is unmistakable | Worklist | Select S2-L1, then S3-L1. | Selected row has strong visual state and `aria-selected`. |
| W-03 | Static row badges are not clickable | Worklist | Inspect `Valid deduction`, `Billing`, `Review`, count chips. | No pointer cursor or click handler on static status chips. |
| W-04 | Row action is visually an action | Worklist | Inspect row action affordance. | Action uses button semantics and visible hover/focus state. |

### Case Header And Line Selector

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| C-01 | Verdict is immediately understood | Case detail | Open S2 case. | `Valid deduction` is prominent near title and paired with evidence basis/count. |
| C-02 | Amount remains read-only | Case detail | Inspect amount card. | Amount label says read-only/backend formatted; no editable control. |
| C-03 | Line selector is not badge-like | Case detail | Inspect line controls. | UI shows `Line 1` / `Line 2` segmented selector near selected-line context. |
| C-04 | Line switch changes local context honestly | Case detail | Click `Line 2`, then `Line 1`. | Selected line label, active state, and raw line metadata update; evidence/query/draft remain grounded to the backend-selected detail until the backend exposes row-switched evidence. |
| C-05 | Raw line IDs remain available | Case detail | Hover/open source detail. | `S2-L1` / `S2-L2` are available as metadata, not primary labels. |

### Overview And Positive Cases

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| O-01 | Overview first viewport is useful | Overview | Load logged-in landing view. | No large blank zone; panels show backend-backed operational stats. |
| O-02 | Valid deductions are highlighted | Overview/Worklist | Inspect S1/S2/S4 valid cases. | Positive cases use semantic success treatment and explain why they are valid. |
| O-03 | No fake KPI fallback | Overview | Simulate missing backend value via existing test fixture/fail-closed path. | Missing stat is omitted or shows `Source unavailable`; no invented number appears. |
| O-04 | Source readiness is business-readable | Overview | Inspect source health. | Primary text uses business/source labels; raw timestamps/details are secondary. |

### Evidence

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| E-01 | Evidence groups by business document type | Evidence tab | Open Evidence. | Groups use labels such as Invoice, POD, Contract, Promotion, Customer record. |
| E-02 | Raw IDs are secondary | Evidence tab | Open source details. | SAP/internal IDs appear only in tooltip/drawer/detail, not primary headings. |
| E-03 | Missing evidence fails closed | Evidence tab | Open case with unavailable evidence. | UI shows source/evidence unavailable state and no false completeness claim. |

### Agent Trace And Explainability

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| A-01 | Trace is business-readable by default | Agent Trace tab | Open tab. | Primary view is timeline: Scope, Retrieve, Reason, Draft/Handoff, Cited answer. |
| A-02 | Technical receipts are collapsed | Agent Trace tab | Inspect initial view. | SDK/tool records are hidden behind `Technical receipts` or equivalent collapsible detail. |
| A-03 | Timeline steps expand | Agent Trace tab | Expand each timeline step. | Business summary, record/citation count, and source status appear. |
| A-04 | Guardrail/source states are visible | Agent Trace tab | Inspect trust summary. | Code-computed/cited/read-only/human-gated states are visible without backend jargon. |
| A-05 | No fake/static trace rows | Agent Trace tab | Inspect trace rows. | Trace rows come from backend/read-model/agent trace receipts only. |

### Query / Recoup Agent

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| Q-01 | Launcher is visible after login | `/forensics/shadcn` | Load workspace. | Bottom-right Recoup Agent launcher is visible and keyboard accessible. |
| Q-02 | Launcher opens query dock | Workspace | Click launcher. | Grounded query dock opens with selected case/worklist context. |
| Q-03 | Prompt chips are compact and grounded | Query dock | Inspect prompt chips. | Chips are short, business-readable, and scoped to backend/read-model context. |
| Q-04 | Query answer remains cited | Query dock | Submit approved test query. | Answer includes citations; raw model text cannot provide uncited dollar/verdict changes. |

### Production Polish

| ID | Scenario | Route | Steps | Expected Result |
|---|---|---|---|---|
| P-01 | Loading states | Login/workspace/case | Trigger page/API pending state. | Skeleton or pending UI appears; no blank white freeze. |
| P-02 | Empty states | Worklist/evidence/trace/draft | Trigger no selected case/no results/no trace. | User sees specific empty state and recovery path. |
| P-03 | Mobile layout | 375px viewport | Deferred for this pass. | Not a release gate for this revamp slice. |
| P-04 | Console health | Full journey | Capture warn/error logs. | No relevant app errors/warnings. |
| P-05 | Screenshot quality | Desktop | Capture screenshots. | No overlap, grey wash, clipping, or debug-looking primary content. |

### Production Vercel Performance

| ID | Scenario | Target | Steps | Expected Result |
|---|---|---|---|---|
| V-01 | Production cold login load | Production Vercel `/login` | Open the deployed URL after an idle period or in a fresh browser context; capture navigation timing, TTFB, FCP, LCP, and visible blank time. | First meaningful login UI appears quickly or shows a skeleton/pending state; no unexplained 10-20 second blank wait. |
| V-02 | Production warm login load | Production Vercel `/login` | Reload `/login` 3 times after first cold load; compare timings. | Warm loads are materially faster than cold loads; if not, investigate client bundle or blocking data fetch. |
| V-03 | Production login submit latency | Production Vercel `/login` -> `/forensics/shadcn` | Submit valid login; capture POST `/api/demo-login`, redirect, and first protected page render timing. | Submit path has visible pending feedback within 300ms and avoids a silent 10-20 second delay. |
| V-04 | Protected page first render latency | Production Vercel `/forensics/shadcn` | After login, capture server render/API timing for the Maya page. | Page shell renders quickly; backend/source delays appear as bounded skeletons or fail-closed states. |
| V-05 | Production API/source latency split | Production Vercel API routes and backend sources | Capture timing for auth route, forensics read, query route, and source health calls. | The delay is attributed to one layer: Vercel function cold start, Next server render, API/backend source, or client hydration. |
| V-06 | Vercel telemetry is enabled or planned | Vercel dashboard / app instrumentation | Check whether Speed Insights or equivalent Web Vitals telemetry is active for production. | Production performance is measured from real deployments, not inferred from localhost. |
| V-07 | Region/cold-start hypothesis | Vercel deployment metadata and backend region/source endpoints | Compare Vercel function region, backend API location, SAP/Supabase/source regions, and first-hit vs warm-hit behavior. | Plan identifies whether Fluid compute, region alignment, route caching, or backend source latency is the likely fix. |

---

## 6. Implementation Tasks

### Task 1: Baseline Browser QA And Screenshot Ledger

**Files:**
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`
- Create: no repo screenshots unless the user explicitly asks for committed artifacts

- [ ] **Step 1: Add baseline assertions for known UX defects**

Add E2E assertions for the current contract failures without changing UI yet:

```ts
expect(await page.getByText("Sign out").count()).toBeGreaterThan(0);
await expect(page.getByRole("button", { name: /line 1/i })).toBeVisible();
await expect(page.getByRole("button", { name: /line 2/i })).toBeVisible();
await expect(page.getByText(/technical receipts/i)).toBeVisible();
await expect(page.getByRole("button", { name: /recoup agent/i })).toBeVisible();
```

- [ ] **Step 2: Add console and layout checks**

Capture console errors/warnings and assert the primary viewport has no horizontal overflow:

```ts
const consoleIssues: string[] = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
expect(overflow).toBe(false);
expect(consoleIssues).toEqual([]);
```

- [ ] **Step 3: Run and confirm RED**

Run:

```powershell
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e
```

Expected: FAIL on missing/ambiguous UX affordances before implementation.

### Task 2: Login And Session Polish

**Files:**
- Modify: `cockpit/app/login/page.tsx`
- Modify: `cockpit/app/login/login-form.tsx`
- Modify: `cockpit/components/maya/maya-workspace-shell.tsx`
- Reuse: `cockpit/app/logout-button.tsx`
- Test: `tests/unit/cockpit-demo-auth.test.ts`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Write RED tests**

Add tests proving persona names are not visible in normal login, password focus uses the approved class contract, and logout is visible after login:

```ts
expect(screen.queryByText("Investigator")).not.toBeInTheDocument();
expect(screen.queryByText("Reviewer")).not.toBeInTheDocument();
expect(screen.queryByText("Maya")).not.toBeInTheDocument();
expect(screen.getByLabelText(/password/i)).toHaveClass("focus-visible:ring-2");
```

For E2E:

```ts
await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
```

- [ ] **Step 2: Update login copy and persona affordance**

Remove persona labels from the primary login surface. If demo role selection must remain, place it behind a dev/demo-only disclosure that is not visible in normal production mode.

- [ ] **Step 3: Update focus and pending styles**

Use:

```tsx
className="h-10 rounded-md border-slate-300 bg-white text-slate-950 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
```

Use pending button copy/state:

```tsx
<Button disabled={isPending} aria-busy={isPending}>
  {isPending ? "Signing in..." : "Sign in"}
</Button>
```

- [ ] **Step 4: Add logout to Maya shell**

Place `LogoutButton` or a `Sign out` menu item in `SidebarFooter` or the user menu. It must be visually separated from normal nav.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit-demo-auth.test.ts
npm.cmd run test:e2e:maya-real
```

Expected: PASS for login/session assertions.

### Task 2A: Production Vercel Login/Page-Load Performance Investigation

**Files:**
- Modify: `tests/e2e/cockpit-premium-e2e.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Potentially modify after measurement: `cockpit/app/login/page.tsx`
- Potentially modify after measurement: `cockpit/app/login/login-form.tsx`
- Potentially modify after measurement: `cockpit/app/layout.tsx`
- Potentially modify after measurement: `cockpit/app/loading.tsx`
- Potentially modify after measurement: Vercel project/runtime configuration outside repo, if the measured blocker is platform-side

- [ ] **Step 1: Require production URL input before running prod timing**

Do not guess the production URL. Use the owner-provided Vercel URL and record it in the QA notes without embedding secrets or credentials.

- [ ] **Step 2: Add a production timing harness**

Add a non-committal browser timing helper inside the E2E test flow or a temporary non-repo script that records:

```ts
const timings = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  return {
    startTime: nav.startTime,
    responseStart: nav.responseStart,
    domContentLoaded: nav.domContentLoadedEventEnd,
    loadEventEnd: nav.loadEventEnd,
    transferSize: nav.transferSize,
    encodedBodySize: nav.encodedBodySize,
    decodedBodySize: nav.decodedBodySize
  };
});
```

- [ ] **Step 3: Capture cold and warm production measurements**

Run three measurements:

1. Cold `/login` after a fresh browser context.
2. Warm `/login` reloads.
3. Login submit through `/forensics/shadcn`.

Record route timing, visible blank time, console errors, network failures, and server/API response timing.

- [ ] **Step 4: Split latency by layer**

Classify the delay into exactly one or more buckets:

| Bucket | Evidence |
|---|---|
| Vercel function/server render cold start | High TTFB on first request, faster warm reloads, Vercel request IDs/timing confirm first-hit penalty. |
| Client bundle/hydration | Fast TTFB but delayed FCP/LCP or delayed interactivity. |
| Auth/API route latency | Slow `/api/demo-login` or protected auth read. |
| Backend/source dependency | Login or page render blocks on source health, SAP/Supabase, or cockpit API calls. |
| Network/geography | Region mismatch or consistently high latency from user location to deployment/backend. |

- [ ] **Step 5: Select the smallest safe remediation**

Use the measured bucket to choose fixes:

| Bucket | Candidate Fix |
|---|---|
| Vercel cold start | Evaluate Fluid compute, runtime config, region alignment, and reducing server route import weight. |
| Client bundle/hydration | Split non-login Maya code from `/login`, lazy-load heavy authenticated surfaces, and avoid importing agent/query UI into login bundle. |
| Auth/API route latency | Keep login route minimal, avoid blocking on full cockpit/source health before redirect, and show a bounded pending state. |
| Backend/source dependency | Move non-critical source health to post-render fetch/skeleton; fail closed inside panels instead of blocking the whole page. |
| Network/geography | Align deployment region with backend/source region where supported and document the chosen region. |

- [ ] **Step 6: Add production acceptance gates**

Add QA gates that must be reported before closure:

```text
Cold /login: measured TTFB, FCP/LCP, visible blank time
Warm /login: median of 3 reloads
Login submit: POST/auth time and first protected shell render
/forensics/shadcn: first shell render and source panel hydration time
Console: errors/warnings
Network: failed requests and slowest 5 requests
```

- [ ] **Step 7: Do not hide slowness with fake UI**

If a backend/source is slow, show skeletons or source-unavailable panels. Do not show fake loaded business data, fake source health, or optimistic verdict/amount values.

### Task 3: Visual Hierarchy And Case Command Header

**Files:**
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/app/styles.css`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED tests**

Assert that selected case detail contains a prominent verdict region, read-only amount, evidence count, and next-action/status area:

```ts
await expect(page.getByTestId("maya-case-command-header")).toBeVisible();
await expect(page.getByTestId("maya-verdict-primary")).toContainText(/valid deduction|recovery|review/i);
await expect(page.getByTestId("maya-amount-readonly")).toContainText(/read-only|backend formatted/i);
```

- [ ] **Step 2: Create the command header layout**

Use a compact responsive grid:

```tsx
<section data-testid="maya-case-command-header" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{caseTitle}</h1>
        <span data-testid="maya-verdict-primary" className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          Valid deduction
        </span>
      </div>
    </div>
    <div data-testid="maya-amount-readonly" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
      <p className="text-xs font-medium text-slate-500">Amount read-only</p>
      <p className="font-mono text-2xl font-semibold tabular-nums text-slate-950">{amountLabel}</p>
      <p className="text-xs text-slate-500">Backend formatted</p>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Reduce equal-weight cards**

Replace five identical metadata cards with a compact summary grid that uses labels, separators, and fewer borders.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e
```

Expected: PASS; screenshot shows case verdict and amount are instantly legible.

### Task 4: Badge, Button, Selection, And Navigation Taxonomy

**Files:**
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/recommended-action-cell.tsx`
- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`

- [ ] **Step 1: Write RED taxonomy tests**

Static badges must not expose button semantics or pointer cursor. Actions must be buttons.

```ts
const staticBadges = screen.getAllByTestId("maya-static-status-badge");
for (const badge of staticBadges) {
  expect(badge.tagName.toLowerCase()).toBe("span");
  expect(badge).not.toHaveAttribute("role", "button");
}

expect(screen.getByRole("button", { name: /open investigation/i })).toBeEnabled();
```

- [ ] **Step 2: Standardize status badge helper**

Render status badges as `span`:

```tsx
<span data-testid="maya-static-status-badge" className="inline-flex cursor-default select-none items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
  {label}
</span>
```

- [ ] **Step 3: Standardize action buttons**

Render real actions with shadcn `Button`:

```tsx
<Button size="sm" className="h-8 rounded-md bg-slate-950 px-3 text-white hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">
  Open investigation
</Button>
```

- [ ] **Step 4: Run taxonomy tests**

Run:

```powershell
npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts
```

Expected: PASS; no static pill appears clickable.

### Task 5: Line Selector Redesign

**Files:**
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Test: `tests/e2e/maya-real-backend-e2e.ts`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`

- [ ] **Step 1: Write RED line-switcher tests**

```ts
await expect(page.getByRole("button", { name: "Line 1" })).toBeVisible();
await expect(page.getByRole("button", { name: "Line 2" })).toBeVisible();
await page.getByRole("button", { name: "Line 2" }).click();
await expect(page.getByTestId("maya-selected-line-label")).toContainText("Line 2 of 2");
await expect(page.getByText("S2-L2")).toBeVisible();
```

- [ ] **Step 2: Replace `S2-L1` / `S2-L2` pills with segmented selector**

```tsx
<div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
  <div>
    <p className="text-xs font-medium text-slate-500">Selected line</p>
    <p data-testid="maya-selected-line-label" className="text-sm font-semibold text-slate-950">
      {selectedLineIndexLabel}
    </p>
  </div>
  <div className="inline-flex rounded-md bg-slate-100 p-1" role="group" aria-label="Deduction lines">
    {lines.map((line, index) => (
      <button
        key={line.id}
        type="button"
        className={cn(
          "rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
          line.id === selectedLineId ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
        )}
        aria-pressed={line.id === selectedLineId}
        onClick={() => setSelectedLineId(line.id)}
      >
        Line {index + 1}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Keep raw IDs in source detail**

Render `S2-L1` / `S2-L2` in tooltip/drawer/source metadata, not as primary controls.

- [ ] **Step 4: Run line tests**

Run:

```powershell
npm.cmd run test:e2e:maya-real
```

Expected: PASS; line selector changes selected-line context in the real browser journey.

### Task 6: Worklist Interaction Contract

**Files:**
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Write RED all-row interaction test**

```ts
const rows = ["S1-L1", "S2-L1", "S3-L1", "S4-L1", "S5-L1", "S6-L1", "S7-L1", "S8-L1"];
for (const lineId of rows) {
  await page.getByRole("button", { name: new RegExp(`open.*${lineId}`, "i") }).click();
  await expect(page.getByTestId("maya-case-command-header")).toContainText(lineId);
  await page.getByRole("button", { name: /return to worklist/i }).click();
}
```

- [ ] **Step 2: Choose one contract**

Use explicit `Open investigation` button per row. The full row can still set preview/selection, but opening case detail must use a clear button.

- [ ] **Step 3: Add selected-row visual state**

Use:

```tsx
className={cn(
  "group border-b border-slate-200 transition-colors",
  isSelected ? "bg-slate-100 ring-1 ring-inset ring-slate-300" : "hover:bg-slate-50"
)}
aria-selected={isSelected}
```

- [ ] **Step 4: Run E2E**

Run:

```powershell
npm.cmd run test:e2e:maya-real
```

Expected: PASS; all rows behave consistently.

### Task 7: Overview Density And Positive Valid-Deduction Signals

**Files:**
- Modify: `cockpit/components/maya/maya-run-kpi-strip.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Test: `tests/invariants/cockpit-no-business-logic.test.ts`
- Test: `tests/invariants/maya-real-backend-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED tests for no fake metrics**

```ts
const source = readFileSync("cockpit/components/maya/maya-run-kpi-strip.tsx", "utf8");
expect(source).not.toMatch(/\$[0-9][0-9,]+/);
expect(source).not.toContain("High priority");
```

The test should allow `High priority` only if it is rendered from a backend/read-model field with provenance.

- [ ] **Step 2: Add overview panels from existing read-model fields**

Use only fields already returned by the cockpit model/API:

- Open scenarios.
- Exposure.
- Recovery queue.
- Billing protection.
- Pending decisions.
- Evidence sources.
- Source readiness rows.
- Valid deduction count/value if backend/read model already provides it.

- [ ] **Step 3: Add positive-case treatment**

Use semantic success presentation for valid deductions:

```tsx
<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
  <p className="text-xs font-medium text-emerald-700">Valid deduction</p>
  <p className="text-sm font-semibold text-emerald-950">{caseLabel}</p>
  <p className="text-xs text-emerald-700">{evidenceSummary}</p>
</div>
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/maya-real-backend-contract.test.ts
npm.cmd run test:e2e
```

Expected: PASS; overview is dense but all values are backend/read-model sourced.

### Task 8: Agent Trace Business Timeline

**Files:**
- Modify: `cockpit/components/maya/agent-trace-panel.tsx`
- Modify: `cockpit/components/maya/cited-answer-card.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Write RED timeline tests**

```ts
await expect(page.getByTestId("maya-agent-trace-timeline")).toBeVisible();
for (const label of ["Scope", "Retrieve", "Reason", "Draft", "Cited answer"]) {
  await expect(page.getByTestId("maya-agent-trace-timeline")).toContainText(label);
}
await expect(page.getByText(/Live Agents SDK hook receipt/i)).not.toBeVisible();
await page.getByRole("button", { name: /technical receipts/i }).click();
await expect(page.getByText(/Live Agents SDK hook receipt/i)).toBeVisible();
```

- [ ] **Step 2: Build the timeline**

```tsx
<ol data-testid="maya-agent-trace-timeline" className="grid gap-3 lg:grid-cols-5">
  {steps.map((step) => (
    <li key={step.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <step.Icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        {step.businessLabel}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{step.summary}</p>
    </li>
  ))}
</ol>
```

- [ ] **Step 3: Collapse technical receipts**

Use shadcn `Collapsible` or `Accordion`:

```tsx
<Collapsible>
  <CollapsibleTrigger asChild>
    <Button variant="outline" size="sm">Technical receipts</Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <TraceReceiptGrid receipts={receipts} />
  </CollapsibleContent>
</Collapsible>
```

- [ ] **Step 4: Run trace tests**

Run:

```powershell
npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e:maya-real
```

Expected: PASS; business timeline is primary and technical cards are secondary.

### Task 9: Evidence And Source Details

**Files:**
- Modify: `cockpit/components/maya/evidence-dossier.tsx`
- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Modify: `cockpit/components/maya/cited-answer-card.tsx`
- Test: `tests/e2e/maya-real-backend-e2e.ts`
- Test: `tests/invariants/maya-real-backend-contract.test.ts`

- [ ] **Step 1: Write RED evidence grouping tests**

```ts
await page.getByRole("tab", { name: /evidence/i }).click();
await expect(page.getByText(/invoice|pod|contract|promotion|customer record/i)).toBeVisible();
await expect(page.getByText(/sap odata/i)).not.toBeVisible();
await page.getByRole("button", { name: /source details/i }).click();
await expect(page.getByText(/sap odata/i)).toBeVisible();
```

- [ ] **Step 2: Group evidence by business label**

Render first-level groups as `Invoice`, `POD`, `Contract`, `Promotion`, `Customer record`, or the closest existing document family from the read model.

- [ ] **Step 3: Move raw IDs to details**

Use tooltip/drawer/accordion detail for SAP OData IDs, internal record IDs, citation IDs, and hash details.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm.cmd run test:e2e:maya-real
```

Expected: PASS; primary Evidence tab is business-readable and source details remain available.

### Task 10: Recoup Agent Launcher And Query Dock

**Files:**
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Test: `tests/e2e/maya-real-backend-e2e.ts`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`

- [ ] **Step 1: Write RED launcher tests**

```ts
await expect(page.getByRole("button", { name: /recoup agent/i })).toBeVisible();
await page.getByRole("button", { name: /recoup agent/i }).click();
await expect(page.getByRole("dialog", { name: /recoup agent/i })).toBeVisible();
await expect(page.getByText(/sources|citations|case scope/i)).toBeVisible();
```

- [ ] **Step 2: Add bottom-right launcher**

```tsx
<Button
  type="button"
  aria-label="Open Recoup Agent"
  className="fixed bottom-5 right-5 z-40 h-11 rounded-full bg-slate-950 px-4 text-white shadow-lg hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
  onClick={() => setQueryDockOpen(true)}
>
  <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
  Recoup Agent
</Button>
```

- [ ] **Step 3: Keep query dock grounded**

Dock must show selected case/worklist context, citation requirement, and fail-closed blocked state when source data is missing.

- [ ] **Step 4: Run query tests**

Run:

```powershell
npm.cmd run test:e2e:maya-real
```

Expected: PASS; launcher opens existing backend-wired query dock.

### Task 11: Loading, Empty, Disabled, And Error States

**Files:**
- Modify: `cockpit/components/maya/maya-empty-state.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/agent-trace-panel.tsx`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED state tests**

Assert named states:

```ts
await expect(page.getByText(/source unavailable|no evidence|no trace yet|select a case/i)).toBeVisible();
```

- [ ] **Step 2: Add skeletons**

Use shadcn skeletons for login submit, worklist load, case summary, trace timeline, and query answer pending.

- [ ] **Step 3: Add fail-closed empty states**

Use:

```tsx
<Empty>
  <EmptyHeader>
    <EmptyTitle>Source unavailable</EmptyTitle>
    <EmptyDescription>This field is hidden until the backend source returns cited data.</EmptyDescription>
  </EmptyHeader>
</Empty>
```

- [ ] **Step 4: Add disabled reasons**

Disabled controls must either have adjacent text or tooltip explaining the block reason.

- [ ] **Step 5: Run premium E2E**

Run:

```powershell
npm.cmd run test:e2e
```

Expected: PASS; no blank/error/dead state is unexplained.

### Task 12: Desktop Visual QA

**Files:**
- Modify: `tests/e2e/cockpit-premium-e2e.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify UI files only if QA finds responsive defects

- [ ] **Step 1: Add desktop viewport matrix**

Test these viewports:

```ts
const viewports = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 1280, height: 720, name: "laptop" }
];
```

- [ ] **Step 2: Add layout assertions**

```ts
const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
expect(hasHorizontalOverflow).toBe(false);
```

- [ ] **Step 3: Record mobile deferral**

Mobile QA is intentionally skipped for this pass. Keep responsive code paths fail-safe, but do not block this release slice on mobile viewport evidence.

- [ ] **Step 4: Run final browser checks**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:e2e:maya-real
```

Expected: PASS with screenshots reviewed by the implementer and reviewer.

### Task 13: Final Verification And Reviewer Gate

**Files:**
- Modify: no additional files unless review finds defects

- [ ] **Step 1: Run focused checks**

```powershell
npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/maya-real-backend-contract.test.ts
npm.cmd run test:e2e
npm.cmd run test:e2e:maya-real
```

- [ ] **Step 2: Run full gates**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
```

- [ ] **Step 3: Reviewer checklist**

Reviewer must confirm:

- Login does not expose normal-user persona names.
- Logout is visible and works.
- No large blank first viewport remains in Overview when backend data exists.
- `Line 1` / `Line 2` are clearly interactive and update selected context.
- Static badges are not visually clickable.
- Agent Trace shows business timeline first and technical receipts second.
- Recoup Agent launcher is visible, accessible, and opens grounded query.
- No fake metrics, fake trace rows, or hardcoded business values were introduced.
- All visible dollars/verdicts/evidence counts/source states still come from backend/read-model data.

### Task 14: Final Architecture Technical Design With ASCII Diagrams

**Files:**
- Create: `docs/architecture/maya-agentic-deduction-forensics-technical-design.md`
- Read for fact-checking: `AGENTS.md`
- Read for fact-checking: `INVARIANTS.md`
- Read for fact-checking: `docs/Recoup_v2_System_Design.md`
- Read for fact-checking: `docs/maya-shadcn-independent-audit-technical-design.md`
- Read for fact-checking: `docs/audits/maya-multiagent-audit-2026-06-25/ADR-001-mcp-data-plane.md`
- Read for fact-checking: `docs/audits/maya-multiagent-audit-2026-06-25/SPEC-001-mcp-data-plane-option1.md`
- Read for fact-checking: `src/services/cockpitApi.ts`
- Read for fact-checking: `src/services/cockpitModel.ts`
- Read for fact-checking: `src/mcp/server.ts`
- Read for fact-checking: `src/adapters/sapOData.ts`
- Read for fact-checking: `src/agents/forensics.ts`
- Read for fact-checking: `src/agents/recoveryDrafter.ts`
- Read for fact-checking: `src/agents/query.ts`
- Read for fact-checking: `cockpit/components/maya/*.tsx`
- Test: documentation fact-check plus final gates from Task 13

- [ ] **Step 1: Create the architecture document only after implementation and QA are complete**

The document is the last deliverable before final staging/commit/push. It must describe the as-built solution, not the aspirational design.

Required title:

```md
# Maya Deduction Forensics Technical Design
```

Required opening contract:

```md
This design is grounded in the Recoup invariant that code computes every dollar, agents decide what to inspect and explain, every decision cites evidence plus deterministic basis, and humans approve every external action.
```

- [ ] **Step 2: Include an executive architecture thesis**

Explain why this is a best-in-class architecture in concrete engineering terms:

- Deterministic financial spine before agent reasoning.
- Canonical data model between SAP/raw sources and agents.
- MCP/tool gateway as a bounded tool plane, not direct ERP access from the model.
- Zod/schema and guardrail boundaries at source, tool, agent, service, and output layers.
- Human-gated external actions and ERP read-only posture.
- UI as a provenance-preserving command surface, not a business-logic engine.
- TDD, real-browser QA, and real-backend gates as architecture controls.

- [ ] **Step 3: Include ASCII diagram 1 - end-to-end control plane**

Use an ASCII diagram in a fenced code block:

```text
User / Analyst
      |
      v
Recoup Cockpit UI
      |
      v
Cockpit API / Service Layer
      |
      +--> Deterministic Rules + Graph + Audit Trail
      |
      +--> Agent Orchestrator
              |
              v
          MCP Tool Gateway
              |
              v
          Source Adapters
              |
              v
          SAP / Docs / TPM / Memory
```

Annotate which layers are allowed to compute money, which layers may call tools, and which layers are read-only.

- [ ] **Step 4: Include ASCII diagram 2 - canonical data translation**

The diagram must make clear that SAP OData does not flow raw into the agent:

```text
SAP OData Payload
      |
      v
Read-only SAP Adapter
      |
      v
Canonical Source Port
      |
      v
Zod Entity / Evidence Model
      |
      +--> Deterministic Services
      |
      +--> Redacted, Cited Tool Payload
              |
              v
          Agent Reasoning Context
```

Explain which fields are raw provenance metadata, which are canonical business fields, and why this prevents source-coupled agent behavior.

- [ ] **Step 5: Include ASCII diagram 3 - MCP gateway and tool-list negotiation**

Show that the agent asks for/query-selects tools through the bounded gateway and receives SAP-capable tools only through policy:

```text
Agent Query Intent
      |
      v
Tool Need Classification
      |
      v
MCP Gateway: list allowed tools
      |
      +--> sap.readEvidence
      +--> docs.searchContracts
      +--> tpm.lookupPromotion
      +--> memory.readSession
      |
      v
Guarded Tool Call
      |
      v
Canonical Evidence Result + recordIds + source health
```

State that no ERP write tool is exposed for Maya's deduction flow.

- [ ] **Step 6: Include ASCII diagram 4 - agentic workflow**

Diagram the Forensics to Recovery flow:

```text
Selected Case
      |
      v
Forensics Investigator
      |
      +--> Retrieve cited evidence
      +--> Compare deterministic basis
      +--> Emit verdict explanation
      |
      v
Recovery Drafter
      |
      +--> Draft billing / outreach artifacts
      |
      v
Human Approval Gate
      |
      v
External Action Draft Only
```

Call out where guardrails trip, where trace receipts are recorded, and where human approval is mandatory.

- [ ] **Step 7: Include ASCII diagram 5 - UI/read-model boundary**

Show why the UI remains safe:

```text
Backend Read Model
      |
      v
Maya API Response
      |
      v
React View Model Formatting
      |
      +--> Worklist
      +--> Case Overview
      +--> Evidence
      +--> Agent Timeline
      +--> Draft / Approval / Audit
      |
      v
No UI-computed dollars, verdicts, thresholds, or evidence counts
```

Explicitly list what UI may compute: labels, selected tab state, drawer/collapse state, accessible line display labels, loading/error presentation, and citation expansion state.

- [ ] **Step 8: Include ASCII diagram 6 - QA and release gate**

```text
RED Invariant Tests
      |
      v
Minimal UI Implementation
      |
      v
Focused Unit / Invariant Tests
      |
      v
Real Backend Playwright
      |
      v
Screenshot Storyboard
      |
      v
lint + typecheck + test + verify
      |
      v
Git Commit + Push
```

Tie the diagram to the final QA storyboard and the user-requested 12-beat browser evidence.

- [ ] **Step 9: Add a "Why this architecture wins" table**

Include this table shape:

```md
| Architecture decision | Risk avoided | Product benefit | Verification |
|---|---|---|---|
| Canonical data model | Agent coupled to SAP field quirks | Stable business UX across sources | Adapter and real-backend tests |
| Deterministic money computation | Model-generated dollars | Audit-safe financial decisions | Invariant tests |
| MCP gateway | Direct uncontrolled source/tool access | Policy-bounded agent tools | MCP/log trace tests |
| Human approval gate | Autonomous external action | Trustworthy draft-only recovery | HITL tests |
| Provenance-first UI | Pretty but unverifiable claims | Analyst trust and judge auditability | Browser storyboard |
```

- [ ] **Step 10: Verify the design doc**

Run:

```powershell
rg -n "sk-|ghp_|SAP_ODATA_BASE_URL=.*://|password|secret" docs/architecture/maya-agentic-deduction-forensics-technical-design.md
rg -n "VERIFY|TODO|TBD|placeholder|fake|dummy" docs/architecture/maya-agentic-deduction-forensics-technical-design.md
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
```

Expected:

- No secret values or raw env values appear in the doc.
- No fake/dummy wording appears except when explicitly saying the architecture prohibits fake/dummy data.
- The doc references only files and flows verified in the repo.
- Final verification remains green before commit and push.

---

## 7. Acceptance Criteria

| Category | Pass Criteria |
|---|---|
| Visual hierarchy | User can identify case title, verdict, amount, evidence count, selected line, and next state in under 5 seconds. |
| Affordance | Static badges, buttons, segmented controls, tabs, disabled controls, and navigation have distinct visual and semantic roles. |
| Trace explainability | Business user sees a readable trace timeline without needing to parse SDK/tool internals. |
| Provenance | Raw IDs and technical receipts remain accessible but secondary. |
| Production polish | Loading, empty, disabled, unavailable, error, and desktop states are covered; mobile QA is deferred for this pass. |
| TDD | New tests fail before implementation and pass after each slice. |
| Real backend | `npm.cmd run test:e2e:maya-real` passes without fixture API or Playwright route fulfillment. |
| Architecture doc | Final technical design explains the as-built architecture with ASCII diagrams for data flow, MCP/tool gateway, agent workflow, UI boundary, and release gates. |
| Full guard | `npm.cmd run verify` passes. |

---

## 8. Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-maya-ux-production-revamp.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh implementer subagent per task, then run reviewer and browser QA gates after each slice.
2. **Inline Execution** - Execute tasks in this session using the plan checkboxes, with checkpoints after each major component.

Recommended first slice: Task 1 through Task 5, because the line selector, login/session basics, and interaction taxonomy address the strongest user-visible trust gaps with low backend risk.
