# Maya Production Test Execution - 2026-06-27

## Executive Result

**Result:** PASS with source-health caveats.

Production was deployed and tested with a real Chromium browser against Vercel + Render:

- Vercel production URL: `https://recoup-self-eta.vercel.app`
- Render API URL: `https://recoup-api.onrender.com`
- Commit tested: `9446ebb8f6801437b4c1408df727af305e762f67`
- Browser runner: `npx tsx scripts/runMayaProdQa.ts`
- Evidence JSON: `output/playwright/prod-qa/maya-prod-qa-results.json`
- Last production browser run: `2026-06-27T05:37:05.073Z`
- Screenshots:
  - `output/playwright/prod-qa/00-login.png`
  - `output/playwright/prod-qa/01-workspace.png`
  - `output/playwright/prod-qa/02-investigation.png`
  - `output/playwright/prod-qa/03-query-results.png`
  - `output/playwright/prod-qa/04-hitl.png`

## Deployment Evidence

| Area | Evidence | Result |
|---|---|---|
| Local gate | `npm.cmd run verify` | PASS: lint, typecheck, 90 test files, 798 tests, depcruise, release readiness |
| Git branch | `codex/maya-ux-production-revamp` pushed to origin | PASS |
| Render deploy branch | `codex/guardrail-riskmesh-hardening` fast-forwarded to same commit | PASS |
| Render deploy | Deploy `dep-d8vlqeojo6nc73c5liq0`, commit `9446ebb`, status `live` | PASS from deploy inspection |
| Render app log | `Recoup cockpit API listening on http://127.0.0.1:4317`, service live at `2026-06-27T05:21:57Z` | PASS from deploy log inspection |
| Render health | `GET /healthz` returned 200 from browser runner | PASS |
| Vercel deploy | Deployment `dpl_UiyPYu4xvjSZrD1Y2KKFEjvVrSEW`, target production, status Ready | PASS |
| Vercel aliases | `recoup-self-eta.vercel.app`, `recoup-hackathonopenai.vercel.app`, `recoup-srathish-2309-hackathonopenai.vercel.app` | PASS |

## Browser Baseline

| Scenario | Evidence | Result |
|---|---:|---|
| Login page interactive | 2,126 ms to visible login inputs | PASS |
| Demo login API | `POST /api/demo-login` returned 200 | PASS |
| Workspace ready | 15,709 ms from first login navigation to Maya workspace ready | PASS with performance watch |
| Source readiness fetch | `GET /api/connectors` returned 200 in 636 ms | PASS |
| Console errors | 0 captured browser console/page errors | PASS |
| Work item detail | `GET /api/forensics/work-items/S3-L1` returned 200 | PASS |

## Source Status Behavior

The production browser run verified that the source readiness endpoint returned saved tile data in 636 ms. The implementation is intended to be snapshot-first rather than static: page load reads saved source-health state, and backend refresh/poller paths update that saved state from real probes.

| Status condition | User-facing copy |
|---|---|
| Live source healthy | `Connected` |
| Supabase-backed secondary/proxy source | `Proxy - Supabase` |
| Probe executed and failed | `Probe failed` |
| Saved snapshot exists but is stale | `Refresh overdue` |
| No saved usable status | `Status unavailable` |

## Source Status Tiles

| Source tile | Mode label | State label | Tone | Interpretation |
|---|---|---|---|---|
| SAP OData | Unavailable | Probe failed | blocked | Live SAP metadata/readiness probe is failing in prod; UI fails closed instead of pretending live SAP is connected. |
| TPM | Proxy - Supabase | Proxy - Supabase | synthetic | Secondary/proxy source is clearly labelled as Supabase-backed. |
| 3PL POD | Proxy - Supabase | Proxy - Supabase | synthetic | Secondary/proxy source is clearly labelled as Supabase-backed. |
| Bureau | Proxy - Supabase | Proxy - Supabase | synthetic | Secondary/proxy source is clearly labelled as Supabase-backed. |
| Remittance / EDI | Proxy - Supabase | Proxy - Supabase | synthetic | Secondary/proxy source is clearly labelled as Supabase-backed. |
| Contract Repo | Proxy - Supabase | Proxy - Supabase | synthetic | Secondary/proxy source is clearly labelled as Supabase-backed. |
| MCP | Read-only tools | Status unavailable | blocked | MCP health snapshot is not available in prod, so the tile fails closed. Query traces still recorded SDK MCP source-tool receipts. |

## Navigation And Component Checks

| Component/section | Test id | Browser result |
|---|---|---|
| Overview | `maya-root-section-overview` | PASS |
| Worklist | `maya-root-section-worklist` | PASS |
| Cases | `maya-root-section-cases` | PASS |
| Evidence | `maya-root-section-evidence` | PASS |
| Approvals | `maya-root-section-approvals` | PASS |
| Investigation workspace | `maya-case-workspace` | PASS |
| Evidence query drawer | `maya-query-dock` | PASS |
| HITL approval dialog | `maya-approval-gate-dialog` | PASS |

## Eight Maya Chat Agent Queries

All queries were submitted through the production UI query drawer. Browser network captured eight `POST /api/forensics/query` calls, all HTTP 200. Each response returned 18 citations, 10 trace rows, `query.answer` + `retrieval.evidence` tool names, a successful SDK MCP source-tool receipt, and the deterministic basis `runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace`.

Important distinction: the per-query trace proves an SDK-visible governed MCP source-tool receipt for `query.answer`; the separate MCP gateway health tile still reported `Status unavailable` in this production run.

| # | Query id | Question | HTTP | Duration | Citations | Trace rows | Agent trace | SDK MCP source-tool receipt | MCP gateway health | SAP evidence | Result |
|---:|---|---|---:|---:|---:|---:|---|---|---|---|---|
| 1 | `q1-shortage-challenge-proof` | Customer says valid shortage deduction. Which cited proof can challenge it? | 200 | 9,084 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 2 | `q2-manager-approval-brief` | Manager-ready summary before approval gate. | 200 | 8,796 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 3 | `q3-billing-vs-recovery-route` | Billing correction or recovery pursuit? | 200 | 20,102 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 4 | `q4-handoff-hitl-draft-gate` | Confirm Forensics handoff to Recovery Drafter and HITL gate. | 200 | 9,794 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 5 | `q5-valid-deduction-counterfactual` | What evidence would make this a valid deduction? | 200 | 7,644 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 6 | `q6-sap-call-provenance` | Show SAP/ERP read evidence and source-system vs support docs. | 200 | 19,398 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 7 | `q7-risk-if-approved` | Approval risk and records that keep action inside HITL boundary. | 200 | 8,882 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |
| 8 | `q8-source-gaps-and-next-step` | Missing/stale sources or approval receipt fields; next step without ERP write-back. | 200 | 8,005 ms | 18 | 10 | agent start -> tool start/end -> handoff -> evidence cited -> basis checked | `query.answer` receipt present | tile `Status unavailable` | true | PASS |

## HITL Gate

| Check | Evidence | Result |
|---|---|---|
| Approval dialog visible | `maya-approval-gate-dialog` visible | PASS |
| Human note counter visible | `maya-approval-note-counter` visible | PASS |
| Decision buttons present | `Approval source details`, `Approve`, `RejectReason required`, `Request changesReason required`, `Cancel` | PASS |
| Buttons disabled/fail closed | Approval buttons disabled because approval eligibility/evidence reviewed state is unavailable | PASS |
| ERP write-back | No `/api/approval` POST was sent because buttons were disabled | PASS |

## Provider Logs

| Log source | Result |
|---|---|
| Render deploy/app logs | Available from deploy inspection. Confirmed `npm run start:api`, API listening, and service live for commit `9446ebb`. |
| Render request path logs | No Render request-path logs are present in this QA artifact; browser network logs are the per-request evidence for this run. |
| Browser network log | Available. Captured `POST /api/demo-login`, `GET /api/connectors`, `GET /api/forensics/work-items/S3-L1`, and eight `POST /api/forensics/query` calls, all 200. |

## Caveats And Follow-Ups

1. **SAP live health is red in prod.** The UI correctly shows `Probe failed`. Query answers still carry SAP-provenance evidence records from the canonical selected evidence packet, but the live SAP metadata/source-health probe is not green.
2. **MCP tile is fail-closed.** The MCP source tile says `Status unavailable` because no saved MCP health snapshot is available to the UI. The query responses still include SDK MCP source-tool receipts (`query.answer`) and `retrieval.evidence` trace rows, but this does not make the gateway health tile green.
3. **Workspace load was 15.7 seconds.** The workspace route still takes about 16 seconds in this prod run and should remain a performance item.
4. **Render request logs were not returned by MCP.** Browser API evidence is authoritative for this run; provider request-path logs should be enabled or queried differently if per-request provider evidence is required.

## Latency And Source-Health Recheck - 2026-06-27T11:50Z

**Result:** PASS. The earlier login `503` / long-load concern is not reproducing after the Supabase-backed login change. The remaining measurable wait is the post-login Maya workspace document, which still server-renders from Render-backed read models.

| Check | Evidence | Result |
|---|---:|---|
| Production browser runner | `npm.cmd exec tsx scripts/runMayaProdQa.ts` | PASS |
| Login API | `POST /api/demo-login` | 200 |
| Login page interactive | `loginPageInteractiveMs` | 3,905 ms |
| Workspace ready | `workspaceReadyMs` | 11,825 ms |
| Source readiness fetch | `GET /api/connectors` via browser | 795 ms |
| Console/page errors | Captured by Playwright | 0 |
| Query scenarios | 8 production UI queries | 8 passed / 0 failed |
| Query duration range | `POST /api/forensics/query` | 9,162-16,012 ms |

Current source tiles from the recheck:

| Source tile | Mode label | State label | Tone |
|---|---|---|---|
| SAP OData | Unavailable | Probe failed | blocked |
| TPM | Proxy - Supabase | Proxy - Supabase | synthetic |
| 3PL POD | Proxy - Supabase | Proxy - Supabase | synthetic |
| Bureau | Proxy - Supabase | Proxy - Supabase | synthetic |
| Remittance / EDI | Proxy - Supabase | Proxy - Supabase | synthetic |
| Contract Repo | Proxy - Supabase | Proxy - Supabase | synthetic |
| MCP | Read-only tools | Connected | ready |

Focused production timing split:

| Path | Timing evidence | Interpretation |
|---|---:|---|
| `GET /login` browser document | 438-497 ms in focused runs | Vercel login page is not the 10-20 second bottleneck. |
| `/login` inputs visible | 1,094-1,314 ms in focused runs | Login becomes interactive quickly after warm deployment. |
| `POST /api/demo-login` | 505-1,052 ms in focused runs | Vercel is calling the Supabase credential RPC successfully; no Render hop is involved. |
| `GET /forensics/shadcn` browser document | 1,121-3,576 ms in focused runs | This document waits on server-side workspace data. |
| Full workspace ready | 3,220-5,461 ms in focused warm runs | Warm path is materially better than the earlier 15.7s run, but still depends on Render-backed workspace data. |
| Direct Render `GET /healthz` | 485-1,140 ms | Render is reachable; first hit is slower than warm hits. |
| Direct Render `GET /forensics` | 3,740 ms first hit, then 932-966 ms | Main remaining workspace latency is Render `/forensics` read-model hydration/coldness. |
| Direct Render `GET /connectors` | 488-624 ms | Source-health tile read is not the dominant delay. |

Architecture finding from this recheck:

- `/api/demo-login` is now Vercel -> Supabase RPC. It no longer calls Render.
- `/forensics/shadcn` still fetches the Maya workbench read model and connector model from Render through `RECOUP_API_URL`.
- `/api/connectors`, `/api/forensics/query`, `/api/forensics/work-items/*`, `/api/approval`, and realtime query proxy routes still use Render as the Node service/agent orchestration layer.
- Source-health state is snapshot-backed, not static. Missing snapshots fail closed as unavailable; stale snapshots are labelled overdue. The current MCP snapshot is now available and renders `Connected`.

Recommended next remediation:

1. Keep login as-is; current production evidence does not support more login-path surgery.
2. Treat `/forensics/shadcn` first paint as the remaining performance target.
3. Prefer a safe prewarm/keep-warm or workspace shell strategy over moving agent/service orchestration into Vercel. Render still owns the deterministic service layer, MCP/tool surface, guardrails, and query execution.
4. If workspace latency must be reduced further, add TDD coverage for route timing behavior and split the initial Maya shell from heavy evidence hydration without changing backend-owned business content.
