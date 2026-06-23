# Maya Shadcn UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Maya's deduction-forensics cockpit experience with a shadcn-only, premium B2B SaaS command surface that follows the 12-beat Maya storyboard, uses backend/read-model facts only, and preserves every Recoup invariant around evidence, deterministic basis, and human approval.

**Architecture:** Build a parallel `/forensics/shadcn` review route first. The server page loads the existing cockpit read models and route auth, then passes typed props into a new shadcn-only `cockpit/components/maya/` client surface. The client owns only UI state: selected line, active tab, open sheet/dialog, query text, loading/error state. Business values, dollars, verdicts, evidence labels, record IDs, approval actions, and audit labels remain read-model/API data. After visual and invariant gates pass, cut `/forensics` over to the new surface and leave old cockpit components available for non-Maya routes until their own redesign sessions.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, Tailwind 4, shadcn `radix-nova` registry style, lucide-react icons, Vitest invariant/unit tests, Playwright responsive screenshots, existing Recoup REST/read-model APIs.

---

## Product Direction

The 12 ImageGen frames should act as state and hierarchy references, not as twelve separate app pages. Maya's product should feel like one analyst workbench:

- Login starts the persona journey.
- The first working screen is a compact operations dashboard plus worklist.
- Selecting a row opens the Crestline-style case workspace.
- Evidence review, query agent, supervisor/agent trace, answer, draft, approval, audit, and return-to-worklist are progressive states inside the same workbench.
- The UI must never invent totals, recommended actions, scores, decisions, or dollar figures. If the read model does not provide a value, the UI shows an honest unavailable or disabled state.

## Inputs Already Approved Or Ready For Review

- `docs/storyboards/maya-agentic-storyboard-contract.md`
- `docs/storyboards/maya-shadcn-component-map.md`
- `docs/storyboards/maya-frontend-system-design.md`
- `docs/storyboards/maya-12-beat-mockup-index.md`
- `mockups/imagegen/maya-12-beat-storyboard/contact-sheet.png`
- `mockups/imagegen/maya-12-beat-storyboard/01-login-maya-enters-recoup.png`
- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`
- `mockups/imagegen/maya-12-beat-storyboard/03-worklist-recommended-action.png`
- `mockups/imagegen/maya-12-beat-storyboard/04-case-overview-crestline-opens.png`
- `mockups/imagegen/maya-12-beat-storyboard/05-evidence-dossier-pod-reviewed.png`
- `mockups/imagegen/maya-12-beat-storyboard/06-query-dock-start.png`
- `mockups/imagegen/maya-12-beat-storyboard/07-agent-trace-in-progress.png`
- `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png`
- `mockups/imagegen/maya-12-beat-storyboard/09-draft-review-recovery-packet.png`
- `mockups/imagegen/maya-12-beat-storyboard/10-human-approval-dialog.png`
- `mockups/imagegen/maya-12-beat-storyboard/11-audit-confirmation.png`
- `mockups/imagegen/maya-12-beat-storyboard/12-return-to-worklist-next-case.png`

## Current Repo Facts

- `components.json` is present and configured for `@shadcn`, `radix-nova`, `rsc: true`, Tailwind CSS at `cockpit/app/styles.css`, aliases under `@/components`, `@/lib`, and lucide icons.
- `cockpit/components/ui/button.tsx` already exists.
- `cockpit/lib/utils.ts`, `package.json`, `package-lock.json`, and `tsconfig.json` already carry shadcn-readiness changes that are not yet committed.
- Current Maya route `cockpit/app/forensics/page.tsx` imports `CockpitShell`, `RecordStrip`, `ApprovalControls`, and `premium-components.tsx`.
- Maya has nested route authorization support because `isDemoRouteAllowed("/forensics/shadcn", ["/forensics", "/run"])` returns true by prefix matching.
- Existing data loaders live in `cockpit/app/cockpit-data.ts`: `fetchForensicsModel()` and `fetchConnectorReadinessModel()`.
- Existing credential-gated interaction routes are `cockpit/app/api/query/realtime-tool/route.ts` and `cockpit/app/api/approval/route.ts`.

## Non-Negotiable Boundaries

- New Maya implementation imports shadcn UI components from `@/components/ui/*`.
- New Maya implementation uses lucide-react icons only.
- New Maya implementation does not import `cockpit/app/cockpit-shell.tsx`.
- New Maya implementation does not import `cockpit/app/premium-components.tsx`.
- New Maya implementation does not import Phosphor icons.
- New Maya implementation does not import `decimal.js`, `src/core`, or `src/services`.
- New Maya implementation does not compute money, verdicts, thresholds, recommended actions, evidence scores, or approval decisions.
- New Maya implementation does not dispatch any external action outside the existing `/api/approval` human-gated route.
- New Maya implementation must render record IDs and cited evidence where a decision, answer, draft, or audit state is shown.
- Styling uses shadcn semantic classes and Tailwind layout utilities. New CSS is limited to page-level tokens/layout where shadcn composition cannot express the structure cleanly.

## Target Component Map

| Story beat | Product state | Primary component | shadcn primitives |
| --- | --- | --- | --- |
| 1 | Login | `login/login-form.tsx` later cutover | `Card`, `Field`, `Input`, `Button`, `Alert` |
| 2 | Morning summary | `MayaRunKpiStrip` | `Card`, `Badge`, `Separator`, `Tooltip` |
| 3 | Worklist recommended action | `DeductionWorklistTable`, `RecommendedActionCell` | `Table`, `Badge`, `Button`, `Tooltip`, `DropdownMenu` |
| 4 | Selected case overview | `DeductionCaseWorkspace` | `Tabs`, `Card`, `Badge`, `Separator` |
| 5 | Evidence dossier | `EvidenceDossier` | `Table`, `Accordion`, `ScrollArea`, `Badge`, `Tooltip` |
| 6 | Query starts | `QueryEvidenceDock` | `Sheet`, `Textarea`, `InputGroup`, `Field`, `Button` |
| 7 | Supervisor trace | `AgentTracePanel` | `Collapsible`, `Progress` if installed, `Badge`, `Skeleton` |
| 8 | Cited answer | `CitedAnswerCard` | `Alert`, `Card`, `Badge`, `Accordion` |
| 9 | Draft packet | `RecoveryDraftReview` | `Card`, `Table`, `Badge`, `Separator` |
| 10 | Human approval | `ApprovalGateDialog` | `AlertDialog`, `Field`, `Textarea`, `Button` |
| 11 | Audit confirmation | `AuditConfirmationPanel` | `Alert`, `Badge`, `Table`, `Separator` |
| 12 | Return to queue | `DeductionWorklistTable`, `MayaEmptyState` | `Table`, `Empty`, `Button`, `Badge` |

## Component Install Set

Use the local shadcn registry command:

```powershell
npx shadcn@latest add @shadcn/sidebar @shadcn/card @shadcn/table @shadcn/badge @shadcn/button @shadcn/tooltip @shadcn/alert @shadcn/skeleton @shadcn/tabs @shadcn/accordion @shadcn/sheet @shadcn/scroll-area @shadcn/separator @shadcn/input @shadcn/input-group @shadcn/field @shadcn/textarea @shadcn/alert-dialog @shadcn/collapsible @shadcn/sonner @shadcn/empty @shadcn/toggle-group @shadcn/dropdown-menu @shadcn/select @shadcn/checkbox
```

Expected result:

- Files are created under `cockpit/components/ui/`.
- Imports use aliases like `@/components/ui/card`.
- No files are created outside `cockpit/components/ui/`, `cockpit/lib/`, lockfiles, or package manifests unless the CLI explicitly updates registry metadata.

## Phase 0 - Human Review Gate

- [ ] Review the 12-beat contact sheet and index with the user.
- [ ] Confirm the implementation direction: one cohesive Maya workbench, not twelve separate pages.
- [ ] Confirm `/forensics/shadcn` as the first review route.
- [ ] Confirm that current uncommitted shadcn setup changes are acceptable to keep.
- [ ] Do not change runtime UI code before this gate is approved.

Success check:

```powershell
git status --short
```

Expected output before implementation starts:

```text
 M package-lock.json
 M package.json
 M tsconfig.json
?? cockpit/components/
```

## Phase 1 - Commit Shadcn Foundation

- [ ] Run the shadcn install command from the Component Install Set.
- [ ] Inspect `git status --short`.
- [ ] Inspect generated UI files under `cockpit/components/ui/`.
- [ ] Confirm `components.json` still points at `cockpit/app/styles.css`, `@/components`, `@/lib`, and lucide.
- [ ] Run typecheck before committing.

Commands:

```powershell
npx shadcn@latest add @shadcn/sidebar @shadcn/card @shadcn/table @shadcn/badge @shadcn/button @shadcn/tooltip @shadcn/alert @shadcn/skeleton @shadcn/tabs @shadcn/accordion @shadcn/sheet @shadcn/scroll-area @shadcn/separator @shadcn/input @shadcn/input-group @shadcn/field @shadcn/textarea @shadcn/alert-dialog @shadcn/collapsible @shadcn/sonner @shadcn/empty @shadcn/toggle-group @shadcn/dropdown-menu @shadcn/select @shadcn/checkbox
npm run typecheck
git add components.json package.json package-lock.json tsconfig.json cockpit/components cockpit/lib
git commit -m "Add shadcn cockpit foundation"
```

Expected checks:

- `npm run typecheck` exits with code 0.
- Commit contains only shadcn foundation files and lockfile/manifest changes.

## Phase 2 - Tests First For Maya Boundary

- [ ] Add `tests/invariants/maya-shadcn-boundary.test.ts`.
- [ ] The test must fail before the new route/components exist.
- [ ] The test must forbid old UI imports and business logic imports in `cockpit/components/maya/` and `cockpit/app/forensics/shadcn/page.tsx`.
- [ ] The test must assert that the review route authorizes through `requireRouteAccess("/forensics")`.
- [ ] The test must assert that the review route uses `fetchForensicsModel()` and `fetchConnectorReadinessModel()`.

Test skeleton:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readTree(root: string): string {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
        files.push(path);
      }
    }
  }

  walk(root);
  return files.sort().map((path) => readFileSync(path, "utf8")).join("\n");
}

describe("Maya shadcn cockpit boundary", () => {
  it("renders through a dedicated review route backed by canonical read models", () => {
    const route = readFileSync("cockpit/app/forensics/shadcn/page.tsx", "utf8");

    expect(route).toContain('requireRouteAccess("/forensics")');
    expect(route).toContain("fetchForensicsModel()");
    expect(route).toContain("fetchConnectorReadinessModel()");
    expect(route).toContain("<MayaForensicsSurface");
  });

  it("keeps the Maya shadcn surface free of old bespoke UI and business logic", () => {
    expect(existsSync("cockpit/components/maya")).toBe(true);
    const sources = readTree("cockpit/components/maya");

    for (const forbidden of [
      "cockpit-shell",
      "premium-components",
      "@phosphor-icons",
      "decimal.js",
      "src/core",
      "src/services",
      "evaluateRule",
      "runForensicsInvestigation"
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });
});
```

Command:

```powershell
npm run test -- tests/invariants/maya-shadcn-boundary.test.ts
```

Expected first run:

- Fails because `cockpit/app/forensics/shadcn/page.tsx` and `cockpit/components/maya/` are not present.

Expected after implementation:

- Test exits with code 0.

## Phase 3 - Build The Review Route

- [ ] Create `cockpit/app/forensics/shadcn/page.tsx`.
- [ ] Use server-side `requireRouteAccess("/forensics")`.
- [ ] Load `fetchForensicsModel()` and `fetchConnectorReadinessModel()` in parallel.
- [ ] Render `MayaForensicsSurface`.
- [ ] Do not import old UI components.

Route skeleton:

```tsx
import { MayaForensicsSurface } from "@/components/maya/maya-forensics-surface";
import { fetchConnectorReadinessModel, fetchForensicsModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";

export default async function MayaShadcnForensicsPage() {
  const session = await requireRouteAccess("/forensics");
  const [model, connectors] = await Promise.all([fetchForensicsModel(), fetchConnectorReadinessModel()]);

  return <MayaForensicsSurface connectors={connectors} model={model} session={session} />;
}
```

Command:

```powershell
npm run test -- tests/invariants/maya-shadcn-boundary.test.ts
```

Expected result:

- The route assertion passes.
- The component directory assertion still fails until Phase 4.

## Phase 4 - Build Shadcn-Only Maya Components

- [ ] Create `cockpit/components/maya/maya-forensics-surface.tsx`.
- [ ] Create `cockpit/components/maya/maya-workspace-shell.tsx`.
- [ ] Create `cockpit/components/maya/maya-run-kpi-strip.tsx`.
- [ ] Create `cockpit/components/maya/source-readiness-strip.tsx`.
- [ ] Create `cockpit/components/maya/deduction-worklist-table.tsx`.
- [ ] Create `cockpit/components/maya/recommended-action-cell.tsx`.
- [ ] Create `cockpit/components/maya/deduction-case-workspace.tsx`.
- [ ] Create `cockpit/components/maya/evidence-dossier.tsx`.
- [ ] Create `cockpit/components/maya/query-evidence-dock.tsx`.
- [ ] Create `cockpit/components/maya/agent-trace-panel.tsx`.
- [ ] Create `cockpit/components/maya/cited-answer-card.tsx`.
- [ ] Create `cockpit/components/maya/recovery-draft-review.tsx`.
- [ ] Create `cockpit/components/maya/approval-gate-dialog.tsx`.
- [ ] Create `cockpit/components/maya/audit-confirmation-panel.tsx`.
- [ ] Create `cockpit/components/maya/maya-empty-state.tsx`.
- [ ] Create `cockpit/components/maya/types.ts`.

`types.ts` should alias existing read-model types instead of redefining business data:

```ts
import type { ConnectorReadinessModel, DemoSession, ForensicsCockpitModel } from "../../app/cockpit-data";

export interface MayaForensicsSurfaceProps {
  connectors: ConnectorReadinessModel;
  model: ForensicsCockpitModel;
  session: DemoSession;
}

export type MayaWorklistItem = ForensicsCockpitModel["worklist"][number];
export type MayaSelectedCase = ForensicsCockpitModel["selected"];
```

`maya-forensics-surface.tsx` owns UI state only:

```tsx
"use client";

import * as React from "react";
import type { MayaForensicsSurfaceProps } from "./types";

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [selectedLineId, setSelectedLineId] = React.useState(model.selected.lineId);
  const [queryOpen, setQueryOpen] = React.useState(false);
  const [approvalOpen, setApprovalOpen] = React.useState(false);

  const selectedWorklistItem =
    model.worklist.find((item) => item.lineIds.includes(selectedLineId)) ??
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ??
    model.worklist[0];

  return (
    <main data-testid="maya-shadcn-workbench">
      {/* Compose shell, KPI strip, worklist, case workspace, query dock, and approval dialog here. */}
    </main>
  );
}
```

Implementation rules:

- `MayaForensicsSurface` may derive selected row from existing arrays.
- `MayaForensicsSurface` may format local interaction labels like open/closed panel names.
- `MayaForensicsSurface` must not calculate amounts, risk scores, evidence scores, or verdicts.
- Every shadcn `Dialog`, `AlertDialog`, and `Sheet` must have an accessible title.
- Button icons use lucide with `data-icon`.
- Use `gap-*` utilities rather than `space-x-*` or `space-y-*`.
- Avoid `transition-all`.
- Avoid nested cards; one section surface can contain repeated `Card` items, but cards do not wrap other cards.

Command:

```powershell
npm run test -- tests/invariants/maya-shadcn-boundary.test.ts
npm run typecheck
```

Expected result:

- Boundary test exits with code 0.
- Typecheck exits with code 0.

Commit:

```powershell
git add cockpit/app/forensics/shadcn cockpit/components/maya tests/invariants/maya-shadcn-boundary.test.ts
git commit -m "Add Maya shadcn review route"
```

## Phase 5 - Wire Query Agent Narrative

- [ ] Implement `QueryEvidenceDock` against the existing `/api/query/realtime-tool` route.
- [ ] Send only user query text, selected line ID, and cited record IDs already present in the read model.
- [ ] Render loading state with `Skeleton`.
- [ ] Render errors with `Alert`.
- [ ] Render answers with `CitedAnswerCard`.
- [ ] Render supervisor/agent progress from returned API fields only.

Client rules:

- No `OPENAI_API_KEY` usage in client code.
- No `RECOUP_COCKPIT_AUTH_TOKEN` usage in client code.
- No `localStorage`, `sessionStorage`, or `indexedDB`.
- No uncited answer display. If a response lacks citations or deterministic basis, render a blocked `Alert`.

Test additions:

- Extend `tests/invariants/cockpit-no-business-logic.test.ts` to read `cockpit/components/maya`.
- Assert `QueryEvidenceDock` contains `/api/query/realtime-tool`.
- Assert `QueryEvidenceDock` does not contain secret env var names, browser storage APIs, `decimal.js`, or `src/core`.

Command:

```powershell
npm run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/maya-shadcn-boundary.test.ts
npm run typecheck
```

Expected result:

- Both invariant tests exit with code 0.
- Typecheck exits with code 0.

## Phase 6 - Wire Human Approval Dialog

- [ ] Implement `ApprovalGateDialog` against the existing `/api/approval` route.
- [ ] Use shadcn `AlertDialog` with title, description, reason field, and approve/modify/reject controls.
- [ ] Use read-model `model.selected.approvalActions` for available actions.
- [ ] Require reason when `requiresReason` is true.
- [ ] Do not mark dispatch complete optimistically.
- [ ] Display returned `auditEntryHash` or returned API confirmation only after a successful response.
- [ ] Render failure with `Alert`.

Test additions:

- Extend existing approval invariants to include `cockpit/components/maya/approval-gate-dialog.tsx`.
- Assert it posts to `/api/approval`.
- Assert it uses the supplied `approvalActions`.
- Assert it does not contain hard-coded human principal strings.
- Assert reason field ids are generated with `useId`.

Command:

```powershell
npm run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/unit/realtime-next-routes.test.ts
npm run typecheck
```

Expected result:

- Existing API route tests remain green.
- New Maya dialog invariants pass.

Commit:

```powershell
git add cockpit/components/maya tests/invariants/cockpit-no-business-logic.test.ts
git commit -m "Wire Maya shadcn query and approval states"
```

## Phase 7 - Responsive Visual QA On Review Route

- [ ] Add `/forensics/shadcn` as a Maya screenshot target in `tests/e2e/cockpit-premium-e2e.ts`.
- [ ] Add a focused assertion function for the review route, separate from current `/forensics` premium assertions.
- [ ] Assert these visible elements on `/forensics/shadcn`:
  - `Maya`
  - `Recommended action`
  - at least one KPI label from `model.kpiStrip`
  - at least one evidence document ID
  - at least one record ID from `model.selected.evidencePack.recordIds`
  - `Human approval`
- [ ] Add a Playwright interaction that opens query sheet.
- [ ] Add a Playwright interaction that opens approval dialog.
- [ ] Capture screenshots at 375, 768, 1024, and 1440 widths.

Command:

```powershell
npm run test:e2e
```

Expected result:

- E2E exits with code 0.
- Screenshots are written under `output/playwright/e2e`.
- New screenshot names include `maya-shadcn-forensics-375.png`, `maya-shadcn-forensics-768.png`, `maya-shadcn-forensics-1024.png`, and `maya-shadcn-forensics-1440.png`.

Visual comparison checklist:

- Compare runtime `/forensics/shadcn` screenshots against `mockups/imagegen/maya-12-beat-storyboard/contact-sheet.png`.
- Beat 2: mini dashboard/KPI strip is visible before deep case detail.
- Beat 3: worklist has a `Recommended action` state with a small agent/recommendation icon.
- Beat 5: evidence is table-led and citation-led.
- Beat 7: supervisor/agent trace is compact and procedural, not decorative.
- Beat 10: approval dialog clearly indicates human approval before dispatch.
- Beat 12: return-to-worklist state preserves operational queue context.
- Score must be at least 4/5 against the cockpit anti-slop standard before cutover.

Commit:

```powershell
git add tests/e2e/cockpit-premium-e2e.ts
git commit -m "Add Maya shadcn visual checks"
```

## Phase 8 - Cut Over `/forensics`

- [ ] Replace `cockpit/app/forensics/page.tsx` with the shadcn route implementation.
- [ ] Keep `/forensics/shadcn` as a temporary alias only if the user still needs side-by-side review.
- [ ] Update `tests/e2e/cockpit-premium-e2e.ts` so `maya-forensics` asserts the shadcn surface, not old premium components.
- [ ] Update `tests/invariants/cockpit-no-business-logic.test.ts` route checks so Maya no longer requires `ApprovalControls` from the old route.
- [ ] Keep `cockpit/app/cockpit-shell.tsx` and `cockpit/app/premium-components.tsx` unchanged for run, credit, CFO, and governance routes unless a separate brief authorizes their redesign.

Command:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

Expected result:

- All commands exit with code 0.
- `/forensics` screenshot matches the approved Maya shadcn direction.
- `/run`, `/credit`, `/credit/command`, `/cfo`, and governance screenshots still render.

Commit:

```powershell
git add cockpit/app/forensics tests/e2e/cockpit-premium-e2e.ts tests/invariants/cockpit-no-business-logic.test.ts
git commit -m "Cut Maya forensics over to shadcn"
```

## Phase 9 - Shadcn Login Refresh

- [ ] Refresh `cockpit/app/login/login-form.tsx` with shadcn components.
- [ ] Keep persona catalog data server/read-model driven.
- [ ] Use `Field`, `Input`, `Button`, `Alert`, and compact `Card` composition.
- [ ] Do not add marketing copy or a landing page.
- [ ] Preserve `input[name="loginId"]`, `input[name="password"]`, and button name matching `/Open workspace/u` so existing E2E login works.

Command:

```powershell
npm run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/unit/cockpit-demo-auth.test.ts
npm run test:e2e
```

Expected result:

- Persona auth tests remain green.
- E2E login still works for Maya, David, and CFO.

Commit:

```powershell
git add cockpit/app/login tests/e2e/cockpit-premium-e2e.ts
git commit -m "Refresh cockpit login with shadcn"
```

## Phase 10 - Full Verification And Critique

- [ ] Run the full verification suite.
- [ ] Re-read the storyboard, component map, and frontend system design.
- [ ] Compare final runtime screenshots to the 12-beat mockups.
- [ ] Write a short senior-engineer critique before declaring the work complete.
- [ ] List visual deltas that remain and classify each as acceptable or requiring a follow-up session.

Commands:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run verify
git status --short
```

Expected result:

- `npm run lint` exits with code 0.
- `npm run typecheck` exits with code 0.
- `npm run test` exits with code 0.
- `npm run test:e2e` exits with code 0.
- `npm run verify` exits with code 0.
- `git status --short` shows only intentional final artifacts, if any.

## Recommended Commit Cadence

1. `Add shadcn cockpit foundation`
2. `Add Maya shadcn review route`
3. `Wire Maya shadcn query and approval states`
4. `Add Maya shadcn visual checks`
5. `Cut Maya forensics over to shadcn`
6. `Refresh cockpit login with shadcn`

## Final Acceptance Criteria

- Maya enters from login into a shadcn-built forensics cockpit.
- Beat 2 mini dashboard is present on the first working screen.
- Beat 3 has a `Recommended action` state with an agent/recommendation icon.
- All 12 storyboard beats are represented as real UI states.
- `/forensics` no longer imports current bespoke Maya UI components.
- New Maya code uses shadcn components and lucide icons.
- UI displays backend/read-model facts only.
- Evidence, deterministic basis, record IDs, and HITL approval are visible where decisions or external-action drafts appear.
- Responsive screenshots pass at 375, 768, 1024, and 1440 widths.
- Visual audit score is at least 4/5 against the cockpit anti-slop standard.
- `npm run verify` is green.
