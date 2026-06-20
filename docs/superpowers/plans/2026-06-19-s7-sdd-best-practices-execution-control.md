# S7 SDD Best-Practices Execution Control Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the S7 architecture-hardening work for Recoup while preserving the `AGENTS.md` contract: deterministic dollar computation, cited decisions, HITL external actions, no ERP write-back, no invented expert constants, and `npm.cmd run verify` green before completion.

**Architecture:** Keep Recoup as a TypeScript modular monolith with a deterministic core, service/tool guardrails, offline-safe agents, approval-gated actions, read-only integration adapters, and a cockpit that consumes read models only. Add or stabilize memory, compaction, skills, agent handoff packets, tool permissions, MCP visibility, query grounding, cockpit traceability, and premium SaaS UI polish without adding autonomous actions.

**Tech Stack:** Node 25 accepted for the hackathon, TypeScript, Vitest, Zod, Decimal.js, Express, Next.js App Router, React, CSS/Tailwind-compatible design tokens, `tokens.json`, `tokens.css`, `docs/O2C_Collections_Design_System_v3.md`, and `docs/O2C Design System v3.1.dc.html`. Use `npm.cmd` for all npm commands.

---

## Approval Gate

This file is an execution plan only. Do not implement any runtime changes until the human approves this plan.

Before execution starts, the implementing agent must confirm:

- The user approved this plan.
- No new dependency is added unless explicitly approved in writing.
- `better-sqlite3`, live Realtime voice, production MCP transport, SAP sandbox credentials, bureau schemas, remittance schemas, and any expert-owned constants remain deferred unless separately approved.
- The current worktree is dirty; execution must preserve user and previous-session changes and must not revert unrelated files.

## Contract Lock

These rules are mandatory throughout execution:

- Precedence: `INVARIANTS.md` > `RECONCILIATION_LEDGER.md` > referenced `Recoup_v2_SDD.md` section > `AGENTS.md` > model judgment.
- Context load for execution: `AGENTS.md`, `INVARIANTS.md`, named SDD sections only, `src/types/entities.ts`, and `config/`. Do not load the full BRD or SDD unless a specific validation step names it.
- Tests first for any rule, guard, score, routing, tool permission, memory contract, decision output, or cockpit boundary behavior.
- Dollar math stays in `src/core/` and uses `decimal.js`.
- Agents, skills, query, cockpit, and service presentation code never compute money.
- No model, agent, skill, query answer, or cockpit text may assert a dollar figure that reaches a decision unless it is sourced from core-computed outputs.
- Every decision-producing path must include `recordIds` and deterministic basis.
- Every external action remains draft-only and stops at HITL approval.
- SAP and MCP integration stays read-only/draft-only.
- No arbitration P&L weights, R-score weights, drift thresholds, gaming thresholds, partial-hold constants, bureau schemas, or remittance schemas may be invented.
- Run `npm.cmd run verify` before claiming completion.
- Completion requires self-verification, senior critique, and SDD validation.

## External Best-Practice Inputs To Apply

The `DenisSergeevitch/agents-best-practices` guide frames the harness as the control plane around the model: the model proposes, while the harness validates, authorizes, executes, records, summarizes, and returns observations. Apply that only where it reinforces the local `AGENTS.md` contract.

Practical mapping for Recoup:

- Harness boundary: service layer and approvals decide what can execute; agents narrate and orchestrate only.
- Tool registry: every tool has a narrow Zod schema, metadata, risk class, side-effect class, and visibility.
- Permissions: read-only tools can run; draft/action/approval tools pause behind HITL.
- Memory: store typed, scoped facts and workflow state only; never store hidden reasoning as operational truth.
- Compaction: preserve objective, active case, approvals, evidence references, record IDs, and next step.
- Skills: Markdown-only, reviewed, progressively loaded procedural assets; they do not bypass tools.
- MCP/connectors: expose only public, safe, read/draft tools; internal core/decision tools remain hidden.
- Observability: trace tool calls, permission decisions, handoffs, approval state, and audit references without exposing hidden reasoning.

## Current Known State

The current branch already contains S1-S6 work and some S7 staging from an earlier approved run. Execution must begin by reconciling the current state rather than assuming a clean tree.

Expected existing or staged areas:

- `src/memory/*`
- `src/agents/messages.ts`
- `src/agents/handoffGraph.ts`
- `src/services/permissionEngine.ts`
- `src/mcp/server.ts`
- `skills/recoup-*`
- S7 tests under `tests/invariants/` and `tests/unit/`
- Cockpit changes in `cockpit/app/page.tsx`, `cockpit/app/styles.css`, `src/services/cockpitApi.ts`, and `src/services/cockpitModel.ts`

Pre-existing dirty worktree is not a reason to revert. It is a reason to inspect, test, and continue surgically.

## Success Check

The session is complete only when:

- Targeted tests for each task pass.
- `npm.cmd run verify` passes.
- No unrelated files are modified.
- No new dependency appears without explicit approval.
- No expert-owned constant is invented.
- Cockpit contains no business logic.
- MCP does not expose internal core or decision tools.
- README and architecture review document the remaining deferred items.
- Self-verification, senior critique, and SDD validation are written in the final handoff.

---

## File Map

### Memory And Compaction

- Create/modify: `src/memory/schema.ts`
- Create/modify: `src/memory/store.ts`
- Create/modify: `src/memory/session.ts`
- Create/modify: `src/memory/compaction.ts`
- Test: `tests/invariants/memory-contract.test.ts`
- Test: `tests/unit/memory.test.ts`
- Test: `tests/unit/compaction.test.ts`

### Tool Permissions And MCP

- Create/modify: `src/services/permissionEngine.ts`
- Modify: `src/services/serviceLayer.ts`
- Modify: `src/mcp/server.ts`
- Test: `tests/invariants/tool-permissions.test.ts`
- Test: `tests/invariants/mcp-visibility.test.ts`
- Test: `tests/invariants/integration-contract.test.ts`
- Test: `tests/invariants/tool-whitelist.test.ts`

### Agent Communication And Skills

- Create/modify: `src/agents/messages.ts`
- Create/modify: `src/agents/handoffGraph.ts`
- Modify: `src/agents/agentRuntime.ts`
- Create/modify: `skills/recoup-evidence-pack/SKILL.md`
- Create/modify: `skills/recoup-recovery-drafting/SKILL.md`
- Create/modify: `skills/recoup-risk-arbitration/SKILL.md`
- Create/modify: `skills/recoup-query-answering/SKILL.md`
- Test: `tests/unit/agent-handoffs.test.ts`
- Test: `tests/unit/agent-runtime.test.ts`
- Test: `tests/invariants/skills-contract.test.ts`

### Query Grounding

- Modify: `src/agents/query.ts`
- Modify if required: `src/services/serviceLayer.ts`
- Test: `tests/unit/query.test.ts`
- Test: `tests/invariants/integration-contract.test.ts`

### Cockpit Read Models And UI

- Modify: `src/services/cockpitModel.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `cockpit/app/page.tsx`
- Modify: `cockpit/app/styles.css`
- Test: `tests/unit/cockpit.test.ts`
- Test: `tests/unit/cockpit-api.test.ts`
- Test: `tests/invariants/cockpit-no-business-logic.test.ts`

### Documentation

- Modify: `README.md`
- Modify: `docs/architecture-review-and-recommendations.md`
- Test: `tests/invariants/readme-contract.test.ts`

---

## Task 0: Execution Preflight

**Files:**
- Read only: `AGENTS.md`
- Read only: `INVARIANTS.md`
- Read only: `Recoup_v2_SDD.md`
- Read only: `src/types/entities.ts`
- Read only: `config/`
- Read only: `docs/O2C_Collections_Design_System_v3.md`
- Read only: `docs/O2C Design System v3.1.dc.html`

- [ ] **Step 1: Confirm approval**

Do not proceed unless the user has approved this plan.

- [ ] **Step 2: Inspect current worktree**

Run:

```powershell
git status --short
```

Expected: output may show existing modified and untracked files. Do not revert them.

- [ ] **Step 3: Load contract context**

Run:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw INVARIANTS.md
rg -n "memory|compaction|handoff|agents-as-tools|skills|MCP|cockpit|guardrail|approval|Realtime|StreamableHTTP" Recoup_v2_SDD.md
rg --files config src/types
```

Expected: enough context to implement named sections only.

- [ ] **Step 4: Record no-go list in working notes**

Use this exact no-go list:

```text
No ERP write-back.
No autonomous external action.
No invented expert constants.
No new dependencies without explicit approval.
No dollar math outside src/core with decimal.js.
No MCP exposure for internal core or decision tools.
No cockpit business logic.
```

---

## Task 1: Reconcile Current S7 State

**Files:**
- Read: all files listed in File Map
- Do not modify until a failing test or contract mismatch is identified.

- [ ] **Step 1: Run S7 targeted tests as reconciliation**

Run:

```powershell
npm.cmd run test -- tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts tests/unit/compaction.test.ts tests/invariants/tool-permissions.test.ts tests/invariants/mcp-visibility.test.ts tests/unit/agent-handoffs.test.ts tests/invariants/skills-contract.test.ts tests/unit/query.test.ts tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/readme-contract.test.ts
```

Expected: either PASS for already-staged work or FAIL showing the next implementation target.

- [ ] **Step 2: If tests fail, classify each failure**

Use these categories:

```text
Missing module
Missing export
Wrong schema
Wrong MCP visibility
Query not grounded
Cockpit API route missing
Cockpit UI boundary violation
README contract missing
Type or lint defect
```

- [ ] **Step 3: Continue with the first failing task below**

Do not batch unrelated fixes. Keep each fix tied to one failing test group.

---

## Task 2: Memory Categories And Store

**Files:**
- Create/modify: `tests/invariants/memory-contract.test.ts`
- Create/modify: `tests/unit/memory.test.ts`
- Create/modify: `src/memory/schema.ts`
- Create/modify: `src/memory/store.ts`
- Create/modify: `src/memory/session.ts`

- [ ] **Step 1: Ensure failing invariant test exists**

`tests/invariants/memory-contract.test.ts` must contain:

```ts
import { describe, expect, it } from "vitest";
import { MemoryRecordSchema, memoryCategories } from "../../src/memory/schema.js";

describe("memory contract", () => {
  it("defines scoped memory categories for agents and transactions", () => {
    expect(memoryCategories).toEqual([
      "session_state",
      "workflow_state",
      "case_state",
      "transaction_state",
      "evidence_refs",
      "approval_records",
      "audit_refs",
      "connector_state",
      "compaction_summaries",
      "artifact_refs",
      "agent_handoff_packets"
    ]);
  });

  it("requires trust labels, scopes, payloads, and cited record references", () => {
    expect(() =>
      MemoryRecordSchema.parse({
        id: "mem-1",
        category: "case_state",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { status: "pending_human" },
        recordIds: ["ARB-HARBOR-ORDER-640K"],
        createdAt: "2026-06-19T00:00:00.000Z"
      })
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Ensure failing unit test exists**

`tests/unit/memory.test.ts` must contain:

```ts
import { describe, expect, it } from "vitest";
import { writeSessionState, readSessionState } from "../../src/memory/session.js";
import { createInMemoryStore } from "../../src/memory/store.js";

describe("memory store", () => {
  it("writes and reads session state by scope", () => {
    const store = createInMemoryStore();
    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-HARBOR-ORDER-640K",
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });

    expect(readSessionState(store, "session-demo", "active-case")).toMatchObject({
      category: "session_state",
      payload: { key: "active-case", value: "ARB-HARBOR-ORDER-640K" },
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });
  });
});
```

- [ ] **Step 3: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 4: Implement schema**

`src/memory/schema.ts` must export:

```ts
import { z } from "zod";

export const memoryCategories = [
  "session_state",
  "workflow_state",
  "case_state",
  "transaction_state",
  "evidence_refs",
  "approval_records",
  "audit_refs",
  "connector_state",
  "compaction_summaries",
  "artifact_refs",
  "agent_handoff_packets"
] as const;

export const TrustLevelSchema = z.enum(["trusted", "semi_trusted", "untrusted"]);
export const MemoryCategorySchema = z.enum(memoryCategories);

export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  category: MemoryCategorySchema,
  trustLevel: TrustLevelSchema,
  scope: z.string().min(1),
  payload: z.record(z.unknown()),
  recordIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime()
});

export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type TrustLevel = z.infer<typeof TrustLevelSchema>;
```

- [ ] **Step 5: Implement in-memory store**

`src/memory/store.ts` must export:

```ts
import { MemoryRecordSchema, type MemoryRecord } from "./schema.js";

export interface MemoryStore {
  append(record: MemoryRecord): MemoryRecord;
  list(scope: string): MemoryRecord[];
  find(scope: string, predicate: (record: MemoryRecord) => boolean): MemoryRecord | undefined;
}

export function createInMemoryStore(): MemoryStore {
  const records: MemoryRecord[] = [];

  return {
    append(record) {
      const parsed = MemoryRecordSchema.parse(record);
      records.push(parsed);
      return parsed;
    },
    list(scope) {
      return records.filter((record) => record.scope === scope);
    },
    find(scope, predicate) {
      return records.find((record) => record.scope === scope && predicate(record));
    }
  };
}
```

- [ ] **Step 6: Implement session helpers**

`src/memory/session.ts` must export:

```ts
import type { MemoryRecord } from "./schema.js";
import type { MemoryStore } from "./store.js";

export interface WriteSessionStateInput {
  sessionId: string;
  key: string;
  value: string;
  recordIds: string[];
}

export function writeSessionState(store: MemoryStore, input: WriteSessionStateInput): MemoryRecord {
  return store.append({
    id: `session:${input.sessionId}:${input.key}`,
    category: "session_state",
    trustLevel: "trusted",
    scope: `session:${input.sessionId}`,
    payload: {
      key: input.key,
      value: input.value
    },
    recordIds: input.recordIds,
    createdAt: new Date(0).toISOString()
  });
}

export function readSessionState(store: MemoryStore, sessionId: string, key: string): MemoryRecord | undefined {
  return store.find(`session:${sessionId}`, (record) => record.payload["key"] === key);
}
```

- [ ] **Step 7: Verify green**

Run:

```powershell
npm.cmd run test -- tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts
```

Expected: PASS.

---

## Task 3: Compaction Summary

**Files:**
- Create/modify: `tests/unit/compaction.test.ts`
- Create/modify: `src/memory/compaction.ts`

- [ ] **Step 1: Ensure failing compaction test exists**

`tests/unit/compaction.test.ts` must contain:

```ts
import { describe, expect, it } from "vitest";
import { compactMemoryRecords } from "../../src/memory/compaction.js";
import type { MemoryRecord } from "../../src/memory/schema.js";

describe("memory compaction", () => {
  it("preserves objective, categories, next step, and cited records", () => {
    const records: MemoryRecord[] = [
      {
        id: "approval-1",
        category: "approval_records",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { actionId: "propose-hold:ORDER-HARBOR-640K", status: "pending_human" },
        recordIds: ["ORDER-HARBOR-640K"],
        createdAt: "2026-06-19T00:00:00.000Z"
      }
    ];

    expect(
      compactMemoryRecords({
        objective: "Finish S7 architecture hardening",
        scope: "case:ARB-HARBOR-ORDER-640K",
        records,
        nextStep: "render trace viewer"
      })
    ).toEqual({
      category: "compaction_summaries",
      trustLevel: "trusted",
      scope: "case:ARB-HARBOR-ORDER-640K",
      payload: {
        objective: "Finish S7 architecture hardening",
        preservedCategories: ["approval_records"],
        nextStep: "render trace viewer"
      },
      recordIds: ["ORDER-HARBOR-640K"]
    });
  });
});
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/unit/compaction.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Implement compaction**

`src/memory/compaction.ts` must export:

```ts
import type { MemoryCategory, MemoryRecord, TrustLevel } from "./schema.js";

export interface CompactMemoryInput {
  objective: string;
  scope: string;
  records: MemoryRecord[];
  nextStep: string;
}

export interface CompactionSummary {
  category: "compaction_summaries";
  trustLevel: TrustLevel;
  scope: string;
  payload: {
    objective: string;
    preservedCategories: MemoryCategory[];
    nextStep: string;
  };
  recordIds: string[];
}

export function compactMemoryRecords(input: CompactMemoryInput): CompactionSummary {
  return {
    category: "compaction_summaries",
    trustLevel: "trusted",
    scope: input.scope,
    payload: {
      objective: input.objective,
      preservedCategories: Array.from(new Set(input.records.map((record) => record.category))),
      nextStep: input.nextStep
    },
    recordIds: Array.from(new Set(input.records.flatMap((record) => record.recordIds))).sort()
  };
}
```

- [ ] **Step 4: Verify green**

Run:

```powershell
npm.cmd run test -- tests/unit/compaction.test.ts tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts
```

Expected: PASS.

---

## Task 4: Durable Memory Decision

**Files:**
- Modify only with explicit approval: `package.json`, `package-lock.json`, `src/memory/sqliteStore.ts`, `tests/unit/sqlite-memory.test.ts`
- Otherwise modify docs only: `docs/architecture-review-and-recommendations.md`

- [ ] **Step 1: Ask separate approval**

Ask:

```text
Approve adding better-sqlite3 for local durable memory? If not approved, S7 will keep in-memory memory and document SQLite as deferred.
```

- [ ] **Step 2A: If approved, write SQLite failing test first**

Create `tests/unit/sqlite-memory.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteMemoryStore } from "../../src/memory/sqliteStore.js";

describe("sqlite memory store", () => {
  it("persists scoped memory records across store instances", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-memory-"));
    const dbPath = join(dir, "memory.sqlite");

    try {
      const first = createSqliteMemoryStore(dbPath);
      first.append({
        id: "mem-sqlite-1",
        category: "session_state",
        trustLevel: "trusted",
        scope: "session:test",
        payload: { key: "active", value: "yes" },
        recordIds: ["REC-1"],
        createdAt: "2026-06-19T00:00:00.000Z"
      });

      const second = createSqliteMemoryStore(dbPath);
      expect(second.list("session:test")).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/sqlite-memory.test.ts
```

Expected before implementation: FAIL.

- [ ] **Step 2B: If not approved, do not add SQLite**

Add this exact deferred note to `docs/architecture-review-and-recommendations.md`:

```md
- SQLite durable memory remains approval-blocked. The current S7 implementation uses the typed in-memory memory store and preserves the same interface for later SQLite wiring.
```

---

## Task 5: Tool Metadata And Permission Engine

**Files:**
- Create/modify: `tests/invariants/tool-permissions.test.ts`
- Create/modify: `src/services/permissionEngine.ts`
- Modify: `src/services/serviceLayer.ts`

- [ ] **Step 1: Ensure failing tool-permission invariant exists**

`tests/invariants/tool-permissions.test.ts` must assert:

```ts
import { describe, expect, it } from "vitest";
import { evaluateToolPermission } from "../../src/services/permissionEngine.js";
import { serviceToolMetadata } from "../../src/services/serviceLayer.js";

describe("tool permissions", () => {
  it("classifies every service tool by risk, side effect, and visibility", () => {
    expect(Object.keys(serviceToolMetadata).sort()).toEqual([
      "actions.draftOutreach",
      "actions.draftRebill",
      "actions.proposeHold",
      "actions.proposeTerms",
      "actions.routeBilling",
      "approvals.decide",
      "audit.read",
      "core.evaluateRule",
      "core.riskMeshClosedLoop",
      "decisions.deductionVerdict",
      "query.answer",
      "retrieval.docs",
      "retrieval.sap",
      "retrieval.tpm"
    ]);
  });

  it("requires approval for financial draft tools and allows read-only retrieval", () => {
    expect(evaluateToolPermission(serviceToolMetadata["actions.draftRebill"])).toMatchObject({
      decision: "approval_required",
      riskClass: "financial"
    });
    expect(evaluateToolPermission(serviceToolMetadata["retrieval.sap"])).toMatchObject({
      decision: "allow",
      riskClass: "read_only"
    });
  });
});
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/invariants/tool-permissions.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Implement permission engine**

`src/services/permissionEngine.ts` must export:

```ts
export interface ToolPermissionMetadata {
  riskClass: string;
  sideEffectClass: string;
  visibility: "internal" | "mcp";
}

export interface PermissionDecision {
  decision: "allow" | "approval_required";
  riskClass: string;
}

export function evaluateToolPermission(metadata: ToolPermissionMetadata): PermissionDecision {
  if (
    metadata.sideEffectClass === "draft_only" ||
    metadata.riskClass === "approval_gate" ||
    metadata.riskClass === "financial"
  ) {
    return {
      decision: "approval_required",
      riskClass: metadata.riskClass
    };
  }

  return {
    decision: "allow",
    riskClass: metadata.riskClass
  };
}
```

- [ ] **Step 4: Add service metadata**

`src/services/serviceLayer.ts` must export `serviceToolMetadata` with one metadata entry for every service tool. Internal core/decision tools must use `visibility: "internal"`; public read/draft/approval tools may use `visibility: "mcp"`.

- [ ] **Step 5: Verify green**

Run:

```powershell
npm.cmd run test -- tests/invariants/tool-permissions.test.ts tests/invariants/tool-whitelist.test.ts
```

Expected: PASS.

---

## Task 6: MCP Visibility Split

**Files:**
- Create/modify: `tests/invariants/mcp-visibility.test.ts`
- Modify: `tests/invariants/integration-contract.test.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Ensure failing MCP visibility test exists**

`tests/invariants/mcp-visibility.test.ts` must contain:

```ts
import { describe, expect, it } from "vitest";
import { createMcpToolFacade } from "../../src/mcp/server.js";

describe("MCP tool visibility", () => {
  it("does not expose internal core or decision tools through MCP", () => {
    const names = createMcpToolFacade().listTools().map((tool) => tool.name);

    expect(names).not.toContain("core.evaluateRule");
    expect(names).not.toContain("core.riskMeshClosedLoop");
    expect(names).not.toContain("decisions.deductionVerdict");
    expect(names).toContain("retrieval.sap");
    expect(names).toContain("audit.read");
    expect(names).toContain("approvals.decide");
  });
});
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/invariants/mcp-visibility.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Implement MCP filtering**

`src/mcp/server.ts` must import `serviceToolMetadata` and filter `listTools()` to `visibility === "mcp"`. `callTool(name, input)` must throw:

```ts
throw new Error("Tool is not exposed through MCP.");
```

for internal tools.

- [ ] **Step 4: Verify green**

Run:

```powershell
npm.cmd run test -- tests/invariants/mcp-visibility.test.ts tests/invariants/integration-contract.test.ts tests/invariants/tool-permissions.test.ts
```

Expected: PASS.

---

## Task 7: Agent Handoff Packets

**Files:**
- Create/modify: `tests/unit/agent-handoffs.test.ts`
- Create/modify: `src/agents/messages.ts`
- Create/modify: `src/agents/handoffGraph.ts`
- Modify if needed: `src/agents/agentRuntime.ts`

- [ ] **Step 1: Ensure failing handoff test exists**

`tests/unit/agent-handoffs.test.ts` must contain:

```ts
import { describe, expect, it } from "vitest";
import { recoupHandoffGraph } from "../../src/agents/handoffGraph.js";
import { AgentHandoffPacketSchema, createAgentHandoffPacket } from "../../src/agents/messages.js";

describe("agent handoff packets", () => {
  it("declares SDD handoff and agents-as-tools edges", () => {
    expect(recoupHandoffGraph).toEqual([
      { from: "Forensics Investigator", to: "Recovery Drafter", mode: "handoff" },
      { from: "Forensics Investigator", to: "Containment / Intent", mode: "handoff" },
      { from: "Risk-Mesh Supervisor", to: "Sentinel", mode: "agents-as-tools" },
      { from: "Risk-Mesh Supervisor", to: "Containment / Intent", mode: "agents-as-tools" },
      { from: "Conversational Query", to: "Audit Read", mode: "tool" }
    ]);
  });

  it("creates cited work packets for agent-to-agent communication", () => {
    const packet = createAgentHandoffPacket({
      packetId: "packet-1",
      fromAgent: "Risk-Mesh Supervisor",
      toAgent: "Sentinel",
      capability: "C",
      caseId: "ARB-HARBOR-ORDER-640K",
      recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K"],
      intent: "request-credit-position",
      status: "created"
    });

    expect(() => AgentHandoffPacketSchema.parse(packet)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/unit/agent-handoffs.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Implement packet schema**

`src/agents/messages.ts` must export `AgentHandoffPacketSchema`, `AgentHandoffPacket`, and `createAgentHandoffPacket`.

- [ ] **Step 4: Implement handoff graph**

`src/agents/handoffGraph.ts` must export `recoupHandoffGraph` with the exact SDD edges above.

- [ ] **Step 5: Verify green**

Run:

```powershell
npm.cmd run test -- tests/unit/agent-handoffs.test.ts tests/unit/agent-runtime.test.ts
```

Expected: PASS.

---

## Task 8: Agent Skills

**Files:**
- Create/modify: `tests/invariants/skills-contract.test.ts`
- Create/modify: `skills/recoup-evidence-pack/SKILL.md`
- Create/modify: `skills/recoup-recovery-drafting/SKILL.md`
- Create/modify: `skills/recoup-risk-arbitration/SKILL.md`
- Create/modify: `skills/recoup-query-answering/SKILL.md`

- [ ] **Step 1: Ensure failing skills contract exists**

`tests/invariants/skills-contract.test.ts` must contain:

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const skillPaths = [
  "skills/recoup-evidence-pack/SKILL.md",
  "skills/recoup-recovery-drafting/SKILL.md",
  "skills/recoup-risk-arbitration/SKILL.md",
  "skills/recoup-query-answering/SKILL.md"
];

describe("agent skills contract", () => {
  it("ships reviewed Markdown-only Recoup skills", () => {
    for (const path of skillPaths) {
      expect(existsSync(path)).toBe(true);
      const body = readFileSync(path, "utf8");
      expect(body).toContain("---");
      expect(body).toContain("description:");
      expect(body).toContain("## When To Use");
      expect(body).toContain("## Validation");
      expect(body).not.toContain("compute dollar");
      expect(body).not.toContain("write back to ERP");
    }
  });
});
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/invariants/skills-contract.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Ensure each skill has these sections**

Each `SKILL.md` must include:

```md
---
name: recoup-example
description: Use this skill for a narrow Recoup procedure.
---

# Recoup Example

## When To Use

Use for one narrow task only.

## Procedure

1. Load cited record IDs.
2. Use deterministic service/core outputs.
3. Produce a draft or explanation only.

## Validation

- Require record IDs.
- Require deterministic basis.
- Do not calculate dollar amounts.
- Do not write to ERP.
```

- [ ] **Step 4: Verify green**

Run:

```powershell
npm.cmd run test -- tests/invariants/skills-contract.test.ts
```

Expected: PASS.

---

## Task 9: Offline Query Grounding

**Files:**
- Create/modify: `tests/unit/query.test.ts`
- Modify: `src/agents/query.ts`
- Modify if needed: `src/services/serviceLayer.ts`

- [ ] **Step 1: Ensure failing query test exists**

`tests/unit/query.test.ts` must contain:

```ts
import { describe, expect, it } from "vitest";
import { answerOfflineQuery } from "../../src/agents/query.js";

describe("offline query", () => {
  it("answers from cited deterministic state and open dependencies", () => {
    const answer = answerOfflineQuery({
      question: "Why is Harbor blocked?"
    });

    expect(answer.status).toBe("disabled_offline_safe");
    expect(answer.answer).toContain("r-score-weights-unset");
    expect(answer.recordIds).toContain("CUST-HARBOR");
    expect(answer.deterministicBasis).toContain("audit.read");
  });
});
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/unit/query.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Implement bounded answer logic**

`src/agents/query.ts` must:

- Keep `status: "disabled_offline_safe"`.
- Keep `modelExecution: "blocked: offline build does not invoke live model calls"`.
- For Harbor/risk/blocked questions, cite:
  - `CUST-HARBOR`
  - `ORDER-HARBOR-640K`
  - `LEDGER-6-PARTIAL-HOLD`
- Include deterministic basis containing `audit.read`.
- Mention open dependency `r-score-weights-unset` instead of inventing weights.
- Avoid new dollar math.

- [ ] **Step 4: Update integration expectation if needed**

If `tests/invariants/integration-contract.test.ts` still expects Harbor query output to use only `SYNTHETIC-SEED-42`, change it to expect cited Harbor records and the same offline-safe model block.

- [ ] **Step 5: Verify green**

Run:

```powershell
npm.cmd run test -- tests/unit/query.test.ts tests/invariants/integration-contract.test.ts
```

Expected: PASS.

---

## Task 10: Cockpit Trace, Memory, And Agent Graph Read Models

**Files:**
- Modify: `src/services/cockpitModel.ts`
- Modify: `src/services/cockpitApi.ts`
- Create/modify: `tests/unit/cockpit.test.ts`
- Create/modify: `tests/unit/cockpit-api.test.ts`

- [ ] **Step 1: Ensure failing cockpit model test exists**

Add to `tests/unit/cockpit.test.ts`:

```ts
import { buildAgentGraphModel, buildMemorySummaryModel, buildTraceModel } from "../../src/services/cockpitModel.js";

it("builds trace, memory, and agent graph read models", () => {
  expect(buildTraceModel().events.length).toBeGreaterThan(0);
  expect(buildMemorySummaryModel().categories).toContain("approval_records");
  expect(buildAgentGraphModel().edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
});
```

- [ ] **Step 2: Ensure failing cockpit API test exists**

Add to `tests/unit/cockpit-api.test.ts`:

```ts
it("serves trace, memory, and agent graph read endpoints", async () => {
  const { baseUrl, server } = await listen();

  try {
    const [trace, memory, agents] = await Promise.all([
      fetch(`${baseUrl}/trace`),
      fetch(`${baseUrl}/memory`),
      fetch(`${baseUrl}/agents`)
    ]);

    expect(trace.status).toBe(200);
    expect(memory.status).toBe(200);
    expect(agents.status).toBe(200);
  } finally {
    await close(server);
  }
});
```

- [ ] **Step 3: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 4: Implement read-model functions**

`src/services/cockpitModel.ts` must export:

```ts
export function buildTraceModel() {
  return {
    events: [
      {
        id: "trace-riskmesh-harbor",
        label: "Risk Mesh arbitration staged",
        recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K"],
        deterministicBasis: "audit.read + core.riskMeshClosedLoop"
      }
    ]
  };
}

export function buildMemorySummaryModel() {
  return {
    categories: [
      "session_state",
      "workflow_state",
      "case_state",
      "transaction_state",
      "evidence_refs",
      "approval_records",
      "audit_refs",
      "connector_state",
      "compaction_summaries",
      "artifact_refs",
      "agent_handoff_packets"
    ]
  };
}

export function buildAgentGraphModel() {
  return {
    edges: recoupHandoffGraph
  };
}
```

Adapt names to existing model style instead of duplicating constants if the repo already exports them.

- [ ] **Step 5: Add API endpoints**

`src/services/cockpitApi.ts` must expose:

```ts
app.get("/trace", (_req, res) => res.json(buildTraceModel()));
app.get("/memory", (_req, res) => res.json(buildMemorySummaryModel()));
app.get("/agents", (_req, res) => res.json(buildAgentGraphModel()));
```

- [ ] **Step 6: Verify green**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts
```

Expected: PASS.

---

## Task 11: Premium SaaS UI/UX Pass

**Files:**
- Modify: `cockpit/app/page.tsx`
- Modify: `cockpit/app/styles.css`
- Test: `tests/invariants/cockpit-no-business-logic.test.ts`
- Source design: `docs/O2C_Collections_Design_System_v3.md`
- Source design: `docs/O2C Design System v3.1.dc.html`
- Source tokens: `tokens.json`
- Source tokens: `tokens.css`

- [ ] **Step 1: Ensure failing UI boundary test exists**

`tests/invariants/cockpit-no-business-logic.test.ts` must assert:

```ts
expect(page).toContain("/trace");
expect(page).toContain("/memory");
expect(page).toContain("/agents");
expect(page).not.toContain("runRiskMeshClosedLoop");
expect(page).not.toContain("computePartialHold");
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts
```

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Implement page data fetches**

`cockpit/app/page.tsx` must fetch service read models only:

```ts
const [cockpit, stream, trace, memory, agents] = await Promise.all([
  getJson<CockpitModel>("/cockpit"),
  getJson<RunStreamModel>("/run-stream"),
  getJson<TraceModel>("/trace"),
  getJson<MemorySummaryModel>("/memory"),
  getJson<AgentGraphModel>("/agents")
]);
```

Use existing local type names if they differ.

- [ ] **Step 4: Render operational SaaS surfaces**

Render these sections without adding explanatory marketing copy:

- Maya Forensics queue.
- David Credit/Arbitration board.
- CFO Summary.
- Agent operations graph.
- Tool permission/readiness strip.
- Memory categories and compaction state.
- Audit/trace timeline.
- Approval inbox.

- [ ] **Step 5: Apply O2C design system**

`cockpit/app/styles.css` must:

- Use `tokens.css` variables where available.
- Keep sections dense, scannable, and operations-focused.
- Avoid nested cards.
- Avoid decorative blobs, orbs, one-note purple/blue gradients, and marketing hero layouts.
- Use 8px or lower card radius unless token says otherwise.
- Keep text inside containers at mobile and desktop widths.
- Preserve responsive layout for trace, graph, tables, and approval controls.

- [ ] **Step 6: Browser check**

Run:

```powershell
npm.cmd run dev:api
npm.cmd run dev:cockpit
```

Open:

```text
http://127.0.0.1:3000
```

Manual acceptance:

- First viewport shows the actual Recoup cockpit, not a landing page.
- Surfaces match premium B2B SaaS: restrained, dense, tokenized, readable.
- No visible text overlaps on desktop.
- API-backed trace, memory, and agent graph content render.
- Approval controls remain HITL and do not imply autonomous dispatch.

- [ ] **Step 7: Verify UI boundaries**

Run:

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts
npm.cmd run lint
npm.cmd run typecheck
```

Expected: PASS.

---

## Task 12: README And Architecture Review

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture-review-and-recommendations.md`
- Test: `tests/invariants/readme-contract.test.ts`

- [ ] **Step 1: Ensure README contract test exists**

`tests/invariants/readme-contract.test.ts` must assert that `README.md` includes:

```ts
expect(readme).toContain("How OpenAI Is Used");
expect(readme).toContain("Memory And Compaction");
expect(readme).toContain("Agent Skills");
expect(readme).toContain("Agent-To-Agent Communication");
expect(readme).toContain("Tool Permissions");
expect(readme).toContain("What Is Still Deferred");
```

- [ ] **Step 2: Run red or verify already green**

Run:

```powershell
npm.cmd run test -- tests/invariants/readme-contract.test.ts
```

Expected before docs update: FAIL. Expected after docs update: PASS.

- [ ] **Step 3: Update README**

Add concise sections:

```md
## Memory And Compaction

Recoup stores typed, scoped memory records for session, workflow, case, transaction, evidence, approval, audit, connector, artifact, and handoff state. The current hackathon build uses a typed in-memory store unless SQLite is separately approved.

## Agent Skills

Recoup skills are reviewed Markdown procedures for evidence packs, recovery drafting, risk arbitration, and query answering. They guide the harness but do not calculate money or bypass service tools.

## Agent-To-Agent Communication

Forensics hands off invalid/partial deductions to Recovery Drafter and behavioral candidates to Containment. Risk Mesh gathers Sentinel and Containment positions as agents-as-tools. Query uses audit read as a tool.

## Tool Permissions

Every service tool is classified by risk, side effect, and MCP visibility. Read-only tools may run; draft/action/approval tools require HITL.

## What Is Still Deferred

SQLite durable memory, production MCP transport, SAP sandbox auth, bureau/remittance schemas, live Realtime voice, and expert-owned constants remain deferred until explicitly approved.
```

- [ ] **Step 4: Update architecture review**

Mark resolved:

- typed memory categories
- compaction summary
- tool metadata
- MCP public/internal visibility split
- handoff packets
- local skills
- query grounding
- cockpit trace/memory/agent graph read models
- UI polish pass

Keep open:

- SQLite if not approved
- production MCP `StreamableHTTPServerTransport`
- real SAP S/4HANA auth and query mapping
- real docs/TPM/bureau/remittance adapters
- live Realtime voice
- expert constants

- [ ] **Step 5: Verify green**

Run:

```powershell
npm.cmd run test -- tests/invariants/readme-contract.test.ts
```

Expected: PASS.

---

## Task 13: Subagent Review

**Files:**
- No direct file edits by reviewer unless a separate implementation task is approved.

- [ ] **Step 1: Dispatch read-only architecture reviewer**

Reviewer prompt:

```text
Review the S7 implementation against AGENTS.md, INVARIANTS.md, and Recoup_v2_SDD.md sections 3.2, 3.3, 6, 7, 9, and 11. Do not edit files. Report P0/P1 risks only around memory trust boundaries, tool permissions, MCP visibility, handoff packets, skills, query grounding, cockpit business logic, invented constants, and ERP write-back.
```

- [ ] **Step 2: Dispatch read-only UI reviewer**

Reviewer prompt:

```text
Review cockpit/app/page.tsx and cockpit/app/styles.css against docs/O2C_Collections_Design_System_v3.md and docs/O2C Design System v3.1.dc.html. Do not edit files. Report P0/P1 UX issues only: non-premium SaaS feel, text overlap, business logic in UI, inaccessible layout, off-token styling, or marketing-style hero instead of operational cockpit.
```

- [ ] **Step 3: Integrate only confirmed P0/P1 findings**

If a reviewer reports an issue, reproduce it with a test or screenshot before editing. Do not accept broad style opinions without local evidence.

---

## Task 14: Full Verification

**Files:**
- No new files unless fixing verification failures.

- [ ] **Step 1: Run targeted test sweep**

Run:

```powershell
npm.cmd run test -- tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts tests/unit/compaction.test.ts tests/invariants/tool-permissions.test.ts tests/invariants/mcp-visibility.test.ts tests/unit/agent-handoffs.test.ts tests/invariants/skills-contract.test.ts tests/unit/query.test.ts tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/readme-contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verify**

Run:

```powershell
npm.cmd run verify
```

Expected:

```text
lint pass
typecheck pass
vitest pass
dependency-cruiser pass
eval gates pass
```

- [ ] **Step 3: If verify fails, use systematic debugging**

For any failure:

- Read the exact failing output.
- Identify the owning task.
- Write or adjust the smallest failing test if one is missing.
- Fix only the relevant file.
- Re-run the failing command.
- Re-run `npm.cmd run verify`.

---

## Task 15: Self-Verification, Senior Critique, And SDD Validation

**Files:**
- No file edits unless a validation mismatch requires a fix.

- [ ] **Step 1: Self-verification**

Write final notes with:

```text
Change summary:
Commands run:
Test result:
Likeliest bug:
Confidence:
Invariants touched:
```

- [ ] **Step 2: Senior critique**

Review the diff for:

- dollar math outside `src/core/`
- invented constants
- MCP internal tool leakage
- action tool missing HITL
- query answer missing citations
- skill bypassing service tools
- memory storing hidden reasoning as truth
- cockpit importing core business logic
- broad or free-form tools
- dependency change without approval

- [ ] **Step 3: Validate against SDD**

Use only named sections:

- `Recoup_v2_SDD.md` section 3.2 repo map
- `Recoup_v2_SDD.md` section 3.3 layer responsibilities
- `Recoup_v2_SDD.md` section 6 agent layer design
- `Recoup_v2_SDD.md` section 7 interfaces and MCP
- `Recoup_v2_SDD.md` section 9 security and guardrails
- `Recoup_v2_SDD.md` section 11 cockpit UX

Report:

```text
Matched:
Partial:
Deferred:
Unresolved mismatch:
```

There must be no silent unresolved mismatch.

---

## Deferred Items Unless Separately Approved

- SQLite durable memory dependency and store implementation.
- Production MCP `StreamableHTTPServerTransport`.
- Real SAP S/4HANA OData authentication and query mapping.
- Bureau, remittance, EDI, and real TPM/doc repository schemas.
- Live Realtime text/voice query.
- Expert-owned R-score, drift, gaming, arbitration, and partial-hold constants.
- Autonomous ERP write-back, autonomous email dispatch, autonomous hold/freeze, or autonomous terms update.

## Recommended Execution Mode

Use **Subagent-Driven Development** after approval:

- Worker 1: memory and compaction.
- Worker 2: tool permissions and MCP visibility.
- Worker 3: handoff packets and skills.
- Worker 4: query grounding and cockpit read models.
- Worker 5: premium SaaS UI/UX and README.
- Reviewer 1: architecture/spec compliance.
- Reviewer 2: UI/O2C design-system compliance.

Workers must not edit overlapping files at the same time. Integrate one worker result, run targeted tests, then move to the next worker.

## Approval Prompt For The Human

Use this exact approval request:

```text
Approve execution of docs/superpowers/plans/2026-06-19-s7-sdd-best-practices-execution-control.md.

Defaults unless you override:
- No new dependencies.
- No SQLite yet; use typed in-memory memory only and document SQLite as deferred.
- Keep query offline-safe; no live Realtime credentials.
- Keep MCP as local demo facade with internal tool filtering.
- Perform focused premium cockpit polish against O2C design system.
- Use subagent-driven development with read-only reviewer agents.
```
