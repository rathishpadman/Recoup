# Maya Real Backend Agentic Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Maya 12-beat shadcn cockpit from a backend-backed demo surface into a production-grade, fail-closed, real-backend, real-agentic workflow with no fake business data.

**Architecture:** Keep the shadcn UI, but make the backend the only source of business truth. Maya pages must consume typed API read models with field-level provenance, Supabase/SAP/source readiness must fail closed, SAP status must come from a bounded read-only health probe, and Query Evidence must invoke the forensic agent orchestration rather than static read-model rows. Fixture APIs remain allowed only in explicitly named fixture tests.

**Tech Stack:** Next.js App Router, React, TypeScript, shadcn/ui, Express cockpit API, Supabase-backed source readers, SAP OData read-only adapter, OpenAI Agents SDK trace hooks, Vitest, Playwright.

---

## Original QA Verdict

The previous plan was directionally correct, but not detailed enough. It named the right risks, but it did not yet lock file paths, endpoint contracts, tests, and pass/fail gates. This plan is the execution-grade version. The original confirmed gaps below are now historical execution inputs; the current status is recorded in the next section.

## Current Execution Status - 2026-06-24

Fresh controller evidence:

- `npm.cmd run verify` passed with lint, typecheck, 86 Vitest files / 698 tests, dependency-cruiser clean, and release readiness passed.
- `npm.cmd run test:e2e:maya-real` passed against real-backend mode, reached `POST /forensics/query` for 4 Maya browser query scenarios, and observed 32 backend trace rows.
- `/forensics/shadcn` now forwards verified Maya human backend-read headers during server render, so protected `/forensics` and `/connectors` reads stay gated instead of anonymous.
- Real-backend E2E source readiness reported SAP OData `Connected`; non-SAP Day-1 sources remain explicitly synthetic-labeled rather than relabeled as live.
- Maya Query Evidence now goes through backend `POST /forensics/query`; the endpoint requires deterministic evidence/citations, DB-backed query run-control, and a live OpenAI Agents SDK `Forensics Investigator` -> `Recovery Drafter` handoff before returning a visible answer.
- The visible Maya answer remains deterministic and cited; raw model text is suppressed and cannot supply dollars, verdicts, routing, approvals, or external-action state.
- Supabase project `nmwfftudympcvcjtyjbf` has `public.recoup_src_sap` with 12 clean `sap-odata` rows for S1-S6. S7/S8 intentionally remain SAP-fail-closed because the approved Harbor mapping conflicts with the live SAP header; they retain docs/bureau/TPM evidence where available.

Task status:

| Task | Status |
|---|---|
| 1. Maya real-backend contract tests | Implemented and covered by `verify`. |
| 2. Field-level provenance | Implemented and covered by `verify`. |
| 3. Real-backend mode and fail-closed API behavior | Implemented and covered by `verify`. |
| 4. Real source health | Implemented and covered by `verify`. |
| 5. Per-work-item backend endpoint | Implemented and covered by `verify`. |
| 6. Real forensic query session | Implemented and covered by `verify`; query requires deterministic citations plus live OpenAI Agents SDK Forensics -> Recovery handoff. |
| 7. Real-backend browser acceptance test | Implemented and passing with no fixture API, dummy data, or Playwright fulfillment. |
| 8. Remove static business values from 12 beats | Implemented and covered by `verify` plus Maya invariants. |
| 9. Handoff evidence | Updated with source truth, unavailable state, commands, SAP/Supabase evidence, and live-agent query proof. |
| 10. Final QA gate | Passing for the implemented Maya journey; bounded caveat remains S7/S8 SAP evidence fail-closed until owner/SAP customer mapping is reconciled. |

## File Structure

Create:

- `src/services/mayaDataProvenance.ts` - typed provenance helpers for every Maya-visible business field.
- `src/services/sourceHealth.ts` - bounded read-only connector health checks, including SAP checkedAt, latency, status, and proof.
- `src/services/forensicsQuerySession.ts` - server-side query session orchestration for Maya Query Evidence.
- `tests/invariants/maya-real-backend-contract.test.ts` - static-data and provenance invariant tests.
- `tests/unit/source-health.test.ts` - SAP/source health tests.
- `tests/unit/forensics-query-session.test.ts` - agentic query orchestration tests.
- `tests/e2e/maya-real-backend-e2e.ts` - browser storyline test against real backend only.

Modify:

- `src/services/cockpitApi.ts` - add real-backend mode, deep health, source health, per-item, and forensic query endpoints.
- `src/services/cockpitModel.ts` - remove hardcoded business values and attach provenance to Maya fields.
- `src/services/serviceLayer.ts` - expose retrieval/query orchestration helpers if not already accessible.
- `src/agents/query.ts` - stop using offline-only query path for Maya real mode.
- `src/agents/liveForensicsStream.ts` - reuse or extend trace event contract for Maya query sessions.
- `cockpit/app/cockpit-data.ts` - add typed fetchers and provenance types.
- `cockpit/app/forensics/shadcn/page.tsx` - fail closed when real-backend mode cannot load required data.
- `cockpit/components/maya/*.tsx` - render only API-backed fields for business data.
- `tests/e2e/cockpit-premium-e2e.ts` - keep fixture tests explicit and separate from real-backend acceptance.
- `docs/storyboards/maya-shadcn-ui-handoff-status.md` - record backend wiring status and evidence.

---

### Task 1: Add Maya Real-Backend Contract Tests

**Files:**
- Create: `tests/invariants/maya-real-backend-contract.test.ts`
- Modify: none

- [ ] **Step 1: Write failing static-data invariant**

```ts
import { readFileSync } from "node:fs";

const files = [
  "src/services/cockpitModel.ts",
  "cockpit/components/maya/query-evidence-dock.tsx",
  "cockpit/components/maya/agent-trace-panel.tsx",
  "tests/e2e/cockpit-premium-e2e.ts"
];

describe("Maya real-backend contract", () => {
  it("does not hardcode Maya business data in production read models", () => {
    const source = files.map((file) => `${file}\n${readFileSync(file, "utf8")}`).join("\n");

    expect(source).not.toContain("Refreshed 08:24 AM");
    expect(source).not.toContain("String(4)");
    expect(source).not.toContain("buildMultimodalSubAgents");
    expect(source).not.toContain("offline demo only");
  });

  it("keeps fixture API isolated from real-backend acceptance", () => {
    const e2e = readFileSync("tests/e2e/cockpit-premium-e2e.ts", "utf8");

    expect(e2e).toContain("--fixture-api");
    expect(e2e).not.toContain("test:e2e:maya-real");
  });
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `npm.cmd run test -- tests/invariants/maya-real-backend-contract.test.ts`

Expected: FAIL because current Maya code still contains static refresh/source/agent query markers.

---

### Task 2: Introduce Field-Level Provenance

**Files:**
- Create: `src/services/mayaDataProvenance.ts`
- Modify: `src/services/cockpitModel.ts`
- Test: `tests/invariants/maya-real-backend-contract.test.ts`

- [ ] **Step 1: Add provenance type**

```ts
export type MayaDataSourceKind = "supabase" | "sap_odata" | "agent_trace" | "derived_backend" | "operator_session";

export interface MayaFieldProvenance {
  sourceKind: MayaDataSourceKind;
  sourceName: string;
  recordIds: string[];
  deterministicBasis: string;
  checkedAtIso?: string;
}

export interface ProvenancedValue<T> {
  value: T;
  provenance: MayaFieldProvenance;
}

export function assertBusinessProvenance(fieldName: string, provenance: MayaFieldProvenance): void {
  if (provenance.recordIds.length === 0 && provenance.sourceKind !== "operator_session") {
    throw new Error(`Maya field ${fieldName} is missing source record IDs.`);
  }
  if (provenance.deterministicBasis.trim().length === 0) {
    throw new Error(`Maya field ${fieldName} is missing deterministic basis.`);
  }
}
```

- [ ] **Step 2: Update cockpit model business fields**

Convert KPI values, worklist rows, evidence counts, source status, recommended actions, agent trace rows, and draft state into either `ProvenancedValue<T>` or objects with a `provenance` property.

- [ ] **Step 3: Update test to require provenance**

Assert that every worklist row and selected case field has `provenance.sourceKind`, `provenance.recordIds`, and `provenance.deterministicBasis`.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd run test -- tests/invariants/maya-real-backend-contract.test.ts tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts`

Expected: PASS after model/type updates.

---

### Task 3: Add Real-Backend Mode and Fail-Closed API Behavior

**Files:**
- Modify: `src/services/cockpitApi.ts`
- Modify: `cockpit/app/cockpit-data.ts`
- Test: `tests/unit/cockpit-api.test.ts`

- [ ] **Step 1: Add mode parser**

Add an API runtime setting named `RECOUP_DATA_MODE` with values `real-backend` and `fixture`. Default production behavior must be `real-backend`.

- [ ] **Step 2: Write API tests**

Add tests proving:

- `GET /forensics` returns `503` if governed Supabase source rows are missing in `real-backend` mode.
- `GET /connectors` returns a real checkedAt timestamp, not a hardcoded label.
- Fixture API startup is not selected when `RECOUP_DATA_MODE=real-backend`.

- [ ] **Step 3: Implement fail-closed paths**

In `src/services/cockpitApi.ts`, do not call fixture or synthetic fallback readers in real-backend mode. Return JSON errors with `error`, `missingSource`, and `correlationId`.

- [ ] **Step 4: Run API tests**

Run: `npm.cmd run test -- tests/unit/cockpit-api.test.ts`

Expected: PASS.

---

### Task 4: Replace Connector Readiness With Real Source Health

**Files:**
- Create: `src/services/sourceHealth.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/services/cockpitModel.ts`
- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Test: `tests/unit/source-health.test.ts`

- [ ] **Step 1: Write SAP health tests**

Test cases:

- SAP health performs only read-only calls.
- Health result includes `checkedAtIso`, `latencyMs`, `status`, `sourceMode`, `proofItems`, and `lastError`.
- Failed SAP health shows blocked/unavailable state and never reports `Connected`.

- [ ] **Step 2: Implement source health result**

```ts
export interface SourceHealthResult {
  sourceName: string;
  status: "connected" | "degraded" | "blocked";
  sourceMode: "live" | "synthetic_static_table" | "unavailable";
  checkedAtIso: string;
  latencyMs: number;
  proofItems: string[];
  recordIds: string[];
  lastError?: string;
}
```

- [ ] **Step 3: Wire `/connectors`**

Make `/connectors` call `sourceHealth.ts` instead of returning a static `lastRefreshedLabel`. The UI can format `checkedAtIso`, but the timestamp must come from the backend response.

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -- tests/unit/source-health.test.ts tests/unit/cockpit.test.ts tests/invariants/connector-readiness.test.ts`

Expected: PASS.

---

### Task 5: Add Per-Work-Item Backend Endpoint

**Files:**
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/services/cockpitModel.ts`
- Modify: `cockpit/app/cockpit-data.ts`
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Test: `tests/unit/cockpit-api.test.ts`

- [ ] **Step 1: Write tests for `GET /forensics/work-items/:lineId`**

Required response fields:

- selected work item details
- evidence pack
- recommended action
- recovery draft state
- approval state
- audit state
- field-level provenance

- [ ] **Step 2: Implement endpoint**

The endpoint must rebuild from governed backend sources using the requested `lineId`. If the row does not exist, return `404`.

- [ ] **Step 3: Wire UI row click**

Clicking a worklist row must fetch the endpoint. Do not infer missing data from frontend state.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd run test -- tests/unit/cockpit-api.test.ts`

Expected: PASS.

---

### Task 6: Replace Query Evidence With Real Forensic Query Session

**Files:**
- Create: `src/services/forensicsQuerySession.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/agents/query.ts`
- Modify: `src/agents/liveForensicsStream.ts`
- Modify: `cockpit/app/cockpit-data.ts`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `cockpit/components/maya/agent-trace-panel.tsx`
- Test: `tests/unit/forensics-query-session.test.ts`

- [ ] **Step 1: Write orchestration tests**

Test that a Maya query:

- requires `selectedLineId` and `recordIds`
- invokes backend forensic orchestration
- emits supervisor/query/retrieval/decision trace events
- cites evidence record IDs
- returns no answer if agent trace or deterministic basis is missing

- [ ] **Step 2: Implement endpoint**

Add `POST /forensics/query`.

Request:

```json
{
  "selectedLineId": "S1-L1",
  "recordIds": ["SAP-001", "POD-001"],
  "question": "Why is this recoverable?"
}
```

Response:

```json
{
  "answer": "Backend generated cited answer text",
  "trace": [],
  "citations": [],
  "deterministicBasis": "runForensicsInvestigation + evidence source reads + AgentHooks trace"
}
```

- [ ] **Step 3: Replace browser-session query path**

`query-evidence-dock.tsx` must call `POST /forensics/query` for Maya real mode. `startRealtimeBrowserSession(...)` can remain only for explicitly separate realtime demos.

- [ ] **Step 4: Render real trace only**

`agent-trace-panel.tsx` must accept backend trace events. Remove static `dock.subAgents.map(...)` from the running/complete trace path.

- [ ] **Step 5: Run tests**

Run: `npm.cmd run test -- tests/unit/forensics-query-session.test.ts tests/invariants/maya-real-backend-contract.test.ts`

Expected: PASS.

---

### Task 7: Add Real-Backend Browser Acceptance Test

**Files:**
- Create: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `package.json`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Add package script**

Add:

```json
{
  "scripts": {
    "test:e2e:maya-real": "tsx tests/e2e/maya-real-backend-e2e.ts"
  }
}
```

- [ ] **Step 2: Write browser test**

The test must:

- visit `/login`
- enter Maya route
- load `/forensics/shadcn`
- assert network calls to `/forensics`, `/connectors`, and `/forensics/work-items/:lineId`
- click one work item
- ask a query
- assert `POST /forensics/query`
- assert agent trace rows came from backend response
- assert no request was fulfilled by Playwright `page.route`
- assert no fixture API process started

- [ ] **Step 3: Run browser test**

Run: `npm.cmd run test:e2e:maya-real`

Expected: PASS only against real backend data. If source data is missing, expected result is a clear fail-closed error, not a fake successful demo.

---

### Task 8: Remove Static Business Values From All 12 Beat Screens

**Files:**
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/maya-run-kpi-strip.tsx`
- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/evidence-dossier.tsx`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `cockpit/components/maya/agent-trace-panel.tsx`
- Modify: `cockpit/components/maya/recovery-draft-review.tsx`
- Modify: `cockpit/components/maya/approval-gate-dialog.tsx`
- Modify: `cockpit/components/maya/audit-confirmation-panel.tsx`
- Test: `tests/invariants/maya-real-backend-contract.test.ts`

- [ ] **Step 1: Audit Beat 1 through Beat 12**

For every visible business data point, classify it as:

- backend field
- operator session field
- UI-only label
- blocked because backend data is unavailable

- [ ] **Step 2: Remove or block any fake field**

If a value is not backed by API data, show a fail-closed unavailable state. Do not replace it with copy that implies data exists.

- [ ] **Step 3: Run component and invariant tests**

Run: `npm.cmd run test -- tests/invariants/maya-real-backend-contract.test.ts tests/invariants/maya-shadcn-boundary.test.ts`

Expected: PASS.

---

### Task 9: Update Handoff Evidence

**Files:**
- Modify: `docs/storyboards/maya-shadcn-ui-handoff-status.md`
- Modify: `docs/independent-audit-log.md`

- [ ] **Step 1: Record source truth**

Document which fields are Supabase-backed, SAP-backed, agent-trace-backed, derived backend values, or UI-only labels.

- [ ] **Step 2: Record known unavailable states**

If SAP or Supabase is unavailable, record the exact endpoint status and reason.

- [ ] **Step 3: Record verification commands**

Include:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
npm.cmd run test:e2e:maya-real
```

---

### Task 10: Final QA Gate

**Files:**
- No direct source changes

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
npm.cmd run test:e2e:maya-real
```

Expected: all PASS. If `test:e2e:maya-real` fails due unavailable Supabase/SAP rows, the result is not demo-ready.

- [ ] **Step 2: Browser screenshot review**

Capture Beat 1 through Beat 12 in sequence. Compare each against the approved mockup and score both:

- component-level fidelity
- backend provenance fidelity

Pass threshold: `4.5/5` for both.

- [ ] **Step 3: Senior QA critique**

Before claiming done, answer:

- Which visible values are Supabase-backed?
- Which visible values are SAP-backed?
- Which visible values are derived by deterministic backend code?
- Which visible values come from live agent trace?
- Which values are unavailable and fail closed?
- Did any Playwright test use fixture API or mocked app API calls?

Expected: no fake or dummy business data remains in real-backend Maya flow.
