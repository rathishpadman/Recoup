import { createServer, type Server } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { day1GovernedConfigSeed, governedConfigSeedRows, sha256CanonicalJson } from "../../config/governed.js";
import {
  createCockpitApi,
  startCockpitApiRuntime,
  type CockpitMcpServerStarter,
  type CockpitSourceHealthPollerFactory
} from "../../src/services/cockpitApi.js";
import { cockpitHumanProxyIssuedAtFreshnessWindowMs } from "../../config/cockpitHumanPrincipals.js";
import type { LiveForensicsStreamRunner } from "../../src/agents/liveForensicsStream.js";
import { createAgentHookAuditReceipt } from "../../src/services/conductor.js";
import { createRuntimeMemoryStore } from "../../src/memory/runtime.js";
import {
  readAgentHandoffPacket,
  readSessionState,
  readTransactionState
} from "../../src/memory/session.js";
import type { SupabaseMemoryFetch } from "../../src/memory/supabaseStore.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";
import { recoupCorrelationIdHeader } from "../../src/middleware/logging.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const cockpitAuthEnv = {
  RECOUP_COCKPIT_ALLOWED_ORIGINS: "http://127.0.0.1:3000",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
} as const;
const cockpitApprovalEnv = {
  ...cockpitAuthEnv,
  RECOUP_MEMORY_BACKEND: "supabase",
  RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
} as const;
const cockpitAuthHeaders = {
  "content-type": "application/json",
  "x-recoup-human-principal": cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
  "x-recoup-human-token": cockpitAuthEnv.RECOUP_COCKPIT_AUTH_TOKEN
} as const;
const selectedRealtimeQueryScope = {
  recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1", "SAP-INV-S3-1", "DOC-S3-L1"],
  selectedLineId: "S3-L1"
} as const;
const demoProxySecret = "test-demo-session-secret";
const governedConfig = day1GovernedConfigSeed.values;
const serviceSource = new SyntheticSource({ seed: 42 });
const governedConfigEnv = {
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

async function listen(options?: Parameters<typeof createCockpitApi>[0]): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(
    createCockpitApi({
      ...options,
      env: { ...governedConfigEnv, ...(options?.env ?? {}) },
      memoryFetcher: withGovernedConfigFetcher(options?.memoryFetcher)
    })
  );
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
  it("serves an honest JSON API index at the root route", async () => {
    const { baseUrl, server } = await listen({
      env: {
        OPENAI_API_KEY: "sk-test-secret",
        RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key"
      }
    });
    try {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      const root = (await response.json()) as {
        cockpitHint: string;
        defaultPort: number;
        routes: string[];
        service: string;
        surface: string;
      };
      const body = JSON.stringify(root);

      expect(root.surface).toBe("api");
      expect(root.service).toBe("recoup-cockpit-api");
      expect(root.defaultPort).toBe(4317);
      expect(root.cockpitHint).toContain("npm run dev:cockpit");
      expect(root.cockpitHint).toContain("Next.js URL");
      expect(root.routes).toEqual(
        expect.arrayContaining([
          "GET /",
          "GET /healthz",
          "GET /login",
          "GET /forensics",
          "GET /credit",
          "GET /cfo",
          "GET /sources/r1/:need"
        ])
      );
      expect(body).not.toContain("sk-test-secret");
      expect(body).not.toContain("test-human-token");
      expect(body).not.toContain("supabase-secret-key");
    } finally {
      await close(server);
    }
  });

  it("requires verified human auth for protected real-backend read endpoints", async () => {
    const calls: string[] = [];
    const sapFetcher = vi.fn();
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" },
      memoryFetcher: (url, init) => {
        calls.push(url);
        return withGovernedConfigOnlyFetcher()(url, init);
      },
      sapFetcher
    });
    try {
      const responses = await Promise.all([
        fetch(`${baseUrl}/forensics`),
        fetch(`${baseUrl}/forensics/work-items/S6-L1`),
        fetch(`${baseUrl}/connectors`),
        fetch(`${baseUrl}/sources/r1/outbound-delivery?deliveryRef=DEL_GREEN_01`)
      ]);
      const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<{ error: string }>;

      expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
      expect(bodies).toEqual([
        { error: "Verified human cockpit auth required." },
        { error: "Verified human cockpit auth required." },
        { error: "Verified human cockpit auth required." },
        { error: "Verified human cockpit auth required." }
      ]);
      expect(calls).toEqual([]);
      expect(sapFetcher).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });

  it("serves R1 Supabase fallback source-read plans without source secrets", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key"
      }
    });
    try {
      const response = await fetch(`${baseUrl}/sources/r1/outbound-delivery?deliveryRef=DEL_GREEN_01`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        readPlan: { supabase: { filters: Record<string, string>; table: string } };
        sourceMode: string;
      };

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        readPlan: {
          supabase: {
            filters: { delivery_ref: "eq.DEL_GREEN_01" },
            table: "pod_records"
          }
        },
        sourceMode: "supabase_authoritative"
      });
      expect(JSON.stringify(body)).not.toContain("supabase-secret-key");
    } finally {
      await close(server);
    }
  });

  it("serves R1 SAP-primary source-read plans through metadata-validated GET-only mapping", async () => {
    const sapCalls: Array<{ method: string | undefined; url: string }> = [];
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        SAP_ODATA_BASE_URL: "https://sap.example.test",
        SAP_ODATA_CLIENT: "100",
        SAP_ODATA_CLIENT_SECRET: "sap-password",
        SAP_ODATA_USERID: "sap-user"
      },
      sapFetcher: (url, init) => {
        sapCalls.push({ method: init?.method, url: stringifyRequestUrl(url) });
        return Promise.resolve(
          new Response(
            `
              <Schema Namespace="ZUI_CREDITEXPOSURE_DISPLAY_0001">
                <EntityType Name="CreditExposureType">
                  <Key><PropertyRef Name="BusinessPartner" /></Key>
                  <Property Name="BusinessPartner" Type="Edm.String" />
                </EntityType>
                <EntityContainer>
                  <EntitySet Name="CreditExposure" EntityType="ZUI_CREDITEXPOSURE_DISPLAY_0001.CreditExposureType" />
                </EntityContainer>
              </Schema>
            `,
            { headers: { "content-type": "application/xml" }, status: 200 }
          )
        );
      }
    });
    try {
      const response = await fetch(`${baseUrl}/sources/r1/credit-exposure?businessPartner=USCU_S04`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        readPlan: { sap: { requests: Array<{ method: string; purpose: string; url: string }> } };
        sourceMode: string;
      };

      expect(response.status).toBe(200);
      expect(body.sourceMode).toBe("sap_primary");
      expect(body.readPlan.sap.requests).toEqual([
        {
          method: "GET",
          purpose: "credit-exposure",
          recordIds: ["USCU_S04"],
          url: "https://sap.example.test/sap/opu/odata/sap/ZUI_CREDITEXPOSURE_DISPLAY_0001/CreditExposure(BusinessPartner='USCU_S04')?sap-client=100"
        }
      ]);
      expect(sapCalls).toEqual([
        {
          method: "GET",
          url: "https://sap.example.test/sap/opu/odata/sap/ZUI_CREDITEXPOSURE_DISPLAY_0001/$metadata?sap-client=100"
        }
      ]);
      expect(JSON.stringify(body)).not.toContain("sap-password");
    } finally {
      await close(server);
    }
  });

  it("fails closed for malformed R1 source-read route requests", async () => {
    const sapCalls: Array<{ method: string | undefined; url: string }> = [];
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        SAP_ODATA_BASE_URL: "https://sap.example.test",
        SAP_ODATA_CLIENT: "100",
        SAP_ODATA_CLIENT_SECRET: "sap-password",
        SAP_ODATA_USERID: "sap-user"
      },
      sapFetcher: (url, init) => {
        sapCalls.push({ method: init?.method, url: stringifyRequestUrl(url) });
        return Promise.resolve(new Response("<Schema />", { headers: { "content-type": "application/xml" }, status: 200 }));
      }
    });
    try {
      const missingKey = await fetch(`${baseUrl}/sources/r1/invoice`, { headers: cockpitAuthHeaders });
      const malformedSapPrimary = await fetch(`${baseUrl}/sources/r1/invoice?billingDocument=80000002`, {
        headers: cockpitAuthHeaders
      });
      const broaderNeed = await fetch(`${baseUrl}/sources/r1/aging-grid?customerId=USCU_S04`, { headers: cockpitAuthHeaders });
      const overbroadFallback = await fetch(`${baseUrl}/sources/r1/payment-history?customerId=USCU_S04&invoiceRef=90000002`, {
        headers: cockpitAuthHeaders
      });

      expect(missingKey.status).toBe(400);
      expect(await missingKey.json()).toEqual({ error: "Invalid R1 source read request." });
      expect(malformedSapPrimary.status).toBe(400);
      expect(await malformedSapPrimary.json()).toEqual({ error: "Invalid R1 source read request." });
      expect(broaderNeed.status).toBe(400);
      expect(await broaderNeed.json()).toEqual({ error: "Invalid R1 source read request." });
      expect(overbroadFallback.status).toBe(400);
      expect(await overbroadFallback.json()).toEqual({ error: "Invalid R1 source read request." });
      expect(sapCalls).toEqual([]);
    } finally {
      await close(server);
    }
  });

  it("serves a JSON health check for the cockpit API surface", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get(recoupCorrelationIdHeader)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      const health = (await response.json()) as {
        ok: boolean;
        runControl: {
          approvedBy?: string;
          retryCapPhaseCount?: number;
          status: string;
          stepBudgetPhaseCount?: number;
          tokenBudgetPhaseCount?: number;
        };
        surface: string;
        version: string;
      };

      expect(health.ok).toBe(true);
      expect(health.runControl).toEqual({
        approvedBy: "human:rathish-owner",
        retryCapPhaseCount: 6,
        status: "pass",
        stepBudgetPhaseCount: 6,
        tokenBudgetPhaseCount: 6
      });
      expect(health.surface).toBe("cockpit-api");
      expect(health.version.length).toBeGreaterThan(0);
      expect(JSON.stringify(health)).not.toContain("secret");
      expect(JSON.stringify(health)).not.toContain("200000");
    } finally {
      await close(server);
    }
  });

  it("echoes safe request correlation ids for cockpit async hops", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/healthz`, {
        headers: {
          [recoupCorrelationIdHeader]: "run-42:MAYA"
        }
      });

      expect(response.status).toBe(200);
      expect(response.headers.get(recoupCorrelationIdHeader)).toBe("run-42:MAYA");
    } finally {
      await close(server);
    }
  });

  it("serves the login read model through REST", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/login`);
      const model = (await response.json()) as {
        personas: Array<{
          allowedRouteCount: number;
          defaultRoute: string;
          loginId: string;
          role: string;
          sourceMode: string;
        }>;
        surface: string;
      };

      expect(response.status).toBe(200);
      expect(model.surface).toBe("login");
      expect(model.personas.map((persona) => persona.loginId)).toEqual(["Maya", "david", "CFO"]);
      expect(model.personas.map((persona) => persona.role)).toEqual(["maya", "david", "cfo"]);
      expect(model.personas.map((persona) => persona.defaultRoute)).toEqual(["/forensics/shadcn", "/credit", "/cfo"]);
      expect(model.personas.map((persona) => persona.allowedRouteCount)).toEqual([2, 1, 5]);
      expect(model.personas.every((persona) => persona.sourceMode === "deterministic_demo_profile")).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("serves the Forensics read model and approval decisions through REST", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
        containmentPanel?: {
          actionPostureLabel: string;
          customerId: string;
          recordIds: string[];
          statusLabel: string;
        };
        selected: { draft: { actionId: string } };
        surface: string;
      };

      expect(modelResponse.status).toBe(200);
      expect(model.surface).toBe("forensics-analyst");
      expect(model.containmentPanel).toMatchObject({
        actionPostureLabel: "No hold or freeze action staged",
        customerId: "CUST-CRESTLINE",
        statusLabel: "Gaming-gate review candidate"
      });
      expect(model.containmentPanel?.recordIds).toEqual(expect.arrayContaining(["S3-L1", "S6-L1"]));

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

  it("fails closed for approval decisions when Supabase audit persistence is not selected", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const model = (await modelResponse.json()) as {
        selected: { draft: { actionId: string } };
      };

      const approvalResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: model.selected.draft.actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await approvalResponse.json()) as { error: string };

      expect(approvalResponse.status).toBe(503);
      expect(body.error).toBe("Durable audit trail is unavailable.");
    } finally {
      await close(server);
    }
  });

  it("fails closed instead of serving static Forensics evidence when Supabase source evidence rows are unavailable", async () => {
    const calls: string[] = [];
    const correlationId = "test-correlation-source-evidence-missing";
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" },
        memoryFetcher: missingSyntheticEvidenceSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, {
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId }
      });
      const body = (await modelResponse.json()) as { correlationId: string; error: string; missingSource: string };

      expect(modelResponse.status).toBe(503);
      expect(body.error).toBe("Supabase source evidence rows are unavailable or failed validation.");
      expect(body.missingSource).toBe("supabase-source-evidence-rows");
      expect(body.correlationId).toBe(correlationId);
      expect(modelResponse.headers.get(recoupCorrelationIdHeader)).toBe(correlationId);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_sap"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_docs"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_tpm"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_bureau"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("reports the SAP source table when only Supabase SAP evidence rows are unavailable", async () => {
    const calls: string[] = [];
    const correlationId = "test-correlation-sap-evidence-missing";
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" },
        memoryFetcher: missingSapEvidenceSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, {
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId }
      });
      const body = (await modelResponse.json()) as {
        correlationId: string;
        error: string;
        missingSource: string;
        sourceTableName?: string;
      };

      expect(modelResponse.status).toBe(503);
      expect(body).toEqual({
        correlationId,
        error: "Supabase SAP source evidence rows are unavailable or failed validation.",
        missingSource: "supabase-sap-source-evidence-rows",
        sourceTableName: "recoup_src_sap"
      });
      expect(modelResponse.headers.get(recoupCorrelationIdHeader)).toBe(correlationId);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_sap"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("fails closed in real-backend mode when governed Supabase settlement rows are missing", async () => {
    const calls: string[] = [];
    const correlationId = "test-correlation-settlement-missing";
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" },
        memoryFetcher: missingSettlementSourceRowsFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, {
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId }
      });
      const body = (await modelResponse.json()) as { correlationId: string; error: string; missingSource: string };

      expect(modelResponse.status).toBe(503);
      expect(body).toEqual({
        correlationId,
        error: "Supabase settlement source rows are unavailable or failed validation.",
        missingSource: "supabase-settlement-source-rows"
      });
      expect(modelResponse.headers.get(recoupCorrelationIdHeader)).toBe(correlationId);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_customers"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_deduction_lines"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("serves backend detail for the requested Forensics work item line", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/work-items/S6-L1`, { headers: cockpitAuthHeaders });
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as {
        auditState: {
          provenance: { recordIds: string[] };
          recordIds: string[];
          statusLabel: string;
        };
        approvalState: {
          actions: Array<{ decision: string }>;
          provenance: { recordIds: string[] };
        };
        lineId: string;
        recommendedAction: {
          actionId: string;
          provenance: { recordIds: string[] };
        };
        recoveryDraft: {
          actionId: string;
          provenance: { recordIds: string[] };
        };
        selected: {
          draft: {
            actionId: string;
            provenance: { recordIds: string[] };
          };
          evidencePack: {
            provenance: { recordIds: string[] };
            recordIds: string[];
          };
          lineId: string;
        };
        surface: string;
        workItem: {
          lineIds: string[];
          provenance: { recordIds: string[] };
        };
      };

      expect(response.status).toBe(200);
      expect(body.surface).toBe("forensics-work-item-detail");
      expect(body.lineId).toBe("S6-L1");
      expect(body.workItem.lineIds).toContain("S6-L1");
      expect(body.workItem.provenance.recordIds).toContain("S6-L1");
      expect(body.selected.lineId).toBe("S6-L1");
      expect(body.selected.evidencePack.recordIds).toContain("S6-L1");
      expect(body.selected.evidencePack.provenance.recordIds).toContain("S6-L1");
      expect(body.selected.draft.actionId).toBe("draft-rebill:S6-L1");
      expect(body.selected.draft.provenance.recordIds).toContain("S6-L1");
      expect(body.recommendedAction.actionId).toBe("draft-rebill:S6-L1");
      expect(body.recommendedAction.provenance.recordIds).toContain("S6-L1");
      expect(body.recoveryDraft.actionId).toBe("draft-rebill:S6-L1");
      expect(body.recoveryDraft.provenance.recordIds).toContain("S6-L1");
      expect(body.approvalState.actions.map((action) => action.decision)).toEqual(["approve", "modify", "reject"]);
      expect(body.approvalState.provenance.recordIds).toContain("S6-L1");
      expect(body.auditState.statusLabel).toBe("Awaiting human approval");
      expect(body.auditState.recordIds).toContain("S6-L1");
      expect(body.auditState.provenance.recordIds).toContain("S6-L1");
    } finally {
      await close(server);
    }
  });

  it("returns 404 for an unknown Forensics work item line without falling back to the fixed selection", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/work-items/NO-SUCH-LINE`, { headers: cockpitAuthHeaders });
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as { error: string; lineId: string };

      expect(response.status).toBe(404);
      expect(body).toEqual({
        error: "Forensics work item not found.",
        lineId: "NO-SUCH-LINE"
      });
    } finally {
      await close(server);
    }
  });

  it("fails closed for Forensics work item detail when governed Supabase settlement rows are missing", async () => {
    const calls: string[] = [];
    const correlationId = "test-correlation-work-item-settlement-missing";
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" },
        memoryFetcher: missingSettlementSourceRowsFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const response = await fetch(`${baseUrl}/forensics/work-items/S6-L1`, {
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId }
      });
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as { correlationId: string; error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({
        correlationId,
        error: "Supabase settlement source rows are unavailable or failed validation.",
        missingSource: "supabase-settlement-source-rows"
      });
      expect(response.headers.get(recoupCorrelationIdHeader)).toBe(correlationId);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_customers"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_deduction_lines"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("serves backend forensic query sessions with cited trace rows", async () => {
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
      forensicsStreamRunner: liveRunner
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: Array<{ recordId: string }>;
        deterministicBasis?: string;
        trace: Array<{
          deterministicBasis: string;
          hook: string;
          nextAgentName?: string;
          phase: string;
          receiptDeterministicBasis: string;
          recordIds: string[];
        }>;
        modelExecution?: {
          agentNames: string[];
          handoffCount: number;
          mode: string;
          rawModelTextPolicy: string;
        };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(liveRunner).toHaveBeenCalledTimes(1);
      expect(Object.keys(body).sort()).toEqual(["answer", "citations", "deterministicBasis", "modelExecution", "trace"]);
      expect(body.answer).toContain("S6-L1");
      expect(body.answer).not.toContain("$");
      expect(body.deterministicBasis).toBe(
        "runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace"
      );
      expect(body.modelExecution).toMatchObject({
        agentNames: ["Forensics Investigator", "Recovery Drafter"],
        handoffCount: 1,
        mode: "live_openai_agents",
        rawModelTextPolicy: "suppressed"
      });
      expect(body.trace.map((event) => event.phase)).toEqual(
        expect.arrayContaining(["supervisor", "query", "retrieval", "decision"])
      );
      expect(body.trace.map((event) => event.hook)).toEqual(
        expect.arrayContaining(["agent_start", "agent_handoff", "agent_tool_start", "agent_tool_end", "agent_end"])
      );
      expect(body.trace.some((event) => event.nextAgentName === "Recovery Drafter")).toBe(true);
      expect(body.trace.every((event) => event.recordIds.includes("S6-L1"))).toBe(true);
      expect(body.trace.every((event) => event.deterministicBasis.trim().length > 0)).toBe(true);
      expect(body.trace.map((event) => event.receiptDeterministicBasis)).toEqual(
        expect.arrayContaining([
          "OpenAI Agents SDK RunHooks lifecycle event",
          "Recoup deterministic forensics hook audit event"
        ])
      );
      expect(body.citations.map((citation) => citation.recordId)).toEqual(
        expect.arrayContaining(["S6-L1", "INV-S6-1", "SAP-INV-S6-1"])
      );
    } finally {
      await close(server);
    }
  });

  it("persists a sanitized Supabase token-usage receipt for successful live forensic query sessions", async () => {
    const correlationId = "maya-query-token-receipt-1";
    const rawModelText = "Raw model text with sk-rawmodelsecret that must stay suppressed.";
    const requestBodySecret = "request-body-secret-bearer";
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryRows: Array<Record<string, unknown>> = [];
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      emitForensicsHandoffReceipts(request);
      return (async function* stream() {
        await Promise.resolve();
        yield* sdkSelectedEvidenceToolEvents(selectedLiveQueryRecordIds(request));
        yield {
          data: {
            delta: rawModelText,
            type: "output_text_delta",
            usage: { total_tokens: 1842 }
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });

      if (init.method === "POST" && url.includes("/rest/v1/recoup_memory_records")) {
        const row = JSON.parse(body ?? "{}") as Record<string, unknown>;
        memoryRows.push(row);
        return Promise.resolve(new Response(JSON.stringify([row]), { status: 201 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
      },
      forensicsStreamRunner: liveRunner,
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: `Why is this recoverable? ${requestBodySecret}`,
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId },
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: Array<{ recordId: string }>;
        deterministicBasis?: string;
        modelExecution?: { mode: string; tokenUsage?: number };
      };

      expect(response.status).toBe(200);
      expect(body.answer).toContain("S6-L1");
      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        tokenUsage: 1842
      });
      expect(calls.filter((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toHaveLength(3);
      expect(memoryRows).toHaveLength(3);
      const queryScope = memoryRows.find((row) => row["category"] === "session_state");
      const caseRecall = memoryRows.find((row) => row["category"] === "case_state");
      const receipt = memoryRows.find((row) => row["category"] === "audit_refs");
      const queryScopePayload = queryScope?.["payload_json"];
      if (queryScope === undefined || !isJsonRecord(queryScopePayload)) {
        throw new Error("Expected Supabase Maya query scope memory receipt.");
      }
      expect(queryScope["id"]).toBe("session:cockpit-run:maya-query-scope");
      expect(queryScope["scope"]).toBe("session:cockpit-run");
      expect(queryScope["trust_level"]).toBe("trusted");
      expect(queryScopePayload).toEqual({
        deterministicBasis: "POST /forensics/query selected evidence scope",
        key: "maya-query-scope",
        memoryType: "maya_short_term_query_scope",
        selectedLineId: "S6-L1",
        selectedRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
        status: "answered"
      });
      expect(JSON.stringify(queryScope)).not.toMatch(/question|amount|dollar|verdict|routing|approval/iu);
      const caseRecallPayload = caseRecall?.["payload_json"];
      if (caseRecall === undefined || !isJsonRecord(caseRecallPayload)) {
        throw new Error("Expected Supabase Maya case recall memory receipt.");
      }
      expect(caseRecall["id"]).toBe("case:S6-L1:maya-recall:cockpit-run:S6-L1");
      expect(caseRecall["scope"]).toBe("case:S6-L1");
      expect(caseRecall["trust_level"]).toBe("trusted");
      expect(caseRecallPayload).toEqual({
        caseId: "S6-L1",
        deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
        key: "maya-case-recall",
        memoryType: "maya_long_term_case_recall",
        selectedLineId: "S6-L1",
        selectedRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
        sessionId: "cockpit-run",
        status: "answered"
      });
      expect(Object.keys(caseRecallPayload).filter((key) => /question|answer|amount|dollar|verdict|routing|approval/iu.test(key))).toEqual(
        []
      );
      expect(JSON.stringify(caseRecall)).not.toMatch(/\$|external action|writeback|approved_by/iu);
      const receiptPayload = receipt?.["payload_json"];
      if (receipt === undefined || !isJsonRecord(receiptPayload)) {
        throw new Error("Expected Supabase token usage memory receipt.");
      }
      const receiptRecordIds = receipt["record_ids_json"];
      const citedRecordIds = receiptPayload["citedRecordIds"];
      if (
        !Array.isArray(receiptRecordIds) ||
        !receiptRecordIds.every((recordId): recordId is string => typeof recordId === "string") ||
        !Array.isArray(citedRecordIds) ||
        !citedRecordIds.every((recordId): recordId is string => typeof recordId === "string")
      ) {
        throw new Error("Expected token usage receipt record IDs.");
      }
      expect(receipt["category"]).toBe("audit_refs");
      expect(receipt["scope"]).toBe("forensics-query:S6-L1");
      expect(receipt["trust_level"]).toBe("trusted");
      expect(receiptRecordIds).toEqual(expect.arrayContaining(["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"]));
      expect(citedRecordIds).toEqual(expect.arrayContaining(body.citations.map((citation) => citation.recordId)));
      expect(receiptPayload).toMatchObject({
        correlationId,
        costStatus: "pricing_not_configured_not_computed",
        deterministicBasis: body.deterministicBasis,
        selectedLineId: "S6-L1",
        submittedRecordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
        tokenCount: 1842
      });
      expect(receiptPayload).not.toHaveProperty("answer");
      expect(receiptPayload).not.toHaveProperty("rawModelText");
      const serializedReceipt = JSON.stringify(receipt);
      expect(serializedReceipt).not.toContain("sk-test-live-query");
      expect(serializedReceipt).not.toContain("supabase-secret-key");
      expect(serializedReceipt).not.toContain("Bearer");
      expect(serializedReceipt).not.toContain(rawModelText);
      expect(serializedReceipt).not.toContain(requestBodySecret);
      expect(serializedReceipt).not.toContain("$");
    } finally {
      await close(server);
    }
  });

  it("keeps successful forensic query responses available when Supabase memory is not selected", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      emitForensicsHandoffReceipts(request);
      return (async function* stream() {
        await Promise.resolve();
        yield* sdkSelectedEvidenceToolEvents(selectedLiveQueryRecordIds(request));
        yield {
          data: {
            delta: "Live query answer candidate suppressed.",
            type: "output_text_delta",
            usage: { total_tokens: 777 }
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });
      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
      forensicsStreamRunner: liveRunner,
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { answer?: string; modelExecution?: { mode: string; tokenUsage?: number } };

      expect(response.status).toBe(200);
      expect(body.answer).toContain("S6-L1");
      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        tokenUsage: 777
      });
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("keeps successful forensic query responses available when optional memory persistence hangs", async () => {
    const correlationId = "maya-query-memory-hang";
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      emitForensicsHandoffReceipts(request);
      return (async function* stream() {
        await Promise.resolve();
        yield* sdkSelectedEvidenceToolEvents(selectedLiveQueryRecordIds(request));
        yield {
          data: {
            delta: "Live query answer candidate suppressed.",
            type: "output_text_delta",
            usage: { total_tokens: 611 }
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (init.method === "POST" && url.includes("/rest/v1/recoup_memory_records")) {
        return new Promise<Response>(() => undefined);
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
      },
      forensicsStreamRunner: liveRunner,
      memoryFetcher
    });

    try {
      const startedAt = Date.now();
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId },
        method: "POST"
      });
      const durationMs = Date.now() - startedAt;
      const body = (await response.json()) as { answer?: string; modelExecution?: { mode: string; tokenUsage?: number } };

      expect(response.status).toBe(200);
      expect(durationMs).toBeLessThan(10_000);
      expect(body.answer).toContain("S6-L1");
      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        tokenUsage: 611
      });
      const warnings = warningSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(warnings).toContain("maya_forensics_query_optional_persistence_timeout");
      expect(warnings).toContain("maya_query_scope_memory");
      expect(warnings).toContain("maya_query_token_usage_receipt");
    } finally {
      warningSpy.mockRestore();
      await close(server);
    }
  }, 15_000);

  it("does not persist success token receipts for blocked forensic query responses", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryRows: Array<Record<string, unknown>> = [];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });
      if (init.method === "POST" && url.includes("/rest/v1/recoup_memory_records")) {
        const row = JSON.parse(body ?? "{}") as Record<string, unknown>;
        memoryRows.push(row);
        return Promise.resolve(new Response(JSON.stringify([row]), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
      },
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: unknown[];
        modelExecution?: { mode: string; reason: string };
        trace: unknown[];
      };

      expect(response.status).toBe(200);
      expect(body.answer).toBeUndefined();
      expect(body.citations).toEqual([]);
      expect(body.trace).toEqual([]);
      expect(body.modelExecution).toMatchObject({
        mode: "blocked_missing_credentials",
        reason: "OPENAI_API_KEY is not configured"
      });
      expect(calls.filter((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toHaveLength(1);
      expect(memoryRows).toHaveLength(1);
      expect(memoryRows[0]).toMatchObject({
        category: "session_state",
        id: "session:cockpit-run:maya-query-scope",
        scope: "session:cockpit-run",
        trust_level: "trusted"
      });
      expect(memoryRows[0]?.["payload_json"]).toMatchObject({
        deterministicBasis: "POST /forensics/query selected evidence scope",
        memoryType: "maya_short_term_query_scope",
        selectedLineId: "S6-L1",
        selectedRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
        status: "blocked"
      });
      expect(memoryRows.some((row) => row["category"] === "audit_refs")).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("skips Maya query scope memory for unsafe submitted record IDs without failing the query", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryRows: Array<Record<string, unknown>> = [];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });
      if (init.method === "POST" && url.includes("/rest/v1/recoup_memory_records")) {
        const row = JSON.parse(body ?? "{}") as Record<string, unknown>;
        memoryRows.push(row);
        return Promise.resolve(new Response(JSON.stringify([row]), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
      },
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "sk-submitted-record-secret", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: unknown[];
        modelExecution?: { mode: string; reason: string };
        trace: unknown[];
      };

      expect(response.status).toBe(200);
      expect(body.answer).toBeUndefined();
      expect(body.citations).toEqual([]);
      expect(body.trace).toEqual([]);
      expect(body.modelExecution).toMatchObject({
        mode: "blocked_live_agent_trace",
        reason: "Deterministic query answer guard blocked the selected evidence response."
      });
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toBe(false);
      expect(memoryRows).toEqual([]);
    } finally {
      await close(server);
    }
  });

  it("keeps successful forensic query responses available and warns when token receipt persistence fails", async () => {
    const correlationId = "maya-query-token-receipt-write-failed";
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      emitForensicsHandoffReceipts(request);
      return (async function* stream() {
        await Promise.resolve();
        yield* sdkSelectedEvidenceToolEvents(selectedLiveQueryRecordIds(request));
        yield {
          data: {
            delta: "Live query answer candidate suppressed.",
            type: "output_text_delta",
            usage: { total_tokens: 913 }
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });

      if (init.method === "POST" && url.includes("/rest/v1/recoup_memory_records")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "supabase memory outage" }), { status: 500 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
      },
      forensicsStreamRunner: liveRunner,
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId },
        method: "POST"
      });
      const body = (await response.json()) as { answer?: string; modelExecution?: { mode: string; tokenUsage?: number } };

      expect(response.status).toBe(200);
      expect(body.answer).toContain("S6-L1");
      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        tokenUsage: 913
      });
      expect(calls.filter((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toHaveLength(3);
      expect(warningSpy).toHaveBeenCalledTimes(1);
      const warning = JSON.parse(String(warningSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(warning).toEqual({
        correlationId,
        event: "maya_forensics_query_token_usage_receipt_write_failed",
        reason: "Supabase memory request failed with HTTP 500.",
        selectedLineId: "S6-L1"
      });
      const serializedWarning = JSON.stringify(warning);
      expect(serializedWarning).not.toContain("sk-test-live-query");
      expect(serializedWarning).not.toContain("supabase-secret-key");
      expect(serializedWarning).not.toContain("Why is this recoverable?");
    } finally {
      warningSpy.mockRestore();
      await close(server);
    }
  });

  it("rate limits configured audit agent endpoints by route and verified principal before downstream work", async () => {
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        RECOUP_COCKPIT_RATE_LIMIT_MAX_REQUESTS: "1",
        RECOUP_COCKPIT_RATE_LIMIT_WINDOW_MS: "60000",
        RECOUP_DATA_MODE: "real-backend"
      },
      forensicsStreamRunner: liveRunner
    });
    const queryBody = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    });
    const runBody = JSON.stringify({ runType: "forensics", seed: 42 });
    const approvalBody = JSON.stringify({ actionId: "missing-action", decision: "approve" });

    try {
      const firstQuery = await fetch(`${baseUrl}/forensics/query`, {
        body: queryBody,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const limitedQuery = await fetch(`${baseUrl}/forensics/query`, {
        body: queryBody,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      expect(firstQuery.status).toBe(200);
      expect(limitedQuery.status).toBe(429);
      expect(await limitedQuery.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "POST /forensics/query"
      });
      expect(liveRunner).toHaveBeenCalledTimes(1);

      const firstRunGet = await fetch(`${baseUrl}/run`, { headers: cockpitAuthHeaders });
      const firstRunGetBody = await firstRunGet.text();
      const limitedRunGet = await fetch(`${baseUrl}/run`, { headers: cockpitAuthHeaders });
      expect(firstRunGet.status).toBe(200);
      expect(firstRunGetBody).toContain("event: verdict");
      expect(limitedRunGet.status).toBe(429);
      expect(await limitedRunGet.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "GET /run"
      });

      const firstRunPost = await fetch(`${baseUrl}/run`, {
        body: runBody,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const firstRunPostBody = await firstRunPost.text();
      const limitedRunPost = await fetch(`${baseUrl}/run`, {
        body: runBody,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      expect(firstRunPost.status).toBe(200);
      expect(firstRunPostBody).toContain("event: verdict");
      expect(limitedRunPost.status).toBe(429);
      expect(await limitedRunPost.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "POST /run"
      });

      const firstApproval = await fetch(`${baseUrl}/approval`, {
        body: approvalBody,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const limitedApproval = await fetch(`${baseUrl}/approval`, {
        body: approvalBody,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      expect(firstApproval.status).not.toBe(429);
      expect(limitedApproval.status).toBe(429);
      expect(await limitedApproval.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "POST /approval"
      });
    } finally {
      await close(server);
    }
  }, 15000);

  it("does not let unauthenticated /run bypass rate limits by rotating forwarded headers", async () => {
    const backendCalls: string[] = [];
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          OPENAI_API_KEY: "sk-test-secret",
          RECOUP_COCKPIT_RATE_LIMIT_MAX_REQUESTS: "1",
          RECOUP_COCKPIT_RATE_LIMIT_WINDOW_MS: "60000"
        },
        memoryFetcher: (url, init) => {
          backendCalls.push(url);
          return withGovernedConfigFetcher()(url, init);
        }
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    try {
      const first = await fetch(`${baseUrl}/run`, {
        headers: {
          "x-forwarded-for": "198.51.100.10",
          "x-real-ip": "198.51.100.20"
        }
      });
      const firstBody = await first.text();
      const backendCallsAfterFirst = backendCalls.length;
      const limited = await fetch(`${baseUrl}/run`, {
        headers: {
          "x-forwarded-for": "198.51.100.11",
          "x-real-ip": "198.51.100.21"
        }
      });

      expect(first.status).toBe(200);
      expect(firstBody).toContain("event: verdict");
      expect(backendCallsAfterFirst).toBeGreaterThan(0);
      expect(limited.status).toBe(429);
      expect(limited.headers.get("content-type")).toContain("application/json");
      expect(limited.headers.get("content-type")).not.toContain("text/event-stream");
      expect(await limited.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "GET /run"
      });
      expect(backendCalls).toHaveLength(backendCallsAfterFirst);
    } finally {
      await close(server);
    }
  }, 15000);

  it("does not let signed proxy approval bypass rate limits by rotating forwarded headers", async () => {
    const backendCalls: string[] = [];
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitApprovalEnv,
          RECOUP_COCKPIT_RATE_LIMIT_MAX_REQUESTS: "1",
          RECOUP_COCKPIT_RATE_LIMIT_WINDOW_MS: "60000",
          RECOUP_DEMO_SESSION_SECRET: demoProxySecret
        },
        memoryFetcher: (url, init) => {
          backendCalls.push(url);
          return withGovernedConfigFetcher()(url, init);
        }
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const approvalBody = JSON.stringify({ actionId: "missing-action", decision: "approve" });

    try {
      const first = await fetch(`${baseUrl}/approval`, {
        body: approvalBody,
        headers: {
          ...signedDemoProxyHeaders({
            body: approvalBody,
            nonce: "rate-limit-proxy-nonce-1",
            path: "/approval",
            principal: "human:david-lead",
            purpose: "approval",
            role: "david",
            secret: demoProxySecret
          }),
          "x-forwarded-for": "198.51.100.30"
        },
        method: "POST"
      });
      const backendCallsAfterFirst = backendCalls.length;
      const limited = await fetch(`${baseUrl}/approval`, {
        body: approvalBody,
        headers: {
          ...signedDemoProxyHeaders({
            body: approvalBody,
            nonce: "rate-limit-proxy-nonce-2",
            path: "/approval",
            principal: "human:david-lead",
            purpose: "approval",
            role: "david",
            secret: demoProxySecret
          }),
          "x-forwarded-for": "198.51.100.31"
        },
        method: "POST"
      });

      expect(first.status).not.toBe(429);
      expect(backendCallsAfterFirst).toBeGreaterThan(0);
      expect(limited.status).toBe(429);
      expect(await limited.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "POST /approval"
      });
      expect(backendCalls).toHaveLength(backendCallsAfterFirst);
    } finally {
      await close(server);
    }
  });

  it("does not let trust-proxy request.ip settings make forwarded headers rate-limit identities", async () => {
    const backendCalls: string[] = [];
    const app = createCockpitApi({
      env: {
        ...governedConfigEnv,
        OPENAI_API_KEY: "sk-test-secret",
        RECOUP_COCKPIT_RATE_LIMIT_MAX_REQUESTS: "1",
        RECOUP_COCKPIT_RATE_LIMIT_WINDOW_MS: "60000"
      },
      memoryFetcher: (url, init) => {
        backendCalls.push(url);
        return withGovernedConfigFetcher()(url, init);
      }
    });
    app.set("trust proxy", true);
    const server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const first = await fetch(`${baseUrl}/run`, {
        headers: {
          "x-forwarded-for": "198.51.100.40"
        }
      });
      const firstBody = await first.text();
      const backendCallsAfterFirst = backendCalls.length;
      const limited = await fetch(`${baseUrl}/run`, {
        headers: {
          "x-forwarded-for": "198.51.100.41"
        }
      });

      expect(first.status).toBe(200);
      expect(firstBody).toContain("event: verdict");
      expect(backendCallsAfterFirst).toBeGreaterThan(0);
      expect(limited.status).toBe(429);
      expect(await limited.json()).toEqual({
        error: "Cockpit request rate limit exceeded.",
        route: "GET /run"
      });
      expect(backendCalls).toHaveLength(backendCallsAfterFirst);
    } finally {
      await close(server);
    }
  }, 15000);

  it("fails closed on audit agent endpoints when rate-limit configuration is partial", async () => {
    const { baseUrl, server } = await listen({
      env: {
        RECOUP_COCKPIT_RATE_LIMIT_MAX_REQUESTS: "1"
      }
    });
    try {
      const response = await fetch(`${baseUrl}/run`);
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
      expect(JSON.parse(body)).toEqual({
        error: "Cockpit request rate limit configuration invalid.",
        route: "GET /run"
      });
    } finally {
      await close(server);
    }
  });

  it("reuses a validated real-backend source context across consecutive forensic query sessions", async () => {
    const calls: string[] = [];
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitAuthEnv,
          OPENAI_API_KEY: "sk-test-live-query",
          RECOUP_DATA_MODE: "real-backend",
          RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "60000"
        },
        forensicsStreamRunner: liveRunner,
        memoryFetcher: sapEvidenceFailsAfterInitialValidatedContextFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const body = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    });

    try {
      const first = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const second = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const firstBody = (await first.json()) as { answer?: string };
      const secondBody = (await second.json()) as { answer?: string; missingSource?: string };
      const sapSourceReads = calls.filter((url) => url.includes("/rest/v1/recoup_src_sap"));

      expect(first.status).toBe(200);
      expect(firstBody.answer).toContain("S6-L1");
      expect(second.status).toBe(200);
      expect(secondBody.answer).toContain("S6-L1");
      expect(secondBody.missingSource).toBeUndefined();
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(sapSourceReads).toHaveLength(expectedSourceReads);
    } finally {
      await close(server);
    }
  });

  it("hydrates Maya forensics source evidence without duplicate per-line Supabase reads", async () => {
    const calls: string[] = [];
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitAuthEnv,
          RECOUP_DATA_MODE: "real-backend",
          RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "0"
        },
        memoryFetcher: successfulRealBackendSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const response = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const body = (await response.json()) as { surface?: string };

      expect(response.status).toBe(200);
      expect(body.surface).toBe("forensics-analyst");
      expect(sourceTableReadCount(calls, "recoup_src_sap")).toBe(expectedSourceReads);
      expect(sourceTableReadCount(calls, "recoup_src_docs")).toBe(expectedSourceReads);
      expect(sourceTableReadCount(calls, "recoup_src_tpm")).toBe(expectedSourceReads);
      expect(sourceTableReadCount(calls, "recoup_src_bureau")).toBe(expectedSourceReads);
    } finally {
      await close(server);
    }
  });

  it("hydrates optional OpenAI vector evidence only when the RAG env gate is complete", async () => {
    const missingGateCalls: string[] = [];
    const blockedVectorFetcher = vi.fn(() =>
      Promise.reject(new Error("OpenAI vector store fetcher should not be called without a vector store id."))
    );
    const missingGate = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "0"
      },
      memoryFetcher: successfulRealBackendSourceFetcher(missingGateCalls),
      openAiVectorStoreFetcher: blockedVectorFetcher
    });
    try {
      const response = await fetch(`${missingGate.baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const body = (await response.json()) as { surface?: string };

      expect(response.status).toBe(200);
      expect(body.surface).toBe("forensics-analyst");
      expect(blockedVectorFetcher).not.toHaveBeenCalled();
    } finally {
      await close(missingGate.server);
    }

    const vectorSearchCalls: Array<{ init: RequestInit; url: string }> = [];
    const enabledGate = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs_evidence_test",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "0"
      },
      memoryFetcher: successfulRealBackendSourceFetcher([]),
      openAiVectorStoreFetcher: (url, init) => {
        vectorSearchCalls.push({ init, url });
        return Promise.resolve(vectorStoreSearchResponseForS6());
      }
    });
    try {
      const response = await fetch(`${enabledGate.baseUrl}/forensics/work-items/S6-L1`, { headers: cockpitAuthHeaders });
      const body = (await response.json()) as {
        selected?: {
          evidencePack?: {
            documents: Array<{
              documentId: string;
              provenance: { deterministicBasis: string; sourceKind: string; sourceName: string };
              retrieval?: {
                fileName: string;
                mode: string;
                provenance: string;
                score: number;
                vectorStoreId: string;
              };
              sourceLabel: string;
            }>;
          };
        };
        surface?: string;
      };
      const firstVectorSearch = vectorSearchCalls[0];
      const firstRequestBody = firstVectorSearch?.init.body;
      const vectorDocument = body.selected?.evidencePack?.documents.find(
        (document) => document.documentId === "file-vector-runtime-contract"
      );

      expect(response.status).toBe(200);
      expect(body.surface).toBe("forensics-work-item-detail");
      expect(vectorSearchCalls).toHaveLength(buildSyntheticDataset({ seed: 42 }).deductionLines.length);
      expect(firstVectorSearch?.url).toBe("https://api.openai.com/v1/vector_stores/vs_evidence_test/search");
      expect(firstVectorSearch?.init).toMatchObject({
        headers: {
          authorization: "Bearer sk-test-live-query",
          "content-type": "application/json"
        },
        method: "POST"
      });
      expect(typeof firstRequestBody).toBe("string");
      const firstBody = JSON.parse(firstRequestBody as string) as { max_num_results?: number; query?: string };
      expect(firstBody.max_num_results).toBe(5);
      expect(firstBody.query).toContain("customer:");
      expect(firstBody.query).toContain("deduction:");
      expect(firstBody.query).toContain("scenario:");
      expect(vectorDocument).toMatchObject({
        documentId: "file-vector-runtime-contract",
        provenance: {
          sourceKind: "derived_backend",
          sourceName: "OpenAI vector store semantic retrieval"
        },
        retrieval: {
          fileName: "pricing-clause.pdf",
          mode: "semantic-vector",
          provenance: "openai-vector-store",
          score: 0.91,
          vectorStoreId: "vs_evidence_test"
        },
        sourceLabel: "OpenAI vector store"
      });
      expect(vectorDocument?.provenance.deterministicBasis).toContain("OpenAI vector store semantic retrieval");
      expect(vectorDocument?.provenance.deterministicBasis).toContain("vs_evidence_test");
    } finally {
      await close(enabledGate.server);
    }
  });

  it("force-refreshes Maya forensics by invalidating the cached source context", async () => {
    const calls: string[] = [];
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitAuthEnv,
          RECOUP_DATA_MODE: "real-backend",
          RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "60000"
        },
        memoryFetcher: successfulRealBackendSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const first = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const refreshed = await fetch(`${baseUrl}/forensics/refresh`, {
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const firstBody = (await first.json()) as { surface?: string };
      const refreshedBody = (await refreshed.json()) as { surface?: string };

      expect(first.status).toBe(200);
      expect(firstBody.surface).toBe("forensics-analyst");
      expect(refreshed.status).toBe(200);
      expect(refreshed.headers.get("cache-control")).toBe("no-store");
      expect(refreshedBody.surface).toBe("forensics-analyst");
      expect(sourceTableReadCount(calls, "recoup_src_sap")).toBe(expectedSourceReads * 2);
      expect(sourceTableReadCount(calls, "recoup_src_docs")).toBe(expectedSourceReads * 2);
      expect(sourceTableReadCount(calls, "recoup_src_tpm")).toBe(expectedSourceReads * 2);
      expect(sourceTableReadCount(calls, "recoup_src_bureau")).toBe(expectedSourceReads * 2);
    } finally {
      await close(server);
    }
  });

  it("fails closed on force refresh instead of serving a stale cached model when source rows fail", async () => {
    const calls: string[] = [];
    let sapRowsAvailable = true;
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitAuthEnv,
          RECOUP_DATA_MODE: "real-backend",
          RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "60000"
        },
        memoryFetcher: sourceFetcherWithSapAvailability(calls, () => sapRowsAvailable)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const first = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const firstBody = (await first.json()) as { surface?: string };
      sapRowsAvailable = false;
      const refreshed = await fetch(`${baseUrl}/forensics/refresh`, {
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const refreshedBody = (await refreshed.json()) as { missingSource?: string; sourceTableName?: string; surface?: string };

      expect(first.status).toBe(200);
      expect(firstBody.surface).toBe("forensics-analyst");
      expect(refreshed.status).toBe(503);
      expect(refreshedBody).toMatchObject({
        missingSource: "supabase-sap-source-evidence-rows",
        sourceTableName: "recoup_src_sap"
      });
      expect(refreshedBody.surface).toBeUndefined();
      expect(sourceTableReadCount(calls, "recoup_src_sap")).toBe(expectedForensicsSourceTableReads() + 1);

      const cachedAfterFailedRefresh = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const cachedAfterFailedRefreshBody = (await cachedAfterFailedRefresh.json()) as { missingSource?: string; surface?: string };

      expect(cachedAfterFailedRefresh.status).toBe(200);
      expect(cachedAfterFailedRefreshBody.surface).toBe("forensics-analyst");
      expect(cachedAfterFailedRefreshBody.missingSource).toBeUndefined();
      expect(sourceTableReadCount(calls, "recoup_src_sap")).toBe(expectedForensicsSourceTableReads() + 1);
    } finally {
      await close(server);
    }
  });

  it("does not reuse a validated forensic query source context after the technical TTL expires", async () => {
    const calls: string[] = [];
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitAuthEnv,
          OPENAI_API_KEY: "sk-test-live-query",
          RECOUP_DATA_MODE: "real-backend",
          RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "0"
        },
        forensicsStreamRunner: liveRunner,
        memoryFetcher: successfulRealBackendSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const body = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    });

    try {
      const first = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const second = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const firstBody = (await first.json()) as { answer?: string };
      const secondBody = (await second.json()) as { answer?: string };
      const sapSourceReads = calls.filter((url) => url.includes("/rest/v1/recoup_src_sap"));

      expect(first.status).toBe(200);
      expect(firstBody.answer).toContain("S6-L1");
      expect(second.status).toBe(200);
      expect(secondBody.answer).toContain("S6-L1");
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(sapSourceReads).toHaveLength(expectedSourceReads * 2);
    } finally {
      await close(server);
    }
  });

  it("expires forensic query source context after the capped technical TTL elapses", async () => {
    const calls: string[] = [];
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const nowSpy = vi.spyOn(Date, "now");
    let nowMs = 1_000_000;
    nowSpy.mockImplementation(() => nowMs);
    const server = createServer(
      createCockpitApi({
        env: {
          ...governedConfigEnv,
          ...cockpitAuthEnv,
          OPENAI_API_KEY: "sk-test-live-query",
          RECOUP_DATA_MODE: "real-backend",
          RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "60000"
        },
        forensicsStreamRunner: liveRunner,
        memoryFetcher: successfulRealBackendSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const body = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    });

    try {
      const first = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      nowMs += 31_000;
      const second = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const firstBody = (await first.json()) as { answer?: string };
      const secondBody = (await second.json()) as { answer?: string };
      const sapSourceReads = calls.filter((url) => url.includes("/rest/v1/recoup_src_sap"));

      expect(first.status).toBe(200);
      expect(firstBody.answer).toContain("S6-L1");
      expect(second.status).toBe(200);
      expect(secondBody.answer).toContain("S6-L1");
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(sapSourceReads).toHaveLength(expectedSourceReads * 2);
    } finally {
      nowSpy.mockRestore();
      await close(server);
    }
  });

  it("invalidates forensic query source context when the Supabase source identity changes", async () => {
    const calls: string[] = [];
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const mutableEnv = {
      ...governedConfigEnv,
      ...cockpitAuthEnv,
      OPENAI_API_KEY: "sk-test-live-query",
      RECOUP_DATA_MODE: "real-backend",
      RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "60000",
      SUPABASE_URL: "https://recoup-a.supabase.co"
    };
    const server = createServer(
      createCockpitApi({
        env: mutableEnv,
        forensicsStreamRunner: liveRunner,
        memoryFetcher: successfulRealBackendSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const body = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    });

    try {
      const first = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      mutableEnv.SUPABASE_URL = "https://recoup-b.supabase.co";
      const second = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const firstBody = (await first.json()) as { answer?: string };
      const secondBody = (await second.json()) as { answer?: string };
      const sapSourceReads = calls.filter((url) => url.includes("/rest/v1/recoup_src_sap"));

      expect(first.status).toBe(200);
      expect(firstBody.answer).toContain("S6-L1");
      expect(second.status).toBe(200);
      expect(secondBody.answer).toContain("S6-L1");
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(sapSourceReads).toHaveLength(expectedSourceReads * 2);
    } finally {
      await close(server);
    }
  });

  it("does not cache a failed initial real-backend SAP source validation", async () => {
    const calls: string[] = [];
    let sapRowsAvailable = false;
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
        forensicsStreamRunner: liveRunner,
        memoryFetcher: recoverableSapEvidenceSourceFetcher(calls, () => sapRowsAvailable)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const body = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1"
    });

    try {
      const failed = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const failedBody = (await failed.json()) as { missingSource?: string; sourceTableName?: string };
      sapRowsAvailable = true;
      const retried = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const retriedBody = (await retried.json()) as { answer?: string; missingSource?: string };
      const sapSourceReads = calls.filter((url) => url.includes("/rest/v1/recoup_src_sap"));

      expect(failed.status).toBe(503);
      expect(failedBody).toMatchObject({
        missingSource: "supabase-sap-source-evidence-rows",
        sourceTableName: "recoup_src_sap"
      });
      expect(retried.status).toBe(200);
      expect(retriedBody.answer).toContain("S6-L1");
      expect(retriedBody.missingSource).toBeUndefined();
      expect(liveRunner).toHaveBeenCalledTimes(1);
      expect(sapSourceReads).toHaveLength(expectedSourceReads + 1);
    } finally {
      await close(server);
    }
  });

  it("does not cache HTTP 200 source contexts with incomplete supporting evidence rows", async () => {
    const calls: string[] = [];
    let docsRowsAvailable = false;
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const expectedSourceReads = expectedForensicsSourceTableReads();
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
        forensicsStreamRunner: liveRunner,
        memoryFetcher: recoverablePartialDocsEvidenceSourceFetcher(calls, () => docsRowsAvailable)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;
    const body = JSON.stringify({
      question: "Why is this recoverable?",
      recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1", "SAP-INV-S3-1"],
      selectedLineId: "S3-L1"
    });

    try {
      const failed = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const failedBody = (await failed.json()) as { missingSource?: string };
      docsRowsAvailable = true;
      const retried = await fetch(`${baseUrl}/forensics/query`, {
        body,
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const retriedBody = (await retried.json()) as { answer?: string; missingSource?: string };
      const docsSourceReads = calls.filter((url) => url.includes("/rest/v1/recoup_src_docs"));

      expect(failed.status).toBe(503);
      expect(failedBody.missingSource).toBe("supabase-source-evidence-rows");
      expect(retried.status).toBe(200);
      expect(retriedBody.answer).toContain("S3-L1");
      expect(retriedBody.missingSource).toBeUndefined();
      expect(liveRunner).toHaveBeenCalledTimes(1);
      expect(docsSourceReads).toHaveLength(expectedSourceReads * 2);
    } finally {
      await close(server);
    }
  });

  it("keeps risk-required approval source loading separate from the forensic query cache", async () => {
    const calls: string[] = [];
    const liveRunner = liveQueryRunnerWithForensicsHandoff();
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitApprovalEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
        forensicsStreamRunner: liveRunner,
        memoryFetcher: riskObservationMissingAfterForensicsCacheFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const query = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: "draft-rebill:S6-L1",
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approvalBody = (await approval.json()) as { missingSource?: string };
      const riskSourceReads = calls.filter((url) => isToolsDataRiskObservationUrl(url));

      expect(query.status).toBe(200);
      expect(approval.status).toBe(503);
      expect(approvalBody.missingSource).toBe("supabase-tools-data-risk-observation-rows");
      expect(riskSourceReads.length).toBeGreaterThan(0);
      expect(liveRunner).toHaveBeenCalledTimes(1);
    } finally {
      await close(server);
    }
  });

  it("fails closed for forensic query sessions when live OpenAI agent execution is unavailable", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: unknown[];
        modelExecution?: { mode: string; reason: string };
        trace: unknown[];
      };

      expect(response.status).toBe(200);
      expect(body.answer).toBeUndefined();
      expect(body.citations).toEqual([]);
      expect(body.trace).toEqual([]);
      expect(body.modelExecution).toEqual({
        deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
        mode: "blocked_missing_credentials",
        reason: "OPENAI_API_KEY is not configured"
      });
    } finally {
      await close(server);
    }
  });

  it("uses query run-control turns and retry cap for forensic query live agents", async () => {
    let callCount = 0;
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      callCount += 1;
      expect(request.maxTurns).toBe(12);
      expect(request.input).toContain("Selected Maya forensics query");

      if (callCount === 1) {
        const failure = new Error("temporary live query failure");
        return (async function* stream() {
          await Promise.resolve();
          if (failure.message.length > 0) {
            throw failure;
          }
          yield undefined;
        })();
      }

      emitForensicsHandoffReceipts(request);
      return liveQueryDeltaStream("Retried live query answer candidate suppressed.", selectedLiveQueryRecordIds(request));
    });
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
      forensicsStreamRunner: liveRunner
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { answer?: string; modelExecution?: { mode: string } };

      expect(response.status).toBe(200);
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(body.answer).toContain("S6-L1");
      expect(body.modelExecution?.mode).toBe("live_openai_agents");
    } finally {
      await close(server);
    }
  });

  it("includes trusted Maya case recall in live forensic query input only when explicitly enabled", async () => {
    const calls: string[] = [];
    const sourceFetcher = successfulRealBackendSourceFetcher(calls);
    const memoryRows = [
      {
        category: "case_state",
        created_at: "2026-06-28T00:00:00.000Z",
        id: "case:S6-L1:maya-recall:maya-session-42:S6-L1",
        payload_json: {
          caseId: "S6-L1",
          deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
          key: "maya-case-recall",
          memoryType: "maya_long_term_case_recall",
          selectedLineId: "S6-L1",
          selectedRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          sessionId: "maya-session-42",
          status: "answered"
        },
        record_ids_json: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
        scope: "case:S6-L1",
        trust_level: "trusted"
      }
    ];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push(`${init.method ?? "GET"} ${url}`);
      if (url.includes("/rest/v1/recoup_memory_records") && init.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(memoryRows), { status: 200 }));
      }
      if (url.includes("/rest/v1/recoup_memory_records") && init.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 201 }));
      }

      return sourceFetcher(url, init);
    };
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      expect(request.input).toContain("Trusted governed Maya memory recall.");
      expect(request.input).toContain("Recall is advisory-only");
      expect(request.input).toContain("Memory record IDs: case:S6-L1:maya-recall:maya-session-42:S6-L1.");
      expect(request.input).toContain("Recalled evidence record IDs: S6-L1, INV-S6-1, SAP-INV-S6-1, PRICE-CLAUSE-1.");
      expect(request.input).not.toContain("$");
      emitForensicsHandoffReceipts(request);
      return liveQueryDeltaStream("Recall-aware live query answer candidate suppressed.", selectedLiveQueryRecordIds(request));
    });
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_MAYA_QUERY_MEMORY_RECALL: "enabled",
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
      },
      forensicsStreamRunner: liveRunner,
      memoryFetcher
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: { ...cockpitAuthHeaders, "x-recoup-session-id": "maya-session-42" },
        method: "POST"
      });
      const body = (await response.json()) as { answer?: string; modelExecution?: { mode: string } };

      expect(response.status).toBe(200);
      expect(body.answer).toContain("S6-L1");
      expect(body.modelExecution?.mode).toBe("live_openai_agents");
      expect(calls.some((call) => call.includes("scope=eq.case%3AS6-L1"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("fails closed for forensic query sessions when query token budget is exceeded", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      emitForensicsHandoffReceipts(request);
      return (async function* stream() {
        await Promise.resolve();
        yield* sdkSelectedEvidenceToolEvents(selectedLiveQueryRecordIds(request));
        yield {
          data: {
            delta: "Token overrun live query answer candidate suppressed.",
            type: "output_text_delta",
            usage: { total_tokens: 32_001 }
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
      forensicsStreamRunner: liveRunner
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: unknown[];
        modelExecution?: { mode: string; reason: string };
        trace: unknown[];
      };

      expect(response.status).toBe(200);
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(body.answer).toBeUndefined();
      expect(body.citations).toEqual([]);
      expect(body.trace).toEqual([]);
      expect(body.modelExecution).toEqual({
        deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
        mode: "blocked_live_agent_trace",
        reason: "Live Agents SDK trace did not complete for the Maya query."
      });
    } finally {
      await close(server);
    }
  });

  it("fails closed for forensic query sessions when live agents complete without the Recovery handoff", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return liveQueryDeltaStream("No-handoff live query answer candidate suppressed.");
    });
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-live-query", RECOUP_DATA_MODE: "real-backend" },
      forensicsStreamRunner: liveRunner
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        answer?: string;
        citations: unknown[];
        modelExecution?: { mode: string; reason: string };
        trace: unknown[];
      };

      expect(response.status).toBe(200);
      expect(liveRunner).toHaveBeenCalledTimes(1);
      expect(body.answer).toBeUndefined();
      expect(body.citations).toEqual([]);
      expect(body.trace).toEqual([]);
      expect(body.modelExecution).toEqual({
        deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
        mode: "blocked_live_agent_trace",
        reason: "Live Agents SDK trace did not include the required Forensics-to-Recovery handoff."
      });
    } finally {
      await close(server);
    }
  });

  it("rejects malformed forensic query requests before orchestration", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: [],
          selectedLineId: "S6-L1"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(body.error).toBe("Forensics query selected recordIds are required.");
    } finally {
      await close(server);
    }
  });

  it("requires verified human auth for forensic query sessions", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["S6-L1"],
          selectedLineId: "S6-L1"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(401);
      expect(body.error).toBe("Verified human cockpit auth required.");
    } finally {
      await close(server);
    }
  });

  it("returns 404 when forensic query selected line is unknown", async () => {
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const response = await fetch(`${baseUrl}/forensics/query`, {
        body: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: ["NO-SUCH-LINE"],
          selectedLineId: "NO-SUCH-LINE"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { error: string; lineId: string };

      expect(response.status).toBe(404);
      expect(body).toEqual({
        error: "Forensics query selected line not found.",
        lineId: "NO-SUCH-LINE"
      });
    } finally {
      await close(server);
    }
  });

  it("selects fixture Forensics only when RECOUP_DATA_MODE is fixture", async () => {
    const fixture = await listenWithoutGovernedConfig({
      env: { RECOUP_DATA_MODE: "fixture" }
    });
    try {
      const fixtureResponse = await fetch(`${fixture.baseUrl}/forensics`);
      const fixtureBody = (await fixtureResponse.json()) as {
        surface?: string;
        worklist?: unknown[];
      };

      expect(fixtureResponse.status).toBe(200);
      expect(fixtureBody.surface).toBe("forensics-analyst");
      expect(fixtureBody.worklist?.length).toBeGreaterThan(0);
    } finally {
      await close(fixture.server);
    }

    const correlationId = "test-correlation-real-backend-no-fixture-startup";
    const realBackend = await listenWithoutGovernedConfig({
      env: { ...cockpitAuthEnv, RECOUP_DATA_MODE: "real-backend" }
    });
    try {
      const modelResponse = await fetch(`${realBackend.baseUrl}/forensics`, {
        headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId }
      });
      const body = (await modelResponse.json()) as {
        correlationId: string;
        error: string;
        missingSource: string;
        surface?: string;
      };

      expect(modelResponse.status).toBe(503);
      expect(body).toEqual({
        correlationId,
        error: "Supabase recoup_config is required for governed runtime values.",
        missingSource: "supabase-recoup-config"
      });
      expect(body.surface).toBeUndefined();
      expect(modelResponse.headers.get(recoupCorrelationIdHeader)).toBe(correlationId);
    } finally {
      await close(realBackend.server);
    }
  });

  it("defaults unset, empty, and invalid RECOUP_DATA_MODE to real-backend fail-closed behavior", async () => {
    for (const [label, env] of [
      ["unset", {}],
      ["empty", { RECOUP_DATA_MODE: "" }],
      ["invalid", { RECOUP_DATA_MODE: "demo" }]
    ] as const) {
      const correlationId = `test-correlation-mode-default-${label}`;
      const { baseUrl, server } = await listenWithoutGovernedConfig({ env: { ...cockpitAuthEnv, ...env } });
      try {
        const modelResponse = await fetch(`${baseUrl}/forensics`, {
          headers: { ...cockpitAuthHeaders, [recoupCorrelationIdHeader]: correlationId }
        });
        const body = (await modelResponse.json()) as { correlationId: string; error: string; missingSource: string };

        expect(modelResponse.status).toBe(503);
        expect(body).toEqual({
          correlationId,
          error: "Supabase recoup_config is required for governed runtime values.",
          missingSource: "supabase-recoup-config"
        });
      } finally {
        await close(server);
      }
    }
  });

  it("reports source evidence missing after successful risk observation load", async () => {
    const calls: string[] = [];
    const correlationId = "test-correlation-risk-ok-evidence-missing";
    const server = createServer(
      createCockpitApi({
        env: { ...governedConfigEnv, ...cockpitApprovalEnv, RECOUP_DATA_MODE: "real-backend" },
        memoryFetcher: missingEvidenceAfterRiskObservationFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: "draft-rebill:S3-L1",
          decision: "approve"
        }),
        headers: {
          ...cockpitAuthHeaders,
          [recoupCorrelationIdHeader]: correlationId
        },
        method: "POST"
      });
      const body = (await response.json()) as { correlationId: string; error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toEqual({
        correlationId,
        error: "Supabase source evidence rows are unavailable or failed validation.",
        missingSource: "supabase-source-evidence-rows"
      });
      expect(calls.some((url) => url.includes("/rest/v1/customers"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_docs"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("serves David Risk Mesh hold and terms approval decisions through REST", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    try {
      const modelResponse = await fetch(`${baseUrl}/credit`);
      const model = (await modelResponse.json()) as {
        approvalInbox: Array<{
          actionId: string;
          actionLabel: string;
          actionType: string;
          status: string;
        }>;
        surface: string;
      };
      const holdAction = model.approvalInbox.find((action) => action.actionId === "propose-hold:6534");
      const termsAction = model.approvalInbox.find((action) => action.actionType === "propose-terms");

      expect(modelResponse.status).toBe(200);
      expect(model.surface).toBe("credit-arbitration");
      expect(holdAction).toMatchObject({
        actionId: "propose-hold:6534",
        status: "pending_human"
      });
      expect(termsAction?.actionId).toBe("propose-terms:CUST-HARBOR");

      const unauthenticated = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: holdAction?.actionId,
          decision: "approve"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const missingReasonBody = JSON.stringify({
        actionId: termsAction?.actionId,
        decision: "modify"
      });
      const missingReason = await fetch(`${baseUrl}/approval`, {
        body: missingReasonBody,
        headers: signedDemoProxyHeaders({
          body: missingReasonBody,
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });

      expect(unauthenticated.status).toBe(401);
      expect(missingReason.status).toBe(400);

      const holdApprovalBody = JSON.stringify({
        actionId: holdAction?.actionId,
        decision: "approve"
      });
      const holdApprovalResponse = await fetch(`${baseUrl}/approval`, {
        body: holdApprovalBody,
        headers: signedDemoProxyHeaders({
          body: holdApprovalBody,
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });
      const termsApprovalBody = JSON.stringify({
        actionId: termsAction?.actionId,
        decision: "approve"
      });
      const termsApprovalResponse = await fetch(`${baseUrl}/approval`, {
        body: termsApprovalBody,
        headers: signedDemoProxyHeaders({
          body: termsApprovalBody,
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });
      const holdApproval = (await holdApprovalResponse.json()) as {
        actionId: string;
        approverId: string;
        auditEntryHash: string;
        decision: string;
        status: string;
      };
      const termsApproval = (await termsApprovalResponse.json()) as {
        actionId: string;
        approverId: string;
        auditEntryHash: string;
        decision: string;
        status: string;
      };

      expect(holdApprovalResponse.status).toBe(200);
      expect(holdApproval).toMatchObject({
        actionId: "propose-hold:6534",
        approverId: "human:david-lead",
        decision: "approve",
        status: "human_decided"
      });
      expect(holdApproval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);
      expect(termsApprovalResponse.status).toBe(200);
      expect(termsApproval).toMatchObject({
        actionId: "propose-terms:CUST-HARBOR",
        approverId: "human:david-lead",
        decision: "approve",
        status: "human_decided"
      });
      expect(termsApproval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await close(server);
    }
  });

  it("serves David Sentinel source records from Supabase Tools_data through REST", async () => {
    const supabaseCalls: string[] = [];
    const { baseUrl, server } = await listen({
      memoryFetcher: toolsDataRiskObservationFetcher(supabaseCalls)
    });
    try {
      const modelResponse = await fetch(`${baseUrl}/credit`);
      const model = (await modelResponse.json()) as {
        sentinel: {
          recordIds: string[];
          signals: Array<{ label: string; value: string }>;
        };
        surface: string;
      };

      expect(modelResponse.status).toBe(200);
      expect(model.surface).toBe("credit-arbitration");
      expect(model.sentinel.recordIds).toEqual(
        expect.arrayContaining(["90000036", "90000085", "BUREAU-HARBOR-TAX-LIEN"])
      );
      expect(model.sentinel.signals).toContainEqual({ label: "DSO drift", value: "32 -> 51 days" });
      expect(supabaseCalls.some((url) => url.includes("/rest/v1/customers"))).toBe(true);
      expect(supabaseCalls.some((url) => url.includes("/rest/v1/payments"))).toBe(true);
      expect(supabaseCalls.some((url) => url.includes("/rest/v1/bureau_alerts"))).toBe(true);
      expect(supabaseCalls.some((url) => url.includes("/rest/v1/credit_decisions"))).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("fails closed instead of serving static Sentinel records when Supabase Tools_data rows are missing", async () => {
    const supabaseCalls: string[] = [];
    const { baseUrl, server } = await listen({
      memoryFetcher: missingToolsDataRiskObservationFetcher(supabaseCalls)
    });
    try {
      for (const route of ["/credit", "/cfo", "/trace"]) {
        const modelResponse = await fetch(`${baseUrl}${route}`);
        const body = (await modelResponse.json()) as { error: string };

        expect(modelResponse.status).toBe(503);
        expect(body.error).toBe("Supabase Tools_data risk observation rows are unavailable or failed validation.");
      }

      expect(supabaseCalls.some((url) => url.includes("/rest/v1/customers"))).toBe(true);
      expect(supabaseCalls.some((url) => url.includes("/rest/v1/credit_decisions"))).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("requires verified human auth before accepting approval decisions", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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
      const unlistedHumanResponse = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          decision: "approve"
        }),
        headers: {
          ...cockpitAuthHeaders,
          "x-recoup-human-principal": "human:unlisted-operator"
        },
        method: "POST"
      });

      expect(response.status).toBe(401);
      expect(result.error).toBe("Verified human cockpit auth required.");
      expect(unlistedHumanResponse.status).toBe(401);
    } finally {
      await close(server);
    }
  });

  it("rejects cross-origin approval attempts outside the configured cockpit allowlist", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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

  it("allows the cockpit run session id header through CORS preflight", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });

    try {
      const response = await fetch(`${baseUrl}/run`, {
        headers: {
          "access-control-request-headers": "x-recoup-session-id",
          "access-control-request-method": "GET",
          origin: cockpitAuthEnv.RECOUP_COCKPIT_ALLOWED_ORIGINS
        },
        method: "OPTIONS"
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-headers")).toContain("x-recoup-session-id");
    } finally {
      await close(server);
    }
  });

  it("rejects non-human approval identities at the API boundary", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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

  it("rejects role-derived principals that do not match the configured direct API principal", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const model = (await modelResponse.json()) as {
        actionInbox: Array<{ actionId: string }>;
      };
      const action = model.actionInbox[6];
      if (action === undefined) {
        throw new Error("Forensics model must expose a seventh approval item.");
      }

      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId: action.actionId,
          decision: "approve"
        }),
        headers: {
          "content-type": "application/json",
          "x-recoup-human-principal": "human:cfo-lead",
          "x-recoup-human-token": cockpitAuthEnv.RECOUP_COCKPIT_AUTH_TOKEN
        },
        method: "POST"
      });

      expect(response.status).toBe(401);
    } finally {
      await close(server);
    }
  });

  it("accepts a signed David server-proxy approval while the direct API principal remains Maya", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    try {
      const actionId = "draft-rebill:S3-L4";
      const principal = "human:david-lead";
      const body = JSON.stringify({
        actionId,
        decision: "approve"
      });
      const response = await fetch(`${baseUrl}/approval`, {
        body,
        headers: signedDemoProxyHeaders({
          body,
          path: "/approval",
          principal,
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });
      const approval = (await response.json()) as { actionId: string; approverId: string; status: string };

      expect(response.status).toBe(200);
      expect(approval).toMatchObject({
        actionId,
        approverId: principal,
        status: "human_decided"
      });
    } finally {
      await close(server);
    }
  });

  it("rejects signed CFO server-proxy approval attempts", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    try {
      const principal = "human:cfo-lead";
      const body = JSON.stringify({
        actionId: "draft-rebill:S7-L2",
        decision: "approve"
      });
      const response = await fetch(`${baseUrl}/approval`, {
        body,
        headers: signedDemoProxyHeaders({
          body,
          path: "/approval",
          principal,
          purpose: "approval",
          role: "cfo",
          secret: demoProxySecret
        }),
        method: "POST"
      });

      expect(response.status).toBe(401);
    } finally {
      await close(server);
    }
  });

  it("rejects a signed proxy proof when the approval body is changed after signing", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    try {
      const signedBody = JSON.stringify({
        actionId: "draft-rebill:S8-L1",
        decision: "approve"
      });
      const tamperedBody = JSON.stringify({
        actionId: "draft-rebill:S8-L2",
        decision: "approve"
      });
      const response = await fetch(`${baseUrl}/approval`, {
        body: tamperedBody,
        headers: signedDemoProxyHeaders({
          body: signedBody,
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });

      expect(response.status).toBe(401);
    } finally {
      await close(server);
    }
  });

  it("rejects replayed signed proxy proof for approval requests", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    try {
      const body = JSON.stringify({
        actionId: "draft-rebill:S8-L1",
        decision: "approve"
      });
      const headers = signedDemoProxyHeaders({
        body,
        nonce: "replay-proof-nonce",
        path: "/approval",
        principal: "human:david-lead",
        purpose: "approval",
        role: "david",
        secret: demoProxySecret
      });
      const first = await fetch(`${baseUrl}/approval`, {
        body,
        headers,
        method: "POST"
      });
      const second = await fetch(`${baseUrl}/approval`, {
        body,
        headers,
        method: "POST"
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(401);
    } finally {
      await close(server);
    }
  });

  it("evicts consumed signed proxy nonces after the verifier freshness window", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const firstIssuedAt = new Date("2026-06-25T12:00:00.000Z");
      const nonce = "ttl-cleanup-proof-nonce";
      const firstBody = JSON.stringify({
        actionId: "draft-rebill:S8-L1",
        decision: "approve"
      });
      vi.setSystemTime(firstIssuedAt);
      const first = await fetch(`${baseUrl}/approval`, {
        body: firstBody,
        headers: signedDemoProxyHeaders({
          body: firstBody,
          issuedAt: firstIssuedAt.toISOString(),
          nonce,
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });

      const secondIssuedAt = new Date(firstIssuedAt.valueOf() + cockpitHumanProxyIssuedAtFreshnessWindowMs + 1);
      const secondBody = JSON.stringify({
        actionId: "draft-rebill:S8-L2",
        decision: "approve"
      });
      vi.setSystemTime(secondIssuedAt);
      const second = await fetch(`${baseUrl}/approval`, {
        body: secondBody,
        headers: signedDemoProxyHeaders({
          body: secondBody,
          issuedAt: secondIssuedAt.toISOString(),
          nonce,
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    } finally {
      vi.useRealTimers();
      await close(server);
    }
  });

  it("rejects expired signed proxy proofs after the verifier freshness window", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      }
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = new Date("2026-06-25T12:05:00.001Z");
      const expiredIssuedAt = new Date(now.valueOf() - cockpitHumanProxyIssuedAtFreshnessWindowMs - 1);
      const body = JSON.stringify({
        actionId: "draft-rebill:S8-L2",
        decision: "approve"
      });
      vi.setSystemTime(now);
      const response = await fetch(`${baseUrl}/approval`, {
        body,
        headers: signedDemoProxyHeaders({
          body,
          issuedAt: expiredIssuedAt.toISOString(),
          nonce: "expired-proof-nonce",
          path: "/approval",
          principal: "human:david-lead",
          purpose: "approval",
          role: "david",
          secret: demoProxySecret
        }),
        method: "POST"
      });

      expect(response.status).toBe(401);
    } finally {
      vi.useRealTimers();
      await close(server);
    }
  });

  it("requires a human reason when modifying or rejecting an approval item", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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
    let commitAttempts = 0;
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (init.method === "GET" && url.includes("/rest/v1/recoup_memory_records")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (init.method === "POST" && url.includes("/rest/v1/rpc/recoup_commit_approval_audit")) {
        commitAttempts += 1;
        return Promise.resolve(
          new Response(JSON.stringify(commitAttempts === 1 ? { committed: true } : { message: "duplicate key" }), {
            status: commitAttempts === 1 ? 200 : 409
          })
        );
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv, memoryFetcher });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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

  it("keeps internal service approval decisions from committing outside Supabase", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
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
          ...fixtureForensicsServiceContext,
          governedConfig,
          source: serviceSource,
          verifiedHumanPrincipal: cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL
        })
      ).toThrow("Supabase approval persistence required for approvals.decide.");
    } finally {
      await close(server);
    }
  });

  it("fails closed instead of reading SQLite approval finality for HTTP approval decisions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-approval-finality-"));
    const dbPath = join(dir, "memory.sqlite");
    const actionId = "draft-rebill:S5-L3";
    let store: ReturnType<typeof createRuntimeMemoryStore> | undefined;
    const { baseUrl, server } = await listen({ env: { ...cockpitAuthEnv, RECOUP_MEMORY_DB_PATH: dbPath } });

    try {
      store = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      store.append({
        category: "approval_records",
        createdAt: new Date(0).toISOString(),
        id: `approval:${actionId}`,
        payload: {
          actionId,
          approverId: "human:maya-lead",
          auditEntryHash: "a".repeat(64),
          decision: "approve",
          status: "human_decided"
        },
        recordIds: [actionId, "S5-L3"],
        scope: `approval:${actionId}`,
        trustLevel: "trusted"
      });
      store.close();
      store = undefined;

      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "reject",
          reason: "Durable finality should reject this late contradictory decision."
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as { error: string };

      expect(response.status).toBe(503);
      expect(result.error).toBe("Durable audit trail is unavailable.");
    } finally {
      store?.close();
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not commit HTTP approval finality to SQLite runtime memory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-approval-no-sqlite-"));
    const dbPath = join(dir, "memory.sqlite");
    const actionId = "route-billing:S4-L2";
    let store: ReturnType<typeof createRuntimeMemoryStore> | undefined;

    store = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
    store.close();
    store = undefined;

    const { baseUrl, server } = await listen({ env: { ...cockpitAuthEnv, RECOUP_MEMORY_DB_PATH: dbPath } });

    try {
      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(503);
      expect(body.error).toBe("Durable audit trail is unavailable.");

      store = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      expect(store.list(`approval:${actionId}`)).toEqual([]);
      store.close();
      store = undefined;
    } finally {
      store?.close();
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("fails closed without consuming the action when durable approval finality cannot be committed", async () => {
    const actionId = "draft-rebill:S6-L2";
    let failNextRpc = true;
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);

      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (init.method === "POST" && url.includes("/rest/v1/rpc/recoup_commit_approval_audit")) {
        if (failNextRpc) {
          failNextRpc = false;
          return Promise.resolve(new Response(JSON.stringify({ message: "temporary write outage" }), { status: 503 }));
        }
        return Promise.resolve(new Response(JSON.stringify(JSON.parse(body ?? "{}")), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const failed = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const failedBody = (await failed.json()) as { error: string };

      expect(failed.status).toBe(503);
      expect(failedBody.error).toBe("Durable audit trail is unavailable.");

      const retried = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await retried.json()) as { actionId: string; status: string };

      expect(retried.status).toBe(200);
      expect(approval).toMatchObject({ actionId, status: "human_decided" });
    } finally {
      await close(server);
    }
  });

  it("maps Supabase durable approval commit conflicts to a duplicate-decision response", async () => {
    const actionId = "draft-rebill:S7-L1";
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (init.method === "POST" && url.includes("/rest/v1/rpc/recoup_commit_approval_audit")) {
        return Promise.resolve(new Response(JSON.stringify({ message: "duplicate key" }), { status: 409 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const duplicate = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const duplicateBody = (await duplicate.json()) as { error: string };

      expect(duplicate.status).toBe(409);
      expect(duplicateBody.error).toBe("Action already has a human decision.");
      expect(() =>
        invokeServiceTool("approvals.decide", {
          actionId,
          decision: "approve"
        }, {
          ...fixtureForensicsServiceContext,
          governedConfig,
          source: serviceSource,
          verifiedHumanPrincipal: cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL
        })
      ).toThrow("Supabase approval persistence required for approvals.decide.");
    } finally {
      await close(server);
    }
  });

  it("persists Supabase-backed approval finality and the hash-chained audit entry", async () => {
    const actionId = "route-billing:S1-L2";
    const durableHead = "d".repeat(64);
    const rpcPayloads: Array<Record<string, unknown>> = [];
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryRows: unknown[] = [];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });

      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        return Promise.resolve(new Response(JSON.stringify([{ entry_hash: durableHead, seq: 12 }]), { status: 200 }));
      }

      if (init.method === "POST" && url.includes("/rest/v1/rpc/recoup_commit_approval_audit")) {
        const payload = JSON.parse(body ?? "{}") as Record<string, unknown>;
        rpcPayloads.push(payload);
        memoryRows.push({
          category: payload["p_memory_category"],
          created_at: payload["p_memory_created_at"],
          id: payload["p_memory_id"],
          payload_json: payload["p_memory_payload_json"],
          record_ids_json: payload["p_memory_record_ids_json"],
          scope: payload["p_memory_scope"],
          trust_level: payload["p_memory_trust_level"]
        });
        return Promise.resolve(new Response(JSON.stringify({ committed: true }), { status: 200 }));
      }

      if (init.method === "GET" && url.includes("/rest/v1/recoup_memory_records")) {
        return Promise.resolve(new Response(JSON.stringify(memoryRows), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await response.json()) as {
        actionId: string;
        auditEntryHash: string;
        status: string;
      };

      expect(response.status).toBe(200);
      expect(approval).toMatchObject({ actionId, status: "human_decided" });
      expect(approval.auditEntryHash).toMatch(/^[a-f0-9]{64}$/);
      expect(calls.filter((call) => call.method === "GET" && call.url.includes("/rest/v1/recoup_audit_chain"))).toHaveLength(1);
      expect(calls.filter((call) => call.method === "POST" && call.url.includes("/rest/v1/rpc/recoup_commit_approval_audit"))).toHaveLength(1);
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_audit_chain"))).toBe(false);
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"))).toBe(false);
      expect(rpcPayloads).toHaveLength(1);
      const rpcPayload = rpcPayloads[0];
      if (
        rpcPayload === undefined ||
        !isJsonRecord(rpcPayload["p_audit_payload"]) ||
        !isJsonRecord(rpcPayload["p_memory_payload_json"])
      ) {
        throw new Error("Expected Supabase audit-chain RPC payload.");
      }
      expect(rpcPayload["p_expected_prev_hash"]).toBe(durableHead);
      expect(rpcPayload["p_audit_prev_hash"]).toBe(durableHead);
      expect(rpcPayload["p_audit_entry_hash"]).toBe(approval.auditEntryHash);
      expect(rpcPayload["p_audit_payload"]["entryType"]).toBe("approval.decision");
      expect(rpcPayload["p_audit_payload"]["recordIds"]).toEqual(expect.arrayContaining([actionId, "S1-L2"]));
      expect(rpcPayload["p_audit_payload"]["payload"]).toMatchObject({
        actionId,
        decision: "approve",
        status: "human_decided"
      });
      expect(rpcPayload["p_memory_id"]).toBe(`approval:${actionId}`);
      expect(rpcPayload["p_memory_payload_json"]).toMatchObject({
        actionId,
        auditEntryHash: approval.auditEntryHash,
        decision: "approve",
        status: "human_decided"
      });
      expect(rpcPayload["p_memory_record_ids_json"]).toEqual(expect.arrayContaining([actionId, "S1-L2"]));

      const memoryResponse = await fetch(`${baseUrl}/memory`);
      const memory = (await memoryResponse.json()) as {
        approvalAuditReceipts?: Array<{
          actionId: string;
          approverId: string;
          auditEntryHash: string;
          decision: string;
          recordIds: string[];
          status: string;
        }>;
      };
      expect(memoryResponse.status).toBe(200);
      expect(memory.approvalAuditReceipts).toHaveLength(1);
      const receipt = memory.approvalAuditReceipts?.[0];
      expect(receipt).toMatchObject({
        actionId,
        approverId: "human:maya-lead",
        auditEntryHash: approval.auditEntryHash,
        decision: "approve",
        status: "human_decided"
      });
      expect(receipt?.recordIds).toEqual(expect.arrayContaining([actionId, "S1-L2"]));

      const detailResponse = await fetch(`${baseUrl}/forensics/work-items/S1-L2`, { headers: cockpitAuthHeaders });
      const detail = (await detailResponse.json()) as {
        approvalReceipt?: {
          actionId: string;
          approverId: string;
          auditEntryHash: string;
          decision: string;
          recordIds: string[];
          status: string;
        };
        approvalState: { status: string; statusLabel: string };
        auditState: { recordIds: string[]; status: string; statusLabel: string };
      };
      expect(detailResponse.status).toBe(200);
      expect(detail.approvalState).toMatchObject({ status: "human_decided", statusLabel: "Human decision recorded" });
      expect(detail.auditState).toMatchObject({ status: "human_decided", statusLabel: "Audit receipt committed" });
      expect(detail.auditState.recordIds).toEqual(expect.arrayContaining([actionId, "S1-L2"]));
      expect(detail.approvalReceipt).toMatchObject({
        actionId,
        approverId: "human:maya-lead",
        auditEntryHash: approval.auditEntryHash,
        decision: "approve",
        status: "human_decided"
      });
      expect(detail.approvalReceipt?.recordIds).toEqual(expect.arrayContaining([actionId, "S1-L2"]));

      const forensicsResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const forensics = (await forensicsResponse.json()) as {
        worklist: Array<{ approvalStatus: string; approvalStatusLabel: string; lineId: string }>;
      };
      expect(forensicsResponse.status).toBe(200);
      expect(forensics.worklist.find((item) => item.lineId === "S1-L1")).toMatchObject({
        approvalStatus: "pending_human",
        approvalStatusLabel: "Awaiting reviewer"
      });
      expect(JSON.stringify({ approval, rpcPayloads })).not.toContain("supabase-secret-key");
      expect(JSON.stringify(memory)).not.toContain("supabase-secret-key");
    } finally {
      await close(server);
    }
  });

  it("fails closed when approval record source cannot be read for Maya rehydration", async () => {
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (init.method === "GET" && url.includes("/rest/v1/recoup_memory_records")) {
        return Promise.resolve(new Response(JSON.stringify({ message: "temporary approval record read outage" }), { status: 503 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const forensicsResponse = await fetch(`${baseUrl}/forensics`, { headers: cockpitAuthHeaders });
      const forensicsBody = (await forensicsResponse.json()) as { error: string; missingSource: string };
      expect(forensicsResponse.status).toBe(503);
      expect(forensicsBody).toMatchObject({
        error: "Maya approval receipt state is unavailable from governed backend sources.",
        missingSource: "approval_records"
      });

      const detailResponse = await fetch(`${baseUrl}/forensics/work-items/S1-L1`, { headers: cockpitAuthHeaders });
      const detailBody = (await detailResponse.json()) as { error: string; missingSource: string };
      expect(detailResponse.status).toBe(503);
      expect(detailBody).toMatchObject({
        error: "Maya approval receipt state is unavailable from governed backend sources.",
        missingSource: "approval_records"
      });
    } finally {
      await close(server);
    }
  });

  it("requires an admin principal for demo lifecycle reset", async () => {
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
      }
    });

    try {
      const response = await fetch(`${baseUrl}/admin/demo-reset`, {
        body: JSON.stringify({ actionId: "route-billing:S1-L1", reason: "Prepare judge demo rerun" }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(body.error).toBe("Admin reset principal required.");
    } finally {
      await close(server);
    }
  });

  it("accepts a signed CFO server-proxy demo lifecycle reset while the direct API principal remains Maya", async () => {
    const actionId = "route-billing:S1-L1";
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryRows: unknown[] = [
      {
        category: "approval_records",
        created_at: new Date(0).toISOString(),
        id: `approval:${actionId}`,
        payload_json: {
          actionId,
          approverId: "human:maya-lead",
          auditEntryHash: "a".repeat(64),
          decision: "approve",
          status: "human_decided"
        },
        record_ids_json: [actionId, "S1-L1"],
        scope: `approval:${actionId}`,
        trust_level: "trusted"
      }
    ];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const requestBody = stringifyRequestBody(init.body);
      calls.push({
        ...(requestBody === undefined ? {} : { body: requestBody }),
        ...(init.method === undefined ? {} : { method: init.method }),
        url
      });

      if (url.includes("/rest/v1/rpc/recoup_reset_demo_approval_lifecycle")) {
        const payload = JSON.parse(requestBody ?? "{}") as {
          p_approval_id?: string;
          p_approval_scope?: string;
          p_audit_category?: string;
          p_audit_created_at?: string;
          p_audit_id?: string;
          p_audit_payload_json?: Record<string, unknown>;
          p_audit_record_ids_json?: string[];
          p_audit_scope?: string;
          p_audit_trust_level?: string;
        };
        const deleted = memoryRows.filter(
          (row) =>
            isSupabaseMemoryTestRow(row) &&
            row.category === "approval_records" &&
            row.id === payload.p_approval_id &&
            row.scope === payload.p_approval_scope
        );
        for (const row of deleted) {
          const index = memoryRows.indexOf(row);
          if (index !== -1) {
            memoryRows.splice(index, 1);
          }
        }
        memoryRows.push({
          category: payload.p_audit_category,
          created_at: payload.p_audit_created_at,
          id: payload.p_audit_id,
          payload_json: payload.p_audit_payload_json,
          record_ids_json: payload.p_audit_record_ids_json,
          scope: payload.p_audit_scope,
          trust_level: payload.p_audit_trust_level
        });
        return Promise.resolve(new Response(JSON.stringify([{ deleted_record_count: deleted.length }]), { status: 200 }));
      }

      if (url.includes("/rest/v1/recoup_memory_records") && init.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(memoryRows), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_DEMO_SESSION_SECRET: demoProxySecret
      },
      memoryFetcher
    });

    try {
      const body = JSON.stringify({ actionId, reason: "Prepare judge demo rerun" });
      const response = await fetch(`${baseUrl}/admin/demo-reset`, {
        body,
        headers: signedDemoProxyHeaders({
          body,
          path: "/admin/demo-reset",
          principal: "human:cfo-lead",
          purpose: "admin-reset",
          role: "cfo",
          secret: demoProxySecret
        }),
        method: "POST"
      });
      const reset = (await response.json()) as { actionId: string; deletedRecordCount: number; status: string };

      expect(response.status).toBe(200);
      expect(reset).toMatchObject({ actionId, deletedRecordCount: 1, status: "reset_recorded" });
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/rpc/recoup_reset_demo_approval_lifecycle"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("lets an admin reset only demo lifecycle approval records and records the reset receipt", async () => {
    const actionId = "route-billing:S1-L1";
    const resetScope = `approval:${actionId}`;
    const sourceRecordScope = "evidence:S1-L1";
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const memoryRows: unknown[] = [
      {
        category: "approval_records",
        created_at: new Date(0).toISOString(),
        id: `approval:${actionId}`,
        payload_json: {
          actionId,
          approverId: "human:maya-lead",
          auditEntryHash: "a".repeat(64),
          decision: "approve",
          status: "human_decided"
        },
        record_ids_json: [actionId, "S1-L1"],
        scope: resetScope,
        trust_level: "trusted"
      },
      {
        category: "evidence_refs",
        created_at: new Date(0).toISOString(),
        id: "evidence:S1-L1",
        payload_json: { source: "source-backed" },
        record_ids_json: ["S1-L1"],
        scope: sourceRecordScope,
        trust_level: "trusted"
      },
      {
        category: "evidence_refs",
        created_at: new Date(0).toISOString(),
        id: "evidence:same-approval-scope",
        payload_json: { source: "source-backed" },
        record_ids_json: ["S1-L1"],
        scope: resetScope,
        trust_level: "trusted"
      }
    ];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), ...(init.method === undefined ? {} : { method: init.method }), url });

      if (url.includes("/rest/v1/rpc/recoup_reset_demo_approval_lifecycle")) {
        const payload = JSON.parse(body ?? "{}") as {
          p_approval_id?: string;
          p_approval_scope?: string;
          p_audit_category?: string;
          p_audit_created_at?: string;
          p_audit_id?: string;
          p_audit_payload_json?: Record<string, unknown>;
          p_audit_record_ids_json?: string[];
          p_audit_scope?: string;
          p_audit_trust_level?: string;
        };
        const deleted = memoryRows.filter(
          (row) =>
            isSupabaseMemoryTestRow(row) &&
            row.category === "approval_records" &&
            row.id === payload.p_approval_id &&
            row.scope === payload.p_approval_scope
        );
        for (const row of deleted) {
          const index = memoryRows.indexOf(row);
          if (index !== -1) {
            memoryRows.splice(index, 1);
          }
        }
        memoryRows.push({
          category: payload.p_audit_category,
          created_at: payload.p_audit_created_at,
          id: payload.p_audit_id,
          payload_json: { ...payload.p_audit_payload_json, deletedRecordCount: deleted.length },
          record_ids_json: payload.p_audit_record_ids_json,
          scope: payload.p_audit_scope,
          trust_level: payload.p_audit_trust_level
        });
        return Promise.resolve(new Response(JSON.stringify([{ deleted_record_count: deleted.length }]), { status: 200 }));
      }

      if (url.includes("/rest/v1/recoup_memory_records")) {
        if (init.method === "DELETE") {
          return Promise.resolve(new Response(JSON.stringify({ error: "raw delete not allowed" }), { status: 500 }));
        }

        if (init.method === "GET") {
          return Promise.resolve(new Response(JSON.stringify(memoryRows), { status: 200 }));
        }
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const cfoHeaders = {
      ...cockpitAuthHeaders,
      "x-recoup-human-principal": "human:cfo-lead"
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitApprovalEnv,
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:cfo-lead"
      },
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/admin/demo-reset`, {
        body: JSON.stringify({ actionId, reason: "Prepare judge demo rerun" }),
        headers: cfoHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        actionId: string;
        deletedRecordCount: number;
        resetScope: string;
        status: string;
      };

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        actionId,
        deletedRecordCount: 1,
        resetScope,
        status: "reset_recorded"
      });

      const memoryResponse = await fetch(`${baseUrl}/memory`);
      const memory = (await memoryResponse.json()) as {
        approvalAuditReceipts: unknown[];
        records: Array<{ category: string; id: string; scope: string }>;
      };
      expect(memoryResponse.status).toBe(200);
      expect(memory.approvalAuditReceipts).toEqual([]);
      expect(memory.records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: "evidence_refs", id: "evidence:S1-L1", scope: sourceRecordScope }),
          expect.objectContaining({ category: "evidence_refs", id: "evidence:same-approval-scope", scope: resetScope }),
          expect.objectContaining({ category: "audit_refs", scope: `admin-reset:${actionId}` })
        ])
      );
      expect(memory.records.some((record) => record.id === `approval:${actionId}`)).toBe(false);
      expect(calls.some((call) => call.method === "DELETE" && call.url.includes("/rest/v1/recoup_memory_records"))).toBe(false);
      expect(calls.some((call) => call.method === "POST" && call.url.includes("/rest/v1/rpc/recoup_reset_demo_approval_lifecycle"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("fails closed without consuming the action when Supabase audit-chain persistence is unavailable", async () => {
    const actionId = "route-billing:S1-L3";
    let failNextRpc = true;
    const rpcPayloads: Array<Record<string, unknown>> = [];
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);

      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (init.method === "POST" && url.includes("/rest/v1/rpc/recoup_commit_approval_audit")) {
        if (failNextRpc) {
          failNextRpc = false;
          return Promise.resolve(
            new Response(JSON.stringify({ message: "temporary outage for supabase-secret-key" }), { status: 503 })
          );
        }
        rpcPayloads.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return Promise.resolve(new Response(JSON.stringify({ committed: true }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const failed = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const failedBody = (await failed.json()) as { error: string };

      expect(failed.status).toBe(503);
      expect(failedBody.error).toBe("Durable audit trail is unavailable.");
      expect(JSON.stringify(failedBody)).not.toContain("supabase-secret-key");

      const retried = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await retried.json()) as { actionId: string; auditEntryHash: string; status: string };

      expect(retried.status).toBe(200);
      expect(approval).toMatchObject({ actionId, status: "human_decided" });
      expect(rpcPayloads).toHaveLength(1);
      expect(rpcPayloads[0]?.["p_audit_entry_hash"]).toBe(approval.auditEntryHash);
    } finally {
      await close(server);
    }
  });

  it("retries a Supabase audit tail race once against the refreshed durable head", async () => {
    const actionId = "route-billing:S2-L1";
    const staleHead = "e".repeat(64);
    const freshHead = "f".repeat(64);
    const rpcPayloads: Array<Record<string, unknown>> = [];
    let tailReads = 0;
    let firstRpc = true;
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);

      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        tailReads += 1;
        const row = tailReads === 1 ? { entry_hash: staleHead, seq: 20 } : { entry_hash: freshHead, seq: 21 };
        return Promise.resolve(new Response(JSON.stringify([row]), { status: 200 }));
      }

      if (init.method === "POST" && url.includes("/rest/v1/rpc/recoup_commit_approval_audit")) {
        const payload = JSON.parse(body ?? "{}") as Record<string, unknown>;
        rpcPayloads.push(payload);
        if (firstRpc) {
          firstRpc = false;
          return Promise.resolve(
            new Response(JSON.stringify({ code: "P0001", message: "audit_tail_mismatch" }), { status: 400 })
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ committed: true }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const approval = (await response.json()) as { auditEntryHash: string; status: string };

      expect(response.status).toBe(200);
      expect(approval.status).toBe("human_decided");
      expect(tailReads).toBe(2);
      expect(rpcPayloads).toHaveLength(2);
      expect(rpcPayloads[0]?.["p_expected_prev_hash"]).toBe(staleHead);
      expect(rpcPayloads[1]?.["p_expected_prev_hash"]).toBe(freshHead);
      expect(rpcPayloads[0]?.["p_audit_entry_hash"]).not.toBe(rpcPayloads[1]?.["p_audit_entry_hash"]);
      expect(rpcPayloads[1]?.["p_audit_entry_hash"]).toBe(approval.auditEntryHash);
    } finally {
      await close(server);
    }
  });

  it("fails closed without leaking secrets when Supabase audit-chain tail reads are unavailable", async () => {
    const actionId = "draft-rebill:S7-L2";
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "temporary outage for supabase-secret-key" }), { status: 503 })
        );
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 404 }));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      memoryFetcher
    });

    try {
      const response = await fetch(`${baseUrl}/approval`, {
        body: JSON.stringify({
          actionId,
          decision: "approve"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as { error: string };

      expect(response.status).toBe(503);
      expect(result.error).toBe("Durable audit trail is unavailable.");
      expect(JSON.stringify(result)).not.toContain("supabase-secret-key");
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

  it("streams POST /run forensics requests as SSE envelopes", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/run`, {
        body: JSON.stringify({ runType: "forensics", seed: 42 }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(body).toContain("event: status");
      expect(body).toContain("event: finding");
      expect(body).toContain("event: verdict");
      expect(body.split("\n\n").every((chunk) => chunk === "" || chunk.includes("data: {"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("includes live Agents SDK stream status on POST /run when OpenAI is configured", async () => {
    let liveMaxTurns: number | undefined;
    let runnerCalls = 0;
    const { baseUrl, server } = await listen({
      env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-secret" },
      forensicsStreamRunner: async function* (request) {
        runnerCalls += 1;
        liveMaxTurns = request.maxTurns;
        await Promise.resolve();
        if (runnerCalls === 1) {
          throw new Error("temporary live failure");
        }
        yield {
          type: "raw_model_stream_event",
          data: {
            response: {
              usage: {
                total_tokens: 25
              }
            },
            type: "response.completed"
          }
        };
        yield {
          type: "raw_model_stream_event",
          data: {
            type: "response.output_text.delta",
            delta: "Live model stream is connected."
          }
        };
      }
    });
    try {
      const response = await fetch(`${baseUrl}/run`, {
        body: JSON.stringify({ runType: "forensics", seed: 42 }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(body).toContain("Live Agents SDK stream started for Forensics Investigator.");
      expect(body).toContain("Live Agents SDK stream retrying after recoverable failure.");
      expect(body).toContain("Live model text delta received; content suppressed by Recoup output guard.");
      expect(body).not.toContain("Live model stream is connected.");
      expect(liveMaxTurns).toBe(80);
      expect(runnerCalls).toBe(2);
      expect(body).toContain("event: verdict");
      expect(body).not.toContain("sk-test-secret");
    } finally {
      await close(server);
    }
  });

  it("keeps unauthenticated /run deterministic-only when OpenAI is configured", async () => {
    let runnerCalls = 0;
    const { baseUrl, server } = await listen({
      env: { OPENAI_API_KEY: "sk-test-secret" },
      forensicsStreamRunner: () => {
        runnerCalls += 1;
        throw new Error("The live runner must not be called without cockpit auth.");
      }
    });
    try {
      const response = await fetch(`${baseUrl}/run`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(runnerCalls).toBe(0);
      expect(body).toContain("Live Agents SDK stream skipped: verified human cockpit auth is required.");
      expect(body).toContain("event: verdict");
      expect(body).not.toContain("sk-test-secret");
    } finally {
      await close(server);
    }
  });

  it("keeps unauthenticated POST /run deterministic-only when OpenAI is configured", async () => {
    let runnerCalls = 0;
    const { baseUrl, server } = await listen({
      env: { OPENAI_API_KEY: "sk-test-secret" },
      forensicsStreamRunner: () => {
        runnerCalls += 1;
        throw new Error("The live runner must not be called without cockpit auth.");
      }
    });
    try {
      const response = await fetch(`${baseUrl}/run`, {
        body: JSON.stringify({ runType: "forensics", seed: 42 }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(runnerCalls).toBe(0);
      expect(body).toContain("Live Agents SDK stream skipped: verified human cockpit auth is required.");
      expect(body).toContain("event: verdict");
      expect(body).not.toContain("sk-test-secret");
    } finally {
      await close(server);
    }
  });

  it("rejects unsupported POST /run requests without opening an SSE stream", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/run`, {
        body: JSON.stringify({ runType: "riskMesh", seed: 42 }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
      expect(body.error).toBe("Invalid run request.");
    } finally {
      await close(server);
    }
  });

  it("returns JSON 400 for malformed POST /run bodies before streaming starts", async () => {
    const { baseUrl, server } = await listen();
    try {
      const response = await fetch(`${baseUrl}/run`, {
        body: "{\"runType\":\"forensics\"",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
      expect(body.error).toBe("Invalid run request.");
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

  it("scopes GET /run memory to a safe x-recoup-session-id header", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-client-"));
    const dbPath = join(dir, "memory.sqlite");
    const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: dbPath } });
    let store: ReturnType<typeof createRuntimeMemoryStore> | undefined;

    try {
      const response = await fetch(`${baseUrl}/run`, { headers: { "x-recoup-session-id": "maya-session-42" } });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("event: verdict");

      store = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      expect(readSessionState(store, "maya-session-42", "last-forensics-run")).toMatchObject({
        category: "session_state",
        payload: { key: "last-forensics-run", value: "completed" }
      });
      expect(readAgentHandoffPacket(store, "forensics-recovery:maya-session-42")).toMatchObject({
        category: "agent_handoff_packets",
        payload: {
          capability: "B",
          caseId: "maya-session-42",
          deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
          fromAgent: "Forensics Investigator",
          intent: "stage-recovery-and-billing-drafts",
          status: "created",
          toAgent: "Recovery Drafter"
        }
      });
      expect(readSessionState(store, "cockpit-run", "last-forensics-run")).toBeUndefined();
      expect(readAgentHandoffPacket(store, "forensics-recovery:cockpit-run")).toBeUndefined();
    } finally {
      store?.close();
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scopes POST /run memory to a safe x-recoup-session-id header", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-client-post-"));
    const dbPath = join(dir, "memory.sqlite");
    const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: dbPath } });
    let store: ReturnType<typeof createRuntimeMemoryStore> | undefined;

    try {
      const response = await fetch(`${baseUrl}/run`, {
        body: JSON.stringify({ runType: "forensics", seed: 42 }),
        headers: { "content-type": "application/json", "x-recoup-session-id": "maya-session-42" },
        method: "POST"
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("event: verdict");

      store = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      expect(readSessionState(store, "maya-session-42", "last-forensics-run")).toMatchObject({
        category: "session_state",
        payload: { key: "last-forensics-run", value: "completed" }
      });
      expect(readAgentHandoffPacket(store, "forensics-recovery:maya-session-42")).toMatchObject({
        category: "agent_handoff_packets",
        payload: {
          caseId: "maya-session-42",
          deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph"
        }
      });
      expect(readTransactionState(store, "S1-L1", "deduction-decision")).toMatchObject({
        category: "transaction_state",
        scope: "transaction:S1-L1"
      });
    } finally {
      store?.close();
      await close(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores unsafe x-recoup-session-id values and keeps the cockpit-run fallback", async () => {
    const unsafeSessionIds = ["maya session 42", "maya/session-42", "sk-test-secret-session"];

    for (const sessionId of unsafeSessionIds) {
      const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-unsafe-"));
      const dbPath = join(dir, "memory.sqlite");
      const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: dbPath } });
      let store: ReturnType<typeof createRuntimeMemoryStore> | undefined;

      try {
        const response = await fetch(`${baseUrl}/run`, { headers: { "x-recoup-session-id": sessionId } });
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
          payload: { caseId: "cockpit-run" }
        });
        expect(readSessionState(store, sessionId, "last-forensics-run")).toBeUndefined();
        expect(readAgentHandoffPacket(store, `forensics-recovery:${sessionId}`)).toBeUndefined();
      } finally {
        store?.close();
        await close(server);
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }, 15000);

  it("serves persisted runtime memory records through the cockpit memory endpoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-cockpit-memory-view-"));
    const dbPath = join(dir, "memory.sqlite");
    const { baseUrl, server } = await listen({ env: { RECOUP_MEMORY_DB_PATH: dbPath } });

    try {
      const runResponse = await fetch(`${baseUrl}/run`);
      const runBody = await runResponse.text();
      const memoryResponse = await fetch(`${baseUrl}/memory`);
      const memory = (await memoryResponse.json()) as {
        backend: string;
        provenance: string;
        records: Array<{ category: string; id: string; recordIds: string[]; scope: string }>;
        sourceMode: string;
      };

      expect(runResponse.status).toBe(200);
      expect(runBody).toContain("event: verdict");
      expect(memoryResponse.status).toBe(200);
      expect(memory.backend).toBe("sqlite");
      expect(memory.sourceMode).toBe("runtime_persisted");
      expect(memory.provenance).toBe("persisted_runtime_memory");

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
        backend: string;
        provenance: string;
        records: Array<{ category: string; id: string; recordIds: string[]; scope: string }>;
        sourceMode: string;
      };

      expect(runResponse.status).toBe(200);
      expect(runBody).toContain("event: verdict");
      expect(memoryResponse.status).toBe(200);
      expect(memory.backend).toBe("supabase");
      expect(memory.sourceMode).toBe("runtime_persisted");
      expect(memory.provenance).toBe("persisted_runtime_memory");
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
      const memory = (await response.json()) as {
        backend: string;
        categories: string[];
        provenance: string;
        sourceMode: string;
        surface: string;
      };

      expect(response.status).toBe(200);
      expect(memory.surface).toBe("memory");
      expect(memory.backend).toBe("in_memory_fallback");
      expect(memory.sourceMode).toBe("runtime_empty");
      expect(memory.provenance).toBe("empty_runtime_memory");
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
      expect(credit.arbitration.status).toBe("ranked");
      expect(cfo.surface).toBe("cfo-summary");
      expect(cfo.metrics.length).toBeGreaterThan(0);
    } finally {
      await close(server);
    }
  });

  it("fails closed for governed read models when Supabase recoup_config is unavailable", async () => {
    const { baseUrl, server } = await listenWithoutGovernedConfig();
    try {
      const response = await fetch(`${baseUrl}/credit`);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(503);
      expect(body.error).toBe("Supabase recoup_config is required for governed runtime values.");
    } finally {
      await close(server);
    }
  });

  it("fails closed before starting /run when DB-backed run-control rows are unavailable", async () => {
    const correlationId = "test-correlation-run-control-missing";
    const { baseUrl, server } = await listenWithoutReleaseOwnerInputs();
    try {
      const response = await fetch(`${baseUrl}/run`, {
        headers: { [recoupCorrelationIdHeader]: correlationId }
      });
      const body = (await response.json()) as {
        correlationId: string;
        error: string;
        missingSource: string;
        runControl: { reason?: string; status: string };
      };

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
      expect(body.error).toBe("Supabase release owner-input recoup_config rows are required for run-control.");
      expect(body.missingSource).toBe("supabase-release-owner-run-control");
      expect(body.correlationId).toBe(correlationId);
      expect(response.headers.get(recoupCorrelationIdHeader)).toBe(correlationId);
      expect(body.runControl).toEqual({
        openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"],
        reason: "appendix-g-run-control-unset",
        status: "blocked"
      });
    } finally {
      await close(server);
    }
  });

  it("serves trace, memory, agent graph, and connector readiness read endpoints", async () => {
    const { baseUrl, server } = await listen({ env: cockpitAuthEnv });
    try {
      const startedAt = Date.now();
      const [traceResponse, memoryResponse, agentsResponse, connectorsResponse] = await Promise.all([
        fetch(`${baseUrl}/trace`),
        fetch(`${baseUrl}/memory`),
        fetch(`${baseUrl}/agents`),
        fetch(`${baseUrl}/connectors`, { headers: cockpitAuthHeaders })
      ]);
      const finishedAt = Date.now();
      const trace = (await traceResponse.json()) as { events: unknown[] };
      const memory = (await memoryResponse.json()) as { categories: string[] };
      const agents = (await agentsResponse.json()) as { edges: Array<{ mode: string }> };
      const connectors = (await connectorsResponse.json()) as {
        checkedAtIso: string;
        connectors: Array<{ name: string; proof: { externalWritesAllowed: boolean }; status: string }>;
        lastRefreshedLabel: string;
        surface: string;
      };
      const checkedAt = Date.parse(connectors.checkedAtIso);

      expect(traceResponse.status).toBe(200);
      expect(memoryResponse.status).toBe(200);
      expect(agentsResponse.status).toBe(200);
      expect(connectorsResponse.status).toBe(200);
      expect(trace.events.length).toBeGreaterThan(0);
      expect(memory.categories).toContain("approval_records");
      expect(agents.edges.some((edge) => edge.mode === "agents-as-tools")).toBe(true);
      expect(connectors.surface).toBe("connector-readiness");
      expect(Number.isFinite(checkedAt)).toBe(true);
      expect(checkedAt).toBeGreaterThanOrEqual(startedAt - 1000);
      expect(checkedAt).toBeLessThanOrEqual(finishedAt + 1000);
      expect(connectors.checkedAtIso).not.toBe(connectors.lastRefreshedLabel);
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "which selected evidence supports S3-L1?", ...selectedRealtimeQueryScope }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const result = (await response.json()) as {
        auditPolicy: { allowedTools: string[]; recordIds: string[] };
        status: string;
      };

      expect(response.status).toBe(503);
      expect(result.status).toBe("blocked_missing_credentials");
      expect(result.auditPolicy.recordIds).toEqual([...selectedRealtimeQueryScope.recordIds]);
      expect(result.auditPolicy.allowedTools).toEqual(["audit.read", "query.answer"]);
    } finally {
      await close(server);
    }
  });

  it("serves MCP connector source readiness from a saved snapshot without live-probing during page load", async () => {
    const snapshotCheckedAt = new Date().toISOString();
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (url.includes("/rest/v1/recoup_source_health_snapshots")) {
        expect(init.headers).toMatchObject({
          apikey: "supabase-secret-key",
          authorization: "Bearer supabase-secret-key"
        });
        return Promise.resolve(
          Response.json([
            {
              checked_at: snapshotCheckedAt,
              last_error: null,
              latency_ms: 11,
              proof_items_json: ["mcp healthz reachable", "auth configured", "supabase source-health snapshot"],
              record_ids_json: ["mcp", "recoup_source_health_snapshots:mcp"],
              source_mode: "live",
              source_name: "mcp",
              status: "connected"
            }
          ])
        );
      }

      return Promise.resolve(Response.json([]));
    };
    const mcpHealthFetcher = vi.fn((url: string | URL | Request) => {
      const requestedUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      expect(requestedUrl).toBe("https://mcp.example.test/healthz");
      return Promise.resolve(
        Response.json({
          authConfigured: true,
          endpoint: "/mcp",
          sessionMode: "stateful",
          transport: "StreamableHTTPServerTransport"
        })
      );
    });
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        RECOUP_MCP_URL: "https://mcp.example.test/mcp"
      },
      memoryFetcher,
      mcpHealthFetcher
    });
    try {
      const response = await fetch(`${baseUrl}/connectors`, { headers: cockpitAuthHeaders });
      const connectors = (await response.json()) as {
        sourceTiles: Array<{
          detail: string;
          label: string;
          proofItems: string[];
          stateLabel: string;
          statusTone: string;
          summary: string;
        }>;
      };
      const mcpTile = connectors.sourceTiles.find((sourceTile) => sourceTile.label === "MCP");

      expect(response.status).toBe(200);
      expect(mcpHealthFetcher).not.toHaveBeenCalled();
      expect(mcpTile).toMatchObject({
        detail: "MCP status loaded from saved source-health snapshot.",
        stateLabel: "Connected",
        statusTone: "ready",
        summary: "Read-only tools gated"
      });
      expect(mcpTile?.proofItems).toEqual(expect.arrayContaining(["mcp healthz reachable", "auth configured"]));
    } finally {
      await close(server);
    }
  });

  it("starts a private loopback MCP health endpoint for source-health snapshots when no public MCP URL is configured", async () => {
    const closeMcp = vi.fn(() => Promise.resolve());
    const stopPoller = vi.fn();
    const startMcpServer = vi.fn<CockpitMcpServerStarter>(() =>
      Promise.resolve({
        baseUrl: "http://127.0.0.1:57123",
        close: closeMcp,
        endpoint: "/mcp" as const,
        server: {} as Server,
        transport: "StreamableHTTPServerTransport" as const
      })
    );
    const sourceHealthPollerFactory = vi.fn<CockpitSourceHealthPollerFactory>((options) => {
      expect(options.env?.RECOUP_MCP_URL).toBe("http://127.0.0.1:57123/mcp");
      expect(options.availableCredentialEnvNames).toEqual(expect.arrayContaining(["RECOUP_MCP_URL"]));

      return {
        pollOnce: vi.fn(() => Promise.resolve([])),
        stop: stopPoller
      };
    });

    const runtime = await startCockpitApiRuntime({
      env: {
        ...cockpitAuthEnv,
        ...governedConfigEnv,
        PORT: "0",
        RECOUP_MCP_AUTH_TOKEN: "test-mcp-token"
      },
      memoryFetcher: withGovernedConfigFetcher(),
      sourceHealthPollerFactory,
      startMcpServer
    });
    try {
      const startInput = startMcpServer.mock.calls[0]?.[0];
      expect(startInput?.env?.RECOUP_MCP_AUTH_TOKEN).toBe("test-mcp-token");
      expect(startInput?.port).toBe(0);
      expect(sourceHealthPollerFactory).toHaveBeenCalledTimes(1);
      const health = await fetch(`${runtime.baseUrl}/healthz`);
      expect(health.status).toBe(200);
    } finally {
      await runtime.close();
    }

    expect(stopPoller).toHaveBeenCalledTimes(1);
    expect(closeMcp).toHaveBeenCalledTimes(1);
  });

  it("does not start a private loopback MCP server when a public MCP URL is configured", async () => {
    const startMcpServer = vi.fn<CockpitMcpServerStarter>();
    const stopPoller = vi.fn();
    const sourceHealthPollerFactory = vi.fn<CockpitSourceHealthPollerFactory>((options) => {
      expect(options.env?.RECOUP_MCP_URL).toBe("https://mcp.example.test/mcp");

      return {
        pollOnce: vi.fn(() => Promise.resolve([])),
        stop: stopPoller
      };
    });

    const runtime = await startCockpitApiRuntime({
      env: {
        ...cockpitAuthEnv,
        ...governedConfigEnv,
        PORT: "0",
        RECOUP_MCP_AUTH_TOKEN: "test-mcp-token",
        RECOUP_MCP_URL: "https://mcp.example.test/mcp"
      },
      memoryFetcher: withGovernedConfigFetcher(),
      sourceHealthPollerFactory,
      startMcpServer
    });
    try {
      expect(startMcpServer).not.toHaveBeenCalled();
      expect(sourceHealthPollerFactory).toHaveBeenCalledTimes(1);
    } finally {
      await runtime.close();
    }

    expect(stopPoller).toHaveBeenCalledTimes(1);
  });

  it("forwards optional OpenAI vector evidence fetcher through the started cockpit runtime", async () => {
    const vectorSearchCalls: Array<{ init: RequestInit; url: string }> = [];
    const sourceHealthPollerFactory = vi.fn<CockpitSourceHealthPollerFactory>(() => ({
      pollOnce: vi.fn(() => Promise.resolve([])),
      stop: vi.fn()
    }));
    const runtime = await startCockpitApiRuntime({
      env: {
        ...cockpitAuthEnv,
        ...governedConfigEnv,
        OPENAI_API_KEY: "sk-test-live-query",
        OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs_runtime_test",
        PORT: "0",
        RECOUP_DATA_MODE: "real-backend",
        RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS: "0",
        RECOUP_MCP_URL: "https://mcp.example.test/mcp"
      },
      memoryFetcher: successfulRealBackendSourceFetcher([]),
      openAiVectorStoreFetcher: (url, init) => {
        vectorSearchCalls.push({ init, url });
        return Promise.resolve(vectorStoreSearchResponseForS6());
      },
      sourceHealthPollerFactory
    });
    try {
      const response = await fetch(`${runtime.baseUrl}/forensics/work-items/S6-L1`, { headers: cockpitAuthHeaders });
      const body = (await response.json()) as {
        selected?: {
          evidencePack?: {
            documents: Array<{
              documentId: string;
              retrieval?: { provenance: string; vectorStoreId: string };
              sourceLabel: string;
            }>;
          };
        };
      };
      const vectorDocument = body.selected?.evidencePack?.documents.find(
        (document) => document.documentId === "file-vector-runtime-contract"
      );

      expect(response.status).toBe(200);
      expect(vectorSearchCalls).toHaveLength(buildSyntheticDataset({ seed: 42 }).deductionLines.length);
      expect(vectorSearchCalls[0]?.url).toBe("https://api.openai.com/v1/vector_stores/vs_runtime_test/search");
      expect(vectorDocument).toMatchObject({
        retrieval: {
          provenance: "openai-vector-store",
          vectorStoreId: "vs_runtime_test"
        },
        sourceLabel: "OpenAI vector store"
      });
    } finally {
      await runtime.close();
    }
  });

  it("generates private MCP auth for the booted loopback server when deployment auth is absent", async () => {
    const closeMcp = vi.fn(() => Promise.resolve());
    const startMcpServer = vi.fn<CockpitMcpServerStarter>(() =>
      Promise.resolve({
        baseUrl: "http://127.0.0.1:57124",
        close: closeMcp,
        endpoint: "/mcp" as const,
        server: {} as Server,
        transport: "StreamableHTTPServerTransport" as const
      })
    );
    const sourceHealthPollerFactory = vi.fn<CockpitSourceHealthPollerFactory>(() => ({
      pollOnce: vi.fn(() => Promise.resolve([])),
      stop: vi.fn()
    }));

    const runtime = await startCockpitApiRuntime({
      env: {
        ...cockpitAuthEnv,
        ...governedConfigEnv,
        PORT: "0"
      },
      memoryFetcher: withGovernedConfigFetcher(),
      sourceHealthPollerFactory,
      startMcpServer
    });
    try {
      const startInput = startMcpServer.mock.calls[0]?.[0];
      expect(startInput?.env?.RECOUP_MCP_AUTH_TOKEN).toMatch(/^loopback-/u);
      expect(runtime.runtimeEnv.RECOUP_MCP_AUTH_TOKEN).toBe(startInput?.env?.RECOUP_MCP_AUTH_TOKEN);
      expect(runtime.runtimeEnv.RECOUP_MCP_URL).toBe("http://127.0.0.1:57124/mcp");
      expect(runtime.runtimeEnv.RECOUP_MCP_CLIENT_CAPABILITIES).toBe("read");
      expect(runtime.runtimeEnv.RECOUP_MCP_CLIENT_PRINCIPAL).toBe(cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL);
    } finally {
      await runtime.close();
    }
  });

  it("serves SAP connector readiness from a saved snapshot without live-probing during page load", async () => {
    const sapFetcher = vi.fn(() => Promise.resolve(new Response("<edmx:Edmx />", { status: 200 })));
    const snapshotCheckedAt = new Date().toISOString();
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (url.includes("/rest/v1/recoup_source_health_snapshots")) {
        expect(init.headers).toMatchObject({
          apikey: "supabase-secret-key",
          authorization: "Bearer supabase-secret-key"
        });
        return Promise.resolve(
          Response.json([
            {
              checked_at: snapshotCheckedAt,
              last_error: null,
              latency_ms: 128,
              proof_items_json: ["read-only metadata probe", "credentials present", "external writes blocked"],
              record_ids_json: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
              source_mode: "live",
              source_name: "sap-odata",
              status: "connected"
            }
          ])
        );
      }

      return Promise.resolve(Response.json([]));
    };
    const { baseUrl, server } = await listen({
      env: {
        ...cockpitAuthEnv,
        SAP_ODATA_BASE_URL: "https://sap.example.test",
        SAP_ODATA_CLIENT: "100",
        SAP_ODATA_CLIENT_SECRET: "sap-basic-secret",
        SAP_ODATA_USERID: "sap-readonly-user"
      },
      memoryFetcher,
      sapFetcher
    });
    try {
      const response = await fetch(`${baseUrl}/connectors`, { headers: cockpitAuthHeaders });
      const connectors = (await response.json()) as {
        sourceHealth: Array<{ proofItems: string[]; recordIds: string[]; sourceMode: string; sourceName: string; status: string }>;
        sourceTiles: Array<{
          label: string;
          modeLabel: string;
          proofItems: string[];
          provenance: { deterministicBasis: string; recordIds: string[]; sourceKind: string };
          stateLabel: string;
          statusTone: string;
        }>;
      };
      const sapHealth = connectors.sourceHealth.find((source) => source.sourceName === "sap-odata");
      const sapTile = connectors.sourceTiles.find((source) => source.label === "SAP OData");

      expect(response.status).toBe(200);
      expect(sapFetcher).not.toHaveBeenCalled();
      expect(sapHealth).toMatchObject({
        checkedAtIso: snapshotCheckedAt,
        sourceMode: "live",
        status: "connected"
      });
      expect(sapHealth?.proofItems).toEqual(expect.arrayContaining(["read-only metadata probe"]));
      expect(sapHealth?.proofItems).toContain("supabase source-health snapshot");
      expect(sapHealth?.recordIds).toContain("recoup_source_health_snapshots:sap-odata");
      expect(sapTile).toMatchObject({
        modeLabel: "Live read",
        stateLabel: "Connected",
        statusTone: "ready"
      });
      expect(sapTile?.provenance.sourceKind).toBe("sap_odata");
      expect(sapTile?.provenance.deterministicBasis).toContain("read-only proof");
      expect(sapTile?.provenance.recordIds).toContain("recoup_source_health_snapshots:sap-odata");
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
        body: JSON.stringify({ question: "which selected evidence supports S3-L1?", ...selectedRealtimeQueryScope }),
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });

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

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(result.status).toBe("blocked_tool");
      expect(result.recordIds).toEqual(["OPENAI-REALTIME-POLICY"]);

      const scopedResponse = await fetch(`${baseUrl}/query/realtime-tool`, {
        body: JSON.stringify({
          argumentsJson: JSON.stringify({
            question: "which selected evidence supports S3-L1?",
            ...selectedRealtimeQueryScope
          }),
          name: "query.answer"
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const scopedResult = (await scopedResponse.json()) as {
        recordIds: string[];
        status: string;
      };

      expect(scopedResponse.status).toBe(200);
      expect(scopedResult.status).toBe("ok");
      expect(scopedResult.recordIds).toEqual([...selectedRealtimeQueryScope.recordIds]);

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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "which selected evidence supports S3-L1?", ...selectedRealtimeQueryScope }),
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
        body: JSON.stringify({ question: "which selected evidence supports S3-L1?", ...selectedRealtimeQueryScope }),
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
        body: JSON.stringify({ question: "which selected evidence supports S3-L1?", ...selectedRealtimeQueryScope }),
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });

    try {
      const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
        body: JSON.stringify({ question: "which selected evidence supports S3-L1?", ...selectedRealtimeQueryScope }),
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

function stringifyRequestUrl(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
}

function emitForensicsHandoffReceipts(request: Parameters<LiveForensicsStreamRunner>[0]): void {
  if (request.agentHookAudit === undefined) {
    throw new Error("Expected live query agent hook audit.");
  }

  request.agentHookAudit.onReceipt(
    createAgentHookAuditReceipt({
      agentName: "Forensics Investigator",
      hook: "agent_start",
      recordIds: request.agentHookAudit.recordIds
    })
  );
  request.agentHookAudit.onReceipt(
    createAgentHookAuditReceipt({
      agentName: "Forensics Investigator",
      hook: "agent_handoff",
      nextAgentName: "Recovery Drafter",
      recordIds: request.agentHookAudit.recordIds
    })
  );
  request.agentHookAudit.onReceipt(
    createAgentHookAuditReceipt({
      agentName: "Recovery Drafter",
      hook: "agent_start",
      recordIds: request.agentHookAudit.recordIds
    })
  );
}

function liveQueryDeltaStream(
  delta: string,
  recordIds: readonly string[] = ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"]
): AsyncIterable<unknown> {
  return (async function* stream() {
    await Promise.resolve();
    yield* sdkSelectedEvidenceToolEvents(recordIds);
    yield {
      data: {
        delta,
        type: "output_text_delta"
      },
      type: "raw_model_stream_event"
    };
  })();
}

function liveQueryRunnerWithForensicsHandoff(): ReturnType<typeof vi.fn<LiveForensicsStreamRunner>> {
  return vi.fn<LiveForensicsStreamRunner>((request) => {
    emitForensicsHandoffReceipts(request);
    return liveQueryDeltaStream(
      "Live query answer candidate suppressed by Recoup output guard.",
      selectedLiveQueryRecordIds(request)
    );
  });
}

function selectedLiveQueryRecordIds(request: Parameters<LiveForensicsStreamRunner>[0]): string[] {
  return request.agentHookAudit?.recordIds ?? ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"];
}

function sdkSelectedEvidenceToolEvents(recordIds: readonly string[]): unknown[] {
  return [
    sdkSelectedEvidenceToolEvent("tool_called", recordIds),
    sdkSelectedEvidenceToolEvent("tool_output", recordIds)
  ];
}

function sdkSelectedEvidenceToolEvent(name: "tool_called" | "tool_output", recordIds: readonly string[]): unknown {
  const scopedRecordIds = recordIds.length === 0 ? ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"] : [...recordIds];
  const selectedLineId = scopedRecordIds[0] ?? "S6-L1";
  const sapEvidenceRecordIds = buildSapEvidenceProofRecordIds(selectedLineId, scopedRecordIds);

  return {
    item: {
      agent: { name: "Forensics Investigator" },
      rawItem: {
        ...(name === "tool_called"
          ? {
              arguments: {
                question: "Why is this recoverable?",
                recordIds: scopedRecordIds,
                selectedLineId
              }
            }
          : {
              output: {
                sourceReadStatus: "source_backed_selected_scope",
                sourceReads: {
                  canonicalModel: "EvidenceDocument",
                  sapEvidence: [
                    {
                      documentId: sapEvidenceRecordIds.find((recordId) => recordId.startsWith("SAP-")) ?? "SAP-INV-S6-1",
                      documentType: "invoice",
                      recordIds: sapEvidenceRecordIds,
                      source: "sap",
                      summary: `Supabase SAP source row for ${selectedLineId}.`
                    }
                  ],
                  selectedLineId,
                  selectedRecordIds: scopedRecordIds
                }
              }
            }),
        name: "query_answer",
        type: name === "tool_called" ? "function_call" : "function_call_result"
      }
    },
    name,
    type: "run_item_stream_event"
  };
}

function buildSapEvidenceProofRecordIds(selectedLineId: string, scopedRecordIds: readonly string[]): string[] {
  const sapScopedIds = scopedRecordIds.filter((recordId) => recordId.startsWith("SAP-") || recordId.startsWith("INV-"));
  return Array.from(new Set([selectedLineId, ...sapScopedIds]));
}

async function listenWithoutGovernedConfig(
  options?: Parameters<typeof createCockpitApi>[0]
): Promise<{ baseUrl: string; server: Server }> {
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

async function listenWithoutReleaseOwnerInputs(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(
    createCockpitApi({
      env: governedConfigEnv,
      memoryFetcher: withGovernedConfigOnlyFetcher()
    })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    server
  };
}

function withGovernedConfigFetcher(fetcher?: SupabaseMemoryFetch): SupabaseMemoryFetch {
  return async (url, init) => {
    if (url.includes("/rest/v1/recoup_config")) {
      if (new URL(url).searchParams.get("key")?.includes("run_control") === true) {
        return Promise.resolve(
          new Response(JSON.stringify(toPostgrestReleaseOwnerInputRows()), {
            status: 200
          })
        );
      }

      return withGovernedConfigOnlyFetcher()(url, init);
    }

    if (isSettlementSourceUrl(url)) {
      const tableName = new URL(url).pathname.split("/").at(-1) ?? "";
      return Promise.resolve(new Response(JSON.stringify(toPostgrestSettlementRows(tableName)), { status: 200 }));
    }

    if (isSyntheticEvidenceSourceUrl(url)) {
      const parsedUrl = new URL(url);
      const tableName = parsedUrl.pathname.split("/").at(-1) ?? "";
      const customerIds = readCustomerIdFilter(parsedUrl.searchParams.get("customer_id"));
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerIds)), { status: 200 })
      );
    }

    if (isToolsDataRiskObservationUrl(url)) {
      if (fetcher === undefined) {
        return toolsDataRiskObservationFetcher([])(url, init);
      }

      const response = await fetcher(url, init);
      return response.status === 404 ? toolsDataRiskObservationFetcher([])(url, init) : response;
    }

    return fetcher === undefined
      ? Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      : fetcher(url, init);
  };
}

function toolsDataRiskObservationFetcher(calls: string[]): SupabaseMemoryFetch {
  return (url, init) => {
    calls.push(url);
    expect(init.headers).toMatchObject({
      apikey: "supabase-secret-key",
      authorization: "Bearer supabase-secret-key"
    });

    const tableName = new URL(url).pathname.split("/").at(-1);
    if (tableName === "customers") {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              customer_id: "USCU_S04",
              customer_name: "Harbor Foods"
            }
          ]),
          { status: 200 }
        )
      );
    }
    if (tableName === "payments") {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000060" },
            { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "INV-HARB-003" },
            { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
          ]),
          { status: 200 }
        )
      );
    }
    if (tableName === "bureau_alerts") {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              alert_id: "BUREAU-HARBOR-TAX-LIEN",
              alert_type: "TAX_LIEN",
              customer_id: "USCU_S04",
              resolved: false,
              severity: "CRITICAL"
            }
          ]),
          { status: 200 }
        )
      );
    }
    if (tableName === "deductions_backlog") {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S7", invoice_ref: "90000005", verdict: "PARTIAL" },
            { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
          ]),
          { status: 200 }
        )
      );
    }

    throw new Error(`Unexpected Tools_data risk table ${String(tableName)}.`);
  };
}

function missingToolsDataRiskObservationFetcher(calls: string[]): SupabaseMemoryFetch {
  return (url) => {
    calls.push(url);

    if (isToolsDataRiskObservationUrl(url)) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function missingSyntheticEvidenceSourceFetcher(calls: string[]): SupabaseMemoryFetch {
  return (url, init) => {
    calls.push(url);

    if (url.includes("/rest/v1/recoup_config")) {
      return withGovernedConfigOnlyFetcher()(url, init);
    }

    if (isSettlementSourceUrl(url)) {
      const tableName = new URL(url).pathname.split("/").at(-1) ?? "";
      return Promise.resolve(new Response(JSON.stringify(toPostgrestSettlementRows(tableName)), { status: 200 }));
    }

    if (url.includes("/rest/v1/recoup_src_sap")) {
      const parsedUrl = new URL(url);
      const tableName = parsedUrl.pathname.split("/").at(-1) ?? "";
      const customerIds = readCustomerIdFilter(parsedUrl.searchParams.get("customer_id"));
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerIds)), { status: 200 })
      );
    }

    if (isSyntheticEvidenceSourceUrl(url)) {
      return Promise.resolve(new Response(JSON.stringify({ error: "missing source evidence table" }), { status: 404 }));
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function missingSapEvidenceSourceFetcher(calls: string[]): SupabaseMemoryFetch {
  return (url, init) => {
    calls.push(url);

    if (url.includes("/rest/v1/recoup_config")) {
      return withGovernedConfigOnlyFetcher()(url, init);
    }

    if (isSettlementSourceUrl(url)) {
      const tableName = new URL(url).pathname.split("/").at(-1) ?? "";
      return Promise.resolve(new Response(JSON.stringify(toPostgrestSettlementRows(tableName)), { status: 200 }));
    }

    if (url.includes("/rest/v1/recoup_src_sap")) {
      return Promise.resolve(new Response(JSON.stringify({ error: "missing SAP source evidence table" }), { status: 404 }));
    }

    if (isSyntheticEvidenceSourceUrl(url)) {
      const parsedUrl = new URL(url);
      const tableName = parsedUrl.pathname.split("/").at(-1) ?? "";
      const customerIds = readCustomerIdFilter(parsedUrl.searchParams.get("customer_id"));
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerIds)), { status: 200 })
      );
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function missingSettlementSourceRowsFetcher(calls: string[]): SupabaseMemoryFetch {
  return (url, init) => {
    calls.push(url);

    if (url.includes("/rest/v1/recoup_config")) {
      return withGovernedConfigOnlyFetcher()(url, init);
    }

    if (isSettlementSourceUrl(url)) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function missingEvidenceAfterRiskObservationFetcher(calls: string[]): SupabaseMemoryFetch {
  return (url, init) => {
    calls.push(url);

    if (url.includes("/rest/v1/recoup_config")) {
      return withGovernedConfigOnlyFetcher()(url, init);
    }

    if (isSettlementSourceUrl(url)) {
      const tableName = new URL(url).pathname.split("/").at(-1) ?? "";
      return Promise.resolve(new Response(JSON.stringify(toPostgrestSettlementRows(tableName)), { status: 200 }));
    }

    if (isToolsDataRiskObservationUrl(url)) {
      return toolsDataRiskObservationFetcher([])(url, init);
    }

    if (url.includes("/rest/v1/recoup_src_sap")) {
      const parsedUrl = new URL(url);
      const tableName = parsedUrl.pathname.split("/").at(-1) ?? "";
      const customerIds = readCustomerIdFilter(parsedUrl.searchParams.get("customer_id"));
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerIds)), { status: 200 })
      );
    }

    if (isSyntheticEvidenceSourceUrl(url)) {
      return Promise.resolve(new Response(JSON.stringify({ error: "missing source evidence table" }), { status: 404 }));
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function successfulRealBackendSourceFetcher(calls: string[]): SupabaseMemoryFetch {
  return sourceFetcherWithSapAvailability(calls, () => true);
}

function vectorStoreSearchResponseForS6(): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          attributes: {
            customer_id: "CUST-CRESTLINE",
            documentType: "contract",
            provenance: "synthetic",
            record_id: "PRICE-CLAUSE-1",
            recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
            scenario_type: "Pricing chargeback below contracted price",
            source_table: "recoup_src_docs"
          },
          content: [
            {
              text: "Vector recall found the pricing clause passage for the contracted-price dispute.",
              type: "text"
            }
          ],
          file_id: "file-vector-runtime-contract",
          filename: "pricing-clause.pdf",
          score: 0.91
        }
      ]
    }),
    { status: 200 }
  );
}

function recoverableSapEvidenceSourceFetcher(calls: string[], sapRowsAvailable: () => boolean): SupabaseMemoryFetch {
  return sourceFetcherWithSapAvailability(calls, sapRowsAvailable);
}

function recoverablePartialDocsEvidenceSourceFetcher(calls: string[], docsRowsAvailable: () => boolean): SupabaseMemoryFetch {
  return sourceFetcherWithSapAvailability(calls, () => true, { docsRowsAvailable });
}

function riskObservationMissingAfterForensicsCacheFetcher(calls: string[]): SupabaseMemoryFetch {
  return sourceFetcherWithSapAvailability(calls, () => true, { riskObservationRowsAvailable: false });
}

function sapEvidenceFailsAfterInitialValidatedContextFetcher(calls: string[]): SupabaseMemoryFetch {
  const initialSapReadBudget = buildSyntheticDataset({ seed: 42 }).deductionLines.length;
  let sapEvidenceReadCount = 0;

  return sourceFetcherWithSapAvailability(calls, () => {
    sapEvidenceReadCount += 1;
    return sapEvidenceReadCount <= initialSapReadBudget;
  });
}

function sourceFetcherWithSapAvailability(
  calls: string[],
  sapRowsAvailable: () => boolean,
  options: { docsRowsAvailable?: () => boolean; riskObservationRowsAvailable?: boolean } = {}
): SupabaseMemoryFetch {
  return (url, init) => {
    calls.push(url);

    if (url.includes("/rest/v1/recoup_config")) {
      if (new URL(url).searchParams.get("key")?.includes("run_control") === true) {
        return Promise.resolve(new Response(JSON.stringify(toPostgrestReleaseOwnerInputRows()), { status: 200 }));
      }

      return withGovernedConfigOnlyFetcher()(url, init);
    }

    if (isSettlementSourceUrl(url)) {
      const tableName = new URL(url).pathname.split("/").at(-1) ?? "";
      return Promise.resolve(new Response(JSON.stringify(toPostgrestSettlementRows(tableName)), { status: 200 }));
    }

    if (isToolsDataRiskObservationUrl(url)) {
      if (options.riskObservationRowsAvailable === false) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      return toolsDataRiskObservationFetcher([])(url, init);
    }

    if (url.includes("/rest/v1/recoup_src_sap")) {
      if (!sapRowsAvailable()) {
        return Promise.resolve(new Response(JSON.stringify({ error: "SAP source read blocked" }), { status: 404 }));
      }
    }

    if (isSyntheticEvidenceSourceUrl(url)) {
      const parsedUrl = new URL(url);
      const tableName = parsedUrl.pathname.split("/").at(-1) ?? "";
      const customerIds = readCustomerIdFilter(parsedUrl.searchParams.get("customer_id"));
      if (tableName === "recoup_src_docs" && options.docsRowsAvailable?.() === false) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerIds)), { status: 200 })
      );
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function isToolsDataRiskObservationUrl(url: string): boolean {
  const tableName = new URL(url).pathname.split("/").at(-1);
  return tableName === "customers" || tableName === "payments" || tableName === "bureau_alerts" || tableName === "deductions_backlog";
}

function isSettlementSourceUrl(url: string): boolean {
  const tableName = new URL(url).pathname.split("/").at(-1);
  return tableName === "recoup_customers" || tableName === "recoup_deduction_lines";
}

function isSyntheticEvidenceSourceUrl(url: string): boolean {
  const tableName = new URL(url).pathname.split("/").at(-1);
  return (
    tableName === "recoup_src_bureau" ||
    tableName === "recoup_src_docs" ||
    tableName === "recoup_src_remittance" ||
    tableName === "recoup_src_sap" ||
    tableName === "recoup_src_tpm"
  );
}

function expectedForensicsSourceTableReads(): number {
  return 1;
}

function sourceTableReadCount(calls: readonly string[], tableName: string): number {
  return calls.filter((url) => new URL(url).pathname.split("/").at(-1) === tableName).length;
}

function toPostgrestSettlementRows(tableName: string): unknown[] {
  const dataset = buildSyntheticDataset({ seed: 42 });
  if (tableName === "recoup_customers") {
    return dataset.customers.map((customer) => ({
      customer_id: customer.customerId,
      name: customer.name,
      profile: customer.profile
    }));
  }
  if (tableName === "recoup_deduction_lines") {
    return dataset.deductionLines.map((line) => ({
      amount: line.amount.toFixed(2),
      customer_id: line.customerId,
      event_id: line.eventId,
      line_id: line.lineId,
      period: line.period,
      record_ids_json: line.recordIds,
      routing: line.routing,
      rule_id: line.ruleId,
      rule_input_json: line.ruleInput,
      scenario_id: line.scenarioId,
      scenario_type: line.scenarioType,
      verdict: line.verdict
    }));
  }

  return [];
}

function toPostgrestSyntheticEvidenceRows(tableName: string, customerIds: readonly string[] | undefined): unknown[] {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const lines = dataset.deductionLines.filter((line) => customerIds === undefined || customerIds.includes(line.customerId));

  if (tableName === "recoup_src_docs") {
    return lines
      .filter((line) => line.ruleId !== "promo-overclaim")
      .map((line) => ({
        customer_id: line.customerId,
        doc_id: `DOC-${line.lineId}`,
        doc_type: docTypeForSyntheticEvidenceLine(line.ruleId),
        linked_record_ids: line.recordIds,
        provenance: "synthetic",
        signed_date: "2026-06-20",
        uri: `supabase://recoup_src_docs/DOC-${line.lineId}`
      }));
  }

  if (tableName === "recoup_src_tpm") {
    return [
      {
        accrued_amount: "14600.00",
        approved_allowance: "14600.00",
        claim_refs: ["S2-L1", "S2-L2", "TPM-CONTRACT-1", "TPM-CONTRACT-2"],
        customer_id: "CUST-CRESTLINE",
        product_scope: { sku: "demo" },
        promo_id: "TPM-CRESTLINE-JUNE",
        promo_type: "allowance",
        provenance: "synthetic",
        window_end: "2026-06-30",
        window_start: "2026-06-01"
      },
      {
        accrued_amount: "15900.00",
        approved_allowance: "15900.00",
        claim_refs: ["S7-L1", "S7-L2", "TPM-ACCRUAL-1", "TPM-ACCRUAL-2"],
        customer_id: "CUST-HARBOR",
        product_scope: { sku: "demo" },
        promo_id: "TPM-HARBOR-JUNE",
        promo_type: "allowance",
        provenance: "synthetic",
        window_end: "2026-06-30",
        window_start: "2026-06-01"
      }
    ].filter((row) => customerIds === undefined || customerIds.includes(row.customer_id));
  }

  if (tableName === "recoup_src_bureau") {
    const customerIds = [...new Set(lines.map((line) => line.customerId))];
    return customerIds.map((sourceCustomerId) => ({
      as_of_date: "2026-06-20",
      bureau_id: `BUREAU-${sourceCustomerId}`,
      customer_id: sourceCustomerId,
      delinquency_flag: false,
      limit_recommendation: "0.00",
      provenance: "synthetic",
      public_records: {},
      risk_score: 50
    }));
  }

  if (tableName === "recoup_src_sap") {
    return lines.flatMap((line) =>
      line.recordIds
        .filter((recordId) => recordId.startsWith("INV-"))
        .map((recordId) => ({
          customer_id: line.customerId,
          document_type: "invoice",
          entity_set: "C_BillingDocumentFs",
          linked_record_ids: line.recordIds,
          payload_json: { BillingDocument: recordId.replace(/^INV-/u, "") },
          provenance: "sap-odata",
          retrieved_at: "2026-06-20T00:00:00.000Z",
          sap_document_id: `SAP-${recordId}`,
          service_name: "ZUI_BILLINGDOCUMENTFS_0001",
          summary: `Supabase SAP source row for ${recordId}.`
        }))
    );
  }

  return [];
}

function readCustomerIdFilter(value: string | null): string[] | undefined {
  if (value === null) {
    return undefined;
  }
  if (value.startsWith("eq.")) {
    return [value.slice("eq.".length)];
  }
  if (value.startsWith("in.(") && value.endsWith(")")) {
    return value
      .slice("in.(".length, -1)
      .split(",")
      .map((customerId) => customerId.replace(/^"|"$/gu, ""))
      .filter((customerId) => customerId.length > 0);
  }

  throw new Error(`Unexpected customer_id filter ${value}.`);
}

function docTypeForSyntheticEvidenceLine(ruleId: string): "POD" | "TPM" | "contract" | "correspondence" {
  if (ruleId === "promo-not-captured") {
    return "TPM";
  }
  if (ruleId === "otif-fine-valid" || ruleId === "pricing-below-contract") {
    return "contract";
  }
  if (ruleId === "duplicate-credit") {
    return "correspondence";
  }

  return "POD";
}

function withGovernedConfigOnlyFetcher(): SupabaseMemoryFetch {
  return (url) => {
    if (url.includes("/rest/v1/recoup_config")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            governedConfigSeedRows.map((row) => ({
              active: row.active,
              approved_by: row.approvedBy,
              config_hash: row.configHash,
              config_version: row.configVersion,
              effective_from: row.effectiveFrom,
              key: row.key,
              value_json: row.valueJson
            }))
          ),
          { status: 200 }
        )
      );
    }

    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  };
}

function toPostgrestReleaseOwnerInputRows() {
  const rowInputs = [
    {
      key: "run_control",
      valueJson: {
        phases: {
          containment: { retryCap: 2, stepBudget: 24, tokenBudget: 45000 },
          forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 },
          query: { retryCap: 1, stepBudget: 12, tokenBudget: 32000 },
          recovery: { retryCap: 2, stepBudget: 40, tokenBudget: 90000 },
          riskMesh: { retryCap: 2, stepBudget: 36, tokenBudget: 90000 },
          sentinel: { retryCap: 2, stepBudget: 30, tokenBudget: 70000 }
        }
      }
    },
    {
      key: "release_eval_label_manifest",
      valueJson: {
        arbitrationCaseIds: ["arb:harbor-order-6534"],
        intentCaseIds: ["intent:USCU_L10", "intent:USCU_S04", "intent:USCU_S07", "intent:USCU_S03"]
      }
    },
    {
      key: "intent_eval_labels",
      valueJson: {
        labels: [
          {
            actual: "gaming",
            caseId: "intent:USCU_L10",
            modelCustomerId: "CUST-CRESTLINE",
            recordIds: ["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"],
            sapCustomerId: "USCU_L10"
          },
          {
            actual: "distressed-honest",
            caseId: "intent:USCU_S04",
            modelCustomerId: "CUST-HARBOR",
            recordIds: ["FIN-DISP-202", "BUREAU-HARBOR-TAX-LIEN", "90000036", "90000085"],
            sapCustomerId: "USCU_S04"
          },
          {
            actual: "genuine",
            caseId: "intent:USCU_S07",
            modelCustomerId: "CUST-VALUMART",
            recordIds: ["S4-L1", "SLA-CONTRACT-1", "S5-L1", "POD-TIMESTAMP-1"],
            sapCustomerId: "USCU_S07"
          },
          {
            actual: "genuine",
            caseId: "intent:USCU_S03",
            modelCustomerId: "CUST-GREENLEAF",
            recordIds: ["S1-L1", "PHOTO-CARRIER-1", "POD-90000002"],
            sapCustomerId: "USCU_S03"
          }
        ]
      }
    },
    {
      key: "arbitration_eval_labels",
      valueJson: {
        labels: [
          {
            actual: "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit",
            caseId: "arb:harbor-order-6534",
            expectedRanking: ["partial_release_55", "full_release_revised_terms", "full_release_100", "full_hold_0"],
            modelCaseId: "ARB-HARBOR-ORDER-640K",
            recordIds: ["6534", "USCU_S04", "LEDGER-6-PARTIAL-HOLD"],
            sapOrderId: "6534"
          }
        ]
      }
    }
  ] as const;

  return rowInputs.map((row) => ({
    active: true,
    approved_by: "human:rathish-owner",
    config_hash: sha256CanonicalJson(row.valueJson),
    config_version: 1,
    effective_from: "2026-06-22T00:00:00.000Z",
    key: row.key,
    value_json: row.valueJson
  }));
}

function signedDemoProxyHeaders(input: {
  body: string;
  issuedAt?: string;
  method?: string;
  nonce?: string;
  path: string;
  principal: string;
  purpose: string;
  role: string;
  secret: string;
}): Record<string, string> {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const method = input.method ?? "POST";
  const nonce = input.nonce ?? randomUUID();
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  const payload = [
    "v1",
    input.purpose,
    method.toUpperCase(),
    input.path,
    bodyHash,
    issuedAt,
    nonce,
    input.role,
    input.principal
  ].join("\n");

  return {
    "content-type": "application/json",
    "x-recoup-demo-body-sha256": bodyHash,
    "x-recoup-demo-issued-at": issuedAt,
    "x-recoup-demo-nonce": nonce,
    "x-recoup-demo-proof": createHmac("sha256", input.secret).update(payload).digest("base64url"),
    "x-recoup-demo-role": input.role,
    "x-recoup-human-principal": input.principal,
    "x-recoup-human-token": cockpitAuthEnv.RECOUP_COCKPIT_AUTH_TOKEN
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupabaseMemoryTestRow(value: unknown): value is { category: string; id: string; scope: string } {
  return (
    isJsonRecord(value) &&
    typeof value["category"] === "string" &&
    typeof value["id"] === "string" &&
    typeof value["scope"] === "string"
  );
}
