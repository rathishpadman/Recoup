# Maya Agentic Deduction Forensics Technical Design

Date: 2026-06-26

Purpose: document the final architecture for the Maya Deduction Forensics cockpit after the production UX revamp. This is the technical story a reviewer should use to understand why Recoup is not a generic agent dashboard: business values are canonical and deterministic, source access is governed, agent work is traceable, and external actions stay human gated.

Mobile QA is intentionally skipped for this revamp pass per owner direction on 2026-06-26. Desktop browser QA remains the release evidence for the Maya UI slice.

## 1. Architecture Thesis

Recoup is strongest when the architecture is split into three planes:

| Plane | Owns | Must not own |
|---|---|---|
| Reasoning plane | Agent planning, retrieval intent, explanation, handoff narrative | Dollar math, deduction verdicts, ERP credentials, external action approval |
| Data plane | Governed source access through adapters and the MCP gateway | Autonomous decisions |
| Control plane | Deterministic rules, amount computation, routing, approval state, audit chain | Free-form model judgment |

That separation is the central design choice. It lets Maya feel agentic without letting an agent become the system of record.

## 2. Non-Negotiables

- No model-computed dollar amount reaches a finding, draft, approval, or verdict.
- SAP is read-only. There is no ERP write path.
- The UI does not invent business values; it formats backend/API/read-model values only.
- Raw source IDs remain available, but business labels appear first.
- Every decision-visible answer needs cited record IDs and deterministic basis.
- Every external action is draft-only until a human approval gate is satisfied.
- Unknown or mismatched data fails closed.

## 3. End-To-End Desktop Flow

```text
+------------------+       +-------------------------+       +----------------------+
| Maya analyst     | ----> | Vercel / Next cockpit   | ----> | Render / Node API    |
| browser session  |       | /forensics/shadcn       |       | cockpitApi.ts        |
+------------------+       +-------------------------+       +----------------------+
        |                              |                              |
        | login cookie + role          | backend-read auth headers    |
        |                              |                              v
        |                              |                   +----------------------+
        |                              |                   | Cockpit read models  |
        |                              |                   | cockpitModel.ts      |
        |                              |                   +----------------------+
        |                              |                              |
        | renders typed data           |                              v
        | <----------------------------+                   +----------------------+
        |                                                  | Canonical source     |
        | query / tabs / approval                           | adapters + services  |
        v                                                  +----------------------+
+------------------+
| Clean cockpit UI |
| no local facts   |
+------------------+
```

The browser is an operating surface, not a decision engine. A row click, tab switch, query, draft review, or approval dialog all resolve against backend/API state. The frontend may choose density, labels, disclosure, and layout; it may not create dollars, statuses, verdicts, source health, record counts, or action outcomes.

## 4. Canonical Data Translation Layer

SAP data must not go straight to an agent as raw business truth. It is translated into Recoup's canonical model first, then served to deterministic services and scoped agent tools.

```text
+-------------------+       +-----------------------+       +-----------------------+
| SAP OData         | ----> | Read-only adapters    | ----> | Canonical source      |
| invoices, PODs,   |       | sapOData.ts           |       | snapshot              |
| customer records  |       | retrieval/sap.ts      |       | entities + evidence   |
+-------------------+       +-----------------------+       +-----------------------+
                                                                    |
+-------------------+       +-----------------------+               |
| Supabase source   | ----> | governed source rows  | --------------+
| rows + memory     |       | memory/source tables  |
+-------------------+       +-----------------------+
                                                                    v
                                                        +-----------------------+
                                                        | Deterministic core    |
                                                        | rules, verdicts,      |
                                                        | amounts, routing      |
                                                        +-----------------------+
                                                                    |
                                                                    v
                                                        +-----------------------+
                                                        | Cockpit read model    |
                                                        | provenance attached   |
                                                        +-----------------------+
```

Why this matters:

- SAP terms, document IDs, and transport details are normalized before the LLM sees anything.
- The deterministic core receives cited inputs, not free-form agent recollections.
- The cockpit can say exactly where a field came from: SAP OData, Supabase, derived backend code, agent trace, or operator session.
- If a mapping is missing or mismatched, the system shows an unavailable/contract-gap state instead of guessing.

## 5. Live Agent Query And MCP Data Plane

The current live Maya query path is designed around a private Streamable HTTP MCP gateway.

```text
Maya query dock
  |
  | POST /api/forensics/query
  v
Next API proxy
  |
  v
Render API: runForensicsQuerySessionWithLiveAgents
  |
  +--> deterministic guard runs first
  |      - selectedLineId must exist
  |      - citations must exist
  |      - deterministic answer can be built
  |
  +--> OpenAI Agents SDK live run
         |
         | attaches MCPServerStreamableHttp
         v
      Forensics Investigator
         |
         | tools/list through SDK transport
         v
      Recoup MCP gateway
         |
         | allowed Maya tools:
         | - query.answer
         | - audit.read
         |
         v
      query.answer
         |
         | selected evidence scope header
         | selectedLineId + selected recordIds
         v
      serviceLayer.ts
         |
         | governed source reads
         v
      SAP/Supabase canonical evidence
         |
         v
      tool output proof
         |
         v
      agent_tool_start / agent_tool_end receipts
         |
         v
      Recovery Drafter handoff receipt
         |
         v
Backend returns deterministic answer + trace + citations
```

Important nuance: the agent does not receive an unrestricted raw SAP tool. For the Maya query surface, the allowed MCP tools are intentionally narrow: `query.answer` and `audit.read`. `query.answer` is the governed source-read tool that can return selected-evidence proof, including SAP OData provenance, only for the currently selected record scope.

This is safer than exposing a broad `sap.query` tool because:

- The selected evidence packet is request-bound.
- The MCP gateway owns source credentials.
- The agent sees only filtered tools from the SDK `tools/list`.
- The backend blocks the live answer if the trace lacks a successful selected-evidence MCP `query.answer` proof.
- The deterministic answer remains code-built even when the live agent trace is present.

## 6. Why This Beats A Direct-Agent-To-SAP Design

| Concern | Direct agent to SAP | Recoup design |
|---|---|---|
| SAP credentials | Risk of leaking into agent runtime or prompt context | Held by gateway/adapters, not by the agent |
| Tool surface | Broad, source-specific, easy to misuse | Narrow, scoped `query.answer` and `audit.read` for Maya |
| Dollar safety | Model could summarize or alter amounts | Code computes and formats amounts |
| Verdict safety | Model could overstate validity | Deterministic rules own verdicts and routing |
| Auditability | Tool logs may not match UI claims | Agent trace must include MCP receipts and record IDs |
| Failure mode | Agent may improvise around missing data | Backend returns unavailable/blocked states |
| Demo credibility | Hard to prove least privilege | MCP trace and gateway logs are inspectable |

The result is still agentic: the model decides what to ask and how to explain it. But source access, money, decisions, and approvals remain governed by code.

## 7. UI Composition And Cleanliness

```text
+------------------------------------------------------------------------+
| Workspace shell                                                        |
| - sidebar route navigation                                             |
| - logout/session visibility                                            |
| - source health and refresh state                                      |
+----------------------+-------------------------------------------------+
| Worklist             | Case command header                             |
| - backend rows       | - verdict prominence                           |
| - valid deduction    | - amount read-only                             |
| - selected state     | - business labels first                        |
+----------------------+-------------------------------------------------+
| Detail tabs                                                            |
|                                                                        |
| Overview     Evidence     Agent Trace     Draft     Audit              |
|                                                                        |
| Each tab has a reason to exist:                                        |
| - Overview: business summary and backend-backed stats                  |
| - Evidence: grouped business documents, raw IDs behind disclosure      |
| - Agent Trace: business-readable timeline, receipts collapsed          |
| - Draft: draft-only recovery/billing action review                     |
| - Audit: committed receipt state and honest contract gaps              |
+------------------------------------------------------------------------+
| Recoup Agent launcher / query drawer                                   |
| - compact context                                                       |
| - prompt chips from read model                                          |
| - normal chat interaction                                               |
| - citations and source details behind collapse                          |
+------------------------------------------------------------------------+
```

The UI revamp keeps the page clean by moving technical detail into expandable drawers/details:

- Source record IDs are available under source details, not promoted as primary business copy.
- Trace receipts are available behind disclosure, not rendered as a grid of debug cards.
- Audit contract gaps are honest but grouped, so the user understands what is blocked.
- Line selection uses accessible buttons and selected state, not ambiguous static pills.
- Positive cases such as `Valid deduction` are visible as backend verdicts, not invented highlights.

## 8. Fail-Closed State Model

```text
Requested UI state
    |
    v
Does backend/read model provide the field?
    |
    +-- no --> show unavailable / contract gap / disabled action
    |
    +-- yes
          |
          v
Does field provenance pass?
          |
          +-- no --> fail closed and show error/blocked state
          |
          +-- yes
                |
                v
Render field with business label + optional source detail
```

Recent UI hardening follows this model:

- Work item detail identity mismatches fail closed before the page clears loading state.
- Loading uses skeletons and stable hooks instead of silent blank panels.
- Empty state uses a consistent surface and does not fake rows.
- Human approval controls remain disabled when backend eligibility is absent.
- Query answers are blocked if live agent trace evidence is missing.

## 9. Deployment Shape

```text
+------------------------+        +-------------------------+
| Browser                | -----> | Vercel cockpit         |
| /login, /forensics     |        | Next.js / cockpit      |
+------------------------+        +-------------------------+
                                           |
                                           | RECOUP_API_URL
                                           v
                                +-------------------------+
                                | Render recoup-api       |
                                | Node 22, start:api      |
                                +-------------------------+
                                           |
                         +-----------------+-----------------+
                         |                                   |
                         v                                   v
              +----------------------+           +----------------------+
              | Loopback MCP gateway |           | Deterministic core   |
              | Streamable HTTP      |           | services/rules/audit |
              +----------------------+           +----------------------+
                         |
                         v
              +----------------------+
              | SAP OData read-only  |
              | Supabase data plane  |
              +----------------------+
```

Initial production deployment should keep `RECOUP_MCP_URL` unset so the MCP server stays private to the Render API process. The live query path can start an authenticated loopback MCP gateway. A separate public MCP service is future hardening, not required for the first production deploy.

## 10. Implementation References

| Concern | Files |
|---|---|
| Maya route and shell | `cockpit/app/forensics/shadcn/page.tsx`, `cockpit/components/maya/maya-workspace-shell.tsx` |
| Main UI state and fail-closed detail loading | `cockpit/components/maya/maya-forensics-surface.tsx` |
| Worklist and selected state | `cockpit/components/maya/deduction-worklist-table.tsx` |
| Case tabs and line selector | `cockpit/components/maya/deduction-case-workspace.tsx` |
| Evidence grouping and source detail disclosure | `cockpit/components/maya/evidence-dossier.tsx` |
| Query drawer | `cockpit/components/maya/query-evidence-dock.tsx` |
| Agent trace timeline | `cockpit/components/maya/agent-trace-panel.tsx` |
| Audit disclosure | `cockpit/components/maya/audit-confirmation-panel.tsx` |
| Canonical read model and provenance | `src/services/cockpitModel.ts`, `src/services/mayaDataProvenance.ts` |
| Deterministic forensics run | `src/agents/forensics.ts`, `src/agents/query.ts` |
| Live query session guard | `src/services/forensicsQuerySession.ts` |
| Live OpenAI Agents SDK stream | `src/agents/liveForensicsStream.ts` |
| MCP client factory | `src/agents/mcpGateway.ts` |
| MCP gateway/server | `src/mcp/server.ts`, `src/services/serviceLayer.ts` |
| Deployment runbook | `docs/audits/maya-multiagent-audit-2026-06-25/DEPLOYMENT-READINESS.md` |

## 11. Desktop QA And Release Gates

The desktop storyboard proof path is:

```powershell
npm.cmd run test:e2e -- --maya-shadcn-only
```

It captures the 12 desktop beats documented in `docs/qa/maya-12-beat-testing-storyboard.md`:

1. Login entry
2. Logged-in Overview/dashboard
3. Worklist recommended action
4. Case Overview
5. Evidence dossier
6. Query start
7. Agent Trace running
8. Cited answer
9. Draft review
10. Human approval
11. Audit confirmation
12. Return to worklist

Final release evidence still needs the normal code gates:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
```

For deployment readiness, also run the real backend and provider smoke path from `DEPLOYMENT-READINESS.md`.

## 12. Remaining Items Before Production Signoff

| Item | Status |
|---|---|
| Desktop Maya UX revamp implementation | In progress until final gates, commit, and push complete |
| Mobile QA | Explicitly skipped for this pass |
| Production Vercel login/page-load delay diagnosis | Remains deployment-smoke scope; requires live Vercel telemetry and cold/warm timing |
| Render/Vercel deployment | Planned in deployment runbook; not complete until exact commit is deployed and smoke-tested |
| Real production MCP proof | Must be shown by production Maya query trace containing selected-evidence `query.answer` tool output with SAP/Supabase proof |
| Full release reproducibility | Requires clean pushed commit plus final `npm.cmd run verify` |

## 13. Best-Practice Summary

This solution is strong because it gives each layer one job:

- Browser: operate, inspect, and ask.
- Read model: provide typed, provenanced business state.
- Deterministic core: compute money, verdicts, routing, and approvals.
- MCP gateway: expose only governed source tools to agents.
- Agents: plan, retrieve through allowed tools, hand off, and explain.
- Human gate: approve external actions.
- Audit trail: prove what happened.

That is the right enterprise pattern for agentic finance software: the product feels intelligent, but the accounting, source access, and governance remain deterministic and inspectable.
