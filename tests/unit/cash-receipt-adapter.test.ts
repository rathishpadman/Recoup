import { describe, expect, it } from "vitest";

import type { CashReceipt } from "../../src/types/cashApplication.js";
import {
  CashReceiptLookupResultSchema,
  cashReceiptLookupStatuses,
  isAllocatableLookupResult
} from "../../src/adapters/cashReceipt.js";

const settledReceipt: CashReceipt = {
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

describe("CashReceiptLookupResult (TDD 10)", () => {
  it("names exactly the seven documented arms", () => {
    expect(cashReceiptLookupStatuses).toEqual([
      "settled",
      "pending",
      "ambiguous",
      "not_found",
      "stale",
      "source_unavailable",
      "contract_gap"
    ]);
  });

  it("carries a receipt on the settled arm", () => {
    const parsed = CashReceiptLookupResultSchema.safeParse({
      status: "settled",
      receipt: settledReceipt
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a settled arm whose receipt is not settled and fresh", () => {
    const parsed = CashReceiptLookupResultSchema.safeParse({
      status: "settled",
      receipt: { ...settledReceipt, settlementStatus: "pending" }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a settled arm carrying a stale receipt", () => {
    const parsed = CashReceiptLookupResultSchema.safeParse({
      status: "settled",
      receipt: { ...settledReceipt, freshnessStatus: "stale" }
    });
    expect(parsed.success).toBe(false);
  });

  it("never turns a miss into a zero-amount receipt", () => {
    const parsed = CashReceiptLookupResultSchema.safeParse({ status: "not_found" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("receipt");
    }
  });

  it.each(["source_unavailable", "contract_gap"] as const)(
    "keeps %s distinct from a fresh zero-result",
    (status) => {
      const parsed = CashReceiptLookupResultSchema.safeParse({ status, reason: "probe failed" });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.status).toBe(status);
    }
  );
});

describe("isAllocatableLookupResult", () => {
  it("admits only the settled arm", () => {
    expect(isAllocatableLookupResult({ status: "settled", receipt: settledReceipt })).toBe(true);
  });

  it.each([
    "pending",
    "ambiguous",
    "not_found",
    "stale",
    "source_unavailable",
    "contract_gap"
  ] as const)("refuses the %s arm", (status) => {
    expect(isAllocatableLookupResult({ status })).toBe(false);
  });
});
