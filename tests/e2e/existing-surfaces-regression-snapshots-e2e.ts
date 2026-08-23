import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "playwright";

import { launchEvidenceBrowser } from "./real-evidence-browser-helpers.js";

/**
 * Regression evidence for the surfaces that shipped before the cash slice.
 *
 * The cash work added a route, a backend endpoint and a repository method. None
 * of that should be visible anywhere else, and "should not be" is not evidence,
 * so every existing route is opened and captured under its own name.
 *
 * Credentials are absent in this environment, so these are the unauthenticated
 * states. That still covers what a regression would most likely break — the
 * route compiling, server-rendering and gating — and it does not cover the
 * authenticated content behind the gate, which is recorded rather than implied.
 */

const baseUrl = process.env.RECOUP_COCKPIT_BASE_URL ?? "http://127.0.0.1:3947";
const screenshotDir = join("docs", "qa", "screenshots", "regression");

const routes = [
  { name: "overview", path: "/" },
  { name: "login", path: "/login" },
  { name: "cfo", path: "/cfo" },
  { name: "credit", path: "/credit" },
  { name: "forensics", path: "/forensics" },
  { name: "forensics-shadcn", path: "/forensics/shadcn" },
  { name: "governance", path: "/governance" },
  { name: "governance-trace", path: "/governance/trace" },
  { name: "governance-agents", path: "/governance/agents" },
  { name: "governance-evals-finops", path: "/governance/evals-finops" },
  { name: "governance-memory", path: "/governance/memory" },
  { name: "governance-connectors", path: "/governance/connectors" },
  { name: "finops", path: "/finops" },
  { name: "run", path: "/run" },
  { name: "agent-operations", path: "/agent-operations" }
] as const;

/** Unreachable from this sandbox, and never a defect in the page itself. */
const environmentalMarkers = ["fonts.googleapis.com", "_vercel/insights"];

interface RouteResult {
  name: string;
  path: string;
  status: number;
  consoleErrors: string[];
  screenshot: string;
}

async function captureRoute(page: Page, route: (typeof routes)[number]): Promise<RouteResult> {
  const consoleErrors: string[] = [];

  const onConsole = (message: { type: () => string; text: () => string; location: () => { url: string } }) => {
    if (message.type() !== "error") {
      return;
    }

    const origin = `${message.location().url} ${message.text()}`;
    if (!environmentalMarkers.some((marker) => origin.includes(marker))) {
      consoleErrors.push(message.text());
    }
  };

  page.on("console", onConsole);

  try {
    // Not networkidle: some surfaces poll or hold a stream open, so the network
    // never goes quiet and a wait for it times out on a perfectly healthy page.
    const response = await page.goto(`${baseUrl}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    });

    // Long enough for the first paint to settle, short enough that a route
    // which never settles is still captured rather than aborting the sweep.
    await page.waitForTimeout(1_500);

    const file = join(screenshotDir, `regression-${route.name}.png`);
    await page.screenshot({ path: file, fullPage: true });

    return {
      name: route.name,
      path: route.path,
      status: response?.status() ?? 0,
      consoleErrors,
      screenshot: file
    };
  } catch (error) {
    // One route failing must not hide the state of the fourteen after it.
    consoleErrors.push(error instanceof Error ? error.message : String(error));

    return { name: route.name, path: route.path, status: 0, consoleErrors, screenshot: "none" };
  } finally {
    page.off("console", onConsole);
  }
}

async function main(): Promise<void> {
  mkdirSync(screenshotDir, { recursive: true });

  const browser = await launchEvidenceBrowser();
  const results: RouteResult[] = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    for (const route of routes) {
      results.push(await captureRoute(page, route));
    }
  } finally {
    await browser.close();
  }

  let failures = 0;

  for (const result of results) {
    const ok = result.status === 200 && result.consoleErrors.length === 0;
    if (!ok) {
      failures += 1;
    }

    console.log(
      `${ok ? "PASS" : "FAIL"}  ${result.path.padEnd(28)} ${String(result.status)}  ${result.screenshot}`
    );

    for (const error of result.consoleErrors) {
      console.log(`        console error: ${error}`);
    }
  }

  console.log(
    `\n${String(results.length - failures)}/${String(results.length)} existing surfaces regressed clean.`
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

await main();
