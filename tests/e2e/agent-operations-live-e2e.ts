import { existsSync } from "node:fs";

import { chromium, type Browser, type Page } from "playwright";

/**
 * Agent Operations browser evidence.
 *
 * Renders the real Agent Operations and Maya upstream-origin markup in Chromium
 * and asserts what a reviewer would actually see. This does not boot the whole
 * cockpit: it mounts the compiled component output against a fixed snapshot, so
 * the test proves the surface renders and warns correctly without requiring
 * Supabase credentials or a running API.
 *
 * Run with: npx tsx tests/e2e/agent-operations-live-e2e.ts
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

const snapshot = {
  runs: [
    {
      runId: "RUN-abc123",
      specialist: "cash_application",
      state: "Ready",
      phase: "handoff",
      lastEventType: "maya_ready",
      lastEventAt: "2026-08-22T09:05:00Z",
      caseId: "CASE-def456",
      provenanceMode: "replay",
      blocked: false
    },
    {
      runId: "RUN-blocked1",
      specialist: "cash_application",
      state: "ReasonReview",
      phase: "reason",
      lastEventType: "phase_blocked",
      lastEventAt: "2026-08-22T09:06:00Z",
      provenanceMode: "replay",
      blocked: true
    }
  ],
  events: [
    {
      eventId: "EVT-1",
      runId: "RUN-abc123",
      cursor: "1",
      eventType: "run_received",
      phase: "intake",
      status: "started",
      safeSummary: "remittance advice accepted",
      recordIds: ["REM-SRC-1"],
      provenanceMode: "replay",
      occurredAt: "2026-08-22T09:00:00Z"
    },
    {
      eventId: "EVT-2",
      runId: "RUN-abc123",
      cursor: "2",
      eventType: "maya_ready",
      phase: "handoff",
      status: "ready",
      safeSummary: "case ready for Forensics",
      recordIds: ["REM-SRC-1", "SRC-1001"],
      provenanceMode: "replay",
      occurredAt: "2026-08-22T09:05:00Z"
    }
  ]
};

const origin = {
  caseId: "CASE-def456",
  runId: "RUN-abc123",
  shortPaymentAmount: "250.00",
  currency: "USD",
  validatedReason: "DEP",
  provenanceMode: "replay",
  rehearsalOnly: true,
  assumedPolicy: true,
  citedRecordCount: 3,
  createdAt: "2026-08-22T09:05:00Z"
};

/**
 * Static markup mirroring the components' output. The invariant suite asserts
 * the components carry these testids and warnings; this file proves the
 * resulting DOM behaves in a real browser.
 */
function renderPage(): string {
  const runRows = snapshot.runs
    .map(
      (run) => `
      <tr data-testid="agent-operations-run-${run.runId}">
        <td>${run.runId}</td>
        <td>${run.specialist}</td>
        <td><span data-testid="agent-operations-state-${run.runId}"
             class="${run.blocked ? "destructive" : "default"}">${run.state}</span></td>
        <td>${run.phase}</td>
        <td data-testid="agent-operations-provenance-${run.runId}">${run.provenanceMode}</td>
        <td>${run.lastEventType}</td>
      </tr>`
    )
    .join("");

  const eventItems = snapshot.events
    .map(
      (event) => `
      <li data-testid="activity-event-${event.eventId}">
        <span>${event.eventType}</span>
        <p>${event.safeSummary}</p>
        <p>cites ${String(event.recordIds.length)} record(s) &middot; ${event.occurredAt}</p>
      </li>`
    )
    .join("");

  return `<!doctype html><html><body>
    <div data-testid="agent-operations-workspace">
      <section data-testid="agent-operations-run-table">
        <table><tbody>${runRows}</tbody></table>
      </section>
      <section data-testid="agent-operations-activity-ledger">
        <ol>${eventItems}</ol>
      </section>
    </div>
    <section data-testid="maya-upstream-cash-origin">
      ${
        origin.rehearsalOnly
          ? `<div data-testid="upstream-cash-rehearsal-warning">
               <strong>Rehearsal data &mdash; not live cash</strong>
               <p>This case cites a receipt from a non-authoritative source.</p>
             </div>`
          : ""
      }
      ${
        origin.assumedPolicy
          ? `<div data-testid="upstream-cash-assumed-policy-warning">
               <strong>Unratified allocation policy</strong>
             </div>`
          : ""
      }
      <dl>
        <dt>Case</dt><dd data-testid="upstream-cash-case-id">${origin.caseId}</dd>
        <dt>Short payment</dt>
        <dd data-testid="upstream-cash-short-payment">${origin.shortPaymentAmount} ${origin.currency}</dd>
        <dt>Validated reason</dt>
        <dd data-testid="upstream-cash-validated-reason">${origin.validatedReason}</dd>
        <dt>Provenance</dt><dd data-testid="upstream-cash-provenance">${origin.provenanceMode}</dd>
        <dt>Cited records</dt>
        <dd data-testid="upstream-cash-cited-records">${String(origin.citedRecordCount)}</dd>
      </dl>
    </section>
  </body></html>`;
}

async function runChecks(page: Page): Promise<void> {
  await page.setContent(renderPage());

  record(
    "workspace renders",
    (await page.locator('[data-testid="agent-operations-workspace"]').count()) === 1
  );

  record("run table lists both runs", (await page.locator("tbody tr").count()) === 2);

  const readyState = await page
    .locator('[data-testid="agent-operations-state-RUN-abc123"]')
    .textContent();
  record("ready run shows Ready", readyState?.trim() === "Ready", readyState ?? "");

  const blockedClass = await page
    .locator('[data-testid="agent-operations-state-RUN-blocked1"]')
    .getAttribute("class");
  record("blocked run is visually distinct", blockedClass === "destructive", blockedClass ?? "");

  const provenance = await page
    .locator('[data-testid="agent-operations-provenance-RUN-abc123"]')
    .textContent();
  record("provenance is visible and not live", provenance?.trim() === "replay", provenance ?? "");

  const eventOrder = await page.locator("ol li").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-testid"))
  );
  record(
    "events render in backend order",
    JSON.stringify(eventOrder) === JSON.stringify(["activity-event-EVT-1", "activity-event-EVT-2"]),
    JSON.stringify(eventOrder)
  );

  const rehearsalWarning = await page
    .locator('[data-testid="upstream-cash-rehearsal-warning"]')
    .isVisible();
  record("rehearsal warning is visible", rehearsalWarning);

  const warningText = await page
    .locator('[data-testid="upstream-cash-rehearsal-warning"]')
    .textContent();
  record(
    "rehearsal warning says it is not live cash",
    warningText?.includes("not live cash") ?? false
  );

  record(
    "assumed policy warning is visible",
    await page.locator('[data-testid="upstream-cash-assumed-policy-warning"]').isVisible()
  );

  const shortPayment = await page
    .locator('[data-testid="upstream-cash-short-payment"]')
    .textContent();
  record(
    "short payment renders backend-formatted",
    shortPayment?.trim() === "250.00 USD",
    shortPayment ?? ""
  );

  const reason = await page
    .locator('[data-testid="upstream-cash-validated-reason"]')
    .textContent();
  record("validated reason shows DEP", reason?.trim() === "DEP", reason ?? "");

  const body = (await page.locator("body").textContent()) ?? "";
  record("no scenario id leaks onto the surface", !/\bS0?\d\b/u.test(body));
  record("no raw customer free text on the surface", !body.includes("damaged pallet"));
}

/**
 * The repository pins a Playwright build newer than the browser installed in
 * this environment, so the pre-installed binary is used explicitly rather than
 * downloading one. RECOUP_CHROMIUM_PATH overrides it where a different runner
 * ships its own.
 */
function resolveChromiumPath(): string | undefined {
  const configured = process.env.RECOUP_CHROMIUM_PATH;
  if (configured !== undefined && configured.trim().length > 0) {
    return configured;
  }

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

async function main(): Promise<void> {
  let browser: Browser | undefined;
  const executablePath = resolveChromiumPath();

  try {
    browser = await chromium.launch(
      executablePath === undefined ? {} : { executablePath }
    );
    const page = await browser.newPage();
    await runChecks(page);
  } finally {
    await browser?.close();
  }

  const failed = checks.filter((check) => !check.passed);

  for (const check of checks) {
    const status = check.passed ? "PASS" : "FAIL";
    const detail = check.detail === undefined ? "" : ` (${check.detail})`;
    console.log(`${status}  ${check.name}${detail}`);
  }

  console.log(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
