import { createSupabaseCashReceiptSource } from "../src/adapters/supabaseCashReceipt.js";
import { startCashApplicationRun } from "../src/services/cashApplicationRun.js";
import { createSupabaseWorkflowRepository } from "../src/services/supabaseWorkflowRepository.js";

/**
 * End-to-end verification against the real Supabase database.
 *
 * Everything else in the suite runs against mocks or in-memory doubles. This
 * drives the same path through PostgREST: receipts are read from
 * `recoup_cash_receipts`, and the run, its events and the resulting case are
 * written to `recoup_workflow_runs`, `recoup_workflow_events` and
 * `recoup_live_deduction_cases`.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Exits non-zero on any
 * failed check so it can gate a release.
 *
 * Run with: npx tsx scripts/verifyCashApplicationLivePath.ts
 */

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  checks.push(detail === undefined ? { name, passed } : { name, passed, detail });
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    // A skipped verification is not a pass, so this exits rather than
    // degrading to a no-op that a release gate would read as success.
    console.error(
      `${name} is required. Without it this verification cannot run, and a skipped run is not a pass.`
    );
    process.exit(2);
  }

  return value;
}

const url = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const env = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

function adviceFor(suffix: string) {
  return {
    remittanceId: `REM-LIVE-${suffix}`,
    inboundMessageId: `MSG-LIVE-${suffix}`,
    customerReference: "CUST-001",
    legalEntityReference: "LE-001",
    paymentReference: "PAY-1001",
    currency: "USD",
    instructedPaymentAmount: "1250.00",
    mapperVersion: "csv-v1-ASSUMED",
    lines: [
      {
        lineId: "LINE-1",
        invoiceReference: "INV-1",
        instructedAmount: "1000.00",
        claimedDeductionAmount: "250.00",
        claimedReasonCode: "DMG",
        claimedReasonTextSanitized: "damaged pallet on delivery",
        sourceRecordIds: [`REM-LIVE-SRC-${suffix}`]
      }
    ],
    sourceRecordIds: [`REM-LIVE-SRC-${suffix}`],
    provenanceMode: "replay" as const
  };
}

async function main(): Promise<void> {
  const repository = createSupabaseWorkflowRepository({ url, serviceRoleKey });
  const source = createSupabaseCashReceiptSource({
    url,
    serviceRoleKey,
    freshnessMaxAgeSeconds: 86_400,
    freshnessPolicyVersion: "rehearsal-freshness-v1"
  });

  // A fixed suffix keeps the run deterministic, which is what makes the
  // idempotency check below meaningful across repeated executions.
  const advice = adviceFor("001");

  const first = await startCashApplicationRun({ advice, invoices, env, repository, source });

  record("run reaches Ready against the real database", first.state === "Ready", first.state);
  record("a live case was created", first.caseId !== undefined, first.caseId ?? "none");
  record(
    "case cites the rehearsal source, not a live ERP",
    first.liveCase?.receiptId.startsWith("REHEARSAL-") ?? false,
    first.liveCase?.receiptId ?? "none"
  );
  record(
    "short payment is the deduction the remittance claimed",
    first.liveCase?.shortPaymentAmount === "250.00",
    first.liveCase?.shortPaymentAmount ?? "none"
  );
  record(
    "provenance is replay, never live",
    first.liveCase?.provenanceMode === "replay",
    first.liveCase?.provenanceMode ?? "none"
  );

  const events = await repository.listEvents(first.runId);
  record("events persisted to Postgres", events.length > 0, `${String(events.length)} events`);
  record(
    "event sequence is contiguous from one",
    events.every((event, index) => event.runSequence === index + 1),
    events.map((event) => event.runSequence).join(",")
  );
  record(
    "no customer free text reached the event log",
    events.every((event) => !event.safeSummary.includes("damaged pallet")),
    "checked every safeSummary"
  );

  // Replaying the same inbound message must not create a second run or case.
  const second = await startCashApplicationRun({ advice, invoices, env, repository, source });
  record("replay reuses the same run", second.runId === first.runId, second.runId);
  record("replay reuses the same case", second.caseId === first.caseId, second.caseId ?? "none");

  const afterReplay = await repository.listEvents(first.runId);
  record(
    "replay did not rewrite history",
    afterReplay.length >= events.length,
    `${String(events.length)} then ${String(afterReplay.length)}`
  );

  // A payment reference with no settled receipt must wait, not allocate.
  const waiting = await startCashApplicationRun({
    advice: { ...adviceFor("404"), paymentReference: "PAY-DOES-NOT-EXIST" },
    invoices,
    env,
    repository,
    source
  });
  record(
    "an unknown payment waits rather than allocating",
    waiting.state === "AwaitingCashReceipt",
    waiting.state
  );
  record("no case created for a waiting run", waiting.caseId === undefined, waiting.caseId ?? "none");

  // A row that exists but is not settled must not allocate either.
  const pending = await startCashApplicationRun({
    advice: {
      ...adviceFor("pending"),
      paymentReference: "PAY-1003",
      customerReference: "CUST-003"
    },
    invoices,
    env,
    repository,
    source
  });
  record(
    "an unsettled receipt does not allocate",
    pending.state !== "Ready",
    pending.state
  );

  // A settled but old row must be reported stale, not allocated.
  const stale = await startCashApplicationRun({
    advice: {
      ...adviceFor("stale"),
      paymentReference: "PAY-1004",
      customerReference: "CUST-004"
    },
    invoices,
    env,
    repository,
    source
  });
  record("a stale receipt does not allocate", stale.state !== "Ready", stale.state);

  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    const detail = check.detail === undefined ? "" : ` (${check.detail})`;
    console.log(`${status}  ${check.name}${detail}`);
  }

  const failed = checks.filter((check) => !check.passed);
  console.log(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
