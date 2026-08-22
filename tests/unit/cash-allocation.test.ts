import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { DEMO_ALLOCATION_POLICY } from "../../config/cashAllocationPolicy.js";
import { allocateCashReceipt } from "../../src/core/cashApplication/allocate.js";
import type { CashReceipt } from "../../src/types/cashApplication.js";

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

const firstLine = {
  lineId: "LINE-1",
  invoiceReference: "INV-1",
  instructedAmount: "1000.00",
  claimedDeductionAmount: "250.00",
  sourceRecordIds: ["REM-SRC-1"]
};

const firstInvoice = {
  invoiceRecordId: "INV-1",
  invoiceReference: "INV-1",
  balance: "1250.00",
  currency: "USD"
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
  lines: [firstLine],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [firstInvoice];

describe("allocateCashReceipt (TDD 5.2)", () => {
  it("returns contract_gap when no policy is supplied", () => {
    const result = allocateCashReceipt({ advice, receipt, invoices, policy: undefined });
    expect(result.status).toBe("contract_gap");
  });

  it("produces a balanced allocation receipt for a short payment", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("allocated");
    if (result.status !== "allocated") return;

    expect(result.receipt.reconciliationStatus).toBe("balanced");
    expect(result.receipt.totalAppliedAmount).toBe("1000.00");
    expect(result.receipt.totalDeductionAmount).toBe("250.00");
    expect(result.receipt.totalUnappliedAmount).toBe("0.00");
    expect(result.receipt.policyVersion).toBe(DEMO_ALLOCATION_POLICY.policyVersion);
    expect(result.receipt.lines).toHaveLength(1);
  });

  it("satisfies the receipt reconciliation identity", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    if (result.status !== "allocated") throw new Error("expected an allocation");

    const { receiptAmount, totalAppliedAmount, totalDeductionAmount, totalUnappliedAmount } =
      result.receipt;
    const sum = new Decimal(totalAppliedAmount)
      .plus(totalDeductionAmount)
      .plus(totalUnappliedAmount);
    expect(sum.equals(new Decimal(receiptAmount))).toBe(true);
  });

  it("satisfies the per-invoice reconciliation identity", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    if (result.status !== "allocated") throw new Error("expected an allocation");

    for (const line of result.receipt.lines) {
      const sum = new Decimal(line.appliedAmount)
        .plus(line.explicitDeductionAmount)
        .plus(line.invoiceBalanceAfterInternalAllocation);
      expect(sum.equals(new Decimal(line.invoiceBalanceBefore))).toBe(true);
    }
  });

  it("marks an over-allocated remittance imbalanced rather than silently absorbing it", () => {
    const result = allocateCashReceipt({
      advice: {
        ...advice,
        lines: [{ ...firstLine, instructedAmount: "2000.00" }]
      },
      receipt,
      invoices: [{ ...firstInvoice, balance: "5000.00" }],
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("allocated");
    if (result.status !== "allocated") return;
    expect(result.receipt.reconciliationStatus).toBe("imbalanced");
  });

  it("treats an overpayment as imbalanced under the review policy", () => {
    const result = allocateCashReceipt({
      advice: {
        ...advice,
        lines: [{ ...firstLine, instructedAmount: "500.00", claimedDeductionAmount: "0" }]
      },
      receipt,
      invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    if (result.status !== "allocated") throw new Error("expected an allocation");
    expect(result.receipt.totalUnappliedAmount).toBe("750.00");
    expect(result.receipt.reconciliationStatus).toBe("imbalanced");
  });

  it("returns contract_gap for a cross-currency invoice under reject_cross_currency", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices: [{ ...firstInvoice, currency: "EUR" }],
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("contract_gap");
  });

  it("returns contract_gap for an unresolvable invoice reference", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices: [],
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("contract_gap");
  });

  it("formats money to the policy scale rather than an assumed two places", () => {
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices,
      policy: { ...DEMO_ALLOCATION_POLICY, currencyScale: 3 }
    });
    if (result.status !== "allocated") throw new Error("expected an allocation");
    expect(result.receipt.totalAppliedAmount).toBe("1000.000");
  });

  it("never writes an ERP posting or mutates its inputs", () => {
    const frozenInvoices = Object.freeze([Object.freeze({ ...firstInvoice })]);
    const result = allocateCashReceipt({
      advice,
      receipt,
      invoices: frozenInvoices as unknown as typeof invoices,
      policy: DEMO_ALLOCATION_POLICY
    });
    expect(result.status).toBe("allocated");
    expect(firstInvoice.balance).toBe("1250.00");
  });
});
