import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { LiveForensicsStreamRunner } from "../../src/agents/liveForensicsStream.js";
import { createAgentHookAuditReceipt } from "../../src/services/conductor.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";
import type { SupabaseMemoryFetch } from "../../src/memory/supabaseStore.js";
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
          orderId: "ORD-HARBOR-6534",
          sourceModeLabel: "governed Supabase negotiation source",
          sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
        }
      ]);
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
  options: { creditRiskStreamRunner?: LiveForensicsStreamRunner; env?: Record<string, string> } = {}
): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(
    createCockpitApi({
      env: { ...governedConfigEnv, ...cockpitAuthEnv, ...options.env },
      memoryFetcher,
      ...(options.creditRiskStreamRunner === undefined ? {} : { creditRiskStreamRunner: options.creditRiskStreamRunner })
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
  options: { approvalRecords?: Array<Record<string, unknown>>; emptyTables?: string[] } = {}
): SupabaseMemoryFetch {
  const fixture = loadCreditRiskFixtureRows();
  const emptyTables = new Set(options.emptyTables ?? []);
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
    if (tableName !== undefined && emptyTables.has(tableName)) {
      return Promise.resolve(jsonResponse([]));
    }

    const negotiationRows = rowsForCreditNegotiationTable(tableName);
    return Promise.resolve(jsonResponse(negotiationRows ?? rowsForCreditRiskTable(fixture, tableName)));
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
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
