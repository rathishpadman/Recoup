import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEMO_ALLOCATION_POLICY } from "../../config/cashAllocationPolicy.js";
import { allocateCashReceipt } from "../../src/core/cashApplication/allocate.js";
import { matchCashReceipt } from "../../src/core/cashApplication/match.js";
import type { CashReceipt } from "../../src/types/cashApplication.js";

/**
 * SA-CA-01: no cash allocation without a cited authoritative settled
 * CashReceipt. Release-blocking; may not be skipped, quarantined or downgraded.
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

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "MSG-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  mapperVersion: "csv-v1",
  lines: [
    {
      lineId: "LINE-1",
      invoiceReference: "INV-1",
      instructedAmount: "1000.00",
      claimedDeductionAmount: "250.00",
      sourceRecordIds: ["REM-SRC-1"]
    }
  ],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

describe("SA-CA-01 no allocation without a settled cited receipt", () => {
  it.each(["pending", "reversed", "unknown"] as const)(
    "refuses to match a %s receipt",
    (settlementStatus) => {
      const result = matchCashReceipt({
        advice,
        receipt: { ...receipt, settlementStatus },
        invoices,
        policy: DEMO_ALLOCATION_POLICY
      });
      expect(result.status).not.toBe("matched");
    }
  );

  it.each(["stale", "unknown"] as const)("refuses to match a %s receipt", (freshnessStatus) => {
    const result = matchCashReceipt({
      advice,
      receipt: { ...receipt, freshnessStatus },
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).not.toBe("matched");
  });

  it("refuses to match with no receipt at all", () => {
    const result = matchCashReceipt({
      advice,
      receipt: undefined,
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("blocked");
  });

  it("cites at least one record on every allocation it produces", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("allocated");
    if (result.status !== "allocated") return;

    expect(result.receipt.recordIds.length).toBeGreaterThan(0);
    expect(result.receipt.recordIds).toContain(receipt.recordIds[0]);
    expect(result.receipt.receiptId).toBe(receipt.receiptId);
    for (const line of result.receipt.lines) {
      expect(line.recordIds.length).toBeGreaterThan(0);
    }
  });

  it("keeps the allocation core free of any ERP mutation verb", () => {
    const source = readFileSync("src/core/cashApplication/allocate.ts", "utf8");
    for (const forbidden of ["POST", "PATCH", "PUT", "DELETE", "fetch(", "axios"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the deterministic core free of injected infrastructure", () => {
    for (const file of [
      "src/core/cashApplication/match.ts",
      "src/core/cashApplication/allocate.ts",
      "src/core/cashApplication/reason.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from "\.\.\/\.\.\/adapters\//u);
      expect(source).not.toMatch(/from "\.\.\/\.\.\/services\//u);
    }
  });
});
