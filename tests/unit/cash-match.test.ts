import { describe, expect, it } from "vitest";

import type { CashAllocationPolicy } from "../../config/cashAllocationPolicy.js";
import { matchCashReceipt } from "../../src/core/cashApplication/match.js";
import type { CashReceipt } from "../../src/types/cashApplication.js";

const policy: CashAllocationPolicy = {
  policyVersion: "policy-test-v1",
  calculationVersion: "calc-test-v1",
  paymentReferenceMatchRule: "exact",
  cardinality: "one_to_many",
  invoiceOrdering: "remittance_line_order",
  currencyScale: 2,
  rounding: "half_up",
  amountTolerance: "0",
  discountsAllowed: false,
  creditsAllowed: false,
  overpayment: "review",
  residual: "review",
  ambiguity: "review",
  fx: "reject_cross_currency"
};

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
      instructedAmount: "1250.00",
      claimedDeductionAmount: "0",
      sourceRecordIds: ["REM-SRC-1"]
    }
  ],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

describe("matchCashReceipt (TDD 5.1)", () => {
  it("matches when receipt, scope, currency and invoices all agree", () => {
    const result = matchCashReceipt({ advice, receipt, invoices, policy });
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.receiptId).toBe("CR-1001");
      expect(result.invoiceRecordIds).toEqual(["INV-1"]);
      expect(result.policyVersion).toBe("policy-test-v1");
      expect(result.recordIds.length).toBeGreaterThan(0);
    }
  });

  it("reports policy_missing rather than assuming a default policy", () => {
    const result = matchCashReceipt({ advice, receipt, invoices, policy: undefined });
    expect(result.status).toBe("review");
    if (result.status !== "matched") {
      expect(result.reason).toBe("policy_missing");
    }
  });

  it("blocks an unsettled receipt", () => {
    const result = matchCashReceipt({
      advice,
      receipt: { ...receipt, settlementStatus: "pending" },
      invoices,
      policy
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "matched") {
      expect(result.reason).toBe("cash_receipt_unsettled");
    }
  });

  it("blocks a stale receipt", () => {
    const result = matchCashReceipt({
      advice,
      receipt: { ...receipt, freshnessStatus: "stale" },
      invoices,
      policy
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "matched") {
      expect(result.reason).toBe("cash_receipt_stale");
    }
  });

  it("blocks when no receipt was supplied at all", () => {
    const result = matchCashReceipt({ advice, receipt: undefined, invoices, policy });
    expect(result.status).toBe("blocked");
    if (result.status !== "matched") {
      expect(result.reason).toBe("cash_receipt_missing");
    }
  });

  it("blocks a payment reference that does not match under the exact rule", () => {
    const result = matchCashReceipt({
      advice: { ...advice, paymentReference: "pay-1001" },
      receipt,
      invoices,
      policy
    });
    expect(result.status).toBe("blocked");
  });

  it("accepts a case-differing payment reference under the normalized rule", () => {
    const result = matchCashReceipt({
      advice: { ...advice, paymentReference: " pay-1001 " },
      receipt,
      invoices,
      policy: { ...policy, paymentReferenceMatchRule: "normalized" }
    });
    expect(result.status).toBe("matched");
  });

  it("blocks a customer mismatch between advice and receipt", () => {
    const result = matchCashReceipt({
      advice: { ...advice, customerReference: "CUST-999" },
      receipt,
      invoices,
      policy
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "matched") {
      expect(result.reason).toBe("customer_ambiguous");
    }
  });

  it("blocks a legal entity mismatch", () => {
    const result = matchCashReceipt({
      advice: { ...advice, legalEntityReference: "LE-999" },
      receipt,
      invoices,
      policy
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "matched") {
      expect(result.reason).toBe("legal_entity_mismatch");
    }
  });

  it("blocks a cross-currency case under reject_cross_currency", () => {
    const result = matchCashReceipt({
      advice: { ...advice, currency: "EUR" },
      receipt,
      invoices,
      policy
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "matched") {
      expect(result.reason).toBe("currency_mismatch");
    }
  });

  it("reviews an unresolvable invoice reference", () => {
    const result = matchCashReceipt({
      advice: {
        ...advice,
        lines: advice.lines.map((line) => ({ ...line, invoiceReference: "INV-UNKNOWN" }))
      },
      invoices,
      receipt,
      policy
    });
    expect(result.status).toBe("review");
    if (result.status !== "matched") {
      expect(result.reason).toBe("invoice_ambiguous");
    }
  });

  it("reviews a multi-invoice remittance under one_to_one cardinality", () => {
    const result = matchCashReceipt({
      advice: {
        ...advice,
        lines: [
          ...advice.lines,
          {
            lineId: "LINE-2",
            invoiceReference: "INV-2",
            instructedAmount: "100.00",
            claimedDeductionAmount: "0",
            sourceRecordIds: ["REM-SRC-2"]
          }
        ]
      },
      invoices: [
        ...invoices,
        { invoiceRecordId: "INV-2", invoiceReference: "INV-2", balance: "100.00", currency: "USD" }
      ],
      receipt,
      policy: { ...policy, cardinality: "one_to_one" }
    });
    expect(result.status).toBe("review");
  });
});
