import { runCashApplication } from "../src/services/cashApplicationPipeline.js";

const advice = {
  remittanceId: "REM-DEMO-1",
  inboundMessageId: "MSG-DEMO-1",
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
      claimedReasonCode: "DMG",
      claimedReasonTextSanitized: "damaged pallet",
      sourceRecordIds: ["REM-SRC-1"]
    }
  ],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const cases: [string, Record<string, string>][] = [
  ["flags OFF", {}],
  [
    "flags ON ",
    { RECOUP_CASH_REHEARSAL_ENABLED: "true", RECOUP_CASH_DEMO_POLICY_ENABLED: "true" }
  ]
];

for (const [label, env] of cases) {
  const outcome = await runCashApplication({ advice, invoices, env });

  if (outcome.status === "allocated") {
    console.log(
      `${label} -> ${outcome.status} | source=${outcome.receipt.sourceSystem} provenance=${outcome.provenanceMode}`
    );
    console.log(
      `           applied=${outcome.allocation.totalAppliedAmount} deduction=${outcome.allocation.totalDeductionAmount} unapplied=${outcome.allocation.totalUnappliedAmount} ${outcome.allocation.reconciliationStatus}`
    );
    console.log(
      `           reason=${outcome.validatedReason.status} policy=${outcome.allocation.policyVersion}`
    );
    console.log(`           cites: ${outcome.allocation.recordIds.join(", ")}`);
  } else {
    console.log(`${label} -> ${outcome.status} (${outcome.reason})`);
  }
}
