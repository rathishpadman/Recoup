import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CASH_APPLICATION_PROMPT_CACHE_NAMESPACE,
  CASH_APPLICATION_TOOL_WHITELIST,
  CashApplicationAuthorityError,
  assertNoUnsanctionedFigures,
  buildCashApplicationNarration,
  buildDegradedNarration
} from "../../src/agents/cashApplication.js";
import type { CashAllocationReceipt } from "../../src/core/cashApplication/allocate.js";
import type { CashReceipt } from "../../src/types/cashApplication.js";

/**
 * SPEC-CA-007: the Cash Application agent has no authority over money.
 * No model may assert a dollar figure that reaches a finding or a decision.
 */

const receipt: CashReceipt = {
  receiptId: "CR-1001",
  sourceSystem: "rehearsal-proxy",
  sourceRecordId: "SRC-1001",
  paymentReference: "PAY-1001",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  amountReceived: "1250.00",
  currency: "USD",
  settlementStatus: "settled",
  valueDate: "2026-08-20",
  observedAt: "2026-08-20T10:00:00Z",
  retrievedAt: "2026-08-22T09:00:00Z",
  freshnessPolicyVersion: "freshness-v1",
  freshnessStatus: "fresh",
  recordIds: ["SRC-1001"]
};

const allocation: CashAllocationReceipt = {
  allocationId: "ALLOC-1",
  receiptId: "CR-1001",
  remittanceId: "REM-1",
  currency: "USD",
  receiptAmount: "1250.00",
  totalAppliedAmount: "1000.00",
  totalDeductionAmount: "250.00",
  totalUnappliedAmount: "0.00",
  reconciliationStatus: "balanced",
  policyVersion: "demo-allocation-policy-v1-ASSUMED",
  calculationVersion: "demo-calc-v1",
  lines: [],
  recordIds: ["REM-SRC-1", "SRC-1001"]
};

const validatedReason = {
  status: "validated" as const,
  claimedReason: "DMG",
  validatedReason: "DEP" as const,
  ruleId: "RULE-DMG",
  policyVersion: "demo-reason-map-v1-ASSUMED",
  recordIds: ["REM-SRC-1"]
};

describe("the cash agent computes no money", () => {
  it("carries only figures the core produced", () => {
    const narration = buildCashApplicationNarration({ receipt, allocation, validatedReason });

    expect(narration.deterministicBasis.applied).toBe("1000.00");
    expect(narration.summary).toContain("1000.00");
    expect(narration.citedRecordIds).toEqual(allocation.recordIds);
  });

  it("rejects a narrative introducing a figure the core never produced", () => {
    expect(() => {
      assertNoUnsanctionedFigures("Applied 1000.00, roughly 1250.00 in total", {
        applied: "1000.00",
        deduction: "250.00",
        unapplied: "0.00",
        currency: "USD",
        reconciliationStatus: "balanced",
        policyVersion: "p"
      });
    }).toThrow(CashApplicationAuthorityError);
  });

  it("rejects a helpfully rounded figure", () => {
    expect(() => {
      assertNoUnsanctionedFigures("Applied about 1000 dollars", {
        applied: "1000.00",
        deduction: "250.00",
        unapplied: "0.00",
        currency: "USD",
        reconciliationStatus: "balanced",
        policyVersion: "p"
      });
    }).toThrow(CashApplicationAuthorityError);
  });

  it("rejects a total the model computed itself", () => {
    expect(() => {
      assertNoUnsanctionedFigures("Applied 1000.00 plus 250.00 equals 1250.00", {
        applied: "1000.00",
        deduction: "250.00",
        unapplied: "0.00",
        currency: "USD",
        reconciliationStatus: "balanced",
        policyVersion: "p"
      });
    }).toThrow(CashApplicationAuthorityError);
  });

  it("degrades without touching the allocation", () => {
    const degraded = buildDegradedNarration({ receipt, allocation, validatedReason });

    expect(degraded.degraded).toBe(true);
    expect(degraded.summary).not.toContain("1000.00");
    expect(degraded.deterministicBasis.applied).toBe("1000.00");
    expect(degraded.citedRecordIds).toEqual(allocation.recordIds);
  });

  it("narrates a review outcome without claiming it was validated", () => {
    const narration = buildCashApplicationNarration({
      receipt,
      allocation,
      validatedReason: {
        status: "review",
        claimedReason: "NOPE",
        reason: "unclassified",
        recordIds: ["REM-SRC-1"]
      }
    });

    expect(narration.summary).toContain("review");
    expect(narration.summary).not.toContain("DEP");
  });
});

describe("the cash agent tool surface is read-only", () => {
  it("whitelists exactly three read-only tools", () => {
    expect([...CASH_APPLICATION_TOOL_WHITELIST]).toEqual([
      "get_allocation_receipt",
      "get_validated_reason",
      "get_cited_records"
    ]);
  });

  it("exposes no tool that could write, post or approve", () => {
    for (const tool of CASH_APPLICATION_TOOL_WHITELIST) {
      expect(tool).toMatch(/^get_/u);
      expect(tool).not.toMatch(/post|write|approve|send|allocate|update|delete/u);
    }
  });

  it("uses its own prompt-cache namespace", () => {
    expect(CASH_APPLICATION_PROMPT_CACHE_NAMESPACE).toBe("cash_application");
  });

  it("contains no arithmetic and no ERP mutation verb", () => {
    const source = readFileSync("src/agents/cashApplication.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

    expect(code).not.toMatch(/Decimal/u);
    expect(code).not.toMatch(/parseFloat|parseInt|Number\(/u);
    expect(code).not.toMatch(/\bPOST\b|\bPATCH\b|\bPUT\b|\bDELETE\b/u);
    expect(code).not.toMatch(/fetch\(|axios/u);
  });
});
