import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";

import { signDemoSession } from "../../cockpit/app/demo-auth.ts";

/**
 * Email to Agent Operations, against a running deployment.
 *
 * This is the path that did not exist: every caller of the intake and the cash
 * run lived in a test, so no email could ever produce a row on the screen. The
 * script posts a signed remittance to the public inbound endpoint and then
 * reads the operations page as a signed-in operator.
 *
 * The assertions are about rendered content with data present. An empty page
 * passing every check is exactly how the missing data path survived review
 * once already, so "no error" is not evidence here.
 *
 * Run against production with:
 *   RECOUP_COCKPIT_BASE_URL=https://... \
 *   RECOUP_INBOUND_SHARED_SECRET=... \
 *   RECOUP_DEMO_SESSION_SECRET=... \
 *   npx tsx tests/e2e/cash-email-to-operations-e2e.ts
 */

const baseUrl = process.env.RECOUP_COCKPIT_BASE_URL ?? "http://127.0.0.1:3947";
const sharedSecret = process.env.RECOUP_INBOUND_SHARED_SECRET ?? "";
const sessionSecret = process.env.RECOUP_DEMO_SESSION_SECRET ?? "";
const approvedRecipient = process.env.RECOUP_INBOUND_APPROVED_RECIPIENT ?? "remittance@recoup.example";
const allowedSender = (process.env.RECOUP_INBOUND_ALLOWED_SENDERS ?? "ar@customer.example")
  .split(",")[0]
  ?.trim();
const screenshotDir = join("docs", "qa", "screenshots", "email-e2e");

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  checks.push(detail === undefined ? { name, passed } : { name, passed, detail });
}

/**
 * The approved CSV v1 format has no quoted fields, so the reason text carries
 * no comma. `docs/demo/assets/remittance-PAY-1001.csv` does quote it and is
 * therefore not ingestible; this row is the conforming equivalent.
 */
function remittanceCsv(paymentReference: string): string {
  return [
    "remittance_id,customer_reference,legal_entity_reference,payment_reference,currency,instructed_payment_amount,line_id,invoice_reference,instructed_amount,claimed_deduction_amount,claimed_reason_code,claimed_reason_text",
    `REM-${paymentReference},CUST-001,LE-001,${paymentReference},USD,1250.00,LINE-1,INV-2026-0912,1000.00,250.00,DMG,two pallets arrived damaged`
  ].join("\n");
}

async function postEmail(paymentReference: string, messageId: string): Promise<Response> {
  const raw = JSON.stringify({
    messageId,
    from: allowedSender,
    to: approvedRecipient,
    subject: `Remittance advice ${paymentReference}`,
    receivedAt: new Date().toISOString(),
    attachment: {
      filename: `remittance-${paymentReference}.csv`,
      mimeType: "text/csv",
      contentBase64: Buffer.from(remittanceCsv(paymentReference), "utf8").toString("base64")
    }
  });

  return fetch(`${baseUrl}/api/inbound/remittance`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-recoup-signature": createHmac("sha256", sharedSecret).update(raw).digest("hex")
    },
    body: raw
  });
}

async function main(): Promise<void> {
  mkdirSync(screenshotDir, { recursive: true });

  if (sharedSecret === "" || sessionSecret === "") {
    console.log("RECOUP_INBOUND_SHARED_SECRET and RECOUP_DEMO_SESSION_SECRET are required.");
    process.exitCode = 1;
    return;
  }

  const stamp = Date.now().toString(36).toUpperCase();
  const paymentReference = `PAY-E2E-${stamp}`;
  const messageId = `MSG-E2E-${stamp}`;

  const accepted = await postEmail(paymentReference, messageId);
  const acceptedBody = (await accepted.json()) as Record<string, unknown>;
  record("inbound endpoint accepts a signed remittance", accepted.status === 202, String(accepted.status));
  record("a run was started", typeof acceptedBody.runId === "string", JSON.stringify(acceptedBody));

  // A redelivery must be refused rather than producing a second run.
  const replay = await postEmail(paymentReference, messageId);
  record("redelivery is refused as a replay", replay.status === 409, String(replay.status));

  // An unsigned caller must never reach the pipeline.
  const unsigned = await fetch(`${baseUrl}/api/inbound/remittance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messageId: "MSG-UNSIGNED" })
  });
  record("unsigned caller is refused", unsigned.status === 401, String(unsigned.status));

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const cookie = signDemoSession(
      {
        allowedRoutes: ["/agent-operations", "/forensics", "/run"],
        defaultRoute: "/forensics/shadcn",
        displayName: "Maya Patel",
        loginId: "Maya",
        role: "maya"
      },
      sessionSecret
    );
    const { hostname } = new URL(baseUrl);
    await context.addCookies([
      { name: "recoup_demo_session", value: cookie, domain: hostname, path: "/" }
    ]);

    const page = await context.newPage();
    await page.goto(`${baseUrl}/agent-operations`, { waitUntil: "networkidle" });

    record(
      "operator can open the page",
      (await page.locator('[data-testid="agent-operations-page"]').count()) === 1
    );

    const rows = page.locator('[data-testid="agent-operations-run-table"] tbody tr');
    const rowCount = await rows.count();
    record("the run reached the screen", rowCount > 0, `${String(rowCount)} rows`);

    if (rowCount > 0) {
      const cells = (await rows.first().locator("td").allTextContents()).map((cell) => cell.trim());
      // Run ID, Agent, Scenario, Customer, Status, Queued at, Started at apply
      // in every state. Completed at and Elapsed apply only to a terminal run,
      // so asserting them unconditionally would demand a wrong answer.
      const alwaysPresent = cells.slice(0, 7);
      record(
        "every column that applies to this state is populated",
        alwaysPresent.every((cell) => cell !== "—" && cell !== ""),
        JSON.stringify(cells)
      );
      record("the row names the customer", cells.includes("CUST-001"), JSON.stringify(cells));

      const status = cells[4] ?? "";
      if (status === "Completed") {
        record(
          "a finished run reports when it finished and how long it took",
          cells[7] !== "—" && cells[8] !== "—",
          JSON.stringify(cells.slice(7))
        );
      }

      await rows.first().click();
      await page.waitForTimeout(600);

      const detail = (await page.locator('[data-testid="agent-operations-run-detail"]').textContent()) ?? "";
      record("run details name the customer", detail.includes("CUST-001"));

      // A case exists only once the run allocates, so this is asserted against
      // what the backend actually reported rather than assumed.
      if (typeof acceptedBody.caseId === "string") {
        record("run details cite the case the run created", detail.includes(acceptedBody.caseId));
      }

      const ledger = (await page.locator('[data-testid="agent-operations-activity-ledger"]').textContent()) ?? "";
      record("ledger shows the phase", ledger.includes("intake"));
      record("ledger cites record IDs", ledger.includes("INBOX-"));
    }

    // Scoped to the rendered surface: the document also carries Next.js flight
    // data, whose $undefined markers are never shown to anyone.
    const surface = (await page.locator('[data-testid="agent-operations-page"]').textContent()) ?? "";
    record("nothing renders as undefined or NaN", !/\b(undefined|NaN)\b/u.test(surface));

    await page.screenshot({
      path: join(screenshotDir, "email-to-agent-operations.png"),
      fullPage: true
    });
  } finally {
    await browser?.close();
  }

  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    const detail = check.detail === undefined || check.detail === "" ? "" : ` (${check.detail})`;
    console.log(`${status}  ${check.name}${detail}`);
  }

  const failed = checks.filter((check) => !check.passed);
  console.log(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
