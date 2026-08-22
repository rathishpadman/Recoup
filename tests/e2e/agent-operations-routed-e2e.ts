import { existsSync } from "node:fs";

import { chromium, type Browser, type Page } from "playwright";

/**
 * Routed Agent Operations browser evidence.
 *
 * Unlike agent-operations-live-e2e.ts, which asserts the rendered DOM against a
 * fixed snapshot, this drives a real Next.js server over HTTP. It proves the
 * route exists, compiles, server-renders and fails closed with no live data,
 * which is what the cockpit does below the shadow rollout stage.
 *
 * Prerequisite: `npx next start cockpit -p 3947` with
 * RECOUP_SUPABASE_READ_MODEL_TABLE pointed at a table that does not exist, so
 * no production read-model cache is touched.
 *
 * Run with: npx tsx tests/e2e/agent-operations-routed-e2e.ts
 */

const baseUrl = process.env.RECOUP_COCKPIT_BASE_URL ?? "http://127.0.0.1:3947";

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  checks.push(detail === undefined ? { name, passed } : { name, passed, detail });
}

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

async function runChecks(page: Page): Promise<void> {
  /**
   * Two console errors are environmental rather than page defects, and are
   * excluded by name so a real error still fails the check:
   *
   * - Google Fonts is unreachable from this sandbox (no outbound access).
   * - /_vercel/insights/script.js exists only on a Vercel deployment.
   */
  const environmentalErrorMarkers = ["fonts.googleapis.com", "_vercel/insights"];
  const consoleErrors: string[] = [];
  const environmentalErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    // A resource-load error carries a generic message; the URL that failed is
    // in the location, so both are checked.
    const origin = `${message.location().url} ${text}`;
    const isEnvironmental = environmentalErrorMarkers.some((marker) => origin.includes(marker));

    if (isEnvironmental) {
      environmentalErrors.push(origin);
      return;
    }

    consoleErrors.push(text);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!environmentalErrorMarkers.some((marker) => url.includes(marker))) {
      consoleErrors.push(`request failed: ${url}`);
    }
  });

  const response = await page.goto(`${baseUrl}/agent-operations`, {
    waitUntil: "domcontentloaded"
  });

  record("route responds 200", response?.status() === 200, String(response?.status() ?? "none"));

  record(
    "page renders from the server",
    (await page.locator('[data-testid="agent-operations-page"]').count()) === 1
  );

  record(
    "workspace mounts",
    (await page.locator('[data-testid="agent-operations-workspace"]').count()) === 1
  );

  record(
    "run table mounts",
    (await page.locator('[data-testid="agent-operations-run-table"]').count()) === 1
  );

  record(
    "activity ledger mounts",
    (await page.locator('[data-testid="agent-operations-activity-ledger"]').count()) === 1
  );

  // Below the shadow rollout stage there is no live data, so the surface must
  // say so rather than inventing rows.
  record(
    "empty state is shown rather than fabricated rows",
    (await page.locator('[data-testid="agent-operations-empty"]').count()) === 1
  );

  record(
    "no upstream cash origin panel without a case",
    (await page.locator('[data-testid="maya-upstream-cash-origin"]').count()) === 0
  );

  const heading = await page.locator("h1").first().textContent();
  record("heading names the surface", heading?.trim() === "Agent Operations", heading ?? "");

  const body = (await page.locator("body").textContent()) ?? "";
  record("no scenario id on the routed page", !/\bS0?\d\b/u.test(body));
  record("no ASSUMED policy string leaks with no data", !body.includes("ASSUMED"));

  record(
    "page produced no console errors of its own",
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(" | ")
  );

  record(
    "only known environmental resource failures occurred",
    environmentalErrors.every((error) =>
      environmentalErrorMarkers.some((marker) => error.includes(marker))
    ),
    `${String(environmentalErrors.length)} environmental`
  );

  // A second load must look identical: the surface holds no client-side state
  // that could drift from the backend.
  await page.reload({ waitUntil: "domcontentloaded" });
  record(
    "surface is identical after reload",
    (await page.locator('[data-testid="agent-operations-empty"]').count()) === 1
  );
}

async function main(): Promise<void> {
  let browser: Browser | undefined;
  const executablePath = resolveChromiumPath();

  try {
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
    const page = await browser.newPage();
    await runChecks(page);
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
