# S7 Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Recoup into a more complete SDD-aligned hackathon agent harness by adding lightweight durable memory, skills, agent-to-agent work packets, permission metadata, traceability, and premium SaaS cockpit polish without violating `AGENTS.md`.

**Architecture:** Keep the deterministic core as the only dollar-computing layer. Add a lightweight memory/persistence boundary below services, a stricter service/tool permission layer above core, and explicit agent handoff packets between agent modules. Skills remain Markdown-only procedural assets; they guide drafting and evidence assembly but never compute decisions or bypass tools.

**Tech Stack:** Node 25 accepted for hackathon, TypeScript, Vitest, Zod, Decimal.js, Express, Next.js, React, O2C Design System tokens. SQLite is preferred for memory only if the user explicitly approves the dependency; otherwise use a file-backed JSONL store as the first implementation.

---

## Non-Negotiable Contract Rules

- Always obey precedence: `INVARIANTS.md` > `RECONCILIATION_LEDGER.md` > referenced SDD sections > `AGENTS.md` > model judgment.
- Do not invent arbitration weights, R-score weights, R-drift thresholds, gaming thresholds, bureau schemas, remittance schemas, SAP credentials, or production MCP transport details.
- Use `npm.cmd`, not bare `npm`, for manual commands.
- Tests first for every runtime behavior change.
- Keep all dollar math in `src/core/` and Decimal.js.
- Keep external actions draft-only and human-approved.
- No ERP write-back path.
- Run `npm.cmd run verify` before claiming completion.
- After implementation, perform self-verification, senior critique, and SDD validation.

---

## Current Baseline

Verified baseline before S7:

- `npm.cmd run verify` passed.
- 36 test files / 133 tests passed.
- Current implementation includes:
  - S1-S8 rules and graph.
  - Forensics and Recovery.
  - Risk Mesh/Sentinel/Containment offline deterministic harness.
  - Read-only `sapOData` adapter.
  - MCP demo facade.
  - `audit.read`, audited `approvals.decide`, and offline-safe `query.answer`.
  - `conductor.ts` blocked run-control skeleton.
  - David/CFO cockpit bands.
  - README and architecture review doc.

Open SDD gaps this plan addresses where feasible:

- `src/memory/session.ts` and `src/memory/compaction.ts` missing.
- Runtime skills missing.
- Agent-to-agent work packets missing.
- Tool risk metadata incomplete.
- MCP exposes too much unless split by public/internal visibility.
- UI is functional but not fully premium SaaS / O2C v3.1 showcase quality.
- Query is offline-safe but not yet memory/audit-grounded text query.

Open items this plan must not solve without approval:

- Expert-owned constants.
- Real SAP sandbox/OData auth.
- Production `StreamableHTTPServerTransport` if a new dependency is required.
- Bureau/remittance real schemas.
- Live Realtime voice with credentials.

---

## File Map

### Memory

- Create `src/memory/schema.ts`: Zod schemas for memory records and categories.
- Create `src/memory/store.ts`: memory store interface plus JSONL fallback implementation.
- Create `src/memory/session.ts`: session/workflow/case state read/write helpers.
- Create `src/memory/compaction.ts`: compaction summary creation and rehydration helpers.
- Create `tests/invariants/memory-contract.test.ts`.
- Create `tests/unit/memory.test.ts`.

### Tool Permissions

- Modify `src/services/serviceLayer.ts`: add tool metadata and visibility helpers.
- Create `src/services/permissionEngine.ts`: permission decision object and policy evaluation.
- Create `tests/invariants/tool-permissions.test.ts`.

### Agent Communication

- Create `src/agents/messages.ts`: handoff packet schemas.
- Create `src/agents/handoffGraph.ts`: planned handoff graph and validation.
- Modify `src/agents/agentRuntime.ts`: export graph-backed roster metadata.
- Modify `src/agents/forensics.ts`: emit Forensics to Recovery packet in trace/memory.
- Modify `src/agents/riskMesh.ts`: emit Risk Mesh to Sentinel/Containment packet in trace/memory.
- Create `tests/unit/agent-handoffs.test.ts`.

### Skills

- Create `skills/recoup-evidence-pack/SKILL.md`.
- Create `skills/recoup-recovery-drafting/SKILL.md`.
- Create `skills/recoup-risk-arbitration/SKILL.md`.
- Create `skills/recoup-query-answering/SKILL.md`.
- Create `tests/invariants/skills-contract.test.ts`.

### Query

- Modify `src/agents/query.ts`: answer offline text queries from memory/audit/evidence references.
- Modify `src/services/serviceLayer.ts`: keep `query.answer` bounded and cited.
- Create `tests/unit/query.test.ts`.

### Cockpit Premium SaaS Pass

- Modify `src/services/cockpitModel.ts`: expose trace/memory/agent graph read models.
- Modify `src/services/cockpitApi.ts`: add `/trace`, `/memory`, `/agents` read endpoints.
- Modify `cockpit/app/page.tsx`: render agent graph, memory/session, and trace panels.
- Modify `cockpit/app/styles.css`: O2C premium polish, tighter density, visual hierarchy.
- Consider replacing inline SVG icons with Phosphor only if existing dependency remains stable.
- Create or modify `tests/unit/cockpit.test.ts`.
- Create or modify `tests/unit/cockpit-api.test.ts`.
- Extend `tests/invariants/cockpit-no-business-logic.test.ts`.

### Docs

- Modify `README.md`: add S7 memory/skills/handoff/permission architecture section.
- Modify `docs/architecture-review-and-recommendations.md`: mark resolved items and remaining gaps.

---

## Task 1: Memory Contract Tests

**Files:**
- Create `tests/invariants/memory-contract.test.ts`
- Create `tests/unit/memory.test.ts`

- [ ] **Step 1: Write failing invariant test**

Add `tests/invariants/memory-contract.test.ts`:

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

  it("requires trust labels and record references for memory records", () => {
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

- [ ] **Step 2: Write failing unit test**

Add `tests/unit/memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "../../src/memory/store.js";
import { writeSessionState, readSessionState } from "../../src/memory/session.js";

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

- [ ] **Step 3: Run tests to verify red**

Run:

```powershell
npm.cmd run test -- tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts
```

Expected: FAIL because `src/memory/*` modules do not exist.

---

## Task 2: Memory Implementation

**Files:**
- Create `src/memory/schema.ts`
- Create `src/memory/store.ts`
- Create `src/memory/session.ts`

- [ ] **Step 1: Implement schemas**

Create `src/memory/schema.ts`:

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
export type TrustLevel = z.infer<typeof TrustLevelSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
```

- [ ] **Step 2: Implement store**

Create `src/memory/store.ts`:

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

- [ ] **Step 3: Implement session helpers**

Create `src/memory/session.ts`:

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

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
npm.cmd run test -- tests/invariants/memory-contract.test.ts tests/unit/memory.test.ts
```

Expected: PASS.

---

## Task 3: Compaction Contract

**Files:**
- Create `tests/unit/compaction.test.ts`
- Create `src/memory/compaction.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/compaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compactMemoryRecords } from "../../src/memory/compaction.js";
import type { MemoryRecord } from "../../src/memory/schema.js";

describe("memory compaction", () => {
  it("preserves objective, approvals, record IDs, artifacts, and next step", () => {
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

- [ ] **Step 2: Verify red**

Run:

```powershell
npm.cmd run test -- tests/unit/compaction.test.ts
```

Expected: FAIL because `compaction.ts` does not exist.

- [ ] **Step 3: Implement compaction**

Create `src/memory/compaction.ts`:

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
  const preservedCategories = Array.from(new Set(input.records.map((record) => record.category)));
  const recordIds = Array.from(new Set(input.records.flatMap((record) => record.recordIds))).sort();

  return {
    category: "compaction_summaries",
    trustLevel: "trusted",
    scope: input.scope,
    payload: {
      objective: input.objective,
      preservedCategories,
      nextStep: input.nextStep
    },
    recordIds
  };
}
```

- [ ] **Step 4: Verify green**

Run:

```powershell
npm.cmd run test -- tests/unit/compaction.test.ts
```

Expected: PASS.

---

## Task 4: SQLite Decision Gate

**Files:**
- Modify `docs/architecture-review-and-recommendations.md`
- Optional later: `package.json`, `package-lock.json`, `src/memory/sqliteStore.ts`

- [ ] **Step 1: Stop for dependency approval**

Ask the human:

```text
Approve adding better-sqlite3 for lightweight local memory? If not approved, continue with JSONL fallback only.
```

- [ ] **Step 2A: If approved, write tests first for SQLite**

Create `tests/unit/sqlite-memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSqliteMemoryStore } from "../../src/memory/sqliteStore.js";

describe("sqlite memory store", () => {
  it("persists memory records across store instances", () => {
    const dbPath = ":memory:";
    const store = createSqliteMemoryStore(dbPath);

    const record = store.append({
      id: "mem-sqlite-1",
      category: "session_state",
      trustLevel: "trusted",
      scope: "session:test",
      payload: { key: "active", value: "yes" },
      recordIds: ["REC-1"],
      createdAt: "2026-06-19T00:00:00.000Z"
    });

    expect(record.id).toBe("mem-sqlite-1");
    expect(store.list("session:test")).toHaveLength(1);
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/sqlite-memory.test.ts
```

Expected before implementation: FAIL.

- [ ] **Step 2B: If not approved, do not add SQLite**

Document the fallback:

```markdown
SQLite dependency not approved; S7 uses in-memory store only and keeps durable memory as an implementation gap.
```

---

## Task 5: Tool Metadata And Permission Engine

**Files:**
- Create `tests/invariants/tool-permissions.test.ts`
- Create `src/services/permissionEngine.ts`
- Modify `src/services/serviceLayer.ts`

- [ ] **Step 1: Write failing test**

Create `tests/invariants/tool-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateToolPermission } from "../../src/services/permissionEngine.js";
import { serviceToolMetadata } from "../../src/services/serviceLayer.js";

describe("tool permissions", () => {
  it("classifies every service tool by risk and side effect", () => {
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

  it("requires approval for approval-gated and draft action tools", () => {
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

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/invariants/tool-permissions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement metadata**

Add to `src/services/serviceLayer.ts`:

```ts
export const serviceToolMetadata = {
  "retrieval.sap": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.docs": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "retrieval.tpm": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "audit.read": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "query.answer": { riskClass: "read_only", sideEffectClass: "none", visibility: "mcp" },
  "actions.draftRebill": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.draftOutreach": { riskClass: "communication", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.routeBilling": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.proposeHold": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "actions.proposeTerms": { riskClass: "financial", sideEffectClass: "draft_only", visibility: "mcp" },
  "approvals.decide": { riskClass: "approval_gate", sideEffectClass: "write_local", visibility: "mcp" },
  "core.evaluateRule": { riskClass: "compute_only", sideEffectClass: "none", visibility: "internal" },
  "core.riskMeshClosedLoop": { riskClass: "compute_only", sideEffectClass: "none", visibility: "internal" },
  "decisions.deductionVerdict": { riskClass: "decision", sideEffectClass: "write_local", visibility: "internal" }
} as const;
```

- [ ] **Step 4: Implement permission engine**

Create `src/services/permissionEngine.ts`:

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
  if (metadata.sideEffectClass === "draft_only" || metadata.riskClass === "approval_gate" || metadata.riskClass === "financial") {
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

- [ ] **Step 5: Verify green**

```powershell
npm.cmd run test -- tests/invariants/tool-permissions.test.ts
```

Expected: PASS.

---

## Task 6: Split Internal And MCP Tool Visibility

**Files:**
- Modify `src/mcp/server.ts`
- Modify `tests/invariants/integration-contract.test.ts`
- Create `tests/invariants/mcp-visibility.test.ts`

- [ ] **Step 1: Write failing MCP visibility test**

Create `tests/invariants/mcp-visibility.test.ts`:

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

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/invariants/mcp-visibility.test.ts
```

Expected: FAIL because current facade lists all service tools.

- [ ] **Step 3: Implement MCP filtering**

Modify `src/mcp/server.ts`:

```ts
import { invokeServiceTool, serviceToolMetadata, serviceTools } from "../services/serviceLayer.js";

function isMcpVisible(name: string): boolean {
  return serviceToolMetadata[name as keyof typeof serviceToolMetadata]?.visibility === "mcp";
}
```

Change `listTools()` to filter by `isMcpVisible`.

Change `callTool()`:

```ts
if (!isMcpVisible(name)) {
  throw new Error("Tool is not exposed through MCP.");
}
```

- [ ] **Step 4: Update old integration test expectation**

In `tests/invariants/integration-contract.test.ts`, update the MCP facade test so it expects public MCP tools only, not every service tool.

- [ ] **Step 5: Verify green**

```powershell
npm.cmd run test -- tests/invariants/mcp-visibility.test.ts tests/invariants/integration-contract.test.ts
```

Expected: PASS.

---

## Task 7: Agent Handoff Packets

**Files:**
- Create `tests/unit/agent-handoffs.test.ts`
- Create `src/agents/messages.ts`
- Create `src/agents/handoffGraph.ts`
- Modify `src/agents/agentRuntime.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/agent-handoffs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AgentHandoffPacketSchema, createAgentHandoffPacket } from "../../src/agents/messages.js";
import { recoupHandoffGraph } from "../../src/agents/handoffGraph.js";

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

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/unit/agent-handoffs.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement packet schema**

Create `src/agents/messages.ts`:

```ts
import { z } from "zod";

export const AgentHandoffPacketSchema = z.object({
  packetId: z.string().min(1),
  fromAgent: z.string().min(1),
  toAgent: z.string().min(1),
  capability: z.enum(["A", "B", "C", "D", "all"]),
  caseId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  intent: z.string().min(1),
  status: z.enum(["created", "accepted", "completed", "blocked"])
});

export type AgentHandoffPacket = z.infer<typeof AgentHandoffPacketSchema>;

export function createAgentHandoffPacket(input: AgentHandoffPacket): AgentHandoffPacket {
  return AgentHandoffPacketSchema.parse(input);
}
```

- [ ] **Step 4: Implement graph**

Create `src/agents/handoffGraph.ts`:

```ts
export const recoupHandoffGraph = [
  { from: "Forensics Investigator", to: "Recovery Drafter", mode: "handoff" },
  { from: "Forensics Investigator", to: "Containment / Intent", mode: "handoff" },
  { from: "Risk-Mesh Supervisor", to: "Sentinel", mode: "agents-as-tools" },
  { from: "Risk-Mesh Supervisor", to: "Containment / Intent", mode: "agents-as-tools" },
  { from: "Conversational Query", to: "Audit Read", mode: "tool" }
] as const;
```

- [ ] **Step 5: Verify green**

```powershell
npm.cmd run test -- tests/unit/agent-handoffs.test.ts
```

Expected: PASS.

---

## Task 8: Skills Contract

**Files:**
- Create skill directories and `SKILL.md` files.
- Create `tests/invariants/skills-contract.test.ts`.

- [ ] **Step 1: Write failing test**

Create `tests/invariants/skills-contract.test.ts`:

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

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/invariants/skills-contract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `skills/recoup-evidence-pack/SKILL.md`**

```md
---
name: recoup-evidence-pack
description: Use this skill when assembling or reviewing deduction evidence packs with POD, contract, trade-promo, invoice, carrier, or credit-memo references.
---

# Recoup Evidence Pack

## When To Use

Use when a Forensics decision needs evidence completeness review.

## Procedure

1. Confirm the decision has `recordIds`.
2. Confirm invalid or partial deductions have supporting documents.
3. Confirm supporting documents are attached by document ID.
4. Confirm each document is cited in the decision basis.

## Validation

- Do not compute dollar amounts.
- Do not classify a deduction without deterministic rule output.
- Do not route recovery without supporting documents.
- Do not write back to ERP.
```

- [ ] **Step 4: Create remaining three skills**

Use the same structure:

`recoup-recovery-drafting`:
- focus on draft-only recovery/rebill/outreach artifacts.
- validation: amount must be clamped by deterministic decision delta.

`recoup-risk-arbitration`:
- focus on explaining arbitration positions and expert-owned blocks.
- validation: never invent weights.

`recoup-query-answering`:
- focus on cited query answers from audit/evidence/memory.
- validation: no uncited answer, no live approval.

- [ ] **Step 5: Verify green**

```powershell
npm.cmd run test -- tests/invariants/skills-contract.test.ts
```

Expected: PASS.

---

## Task 9: Offline Query Over Memory And Audit

**Files:**
- Create `tests/unit/query.test.ts`
- Modify `src/agents/query.ts`
- Modify `src/services/serviceLayer.ts` if needed

- [ ] **Step 1: Write failing query test**

Create `tests/unit/query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { answerOfflineQuery } from "../../src/agents/query.js";

describe("offline query", () => {
  it("answers from cited deterministic state and open dependencies", () => {
    const answer = answerOfflineQuery({
      question: "Why is Harbor blocked?"
    });

    expect(answer.status).toBe("disabled_offline_safe");
    expect(answer.answer).toContain("verify-runtime-config-loader-required");
    expect(answer.recordIds).toContain("CUST-HARBOR");
    expect(answer.deterministicBasis).toContain("audit.read");
  });
});
```

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/unit/query.test.ts
```

Expected: FAIL until query includes Harbor/audit basis.

- [ ] **Step 3: Implement bounded offline answer**

Modify `src/agents/query.ts` to:

- recognize Harbor/risk/open dependency questions.
- cite `CUST-HARBOR`, `ORDER-HARBOR-640K`, and `LEDGER-6-PARTIAL-HOLD`.
- mention `audit.read` as deterministic basis.
- keep `modelExecution` blocked.

- [ ] **Step 4: Verify green**

```powershell
npm.cmd run test -- tests/unit/query.test.ts tests/invariants/integration-contract.test.ts
```

Expected: PASS.

---

## Task 10: Trace, Memory, And Agent Graph Cockpit Read Models

**Files:**
- Modify `src/services/cockpitModel.ts`
- Modify `src/services/cockpitApi.ts`
- Modify tests

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/cockpit.test.ts`:

```ts
import { buildAgentGraphModel, buildMemorySummaryModel, buildTraceModel } from "../../src/services/cockpitModel.js";

it("builds trace, memory, and agent graph read models", () => {
  expect(buildTraceModel().events.length).toBeGreaterThan(0);
  expect(buildMemorySummaryModel().categories).toContain("approval_records");
  expect(buildAgentGraphModel().edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
});
```

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

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement read models**

Add functions in `src/services/cockpitModel.ts`:

- `buildTraceModel()`
- `buildMemorySummaryModel()`
- `buildAgentGraphModel()`

Use existing trace events, `memoryCategories`, and `recoupHandoffGraph`.

- [ ] **Step 4: Add REST endpoints**

Add to `src/services/cockpitApi.ts`:

- `GET /trace`
- `GET /memory`
- `GET /agents`

- [ ] **Step 5: Verify green**

```powershell
npm.cmd run test -- tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts tests/invariants/cockpit-no-business-logic.test.ts
```

Expected: PASS.

---

## Task 11: Premium SaaS UI Pass

**Files:**
- Modify `cockpit/app/page.tsx`
- Modify `cockpit/app/styles.css`
- Possibly modify `cockpit/app/layout.tsx`

- [ ] **Step 1: Write boundary test before UI edits**

Extend `tests/invariants/cockpit-no-business-logic.test.ts`:

```ts
it("renders premium cockpit sections through service endpoints only", () => {
  const page = readFileSync("cockpit/app/page.tsx", "utf8");

  expect(page).toContain("/trace");
  expect(page).toContain("/memory");
  expect(page).toContain("/agents");
  expect(page).not.toContain("runRiskMeshClosedLoop");
  expect(page).not.toContain("computePartialHold");
});
```

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts
```

Expected: FAIL until page fetches new read models.

- [ ] **Step 3: Implement UI additions**

Modify `cockpit/app/page.tsx`:

- Fetch `/trace`, `/memory`, `/agents` in `Promise.all`.
- Add an “Agent operations” band:
  - agent graph
  - tool calls
  - permission decisions
  - memory categories
  - audit hashes
- Keep all values as strings from API models.

- [ ] **Step 4: Polish O2C design**

Modify `cockpit/app/styles.css`:

- Use tokenized colors/radii/spacing only.
- Replace static sections with dense operational bands.
- Use premium hierarchy: compact headings, table-like rows, subtle borders.
- Reduce uppercase labels where the design system discourages generated-looking UI.
- Add responsive constraints so labels do not overlap.

- [ ] **Step 5: Optional Phosphor icons**

If dependency already exists and imports work, replace inline SVG icon helper with Phosphor icons:

```ts
import { FunnelSimple, FileText, Warning, Tray, ArrowClockwise } from "@phosphor-icons/react";
```

Do not add a new icon dependency; it already exists in `package.json`.

- [ ] **Step 6: Verify tests**

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/unit/cockpit.test.ts
npm.cmd run lint
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 7: Browser/dev verification**

Start servers:

```powershell
npm.cmd run dev:api
npm.cmd run dev:cockpit
```

Check:

- `http://127.0.0.1:4317/trace` returns 200.
- `http://127.0.0.1:4317/memory` returns 200.
- `http://127.0.0.1:4317/agents` returns 200.
- `http://127.0.0.1:3000` renders:
  - Deduction Forensics
  - Credit Arbitration
  - CFO Summary
  - Agent operations
  - Memory categories
  - Trace timeline

---

## Task 12: README And Architecture Review Update

**Files:**
- Modify `README.md`
- Modify `docs/architecture-review-and-recommendations.md`

- [ ] **Step 1: Write failing README test**

Extend `tests/invariants/readme-contract.test.ts`:

```ts
expect(readme).toContain("Memory And Compaction");
expect(readme).toContain("Agent Skills");
expect(readme).toContain("Agent-To-Agent Communication");
expect(readme).toContain("Tool Permissions");
```

- [ ] **Step 2: Run red**

```powershell
npm.cmd run test -- tests/invariants/readme-contract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Update README**

Add sections:

- `Memory And Compaction`
- `Agent Skills`
- `Agent-To-Agent Communication`
- `Tool Permissions`
- `What Is Still Deferred`

- [ ] **Step 4: Update architecture review doc**

Mark resolved:

- memory skeleton
- compaction
- skills
- handoff graph
- tool risk metadata
- MCP visibility split
- cockpit trace/memory/agent graph

Keep open:

- real SQLite if not approved
- production MCP transport
- real SAP sandbox
- expert constants
- bureau/remittance schemas
- live Realtime voice

- [ ] **Step 5: Verify green**

```powershell
npm.cmd run test -- tests/invariants/readme-contract.test.ts
```

Expected: PASS.

---

## Task 13: Final Verification And Critique

**Files:**
- No new files unless fixing failures.

- [ ] **Step 1: Run full gate**

```powershell
npm.cmd run verify
```

Expected:

- lint PASS
- typecheck PASS
- tests PASS
- dependency-cruiser PASS

- [ ] **Step 2: Self-verification**

Record:

- what changed
- which SDD sections are closer
- which invariants are touched
- likely bug
- confidence

- [ ] **Step 3: Senior critique**

Review diff for:

- hidden dollar math outside core
- invented constants
- broad tools
- MCP visibility leaks
- memory trust-boundary mistakes
- UI business logic
- missing tests

- [ ] **Step 4: SDD validation**

Re-read SDD sections:

- §3.2 repo map
- §3.3 layer responsibilities
- §6 agent layer
- §7 interfaces
- §11 cockpit UX

List:

- matched items
- partially implemented items
- deferred items and reason

- [ ] **Step 5: Final status**

Report:

- commands run
- test counts
- files changed
- residual open items
- whether SQLite/live voice/production MCP are still approval-blocked

---

## Approval Questions Before Execution

1. **SQLite dependency:** approve `better-sqlite3`, or implement JSONL/in-memory only?
2. **UI scope:** full premium redesign pass, or focused polish on current cockpit?
3. **Live voice:** keep offline shell, or implement Realtime behind env flag with ephemeral key route?
4. **MCP transport:** keep demo facade, or approve adding/using MCP SDK transport if dependency changes are needed?

---

## Recommended Execution Mode

Use **Subagent-Driven Development**:

- Worker 1: memory + compaction.
- Worker 2: tool permissions + MCP visibility.
- Worker 3: agent handoff graph + skills.
- Worker 4: query + cockpit read models.
- Worker 5: premium UI pass.
- Reviewer agents: spec compliance and code quality after each worker.

Do not run workers in overlapping files at the same time unless write scopes are disjoint.

