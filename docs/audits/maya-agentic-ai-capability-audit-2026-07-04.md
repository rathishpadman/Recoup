# Maya Agentic AI Capability Audit

Date: 2026-07-04

Branch/worktree audited: `codex/maya-reference-workspace-plan`, dirty worktree. This is a current local working-tree audit, not a production release certification.

User question: Are the agentic AI capabilities fully wired into the Maya persona journey, including new-case recognition, classification, UI visibility, Recoup Copilot explanations, memory, tools/MCP gateway, and LLM wiring?

## Executive Verdict

The solution is meaningfully wired, but it is not fully foolproof for arbitrary new SAP/Supabase entries.

What is strong:

- Maya worklist, case detail, verdict, routing, recommended action, evidence pack, approval state, and query dock are backend/read-model sourced.
- The canonical 8 cases / 20 lines are explicitly represented and tested.
- Classification is deterministic and evidence-gated. The model does not compute dollars or own the verdict.
- Live Maya query requires OpenAI Agents SDK execution, a Forensics to Recovery handoff, and an MCP `query.answer` selected-evidence source read before returning live-agent-backed metadata.
- Memory persistence and recall exist, with PII/secret rejection and safe record ID constraints.
- MCP tools are Zod/service-boundary controlled, with read-only scope for Maya query access.

What is not complete:

- A new SAP-only deduction will not automatically become a Maya work item. SAP is available as read-only source/evidence access, but Maya's worklist source is currently Supabase settlement/claim/receipt/evidence rows.
- A new Supabase case is picked up only if the full governed source contract is present: customer, deduction claim, reconciliation receipt, evidence documents, and evidence links. A single claim row is not enough.
- There is no evidence of a database trigger, queue, cron, or event-driven classifier that wakes up immediately when SAP/Supabase changes. Classification runs on API read/refresh paths.
- The current source adapter is still hard-bound to S1-S8 scenario IDs. A new `S9-L1` style case would fail validation today.
- Memory recall is advisory-only and currently gated by `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled`; that variable is not present in the audited `.env.local`. Even when enabled, recall does not replace selected source/tool evidence.
- Existing production proof for the 8-case/20-line journey is historical. I did not run full browser E2E or production smoke in this audit.

## Evidence Inspected

Code and docs reviewed:

- `src/services/cockpitApi.ts`
- `src/services/cockpitModel.ts`
- `src/services/forensicsQuerySession.ts`
- `src/agents/forensics.ts`
- `src/agents/liveForensicsStream.ts`
- `src/agents/agentRuntime.ts`
- `src/agents/mcpGateway.ts`
- `src/services/serviceLayer.ts`
- `src/services/evidenceFreshness.ts`
- `src/adapters/supabaseSyntheticSource.ts`
- `src/memory/session.ts`
- `src/memory/runtime.ts`
- `src/memory/schema.ts`
- `src/memory/supabaseStore.ts`
- `src/mcp/server.ts`
- `config/models.ts`
- `docs/supabase-memory-schema.sql`
- `docs/qa/maya-journey-rag-memory-test-cases-2026-06-28.md`
- `tests/e2e/maya-real-backend-e2e.ts`
- `tests/unit/forensics-query-session.test.ts`
- `tests/unit/mcp-gateway.test.ts`
- `tests/unit/memory.test.ts`
- `tests/invariants/memory-contract.test.ts`
- `tests/invariants/mcp-visibility.test.ts`
- `tests/invariants/mcp-transport.test.ts`

Targeted tests run in this audit:

```text
npm.cmd run test -- tests/unit/forensics-query-session.test.ts tests/unit/mcp-gateway.test.ts tests/unit/memory.test.ts tests/invariants/memory-contract.test.ts tests/invariants/mcp-visibility.test.ts tests/invariants/mcp-transport.test.ts
Result: 6 files passed, 61 tests passed.
```

```text
npm.cmd run test -- tests/unit/cockpit-api.test.ts -t "source-derived Maya forensics read model|force-refreshes Maya forensics|includes trusted Maya case recall|fails closed for forensic query sessions"
Result: 1 file passed, 7 tests passed, 115 skipped.
```

Runtime presence check, values not printed:

| Variable | `.env.local` presence | Process/User/Machine presence |
| --- | --- | --- |
| `SUPABASE_URL` | present | not present |
| `SUPABASE_SERVICE_ROLE_KEY` | present | not present |
| `RECOUP_MEMORY_BACKEND` | present | not present |
| `RECOUP_SUPABASE_MEMORY_TABLE` | present | not present |
| `OPENAI_API_KEY` | present | not present |
| `OPENAI_EVIDENCE_VECTOR_STORE_ID` | present | not present |
| `SAP_ODATA_BASE_URL` | present | not present |
| `RECOUP_MAYA_QUERY_MEMORY_RECALL` | missing | not present |
| `RECOUP_MCP_URL` | missing | not present |
| `RECOUP_MCP_AUTH_TOKEN` | missing | not present |

Note: local runtime loaders read `.env.local`; direct process checks are still useful because CLIs and child processes may differ.

## Current Maya Wiring Map

| Journey area | Current wiring | Honest status |
| --- | --- | --- |
| Worklist load | `GET /forensics` builds `buildForensicsCockpitModel(...)` from Supabase source context and publishes `maya:forensics:v1` read model. | Wired for governed Supabase source rows, not direct SAP ingestion. |
| Work-item detail | `GET /forensics/work-items/:lineId` builds selected detail from the same source and fails closed if missing. | Wired for current canonical source lines. |
| Classification | `runForensicsInvestigation(...)` calls `core.evaluateRule` and `decisions.deductionVerdict`; decisions carry record IDs and deterministic basis. | Strong deterministic path. Not LLM-owned classification. |
| Evidence | SAP, docs, TPM retrieval service tools are invoked by the forensics run; Supabase canonical evidence receipts are required in real-evidence mode. | Strong if source rows are complete. |
| UI recommended action | Worklist and detail rows are derived from `runForensicsInvestigation` actions and remain pending human. | Wired and HITL-safe. |
| Recoup Copilot/query | `/forensics/query` runs deterministic query answer first, then requires live Agents SDK trace, Recovery handoff, and MCP selected-evidence `query.answer` proof. | Strong guardrails, but depends on live OpenAI and MCP path. |
| Memory write | Query scope and case recall records are persisted when Supabase memory or SQLite memory is configured. | Wired, safe, optional. |
| Memory recall | Recall loads only when `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled`; recall is advisory-only. | Present but disabled in audited `.env.local`; not a tool replacement. |
| MCP | Maya gateway allows `audit.read` and `query.answer`; server exposes authenticated StreamableHTTP and service-bound tools. | Wired; external MCP env missing locally, private loopback can start with the API runtime. |
| LLM models | Runtime models are pinned in `config/models.ts`: reasoning, fast, mini/nano, realtime. | Wired for live paths, subject to credential availability. |

## Judge FAQ

1. **Is the solution fully foolproof for new data?**
   No. It is fail-closed and well-guarded, but not foolproof. It handles complete governed source rows; it does not automatically infer missing receipts, evidence links, rule inputs, or scenario mappings.

2. **If a new deduction appears only in SAP, will Maya automatically classify it?**
   No. SAP OData is present as a read-only source/evidence capability, but Maya's worklist source path is currently Supabase settlement/claim/receipt/evidence data. A SAP-only entry needs an ingestion/normalization path into the governed source contract.

3. **If I add a new case to Supabase, will Maya see it automatically?**
   Partially. If the new case is represented as complete validated rows in `recoup_customers`, `recoup_deduction_claims`, `recoup_reconciliation_receipts`, `recoup_evidence_documents`, and `recoup_evidence_links`, the API read/refresh path can rebuild the Maya read model. A single table insert is not enough.

4. **Does adding a new case trigger an agent immediately?**
   No evidence found. I found request-time/refresh-time recomputation and read-model freshness checks, not a database trigger, webhook, background queue, or cron classifier.

5. **Will the UI show a new case after data changes?**
   Yes, only after the backend sees complete source rows and the `/forensics` read-model freshness comparison detects a source fingerprint change or the user uses force refresh. It is not real-time database push from SAP/Supabase.

6. **Can Maya classify arbitrary new business scenarios beyond S1-S8?**
   No. `scenarioIdFromLineId(...)` currently accepts only `S1` through `S8`, and one schema table also constrains `scenario_id` to S1-S8. New lines within the same patterns are much closer than a new `S9` scenario.

7. **Are the existing 8 cases and 20 lines covered?**
   Yes as canonical scope. The QA matrix and E2E test define S1-S8 with 20 line IDs. I did not rerun the heavy browser E2E in this audit.

8. **Does the code or LLM decide valid vs invalid?**
   Code decides. The forensics run invokes deterministic core rule evaluation and a decision tool; the model may provide trace/status and live query lifecycle, but does not own the decision result.

9. **Does the LLM compute money or recovery amount?**
   No. Money and dollar-related decisions are owned by deterministic code and Decimal-backed logic by invariant.

10. **Can Recoup Copilot explain why a case is valid or invalid?**
    Yes, for a selected line with selected evidence record IDs, provided the live query path is configured. The response is built from deterministic basis and citations; live agent metadata is returned only after the Agents SDK and MCP proof pass.

11. **What happens if OpenAI credentials are missing?**
    The live Maya query path fails closed with blocked live-agent execution. It should not fabricate an answer.

12. **What happens if MCP proof is missing?**
    The live Maya query path fails closed. Tests verify blocking when the live trace lacks selected-evidence MCP `query.answer` proof.

13. **Is MCP really wired to Maya agents?**
    Yes. The Maya gateway builds a Streamable HTTP MCP client, filters allowed tools to `audit.read` and `query.answer`, and injects selected-evidence scope headers.

14. **Are all MCP tools exposed to the model?**
    No. The service registry marks visibility, and Maya's MCP gateway permits only the scoped read tools. Internal core and decision tools are not exposed through Maya's agent MCP client.

15. **Can a read-only MCP client create drafts or send actions?**
    No. Permission tests passed. Draft/external action tools require capability or human approval gates and are denied to read-only clients.

16. **Does the query agent call the tool instead of answering from raw model text?**
    The live prompt explicitly instructs one `query_answer` call followed by Recovery handoff. The backend still validates the trace and source proof before returning live-agent-backed metadata.

17. **If I ask about the same case on a second login, will memory answer without tools?**
    No. Current memory recall is advisory-only. It can provide recalled evidence IDs and memory record IDs to the prompt, but it must not replace selected source evidence, deterministic basis, citations, or HITL gates.

18. **Is long-term Maya memory enabled right now?**
    The code supports it, but the audited `.env.local` does not include `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled`. Without that, recall is not injected into the live query input.

19. **Does Maya memory store the user's question or answer text?**
    The dedicated Maya query memory helpers store scoped record IDs, deterministic basis, status, selected line, and session/case metadata. Tests assert no free text, money, decision fields, or unsafe identifiers.

20. **What happens if memory storage is unavailable?**
    Query execution continues and memory persistence is skipped or falls back depending on configuration. This is fail-open for memory but fail-closed for unsupported business answers.

21. **Can stale or forged memory influence a decision?**
    Memory recall is filtered by trusted category, safe identifiers, matching case/line scope, and record IDs. It is advisory-only and should not feed core rules.

22. **Does approval state persist across login?**
    Yes when Supabase/SQLite memory/audit persistence is configured. Existing tests cover approval lifecycle persistence and admin reset flows.

23. **Can the system auto-send a recovery email or write back to ERP?**
    No. External actions are human-gated, and ERP write-back is disallowed by invariant. Drafts can be staged, not autonomously dispatched.

24. **Are source readiness and provenance visible to judges?**
    Yes. Maya and governance surfaces expose source health, provenance, record IDs, and trace/readiness states. Historical QA noted SAP may show blocked while Supabase proxy sources show ready/synthetic.

25. **Does vector/RAG evidence cover all 20 lines?**
    Not proven. Existing QA says vector fixtures exist for representative lines only. Deterministic source evidence remains the primary source path.

26. **Is the current production app proven with this branch?**
    No. The worktree is dirty and current branch-local changes are not production proof. Existing production QA in the matrix is historical and should not be claimed as current release evidence.

27. **Does the worklist update in real time without refresh?**
    Not proven. I found read-model freshness and force-refresh mechanics, not a browser live subscription that automatically inserts a new worklist row as soon as the database changes.

28. **Can judges inspect how the answer was produced?**
    Yes. Query responses include citations, deterministic basis, trace rows, source read status, and live agent model-execution metadata when the live path passes.

29. **Is this agentic AI or deterministic automation with an LLM wrapper?**
    It is a governed hybrid. The decision spine is deterministic; live agentic value appears in query lifecycle, tool-calling proof, handoff trace, MCP source reads, and cited narrative. That is stronger for safety, but judges should not be told that the LLM autonomously classifies deductions.

30. **What is the biggest gap before judging?**
    Event-driven new-case onboarding. Today the system can process complete governed rows on read/refresh, but it does not prove an end-to-end "new SAP/Supabase entry arrives, agent wakes up, classifies, updates UI, persists memory" workflow.

## Direct Answers To The Sample Questions

| Sample question | Honest current answer |
| --- | --- |
| Is the solution fully foolproof enough to recognise new entry automatically either in SAP or Supabase table? | No for SAP-only. Partial for Supabase if the full governed row set is present. No event trigger was found. |
| Will adding a new case automatically trigger agents to classify valid/invalid and recommend action? | Classification runs when the backend forensics read/refresh path loads the source. I did not find an automatic trigger or background agent worker. |
| Will the new case automatically be visible in the UI? | It can become visible after source rows validate and the read model refreshes/stales out. Not proven as instant push/live sync. |
| Can I use Recoup Copilot to understand valid/invalid classification? | Yes for selected source-backed evidence if live OpenAI and MCP proof pass. Otherwise it fails closed. |
| On second login, will the agent use memory instead of tools? | No. Memory is advisory, gated, and safe. It should not replace tools/source evidence. |
| Are agents wired to memory, tools/MCP gateway, and LLM? | Yes for the Maya query path, with strong guards. Initial classification is deterministic service/tool orchestration, not LLM-owned. |

## Confidence

Confidence: high for static wiring and targeted tests; medium for runtime behavior because I did not run full browser E2E or production smoke in this audit.

Likeliest missed bug: a source/read-model cache edge case where a newly inserted but incomplete source row causes a fail-closed outage instead of a graceful per-case quarantine. That is safer than a false classification, but it may look bad in a live judge demo.
