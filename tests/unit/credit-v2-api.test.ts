import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { LiveForensicsStreamRunner } from "../../src/agents/liveForensicsStream.js";
import { createAgentHookAuditReceipt } from "../../src/services/conductor.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";
import type { SupabaseMemoryFetch } from "../../src/memory/supabaseStore.js";
import type { OpenAiVectorStoreFetch } from "../../src/adapters/openAiVectorStore.js";
import { creditNegotiationPolicyCandidateRows, parseActiveCreditNegotiationPolicyRows } from "../../src/services/creditNegotiationPolicy.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";
import {
  governedConfigPostgrestRows,
  releaseOwnerInputPostgrestRows,
  rowsForCreditNegotiationTable,
  rowsForCreditRiskTable
} from "./fixtures/creditRiskSupabaseFixture.js";

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

const governedConfigEnv = {
  RECOUP_MEMORY_BACKEND: "supabase",
  RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

describe("GET /credit/v2", () => {
  it("returns the deterministic credit risk review surface from seeded Supabase rows", async () => {
    const calls: string[] = [];
    const { baseUrl, server } = await listen(creditRiskFetcher(calls));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        accounts: Array<{
          accountId: string;
          evidenceDocuments?: Array<{ documentId: string; recordIds: string[]; synthetic: boolean }>;
          verdict: string;
        }>;
        surface: string;
      };

      expect(response.status).toBe(200);
      expect(body.surface).toBe("credit-risk-review");
      expect(body.accounts).toHaveLength(4);
      const crestlineEvidenceDocument = body.accounts
        .find((account) => account.accountId === "ACC-CRE")
        ?.evidenceDocuments?.find((document) => document.documentId === "EVD-CREDIT-ACC-CRE-AR");
      expect(crestlineEvidenceDocument?.synthetic).toBe(true);
      expect(crestlineEvidenceDocument?.recordIds).toEqual(expect.arrayContaining(["ACC-CRE", "S3", "S6"]));
      expect([...body.accounts.map((account) => `${account.accountId}:${account.verdict}`)].sort()).toEqual([
        "ACC-CRE:HIGH",
        "ACC-GRE:CLEAR",
        "ACC-HAR:ELEVATED",
        "ACC-VAL:WATCH"
      ]);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.stringContaining("/rest/v1/recoup_config"),
          expect.stringContaining("/rest/v1/credit_snapshot"),
          expect.stringContaining("/rest/v1/credit_accounts"),
          expect.stringContaining("/rest/v1/credit_evidence_documents"),
          expect.stringContaining("/rest/v1/credit_policy")
        ])
      );
    } finally {
      await close(server);
    }
  });

  it("fails closed with a missingSource when credit accounts are unavailable", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], { emptyTables: ["credit_accounts"] }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "Supabase credit risk credit_accounts rows are unavailable or failed validation.",
        missingSource: "supabase-credit-risk-credit_accounts"
      });
    } finally {
      await close(server);
    }
  });

  it("fails closed as JSON when the credit snapshot fetch fails", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], { throwingTables: ["credit_snapshot"] }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const bodyText = await response.text();

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(bodyText).not.toContain("fetch failed");
      expect(JSON.parse(bodyText) as unknown).toMatchObject({
        error: "Supabase credit risk credit_snapshot rows are unavailable or failed validation.",
        missingSource: "supabase-credit-risk-credit_snapshot"
      });
    } finally {
      await close(server);
    }
  });

  it("reads committed approval receipts from governed backend records", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], {
      approvalRecords: [
        approvalRecordRow("credit-v2:ACC-CRE", ["credit-v2:ACC-CRE", "ACC-CRE", "S4"], "a".repeat(64))
      ]
    }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        accounts: Array<{
          accountId: string;
          negotiationOrders?: Array<{ orderId: string; sourceRecordIds: string[] }>;
          packet: { actionId: string; approvalStatus: string; auditEntryHash?: string };
        }>;
      };

      expect(response.status).toBe(200);
      expect(body.accounts.find((account) => account.accountId === "ACC-CRE")?.packet).toMatchObject({
        actionId: "credit-v2:ACC-CRE",
        approvalStatus: "committed",
        auditEntryHash: "a".repeat(64)
      });
      expect(body.accounts.find((account) => account.accountId === "ACC-HAR")?.packet).toMatchObject({
        actionId: "credit-v2:ACC-HAR",
        approvalStatus: "awaiting"
      });
      expect(body.accounts.find((account) => account.accountId === "ACC-HAR")?.negotiationOrders).toEqual([
        {
          nextRound: 1,
          orderId: "ORD-HARBOR-6534",
          sourceModeLabel: "governed Supabase negotiation source",
          sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
        }
      ]);
    } finally {
      await close(server);
    }
  });

  it("derives negotiation round state from durable backend round rows", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], {
      negotiationRoundRows: [
        {
          account_id: "ACC-HAR",
          order_id: "ORD-HARBOR-6534",
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          round_no: 1,
          status: "sent"
        }
      ]
    }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        accounts: Array<{
          accountId: string;
          negotiationOrders?: Array<{
            currentRound?: { actionId: string; round: number; status: string };
            latestSentRound?: { actionId: string; round: number; status: string };
            nextRound: number;
            orderId: string;
          }>;
        }>;
      };

      const harborOrder = body.accounts.find((account) => account.accountId === "ACC-HAR")?.negotiationOrders?.[0];

      expect(response.status).toBe(200);
      expect(harborOrder).toMatchObject({
        currentRound: {
          actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          round: 1,
          status: "sent"
        },
        latestSentRound: {
          actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          round: 1,
          status: "sent"
        },
        nextRound: 2,
        orderId: "ORD-HARBOR-6534"
      });
    } finally {
      await close(server);
    }
  });

  it("fails closed when negotiation round rows are unavailable", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], {
      failedTables: {
        credit_negotiation_rounds: 500
      }
    }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "Supabase credit negotiation credit_negotiation_rounds rows are unavailable or failed validation.",
        missingSource: "supabase-credit-negotiation-credit_negotiation_rounds"
      });
    } finally {
      await close(server);
    }
  });

  it("ignores negotiation approval receipts when building account approval packets", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], {
      approvalRecords: [
        approvalRecordRow("credit-v2:ACC-CRE", ["credit-v2:ACC-CRE", "ACC-CRE", "S4"], "a".repeat(64)),
        approvalRecordRow(
          "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          ["credit-v2:negotiation:ORD-HARBOR-6534:r1", "ACC-HAR", "ORD-HARBOR-6534"],
          "c".repeat(64)
        )
      ]
    }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        accounts: Array<{
          accountId: string;
          packet: { actionId: string; approvalStatus: string; auditEntryHash?: string };
        }>;
      };

      expect(response.status).toBe(200);
      expect(body.accounts.find((account) => account.accountId === "ACC-CRE")?.packet).toMatchObject({
        actionId: "credit-v2:ACC-CRE",
        approvalStatus: "committed",
        auditEntryHash: "a".repeat(64)
      });
      expect(body.accounts.find((account) => account.accountId === "ACC-HAR")?.packet).toMatchObject({
        actionId: "credit-v2:ACC-HAR",
        approvalStatus: "awaiting"
      });
    } finally {
      await close(server);
    }
  });

  it("fails closed when approval receipts reference an unknown credit-v2 account", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], {
      approvalRecords: [
        approvalRecordRow("credit-v2:ACC-UNKNOWN", ["credit-v2:ACC-UNKNOWN", "ACC-UNKNOWN"], "b".repeat(64))
      ]
    }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "Credit approval receipt state is unavailable from governed backend sources.",
        missingSource: "approval_records"
      });
    } finally {
      await close(server);
    }
  });

  it("fails closed when a trusted credit-v2 approval receipt is malformed", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], {
      approvalRecords: [
        approvalRecordRow("credit-v2:ACC-CRE", ["credit-v2:ACC-CRE", "ACC-CRE"], "not-a-hash")
      ]
    }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "Credit approval receipt state is unavailable from governed backend sources.",
        missingSource: "approval_records"
      });
    } finally {
      await close(server);
    }
  });
});

describe("POST /credit/v2/simulate", () => {
  it("returns a deterministic Harbor simulation without reading approval records", async () => {
    const calls: string[] = [];
    const { baseUrl, server } = await listen(creditRiskFetcher(calls));

    try {
      const response = await fetch(`${baseUrl}/credit/v2/simulate`, {
        body: JSON.stringify({
          accountId: "ACC-HAR",
          scoreOverrides: {
            dsoPaymentDrift: 90
          }
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        amountSplit?: { proposedReleaseAmountLabel?: string };
        externalActionDispatched?: boolean;
        releaseRatioPercentLabel?: string;
      };

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        amountSplit: {
          proposedReleaseAmountLabel: "$640,010.00"
        },
        externalActionDispatched: false,
        releaseRatioPercentLabel: "100%"
      });
      expect(calls.some((call) => call.includes("/rest/v1/recoup_memory_records"))).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("fails closed when simulation source scores are unavailable for the selected account", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([]));

    try {
      const response = await fetch(`${baseUrl}/credit/v2/simulate`, {
        body: JSON.stringify({ accountId: "ACC-CRE" }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "David credit simulation is unavailable from governed backend sources.",
        missingSource: "credit-simulation-partial-hold-scores"
      });
    } finally {
      await close(server);
    }
  });
});

describe("GET /credit/v2/orders/:orderId/deals", () => {
  it("returns deterministic ranked deals from Supabase-style simulated rows without reading approval records", async () => {
    const calls: string[] = [];
    const { baseUrl, server } = await listen(creditRiskFetcher(calls));

    try {
      const response = await fetch(`${baseUrl}/credit/v2/orders/ORD-HARBOR-6534/deals`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        orderId?: string;
        rankedCandidates?: Array<{ candidateId: string; objectiveValue: string; rank: number }>;
        rejectedCandidates?: unknown[];
      };

      expect(response.status).toBe(200);
      expect(body.orderId).toBe("ORD-HARBOR-6534");
      expect(body.rankedCandidates?.map((candidate) => `${String(candidate.rank)}:${candidate.candidateId}:${candidate.objectiveValue}`)).toEqual([
        "1:max-release-85:75077.00",
        "2:partial-release-55:38888.38",
        "3:low-release-10:-13152.34"
      ]);
      expect(body.rejectedCandidates).toEqual([]);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.stringContaining("/rest/v1/credit_orders"),
          expect.stringContaining("/rest/v1/sim_3pl_inventory"),
          expect.stringContaining("/rest/v1/sim_cost_of_capital"),
          expect.stringContaining("/rest/v1/sim_pos_sellthrough"),
          expect.stringContaining("/rest/v1/credit_negotiation_policy")
        ])
      );
      expect(calls.some((call) => call.includes("/rest/v1/recoup_memory_records"))).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("persists deterministic ranked deal scenarios with replay hashes", async () => {
    const calls: string[] = [];
    const scenarioWrites: Array<Record<string, unknown>> = [];
    const baseFetcher = creditRiskFetcher(calls);
    const { baseUrl, server } = await listen((url, init) => {
      calls.push(`${init.method ?? "GET"} ${new URL(url).pathname}`);
      if (init.method === "POST" && url.includes("/rest/v1/credit_deal_scenarios")) {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as unknown : undefined;
        if (!Array.isArray(body)) {
          throw new Error("Expected credit_deal_scenarios persistence body to be an array.");
        }
        scenarioWrites.push(...body as Array<Record<string, unknown>>);
        return Promise.resolve(jsonResponse(body));
      }

      return baseFetcher(url, init);
    });

    try {
      const response = await fetch(`${baseUrl}/credit/v2/orders/ORD-HARBOR-6534/deals`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        optimizerRunId?: string;
        policyHash?: string;
        rankedCandidates?: Array<{ candidateId: string; objectiveValue: string; rank: number }>;
        sourceHash?: string;
      };

      expect(response.status).toBe(200);
      expect(scenarioWrites).toHaveLength(3);
      const firstScenario = scenarioWrites[0];
      expect(firstScenario).toBeDefined();
      if (firstScenario === undefined) {
        return;
      }
      expect(firstScenario).toMatchObject({
        candidate_id: "max-release-85",
        order_id: "ORD-HARBOR-6534",
        optimizer_run_id: body.optimizerRunId,
        policy_hash: body.policyHash,
        ranked_position: 1,
        seed: 42,
        source_hash: body.sourceHash
      });
      expect(firstScenario["scenario_id"]).toBe(`${String(body.optimizerRunId)}:rank-1:max-release-85`);
      expect(firstScenario["objective_value"]).toBe("75077.00");
      expect(firstScenario["payload_json"]).toMatchObject({
        candidateId: "max-release-85",
        objectiveValue: "75077.00",
        rank: 1
      });
      expect(firstScenario["source_record_ids_json"]).toBeUndefined();
      expect(firstScenario["source_record_ids"]).toEqual(
        expect.arrayContaining(["credit_orders:ORD-HARBOR-6534", "credit_deal_candidate_grid:max-release-85"])
      );
      const candidateJson = firstScenario["candidate_json"];
      expect(typeof candidateJson).toBe("object");
      expect(candidateJson).not.toBeNull();
      expect(Array.isArray(candidateJson)).toBe(false);
      const candidateJsonRecord = candidateJson as Record<string, unknown>;
      expect(candidateJsonRecord["calculationHash"]).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/u));
      expect(candidateJsonRecord["candidateId"]).toBe("max-release-85");
      const terms = candidateJsonRecord["terms"] as Record<string, unknown>;
      expect(terms["depositPctLabel"]).toBe("60% deposit");
      expect(terms["releasePctLabel"]).toBe("85% release");
      expect(body.rankedCandidates?.map((candidate) => `${String(candidate.rank)}:${candidate.candidateId}`)).toEqual([
        "1:max-release-85",
        "2:partial-release-55",
        "3:low-release-10"
      ]);
    } finally {
      await close(server);
    }
  });

  it("re-optimizes from grammar-valid counter offers in governed Supabase rows", async () => {
    const calls: string[] = [];
    const scenarioWrites: Array<Record<string, unknown>> = [];
    const baseFetcher = creditRiskFetcher(calls, {
      counterOfferRows: [
        {
          account_id: "ACC-HAR",
          counter_offer_id: "counter-harbor-r1-complete",
          email_id: null,
          extracted_terms_json: {
            collateralRatio: "1.10",
            depositPct: "20",
            financingSpreadBps: "150",
            releasePct: "55",
            trancheCount: 2
          },
          message_id: null,
          order_id: "ORD-HARBOR-6534",
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "manual",
          status: "grammar_valid"
        }
      ]
    });
    const { baseUrl, server } = await listen((url, init) => {
      calls.push(`${init.method ?? "GET"} ${new URL(url).pathname}`);
      if (init.method === "POST" && url.includes("/rest/v1/credit_deal_scenarios")) {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as unknown : undefined;
        if (!Array.isArray(body)) {
          throw new Error("Expected credit_deal_scenarios persistence body to be an array.");
        }
        scenarioWrites.push(...body as Array<Record<string, unknown>>);
        return Promise.resolve(jsonResponse(body));
      }

      return baseFetcher(url, init);
    });

    try {
      const response = await fetch(`${baseUrl}/credit/v2/orders/ORD-HARBOR-6534/deals`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        rankedCandidates?: Array<{ candidateId: string; objectiveValue: string; sourceRecordIds: string[] }>;
        sourceHash?: string;
      };

      const counterCandidate = body.rankedCandidates?.find((candidate) => candidate.candidateId === "counter-offer:counter-harbor-r1-complete");

      expect(response.status).toBe(200);
      expect(calls.some((call) => call.includes("/rest/v1/credit_counter_offers"))).toBe(true);
      expect(counterCandidate).toBeDefined();
      if (counterCandidate === undefined) {
        return;
      }
      expect(counterCandidate.sourceRecordIds.includes("credit_counter_offers:counter-harbor-r1-complete")).toBe(true);
      expect(counterCandidate.objectiveValue).toEqual(expect.stringMatching(/^-?\d+\.\d{2}$/u));
      expect(scenarioWrites.some((row) => row["scenario_id"] === `${String(body.sourceHash)}:counter-offer`)).toBe(false);
      expect(scenarioWrites.some((row) => String(row["scenario_id"]).includes("counter-offer:counter-harbor-r1-complete"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("rejects malformed and human-review counter-offers without persisting them as ranked scenarios", async () => {
    const calls: string[] = [];
    const scenarioWrites: Array<Record<string, unknown>> = [];
    const baseFetcher = creditRiskFetcher(calls, {
      counterOfferRows: [
        {
          account_id: "ACC-HAR",
          counter_offer_id: "counter-harbor-r1-malformed",
          email_id: null,
          extracted_terms_json: {
            collateralRatio: "not-a-number",
            depositPct: "20",
            financingSpreadBps: "150",
            releasePct: "55",
            trancheCount: 2
          },
          message_id: null,
          order_id: "ORD-HARBOR-6534",
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "manual",
          status: "grammar_valid"
        },
        {
          account_id: "ACC-HAR",
          counter_offer_id: "counter-harbor-r1-human-review",
          email_id: null,
          extracted_terms_json: {
            collateralRatio: "1.10",
            depositPct: "20",
            financingSpreadBps: "150",
            releasePct: "55",
            trancheCount: 2
          },
          message_id: null,
          order_id: "ORD-HARBOR-6534",
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "manual",
          status: "human_review"
        }
      ]
    });
    const { baseUrl, server } = await listen((url, init) => {
      calls.push(`${init.method ?? "GET"} ${new URL(url).pathname}`);
      if (init.method === "POST" && url.includes("/rest/v1/credit_deal_scenarios")) {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as unknown : undefined;
        if (!Array.isArray(body)) {
          throw new Error("Expected credit_deal_scenarios persistence body to be an array.");
        }
        scenarioWrites.push(...body as Array<Record<string, unknown>>);
        return Promise.resolve(jsonResponse(body));
      }

      return baseFetcher(url, init);
    });

    try {
      const response = await fetch(`${baseUrl}/credit/v2/orders/ORD-HARBOR-6534/deals`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        rankedCandidates?: Array<{ candidateId: string }>;
        rejectedCandidates?: Array<{ candidateId: string; reason: string }>;
      };

      expect(response.status).toBe(200);
      expect(body.rankedCandidates?.map((candidate) => candidate.candidateId)).not.toContain("counter-offer:counter-harbor-r1-malformed");
      expect(body.rankedCandidates?.map((candidate) => candidate.candidateId)).not.toContain("counter-offer:counter-harbor-r1-human-review");
      expect(body.rejectedCandidates).toContainEqual(
        expect.objectContaining({
          candidateId: "counter-offer:counter-harbor-r1-malformed",
          reason: "Counter-offer collateralRatio must be a finite decimal."
        })
      );
      expect(scenarioWrites.some((row) => String(row["scenario_id"]).includes("counter-offer:counter-harbor-r1-malformed"))).toBe(false);
      expect(scenarioWrites.some((row) => String(row["scenario_id"]).includes("counter-offer:counter-harbor-r1-human-review"))).toBe(false);
    } finally {
      await close(server);
    }
  });

  it("fails closed when a simulated feed table is empty", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], { emptyTables: ["sim_pos_sellthrough"] }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2/orders/ORD-HARBOR-6534/deals`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "David deal optimizer is unavailable from governed backend sources.",
        missingSource: "supabase-credit-negotiation-sim_pos_sellthrough"
      });
    } finally {
      await close(server);
    }
  });
});

describe("POST /credit/query", () => {
  it("returns a Maya-style live-agent David investigation with token usage and cited credit evidence", async () => {
    const calls: string[] = [];
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      expect(request.input).toContain("Selected David credit risk query");
      expect(request.input).toContain("ACC-CRE");
      expect(request.input).toContain("credit_risk.answer");
      expect(request.mcpServiceContext?.creditRiskRows).toBeDefined();
      const creditRiskAnswerScope = request.mcpServiceContext?.creditRiskAnswerScope;
      expect(creditRiskAnswerScope?.accountId).toBe("ACC-CRE");
      for (const recordId of ["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"]) {
        expect(creditRiskAnswerScope?.recordIds.includes(recordId)).toBe(true);
      }
      expect(request.agentHookAudit?.recordIds).toEqual(
        expect.arrayContaining(["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"])
      );

      const recordIds = request.agentHookAudit?.recordIds ?? [];
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_start",
          recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_handoff",
          nextAgentName: "Action Packet Drafter",
          recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Action Packet Drafter",
          hook: "agent_start",
          recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkToolEvent("tool_called", "credit_risk_answer", "Credit Sentinel", {
          arguments: {
            accountId: "ACC-CRE",
            question: "Why is Crestline high risk?",
            recordIds
          }
        });
        yield sdkToolEvent("tool_output", "credit_risk_answer", "Credit Sentinel", {
          output: {
            sourceReadStatus: "source_backed_selected_scope",
            sourceReads: {
              canonicalModel: "CreditRiskEvidenceDocument",
              primarySourceLabel: "Supabase credit evidence documents",
              primarySourceSystem: "supabase",
              selectedEvidence: [
                {
                  documentId: "EVD-CREDIT-ACC-CRE-AR",
                  recordIds: ["ACC-CRE", "S3", "S6", "credit_ar_open_items", "credit_deductions"]
                }
              ],
              selectedRecordIds: recordIds,
              sourceFreshness: "snapshot",
              transportLabel: "Governed credit risk read-model",
              transportLayer: "supabase_credit_risk"
            }
          }
        });
        yield {
          data: {
            response: {
              usage: {
                input_tokens: 1700,
                input_tokens_details: {
                  cached_tokens: 512
                },
                output_tokens: 142,
                total_tokens: 1842
              }
            },
            type: "response.completed"
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen(creditRiskFetcher(calls), {
      creditRiskStreamRunner: liveRunner,
      env: { OPENAI_API_KEY: "sk-test-credit-query" }
    });

    try {
      const response = await fetch(`${baseUrl}/credit/query`, {
        body: JSON.stringify({
          accountId: "ACC-CRE",
          question: "Why is Crestline high risk?",
          recordIds: ["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"]
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answer?: string;
        citations: Array<{ recordId: string }>;
        deterministicBasis?: string;
        modelExecution?: {
          agentNames: string[];
          handoffCount: number;
          mode: string;
          rawModelTextPolicy: string;
          sourceReadMode?: string;
          tokenUsage?: number;
          tokenUsageSnapshot?: { cachedTokens?: number; inputTokens?: number; outputTokens?: number; totalTokens: number };
        };
        trace: Array<{ agentName: string; recordIds: string[] }>;
      };

      expect(liveRunner).toHaveBeenCalledTimes(1);
      expect(body.answer).toContain("ACC-CRE");
      expect(body.answer).not.toMatch(/\$\s*\d/u);
      expect(body.deterministicBasis).toContain("OpenAI Agents SDK live trace");
      expect(body.citations.map((citation) => citation.recordId)).toEqual(
        expect.arrayContaining(["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"])
      );
      expect(body.modelExecution).toMatchObject({
        agentNames: ["Credit Sentinel", "Action Packet Drafter"],
        handoffCount: 1,
        mode: "live_openai_agents",
        rawModelTextPolicy: "suppressed",
        sourceReadMode: "live_sdk_mcp",
        tokenUsage: 1842,
        tokenUsageSnapshot: {
          cachedTokens: 512,
          inputTokens: 1700,
          outputTokens: 142,
          totalTokens: 1842
        }
      });
      expect(body.trace.some((event) => event.agentName === "Action Packet Drafter")).toBe(true);
      expect(body.trace.every((event) => event.recordIds.includes("ACC-CRE"))).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("prices structure-only David negotiation drafts from the live agent through backend code", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      expect(request.input).toContain("credit_negotiation.draft_structures");
      expect(request.input).toContain("ORD-HARBOR-6534");
      expect(request.input).toContain("recordIds must include ACC-HAR, ORD-HARBOR-6534, and credit_orders:ORD-HARBOR-6534");
      expect(request.mcpServiceContext?.dealOptimizerRows).toBeDefined();
      const recordIds = request.agentHookAudit?.recordIds ?? [];
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_start",
          recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_handoff",
          nextAgentName: "Action Packet Drafter",
          recordIds
        })
      );

      return (async function* stream() {
        const draftToolInput = {
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          recordIds: ["ACC-HAR", "ORD-HARBOR-6534", "credit_orders:ORD-HARBOR-6534"],
          structures: [
            {
              candidateId: "agent-max-release-85",
              collateralRatio: "1.25",
              depositPct: "60",
              financingSpreadBps: "100",
              releasePct: "85",
              trancheCount: 3
            }
          ]
        };
        await Promise.resolve();
        yield sdkToolEvent("tool_called", "credit_risk_answer", "Credit Sentinel", {
          arguments: {
            accountId: "ACC-HAR",
            question: "Draft a safe structure for the Harbor counter-offer.",
            recordIds
          }
        });
        yield sdkToolEvent("tool_output", "credit_risk_answer", "Credit Sentinel", {
          output: {
            sourceReadStatus: "source_backed_selected_scope",
            sourceReads: {
              canonicalModel: "CreditRiskEvidenceDocument",
              primarySourceLabel: "Supabase credit evidence documents",
              primarySourceSystem: "supabase",
              selectedEvidence: [
                {
                  documentId: "EVD-CREDIT-ACC-HAR-TERMS",
                  recordIds: ["ACC-HAR", "S1", "S2", "credit_contract_tpm"]
                }
              ],
              selectedRecordIds: recordIds,
              sourceFreshness: "snapshot",
              transportLabel: "Governed credit risk read-model",
              transportLayer: "supabase_credit_risk"
            }
          }
        });
        yield sdkToolEvent("tool_called", "credit_negotiation_draft_structures", "Action Packet Drafter", {
          arguments: draftToolInput
        });
        yield sdkToolEvent("tool_output", "credit_negotiation_draft_structures", "Action Packet Drafter", {
          output: invokeServiceTool("credit_negotiation.draft_structures", draftToolInput, request.mcpServiceContext)
        });
        yield {
          data: {
            response: {
              usage: {
                input_tokens: 900,
                output_tokens: 100,
                total_tokens: 1000
              }
            },
            type: "response.completed"
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen(creditRiskFetcher([]), {
      creditRiskStreamRunner: liveRunner,
      env: { OPENAI_API_KEY: "sk-test-credit-query" }
    });

    try {
      const response = await fetch(`${baseUrl}/credit/query`, {
        body: JSON.stringify({
          accountId: "ACC-HAR",
          question: "Draft a safe structure for the Harbor counter-offer.",
          recordIds: ["ACC-HAR", "S1", "S2", "EVD-CREDIT-ACC-HAR-TERMS"]
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        modelExecution?: { mode: string; rawModelTextPolicy: string };
        negotiationDraft?: {
          deterministicBasis: string;
          model: {
            rankedCandidates: Array<{ candidateId: string; objectiveValueLabel: string; rank: number }>;
          };
          toolName: string;
        };
        trace: Array<{ toolName?: string }>;
      };

      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        rawModelTextPolicy: "suppressed"
      });
      expect(body.negotiationDraft).toMatchObject({
        deterministicBasis: "credit_negotiation.draft_structures + deterministic deal optimizer",
        model: {
          rankedCandidates: [
            {
              candidateId: "agent-max-release-85",
              objectiveValueLabel: "$75,077.00",
              rank: 1
            }
          ]
        },
        toolName: "credit_negotiation.draft_structures"
      });
      expect(JSON.stringify(body.negotiationDraft)).not.toContain("raw");
      expect(body.trace.some((event) => event.toolName === "credit_negotiation.draft_structures")).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("retries a draft-intent David query when the first live trace omits the negotiation draft tool", async () => {
    let liveCalls = 0;
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      liveCalls += 1;
      expect(request.input).toContain("credit_negotiation.draft_structures");
      expect(request.input).toContain("ORD-HARBOR-6534");
      expect(request.input).toContain("recordIds must include ACC-HAR, ORD-HARBOR-6534, and credit_orders:ORD-HARBOR-6534");
      if (liveCalls === 2) {
        expect(request.input).toContain("Validation retry");
        expect(request.input).toContain("credit_negotiation_draft_structures");
      }

      const recordIds = request.agentHookAudit?.recordIds ?? [];
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_handoff",
          nextAgentName: "Action Packet Drafter",
          recordIds
        })
      );

      return (async function* stream() {
        const draftToolInput = {
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          recordIds: ["ACC-HAR", "ORD-HARBOR-6534", "credit_orders:ORD-HARBOR-6534"],
          structures: [
            {
              candidateId: "agent-retry-max-release-85",
              collateralRatio: "1.25",
              depositPct: "60",
              financingSpreadBps: "100",
              releasePct: "85",
              trancheCount: 3
            }
          ]
        };
        await Promise.resolve();
        yield sdkToolEvent("tool_called", "credit_risk_answer", "Credit Sentinel", {
          arguments: {
            accountId: "ACC-HAR",
            question: "Draft a safe structure for the Harbor counter-offer.",
            recordIds
          }
        });
        yield sdkToolEvent("tool_output", "credit_risk_answer", "Credit Sentinel", {
          output: {
            sourceReadStatus: "source_backed_selected_scope",
            sourceReads: {
              canonicalModel: "CreditRiskEvidenceDocument",
              primarySourceLabel: "Supabase credit evidence documents",
              primarySourceSystem: "supabase",
              selectedEvidence: [
                {
                  documentId: "EVD-CREDIT-ACC-HAR-TERMS",
                  recordIds: ["ACC-HAR", "S1", "S2", "credit_contract_tpm"]
                }
              ],
              selectedRecordIds: recordIds,
              sourceFreshness: "snapshot",
              transportLabel: "Governed credit risk read-model",
              transportLayer: "supabase_credit_risk"
            }
          }
        });
        if (liveCalls === 2) {
          yield sdkToolEvent("tool_called", "credit_negotiation_draft_structures", "Action Packet Drafter", {
            arguments: draftToolInput
          });
          yield sdkToolEvent("tool_output", "credit_negotiation_draft_structures", "Action Packet Drafter", {
            output: invokeServiceTool("credit_negotiation.draft_structures", draftToolInput, request.mcpServiceContext)
          });
        }
        yield {
          data: {
            response: {
              usage: {
                input_tokens: liveCalls === 1 ? 300 : 500,
                output_tokens: liveCalls === 1 ? 50 : 100,
                total_tokens: liveCalls === 1 ? 350 : 600
              }
            },
            type: "response.completed"
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen(creditRiskFetcher([]), {
      creditRiskStreamRunner: liveRunner,
      env: { OPENAI_API_KEY: "sk-test-credit-query" }
    });

    try {
      const response = await fetch(`${baseUrl}/credit/query`, {
        body: JSON.stringify({
          accountId: "ACC-HAR",
          question: "Draft a safe structure for the Harbor counter-offer.",
          recordIds: ["ACC-HAR", "S1", "S2", "EVD-CREDIT-ACC-HAR-TERMS"]
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      const body = (await response.json()) as {
        modelExecution?: { mode: string; tokenUsage?: number };
        negotiationDraft?: {
          model: { rankedCandidates: Array<{ candidateId: string; objectiveValueLabel: string }> };
          toolName: string;
        };
        trace: Array<{ toolName?: string }>;
      };

      expect(response.status).toBe(200);
      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        tokenUsage: 950
      });
      expect(body.negotiationDraft).toMatchObject({
        model: {
          rankedCandidates: [
            expect.objectContaining({
              candidateId: "agent-retry-max-release-85",
              objectiveValueLabel: "$75,077.00"
            })
          ]
        },
        toolName: "credit_negotiation.draft_structures"
      });
      expect(body.trace.some((event) => event.toolName === "credit_negotiation.draft_structures")).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("adds vector-cited policy rationale to David policy questions without changing exact policy rows", async () => {
    const policy = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
    const vectorSearchCalls: Array<{ body: { query?: unknown }; url: string }> = [];
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      const recordIds = request.agentHookAudit?.recordIds ?? [];
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_handoff",
          nextAgentName: "Action Packet Drafter",
          recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkToolEvent("tool_called", "credit_risk_answer", "Credit Sentinel", {
          arguments: {
            accountId: "ACC-HAR",
            question: "Why is max deposit capped at 60%?",
            recordIds
          }
        });
        yield sdkToolEvent("tool_output", "credit_risk_answer", "Credit Sentinel", {
          output: {
            sourceReadStatus: "source_backed_selected_scope",
            sourceReads: {
              canonicalModel: "CreditRiskEvidenceDocument",
              primarySourceLabel: "Supabase credit evidence documents",
              primarySourceSystem: "supabase",
              selectedEvidence: [
                {
                  documentId: "EVD-CREDIT-ACC-HAR-TERMS",
                  recordIds: ["ACC-HAR", "S1", "S2", "credit_contract_tpm"]
                }
              ],
              selectedRecordIds: recordIds,
              sourceFreshness: "snapshot",
              transportLabel: "Governed credit risk read-model",
              transportLayer: "supabase_credit_risk"
            }
          }
        });
        yield {
          data: {
            response: {
              usage: {
                input_tokens: 600,
                output_tokens: 60,
                total_tokens: 660
              }
            },
            type: "response.completed"
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen(creditRiskFetcher([]), {
      creditRiskStreamRunner: liveRunner,
      env: {
        OPENAI_API_KEY: "sk-test-credit-query",
        OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID: "vs_policy_test"
      },
      openAiVectorStoreFetcher: (url, init) => {
        vectorSearchCalls.push({
          body: typeof init.body === "string" ? JSON.parse(init.body) as { query?: unknown } : {},
          url
        });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    policy_hash: policy.policyHash,
                    policy_key: "max_deposit_pct",
                    policy_version: 1,
                    record_id: "policy-rationale:max-deposit:2026-07-09",
                    source: "vector-policy-rationale",
                    value_text: "60"
                  },
                  content: [{ text: "Owner accepted the 60% deposit ceiling after policy research.", type: "text" }],
                  file_id: "file_policy_max_deposit",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        );
      }
    });

    try {
      const response = await fetch(`${baseUrl}/credit/query`, {
        body: JSON.stringify({
          accountId: "ACC-HAR",
          question: "Why is max deposit capped at 60%?",
          recordIds: ["ACC-HAR", "S1", "S2", "EVD-CREDIT-ACC-HAR-TERMS"]
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });
      const body = (await response.json()) as {
        modelExecution?: { mode: string };
        policyRationale?: {
          citations: Array<{ content: string; deterministicBasis: string; recordId: string; source: string }>;
          executablePolicySource: string;
          message: string;
          policyHash: string;
          policyKey: string;
          policyValueText: string;
          status: string;
        };
      };

      expect(response.status).toBe(200);
      expect(body.modelExecution?.mode).toBe("live_openai_agents");
      expect(vectorSearchCalls).toHaveLength(1);
      expect(vectorSearchCalls[0]?.url).toBe("https://api.openai.com/v1/vector_stores/vs_policy_test/search");
      expect(String(vectorSearchCalls[0]?.body.query)).toContain("policy_key:max_deposit_pct");
      expect(body.policyRationale).toMatchObject({
        executablePolicySource: "credit_negotiation_policy",
        message: "Policy rationale available.",
        policyHash: policy.policyHash,
        policyKey: "max_deposit_pct",
        policyValueText: "60",
        status: "available"
      });
      expect(body.policyRationale?.citations).toEqual([
        {
          content: "Owner accepted the 60% deposit ceiling after policy research.",
          deterministicBasis: "credit_negotiation_policy exact rows + OpenAI vector policy rationale search",
          recordId: "policy-rationale:max-deposit:2026-07-09",
          source: "vector-policy-rationale"
        }
      ]);
      expect(JSON.stringify(body.policyRationale)).not.toContain("valueText");
      expect(JSON.stringify(body.policyRationale)).not.toContain("value_text");
    } finally {
      await close(server);
    }
  });

  it("uses Maya-style governed source-read fallback when the live trace lacks the credit_risk.answer receipt", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      const recordIds = request.agentHookAudit?.recordIds ?? [];
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_start",
          recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_handoff",
          nextAgentName: "Action Packet Drafter",
          recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Action Packet Drafter",
          hook: "agent_start",
          recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield {
          data: {
            response: {
              usage: {
                input_tokens: 120,
                output_tokens: 20,
                total_tokens: 140
              }
            },
            type: "response.completed"
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen(creditRiskFetcher([]), {
      creditRiskStreamRunner: liveRunner,
      env: { OPENAI_API_KEY: "sk-test-credit-query" }
    });

    try {
      const response = await fetch(`${baseUrl}/credit/query`, {
        body: JSON.stringify({
          accountId: "ACC-CRE",
          question: "Why is Crestline high risk?",
          recordIds: ["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"]
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answer?: string;
        citations: Array<{ recordId: string }>;
        modelExecution?: { mode: string; reason?: string; sourceReadMode?: string; tokenUsage?: number };
        trace: Array<{ toolName?: string }>;
      };

      expect(liveRunner).toHaveBeenCalledTimes(2);
      expect(liveRunner.mock.calls[1]?.[0].input).toContain("Validation retry");
      expect(body.answer).toContain("ACC-CRE");
      expect(body.citations.map((citation) => citation.recordId)).toEqual(
        expect.arrayContaining(["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"])
      );
      expect(body.modelExecution).toMatchObject({
        mode: "live_openai_agents",
        sourceReadMode: "governed_backend_fallback",
        tokenUsage: 280
      });
      expect(body.trace.some((event) => event.toolName === "credit_risk.answer")).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("accepts credit_risk_answer RunHooks receipts as the governed credit_risk.answer source read", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      const recordIds = request.agentHookAudit?.recordIds ?? [];
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_handoff",
          nextAgentName: "Action Packet Drafter",
          recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Credit Sentinel",
          hook: "agent_tool_end",
          recordIds,
          toolInputRecordIds: recordIds,
          toolName: "credit_risk_answer",
          toolOutputCanonicalModel: "CreditRiskEvidenceDocument",
          toolOutputPrimarySourceLabel: "Supabase credit evidence documents",
          toolOutputPrimarySourceSystem: "supabase",
          toolOutputSelectedEvidenceRecordIds: ["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"],
          toolOutputSelectedRecordIds: recordIds,
          toolOutputSourceFreshness: "snapshot",
          toolOutputSourceReadStatus: "source_backed_selected_scope",
          toolOutputTransportLabel: "Governed credit risk read-model",
          toolOutputTransportLayer: "supabase_credit_risk"
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield {
          data: {
            response: {
              usage: {
                input_tokens: 500,
                output_tokens: 50,
                total_tokens: 550
              }
            },
            type: "response.completed"
          },
          type: "raw_model_stream_event"
        };
      })();
    });
    const { baseUrl, server } = await listen(creditRiskFetcher([]), {
      creditRiskStreamRunner: liveRunner,
      env: { OPENAI_API_KEY: "sk-test-credit-query" }
    });

    try {
      const response = await fetch(`${baseUrl}/credit/query`, {
        body: JSON.stringify({
          accountId: "ACC-CRE",
          question: "Why is Crestline high risk?",
          recordIds: ["ACC-CRE", "S3", "S6", "EVD-CREDIT-ACC-CRE-AR"]
        }),
        headers: cockpitAuthHeaders,
        method: "POST"
      });

      const body = (await response.json()) as { answer?: string; modelExecution?: { mode: string } };

      expect(response.status).toBe(200);
      expect(body.answer).toContain("ACC-CRE");
      expect(body.modelExecution?.mode).toBe("live_openai_agents");
    } finally {
      await close(server);
    }
  });
});

async function listen(
  memoryFetcher: SupabaseMemoryFetch,
  options: {
    creditRiskStreamRunner?: LiveForensicsStreamRunner;
    env?: Record<string, string>;
    openAiVectorStoreFetcher?: OpenAiVectorStoreFetch;
  } = {}
): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(
    createCockpitApi({
      env: { ...governedConfigEnv, ...cockpitAuthEnv, ...options.env },
      memoryFetcher,
      ...(options.creditRiskStreamRunner === undefined ? {} : { creditRiskStreamRunner: options.creditRiskStreamRunner }),
      ...(options.openAiVectorStoreFetcher === undefined
        ? {}
        : { openAiVectorStoreFetcher: options.openAiVectorStoreFetcher })
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

function sdkToolEvent(
  name: "tool_called" | "tool_output",
  toolName: string,
  agentName: string,
  rawItemOverrides: Record<string, unknown>
) {
  return {
    item: {
      agent: { name: agentName },
      rawItem: {
        ...rawItemOverrides,
        name: toolName,
        type: name === "tool_called" ? "function_call" : "function_call_result"
      }
    },
    name,
    type: "run_item_stream_event"
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

function creditRiskFetcher(
  calls: string[],
  options: {
    approvalRecords?: Array<Record<string, unknown>>;
    counterOfferRows?: Array<Record<string, unknown>>;
    emptyTables?: string[];
    failedTables?: Record<string, number>;
    negotiationRoundRows?: Array<Record<string, unknown>>;
    throwingTables?: string[];
  } = {}
): SupabaseMemoryFetch {
  const fixture = loadCreditRiskFixtureRows();
  const emptyTables = new Set(options.emptyTables ?? []);
  const failedTables = options.failedTables ?? {};
  const throwingTables = new Set(options.throwingTables ?? []);
  const approvalRecords = options.approvalRecords ?? [];

  return (url, init) => {
    calls.push(url);
    expect(init.headers).toMatchObject({
      apikey: "supabase-secret-key",
      authorization: "Bearer supabase-secret-key"
    });

    if (url.includes("/rest/v1/recoup_config")) {
      if (new URL(url).searchParams.get("key")?.includes("run_control") === true) {
        return Promise.resolve(jsonResponse(releaseOwnerInputPostgrestRows()));
      }

      return Promise.resolve(jsonResponse(governedConfigPostgrestRows()));
    }

    if (url.includes("/rest/v1/recoup_memory_records")) {
      return Promise.resolve(jsonResponse(approvalRecords));
    }

    const tableName = new URL(url).pathname.split("/").at(-1);
    if (init.method === "POST" && tableName === "credit_deal_scenarios") {
      return Promise.resolve(jsonResponse([]));
    }
    if (tableName !== undefined && throwingTables.has(tableName)) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    if (tableName !== undefined && emptyTables.has(tableName)) {
      return Promise.resolve(jsonResponse([]));
    }
    if (tableName !== undefined && failedTables[tableName] !== undefined) {
      return Promise.resolve(jsonResponse({ error: `fixture failure for ${tableName}` }, failedTables[tableName]));
    }

    const negotiationRows = rowsForCreditNegotiationTable(tableName);
    if (tableName === "credit_negotiation_rounds") {
      return Promise.resolve(jsonResponse(options.negotiationRoundRows ?? []));
    }
    if (tableName === "credit_counter_offers") {
      return Promise.resolve(jsonResponse(options.counterOfferRows ?? []));
    }
    return Promise.resolve(jsonResponse(negotiationRows ?? rowsForCreditRiskTable(fixture, tableName)));
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

function approvalRecordRow(actionId: string, recordIds: string[], auditEntryHash: string): Record<string, unknown> {
  return {
    category: "approval_records",
    created_at: new Date(0).toISOString(),
    id: `approval:${actionId}`,
    payload_json: {
      actionId,
      approverId: "human:maya-lead",
      auditEntryHash,
      decision: "approve",
      status: "human_decided"
    },
    record_ids_json: recordIds,
    scope: `approval:${actionId}`,
    trust_level: "trusted"
  };
}
