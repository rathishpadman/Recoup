import { describe, expect, it } from "vitest";

import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";

/**
 * A live case references its allocation, and nothing ever wrote one.
 *
 * The run computed the allocation, recorded an event about it, and went
 * straight to creating the case, so against a real database the insert failed
 * on recoup_live_deduction_cases_allocation_id_fkey. The money had already been
 * worked out by then, which is the worst place for a run to fail.
 */

const env = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "INBOX-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  mapperVersion: "csv-v1",
  lines: [
    {
      lineId: "LINE-1",
      invoiceReference: "INV-1",
      instructedAmount: "1000.00",
      claimedDeductionAmount: "250.00",
      claimedReasonCode: "DMG",
      claimedReasonTextSanitized: "damaged pallet",
      sourceRecordIds: ["SRC-1"]
    }
  ],
  sourceRecordIds: ["SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

/** Settled, so the run reaches an allocation and then a case. */
const settledSource: CashReceiptSource = {
  findReceipt: () =>
    Promise.resolve({
      status: "settled",
      receipt: {
        receiptId: "REC-1",
        sourceSystem: "rehearsal-proxy",
        sourceRecordId: "REC-1",
        paymentReference: "PAY-1",
        customerReference: "CUST-001",
        legalEntityReference: "LE-001",
        amountReceived: "1250.00",
        currency: "USD",
        settlementStatus: "settled",
        valueDate: "2026-08-20",
        observedAt: "2026-08-23T09:00:00.000Z",
        retrievedAt: "2026-08-23T09:00:00.000Z",
        freshnessPolicyVersion: "rehearsal-freshness-v1",
        freshnessStatus: "fresh",
        recordIds: ["REC-1"]
      }
    }) as never
};

describe("allocation persistence", () => {
  it("records the allocation before the case that references it", async () => {
    const repository = createInMemoryWorkflowRepository();
    const order: string[] = [];
    const originalInsert = repository.insertAllocation.bind(repository);
    const originalUpsert = repository.upsertCase.bind(repository);

    repository.insertAllocation = async (allocation) => {
      order.push("allocation");
      return originalInsert(allocation);
    };
    repository.upsertCase = async (liveCase) => {
      order.push("case");
      return originalUpsert(liveCase);
    };

    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env,
      repository,
      source: settledSource
    });

    expect(outcome.state).toBe("Ready");
    // The case carries a foreign key to the allocation, so the order is not
    // cosmetic: reversed, the write is rejected.
    expect(order).toEqual(["allocation", "case"]);
  });

  it("stores the allocation the case points at", async () => {
    const repository = createInMemoryWorkflowRepository();

    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env,
      repository,
      source: settledSource
    });

    const stored = await repository.listAllocations();
    const liveCase = outcome.liveCase;

    expect(stored).toHaveLength(1);
    expect(liveCase).toBeDefined();
    expect(stored[0]?.allocationId).toBe(liveCase?.allocationId);
  });

  it("writes no allocation when the run never reaches one", async () => {
    const repository = createInMemoryWorkflowRepository();

    await startCashApplicationRun({
      advice,
      invoices,
      env,
      repository,
      source: {
        findReceipt: () => Promise.resolve({ status: "not_found", reason: "no receipt" }) as never
      }
    });

    expect(await repository.listAllocations()).toHaveLength(0);
  });
});
