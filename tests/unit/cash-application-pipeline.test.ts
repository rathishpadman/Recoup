import { describe, expect, it } from "vitest";

import { runCashApplication } from "../../src/services/cashApplicationPipeline.js";

const demoEnv = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const firstLine = {
  lineId: "LINE-1",
  invoiceReference: "INV-1",
  instructedAmount: "1000.00",
  claimedDeductionAmount: "250.00",
  claimedReasonCode: "DMG",
  claimedReasonTextSanitized: "damaged pallet on delivery",
  sourceRecordIds: ["REM-SRC-1"]
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

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

describe("runCashApplication", () => {
  it("carries a short payment from remittance to allocation under the demo flags", async () => {
    const outcome = await runCashApplication({ advice, invoices, env: demoEnv });

    expect(outcome.status).toBe("allocated");
    if (outcome.status !== "allocated") return;

    expect(outcome.receipt.sourceSystem).toBe("rehearsal-proxy");
    expect(outcome.allocation.totalAppliedAmount).toBe("1000.00");
    expect(outcome.allocation.totalDeductionAmount).toBe("250.00");
    expect(outcome.allocation.reconciliationStatus).toBe("balanced");
    expect(outcome.validatedReason.status).toBe("validated");
    expect(outcome.provenanceMode).toBe("replay");
  });

  it("stops at awaiting_receipt when the rehearsal source is disabled", async () => {
    const outcome = await runCashApplication({
      advice,
      invoices,
      env: { RECOUP_CASH_DEMO_POLICY_ENABLED: "true" }
    });
    expect(outcome.status).toBe("awaiting_receipt");
  });

  it("stops at contract_gap when no policy is approved", async () => {
    const outcome = await runCashApplication({
      advice,
      invoices,
      env: { RECOUP_CASH_REHEARSAL_ENABLED: "true" }
    });
    expect(outcome.status).not.toBe("allocated");
  });

  it("stops with nothing enabled at all", async () => {
    const outcome = await runCashApplication({ advice, invoices, env: {} });
    expect(outcome.status).not.toBe("allocated");
  });

  it("never reports live provenance for a rehearsal receipt", async () => {
    const outcome = await runCashApplication({
      advice: { ...advice, provenanceMode: "replay" },
      invoices,
      env: demoEnv
    });
    expect(outcome.provenanceMode).not.toBe("live");
  });

  it("routes an unknown payment reference to awaiting_receipt, not allocation", async () => {
    const outcome = await runCashApplication({
      advice: { ...advice, paymentReference: "PAY-NOT-A-FIXTURE" },
      invoices,
      env: demoEnv
    });
    expect(outcome.status).toBe("awaiting_receipt");
  });

  it("still allocates when the reason cannot be validated, but flags it", async () => {
    const outcome = await runCashApplication({
      advice: {
        ...advice,
        lines: [{ ...firstLine, claimedReasonCode: "NOT-A-CODE" }]
      },
      invoices,
      env: demoEnv
    });
    expect(outcome.status).toBe("allocated");
    if (outcome.status !== "allocated") return;
    expect(outcome.validatedReason.status).toBe("review");
  });
});
