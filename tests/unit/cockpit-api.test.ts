import { createServer, type Server } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed, governedConfigSeedRows, sha256CanonicalJson } from "../../config/governed.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createRuntimeMemoryStore } from "../../src/memory/runtime.js";
import { readAgentHandoffPacket, readSessionState, readTransactionState } from "../../src/memory/session.js";
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

  it("serves R1 Supabase fallback source-read plans without source secrets", async () => {
    const { baseUrl, server } = await listen({
      env: {
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key"
      }
    });
    try {
      const response = await fetch(`${baseUrl}/sources/r1/outbound-delivery?deliveryRef=DEL_GREEN_01`);
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
      const response = await fetch(`${baseUrl}/sources/r1/credit-exposure?businessPartner=USCU_S04`);
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
      const missingKey = await fetch(`${baseUrl}/sources/r1/invoice`);
      const malformedSapPrimary = await fetch(`${baseUrl}/sources/r1/invoice?billingDocument=80000002`);
      const broaderNeed = await fetch(`${baseUrl}/sources/r1/aging-grid?customerId=USCU_S04`);
      const overbroadFallback = await fetch(`${baseUrl}/sources/r1/payment-history?customerId=USCU_S04&invoiceRef=90000002`);

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
      expect(model.personas.map((persona) => persona.defaultRoute)).toEqual(["/forensics", "/credit", "/cfo"]);
      expect(model.personas.map((persona) => persona.allowedRouteCount)).toEqual([2, 1, 5]);
      expect(model.personas.every((persona) => persona.sourceMode === "deterministic_demo_profile")).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("serves the Forensics read model and approval decisions through REST", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
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
      const modelResponse = await fetch(`${baseUrl}/forensics`);
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
    const server = createServer(
      createCockpitApi({
        env: governedConfigEnv,
        memoryFetcher: missingSyntheticEvidenceSourceFetcher(calls)
      })
    );
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(address.port)}`;

    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
      const body = (await modelResponse.json()) as { error: string };

      expect(modelResponse.status).toBe(503);
      expect(body.error).toBe("Supabase source evidence rows are unavailable or failed validation.");
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_sap"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_docs"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_tpm"))).toBe(true);
      expect(calls.some((url) => url.includes("/rest/v1/recoup_src_bureau"))).toBe(true);
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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

  it("rejects role-derived principals that do not match the configured direct API principal", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
    try {
      const modelResponse = await fetch(`${baseUrl}/forensics`);
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

  it("requires a human reason when modifying or rejecting an approval item", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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
    let commitAttempts = 0;
    const memoryFetcher: SupabaseMemoryFetch = (url, init) => {
      if (init.method === "GET" && url.includes("/rest/v1/recoup_audit_chain")) {
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

  it("keeps internal service approval decisions from committing outside Supabase", async () => {
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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
      expect(JSON.stringify({ approval, rpcPayloads })).not.toContain("supabase-secret-key");
      expect(JSON.stringify(memory)).not.toContain("supabase-secret-key");
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
    const { baseUrl, server } = await listenWithoutReleaseOwnerInputs();
    try {
      const response = await fetch(`${baseUrl}/run`);
      const body = (await response.json()) as {
        error: string;
        runControl: { reason?: string; status: string };
      };

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
      expect(body.error).toBe("Supabase release owner-input recoup_config rows are required for run-control.");
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });
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
    const { baseUrl, server } = await listen({ env: cockpitApprovalEnv });

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

function stringifyRequestUrl(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
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
      const customerId = parsedUrl.searchParams.get("customer_id")?.replace(/^eq\./u, "");
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerId)), { status: 200 })
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

    if (isSyntheticEvidenceSourceUrl(url)) {
      return Promise.resolve(new Response(JSON.stringify({ error: "missing source evidence table" }), { status: 404 }));
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

function toPostgrestSyntheticEvidenceRows(tableName: string, customerId: string | undefined): unknown[] {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const lines = dataset.deductionLines.filter((line) => customerId === undefined || line.customerId === customerId);

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
    ].filter((row) => customerId === undefined || row.customer_id === customerId);
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
