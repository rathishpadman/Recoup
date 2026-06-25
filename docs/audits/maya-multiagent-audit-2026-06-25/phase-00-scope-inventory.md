# Phase 0 — Scope & Inventory

**Status:** Complete · **Mode:** static
**Date:** 2026-06-25

## 0.1 Working-tree state

Branch: `codex/guardrail-riskmesh-hardening` (not `main`).

`git status --short` reports **73 changed/untracked entries**. The working tree is **dirty** — this is a development branch, not a clean release candidate. Notable items:

- **Modified source:** `src/agents/forensics.ts`, `src/agents/query.ts`, `src/agents/liveForensicsStream.ts`, `src/services/cockpitApi.ts`, `src/services/cockpitModel.ts`, `src/services/conductor.ts`, `src/services/serviceLayer.ts`, `src/services/realtimeSession.ts`, `src/memory/supabaseStore.ts`, `src/adapters/supabaseSyntheticSource.ts`.
- **Modified frontend:** all 12+ `cockpit/components/maya/*.tsx`, `cockpit/app/forensics/shadcn/page.tsx`, `cockpit/app/cockpit-data.ts`, `cockpit/app/styles.css`, `tokens.css`, `tokens.json`.
- **Untracked (new, uncommitted):** `cockpit/app/api/connectors/`, `cockpit/app/api/forensics/`, `cockpit/app/backend-read-auth.ts`, `cockpit/components/maya/work-item-detail-request-gate.ts`, the audit design doc, and the real-backend hardening plan.

**Audit implication:** several load-bearing pieces of the "real backend" path (the Next API proxy routes and the backend-read auth helper) are **untracked**. A judge cloning a specific commit may not get them. This is the single biggest *process* risk and is tracked as a finding in the SUMMARY backlog.

> **Proposed action [C]:** Commit the working tree to a clean, named review branch and open a PR before judging. Re-run the full proof pack on that clean checkout.
> **Expert citation:** Devpost judges explicitly value a *reproducible working solution* over polish — "a clear explanation of the problem and a working solution" ([Devpost — hackathon judging tips](https://info.devpost.com/blog/hackathon-judging-tips)). Uncommitted load-bearing files break reproducibility.

## 0.2 Agent inventory (real vs. claimed)

Confirmed from `src/agents/agentRuntime.ts`:

| Agent | SDK object | Model | Prompt | Wiring |
|---|---|---|---|---|
| Forensics Investigator | `new Agent(...)` | `gpt-5.5` (reasoning) | `forensics-investigator.md` | `handoffs: [recoveryDrafterAgent]` ✅ real handoff |
| Recovery Drafter | `new Agent(...)` | `gpt-5.4` (fast) | `recovery-drafter.md` | handoff target |
| Risk-Mesh Supervisor | `new Agent(...)` | `gpt-5.5` (reasoning) | `risk-mesh-supervisor.md` | `tools: [sentinel.asTool, containment.asTool]` ✅ agents-as-tools |
| Sentinel | `new Agent(...)` | `gpt-5.4` (fast) | `sentinel.md` | exposed as tool (advisory-only) |
| Containment / Intent | `new Agent(...)` | `gpt-5.4` (fast) | `containment-intent.md` | exposed as tool |
| Conversational Query | `new Agent(...)` | `gpt-realtime-2` | `conversational-query.md` | realtime path |

All 6 agents claimed in the design doc **exist and are instantiated as real `@openai/agents` `Agent` objects**. Models are pinned in `config/models.ts` (satisfies INVARIANT I-25).

## 0.3 Tool & service inventory (to be deep-audited in Phase 2)

- Service tools live in `src/services/serviceLayer.ts` (`invokeServiceTool`, `serviceToolMetadata`).
- Retrieval adapters: `src/adapters/{sapOData,docRepo,tpm,bureau,remittance,ediRemittance,supabaseSyntheticSource,connectorRegistry}.ts`.
- MCP facade: `src/mcp/server.ts` (Streamable HTTP).
- Deterministic core: `src/core/rules/*`, `src/services/decisionStore.ts`, `decisions.deductionVerdict` tool.

## 0.4 Key architectural observation (carried into Phase 1)

**Discrepancy:** `src/agents/handoffGraph.ts` documents 5 edges including `Forensics Investigator → Containment / Intent` (mode `handoff`), but `agentRuntime.ts` only wires `handoffs: [recoveryDrafterAgent]` on the Forensics agent. The `handoffGraph` is a **descriptive constant**, not the executable wiring. This is not necessarily a bug (containment is handled deterministically in `forensics.ts` via `assessCrestlineM6Containment`), but the doc-vs-code mismatch should be reconciled so reviewers don't assume a live handoff exists where it does not. Detailed in Phase 1.

## 0.5 What this audit can and cannot confirm statically

| Claim type | Confirmable statically? |
|---|---|
| Agents/handoffs/tools wired in code | ✅ Yes |
| Guardrail/provenance/fail-closed logic present | ✅ Yes (read the functions) |
| Test/E2E *pass* status | ⚠️ Needs live run — claims taken from docs, flagged |
| Look & feel "premium" | ⚠️ Visual review of screenshots; live browser pass optional |
| Live model token counts / trace export | ⚠️ Needs live run with `OPENAI_API_KEY` |
