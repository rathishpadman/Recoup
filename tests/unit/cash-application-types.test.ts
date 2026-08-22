import { describe, expect, it } from "vitest";

import {
  CashReceiptSchema,
  CurrencyCode,
  IsoTimestamp,
  MoneyString,
  NonEmptyId,
  ProvenanceMode,
  satisfiesAllocationPrecondition
} from "../../src/types/cashApplication.js";

const settledFreshReceipt = {
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
} as const;

describe("shared primitives (TDD 4.1)", () => {
  it("rejects blank and whitespace-only identifiers", () => {
    expect(NonEmptyId.safeParse("CR-1").success).toBe(true);
    expect(NonEmptyId.safeParse("").success).toBe(false);
    expect(NonEmptyId.safeParse("   ").success).toBe(false);
  });

  it("requires an offset on timestamps", () => {
    expect(IsoTimestamp.safeParse("2026-08-22T09:00:00Z").success).toBe(true);
    expect(IsoTimestamp.safeParse("2026-08-22T09:00:00").success).toBe(false);
  });

  it("accepts only three uppercase letters as a currency code", () => {
    expect(CurrencyCode.safeParse("USD").success).toBe(true);
    expect(CurrencyCode.safeParse("usd").success).toBe(false);
    expect(CurrencyCode.safeParse("US").success).toBe(false);
    expect(CurrencyCode.safeParse("USDD").success).toBe(false);
  });

  it("accepts decimal money strings and rejects float-shaped junk", () => {
    expect(MoneyString.safeParse("0").success).toBe(true);
    expect(MoneyString.safeParse("1250.00").success).toBe(true);
    expect(MoneyString.safeParse("-1250.00").success).toBe(true);
    expect(MoneyString.safeParse("01250.00").success).toBe(false);
    expect(MoneyString.safeParse("1,250.00").success).toBe(false);
    expect(MoneyString.safeParse("1.2e3").success).toBe(false);
    expect(MoneyString.safeParse("").success).toBe(false);
  });

  it("names exactly the three provenance modes", () => {
    expect(ProvenanceMode.options).toEqual(["live", "replay", "synthetic"]);
  });
});

describe("CashReceiptSchema (TDD 4.5)", () => {
  it("accepts a settled fresh receipt carrying every required field", () => {
    expect(CashReceiptSchema.safeParse(settledFreshReceipt).success).toBe(true);
  });

  it("names exactly the four settlement statuses", () => {
    expect(CashReceiptSchema.shape.settlementStatus.options).toEqual([
      "settled",
      "pending",
      "reversed",
      "unknown"
    ]);
  });

  it("names exactly the three freshness statuses", () => {
    expect(CashReceiptSchema.shape.freshnessStatus.options).toEqual([
      "fresh",
      "stale",
      "unknown"
    ]);
  });

  it("requires at least one cited record id", () => {
    const parsed = CashReceiptSchema.safeParse({ ...settledFreshReceipt, recordIds: [] });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative received amount (TDD 4.1 sign refinement)", () => {
    const parsed = CashReceiptSchema.safeParse({
      ...settledFreshReceipt,
      amountReceived: "-1250.00"
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a value date carrying a time component", () => {
    const parsed = CashReceiptSchema.safeParse({
      ...settledFreshReceipt,
      valueDate: "2026-08-20T00:00:00Z"
    });
    expect(parsed.success).toBe(false);
  });

  it.each(["receiptId", "sourceSystem", "paymentReference", "customerReference"] as const)(
    "rejects a receipt missing %s",
    (field) => {
      const candidate = Object.fromEntries(
        Object.entries(settledFreshReceipt).filter(([key]) => key !== field)
      );
      expect(CashReceiptSchema.safeParse(candidate).success).toBe(false);
    }
  );
});

describe("allocation precondition (TDD 4.5)", () => {
  it("is satisfied only by settled and fresh", () => {
    expect(satisfiesAllocationPrecondition(settledFreshReceipt)).toBe(true);
  });

  it.each(["pending", "reversed", "unknown"] as const)(
    "is not satisfied when settlementStatus is %s",
    (settlementStatus) => {
      expect(
        satisfiesAllocationPrecondition({ ...settledFreshReceipt, settlementStatus })
      ).toBe(false);
    }
  );

  it.each(["stale", "unknown"] as const)(
    "is not satisfied when freshnessStatus is %s",
    (freshnessStatus) => {
      expect(
        satisfiesAllocationPrecondition({ ...settledFreshReceipt, freshnessStatus })
      ).toBe(false);
    }
  );
});
