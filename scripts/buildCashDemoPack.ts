import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createSupabaseCashReceiptSource } from "../src/adapters/supabaseCashReceipt.js";
import { runCashApplication } from "../src/services/cashApplicationPipeline.js";
import { REMITTANCE_CSV_V1_HEADER } from "../config/remittanceCsvV1.js";

/**
 * Builds the client demo pack: the remittance CSV the customer would send, and
 * the numbers the pipeline actually produces from it.
 *
 * The expected output in the demo script is printed from a real run rather than
 * written by hand, so the document cannot promise a figure the code does not
 * produce.
 */

const assetDir = join("docs", "demo", "assets");

const DEMO = {
  remittanceId: "REM-DEMO-NW-4471",
  inboundMessageId: "MSG-DEMO-NW-4471",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  currency: "USD",
  /** What the customer says they paid in total. */
  instructedPaymentAmount: "1250.00",
  invoiceReference: "INV-2026-0912",
  invoiceBalance: "1250.00",
  /** Applied to the invoice. */
  instructedAmount: "1000.00",
  /** Withheld, and the reason they give for it. */
  claimedDeductionAmount: "250.00",
  claimedReasonCode: "DMG",
  claimedReasonText: "two pallets arrived damaged, POD signed short"
};

function buildCsv(): string {
  const row: Record<string, string> = {
    remittance_id: DEMO.remittanceId,
    customer_reference: DEMO.customerReference,
    legal_entity_reference: DEMO.legalEntityReference,
    payment_reference: DEMO.paymentReference,
    currency: DEMO.currency,
    instructed_payment_amount: DEMO.instructedPaymentAmount,
    line_id: "LINE-1",
    invoice_reference: DEMO.invoiceReference,
    instructed_amount: DEMO.instructedAmount,
    claimed_deduction_amount: DEMO.claimedDeductionAmount,
    claimed_reason_code: DEMO.claimedReasonCode,
    claimed_reason_text: DEMO.claimedReasonText
  };

  const header = REMITTANCE_CSV_V1_HEADER.join(",");
  const values = REMITTANCE_CSV_V1_HEADER.map((column) => {
    const value = row[column] ?? "";
    return value.includes(",") ? `"${value}"` : value;
  }).join(",");

  return `${header}\n${values}\n`;
}

const advice = {
  remittanceId: DEMO.remittanceId,
  inboundMessageId: DEMO.inboundMessageId,
  customerReference: DEMO.customerReference,
  legalEntityReference: DEMO.legalEntityReference,
  paymentReference: DEMO.paymentReference,
  currency: DEMO.currency,
  instructedPaymentAmount: DEMO.instructedPaymentAmount,
  mapperVersion: "csv-v1",
  lines: [
    {
      lineId: "LINE-1",
      invoiceReference: DEMO.invoiceReference,
      instructedAmount: DEMO.instructedAmount,
      claimedDeductionAmount: DEMO.claimedDeductionAmount,
      claimedReasonCode: DEMO.claimedReasonCode,
      claimedReasonTextSanitized: DEMO.claimedReasonText,
      sourceRecordIds: [`${DEMO.remittanceId}-SRC`]
    }
  ],
  sourceRecordIds: [`${DEMO.remittanceId}-SRC`],
  provenanceMode: "replay" as const
};

const invoices = [
  {
    invoiceRecordId: DEMO.invoiceReference,
    invoiceReference: DEMO.invoiceReference,
    balance: DEMO.invoiceBalance,
    currency: DEMO.currency
  }
];

function receiptSource() {
  return createSupabaseCashReceiptSource({
    url: "https://demo.invalid",
    serviceRoleKey: "demo-not-a-real-key",
    freshnessMaxAgeSeconds: 86_400,
    freshnessPolicyVersion: "rehearsal-freshness-v1",
    fetcher: () =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              receipt_id: "DEMO-NW-4471-RECEIPT",
              source_system: "rehearsal-proxy",
              source_record_id: "DEMO-NW-4471-SRC",
              payment_reference: DEMO.paymentReference,
              customer_reference: DEMO.customerReference,
              legal_entity_reference: DEMO.legalEntityReference,
              amount_received: DEMO.instructedPaymentAmount,
              currency: DEMO.currency,
              settlement_status: "settled",
              value_date: "2026-08-21",
              observed_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
              retrieved_at: new Date().toISOString(),
              freshness_policy_version: "rehearsal-freshness-v1",
              freshness_status: "fresh",
              record_ids: ["DEMO-NW-4471-SRC"]
            }
          ]),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
      )
  });
}

mkdirSync(assetDir, { recursive: true });

const csv = buildCsv();
const csvPath = join(assetDir, `remittance-${DEMO.paymentReference}.csv`);
writeFileSync(csvPath, csv, "utf8");
console.log(`CSV written: ${csvPath}\n`);
console.log(csv);

const outcome = await runCashApplication({
  advice,
  invoices,
  env: {
    RECOUP_CASH_REHEARSAL_ENABLED: "true",
    RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
  },
  source: receiptSource()
});

console.log("--- pipeline outcome -------------------------------------------");
console.log(JSON.stringify(outcome, null, 2));
