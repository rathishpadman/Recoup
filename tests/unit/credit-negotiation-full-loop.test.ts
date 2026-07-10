import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { handleCreditNegotiationEmailPostForTest } from "../../cockpit/app/api/credit/negotiation/email/route.js";
import { handleCreditNegotiationManualInboundPostForTest } from "../../cockpit/app/api/credit/negotiation/inbound/manual/route.js";
import { loadDealOptimizerSourceRows } from "../../src/adapters/supabaseSyntheticSource.js";
import { buildDealOptimizerModel } from "../../src/services/dealOptimizer.js";
import type { CreditNegotiationApprovalAction } from "../../src/services/creditRiskModel.js";
import { prepareApprovalDecision } from "../../src/services/serviceLayer.js";
import { rowsForCreditNegotiationTable } from "./fixtures/creditRiskSupabaseFixture.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";
import { harborDealOptimizerRows } from "./fixtures/dealOptimizerFixture.js";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";

const env = {
  CREDIT_NEGOTIATION_FROM_EMAIL: "deals@north-bay.dev",
  EMAIL_TO_BILLING: "billing@example.com",
  EMAIL_TO_RECOVERY: "recovery@example.com",
  HARBOR_AP_CONTACT_EMAIL: "harbor-ap@example.com",
  NODE_ENV: "test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-credit-lead",
  RESEND_API_KEY: "test-resend-key",
  SENDER_EMAIL_ADDRESS: "maya@example.com",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
};

function davidPostRequest(path: string, payload: unknown): Request {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": "human:david-credit-lead",
      "x-recoup-human-token": "test-human-token"
    },
    method: "POST"
  });
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

describe("David negotiation full local loop", () => {
  it("approves a priced draft, sends once, records a manual counter, and re-optimizes from persisted rows", async () => {
    const creditRiskRows = loadCreditRiskFixtureRows();
    creditRiskRows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];
    const actionId = "credit-v2:negotiation:ORD-HARBOR-6534:r1";
    const prepared = prepareApprovalDecision(
      {
        actionId,
        decision: "approve"
      },
      {
        creditRiskRows,
        dealOptimizerRows: {
          policyRows: creditNegotiationPolicyCandidateRows,
          simRows: harborDealOptimizerRows
        },
        governedConfig: day1GovernedConfigSeed.values,
        verifiedHumanPrincipal: "human:david-credit-lead"
      }
    );
    const action = prepared.action as CreditNegotiationApprovalAction;
    expect(action.approvedDraft.body).toContain("max-release-85");

    const supabase = buildNegotiationSupabaseState(action);
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => supabase.fetch(url, init));
    const sendPayload = {
      accountId: "ACC-HAR",
      actionId,
      orderId: "ORD-HARBOR-6534",
      round: 1
    };

    const firstSend = await handleCreditNegotiationEmailPostForTest(
      davidPostRequest("/api/credit/negotiation/email", sendPayload),
      { env, fetchImpl }
    );
    const secondSend = await handleCreditNegotiationEmailPostForTest(
      davidPostRequest("/api/credit/negotiation/email", {
        ...sendPayload,
        lastInboundMessageId: "<counter-from-previous-run@harbor.example>"
      }),
      { env, fetchImpl }
    );

    expect(firstSend.status).toBe(200);
    await expect(firstSend.json()).resolves.toMatchObject({
      actionId,
      providerEmailId: "email_full_loop_001",
      status: "sent"
    });
    expect(secondSend.status).toBe(200);
    await expect(secondSend.json()).resolves.toMatchObject({
      actionId,
      providerEmailId: "email_full_loop_001",
      status: "already_sent"
    });
    expect(supabase.providerSendCount).toBe(1);
    expect(supabase.rounds.at(0)).toMatchObject({
      round_id: actionId,
      status: "sent"
    });

    const counter = await handleCreditNegotiationManualInboundPostForTest(
      davidPostRequest("/api/credit/negotiation/inbound/manual", {
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit, accept 85% release, 2 tranches, 1.1x collateral, and 150 bps spread.",
        round: 1
      }),
      { env, fetchImpl }
    );

    expect(counter.status).toBe(200);
    await expect(counter.json()).resolves.toEqual({
      orderId: "ORD-HARBOR-6534",
      parseStatus: "grammar_valid",
      round: 1,
      source: "manual",
      status: "countered"
    });
    expect(supabase.counterOffers).toHaveLength(1);
    expect(supabase.counterOffers[0]).toMatchObject({
      counter_offer_id: "manual-counter-001",
      order_id: "ORD-HARBOR-6534",
      source: "manual",
      status: "grammar_valid"
    });
    expect(supabase.rounds.at(0)).toMatchObject({
      round_id: actionId,
      status: "countered"
    });
    expect(supabase.rounds.at(0)).not.toHaveProperty("inbound_email_id");

    const optimizerRows = await loadDealOptimizerSourceRows(env, fetchImpl);
    const reoptimized = buildDealOptimizerModel({
      creditRiskRows,
      orderId: "ORD-HARBOR-6534",
      policyRows: optimizerRows.policyRows,
      seed: 42,
      simRows: optimizerRows.simRows
    });
    const counterCandidate = reoptimized.rankedCandidates.find((candidate) => candidate.candidateId === "counter-offer:manual-counter-001");
    expect(counterCandidate).toBeDefined();
    expect(counterCandidate?.sourceRecordIds).toEqual(expect.arrayContaining(["credit_counter_offers:manual-counter-001"]));
    expect(reoptimized.sourceRecordIds).toEqual(expect.arrayContaining(["credit_counter_offers:manual-counter-001"]));
  });
});

function buildNegotiationSupabaseState(action: CreditNegotiationApprovalAction) {
  const approvedSubjectHash = sha256Hex(action.approvedDraft.subject);
  const approvedToHash = sha256Hex(env.HARBOR_AP_CONTACT_EMAIL);
  const approvalRecord = {
    category: "approval_records",
    id: `approval:${action.actionId}`,
    payload_json: {
      actionId: action.actionId,
      approvedBodyHash: action.approvedDraft.bodyHash,
      approvedDraftRecordId: `credit_negotiation_rounds:${action.actionId}`,
      approvedRecipientConfigKey: "HARBOR_AP_CONTACT_EMAIL",
      approvedSubjectHash,
      approvedToHash,
      approverId: "human:david-credit-lead",
      auditEntryHash: "b".repeat(64),
      decision: "approve",
      status: "human_decided"
    },
    record_ids_json: [action.actionId, ...action.recordIds],
    scope: `approval:${action.actionId}`,
    trust_level: "trusted"
  };
  const rounds: Array<Record<string, unknown>> = [
    {
      account_id: "ACC-HAR",
      order_id: "ORD-HARBOR-6534",
      our_proposal_json: {
        approvedBody: action.approvedDraft.body,
        approvedBodyHash: action.approvedDraft.bodyHash,
        approvedSubject: action.approvedDraft.subject,
        approvedSubjectHash,
        approvedToHash
      },
      round_id: action.actionId,
      round_no: 1,
      status: "drafted"
    }
  ];
  const sends: Array<Record<string, unknown>> = [];
  const counterOffers: Array<Record<string, unknown>> = [];
  let providerSendCount = 0;

  return {
    counterOffers,
    fetch(urlInput: string | URL | Request, init?: RequestInit): Promise<Response> {
      const urlString = typeof urlInput === "string" ? urlInput : urlInput instanceof URL ? urlInput.toString() : urlInput.url;
      const method = init?.method ?? "GET";
      if (urlString === "https://api.resend.com/emails" && method === "POST") {
        providerSendCount += 1;
        return Promise.resolve(jsonResponse({ id: "email_full_loop_001", last_event: "sent" }));
      }

      const tableName = urlString.includes("/rest/v1/") ? new URL(urlString).pathname.split("/").at(-1) : undefined;
      if (tableName === "recoup_memory_records" && method === "GET") {
        return Promise.resolve(jsonResponse([approvalRecord]));
      }
      if (tableName === "credit_negotiation_rounds" && method === "GET") {
        const url = new URL(urlString);
        return Promise.resolve(jsonResponse(filterRows(rounds, url.searchParams)));
      }
      if (tableName === "credit_negotiation_rounds" && method === "POST") {
        const row = readJsonBody(init);
        const existing = rounds.find((entry) => entry.round_id === row.round_id);
        if (existing === undefined) {
          rounds.push({ ...row });
        } else {
          Object.assign(existing, row);
        }
        return Promise.resolve(jsonResponse([existing ?? row], 201));
      }
      if (tableName === "credit_negotiation_rounds" && method === "PATCH") {
        const row = readJsonBody(init);
        const roundId = new URL(urlString).searchParams.get("round_id")?.replace(/^eq\./u, "");
        const existing = rounds.find((entry) => entry.round_id === roundId);
        if (existing !== undefined) {
          Object.assign(existing, row);
        }
        return Promise.resolve(jsonResponse(existing === undefined ? [] : [existing]));
      }
      if (tableName === "credit_negotiation_sends" && method === "GET") {
        const url = new URL(urlString);
        return Promise.resolve(jsonResponse(filterRows(sends, url.searchParams)));
      }
      if (tableName === "credit_negotiation_sends" && method === "POST") {
        const row = readJsonBody(init);
        sends.push({ ...row });
        return Promise.resolve(jsonResponse([row], 201));
      }
      if (tableName === "credit_negotiation_sends" && method === "PATCH") {
        const row = readJsonBody(init);
        const idempotencyKey = new URL(urlString).searchParams.get("idempotency_key")?.replace(/^eq\./u, "");
        const existing = sends.find((entry) => entry.idempotency_key === idempotencyKey);
        if (existing !== undefined) {
          Object.assign(existing, row);
        }
        return Promise.resolve(jsonResponse(existing === undefined ? [] : [existing]));
      }
      if (tableName === "credit_counter_offers" && method === "POST") {
        const row = {
          counter_offer_id: `manual-counter-${(counterOffers.length + 1).toString().padStart(3, "0")}`,
          ...readJsonBody(init)
        };
        counterOffers.push(row);
        return Promise.resolve(jsonResponse([row], 201));
      }
      if (tableName === "credit_counter_offers" && method === "GET") {
        return Promise.resolve(jsonResponse(counterOffers));
      }
      if (tableName === "credit_negotiation_policy" && method === "GET") {
        return Promise.resolve(jsonResponse(rowsForCreditNegotiationTable(tableName) ?? []));
      }

      const rows = rowsForCreditNegotiationTable(tableName);
      if (rows !== undefined && method === "GET") {
        return Promise.resolve(jsonResponse(rows));
      }

      throw new Error(`Unexpected fetch URL: ${method} ${urlString}`);
    },
    get providerSendCount() {
      return providerSendCount;
    },
    rounds
  };
}

function readJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    throw new TypeError("Expected JSON request body.");
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

function filterRows(rows: Array<Record<string, unknown>>, searchParams: URLSearchParams): Array<Record<string, unknown>> {
  return rows.filter((row) => {
    for (const [key, value] of searchParams.entries()) {
      if (key === "select" || key === "limit" || key === "order") {
        continue;
      }
      if (!value.startsWith("eq.")) {
        continue;
      }
      const expected = value.slice(3);
      if (String(row[key]) !== expected) {
        return false;
      }
    }
    return true;
  });
}
