import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  assertNoBrowserErrors,
  assertBrowserTargetReachable,
  checkedGoto,
  ensurePostImplementationScreenshotDir,
  loginAsDemoUser,
  newPageWithErrors,
  resolveBaseUrl,
  type DemoLoginId
} from "./real-evidence-browser-helpers.ts";

interface BaselineCapture {
  liveRoute?: boolean;
  name?: string;
  requestedPath?: string;
  status?: number;
  url?: string;
}

interface BaselineManifest {
  captures?: BaselineCapture[];
}

interface SharedRouteSpec {
  anchor: RegExp;
  loginId: DemoLoginId;
  manifestName: string;
  name: string;
  path: string;
}

const sharedRoutes = [
  { anchor: /CFO Readout|Board metric ledger/u, loginId: "CFO", manifestName: "cfo view if live", name: "cfo", path: "/cfo" },
  {
    anchor: /Credit Arbitration|Credit Sentinel alert/u,
    loginId: "david",
    manifestName: "david credit risk if live",
    name: "credit",
    path: "/credit"
  },
  {
    anchor: /Trace|Audit trace events/u,
    loginId: "CFO",
    manifestName: "trace view if live",
    name: "trace",
    path: "/governance/trace"
  },
  {
    anchor: /Evals \+ FinOps|Release quality/u,
    loginId: "CFO",
    manifestName: "evals finops if live",
    name: "evals-finops",
    path: "/governance/evals-finops"
  }
] as const satisfies readonly SharedRouteSpec[];

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  await assertBrowserTargetReachable(baseUrl);
  const screenshotDir = ensurePostImplementationScreenshotDir();
  const manifest = readBaselineManifest();
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    for (const route of sharedRoutes) {
      const baseline = findBaselineCapture(manifest, route);
      if (baseline.liveRoute !== true) {
        console.log(`Skipping ${route.name}; Phase 0 manifest did not mark it live.`);
        continue;
      }

      const { errors, page } = await newPageWithErrors(browser, { height: 1100, width: 1440 });
      await loginAsDemoUser(page, baseUrl, route.loginId);
      await checkedGoto(page, `${baseUrl}${route.path}`, route.name);
      await page.getByText(route.anchor).first().waitFor({ state: "visible", timeout: 45_000 });
      await page.screenshot({ fullPage: true, path: join(screenshotDir, `shared-${route.name}.png`) });
      assertNoBrowserErrors(errors, route.name);
      await page.close();
    }
  } finally {
    await browser?.close();
  }
}

function readBaselineManifest(): BaselineManifest {
  const path = join("docs", "audit", "real-evidence-baseline", "2026-07-01", "manifest.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.captures)) {
    throw new Error(`${path} is missing a captures array.`);
  }

  return { captures: parsed.captures as BaselineCapture[] };
}

function findBaselineCapture(manifest: BaselineManifest, route: SharedRouteSpec): BaselineCapture {
  const capture = manifest.captures?.find(
    (candidate) => candidate.name === route.manifestName || candidate.requestedPath === route.path || routeUrlPath(candidate.url) === route.path
  );
  if (capture === undefined) {
    throw new Error(`Phase 0 baseline manifest does not include ${route.name} (${route.path}).`);
  }
  if (typeof capture.status === "number" && capture.status >= 500) {
    throw new Error(`Phase 0 baseline ${route.name} already recorded HTTP ${capture.status.toString()}.`);
  }

  return capture;
}

function routeUrlPath(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return new URL(value).pathname;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

await main();
