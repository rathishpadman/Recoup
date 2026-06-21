import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createRuntimeMemoryStore } from "../../src/memory/runtime.js";
import { readAgentHandoffPacket, readSessionState, readTransactionState } from "../../src/memory/session.js";
import type { SupabaseMemoryFetch } from "../../src/memory/supabaseStore.js";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";

const cockpitAuthEnv = {
  RECOUP_COCKPIT_ALLOWED_ORIGINS: "http://127.0.0.1:3000",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
} as const;
const cockpitAuthHeaders = {
  "content-type": "application/json",
  "x-recoup-human-principal": cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
  "x-recoup-human-token": cockpitAuthEnv.RECOUP_COCKPIT_AUTH_TOKEN
} as const;

async function listen(options?: Parameters<typeof createCockpitApi>[0]): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(createCockpitApi({ env: {}, ...options }));
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    server
  };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("S5 cockpit API", () => {
  it("serves the Forensics read model and approval decisions through REST", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
        selected: { draft: { actionId: string } };
        surface: string;
      };

      expect(modelResponse.status).toBe(200);
      expect(model.surface).toBe("forensics-analyst");

      const approvalResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: model.selected.draft.actionId,
          approverId: "human:maya-lead",
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await approvalResponse.json()) as {
        actionId: string;
        auditEntryHash: string;
        decision: string;
        status: string;
      };

      expect(approvalResponse.status).toBe(200);
      expect(approval.actionId).toBe(model.selected.draft.actionId);
      expect(approval.decision).toBe("approve");
      expect(approval.status).toBe("human_decided");
      expect(approval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await close(server);
    }
  });

  it("requires verified human auth before accepting approval decisions", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[1];
      if (action === undefined) {
        throw new Error("Forensics model must expose a second approval item.");
      }

      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          decision: "approve"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error: string };

      expect(response.status).toBe(401);
      expect(result.error).toBe("Verified human cockpit auth required.");
    } finally {
      await close(server);
    }
  });

  it("rejects cross-origin approval attempts outside the configured cockpit allowlist", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[2];
      if (action === undefined) {
        throw new Error("Forensics model must expose a third approval item.");
      }

      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          decision: "approve"
        }),
        headers: {
          ...cockpitAuthHeaders,
          origin: "https://evil.example"
        },
        method: "POST"
      });
      const result = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(result.error).toBe("Cockpit origin rejected.");
    } finally {
      await close(server);
    }
  });

  it("rejects non-human approval identities at the API boundary", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[3];
      if (action === undefined) {
        throw new Error("Forensics model must expose a fourth approval item.");
      }

      const approvalResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "system:auto",
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(approvalResponse.status).toBe(400);
    } finally {
      await close(server);
    }
  });

  it("does not trust client-supplied approver identity for approval audit", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[4];
      if (action === undefined) {
        throw new Error("Forensics model must expose a fifth approval item.");
      }

      const approvalResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:spoofed-script",
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await approvalResponse.json()) as {
        approverId: string;
      };

      expect(approvalResponse.status).toBe(200);
      expect(approval.approverId).toBe("human:maya-lead");
    } finally {
      await close(server);
    }
  });

  it("requires a human reason when modifying or rejecting an approval item", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[9];
      if (action === undefined) {
        throw new Error("Forensics model must expose a tenth approval item.");
      }

      const missingReasonResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:maya-lead",
          decision: "modify"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      expect(missingReasonResponse.status).toBe(400);

      const blankReasonResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:maya-lead",
          decision: "reject",
          reason: "        "
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      expect(blankReasonResponse.status).toBe(400);

      const reasonedResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:maya-lead",
          decision: "reject",
          reason: "POD evidence must be rechecked before this draft is released."
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await reasonedResponse.json()) as {
        auditEntryHash: string;
        decision: string;
        reason: string;
      };

      expect(reasonedResponse.status).toBe(200);
      expect(approval.decision).toBe("reject");
      expect(approval.reason).toBe("POD evidence must be rechecked before this draft is released.");
      expect(approval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await close(server);
    }
  });

  it("rejects approval reasons with direct PII or secrets before audit append", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[10];
      if (action === undefined) {
        throw new Error("Forensics model must expose an eleventh approval item.");
      }

      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:maya-lead",
          decision: "reject",
          reason: "Discuss with maya@example.com before rejecting this draft."
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(response.status).toBe(400);
    } finally {
      await close(server);
    }
  });

  it("prevents repeated or contradictory approval decisions for one action", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[11];
      if (action === undefined) {
        throw new Error("Forensics model must expose a twelfth approval item.");
      }

      const first = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:maya-lead",
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const second = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          approverId: "human:maya-lead",
          decision: "reject",
          reason: "Late contradictory rejection should not replace the first decision."
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
    } finally {
      await close(server);
    }
  });

  it("shares approval finality between REST and internal service decisions", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[12];
      if (action === undefined) {
        throw new Error("Forensics model must expose a thirteenth approval item.");
      }

      const first = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(first.status).toBe(200);
      expect(() =>
        invokeServiceTool("approvals.decide", {
          actionId: action.actionId,
          decision: "reject",
          reason: "The service path must not contradict the REST decision."
        }, {
          verifiedHumanPrincipal: cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL
        })
      ).toThrow("Action already has a human decision.");
    } finally {
      await close(server);
    }
  });

  it("streams run progress as SSE envelopes", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/run`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(body).toContain("event: finding");
      expect(body).toContain("event: verdict");
      expect(body).not.toContain("deductionValidityAccuracy");
      expect(body.split("\n\n").every((chunk) => chunk === "" || chunk.includes("data: {"))).toBe(true);
      const verdictEvent = body
        .split("\n\n")
        .find((chunk) => chunk.includes("event: verdict") && chunk.includes("data: {"));
      expect(verdictEvent).toBeDefined();
      const dataLine = verdictEvent?.split("\n").find((line) => line.startsWith("data: "));
      const verdict = JSON.parse(dataLine?.slice("data: ".length) ?? "{}") as {
        payload?: {
          deterministicBasis?: { amountSource?: string; computedDeltaAmount?: string; ruleId?: string };
          recordIds?: string[];
        };
      };
      expect(verdict.payload?.recordIds?.length).toBeGreaterThan(0);
      expect(verdict.payload?.deterministicBasis?.amountSource).toBe("core-rule-delta");
      expect(typeof verdict.payload?.deterministicBasis?.computedDeltaAmount).toBe("string");
      expect(typeof verdict.payload?.deterministicBasis?.ruleId).toBe("string");
    } finally {
      await close(server);
    }
  });

  it("persists cited forensics run memory when runtime memory is configured", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-"));
    const dbPath = join(dir, "memory.sqlite");
    const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: dbPath } });
    let store: ReturnType<typeof createRuntimeMemoryStore> | undefined;

    try {
      const response = await fetch(`${baseUrl}/run`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("event: verdict");

      store = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      expect(readSessionState(store, "cockpit-run", "last-forensics-run")).toMatchObject({
        category: "session_state",
        payload: { key: "last-forensics-run", value: "completed" }
      });
      expect(readAgentHandoffPacket(store, "forensics-recovery:cockpit-run")).toMatchObject({
        category: "agent_handoff_packets",
        payload: {
          capability: "B",
          caseId: "cockpit-run",
          deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
          fromAgent: "Forensics Investigator",
          intent: "stage-recovery-and-billing-drafts",
          status: "created",
          toAgent: "Recovery Drafter"
        }
      });
      expect(readTransactionState(store, "S1-L1", "deduction-decision")).toMatchObject({
        category: "transaction_state",
        payload: {
          key: "deduction-decision",
          value: {
            decisionId: "deduction-decision:S1-L1",
            producedBy: "agent:forensics-investigator",
            routing: "billing",
            verdict: "valid"
          }
        }
      });
    } finally {
      store?.close();
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves persisted runtime memory records through the cockpit memory endpoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-view-"));
    const dbPath = join(dir, "memory.sqlite");
    const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: dbPath } });

    try {
      const runResponse = await fetch(`${baseUrl}/run`);
      const runBody = await runResponse.text();
      const memoryResponse = await fetch(`${baseUrl}/memory`);
      const memory = (await memoryResponse.json()) as {
        records: Array<{ category: string; id: string; recordIds: string[]; scope: string }>;
      };

      expect(runResponse.status).toBe(200);
      expect(runBody).toContain("event: verdict");
      expect(memoryResponse.status).toBe(200);

      const sessionRecord = memory.records.find((record) => record.id === "session:cockpit-run:last-forensics-run");
      const transactionRecord = memory.records.find((record) => record.id === "transaction:S1-L1:deduction-decision");
      const handoffRecord = memory.records.find((record) => record.id === "agent-handoff:forensics-recovery:cockpit-run");

      expect(sessionRecord).toMatchObject({ category: "session_state", scope: "session:cockpit-run" });
      expect(transactionRecord).toMatchObject({ category: "transaction_state", scope: "transaction:S1-L1" });
      expect(handoffRecord).toMatchObject({ category: "agent_handoff_packets" });
      expect(handoffRecord?.recordIds).toContain("S1-L1");
    } finally {
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists and serves cockpit run memory through Supabase when selected as the memory backend", async () => {
    const rows: unknown[] = [];
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });
      if (init.method === "POST") {
        const row = JSON.parse(body ?? "{}") as Record<string, unknown>;
        const existingIndex = rows.findIndex((candidate) => (candidate as { id?: string }).id === row["id"]);
        if (existingIndex === -1) {
          rows.push(row);
        } else {
          rows[existingIndex] = row;
        }
        return Promise.resolve(new Response(JSON.stringify([row]), { status: 201 }));
      }

      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const runResponse = await fetch(`${baseUrl}/run`);
      const runBody = await runResponse.text();
      const memoryResponse = await fetch(`${baseUrl}/memory`);
      const memory = (await memoryResponse.json()) as {
        records: Array<{ category: string; id: string; recordIds: string[]; scope: string }>;
      };

      expect(runResponse.status).toBe(200);
      expect(runBody).toContain("event: verdict");
      expect(memoryResponse.status).toBe(200);
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toBe(true);
      expect(calls.some((call) => call.method === "GET" && call.url.includes("order=sequence.asc"))).toBe(true);
      expect(memory.records.find((record) => record.id === "session:cockpit-run:last-forensics-run")).toMatchObject({
        category: "session_state",
        scope: "session:cockpit-run"
      });
      expect(memory.records.find((record) => record.id === "transaction:S1-L1:deduction-decision")).toMatchObject({
        category: "transaction_state",
        scope: "transaction:S1-L1"
      });
      expect(JSON.stringify(memory)).not.toContain("supabase-secret-key");
    } finally {
      await close(server);
    }
  });

  it("keeps the cockpit memory endpoint available when unrelated SAP config is invalid", async () => {
    const { baseUrl, server } = await listen({ env: { SAP_ODATA_BASE_URL: "sap-sandbox-host" } });

    try {
      const response = await fetch(`${baseUrl}/memory`);
      const memory = (await response.json()) as { categories: string[]; surface: string };

      expect(response.status).toBe(200);
      expect(memory.surface).toBe("memory");
      expect(memory.categories).toContain("approval_records");
    } finally {
      await close(server);
    }
  });

  it("returns an HTTP error instead of committing SSE headers when runtime memory cannot initialize", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-error-"));
    const fileParent = join(dir, "not-a-directory");
    writeFileSync(fileParent, "not a directory");
    const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: join(fileParent, "memory.sqlite") } });

    try {
      const response = await fetch(`${baseUrl}/run`);

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    } finally {
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves the Credit and CFO read models through REST", async () => {
    const { baseUrl, server } = await listen();
    try {
      const [creditResponse, cfoResponse] = await Promise.all([fetch(`${baseUrl}/credit`), fetch(`${baseUrl}/cfo`)]);
      const credit = (await creditResponse.json()) as { surface: string; arbitration: { status: string } };
      const cfo = (await cfoResponse.json()) as { surface: string; metrics: unknown[] };

      expect(creditResponse.status).toBe(200);
      expect(cfoResponse.status).toBe(200);
      expect(credit.surface).toBe("credit-arbitration");
      expect(credit.arbitration.status).toBe("blocked");
      expect(cfo.surface).toBe("cfo-summary");
      expect(cfo.metrics.length).toBeGreaterThan(0);
    } finally {
      await close(server);
    }
  });

  it("serves trace, memory, agent graph, and connector readiness read endpoints", async () => {
    const { baseUrl, server } = await listen();
    try {
      const [traceResponse, memoryResponse, agentsResponse, connectorsResponse] = await Promise.all([
        fetch(`${baseUrl}/trace`),
        fetch(`${baseUrl}/memory`),
        fetch(`${baseUrl}/agents`),
        fetch(`${baseUrl}/connectors`)
      ]);
      const trace = (await traceResponse.json()) as { events: unknown[] };
      const memory = (await memoryResponse.json()) as { categories: string[] };
      const agents = (await agentsResponse.json()) as { edges: Array<{ mode: string }> };
      const connectors = (await connectorsResponse.json()) as {
        connectors: Array<{ name: string; proof: { externalWritesAllowed: boolean }; status: string }>;
        surface: string;
      };

      expect(traceResponse.status).toBe(200);
      expect(memoryResponse.status).toBe(200);
      expect(agentsResponse.status).toBe(200);
      expect(connectorsResponse.status).toBe(200);
      expect(trace.events.length).toBeGreaterThan(0);
      expect(memory.categories).toContain("approval_records");
      expect(agents.edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
      expect(connectors.surface).toBe("connector-readiness");
      expect(connectors.connectors.find((connector) => connector.name === "sap-odata")).toMatchObject({
        status: "blocked_credentials_required"
      });
      expect(connectors.connectors.map((connector) => connector.proof.externalWritesAllowed)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false
      ]);
    } finally {
      await close(server);
    }
  });

  it("fails closed for Realtime client-secret requests when credentials are absent", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "why is Harbor blocked?" }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as {
        auditPolicy: { allowedTools: string[]; recordIds: string[] };
        status: string;
      };

      expect(response.status).toBe(503);
      expect(result.status).toBe("blocked_missing_credentials");
      expect(result.auditPolicy.recordIds).toContain("OPENAI-REALTIME-POLICY");
      expect(result.auditPolicy.allowedTools).toEqual(["audit.read", "query.answer"]);
    } finally {
      await close(server);
    }
  });

  it("marks Realtime client-secret responses no-store and never returns the server API key", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-secret" },
      realtimeFetcher: () => Promise.resolve(new Response(JSON.stringify({ value: "ek_test_secret" }), { status: 200 }))
    });

    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "why is Harbor blocked?" }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body).not.toContain("sk-test-secret");
    } finally {
      await close(server);
    }
  });

  it("handles only read-only Realtime tool calls through verified human auth", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });

    try {
      const response = await fetch(`${baseUrl}/query/realtime-tool`, {
        body: JSON.stringify({
          argumentsJson: JSON.stringify({ question: "why is Harbor blocked?" }),
          name: "query.answer"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as {
        recordIds: string[];
        status: string;
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(result.status).toBe("ok");
      expect(result.recordIds).toContain("CUST-HARBOR");

      const blocked = await fetch(`${baseUrl}/query/realtime-tool`, {
        body: JSON.stringify({
          argumentsJson: "{}",
          name: "actions.draftRebill"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get("cache-control")).toBe("no-store");
    } finally {
      await close(server);
    }
  });

  it("rejects empty Realtime query requests before credential or upstream handling", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: " " }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(result.error).toBe("Realtime query question is required.");
    } finally {
      await close(server);
    }
  });

  it("requires verified human auth before issuing Realtime client-secret requests", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "why is Harbor blocked?" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as { error: string };

      expect(response.status).toBe(401);
      expect(result.error).toBe("Verified human cockpit auth required.");
    } finally {
      await close(server);
    }
  });

  it("does not call the Realtime upstream when cockpit human auth is missing", async () => {
    let upstreamCalls = 0;
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-secret" },
      realtimeFetcher: () => {
        upstreamCalls += 1;
        return Promise.resolve(new Response(JSON.stringify({ value: "ek_test" }), { status: 200 }));
      }
    });

    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "why is Harbor blocked?" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(401);
      expect(upstreamCalls).toBe(0);
    } finally {
      await close(server);
    }
  });

  it("uses the verified human principal as the Realtime safety identifier", async () => {
    const upstreamCalls: RequestInit[] = [];
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-secret" },
      realtimeFetcher: (_url, init) => {
        upstreamCalls.push(init ?? {});
        return Promise.resolve(new Response(JSON.stringify({ value: "ek_test" }), { status: 200 }));
      }
    });

    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "why is Harbor blocked?" }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as { status: string };

      expect(response.status).toBe(200);
      expect(result.status).toBe("issued");
      expect(upstreamCalls).toHaveLength(1);
      expect(upstreamCalls[0]?.headers).toMatchObject({
        "OpenAI-Safety-Identifier": cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL
      });
    } finally {
      await close(server);
    }
  });

  it("does not fall back to process env when the cockpit API receives an explicit empty env", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-process-secret";
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });

    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "why is Harbor blocked?" }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as { status: string };

      expect(response.status).toBe(503);
      expect(result.status).toBe("blocked_missing_credentials");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      await close(server);
    }
  });
});

function stringifyRequestBody(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return undefined;
}
