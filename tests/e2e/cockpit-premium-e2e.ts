import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { governedConfigSeedRows } from "../../config/governed.js";
import { releaseOwnerInputSeedRows } from "../../config/releaseOwnerInputs.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";

type DemoRole = "cfo" | "david" | "maya";
type DemoLoginId = "CFO" | "Maya" | "david";
type ScreenshotRole = DemoRole | "anonymous";

interface DemoProfile {
  allowedRoutes: string[];
  defaultRoute: string;
  displayName: string;
  loginId: DemoLoginId;
  role: DemoRole;
}

interface ForensicsE2EModel {
  kpiStrip: Array<{
    label: string;
  }>;
  selected: {
    approvalActions: Array<{
      label: string;
    }>;
    draft: {
      actionId: string;
    };
    evidencePack: {
      documents: Array<{
        documentId: string;
      }>;
      recordIds: string[];
    };
  };
}

interface ManagedProcess {
  child: ChildProcessWithoutNullStreams;
  label: string;
  output: string[];
}

const repoRoot = process.cwd();
const localEnv = loadLocalEnv();
const apiUrl = process.env.RECOUP_E2E_API_URL ?? "http://127.0.0.1:4317";
const appPort = Number(process.env.RECOUP_E2E_COCKPIT_PORT ?? "3000");
const appUrl = `http://127.0.0.1:${String(appPort)}`;
const outputDir = "output/playwright/e2e";
const demoPassword = process.env.RECOUP_E2E_DEMO_PASSWORD ?? "Welcome#123";

const e2eEnv = {
  ...localEnv,
  ...process.env,
  RECOUP_API_URL: apiUrl,
  RECOUP_DEMO_SESSION_SECRET:
    process.env.RECOUP_DEMO_SESSION_SECRET ??
    localEnv.RECOUP_DEMO_SESSION_SECRET ??
    process.env.RECOUP_COCKPIT_AUTH_TOKEN ??
    localEnv.RECOUP_COCKPIT_AUTH_TOKEN ??
    "recoup-local-e2e-session-secret"
};

const demoSessions = {
  cfo: {
    allowedRoutes: ["/cfo", "/governance/agents", "/governance/connectors", "/governance/memory", "/governance/trace"],
    defaultRoute: "/cfo",
    displayName: "CFO",
    loginId: "CFO",
    role: "cfo"
  },
  david: {
    allowedRoutes: ["/credit"],
    defaultRoute: "/credit",
    displayName: "David Kim",
    loginId: "david",
    role: "david"
  },
  maya: {
    allowedRoutes: ["/forensics", "/run"],
    defaultRoute: "/forensics",
    displayName: "Maya Patel",
    loginId: "Maya",
    role: "maya"
  }
} as const satisfies Record<DemoRole, DemoProfile>;

const breakpoints = [
  { height: 812, label: "375", width: 375 },
  { height: 1024, label: "768", width: 768 },
  { height: 768, label: "1024", width: 1024 },
  { height: 900, label: "1440", width: 1440 }
] as const;

const screenshotTargets = [
  { name: "login", path: "/login", role: "anonymous" },
  { name: "maya-forensics", path: "/forensics", role: "maya" },
  { name: "maya-shadcn-forensics", path: "/forensics/shadcn", role: "maya" },
  { name: "maya-run", path: "/run", role: "maya" },
  { name: "david-credit", path: "/credit", role: "david" },
  { name: "david-command", path: "/credit/command", role: "david" },
  { name: "cfo", path: "/cfo", role: "cfo" },
  { name: "governance-agents", path: "/governance/agents", role: "cfo" },
  { name: "governance-connectors", path: "/governance/connectors", role: "cfo" },
  { name: "governance-memory", path: "/governance/memory", role: "cfo" },
  { name: "governance-trace", path: "/governance/trace", role: "cfo" }
] as const satisfies Array<{ name: string; path: string; role: ScreenshotRole }>;

if (process.argv.includes("--fixture-api")) {
  await runFixtureApi();
} else {
  await main({ mayaLoginOnly: process.argv.includes("--maya-login-only") });
}

async function main(options: { mayaLoginOnly: boolean }): Promise<void> {
  const managedProcesses: ManagedProcess[] = [];
  let browser: Browser | undefined;

  try {
    mkdirSync(outputDir, { recursive: true });
    const apiProcess = await ensureApi();
    if (apiProcess !== undefined) {
      managedProcesses.push(apiProcess);
    }

    const cockpitProcess = await ensureCockpit();
    if (cockpitProcess !== undefined) {
      managedProcesses.push(cockpitProcess);
    }

    browser = await chromium.launch({ headless: true });
    await assertApiHealth();
    if (options.mayaLoginOnly) {
      await captureMayaLoginBeatScreenshot(browser);
      console.log(`Maya Beat 1 login screenshot written to ${outputDir}/maya-beat-01-login.png`);
      return;
    }

    await assertRoleRouting(browser);
    await assertPremiumSurfaces(browser);
    await captureResponsiveScreenshots(browser);
    await captureMayaShadcnStoryboardScreenshots(browser);
    console.log(`cockpit e2e passed; screenshots written to ${outputDir}`);
  } catch (error) {
    for (const managedProcess of managedProcesses) {
      dumpRecentOutput(managedProcess);
    }
    throw error;
  } finally {
    if (browser !== undefined) {
      await browser.close();
    }
    if (process.env.RECOUP_E2E_KEEP_SERVERS !== "1") {
      for (const managedProcess of managedProcesses.reverse()) {
        stopProcess(managedProcess.child);
      }
    }
  }
}

async function ensureApi(): Promise<ManagedProcess | undefined> {
  if ((await hasHealthyResponse(`${apiUrl}/healthz`, 200)) && (await hasHealthyResponse(`${apiUrl}/forensics`, 200))) {
    return undefined;
  }

  const managedProcess = startManagedProcess("api", process.execPath, [tsxBin(), "tests/e2e/cockpit-premium-e2e.ts", "--fixture-api"], {
    ...e2eEnv,
    PORT: String(new URL(apiUrl).port || 4317)
  });
  try {
    await waitForUrl(`${apiUrl}/healthz`, 200, 45_000);
    await waitForUrl(`${apiUrl}/forensics`, 200, 45_000);
  } catch (error) {
    dumpRecentOutput(managedProcess);
    stopProcess(managedProcess.child);
    throw error;
  }

  return managedProcess;
}

async function ensureCockpit(): Promise<ManagedProcess | undefined> {
  if (await hasAnyHttpResponse(`${appUrl}/login`)) {
    return undefined;
  }

  const managedProcess = startManagedProcess(
    "cockpit",
    process.execPath,
    [nextBin(), "dev", "cockpit", "--hostname", "127.0.0.1", "--port", String(appPort)],
    e2eEnv
  );
  try {
    await waitForAnyHttpResponse(`${appUrl}/login`, 60_000);
  } catch (error) {
    dumpRecentOutput(managedProcess);
    stopProcess(managedProcess.child);
    throw error;
  }

  return managedProcess;
}

async function assertApiHealth(): Promise<void> {
  const response = await fetch(`${apiUrl}/healthz`);
  assert(response.status === 200, `API health expected 200, received ${String(response.status)}`);
  const payload = (await response.json()) as unknown;
  assert(isRecord(payload) && payload.surface === "cockpit-api", "API health returned unexpected JSON");
}

async function assertRoleRouting(browser: Browser): Promise<void> {
  const anonymous = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  await anonymous.goto(`${appUrl}/forensics`, { waitUntil: "domcontentloaded" });
  await anonymous.waitForURL("**/login", { timeout: 15_000 });
  assert(anonymous.url().endsWith("/login"), "unauthenticated /forensics must redirect to /login");
  await anonymous.close();

  const mayaContext = await newRoleContext(browser, "maya", 1440, 900);
  const mayaPage = await mayaContext.newPage();
  await mayaPage.goto(`${appUrl}/credit`, { waitUntil: "domcontentloaded" });
  await mayaPage.waitForURL("**/forensics", { timeout: 15_000 });
  assert(mayaPage.url().endsWith("/forensics"), "Maya must be redirected away from /credit");
  await expectText(mayaPage, "Deduction Forensics");
  await expectText(mayaPage, "Forensics");
  await expectText(mayaPage, "Run trace");
  await mayaContext.close();

  const davidContext = await newRoleContext(browser, "david", 1440, 900);
  const davidPage = await davidContext.newPage();
  await davidPage.goto(`${appUrl}/forensics`, { waitUntil: "domcontentloaded" });
  await davidPage.waitForURL("**/credit", { timeout: 15_000 });
  assert(davidPage.url().endsWith("/credit"), "David must be redirected away from /forensics");
  await expectText(davidPage, "Credit Arbitration");
  await davidContext.close();

  const cfoContext = await newRoleContext(browser, "cfo", 1440, 900);
  const cfoPage = await cfoContext.newPage();
  await cfoPage.goto(`${appUrl}/governance/connectors`, { waitUntil: "networkidle" });
  await expectText(cfoPage, "Connector readiness");
  await expectText(cfoPage, "Source mode");
  await cfoContext.close();
}

async function assertPremiumSurfaces(browser: Browser): Promise<void> {
  const mayaContext = await newRoleContext(browser, "maya", 1440, 900);
  const forensics = await mayaContext.newPage();
  await forensics.goto(`${appUrl}/forensics`, { waitUntil: "networkidle" });
  await expectLocator(forensics, ".tool-status-rail", "Maya ToolStatusRail");
  await expectLocator(forensics, ".multimodal-dock", "Maya MultimodalDock");
  await expectLocator(forensics, ".audit-verify-chip", "Maya AuditVerifyChip");
  await expectText(forensics, "POD-Retriever");
  await expectText(forensics, "Contract-Reader");
  await expectText(forensics, "TPM-Matcher");
  await expectText(forensics, "voice/text citation parity");
  await expectText(forensics, "ToolStatusRail");
  await expectText(forensics, "MultimodalDoc");

  const run = await mayaContext.newPage();
  await run.goto(`${appUrl}/run`, { waitUntil: "networkidle" });
  await expectLocator(run, ".agent-trace-visualizer", "Run AgentTraceVisualizer");
  await expectText(run, "Trace lanes");
  await expectText(run, "Realtime evidence query");
  await mayaContext.close();

  await assertMayaShadcnReviewRoute(browser);

  const davidContext = await newRoleContext(browser, "david", 1440, 900);
  const credit = await davidContext.newPage();
  await credit.goto(`${appUrl}/credit`, { waitUntil: "networkidle" });
  await expectLocator(credit, ".account-360-panel", "David Account 360 command header");
  await expectLocator(credit, ".negotiation-graph", "David NegotiationGraph");
  await expectLocator(credit, ".audit-verify-chip", "David AuditVerifyChip");
  await expectText(credit, "Action packet");
  await expectText(credit, "Risk Mesh supervisor");
  await expectText(credit, "51.25");
  await expectText(credit, "55%");
  await davidContext.close();

  const davidCommandContext = await newRoleContext(browser, "david", 1440, 900);
  const command = await davidCommandContext.newPage();
  await command.goto(`${appUrl}/credit/command`, { waitUntil: "networkidle" });
  await expectText(command, "David D5 Command Centre");
  await expectText(command, "Portfolio Monitoring Cockpit");
  await expectText(command, "Tool status");
  await expectText(command, "Risk Mesh queue");
  await expectText(command, "Audit status");
  await davidCommandContext.close();

  const cfoContext = await newRoleContext(browser, "cfo", 1440, 900);
  const cfo = await cfoContext.newPage();
  await cfo.goto(`${appUrl}/cfo`, { waitUntil: "networkidle" });
  await expectLocator(cfo, ".board-metric-ledger", "CFO board metric ledger");
  await expectLocator(cfo, ".cfo-provenance-footer", "CFO provenance footer");
  await expectText(cfo, "CFO Readout");
  await expectText(cfo, "$112,400.00");
  await expectText(cfo, "Production calibration proof");
  await cfoContext.close();
}

async function assertMayaShadcnReviewRoute(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const kpi = firstItem(model.kpiStrip, "forensics KPI strip");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const approvalAction = firstItem(model.selected.approvalActions, "selected approval actions");
  const mayaContext = await newRoleContext(browser, "maya", 1440, 900);
  const page = await mayaContext.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await expectVisibleText(page, "Maya");
    await expectVisibleText(page, "Recommended action");
    await expectVisibleText(page, "Human approval");
    await expectVisibleText(page, kpi.label);
    await expectVisibleText(page, recordId);

    await page.getByRole("tab", { name: /Evidence/u }).click();
    await expectVisibleText(page, evidenceDocument.documentId);

    await page.getByRole("button", { name: /Query evidence/u }).click();
    await expectVisibleLocator(page, '[role="dialog"]', "Maya query sheet");
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
    await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya query input");
    await expectVisibleText(page, "Ready for cited query");
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');

    await page.getByRole("button", { name: /Human approval/u }).click();
    await expectVisibleLocator(page, '[role="alertdialog"]', "Maya approval dialog");
    await expectVisibleText(page, model.selected.draft.actionId);
    await expectVisibleText(page, approvalAction.label);
    await expectVisibleText(page, "Reason");
    await closeVisibleOverlay(page, '[role="alertdialog"]');
  } finally {
    await mayaContext.close();
  }
}

async function captureResponsiveScreenshots(browser: Browser): Promise<void> {
  for (const target of screenshotTargets) {
    for (const breakpoint of breakpoints) {
      const context =
        target.role === "anonymous"
          ? await browser.newContext({
              deviceScaleFactor: 1,
              viewport: { height: breakpoint.height, width: breakpoint.width }
            })
          : await newRoleContext(browser, target.role, breakpoint.width, breakpoint.height);
      const page = await context.newPage();
      await page.goto(`${appUrl}${target.path}`, { waitUntil: "networkidle" });
      await page.screenshot({
        fullPage: true,
        path: `${outputDir}/${target.name}-${breakpoint.label}.png`
      });
      await context.close();
    }
  }
}

async function captureMayaShadcnStoryboardScreenshots(browser: Browser): Promise<void> {
  await captureMayaLoginBeatScreenshot(browser);

  const context = await newRoleContext(browser, "maya", 1440, 900);
  const page = await context.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-02-dashboard.png` });

    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-03-recommended-action.png` });

    await page.getByTestId("maya-case-workspace").scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-04-case-overview.png` });

    await page.getByRole("tab", { name: /Evidence/u }).click();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-05-evidence-dossier.png` });

    await page.getByRole("button", { name: /Query evidence/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-06-query-start.png` });
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');

    await page.getByRole("tab", { name: /Trace/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya agent trace");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-07-agent-trace.png` });

    await page.getByTestId("maya-cited-answer").scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-08-cited-answer.png` });

    await page.getByRole("tab", { name: /Draft/u }).click();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-09-draft-review.png` });

    await page.getByRole("button", { name: /Human approval/u }).click();
    await expectVisibleLocator(page, '[role="alertdialog"]', "Maya approval dialog");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-10-human-approval.png` });
    await closeVisibleOverlay(page, '[role="alertdialog"]');

    await page.getByRole("tab", { name: /Audit/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya audit confirmation");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-11-audit-confirmation.png` });

    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-12-return-worklist.png` });
  } finally {
    await context.close();
  }
}

async function captureMayaLoginBeatScreenshot(browser: Browser): Promise<void> {
  const loginContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 900, width: 1440 }
  });
  const loginPage = await loginContext.newPage();

  try {
    await loginPage.goto(`${appUrl}/login?error=demo-login`, { waitUntil: "networkidle" });
    await expectVisibleLocator(loginPage, '[data-testid="maya-login-beat"]', "Maya Beat 1 login scene");
    await expectVisibleLocator(loginPage, 'input[name="loginId"]', "Maya login ID input");
    await expectVisibleLocator(loginPage, 'input[name="password"]', "Maya password input");
    await expectVisibleText(loginPage, "Open workspace");
    await expectVisibleText(loginPage, "Invalid session");

    const legacyLoginNodes = await loginPage
      .locator(".state-shell, .login-workstation, .login-rail, .login-source-rack, .login-form, .login-fields")
      .count();
    assert(legacyLoginNodes === 0, "Maya Beat 1 login must not render legacy cockpit login classes");

    await loginPage.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-01-login.png` });
    await loginPage.locator('input[name="loginId"]').fill(demoSessions.maya.loginId);
    await loginPage.locator('input[name="password"]').fill(demoPassword);
    await loginPage.getByRole("button", { name: /Open workspace/u }).click();
    await loginPage.waitForURL(`**${demoSessions.maya.defaultRoute}`, { timeout: 20_000 });
  } finally {
    await loginContext.close();
  }
}

async function newRoleContext(
  browser: Browser,
  role: DemoRole,
  width: number,
  height: number
): Promise<BrowserContext> {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { height, width } });
  const loginPage = await context.newPage();
  const profile = demoSessions[role];
  await loginPage.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await loginPage.locator('input[name="loginId"]').fill(profile.loginId);
  await loginPage.locator('input[name="password"]').fill(demoPassword);
  await loginPage.getByRole("button", { name: /Open workspace/u }).click();
  await loginPage.waitForURL(`**${profile.defaultRoute}`, { timeout: 20_000 });
  await loginPage.close();

  return context;
}

async function loadForensicsE2EModel(): Promise<ForensicsE2EModel> {
  const response = await fetch(`${apiUrl}/forensics`);
  assert(response.ok, `forensics model expected 2xx, received ${String(response.status)}`);

  return (await response.json()) as ForensicsE2EModel;
}

async function expectLocator(page: Page, selector: string, label: string): Promise<void> {
  const count = await page.locator(selector).count();
  assert(count > 0, `${label} was not rendered`);
}

async function expectText(page: Page, text: string): Promise<void> {
  const count = await page.getByText(text, { exact: false }).count();
  assert(count > 0, `expected visible text: ${text}`);
}

async function expectVisibleLocator(page: Page, selector: string, label: string): Promise<void> {
  const locator = page.locator(selector);
  const count = await locator.count();
  assert(count > 0, `${label} was not rendered`);

  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return;
    }
  }

  throw new Error(`E2E assertion failed: ${label} was not visible`);
}

async function expectVisibleText(page: Page, text: string): Promise<void> {
  const locator = page.getByText(text, { exact: false });
  const count = await locator.count();
  assert(count > 0, `expected rendered text: ${text}`);

  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return;
    }
  }

  throw new Error(`E2E assertion failed: expected visible text: ${text}`);
}

async function closeVisibleOverlay(page: Page, selector: string): Promise<void> {
  await page.keyboard.press("Escape");
  const overlay = page.locator(selector);

  try {
    await overlay.first().waitFor({ state: "hidden", timeout: 2_000 });
    return;
  } catch {
    await page.getByRole("button", { name: /^Close$/u }).last().click();
    await overlay.first().waitFor({ state: "hidden", timeout: 5_000 });
  }
}

function startManagedProcess(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): ManagedProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: sanitizedEnv(env),
    stdio: "pipe",
    windowsHide: true
  });
  const managedProcess: ManagedProcess = { child, label, output: [] };

  child.stdout.on("data", (chunk: Buffer) => {
    appendOutput(managedProcess, chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    appendOutput(managedProcess, chunk);
  });

  return managedProcess;
}

function appendOutput(managedProcess: ManagedProcess, chunk: Buffer): void {
  managedProcess.output.push(chunk.toString("utf8"));
  if (managedProcess.output.length > 24) {
    managedProcess.output.shift();
  }
}

function dumpRecentOutput(managedProcess: ManagedProcess): void {
  if (managedProcess.output.length === 0) {
    return;
  }

  console.error(`--- ${managedProcess.label} recent output ---`);
  console.error(managedProcess.output.join(""));
}

async function waitForUrl(url: string, expectedStatus: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasHealthyResponse(url, expectedStatus)) {
      return;
    }
    await delay(750);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForAnyHttpResponse(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasAnyHttpResponse(url)) {
      return;
    }
    await delay(750);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function hasHealthyResponse(url: string, expectedStatus: number): Promise<boolean> {
  try {
    const response = await fetch(url);

    return response.status === expectedStatus;
  } catch {
    return false;
  }
}

async function hasAnyHttpResponse(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: "manual" });

    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function stopProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      child.kill();
      return;
    }
  }

  child.kill("SIGTERM");
}

function nextBin(): string {
  return join(repoRoot, "node_modules", "next", "dist", "bin", "next");
}

function tsxBin(): string {
  return join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
}

async function runFixtureApi(): Promise<void> {
  const port = Number((process.env.PORT ?? new URL(apiUrl).port) || 4317);
  const server = createServer(
    createCockpitApi({
      env: {
        ...e2eEnv,
        RECOUP_COCKPIT_ALLOWED_ORIGINS: appUrl,
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "recoup-e2e-service-role",
        SUPABASE_URL: "https://recoup-e2e.supabase.co"
      },
      memoryFetcher: fixtureSupabaseFetcher
    })
  );

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve();
    });
  });
  console.log(`Recoup E2E fixture API listening on http://127.0.0.1:${String(port)}`);

  await new Promise<void>((resolve) => {
    const close = (): void => {
      server.close(() => {
        resolve();
      });
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

function fixtureSupabaseFetcher(url: string): Promise<Response> {
  const parsedUrl = new URL(url);
  const tableName = parsedUrl.pathname.split("/").at(-1) ?? "";

  if (tableName === "recoup_config") {
    const keyFilter = parsedUrl.searchParams.get("key") ?? "";
    const rows =
      keyFilter.includes("run_control") || keyFilter.includes("release_eval_label_manifest")
        ? releaseOwnerInputSeedRows
        : governedConfigSeedRows;

    return Promise.resolve(new Response(JSON.stringify(toPostgrestConfigRows(rows)), { status: 200 }));
  }

  if (tableName === "recoup_customers" || tableName === "recoup_deduction_lines") {
    return Promise.resolve(new Response(JSON.stringify(toPostgrestSettlementRows(tableName)), { status: 200 }));
  }

  if (isSyntheticEvidenceSourceTable(tableName)) {
    const customerId = parsedUrl.searchParams.get("customer_id")?.replace(/^eq\./u, "");
    return Promise.resolve(new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerId)), { status: 200 }));
  }

  if (tableName === "customers") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            customer_id: "USCU_S04",
            customer_name: "Harbor Foods",
            r_score_component_scores_json: {
              agingConcentration: 60,
              disputeRate: 75,
              dsoAdp: 80,
              overLimitFrequency: 40
            }
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "payments") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000036" },
          { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "90000060" },
          { customer_id: "USCU_S04", days_to_pay: 32, invoice_ref: "INV-HARB-003" },
          { customer_id: "USCU_S04", days_to_pay: 51, invoice_ref: "90000085" }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "bureau_alerts") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            alert_id: "BUREAU-HARBOR-TAX-LIEN",
            alert_type: "TAX_LIEN",
            customer_id: "USCU_S04",
            resolved: false,
            severity: "CRITICAL"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "deductions_backlog") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S7", invoice_ref: "90000005", verdict: "PARTIAL" },
          { customer_id: "USCU_S04", deduction_id: "DED-HARBOR-S8", invoice_ref: "90000005", verdict: "INVALID" }
        ]),
        { status: 200 }
      )
    );
  }

  return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
}

function toPostgrestConfigRows(
  rows: readonly {
    active: boolean;
    approvedBy: string;
    configHash: string;
    configVersion: number;
    effectiveFrom: string;
    key: string;
    valueJson: Record<string, unknown>;
  }[]
): unknown[] {
  return rows.map((row) => ({
    active: row.active,
    approved_by: row.approvedBy,
    config_hash: row.configHash,
    config_version: row.configVersion,
    effective_from: row.effectiveFrom,
    key: row.key,
    value_json: row.valueJson
  }));
}

function toPostgrestSettlementRows(tableName: string): unknown[] {
  const dataset = buildSyntheticDataset({ seed: 42 });
  if (tableName === "recoup_customers") {
    return dataset.customers.map((customer) => ({
      customer_id: customer.customerId,
      name: customer.name,
      profile: customer.profile
    }));
  }

  return dataset.deductionLines.map((line) => ({
    amount: line.amount.toFixed(2),
    customer_id: line.customerId,
    event_id: line.eventId,
    line_id: line.lineId,
    period: line.period,
    record_ids_json: line.recordIds,
    routing: line.routing,
    rule_id: line.ruleId,
    rule_input_json: line.ruleInput,
    scenario_id: line.scenarioId,
    scenario_type: line.scenarioType,
    verdict: line.verdict
  }));
}

function toPostgrestSyntheticEvidenceRows(tableName: string, customerId: string | undefined): unknown[] {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const lines = dataset.deductionLines.filter((line) => customerId === undefined || line.customerId === customerId);

  if (tableName === "recoup_src_docs") {
    return lines
      .filter((line) => line.ruleId !== "promo-overclaim")
      .map((line) => ({
        customer_id: line.customerId,
        doc_id: `DOC-${line.lineId}`,
        doc_type: docTypeForSyntheticEvidenceLine(line.ruleId),
        linked_record_ids: line.recordIds,
        provenance: "synthetic",
        signed_date: "2026-06-20",
        uri: `supabase://recoup_src_docs/DOC-${line.lineId}`
      }));
  }

  if (tableName === "recoup_src_tpm") {
    return [
      {
        accrued_amount: "14600.00",
        approved_allowance: "14600.00",
        claim_refs: ["S2-L1", "S2-L2", "TPM-CONTRACT-1", "TPM-CONTRACT-2"],
        customer_id: "CUST-CRESTLINE",
        product_scope: { sku: "demo" },
        promo_id: "TPM-CRESTLINE-JUNE",
        promo_type: "allowance",
        provenance: "synthetic",
        window_end: "2026-06-30",
        window_start: "2026-06-01"
      },
      {
        accrued_amount: "15900.00",
        approved_allowance: "15900.00",
        claim_refs: ["S7-L1", "S7-L2", "TPM-ACCRUAL-1", "TPM-ACCRUAL-2"],
        customer_id: "CUST-HARBOR",
        product_scope: { sku: "demo" },
        promo_id: "TPM-HARBOR-JUNE",
        promo_type: "allowance",
        provenance: "synthetic",
        window_end: "2026-06-30",
        window_start: "2026-06-01"
      }
    ].filter((row) => customerId === undefined || row.customer_id === customerId);
  }

  if (tableName === "recoup_src_bureau") {
    const customerIds = [...new Set(lines.map((line) => line.customerId))];
    return customerIds.map((sourceCustomerId) => ({
      as_of_date: "2026-06-20",
      bureau_id: `BUREAU-${sourceCustomerId}`,
      customer_id: sourceCustomerId,
      delinquency_flag: false,
      limit_recommendation: "0.00",
      provenance: "synthetic",
      public_records: {},
      risk_score: 50
    }));
  }

  if (tableName === "recoup_src_sap") {
    return lines.flatMap((line) =>
      line.recordIds
        .filter((recordId) => recordId.startsWith("INV-"))
        .map((recordId) => ({
          customer_id: line.customerId,
          document_type: "invoice",
          entity_set: "C_BillingDocumentFs",
          linked_record_ids: line.recordIds,
          payload_json: { BillingDocument: recordId.replace(/^INV-/u, "") },
          provenance: "sap-odata",
          retrieved_at: "2026-06-20T00:00:00.000Z",
          sap_document_id: `SAP-${recordId}`,
          service_name: "ZUI_BILLINGDOCUMENTFS_0001",
          summary: `Supabase SAP source row for ${recordId}.`
        }))
    );
  }

  return [];
}

function isSyntheticEvidenceSourceTable(tableName: string): boolean {
  return (
    tableName === "recoup_src_bureau" ||
    tableName === "recoup_src_docs" ||
    tableName === "recoup_src_remittance" ||
    tableName === "recoup_src_sap" ||
    tableName === "recoup_src_tpm"
  );
}

function docTypeForSyntheticEvidenceLine(ruleId: string): "POD" | "TPM" | "contract" | "correspondence" {
  if (ruleId === "promo-not-captured") {
    return "TPM";
  }
  if (ruleId === "otif-fine-valid" || ruleId === "pricing-below-contract") {
    return "contract";
  }
  if (ruleId === "duplicate-credit") {
    return "correspondence";
  }

  return "POD";
}

function sanitizedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = { NODE_ENV: env.NODE_ENV };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function loadLocalEnv(): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { NODE_ENV: "development" };

  for (const filePath of [".env", ".env.local", "env.local"]) {
    if (!existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnv(readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined && value.trim().length > 0) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`E2E assertion failed: ${message}`);
  }
}

function firstItem<T>(items: readonly T[], label: string): T {
  const item = items[0];
  assert(item !== undefined, `${label} must include at least one item`);

  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
