# Maya Prod Copilot Query Sweep - 2026-07-06

## Scope

Production alias tested for baseline failure: `https://recoup-self-eta.vercel.app`

Production baseline under test: `13a8e0f Fix Maya workspace copilot settlement queries`

Local remediation under test: uncommitted patch in `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-landing-prod`; production deploy remains pending.

Evidence artifacts:

- `output/playwright/maya-prod-all-case-query-sweep/prod-all-case-query-sweep-report.json`
- `output/playwright/maya-prod-all-case-query-sweep/failed-case-diagnostics.json`
- `output/playwright/maya-prod-all-case-query-sweep/workspace-copilot-answer.png`

Local remediation evidence:

- Failed-case diagnostic against `http://127.0.0.1:3000`: S4, S5, S7, and S8 all returned `live_openai_agents`.
- Full all-case browser sweep against `http://127.0.0.1:3000`: `caseFailures: 0`, `caseTotal: 8`, `workspaceFailures: 0`, `staleRunStatus: 409`, `workspaceVisibleMs: 6016`.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run test`: 127 test files passed, 1130 tests passed.
- `npm run build`: pass.

## Execution Summary

| Area | Expected | Result | Status |
| --- | --- | --- | --- |
| Maya login and workspace load | Authenticated Maya user reaches `/forensics/shadcn` and the workbench renders from prod | Workbench visible after 28.1s | Pass with latency note |
| Workspace Copilot question | UI submits `scope: "workspace"` and the current backend `settlementRunId`; answer matches live worklist rollup | Submitted `settlement-run:42:4b6d444991d98a43`; answer matched 8 cases, 3 valid, 4 invalid, 1 partial | Pass |
| Stale settlement run guard | Old settlement run id fails closed | `/api/forensics/query` returned 409 with `Maya workspace query requires the current settlement run.` | Pass |
| Case selected-evidence questions | All 8 cases return cited selected-evidence answer, trace, citations, and live agent completion metadata | 4 passed; 4 failed closed with `blocked_live_agent_trace` | Fail |

## Case Results

| Case | Customer | Question | Expected From Read Model | Production Result | Status |
| --- | --- | --- | --- | --- | --- |
| S1 | Greenleaf Naturals | What evidence supports the Billing verdict for Greenleaf Naturals? | Valid, Billing, cited evidence | Answer, citations, trace, and `live_openai_agents` present | Pass |
| S2 | Crestline Grocery | Why did agents treat Crestline Grocery as a valid deduction? | Valid, Billing, cited evidence | Answer, citations, trace, and `live_openai_agents` present | Pass |
| S3 | Crestline Grocery | Why did agents route Crestline Grocery to Recovery? | Invalid, Recovery, cited evidence | Answer, citations, trace, and `live_openai_agents` present | Pass |
| S4 | ValuMart Club | Why did agents treat ValuMart Club as a valid deduction? | Valid, Billing, cited evidence | No answer/citations/trace; `blocked_live_agent_trace` | Fail |
| S5 | ValuMart Club | Why did agents route ValuMart Club to Recovery? | Invalid, Recovery, cited evidence | No answer/citations/trace; `blocked_live_agent_trace` | Fail |
| S6 | Crestline Grocery | What proof supports the Recovery verdict for Crestline Grocery? | Invalid, Recovery, cited evidence | Answer, citations, trace, and `live_openai_agents` present | Pass |
| S7 | Harbor Foods | For Harbor Foods, what cited evidence supports the partial split verdict? | Partial, Recovery, cited evidence | No answer/citations/trace; `blocked_live_agent_trace` | Fail |
| S8 | Harbor Foods | What proof supports the Recovery verdict for Harbor Foods? | Invalid, Recovery, cited evidence | No answer/citations/trace; `blocked_live_agent_trace` | Fail |

## Failed Case Diagnostics

| Case | Failure Reason From Prod Response | Interpretation | Remediation |
| --- | --- | --- | --- |
| S4 | `Deterministic query answer guard blocked the selected evidence response.` on full evidence scope; minimal selected-line retry then failed with `Live Agents SDK trace did not include a successful selected-evidence MCP query.answer source read.` | The UI/detail route could submit a selected evidence scope that did not match the current backend query scope. | Server now narrows client-submitted record IDs to the current backend-selected evidence pack and worklist provenance before live-agent invocation and deterministic fallback. Local S4 diagnostic passes. |
| S5 | `Deterministic query answer guard blocked the selected evidence response.` on full evidence scope; minimal selected-line retry then failed with `Live Agents SDK trace did not include a successful selected-evidence MCP query.answer source read.` | Same selected-scope reconciliation issue as S4. | Same server-side current-scope normalization as S4. Local S5 diagnostic passes. |
| S7 | `Live Agents SDK trace did not include a successful selected-evidence MCP query.answer source read.` | Partial/non-SAP selected evidence is source-backed through Supabase synthetic connectors, but `query.answer` only accepted reconciliation-selected evidence or SAP evidence. | `query.answer` now falls back to selected Supabase connector/vector evidence before requiring SAP. Local S7 diagnostic passes. |
| S8 | `Live Agents SDK trace did not include a successful selected-evidence MCP query.answer source read.` | Same partial/non-SAP source-read gap as S7. | Same source-read contract fix as S7. Local S8 diagnostic passes. |
| Unsafe/stale submitted record IDs | Reviewer regression showed original submitted record IDs could be hidden by normalization before validation and persistence checks. | The query route needed to distinguish secret-like unsafe IDs from safe-but-stale detail IDs. | Secret-like IDs now fail closed before live agents; safe stale IDs are dropped before live agents and query persistence is skipped for that request. |

## Remediation Plan

| Phase | Work | Exit Criteria |
| --- | --- | --- |
| 1 | Add failing tests for selected query scope, trusted read-model IDs, deterministic fallback, and non-SAP selected source evidence. | Complete; focused regressions pass without dummy data. |
| 2 | Normalize selected-evidence scope server-side before live-agent execution so client-submitted record IDs cannot expand or stale-shift beyond the current backend-selected evidence pack and worklist provenance. | Complete; S4/S5 local diagnostic returns cited `live_openai_agents` answers. |
| 3 | Harden deterministic source-read fallback so non-SAP selected evidence from Supabase connectors can satisfy the guard when SAP rows are unavailable. | Complete; S7/S8 local diagnostic returns cited `live_openai_agents` answers. |
| 4 | Re-run focused tests, full `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, and full browser sweep. | Complete locally; all verification green. |
| 5 | Deploy to Render/Vercel and rerun production sweep across workspace plus all 8 cases. | Pending production deploy and public-alias sweep. |

## Current Gate

Local remediation gate is clear. Production remains gated until the patched main commit is deployed and the public alias passes the same workspace plus all-8-case sweep.
