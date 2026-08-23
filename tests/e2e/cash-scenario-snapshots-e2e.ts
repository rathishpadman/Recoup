import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";

import { createSupabaseCashReceiptSource } from "../../src/adapters/supabaseCashReceipt.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import { CASH_E2E_SCENARIOS, type CashScenario } from "../../scripts/cashE2eScenarios.js";

/**
 * Per-scenario browser evidence for the cash application surface.
 *
 * One screenshot per scenario, named for the scenario, so a reviewer can see
 * what each branch actually renders rather than trusting that ten runs of the
 * same happy path covered ten cases.
 *
 * The receipt transport is stubbed and nothing else is. Each scenario's row is
 * built to the exact shape the seeded row has in `recoup_cash_receipts`, then
 * handed to the real Supabase adapter, so the adapter's own decisions —
 * freshness evaluated at read time, settlement mapping, the cross-currency
 * contract gap — are the decisions under test. Only the network hop is faked.
 *
 * Run with the cockpit already built and serving:
 *   npx next build cockpit
 *   RECOUP_API_URL=http://127.0.0.1:4317 npx next start cockpit -p 3947
 *   npx tsx tests/e2e/cash-scenario-snapshots-e2e.ts
 */

const cockpitUrl = process.env.RECOUP_COCKPIT_BASE_URL ?? "http://127.0.0.1:3947";
const apiPort = Number(process.env.RECOUP_SNAPSHOT_API_PORT ?? "4317");
const screenshotDir = join("docs", "qa", "screenshots", "cash-scenarios");

/** Matches the rehearsal adapter and the seeded rows rather than being chosen here. */
const FRESHNESS_POLICY_VERSION = "rehearsal-freshness-v1";
const FRESHNESS_MAX_AGE_SECONDS = 86_400;

/** Flags on, because a scenario that renders nothing is not evidence. */
const scenarioEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

interface ScenarioResult {
  id: string;
  title: string;
  expected: string;
  state: string;
  caseId: string | undefined;
  screenshot: string;
}

function resolveChromiumPath(): string | undefined {
  for (const candidate of [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/** The row exactly as the seed wrote it, so the adapter sees what production sees. */
function receiptRowsFor(scenario: CashScenario): unknown[] {
  const { receipt } = scenario;

  if (receipt === undefined) {
    return [];
  }

  const observedAt = new Date(Date.now() - receipt.observedHoursAgo * 3_600_000).toISOString();

  return [
    {
      receipt_id: `${scenario.id}-RECEIPT`,
      source_system: "rehearsal-proxy",
      source_record_id: `${scenario.id}-SRC`,
      payment_reference: scenario.paymentReference,
      customer_reference: scenario.customerReference,
      legal_entity_reference: scenario.legalEntityReference,
      amount_received: receipt.amountReceived,
      currency: receipt.currency,
      settlement_status: receipt.settlementStatus,
      value_date: "2026-08-20",
      observed_at: observedAt,
      retrieved_at: new Date().toISOString(),
      freshness_policy_version: "rehearsal-freshness-v1",
      // The stored flag claims fresh even when the row is old. The adapter is
      // required to disagree, which is what SC-06 exists to show.
      freshness_status: "fresh",
      record_ids: [`${scenario.id}-SRC`]
    }
  ];
}

function sourceFor(scenario: CashScenario) {
  return createSupabaseCashReceiptSource({
    url: "https://snapshot.invalid",
    serviceRoleKey: "snapshot-not-a-real-key",
    // The same window and policy version the seeded rows carry, so SC-06's
    // sixty-day-old row is stale for the reason production would call it stale.
    freshnessMaxAgeSeconds: FRESHNESS_MAX_AGE_SECONDS,
    freshnessPolicyVersion: FRESHNESS_POLICY_VERSION,
    fetcher: () =>
      Promise.resolve(
        new Response(JSON.stringify(receiptRowsFor(scenario)), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      )
  });
}

function adviceFor(scenario: CashScenario) {
  // SC-09 claims a reason code that is not in the map, so the run must stop for
  // review rather than inventing a mapping.
  const claimedReasonCode = scenario.id.endsWith("SC-09") ? "ZZZ-UNMAPPED" : "DMG";
  // SC-02 pays in full, so there is no deduction to investigate.
  const deduction = scenario.id.endsWith("SC-02") ? "0.00" : "250.00";
  const instructed = scenario.id.endsWith("SC-02") ? "1250.00" : "1000.00";

  return {
    remittanceId: `REM-${scenario.id}`,
    inboundMessageId: `MSG-${scenario.id}`,
    customerReference: scenario.customerReference,
    legalEntityReference: scenario.legalEntityReference,
    paymentReference: scenario.paymentReference,
    currency: "USD",
    instructedPaymentAmount: "1250.00",
    mapperVersion: "csv-v1",
    lines: [
      {
        lineId: `LINE-${scenario.id}`,
        invoiceReference: "INV-1",
        instructedAmount: instructed,
        claimedDeductionAmount: deduction,
        claimedReasonCode,
        claimedReasonTextSanitized: "damaged pallet",
        sourceRecordIds: [`${scenario.id}-SRC`]
      }
    ],
    sourceRecordIds: [`${scenario.id}-SRC`],
    provenanceMode: "replay" as const
  };
}

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

async function startApiFor(scenario: CashScenario): Promise<{ close: () => Promise<void>; state: string; caseId: string | undefined }> {
  const repository = createInMemoryWorkflowRepository();

  const outcome = await startCashApplicationRun({
    advice: adviceFor(scenario),
    invoices,
    env: scenarioEnv,
    repository,
    source: sourceFor(scenario)
  });

  const server: Server = createServer(
    createCockpitApi({ env: scenarioEnv, workflowRepository: repository })
  );

  await new Promise<void>((resolve) => {
    server.listen(apiPort, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  if (address.port !== apiPort) {
    throw new Error(`API bound to ${String(address.port)} rather than ${String(apiPort)}.`);
  }

  return {
    state: outcome.state,
    caseId: outcome.caseId,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      })
  };
}

async function main(): Promise<void> {
  mkdirSync(screenshotDir, { recursive: true });

  const executablePath = resolveChromiumPath();
  let browser: Browser | undefined;
  const results: ScenarioResult[] = [];

  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath === undefined ? {} : { executablePath })
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    for (const scenario of CASH_E2E_SCENARIOS) {
      const api = await startApiFor(scenario);

      try {
        const response = await page.goto(`${cockpitUrl}/agent-operations`, {
          waitUntil: "networkidle"
        });

        if (response === null || response.status() !== 200) {
          throw new Error(
            `${scenario.id}: /agent-operations returned ${String(response?.status() ?? "no response")}`
          );
        }

        // Named for the scenario so the file itself says what it shows.
        const slug = scenario.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
        const file = join(screenshotDir, `${scenario.id}-${slug}.png`);
        await page.screenshot({ path: file, fullPage: true });

        results.push({
          id: scenario.id,
          title: scenario.title,
          expected: scenario.expected,
          state: api.state,
          caseId: api.caseId,
          screenshot: file
        });
      } finally {
        await api.close();
      }
    }
  } finally {
    await browser?.close();
  }

  console.log(`\nCash scenario snapshots -> ${screenshotDir}\n`);
  for (const result of results) {
    console.log(`${result.id}  ${result.title}`);
    console.log(`         run state : ${result.state}`);
    console.log(`         case      : ${result.caseId ?? "none"}`);
    console.log(`         expected  : ${result.expected}`);
    console.log(`         snapshot  : ${result.screenshot}`);
  }

  console.log(`\n${String(results.length)} of ${String(CASH_E2E_SCENARIOS.length)} scenarios captured.`);

  if (results.length !== CASH_E2E_SCENARIOS.length) {
    process.exitCode = 1;
  }
}

await main();
