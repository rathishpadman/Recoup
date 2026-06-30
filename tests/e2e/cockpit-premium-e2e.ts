import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Request as PlaywrightRequest,
  type Route
} from "playwright";
import { governedConfigSeedRows } from "../../config/governed.js";
import { releaseOwnerInputSeedRows } from "../../config/releaseOwnerInputs.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import type { EvalFinopsCockpitModel } from "../../src/services/evalsFinopsTypes.js";

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
  actionInbox: unknown[];
  kpiStrip: Array<{
    label: string;
  }>;
  recoveryTracker: {
    billingLines: number;
    recoveryLines: number;
  };
  worklist: Array<{
    amount: string;
    confidenceLabel: string;
    customerLabel: string;
    evidenceScoreLabel: string;
    lineId: string;
    lineIds: string[];
    queueLabel: string;
    recommendedActionLabel: string;
    routingLabel: string;
    scenarioLabel: string;
    verdict: "valid" | "invalid" | "partial";
    verdictLabel: string;
  }>;
  selected: {
    lineId: string;
    approvalEligibility: {
      available: boolean;
      statusLabel: string;
    };
    approvalActions: Array<{
      decision: "approve" | "modify" | "reject";
      label: string;
      requiresReason: boolean;
    }>;
    draft: {
      actionId: string;
      actionLabel: string;
      approvalEligibility: {
        available: boolean;
        statusLabel: string;
      };
      amount: string;
      basis: string;
      statusLabel: string;
    };
    evidencePack: {
      documents: Array<{
        citationId: string;
        description: string;
        documentId: string;
        documentType: string;
        relevance: string;
        sourceLabel: string;
        summary: string;
        verifiedLabel: string;
      }>;
      recordIds: string[];
    };
  };
}

type ForensicsE2EWorklistItem = ForensicsE2EModel["worklist"][number];

interface ConnectorE2EModel {
  checkedAtIso: string;
  sourceHealth: Array<unknown>;
  lastRefreshedLabel: string;
  sourceTiles: Array<{
    key: string;
    label: string;
    modeLabel: string;
    stateLabel: string;
    statusTone: "ready" | "synthetic" | "blocked";
    summary: string;
  }>;
}

interface ForensicsWorkItemDetailE2EModel {
  auditState: {
    statusLabel: string;
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
const appUrl = `http://localhost:${String(appPort)}`;
const outputDir = "output/playwright/e2e";
const demoPassword = process.env.RECOUP_E2E_DEMO_PASSWORD ?? "Welcome#123";

const e2eEnv = {
  ...localEnv,
  ...process.env,
  RECOUP_API_URL: apiUrl,
  RECOUP_READ_MODEL_CACHE: "disabled",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL:
    process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL ?? localEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL ?? "human:e2e-cockpit",
  RECOUP_COCKPIT_AUTH_TOKEN:
    process.env.RECOUP_COCKPIT_AUTH_TOKEN ?? localEnv.RECOUP_COCKPIT_AUTH_TOKEN ?? "recoup-e2e-human-auth-token",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY ?? "recoup-e2e-service-role",
  SUPABASE_URL: process.env.SUPABASE_URL ?? localEnv.SUPABASE_URL ?? apiUrl,
  RECOUP_DEMO_SESSION_SECRET:
    process.env.RECOUP_DEMO_SESSION_SECRET ??
    localEnv.RECOUP_DEMO_SESSION_SECRET ??
    process.env.RECOUP_COCKPIT_AUTH_TOKEN ??
    localEnv.RECOUP_COCKPIT_AUTH_TOKEN ??
    "recoup-local-e2e-session-secret"
};

const demoSessions = {
  cfo: {
    allowedRoutes: [
      "/cfo",
      "/governance/agents",
      "/governance/connectors",
      "/governance/evals-finops",
      "/governance/memory",
      "/governance/trace"
    ],
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
    defaultRoute: "/forensics/shadcn",
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
  { name: "landing", path: "/", role: "anonymous" },
  { name: "login", path: "/login", role: "anonymous" },
  { name: "maya-forensics", path: "/forensics", role: "maya" },
  { name: "maya-shadcn-forensics", path: "/forensics/shadcn", role: "maya" },
  { name: "maya-run", path: "/run", role: "maya" },
  { name: "david-credit", path: "/credit", role: "david" },
  { name: "david-command", path: "/credit/command", role: "david" },
  { name: "cfo", path: "/cfo", role: "cfo" },
  { name: "governance-agents", path: "/governance/agents", role: "cfo" },
  { name: "governance-connectors", path: "/governance/connectors", role: "cfo" },
  { name: "governance-evals-finops", path: "/governance/evals-finops", role: "cfo" },
  { name: "governance-memory", path: "/governance/memory", role: "cfo" },
  { name: "governance-trace", path: "/governance/trace", role: "cfo" }
] as const satisfies Array<{ name: string; path: string; role: ScreenshotRole }>;

if (process.argv.includes("--fixture-api")) {
  await runFixtureApi();
} else {
  await main({
    mayaLoginOnly: process.argv.includes("--maya-login-only"),
    mayaShadcnOnly: process.argv.includes("--maya-shadcn-only")
  });
}

async function main(options: { mayaLoginOnly: boolean; mayaShadcnOnly: boolean }): Promise<void> {
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
    await assertLandingPage(browser);
    if (options.mayaLoginOnly) {
      await captureMayaLoginBeatScreenshot(browser);
      console.log(`Maya Beat 1 login screenshot written to ${outputDir}/maya-beat-01-login.png`);
      return;
    }
    if (options.mayaShadcnOnly) {
      await captureMayaLoginBeatScreenshot(browser);
      await captureMayaBeat2LandingScreenshot(browser);
      await captureMayaBeat3RecommendedActionScreenshot(browser);
      await captureMayaBeat4CaseOverviewScreenshot(browser);
      await captureMayaBeat5EvidenceDossierScreenshot(browser);
      await captureMayaBeat6QueryStartScreenshot(browser);
      await captureMayaBeat7AgentTraceScreenshot(browser);
      await captureMayaBeat8CitedAnswerScreenshot(browser);
      await captureMayaBeat9DraftReviewScreenshot(browser);
      await captureMayaBeat10HumanApprovalScreenshot(browser);
      await captureMayaBeat11AuditConfirmationScreenshot(browser);
      await captureMayaBeat12ReturnWorklistScreenshot(browser);
      console.log(
        `Maya Beat 1 through Beat 12 checked; screenshots written to ${outputDir}/maya-beat-01-login.png, ${outputDir}/maya-beat-02-dashboard.png, ${outputDir}/maya-beat-03-recommended-action.png, ${outputDir}/maya-beat-04-case-overview.png, ${outputDir}/maya-beat-05-evidence-dossier.png, ${outputDir}/maya-beat-06-query-start.png, ${outputDir}/maya-beat-07-agent-trace.png, ${outputDir}/maya-beat-08-cited-answer.png, ${outputDir}/maya-beat-09-draft-review.png, ${outputDir}/maya-beat-10-human-approval.png, ${outputDir}/maya-beat-11-audit-confirmation.png, ${outputDir}/maya-beat-12-return-worklist.png`
      );
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
  if (
    (await hasFixtureApiRoot(`${apiUrl}/`)) &&
    (await hasHealthyResponse(`${apiUrl}/healthz`, 200)) &&
    (await hasHealthyResponse(`${apiUrl}/forensics`, 200))
  ) {
    return undefined;
  }

  const managedProcess = startManagedProcess("api", process.execPath, [tsxBin(), "tests/e2e/cockpit-premium-e2e.ts", "--fixture-api"], {
    ...e2eEnv,
    PORT: String(new URL(apiUrl).port || 4317)
  });
  try {
    await waitForUrl(`${apiUrl}/healthz`, 200, 45_000);
    await waitForUrl(`${apiUrl}/forensics`, 200, 45_000);
    assert(await hasFixtureApiRoot(`${apiUrl}/`), "E2E API must be the fixture API after startup");
  } catch (error) {
    dumpRecentOutput(managedProcess);
    stopProcess(managedProcess.child);
    throw error;
  }

  return managedProcess;
}

async function ensureCockpit(): Promise<ManagedProcess | undefined> {
  if ((await hasAnyHttpResponse(`${appUrl}/login`)) && (await hasHealthyResponse(workItemDetailRouteProbeUrl(), 401))) {
    return undefined;
  }

  const managedProcess = startManagedProcess(
    "cockpit",
    process.execPath,
    [nextBin(), "dev", "cockpit", "--hostname", "localhost", "--port", String(appPort)],
    e2eEnv
  );
  try {
    await waitForAnyHttpResponse(`${appUrl}/login`, 60_000);
    await waitForUrl(workItemDetailRouteProbeUrl(), 401, 60_000);
  } catch (error) {
    dumpRecentOutput(managedProcess);
    stopProcess(managedProcess.child);
    throw error;
  }

  return managedProcess;
}

function workItemDetailRouteProbeUrl(): string {
  return `${appUrl}/api/forensics/work-items/__route_probe__`;
}

async function assertApiHealth(): Promise<void> {
  const response = await fetch(`${apiUrl}/healthz`);
  assert(response.status === 200, `API health expected 200, received ${String(response.status)}`);
  const payload = (await response.json()) as unknown;
  assert(isRecord(payload) && payload.surface === "cockpit-api", "API health returned unexpected JSON");
}

async function assertLandingPage(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  const apiRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      apiRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  try {
    await page.goto(`${appUrl}/`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="recoup-landing-page"]', "Recoup landing page");
    await expectVisibleLocator(page, '[data-testid="recoup-landing-shell"]', "Recoup single-viewport landing shell");
    await expectVisibleLocator(page, '[data-testid="recoup-landing-hero"]', "Recoup landing hero");
    await expectVisibleText(page, "CPG manufacturers lose 2–5% of gross revenue to retailer deductions.");
    await expectVisibleText(page, "Recoup is an agentic Order-to-Cash recovery cockpit");
    await expectVisibleText(page, "Code computes.");
    const heroCopy = await page.getByTestId("recoup-landing-hero").innerText();
    assert(!heroCopy.includes("McKinsey"), "Landing hero must not show the reference strip below the persona CTAs");
    assert(!heroCopy.includes("RVCF"), "Landing hero must not show the reference strip below the persona CTAs");
    assert(!heroCopy.includes("APQC"), "Landing hero must not show the reference strip below the persona CTAs");
    assert(!heroCopy.includes("UpClear"), "Landing hero must not show the reference strip below the persona CTAs");
    await expectVisibleText(page, "McKinsey");
    await expectVisibleText(page, "RVCF");
    await expectVisibleText(page, "UpClear");
    await expectVisibleLocator(page, '[data-testid="recoup-landing-tab-problem"]', "Recoup Problem tab");

    for (const target of [
      { label: "Solution", selector: '[data-testid="recoup-landing-tab-solution"]' },
      { label: "Demo", selector: '[data-testid="recoup-landing-tab-demo"]' },
      { label: "Tech", selector: '[data-testid="recoup-landing-tab-tech"]' },
      { label: "How We Built It", selector: '[data-testid="recoup-landing-tab-build"]' },
      { label: "About", selector: '[data-testid="recoup-landing-tab-about"]' }
    ] as const) {
      await page.getByRole("tab", { name: target.label }).click();
      await expectVisibleLocator(page, target.selector, `Recoup ${target.label} tab`);
    }

    await page.getByRole("tab", { name: "Problem" }).click();
    await expectVisibleText(page, "65–80%");
    await expectVisibleText(page, "Deduction proof is scattered");
    await expectVisibleText(page, "Credit decisions lack dispute context");
    await expectVisibleText(page, "Recovery actions need control");

    await page.getByRole("tab", { name: "Solution" }).click();
    await expectVisibleText(page, "Deduction Forensics & Recovery");
    await expectVisibleText(page, "Credit Risk Sentinel");
    await expectVisibleText(page, "Evidence packet");
    await expectVisibleText(page, "Human-approved recovery");
    await expectVisibleText(page, "Exposure signals");
    await expectVisibleText(page, "Human-approved action");
    await expectVisibleText(page, "Code computes dollars and risk math");
    await expectVisibleText(page, "Tamper-evident audit trail");

    await page.getByRole("tab", { name: "Tech" }).click();
    const architectureImage = page.locator('img[src="/architecture-diagram.png"]');
    await architectureImage.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector('img[src="/architecture-diagram.png"]');
        return (
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0
        );
      },
      undefined,
      { timeout: 15_000 }
    );
    const initialArchitectureImage = await architectureImage.evaluate((image) => {
      if (!(image instanceof HTMLImageElement)) {
        return null;
      }
      const rect = image.getBoundingClientRect();
      return {
        complete: image.complete,
        height: rect.height,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
        width: rect.width
      };
    });
    assert(
      initialArchitectureImage !== null &&
        initialArchitectureImage.complete &&
        initialArchitectureImage.naturalWidth > 0 &&
        initialArchitectureImage.naturalHeight > 0 &&
        initialArchitectureImage.width > 0 &&
        initialArchitectureImage.height > 0,
      `architecture diagram must render a decoded image, received ${JSON.stringify(initialArchitectureImage)}`
    );
    await expectVisibleText(page, "100%");
    await page.getByLabel("Zoom architecture diagram in").click();
    await expectVisibleText(page, "125%");
    const zoomedArchitectureImage = await architectureImage.evaluate((image) => {
      const rect = image.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width
      };
    });
    assert(
      zoomedArchitectureImage.width > initialArchitectureImage.width + 1,
      `architecture diagram zoom must increase rendered width from ${String(initialArchitectureImage.width)}px; received ${String(
        zoomedArchitectureImage.width
      )}px`
    );

    await page.getByRole("tab", { name: "How We Built It" }).click();
    await expectVisibleText(page, "OpenAI Agents SDK orchestration");
    const buildCopy = await page.getByTestId("recoup-landing-tab-build").innerText();
    assert(!/Claude|Codex|Superpowers/iu.test(buildCopy), "How We Built It must not expose internal coding tool references");
    assertNoForbiddenRequests(apiRequests, "Public landing page");
    await assertNoHorizontalOverflow(page, "Recoup landing desktop");
    const viewportFit = await page.evaluate(() => ({
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight
    }));
    assert(
      viewportFit.scrollHeight <= viewportFit.innerHeight + 4,
      `landing page must fit one desktop viewport, received ${JSON.stringify(viewportFit)}`
    );

    await page.getByRole("tab", { name: "Demo" }).click();
    await expectVisibleLocator(page, '[data-testid="recoup-landing-tab-demo"]', "Recoup Demo tab before CTA");
    await page.getByTestId("recoup-landing-maya-cta").click();
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("loginId") === "Maya", {
      timeout: 15_000
    });
    assert(
      new URL(page.url()).searchParams.get("loginId") === "Maya",
      "Maya landing CTA must route to the existing login flow with a Maya loginId hint"
    );
    await expectVisibleLocator(page, 'input[name="loginId"]', "Maya landing-prefilled login ID input");
    await expectLoginIdValue(page, "Maya");
  } finally {
    await page.close();
  }
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
  await mayaPage.waitForURL("**/forensics/shadcn", { timeout: 15_000 });
  assert(mayaPage.url().endsWith("/forensics/shadcn"), "Maya must be redirected away from /credit");
  await mayaPage.locator('[data-testid="maya-sidebar"]').waitFor({ state: "visible", timeout: 15_000 });
  await expectVisibleText(mayaPage, "Deduction Forensics");
  await expectVisibleText(mayaPage, "Forensics");
  const mayaNavItems = await mayaPage.locator('[data-testid="maya-sidebar-nav-item"]').all();
  const mayaNavLabels: string[] = [];
  for (const mayaNavItem of mayaNavItems) {
    mayaNavLabels.push((await mayaNavItem.innerText()).replace(/\s+/gu, " ").trim());
  }
  assert(
    JSON.stringify(mayaNavLabels) === JSON.stringify(["Overview", "Worklist 8", "Cases", "Evidence", "Approvals 20"]),
    `Maya shadcn sidebar must match the production sidebar, received ${JSON.stringify(mayaNavLabels)}`
  );
  for (const legacyLabel of ["Configuration", "Run trace", "Analytics", "Deductions"]) {
    assert(!mayaNavLabels.some((label) => label.includes(legacyLabel)), `Maya shadcn sidebar must not show legacy nav ${legacyLabel}`);
  }
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

  const mayaGovernanceContext = await newRoleContext(browser, "maya", 1440, 900);
  const mayaGovernancePage = await mayaGovernanceContext.newPage();
  await mayaGovernancePage.goto(`${appUrl}/governance/evals-finops`, { waitUntil: "domcontentloaded" });
  await mayaGovernancePage.waitForURL("**/forensics/shadcn", { timeout: 15_000 });
  assert(mayaGovernancePage.url().endsWith("/forensics/shadcn"), "Maya must be redirected away from /governance/evals-finops");
  await mayaGovernanceContext.close();
}

async function captureMayaBeat2LandingScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const connectors = await loadConnectorE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const overviewDirectOpenTarget =
    model.worklist.find((item) => item.lineId === "S1-L1") ?? firstItem(model.worklist, "worklist rows");
  const beat2RowOpenTarget = model.worklist.find((item) => item.lineId !== backendSelectedRow.lineId);
  assert(
    beat2RowOpenTarget !== undefined,
    "Maya Beat 2 row-open contract requires a known non-selected backend worklist row"
  );

  for (const target of [
    { height: 1024, label: "", width: 1600 },
    { height: 900, label: "-1440", width: 1440 },
    { height: 900, label: "-1280", width: 1280 }
  ]) {
    const context = await newRoleContext(browser, "maya", target.width, target.height);
    const page = await context.newPage();
    const workItemDetailRequests: string[] = [];

    page.on("request", (request) => {
      if (request.url().includes("/api/forensics/work-items/")) {
        workItemDetailRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    try {
      await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
      await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
      await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview landing section");
      await expectVisibleLocator(page, '[data-testid="maya-run-kpi-strip"]', "Maya Overview KPI strip");
      await openMayaOverviewSourceReadiness(page, `Maya Beat 2 ${String(target.width)}px`, { expectInitiallyHidden: true });
      await expectVisibleLocator(page, '[data-testid="maya-overview-command-center"]', "Maya Overview command center");
      await expectVisibleLocator(page, '[data-testid="maya-overview-intelligence-grid"]', "Maya Overview intelligence grid");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-table"]', "Maya Overview concentration table");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-header-row"]', "Maya Overview concentration header row");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-row"]', "Maya Overview concentration row");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-filter"]', "Maya Overview concentration filter");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-id"]', "Maya Overview concentration ID sort");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-customer"]', "Maya Overview concentration customer sort");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-lines"]', "Maya Overview concentration lines sort");
      await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-exposure"]', "Maya Overview concentration exposure sort");
      await assertRecoupAgentLauncherPlacement(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertRecoupAgentLauncherAvoidsOverviewData(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertNoHorizontalOverflow(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertNoClippedBeat2Chips(page, `Maya Beat 2 ${String(target.width)}px`);
      const overviewDetailPath = `/api/forensics/work-items/${encodeURIComponent(overviewDirectOpenTarget.lineId)}`;
      const overviewDetailRequest = page.waitForRequest(
        (request) => request.method() === "GET" && request.url().includes(overviewDetailPath),
        { timeout: 5_000 }
      );
      await page.locator(`[data-testid="maya-overview-case-concentration-row"][data-line-id="${overviewDirectOpenTarget.lineId}"]`).click();
      await overviewDetailRequest;
      await expectMayaCaseDetailFlow(
        page,
        overviewDirectOpenTarget,
        `Maya Beat 2 ${String(target.width)}px overview row direct-open`
      );
      await page.getByRole("button", { name: /^Overview$/u }).click();
      await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview after concentration row direct-open");
      await assertBeat2SourceReadinessFidelity(page, connectors, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2HeaderFidelity(page, connectors, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2SidebarFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2OverviewIsNotBlank(page, model, `Maya Beat 2 ${String(target.width)}px`);
      await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-02-dashboard${target.label}.png` });
      await page.getByTestId("maya-header-work-items-link").click();
      await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist section from header work-items link");
      await page.getByRole("button", { name: /^Overview$/u }).click();
      await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview after header work-items link return");
      if (target.label === "") {
        await assertRecoupAgentLauncherDoesNotReplayAfterCanceledDetailLoad(browser, backendSelectedRow, beat2RowOpenTarget);
        await assertMayaDetailErrorStateIsActionable(browser, beat2RowOpenTarget);
        await assertRecoupAgentLauncherOpensGroundedDock(page);
      }
      await page.getByRole("button", { name: /^Cases$/u }).click();
      await assertBeat2CasesRootFidelity(page, model, backendSelectedRow, `Maya Beat 2 ${String(target.width)}px`);
      await page.getByRole("button", { name: /^Evidence$/u }).click();
      await assertBeat2EvidenceRootFidelity(page, connectors, `Maya Beat 2 ${String(target.width)}px`);
      await page.getByRole("button", { name: /^Worklist$/u }).click();
      await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist section");
      await expectVisibleText(page, "Deduction Worklist");
      await assertBeat2WorklistFit(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2RightPaneFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2RowStartsUnselected(page, beat2RowOpenTarget, `Maya Beat 2 ${String(target.width)}px`);
      const detailRequestsBeforeRowClick = workItemDetailRequests.length;
      await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${beat2RowOpenTarget.lineId}"]`).click();
      await assertBeat3RecommendedActionFidelity(
        page,
        beat2RowOpenTarget,
        `Maya Beat 2 ${String(target.width)}px row selection`
      );
      assert(
        workItemDetailRequests.length === detailRequestsBeforeRowClick,
        `Maya Beat 2 ${String(target.width)}px row click must not request backend detail: ${workItemDetailRequests
          .slice(detailRequestsBeforeRowClick)
          .join(", ")}`
      );
      const expectedDetailPath = `/api/forensics/work-items/${encodeURIComponent(beat2RowOpenTarget.lineId)}`;
      const explicitDetailRequest = page.waitForRequest(
        (request) => request.method() === "GET" && request.url().includes(expectedDetailPath),
        { timeout: 5_000 }
      );
      const rowScopedOpenButton = page
        .locator(`[data-testid="maya-worklist-row"][data-line-id="${beat2RowOpenTarget.lineId}"]`)
        .getByTestId("maya-row-action-open");
      await rowScopedOpenButton.focus();
      await page.keyboard.press("Enter");
      await explicitDetailRequest;
      if (target.label === "") {
        await page.locator('[data-testid="maya-query-dock"]').waitFor({ state: "hidden", timeout: 5_000 });
        assert(
          (await page.locator('[data-testid="maya-query-dock"]').count()) === 0,
          "Recoup Agent launcher signal must not replay when opening an investigation normally"
        );
      }
      assert(
        workItemDetailRequests.length === detailRequestsBeforeRowClick + 1,
        `Maya Beat 2 ${String(target.width)}px explicit open must request exactly one backend detail packet: ${workItemDetailRequests.join(", ")}`
      );
      await expectMayaCaseDetailFlow(
        page,
        beat2RowOpenTarget,
        `Maya Beat 2 ${String(target.width)}px row-open flow`
      );
    } finally {
      await context.close();
    }
  }

  await assertRecoupAgentLauncherMobilePlacement(browser);
}

async function captureMayaBeat3RecommendedActionScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const alternateRow = model.worklist.find((item) => item.lineId !== backendSelectedRow.lineId);
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 3 default selected row");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-03-recommended-action.png` });

    if (alternateRow !== undefined) {
      await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${alternateRow.lineId}"]`).click();
      await assertBeat3ReadModelMismatch(page, alternateRow);
    }
  } finally {
    await context.close();
  }
}

async function assertRecoupAgentLauncherOpensGroundedDock(page: Page): Promise<void> {
  const launcherRect = await assertRecoupAgentLauncherPlacement(page, "Maya Recoup Agent query dock");
  const launcherStyle = await page.getByTestId("recoup-agent-launcher").evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color
    };
  });
  assert(
    launcherStyle.backgroundColor !== "" &&
      launcherStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      launcherStyle.backgroundColor !== "transparent",
    `Recoup Agent launcher must use the distinct floating chat treatment; background=${launcherStyle.backgroundColor}`
  );
  assert(launcherStyle.color !== "", "Recoup Agent launcher must expose readable foreground color");
  await page.getByTestId("recoup-agent-launcher").click();
  await page.locator('[data-testid="maya-query-dock"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="maya-selected-evidence-context"]').waitFor({ state: "visible", timeout: 15_000 });
  await assertRecoupAgentLauncherDoesNotObstructQueryDock(page, launcherRect);
  const dockText = await page.getByTestId("maya-query-dock").innerText();
  assert(dockText.includes("Selected evidence packet"), "Recoup Agent launcher must open the selected evidence packet context");
  assert(dockText.includes("Client-selected case context"), "Recoup Agent launcher must keep honest selected-case query context");
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
}

async function assertRecoupAgentLauncherMobilePlacement(browser: Browser): Promise<void> {
  const context = await newRoleContext(browser, "maya", 390, 844);
  const page = await context.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya mobile shadcn workbench");
    await assertRecoupAgentLauncherPlacement(page, "Maya mobile Recoup Agent launcher");
  } finally {
    await context.close();
  }
}

interface RectLike {
  height: number;
  width: number;
  x: number;
  y: number;
}

async function assertRecoupAgentLauncherPlacement(page: Page, label: string): Promise<RectLike> {
  await expectVisibleLocator(page, '[data-testid="recoup-agent-launcher"]', "Recoup Agent launcher");
  const launcherRect = await page.getByTestId("recoup-agent-launcher").boundingBox();
  const viewportSize = page.viewportSize();
  assert(launcherRect !== null, `${label} Recoup Agent launcher must expose a measurable viewport rect`);
  assert(viewportSize !== null, `${label} Recoup Agent launcher viewport check requires a viewport`);
  const bottomInset = viewportSize.height - (launcherRect.y + launcherRect.height);
  assert(
    launcherRect.x >= 0 &&
      launcherRect.x + launcherRect.width <= viewportSize.width &&
      launcherRect.y >= 0 &&
      launcherRect.y + launcherRect.height <= viewportSize.height,
    `${label} Recoup Agent launcher must be fully visible in the current viewport before click; rect=${JSON.stringify(launcherRect)}`
  );
  assert(
    launcherRect.y >= viewportSize.height - 96 && bottomInset <= 32,
    `${label} Recoup Agent launcher must sit on the bottom rail below overview rows; rect=${JSON.stringify(
      launcherRect
    )} viewport=${JSON.stringify(viewportSize)}`
  );

  return launcherRect;
}

async function assertRecoupAgentLauncherAvoidsOverviewData(page: Page, label: string): Promise<void> {
  const launcherRect = await page.getByTestId("recoup-agent-launcher").boundingBox();
  assert(launcherRect !== null, `${label} Recoup Agent launcher overlap check requires a launcher rect`);
  const checkedSelectors = [
    '[data-testid="maya-overview-case-concentration-header-row"]',
    '[data-testid="maya-overview-case-concentration-row"]',
    '[data-testid="maya-overview-case-concentration-sort-exposure"]'
  ];

  for (const selector of checkedSelectors) {
    const boxes = await page.locator(selector).evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
        })
        .filter((rect) => rect.height > 0 && rect.width > 0)
    );
    const guardedBoxes = selector.includes("case-concentration-row") ? boxes.slice(0, 2) : boxes;
    for (const box of guardedBoxes) {
      assert(
        !rectsIntersect(launcherRect, box),
        `${label} Recoup Agent launcher must not overlap the concentration header or first rows (${selector}); launcher=${JSON.stringify(
          launcherRect
        )} data=${JSON.stringify(box)}`
      );
    }
  }
}

async function assertRecoupAgentLauncherDoesNotObstructQueryDock(page: Page, launcherRect: RectLike): Promise<void> {
  const dockRect = await page.getByTestId("maya-query-dock").boundingBox();
  assert(dockRect !== null, "Recoup Agent launcher query-dock overlap check requires a dock rect");
  if (!rectsIntersect(launcherRect, dockRect)) {
    return;
  }

  const topTestId = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest("[data-testid]")?.getAttribute("data-testid") ?? "";
  }, centerOfRect(launcherRect));
  assert(
    topTestId !== "recoup-agent-launcher",
    `Recoup Agent launcher must not sit above the right-side query dock when the dock is open; topTestId=${topTestId}`
  );
}

function rectsIntersect(left: RectLike, right: RectLike): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function centerOfRect(rect: RectLike): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

async function assertRecoupAgentLauncherDoesNotReplayAfterCanceledDetailLoad(
  browser: Browser,
  launchItem: ForensicsE2EWorklistItem,
  normalOpenItem: ForensicsE2EWorklistItem
): Promise<void> {
  const context = await newRoleContext(browser, "maya", 1440, 900);
  const page = await context.newPage();
  const routePattern = "**/api/forensics/work-items/**";
  let heldRoute: Route | undefined;
  let resolveHeldRoute: ((route: Route) => void) | undefined;
  const heldRoutePromise = new Promise<Route>((resolve) => {
    resolveHeldRoute = resolve;
  });

  await page.route(routePattern, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const expectedPath = `/api/forensics/work-items/${encodeURIComponent(launchItem.lineId)}`;
    if (request.method() === "GET" && pathname.endsWith(expectedPath) && heldRoute === undefined) {
      heldRoute = route;
      resolveHeldRoute?.(route);
      return;
    }

    await route.continue();
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="recoup-agent-launcher"]', "Recoup Agent launcher");
    await page.getByTestId("recoup-agent-launcher").click();
    const route = await Promise.race([
      heldRoutePromise,
      delay(5_000).then(() => {
        throw new Error("Recoup Agent canceled-load test did not intercept the launcher detail request.");
      })
    ]);
    await expectVisibleLocator(page, '[data-testid="maya-work-item-detail-state"]', "Maya work item detail loading state");
    await expectVisibleLocator(
      page,
      '[data-testid="maya-work-item-detail-loading-skeleton"]',
      "Maya work item detail loading skeleton"
    );
    await page.getByRole("button", { name: /^Worklist$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist section after canceled launcher load");
    await route.fulfill({
      body: JSON.stringify({ error: "Canceled launcher detail load held by E2E." }),
      contentType: "application/json",
      status: 503
    });
    await page.unroute(routePattern);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${normalOpenItem.lineId}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${normalOpenItem.lineId}"]`).click();
    await page.getByTestId("maya-local-row-action-open").click();
    await page.locator('[data-testid="maya-query-dock"]').waitFor({ state: "hidden", timeout: 5_000 });
    assert(
      (await page.locator('[data-testid="maya-query-dock"]').count()) === 0,
      "Recoup Agent launcher signal must not replay after canceled detail loading"
    );
  } finally {
    await page.unroute(routePattern).catch(() => undefined);
    await context.close();
  }
}

async function assertMayaDetailErrorStateIsActionable(browser: Browser, errorTarget: ForensicsE2EWorklistItem): Promise<void> {
  const context = await newRoleContext(browser, "maya", 1440, 900);
  const page = await context.newPage();
  const routePattern = "**/api/forensics/work-items/**";
  const expectedDetailPath = `/api/forensics/work-items/${encodeURIComponent(errorTarget.lineId)}`;
  let failedOnce = false;

  await page.route(routePattern, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname.endsWith(expectedDetailPath) && !failedOnce) {
      failedOnce = true;
      await route.fulfill({
        body: JSON.stringify({
          correlationId: "maya-task-9-detail-error-e2e",
          error: "Detail source unavailable for E2E.",
          missingSource: "sapOData"
        }),
        contentType: "application/json",
        status: 503
      });
      return;
    }

    await route.continue();
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${errorTarget.lineId}"]`).click();
    await page.getByTestId("maya-local-row-action-open").click();
    await expectVisibleLocator(page, '[data-testid="maya-work-item-detail-state"]', "Maya detail error state");
    await expectVisibleText(page, "Source unavailable");
    await expectVisibleText(page, "Retry");
    await expectVisibleText(page, "Return to worklist");

    const details = page.getByTestId("maya-work-item-detail-error-details");
    await expectVisibleLocator(page, '[data-testid="maya-work-item-detail-error-details"]', "Maya detail error details");
    await details.getByRole("button", { name: /details/u }).click();
    const detailsText = await details.innerText();
    assert(detailsText.includes("maya-task-9-detail-error-e2e"), "Maya detail error details must expose correlation ID");
    assert(detailsText.includes("sapOData"), "Maya detail error details must expose missing source");
    assert(detailsText.includes("503"), "Maya detail error details must expose response status");

    const retryResponse = page.waitForResponse(
      (response) => response.request().method() === "GET" && response.url().includes(expectedDetailPath),
      { timeout: 20_000 }
    );
    await page.getByRole("button", { name: /^Retry$/u }).click();
    const response = await retryResponse;
    assert(response.ok(), `Maya detail retry must restore governed detail after one fail-closed 503: ${response.status().toString()}`);
    await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 20_000 });
  } finally {
    await page.unroute(routePattern).catch(() => undefined);
    await context.close();
  }
}

async function captureMayaBeat4CaseOverviewScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    if (
      method !== "GET" &&
      (url.includes("/approval") || url.includes("/query") || url.includes("/realtime") || url.includes("/sap"))
    ) {
      forbiddenRequests.push(`${method} ${url}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 4 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Draft/u }).click();
    await assertBeat4DraftTabFidelity(page, model, forbiddenRequests);
    await page.getByRole("tab", { name: /Overview/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-case-overview"]', "Maya Beat 4 overview tab restored");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-04-case-overview.png` });
  } finally {
    await context.close();
  }
}

async function captureMayaBeat5EvidenceDossierScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const connectors = await loadConnectorE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat5Request(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 5 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Evidence/u }).click();
    await assertBeat5EvidenceDossierFidelity(page, model, connectors, forbiddenRequests);
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-05-evidence-dossier.png` });
  } finally {
    await context.close();
  }
}

async function captureMayaBeat6QueryStartScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const connectors = await loadConnectorE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];
  const localQuestion = "Why is this deduction recoverable from the selected evidence?";

  page.on("request", (request) => {
    if (isForbiddenBeat6StartRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaOverviewSourceReadiness(page, "Maya Beat 6", { expectInitiallyHidden: true });
    await openMayaWorklistSection(page);
    await expectVisibleText(page, "Deduction Worklist");
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 6 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Evidence/u }).click();
    await assertBeat5EvidenceDossierFidelity(page, model, connectors, forbiddenRequests);
    await page.getByRole("button", { name: /^Query evidence$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 6 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, model, localQuestion, forbiddenRequests);
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-06-query-start.png` });
  } finally {
    await context.close();
  }
}

async function captureMayaBeat7AgentTraceScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const connectors = await loadConnectorE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];
  const localQuestion = "Which selected evidence records support this deduction review?";
  const heldAnswer = "E2E held cited answer from the backend query route.";
  const heldBasis = "E2E deterministic basis from the held backend query response.";
  let releaseForensicsQueryRequest: (() => void) | undefined;
  let backendQueryRequestCount = 0;
  const backendQueryRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/forensics/query", async (route) => {
      backendQueryRequestCount += 1;
      resolve();
      await new Promise<void>((release) => {
        releaseForensicsQueryRequest = release;
      });
      await route.fulfill({
        body: JSON.stringify(buildE2EForensicsQueryResponse(model, heldAnswer, heldBasis)),
        contentType: "application/json",
        status: 200
      }).catch((error: unknown) => {
        if (!String(error).includes("Route is already handled")) {
          throw error;
        }
      });
    });
  });

  page.on("request", (request) => {
    if (isForbiddenBeat7ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 7 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Evidence/u }).click();
    await assertBeat5EvidenceDossierFidelity(page, model, connectors, forbiddenRequests);
    await page.getByRole("button", { name: /^Query evidence$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 7 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, model, localQuestion, forbiddenRequests);
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await Promise.race([
      backendQueryRequestStarted,
      delay(5_000).then(() => {
        throw new Error("Beat 7 backend forensics query request did not start.");
      })
    ]);
    await assertBeat7AgentTraceInProgressFidelity(page, model, localQuestion, forbiddenRequests, backendQueryRequestCount);
    await assertBeat7StopQueryResetsParentTrace(page);
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-07-agent-trace.png` });
  } finally {
    releaseForensicsQueryRequest?.();
    await page.unroute("**/api/forensics/query");
    await context.close();
  }
}

async function captureMayaBeat8CitedAnswerScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const connectors = await loadConnectorE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  await installBeat8RealtimeFakes(context);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];
  const localQuestion = "Which selected evidence records support this deduction review?";
  const acceptedAnswer = "E2E accepted cited answer from the backend query route.";
  const acceptedBasis = "E2E deterministic basis from the backend query response.";
  let backendQueryRequestCount = 0;
  let browserRuntimeProbe: unknown;
  const browserErrors: string[] = [];
  const browserWarnings: string[] = [];

  await page.route("**/api/forensics/query", async (route) => {
    backendQueryRequestCount += 1;
    await route.fulfill({
      body: JSON.stringify(buildE2EForensicsQueryResponse(model, acceptedAnswer, acceptedBasis)),
      contentType: "application/json",
      status: 200
    });
  });

  page.on("request", (request) => {
    if (isForbiddenBeat8ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserWarnings.push(message.text());
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    browserRuntimeProbe = await page.evaluate(() => ({
      mediaGetUserMediaType: typeof navigator.mediaDevices.getUserMedia,
      rtcType: typeof RTCPeerConnection,
      rtcValue: String(RTCPeerConnection).slice(0, 80)
    }));
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 8 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Evidence/u }).click();
    await assertBeat5EvidenceDossierFidelity(page, model, connectors, forbiddenRequests);
    await page.getByRole("button", { name: /^Query evidence$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 8 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, model, localQuestion, forbiddenRequests);
    await page.getByRole("button", { name: /^Run query$/u }).click();
    try {
      await page.locator('[data-testid="maya-cited-answer"]').waitFor({ state: "visible", timeout: 15_000 });
    } catch (error) {
      const beat8State = await page.evaluate(() => {
        const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
        const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
        const alerts = [...document.querySelectorAll<HTMLElement>('[role="alert"]')].map((alert) => alert.innerText);

        return {
          alerts,
          dockText: dock?.innerText ?? "",
          traceText: trace?.innerText ?? ""
        };
      });
      console.error(
        JSON.stringify(
          {
            browserErrors,
            browserRuntimeProbe,
            browserWarnings,
            beat8State,
            backendQueryRequestCount,
            forbiddenRequests,
          },
          null,
          2
        )
      );
      throw error;
    }
    await expectVisibleLocator(page, '[data-testid="maya-cited-answer"]', "Maya Beat 8 cited answer");
    await assertBeat8CitedAnswerFidelity(page, model, {
      acceptedAnswer,
      acceptedBasis,
      backendQueryRequestCount,
      forbiddenRequests,
      localQuestion,
    });
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-08-cited-answer.png` });
  } finally {
    await page.unroute("https://api.openai.com/v1/realtime/calls");
    await page.unroute("**/api/forensics/query");
    await context.close();
  }
}

async function installBeat8RealtimeFakes(context: BrowserContext): Promise<void> {
  await context.addInitScript({
    content: String.raw`
(() => {
  class E2EDataChannel extends EventTarget {
    constructor() {
      super();
      this.sentMessages = [];
      this.sentResponseCreate = false;
    }

    close() {
      this.dispatchEvent(new Event("close"));
    }

    openSoon() {
      window.setTimeout(() => {
        this.dispatchEvent(new Event("open"));
      }, 0);
    }

    send(message) {
      this.sentMessages.push(message);
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch {
        return;
      }
      if (!isE2ERecord(parsed) || parsed.type !== "response.create" || this.sentResponseCreate) {
        return;
      }
      this.sentResponseCreate = true;
      window.setTimeout(() => {
        this.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              item: {
                arguments: JSON.stringify({ question: "e2e accepted cited answer" }),
                call_id: "call-e2e-beat-8",
                name: "query.answer",
                type: "function_call"
              },
              type: "response.output_item.done"
            })
          })
        );
      }, 0);
    }
  }

  class E2EPeerConnection extends EventTarget {
    constructor() {
      super();
      this.dataChannel = new E2EDataChannel();
      this.ontrack = null;
    }

    addTrack() {}

    close() {}

    createDataChannel() {
      return this.dataChannel;
    }

    createOffer() {
      return Promise.resolve({ sdp: "v=0\r\ns=e2e-offer", type: "offer" });
    }

    setLocalDescription() {
      return Promise.resolve();
    }

    setRemoteDescription() {
      this.dataChannel.openSoon();
      return Promise.resolve();
    }
  }

  function isE2ERecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  const mediaDevices = {
    getUserMedia: () =>
      Promise.resolve({
        getTracks: () => [
          {
            stop: () => undefined
          }
        ]
      })
  };

  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices
  });
  Object.defineProperty(window, "RTCPeerConnection", {
    configurable: true,
    value: E2EPeerConnection
  });
})();
`
  });
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

  await assertEvalsFinopsGovernanceRoute(browser);
}

async function assertEvalsFinopsGovernanceRoute(browser: Browser): Promise<void> {
  const model = await loadEvalFinopsE2EModel();
  const cfoContext = await newRoleContext(browser, "cfo", 1440, 900);
  const page = await cfoContext.newPage();

  try {
    await page.goto(`${appUrl}/governance/evals-finops`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="evals-finops-surface"]', "Evals and FinOps governance surface");
    await expectVisibleText(page, "Evals + FinOps");
    await expectVisibleText(page, "Quality gates");
    await expectVisibleText(page, "Agent economics");
    await expectVisibleText(page, "Unit economics");
    await expectVisibleText(page, "Recommendations");

    assert(model.evalGates.length > 0, "Evals FinOps model must expose eval gate rows");
    assert(model.agentMetrics.length > 0, "Evals FinOps model must expose typed agent metrics");
    assert(model.recommendations.length > 0, "Evals FinOps model must expose deterministic recommendations");

    await expectVisibleText(page, firstItem(model.evalGates, "eval gate rows").scoreLabel);
    await expectVisibleText(page, "q1");
    await expectVisibleText(page, "usage-1");
    await expectVisibleText(page, "usage-unpriced");
    await expectVisibleText(page, "20.0%");
    await expectVisibleText(page, "200,000");
    await expectVisibleText(page, "USD 0.2250");
    await expectVisibleText(page, "Pricing blocked");
    await expectVisibleText(page, "pricing-missing-for-observed-model");
    await expectVisibleText(page, "Human approval required");

    const surfaceText = await page.getByTestId("evals-finops-surface").innerText();
    assert(!surfaceText.includes("$0"), "Evals FinOps missing-pricing state must not render $0");
    assert(
      surfaceText.includes("Owner-approved pricing is unavailable for observed model gpt-5-nano."),
      "Evals FinOps page must expose the missing-pricing blocked input for the unpriced observed model"
    );
    await assertNoHorizontalOverflow(page, "Evals FinOps governance desktop");
    await page.screenshot({ fullPage: true, path: `${outputDir}/governance-evals-finops-1440.png` });
  } finally {
    await cfoContext.close();
  }
}

async function assertMayaShadcnReviewRoute(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const kpi = firstItem(model.kpiStrip, "forensics KPI strip");
  const mayaContext = await newRoleContext(browser, "maya", 1440, 900);
  const page = await mayaContext.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await expectVisibleText(page, "Maya");
    await expectVisibleLocator(page, '[data-testid="maya-overview-kpi-band"]', "Maya Overview KPI band");
    await expectVisibleLocator(page, '[data-testid="maya-overview-concentration-band"]', "Maya Overview concentration band");
    await expectVisibleLocator(page, '[data-testid="maya-overview-system-band"]', "Maya Overview system band");
    await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-table"]', "Maya Overview concentration table");
    await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-filter"]', "Maya Overview concentration filter");
    await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-customer"]', "Maya Overview concentration customer sort");
    await expectVisibleLocator(page, '[data-testid="maya-kpi-trend-unavailable"]', "Maya KPI trend unavailable fallback");
    await expectVisibleText(page, "Case Concentration Analysis");
    await expectVisibleText(page, kpi.label);

    await page.getByRole("button", { name: /^Evidence$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-root-section-evidence"]', "Maya Evidence root section");
    await expectVisibleText(page, model.selected.lineId);
    await expectVisibleText(page, "Evidence attached");
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
      if (target.name === "landing") {
        await expectVisibleLocator(page, '[data-testid="recoup-landing-page"]', "Recoup landing screenshot page");
      }
      if (target.name === "maya-shadcn-forensics") {
        await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn screenshot workbench");
        await openMayaOverviewSourceReadiness(page, "Maya shadcn screenshot");
        await expectVisibleLocator(page, '[data-testid="maya-source-readiness-strip"]', "Maya shadcn screenshot source readiness");
      }
      await page.screenshot({
        fullPage: true,
        path: `${outputDir}/${target.name}-${breakpoint.label}.png`
      });
      await context.close();
    }
  }
}

async function captureMayaBeat9DraftReviewScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat9ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 9 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Draft/u }).click();
    await assertBeat9DraftReviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await assertLocatorInsideViewport(page, '[data-testid="maya-draft-command-bar"]', "Maya Beat 9 command bar");
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-09-draft-review.png` });

    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya draft command approval dialog");
    assert(forbiddenRequests.length === 0, `Beat 9 commands must not call forbidden routes: ${forbiddenRequests.join(", ")}`);
  } finally {
    await context.close();
  }
}

async function captureMayaBeat10HumanApprovalScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat10ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 10 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Draft/u }).click();
    await assertBeat9DraftReviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, model, forbiddenRequests);
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-10-human-approval.png` });

    await page.getByRole("button", { name: /^Close human approval dialog$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 10 close icon");

    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, model, forbiddenRequests);
    await page.getByRole("button", { name: /^Cancel$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 10 cancel");
  } finally {
    await context.close();
  }
}

async function captureMayaBeat11AuditConfirmationScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const detailModel = await loadForensicsWorkItemDetailE2EModel(backendSelectedRow.lineId);
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat11ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 11 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Draft/u }).click();
    await assertBeat9DraftReviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, model, forbiddenRequests);
    await page.getByRole("button", { name: /^Cancel$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 11 pre-audit approval cancel");

    await page.getByRole("tab", { name: /^Audit$/u }).click();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-11-audit-confirmation.png` });
    await assertBeat11AuditConfirmationFidelity(page, model, detailModel, forbiddenRequests);
  } finally {
    await context.close();
  }
}

async function captureMayaBeat12ReturnWorklistScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const detailModel = await loadForensicsWorkItemDetailE2EModel(backendSelectedRow.lineId);
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat12ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 12 pre-open selected row");
    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Draft/u }).click();
    await assertBeat9DraftReviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, model, forbiddenRequests);
    await page.getByRole("button", { name: /^Cancel$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 12 pre-audit approval cancel");

    await page.getByRole("tab", { name: /^Audit$/u }).click();
    await assertBeat11AuditConfirmationFidelity(page, model, detailModel, forbiddenRequests);
    await page
      .getByTestId("maya-audit-confirmation")
      .getByRole("button", { name: /^Return to worklist$/u })
      .click();
    await assertBeat12ReturnWorklistFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-12-return-worklist.png` });
  } finally {
    await context.close();
  }
}

async function captureMayaShadcnStoryboardScreenshots(browser: Browser): Promise<void> {
  await captureMayaLoginBeatScreenshot(browser);

  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1440, 900);
  const page = await context.newPage();

  await page.route("**/api/forensics/query", async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        buildE2EForensicsQueryResponse(
          model,
          "E2E storyboard cited answer from the backend query route.",
          "E2E deterministic basis from the storyboard backend query response."
        )
      ),
      contentType: "application/json",
      status: 200
    });
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-02-dashboard.png` });

    await page.getByRole("button", { name: /^Worklist$/u }).click();
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-03-recommended-action.png` });

    await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya storyboard case detail open");
    await page.getByTestId("maya-case-workspace").scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-04-case-overview.png` });

    await page.getByRole("tab", { name: /Evidence/u }).click();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-05-evidence-dossier.png` });

    await page.getByRole("button", { name: /Query evidence/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-06-query-start.png` });
    await page.getByTestId("maya-query-input").fill("What evidence supports the selected draft?");
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await page.getByTestId("maya-cited-answer").scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-08-cited-answer.png` });
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');

    await page.getByRole("tab", { name: /Trace/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya agent trace");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-07-agent-trace.png` });

    await page.getByRole("tab", { name: /Draft/u }).click();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-09-draft-review.png` });

    await page.getByRole("button", { name: /Open approval/u }).click();
    await expectVisibleLocator(page, '[role="alertdialog"]', "Maya approval dialog");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-10-human-approval.png` });
    await closeVisibleOverlay(page, '[role="alertdialog"]');

    await page.getByRole("tab", { name: /^Audit$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya audit confirmation");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-11-audit-confirmation.png` });

    await page.getByTestId("maya-case-return-to-worklist").click();
    await page.getByRole("button", { name: /^Worklist$/u }).click();
    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-12-return-worklist.png` });
  } finally {
    await page.unroute("**/api/forensics/query");
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
    await expectVisibleLocator(loginPage, '[data-testid="maya-login-card"]', "Maya Beat 1 login card");
    await expectVisibleLocator(loginPage, '[data-testid="maya-login-workspace-chip"]', "Maya Beat 1 workspace chip");
    assert(
      (await loginPage.locator('[data-testid="maya-login-context-panel"]').count()) === 0,
      "Maya Beat 1 login must not render the adjacent context panel"
    );
    await expectVisibleLocator(loginPage, 'input[name="loginId"]', "Maya login ID input");
    await expectVisibleLocator(loginPage, 'input[name="password"]', "Maya password input");
    await expectVisibleText(loginPage, "Deduction Forensics");
    await expectVisibleText(loginPage, "Open Forensics Workspace");
    await expectVisibleText(loginPage, "Invalid session");
    await expectLoginIdValue(loginPage, "");
    assert(
      (await loginPage.getByRole("radio", { name: /Reviewer|Maya/u }).count()) === 0,
      "Maya Beat 1 login must not expose persona radio controls"
    );

    await expectVisibleText(loginPage, "Password recovery unavailable in demo");
    assert(
      (await loginPage.getByRole("button", { name: /Forgot password/u }).count()) === 0,
      "Maya Beat 1 login must not expose a disabled forgot-password control"
    );

    const loginLayout = await loginPage.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="maya-login-card"]');
      const panel = document.querySelector<HTMLElement>('[data-testid="maya-login-context-panel"]');
      const chip = document.querySelector<HTMLElement>('[data-testid="maya-login-workspace-chip"]');
      const bodyText = document.body.innerText;
      const cardRect = card?.getBoundingClientRect();
      const chipRect = chip?.getBoundingClientRect();
      const leftEdge = cardRect?.left ?? Number.POSITIVE_INFINITY;
      const rightEdge = cardRect?.right ?? 0;

      return {
        bodyText,
        card: cardRect === undefined ? undefined : { height: cardRect.height, left: cardRect.left, right: cardRect.right, width: cardRect.width },
        chip:
          chipRect === undefined
            ? undefined
            : {
                ariaLabel: chip?.getAttribute("aria-label") ?? "",
                height: chipRect.height,
                inputCount: chip?.querySelectorAll('input, [role="searchbox"], [type="search"]').length ?? 0,
                text: chip?.innerText.trim() ?? "",
                width: chipRect.width
              },
        compositionWidth: rightEdge - leftEdge,
        panelCount: panel === null ? 0 : 1,
        sideZoneDelta: Math.abs(leftEdge - (window.innerWidth - rightEdge)),
        viewportWidth: window.innerWidth
      };
    });
    assert(loginLayout.card !== undefined, "Maya Beat 1 login card must have a bounding box");
    assert(loginLayout.panelCount === 0, "Maya Beat 1 context panel must be absent");
    assert(loginLayout.chip !== undefined, "Maya Beat 1 workspace chip must have a bounding box");
    assert(loginLayout.card.width >= 440, `Maya Beat 1 login card must remain substantial at 1440px: ${String(loginLayout.card.width)}px`);
    assert(loginLayout.card.width <= 620, `Maya Beat 1 login card must stay compact without a peer panel: ${String(loginLayout.card.width)}px`);
    assert(loginLayout.compositionWidth <= 620, `Maya Beat 1 login must use a single-card composition: ${String(loginLayout.compositionWidth)}px`);
    assert(loginLayout.sideZoneDelta <= 80, `Maya Beat 1 login card must stay centered: ${String(loginLayout.sideZoneDelta)}px delta`);
    assert(loginLayout.chip.inputCount === 0, "Maya Beat 1 workspace chip must not be an input or search box");
    assert(loginLayout.chip.text.includes("Forensics"), "Maya Beat 1 workspace chip must expose the workspace context");
    for (const forbiddenName of ["Maya Patel", "David Kim", "CFO"]) {
      assert(!loginLayout.bodyText.includes(forbiddenName), `Maya Beat 1 login must not visibly leak persona name ${forbiddenName}`);
    }

    const legacyLoginNodes = await loginPage
      .locator(".state-shell, .login-workstation, .login-rail, .login-source-rack, .login-form, .login-fields")
      .count();
    assert(legacyLoginNodes === 0, "Maya Beat 1 login must not render legacy cockpit login classes");

    await loginPage.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-01-login.png` });
    await loginPage.locator('input[name="loginId"]').fill(demoSessions.maya.loginId);
    await loginPage.getByLabel(/Remember user ID/u).click();
    await loginPage.reload({ waitUntil: "networkidle" });
    await expectLoginIdValue(loginPage, demoSessions.maya.loginId);
    await loginPage.getByLabel(/Remember user ID/u).click();
    await loginPage.locator('input[name="password"]').fill(demoPassword);
    await loginPage.route("**/api/demo-login", async (route) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 400);
      });
      await route.continue();
    });
    const loginRequest = loginPage.waitForRequest((request) => request.url().endsWith("/api/demo-login"));
    await loginPage.getByRole("button", { name: /Open (Forensics )?Workspace/u }).click();
    await expectVisibleText(loginPage, "Opening Forensics Workspace");
    const postData = (await loginRequest).postDataJSON() as { loginId?: string };
    assert(postData.loginId === demoSessions.maya.loginId, "Maya production login must POST the entered Maya loginId");
    await loginPage.waitForURL(`**${demoSessions.maya.defaultRoute}`, { timeout: 20_000 });
    await loginPage.unroute("**/api/demo-login");
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
  await loginPage.goto(`${appUrl}/login`, { waitUntil: "networkidle" });
  await expectVisibleLocator(loginPage, 'input[name="loginId"]', `${profile.displayName} login ID input`);
  await expectVisibleLocator(loginPage, 'input[name="password"]', `${profile.displayName} password input`);
  const loginIdInput = loginPage.locator('input[name="loginId"]');
  const passwordInput = loginPage.locator('input[name="password"]');
  await loginIdInput.fill(profile.loginId);
  await passwordInput.fill(demoPassword);
  assert((await loginIdInput.inputValue()) === profile.loginId, `${profile.displayName} login ID input must be filled`);
  assert((await passwordInput.inputValue()) === demoPassword, `${profile.displayName} password input must be filled`);
  await delay(50);
  const loginRequest = loginPage.waitForRequest((request) => new URL(request.url()).pathname === "/api/demo-login");
  await loginPage.getByRole("button", { name: /Open (Forensics )?Workspace/u }).waitFor({ state: "visible", timeout: 10_000 });
  await loginPage.getByRole("button", { name: /Open (Forensics )?Workspace/u }).click();
  const postData = (await loginRequest).postDataJSON() as { loginId?: string };
  assert(postData.loginId === profile.loginId, `${profile.displayName} login must POST ${profile.loginId}`);
  await loginPage.waitForURL(`**${profile.defaultRoute}`, { timeout: 20_000 });
  await loginPage.close();

  return context;
}

async function loadForensicsE2EModel(): Promise<ForensicsE2EModel> {
  const response = await fetch(`${apiUrl}/forensics`);
  assert(response.ok, `forensics model expected 2xx, received ${String(response.status)}`);

  return (await response.json()) as ForensicsE2EModel;
}

async function loadConnectorE2EModel(): Promise<ConnectorE2EModel> {
  const response = await fetch(`${apiUrl}/connectors`);
  assert(response.ok, `connector model expected 2xx, received ${String(response.status)}`);

  return (await response.json()) as ConnectorE2EModel;
}

async function loadEvalFinopsE2EModel(): Promise<EvalFinopsCockpitModel> {
  const response = await fetch(`${apiUrl}/evals-finops`);
  assert(response.ok, `Evals FinOps model expected 2xx, received ${String(response.status)}`);

  return (await response.json()) as EvalFinopsCockpitModel;
}

async function loadForensicsWorkItemDetailE2EModel(lineId: string): Promise<ForensicsWorkItemDetailE2EModel> {
  const response = await fetch(`${apiUrl}/forensics/work-items/${encodeURIComponent(lineId)}`);
  assert(response.ok, `forensics work-item detail expected 2xx, received ${String(response.status)}`);

  return (await response.json()) as ForensicsWorkItemDetailE2EModel;
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
  const deadline = Date.now() + 15_000;
  let count = 0;

  do {
    count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) {
        return;
      }
    }
    await delay(100);
  } while (Date.now() < deadline);

  assert(count > 0, `${label} was not rendered`);

  throw new Error(`E2E assertion failed: ${label} was not visible`);
}

async function hasVisibleLocator(page: Page, selector: string): Promise<boolean> {
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return true;
    }
  }

  return false;
}

async function expectNoVisibleLocator(page: Page, selector: string, label: string): Promise<void> {
  assert(!(await hasVisibleLocator(page, selector)), `${label} must not be visible`);
}

async function openMayaOverviewSourceReadiness(
  page: Page,
  label: string,
  options: { expectInitiallyHidden?: boolean } = {}
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-overview-source-readiness-toggle"]', `${label} Ready sources toggle`);
  if (options.expectInitiallyHidden === true) {
    await expectNoVisibleLocator(page, '[data-testid="maya-source-readiness-strip"]', `${label} source readiness strip before toggle`);
  }

  if (!(await hasVisibleLocator(page, '[data-testid="maya-source-readiness-strip"]'))) {
    await page.getByTestId("maya-overview-source-readiness-toggle").click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-source-readiness-strip"]', `${label} source readiness strip`);
}

async function openMayaWorklistSection(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist section");
}

async function openSelectedMayaWorkItemDetail(
  page: Page,
  expectedRow: ForensicsE2EModel["worklist"][number],
  label: string
): Promise<PlaywrightRequest> {
  const expectedDetailPath = `/api/forensics/work-items/${encodeURIComponent(expectedRow.lineId)}`;
  const explicitDetailRequest = page.waitForRequest(
    (request) => request.method() === "GET" && request.url().includes(expectedDetailPath),
    { timeout: 5_000 }
  );
  const explicitDetailResponse = page.waitForResponse(
    (response) => response.request().method() === "GET" && response.url().includes(expectedDetailPath),
    { timeout: 20_000 }
  );

  await page.getByTestId("maya-local-row-action-open").click();
  const request = await explicitDetailRequest;
  const response = await explicitDetailResponse;
  assert(response.ok(), `${label} backend detail response must be 2xx for ${expectedRow.lineId}: ${response.status().toString()}`);
  await expectMayaCaseDetailFlow(page, expectedRow, label);
  await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 20_000 });

  return request;
}

async function expectMayaCaseDetailFlow(
  page: Page,
  expectedRow: ForensicsE2EModel["worklist"][number],
  label: string
): Promise<void> {
  try {
    await page
      .locator('[data-testid="maya-work-item-detail-state"], [data-testid="maya-case-workspace"]')
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    const diagnostics = await page.evaluate(() => {
      const visibleRows: HTMLElement[] = [];
      for (const row of document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"]')) {
        const rect = row.getBoundingClientRect();
        const style = window.getComputedStyle(row);

        if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
          visibleRows.push(row);
        }
      }
      const selectedDataLineIds: string[] = [];
      for (const row of visibleRows) {
        if (row.getAttribute("aria-selected") === "true") {
          selectedDataLineIds.push(row.dataset.lineId ?? "");
        }
      }
      const rootSections: string[] = [];
      for (const section of document.querySelectorAll<HTMLElement>('[data-testid^="maya-root-section-"]')) {
        if (section.offsetParent !== null) {
          rootSections.push(section.dataset.testid ?? "");
        }
      }
      const caseWorkspaces: Array<{ height: number; text: string; visible: boolean; width: number }> = [];
      for (const workspace of document.querySelectorAll<HTMLElement>('[data-testid="maya-case-workspace"]')) {
        const rect = workspace.getBoundingClientRect();
        caseWorkspaces.push({
          height: rect.height,
          text: workspace.innerText.trim().slice(0, 160),
          visible: workspace.offsetParent !== null,
          width: rect.width
        });
      }
      const detailStates: Array<{ height: number; text: string; visible: boolean; width: number }> = [];
      for (const detailState of document.querySelectorAll<HTMLElement>('[data-testid="maya-work-item-detail-state"]')) {
        const rect = detailState.getBoundingClientRect();
        detailStates.push({
          height: rect.height,
          text: detailState.innerText.trim().slice(0, 160),
          visible: detailState.offsetParent !== null,
          width: rect.width
        });
      }
      const pane = document.querySelector<HTMLElement>('[data-testid="maya-work-item-pane"]');
      const openButton = document.querySelector<HTMLButtonElement>('[data-testid="maya-local-row-action-open"]');

      return {
        caseWorkspaces,
        detailStates,
        openButtonText: openButton?.innerText.trim() ?? "",
        paneText: pane?.innerText.trim().slice(0, 240) ?? "",
        rootSections,
        selectedDataLineIds
      };
    });
    throw new Error(
      `E2E assertion failed: ${label} did not render a governed case/detail state for ${expectedRow.lineId} after row click: ${JSON.stringify(diagnostics)}`
    );
  }

  const result = await page.evaluate((lineId) => {
    const visibleRows: HTMLElement[] = [];
    for (const row of document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"]')) {
      const rect = row.getBoundingClientRect();
      const style = window.getComputedStyle(row);

      if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
        visibleRows.push(row);
      }
    }
    const selectedDataLineIds: string[] = [];
    for (const row of visibleRows) {
      if (row.getAttribute("aria-selected") === "true") {
        selectedDataLineIds.push(row.dataset.lineId ?? "");
      }
    }
    let detailStateVisible = false;
    for (const detailState of document.querySelectorAll<HTMLElement>('[data-testid="maya-work-item-detail-state"]')) {
      const rect = detailState.getBoundingClientRect();
      const style = window.getComputedStyle(detailState);

      if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
        detailStateVisible = true;
      }
    }
    let workspaceVisible = false;
    for (const workspace of document.querySelectorAll<HTMLElement>('[data-testid="maya-case-workspace"]')) {
      const rect = workspace.getBoundingClientRect();
      const style = window.getComputedStyle(workspace);

      if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
        workspaceVisible = true;
      }
    }

    return {
      detailStateVisible,
      expectedLineId: lineId,
      selectedDataLineIds,
      workspaceVisible
    };
  }, expectedRow.lineId);

  assert(
    result.detailStateVisible || result.workspaceVisible,
    `${label} must expose either fail-closed detail state or backend case workspace for ${expectedRow.lineId}`
  );
  assert(
    result.selectedDataLineIds.includes(expectedRow.lineId),
    `${label} must mark ${expectedRow.lineId} selected in the visible case/worklist rail`
  );
}

async function assertLocatorInsideViewport(page: Page, selector: string, label: string): Promise<void> {
  const result = await page.evaluate((targetSelector) => {
    const element = document.querySelector<HTMLElement>(targetSelector);
    const rect = element?.getBoundingClientRect();

    return {
      bottom: rect?.bottom ?? 0,
      exists: element !== null,
      height: rect?.height ?? 0,
      left: rect?.left ?? 0,
      right: rect?.right ?? 0,
      top: rect?.top ?? 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect?.width ?? 0
    };
  }, selector);
  const epsilon = 1;

  assert(result.exists, `${label} was not rendered`);
  assert(result.width > 0 && result.height > 0, `${label} did not have visible dimensions`);
  assert(
    result.top >= -epsilon &&
      result.left >= -epsilon &&
      result.bottom <= result.viewportHeight + epsilon &&
      result.right <= result.viewportWidth + epsilon,
    `${label} must be fully inside the first viewport before screenshot capture; rect=${JSON.stringify(result)}`
  );
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

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const tableContainers = [...document.querySelectorAll('[data-slot="table-container"]')].map((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));

    return {
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      tableContainers
    };
  });

  assert(
    overflow.documentScrollWidth <= overflow.documentClientWidth + 1,
    `${label} document must not horizontally overflow: ${String(overflow.documentScrollWidth)} > ${String(
      overflow.documentClientWidth
    )}`
  );
  assert(
    overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1,
    `${label} body must not horizontally overflow: ${String(overflow.bodyScrollWidth)} > ${String(overflow.bodyClientWidth)}`
  );

  for (const [index, tableContainer] of overflow.tableContainers.entries()) {
    assert(
      tableContainer.scrollWidth <= tableContainer.clientWidth + 1,
      `${label} table container ${String(index)} must not horizontally overflow: ${String(tableContainer.scrollWidth)} > ${String(
        tableContainer.clientWidth
      )}`
    );
  }
}

async function assertNoClippedBeat2Chips(page: Page, label: string): Promise<void> {
  const clippedChips = await page.evaluate(() => {
    const selectors = [
      '[data-testid="maya-recommended-action-badge"]',
      '[data-testid="maya-verdict-badge"]'
    ];

    return selectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({
          clientHeight: element.clientHeight,
          clientWidth: element.clientWidth,
          label: element.innerText.trim(),
          scrollHeight: element.scrollHeight,
          scrollWidth: element.scrollWidth,
          selector
        }))
        .filter(
          (chip) => chip.scrollWidth > chip.clientWidth + 1 || chip.scrollHeight > chip.clientHeight + 1
        )
    );
  });

  assert(
    clippedChips.length === 0,
    `${label} must not clip worklist action/status chips: ${JSON.stringify(clippedChips)}`
  );
}

async function assertBeat2HeaderFidelity(page: Page, connectors: ConnectorE2EModel, label: string): Promise<void> {
  const header = await page.evaluate(() => {
    const runDateGap = document.querySelector<HTMLElement>('[data-testid="maya-run-date-contract-gap"]');
    const refreshMetadata = document.querySelector<HTMLElement>('[data-testid="maya-refresh-metadata"]');
    const sourceReadiness = document.querySelector<HTMLElement>('[data-testid="maya-source-readiness-strip"]');

    return {
      refreshContractGapExists: document.querySelector('[data-testid="maya-refresh-contract-gap"]') !== null,
      refreshButtonCount: [...document.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
        button.innerText.trim() === "Refresh"
      ).length,
      refreshMetadataText: refreshMetadata?.innerText.trim() ?? "",
      runDateLabel: runDateGap?.getAttribute("aria-label") ?? "",
      sourceReadinessLabel: sourceReadiness?.getAttribute("aria-label") ?? ""
    };
  });

  assert(Number.isFinite(Date.parse(connectors.checkedAtIso)), `${label} connector checkedAtIso must be parseable`);
  assert(
    connectors.lastRefreshedLabel.includes(connectors.checkedAtIso),
    `${label} backend refresh label must carry the connector checkedAtIso`
  );
  assert(
    /source health rows checked at/u.test(connectors.lastRefreshedLabel),
    `${label} backend refresh label must describe source-health recency`
  );
  assert(header.runDateLabel.includes("Run date not exposed"), `${label} header must not invent a calendar date`);
  const renderedRefreshMetadata = /^(\d+) source health rows checked at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/u.exec(
    header.refreshMetadataText
  );
  assert(renderedRefreshMetadata !== null, `${label} header must show the strict backend source refresh metadata label`);
  assert(
    renderedRefreshMetadata[1] === String(connectors.sourceHealth.length),
    `${label} header source-health row count must match the backend connector model`
  );
  assert(
    Number.isFinite(Date.parse(renderedRefreshMetadata[2] ?? "")),
    `${label} header source refresh timestamp must be parseable`
  );
  assert(
    header.sourceReadinessLabel.includes(header.refreshMetadataText),
    `${label} header source refresh metadata must match the same page-rendered source readiness model`
  );
  assert(!header.refreshContractGapExists, `${label} header must hide unavailable refresh controls`);
  assert(header.refreshButtonCount === 0, `${label} header must not render a fake refresh button`);
}

async function assertBeat2WorklistFit(page: Page, label: string): Promise<void> {
  const fit = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>('table');
    const worklistTable = document.querySelector<HTMLElement>('[data-testid="maya-worklist-table"]');
    const workItemHeader = [...document.querySelectorAll<HTMLElement>("th")].find(
      (header) => header.innerText.trim() === "Work item"
    );
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"]')].filter(
      (row) => row.offsetParent !== null
    );
    const chips = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="maya-recommended-action-badge"], [data-testid="maya-verdict-badge"]'
      )
    ].filter((chip) => chip.offsetParent !== null);
    const routingLabels = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-routing-label"]')].filter(
      (label) => label.offsetParent !== null
    );
    const contractGap = document.querySelector<HTMLElement>('[data-testid="maya-worklist-contract-gap"]');
    const titleBackedCells =
      worklistTable === null
        ? []
        : [...worklistTable.querySelectorAll<HTMLElement>("[title]")].filter((element) => element.offsetParent !== null);
    const currentQueueMentions = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(
        (element) =>
          element.offsetParent !== null &&
          typeof element.innerText === "string" &&
          element.innerText.trim() === "Current queue"
      )
      .map((element) => element.getBoundingClientRect());

    const headerRange = document.createRange();
    if (workItemHeader !== undefined) {
      headerRange.selectNodeContents(workItemHeader);
    }

    return {
      chipMetrics: chips.map((chip) => ({
        height: chip.getBoundingClientRect().height,
        label: chip.innerText.trim(),
        lineHeight: Number.parseFloat(window.getComputedStyle(chip).lineHeight)
      })),
      clippedTitleBackedCells: titleBackedCells
        .map((element) => ({
          clientWidth: element.clientWidth,
          label: element.innerText.trim(),
          scrollWidth: element.scrollWidth,
          title: element.getAttribute("title") ?? ""
        }))
        .filter((cell) => cell.scrollWidth > cell.clientWidth + 1),
      currentQueueVisibleCount: currentQueueMentions.length,
      hasContractGapAffordance: contractGap?.innerText.includes("Source details") ?? false,
      maxRowHeight: Math.max(...rows.map((row) => row.getBoundingClientRect().height)),
      routingLabelMetrics: routingLabels.map((routingLabel) => ({
        height: routingLabel.getBoundingClientRect().height,
        label: routingLabel.innerText.trim(),
        lineHeight: Number.parseFloat(window.getComputedStyle(routingLabel).lineHeight),
        scrollHeight: routingLabel.scrollHeight
      })),
      rowCount: rows.length,
      tableWidth: table?.getBoundingClientRect().width ?? 0,
      workItemHeaderLineCount:
        workItemHeader === undefined
          ? 0
          : [...headerRange.getClientRects()].filter((rect) => rect.width > 1 && rect.height > 1).length
    };
  });

  assert(fit.tableWidth > 0, `${label} worklist table must render with a measurable width`);
  assert(fit.rowCount > 0, `${label} worklist rows must render from source data`);
  assert(fit.hasContractGapAffordance, `${label} worklist must expose source field details`);
  assert(
    fit.workItemHeaderLineCount === 1,
    `${label} Work item header must stay single-line: ${String(fit.workItemHeaderLineCount)} rendered lines`
  );
  assert(fit.maxRowHeight <= 96, `${label} worklist rows must stay compact: ${String(fit.maxRowHeight)}px`);
  assert(
    fit.clippedTitleBackedCells.length === 0,
    `${label} worklist title-backed text must not be visibly clipped: ${JSON.stringify(fit.clippedTitleBackedCells)}`
  );
  assert(
    fit.currentQueueVisibleCount === 1,
    `${label} worklist footer rhythm must expose exactly one Current queue label: ${String(
      fit.currentQueueVisibleCount
    )}`
  );

  for (const chip of fit.chipMetrics) {
    if (chip.label.startsWith("Advisory:")) {
      assert(chip.height <= 28, `${label} advisory action chip must stay compact (${chip.label}): ${String(chip.height)}px`);
      continue;
    }
    assert(
      chip.height <= chip.lineHeight + 14,
      `${label} worklist chip must stay single-line (${chip.label}): ${String(chip.height)}px`
    );
  }
  assert(fit.routingLabelMetrics.length > 0, `${label} routing labels must render from source rows`);
  for (const routingLabel of fit.routingLabelMetrics) {
    assert(routingLabel.label.length > 0, `${label} routing labels must expose source text`);
    assert(
      routingLabel.height <= routingLabel.lineHeight * 2 + 4 && routingLabel.scrollHeight <= routingLabel.height + 1,
      `${label} routing label must stay compact and unclipped (${routingLabel.label}): ${String(routingLabel.height)}px`
    );
  }
}

async function assertBeat2RowStartsUnselected(
  page: Page,
  expectedRow: ForensicsE2EModel["worklist"][number],
  label: string
): Promise<void> {
  const result = await page.evaluate((lineId) => {
    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"]')].find(
      (candidate) => candidate.dataset.lineId === lineId && candidate.offsetParent !== null
    );

    return {
      ariaSelected: row?.getAttribute("aria-selected") ?? "",
      rendered: row !== undefined,
      text: row?.innerText.trim() ?? ""
    };
  }, expectedRow.lineId);

  assert(result.rendered, `${label} must render known backend row ${expectedRow.lineId}`);
  assert(result.ariaSelected !== "true", `${label} target row ${expectedRow.lineId} must start non-selected`);
  assert(result.text.includes(expectedRow.customerLabel), `${label} target row must show backend customer ${expectedRow.customerLabel}`);
  assert(result.text.includes(expectedRow.scenarioLabel), `${label} target row must show backend scenario ${expectedRow.scenarioLabel}`);
}

async function assertBeat2OverviewIsNotBlank(
  page: Page,
  model: ForensicsE2EModel,
  label: string
): Promise<void> {
  const expectedFilterTarget = firstItem(model.worklist, "Overview concentration rows").lineId;

  const overview = await page.evaluate(() => {
    const commandCenter = document.querySelector<HTMLElement>('[data-testid="maya-overview-command-center"]');
    const concentrationTable = document.querySelector<HTMLElement>('[data-testid="maya-overview-case-concentration-table"]');
    const concentrationRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-overview-case-concentration-row"]')].filter(
      (row) => row.offsetParent !== null
    );
    const visibleChildren =
      commandCenter === null
        ? []
        : [...commandCenter.querySelectorAll<HTMLElement>("*")].filter((child) => {
            const rect = child.getBoundingClientRect();

            return child.offsetParent !== null && rect.width > 4 && rect.height > 4;
          });
    const commandCenterRect = commandCenter?.getBoundingClientRect();

    return {
      commandCenterHeight: commandCenterRect?.height ?? 0,
      commandCenterTextLength: commandCenter?.innerText.trim().length ?? 0,
      commandCenterVisibleArea: (commandCenterRect?.width ?? 0) * (commandCenterRect?.height ?? 0),
      concentrationRowCount: concentrationRows.length,
      concentrationTableText: concentrationTable?.innerText ?? "",
      visibleChildCount: visibleChildren.length
    };
  });

  assert(
    overview.commandCenterVisibleArea >= 48_000,
    `${label} Overview command center must occupy useful first-viewport area: ${String(overview.commandCenterVisibleArea)}`
  );
  assert(
    overview.commandCenterHeight >= 140,
    `${label} Overview command center must not collapse into blank space: ${String(overview.commandCenterHeight)}px`
  );
  assert(
    overview.visibleChildCount >= 6,
    `${label} Overview command center must expose enough visible backend-backed children: ${String(overview.visibleChildCount)}`
  );
  assert(
    overview.commandCenterTextLength >= 120,
    `${label} Overview command center must contain useful visible content: ${String(overview.commandCenterTextLength)} chars`
  );
  assert(
    overview.concentrationRowCount === model.worklist.length,
    `${label} Overview concentration table rendered ${String(overview.concentrationRowCount)} rows for ${String(
      model.worklist.length
    )} backend worklist rows`
  );
  assert(
    overview.concentrationTableText.length >= 120,
    `${label} Overview concentration table must contain useful visible backend-backed content`
  );

  await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-customer"]', `${label} customer sort`);
  await page.getByTestId("maya-overview-case-concentration-sort-customer").click();
  const customerSortState = await page.getByTestId("maya-overview-case-concentration-sort-customer").evaluate((button) => {
    return button.closest("th")?.getAttribute("aria-sort") ?? "";
  });
  assert(
    customerSortState === "ascending" || customerSortState === "descending",
    `${label} customer sort must update aria-sort after click: ${customerSortState}`
  );

  const filter = page.getByTestId("maya-overview-case-concentration-filter");
  await filter.fill(expectedFilterTarget);
  await page.waitForFunction((target) => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-overview-case-concentration-row"]')].filter(
      (row) => row.offsetParent !== null
    );

    return rows.length > 0 && rows.every((row) => row.textContent.includes(target));
  }, expectedFilterTarget);
  const filteredRows = await page.getByTestId("maya-overview-case-concentration-row").evaluateAll((rows) =>
    rows
      .filter((row) => row instanceof HTMLElement && row.offsetParent !== null)
      .map((row) => row.textContent)
  );
  assert(
    filteredRows.length > 0 && filteredRows.every((text) => text.includes(expectedFilterTarget)),
    `${label} Overview concentration filter must narrow rows using backend case ID ${expectedFilterTarget}`
  );
  await filter.fill("");
  await page.waitForFunction((expectedCount) => {
    return (
      [...document.querySelectorAll<HTMLElement>('[data-testid="maya-overview-case-concentration-row"]')].filter(
        (row) => row.offsetParent !== null
      ).length === expectedCount
    );
  }, model.worklist.length);
  const restoredRowCount = await page.getByTestId("maya-overview-case-concentration-row").count();
  assert(
    restoredRowCount === model.worklist.length,
    `${label} Overview concentration filter clear must restore backend row count`
  );
}

async function assertBeat2CasesRootFidelity(
  page: Page,
  model: ForensicsE2EModel,
  expectedRow: ForensicsE2EModel["worklist"][number],
  label: string
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-root-section-cases"]', `${label} Cases root section`);
  await expectVisibleLocator(page, '[data-testid="maya-cases-table-scroll"]', `${label} Cases table scroll area`);
  await expectVisibleLocator(page, '[data-testid="maya-cases-selected-starter"]', `${label} Cases selected starter`);
  await page
    .locator('[data-testid="maya-case-row"]')
    .filter({ hasText: expectedRow.scenarioLabel })
    .getByRole("button", { name: /^Select$/u })
    .click();

  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="maya-root-section-cases"]');
    const scroll = document.querySelector<HTMLElement>('[data-testid="maya-cases-table-scroll"]');
    const starter = document.querySelector<HTMLElement>('[data-testid="maya-cases-selected-starter"]');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-case-row"]')].filter(
      (row) => row.offsetParent !== null
    );
    const selectedRows = rows.filter((row) => row.getAttribute("aria-selected") === "true");
    const selectedRow = selectedRows[0];
    const selectedStyle = selectedRow === undefined ? undefined : window.getComputedStyle(selectedRow);
    const visibleCells = [...(root?.querySelectorAll<HTMLElement>("td, th, button, [data-slot='badge']") ?? [])].filter(
      (node) => {
        const rect = node.getBoundingClientRect();

        return node.offsetParent !== null && rect.width > 4 && rect.height > 4;
      }
    );

    return {
      cellCount: visibleCells.length,
      rootText: root?.innerText ?? "",
      rowCount: rows.length,
      scrollHeight: scroll?.getBoundingClientRect().height ?? 0,
      selectedRowCount: selectedRows.length,
      selectedRowText: selectedRow?.innerText ?? "",
      selectedStarterHeight: starter?.getBoundingClientRect().height ?? 0,
      selectedStarterText: starter?.innerText ?? "",
      selectedStyle: {
        boxShadow: selectedStyle?.boxShadow ?? "",
        borderLeftWidth: selectedStyle?.borderLeftWidth ?? ""
      }
    };
  });

  assert(result.rowCount === model.worklist.length, `${label} Cases root must render every backend work item`);
  assert(result.cellCount >= model.worklist.length * 4, `${label} Cases root must use dense table content, not sparse blank space`);
  assert(result.scrollHeight >= 360, `${label} Cases table must reserve useful operational height: ${String(result.scrollHeight)}px`);
  assert(
    result.selectedStarterHeight >= 360,
    `${label} Cases selected starter must fill the side pane instead of leaving a sparse column`
  );
  assert(result.selectedRowCount === 1, `${label} Cases root must expose one selected row after Select`);
  assert(result.selectedRowText.includes(expectedRow.scenarioLabel), `${label} selected Cases row must use backend scenario`);
  assert(result.selectedStarterText.includes(expectedRow.customerLabel), `${label} selected starter must use backend customer`);
  assert(result.selectedStarterText.includes(expectedRow.amount), `${label} selected starter must use backend amount`);
  assert(result.rootText.includes(expectedRow.verdictLabel), `${label} Cases root must show backend verdict labels`);
  assert(
    result.selectedStyle.borderLeftWidth !== "0px" || result.selectedStyle.boxShadow !== "none",
    `${label} Cases selected state must have visible elevation or left-edge treatment`
  );
}

async function assertBeat2EvidenceRootFidelity(page: Page, connectors: ConnectorE2EModel, label: string): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-root-section-evidence"]', `${label} Evidence root section`);
  await expectVisibleLocator(page, '[data-testid="maya-evidence-source-readiness-group"]', `${label} Evidence source readiness`);

  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="maya-root-section-evidence"]');
    const readinessGroup = document.querySelector<HTMLElement>('[data-testid="maya-evidence-source-readiness-group"]');
    const sourceRows = [...(readinessGroup?.querySelectorAll<HTMLElement>("[data-status-tone]") ?? [])].filter(
      (row) => row.offsetParent !== null
    );
    const visibleChildren = [...(root?.querySelectorAll<HTMLElement>("button, [role='alert'], [data-status-tone], dl, div") ?? [])].filter(
      (node) => {
        const rect = node.getBoundingClientRect();

        return node.offsetParent !== null && rect.width > 4 && rect.height > 4;
      }
    );

    return {
      evidenceHeight: root?.getBoundingClientRect().height ?? 0,
      readinessText: readinessGroup?.innerText ?? "",
      sourceRowCount: sourceRows.length,
      text: root?.innerText ?? "",
      visibleChildCount: visibleChildren.length
    };
  });

  assert(result.evidenceHeight >= 320, `${label} Evidence root must occupy useful space: ${String(result.evidenceHeight)}px`);
  assert(result.visibleChildCount >= 12, `${label} Evidence root must render dense selected/source content`);
  assert(
    result.sourceRowCount === connectors.sourceTiles.length,
    `${label} Evidence root must render all backend source readiness rows`
  );
  assert(result.text.includes("Selected evidence"), `${label} Evidence root must keep selected evidence context`);
  assert(result.text.includes("Source readiness"), `${label} Evidence root must keep source readiness context`);
  assert(
    connectors.sourceTiles.every((source) => result.readinessText.includes(source.label)),
    `${label} Evidence root source readiness must use connector read-model labels`
  );
}

async function assertBeat2SidebarFidelity(page: Page, label: string): Promise<void> {
  const sidebar = await page.evaluate(() => {
    const sidebarNode = document.querySelector<HTMLElement>('[data-testid="maya-sidebar"]');
    const brand = document.querySelector<HTMLElement>('[data-testid="maya-sidebar-brand"]');
    const navItems = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-sidebar-nav-item"]')].filter(
      (item) => item.offsetParent !== null
    );
    const badges = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-sidebar-badge"]')].filter(
      (badge) => badge.offsetParent !== null
    );
    const collapseControl = document.querySelector<HTMLElement>('[aria-label="Collapse Maya navigation"]');
    const footer = document.querySelector<HTMLElement>('[data-testid="maya-sidebar-footer"]');
    const disabledControls = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="maya-sidebar"] button:disabled')];
    const sidebarGap = document.querySelector<HTMLElement>('[data-slot="sidebar-gap"]');
    const sidebarGapBackground =
      sidebarGap === null ? "missing" : window.getComputedStyle(sidebarGap).backgroundColor;

    return {
      badgeCount: badges.length,
      brandHeight: brand?.getBoundingClientRect().height ?? 0,
      collapseVisible: collapseControl?.offsetParent !== null,
      disabledControlCount: disabledControls.length,
      documentHeight: document.documentElement.scrollHeight,
      footerBottom: footer?.getBoundingClientRect().bottom ?? 0,
      footerText: footer?.innerText.trim() ?? "",
      navLabels: navItems.map((item) => item.innerText.trim()),
      navCount: navItems.length,
      navMaxHeight: Math.max(...navItems.map((item) => item.getBoundingClientRect().height)),
      sidebarGapBackground,
      sidebarGapHeight: sidebarGap?.getBoundingClientRect().height ?? 0,
      sidebarHeight: sidebarNode?.getBoundingClientRect().height ?? 0
    };
  });

  assert(sidebar.sidebarHeight > 0, `${label} sidebar must render`);
  assert(
    sidebar.sidebarGapHeight >= sidebar.documentHeight - 1,
    `${label} sidebar visual rail must fill the full captured page: ${String(sidebar.sidebarGapHeight)}px < ${String(
      sidebar.documentHeight
    )}px`
  );
  assert(
    sidebar.sidebarGapBackground !== "rgba(0, 0, 0, 0)",
    `${label} sidebar visual rail must not hang over a transparent page gap`
  );
  assert(
    sidebar.footerBottom >= sidebar.documentHeight - 28,
    `${label} sidebar user identity must sit at the bottom of the full rail: ${String(sidebar.footerBottom)}px < ${String(
      sidebar.documentHeight
    )}px`
  );
  assert(sidebar.brandHeight >= 54, `${label} sidebar brand lockup must have stronger presence`);
  assert(sidebar.collapseVisible, `${label} sidebar must expose a working collapse affordance`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Overview")), `${label} sidebar must expose Overview`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Worklist")), `${label} sidebar must expose Worklist`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Cases")), `${label} sidebar must expose Cases`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Evidence")), `${label} sidebar must expose Evidence`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Approvals")), `${label} sidebar must expose Approvals`);
  assert(sidebar.navCount >= 5, `${label} sidebar must keep the actual Maya section map`);
  assert(sidebar.navMaxHeight <= 38, `${label} sidebar nav rhythm must stay dense`);
  assert(sidebar.badgeCount >= 2, `${label} sidebar must render backend-backed count badges`);
  assert(sidebar.disabledControlCount === 0, `${label} sidebar must not expose disabled fake controls`);
  assert(sidebar.footerText.includes("Maya Patel"), `${label} sidebar footer must render session user context`);
  assert(sidebar.footerText.includes("Read-only"), `${label} sidebar footer must render honest access status`);
}

async function assertBeat2RightPaneFidelity(page: Page, label: string): Promise<void> {
  const pane = await page.evaluate(() => {
    const paneNode = document.querySelector<HTMLElement>('[data-testid="maya-work-item-pane"]');
    const rect = paneNode?.getBoundingClientRect();

    return {
      height: rect?.height ?? 0,
      text: paneNode?.innerText.trim() ?? "",
      width: rect?.width ?? 0
    };
  });

  assert(pane.width >= 320, `${label} right work-item pane must be at least 320px wide: ${String(pane.width)}px`);
  assert(pane.width <= 360, `${label} right work-item pane must stay at or below 360px wide: ${String(pane.width)}px`);
  assert(pane.height > 0, `${label} right work-item pane must render`);
  assert(
    pane.text.includes("Select a deduction") || pane.text.includes("Advisory only"),
    `${label} right work-item pane must show either the Beat 2 empty starter or Beat 3 advisory selection`
  );
}

async function assertBeat3RecommendedActionFidelity(
  page: Page,
  expectedRow: ForensicsE2EModel["worklist"][number],
  label: string
): Promise<void> {
  const result = await page.evaluate((lineId) => {
    const selectedRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"][aria-selected="true"]')].filter(
      (row) => row.offsetParent !== null
    );
    const selectedRow = selectedRows[0];
    const actionBadges = selectedRow
      ? [...selectedRow.querySelectorAll<HTMLElement>('[data-testid="maya-recommended-action-badge"]')].filter(
          (badge) => badge.offsetParent !== null
        )
      : [];
    const pane = document.querySelector<HTMLElement>('[data-testid="maya-work-item-pane"]');
    const callout = document.querySelector<HTMLElement>('[data-testid="maya-selected-advisory-callout"]');
    const selectedContract = document.querySelector<HTMLElement>('[data-testid="maya-selected-row-contract-note"]');
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-testid^="maya-local-row-action-"]')].map((button) =>
      button.innerText.trim()
    );

    return {
      actionBadgeCount: actionBadges.length,
      actionBadgeHeight: actionBadges[0]?.getBoundingClientRect().height ?? 0,
      actionBadgeText: actionBadges[0]?.innerText.trim() ?? "",
      buttonLabels: buttons,
      calloutText: callout?.innerText.trim() ?? "",
      contractText: selectedContract?.innerText.trim() ?? "",
      expectedLineId: lineId,
      paneText: pane?.innerText.trim() ?? "",
      selectedDataLineId: selectedRow?.dataset.lineId ?? "",
      selectedRowCount: selectedRows.length
    };
  }, expectedRow.lineId);

  assert(result.expectedLineId === expectedRow.lineId, `${label} assertion must use the expected backend row`);
  assert(result.selectedRowCount === 1, `${label} must expose exactly one selected fetched row`);
  assert(result.selectedDataLineId === expectedRow.lineId, `${label} must select backend row ${expectedRow.lineId}`);
  assert(result.actionBadgeCount === 1, `${label} selected row must expose a visible recommended-action badge`);
  assert(result.actionBadgeHeight >= 28, `${label} recommended-action badge must be visually prominent`);
  assert(result.actionBadgeText.includes(expectedRow.recommendedActionLabel), `${label} must show backend recommendation label`);
  assert(result.actionBadgeText.includes("Advisory"), `${label} row recommendation must be explicitly advisory`);
  assert(result.paneText.includes(expectedRow.customerLabel), `${label} pane must summarize selected row customer`);
  assert(result.paneText.includes(expectedRow.scenarioLabel), `${label} pane must summarize selected row scenario`);
  assert(result.paneText.includes(expectedRow.amount), `${label} pane must show backend amount string`);
  assert(result.paneText.includes(expectedRow.verdictLabel), `${label} pane must show backend verdict label`);
  assert(result.paneText.includes(expectedRow.queueLabel), `${label} pane must show backend queue label`);
  assert(result.paneText.includes(expectedRow.evidenceScoreLabel), `${label} pane must show backend evidence score label`);
  assert(result.calloutText.includes("Advisory only"), `${label} pane action callout must be advisory only`);
  assert(result.calloutText.includes(expectedRow.recommendedActionLabel), `${label} pane callout must use backend recommendation`);
  assert(
    result.contractText.includes("fixed evidence packet corresponds") ||
      result.contractText.includes("Detailed evidence is unavailable until a governed detail packet is requested for this row."),
    `${label} must identify whether the selected row has backend-selected detail availability`
  );
  assert(result.buttonLabels.includes("Open investigation"), `${label} must render local open-investigation affordance`);
  assert(
    !/\b(?:auto recover|auto approve|execute|write back|recovered|cleared by AI|send)\b/iu.test(result.paneText),
    `${label} must not imply autonomous action`
  );
}

async function assertBeat3ReadModelMismatch(
  page: Page,
  expectedRow: ForensicsE2EModel["worklist"][number]
): Promise<void> {
  const result = await page.evaluate((lineId) => {
    const selectedRow = document.querySelector<HTMLElement>('[data-testid="maya-worklist-row"][aria-selected="true"]');
    const pane = document.querySelector<HTMLElement>('[data-testid="maya-work-item-pane"]');
    const selectedContract = document.querySelector<HTMLElement>('[data-testid="maya-selected-row-contract-note"]');

    return {
      contractText: selectedContract?.innerText.trim() ?? "",
      expectedLineId: lineId,
      paneText: pane?.innerText.trim() ?? "",
      selectedDataLineId: selectedRow?.dataset.lineId ?? ""
    };
  }, expectedRow.lineId);

  assert(result.expectedLineId === expectedRow.lineId, "mismatch assertion must use the expected clicked row");
  assert(result.selectedDataLineId === expectedRow.lineId, `local selection must switch to ${expectedRow.lineId}`);
  assert(result.paneText.includes(expectedRow.customerLabel), "mismatch pane must summarize the clicked fetched row");
  assert(
    result.contractText.includes("Detailed evidence is unavailable until a governed detail packet is requested for this row."),
    "mismatch pane must not reuse backend-selected deep evidence for another row"
  );
}

async function assertBeat4CaseOverviewFidelity(
  page: Page,
  model: ForensicsE2EModel,
  expectedRow: ForensicsE2EModel["worklist"][number],
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-case-workspace"]', "Maya Beat 4 case workspace");
  await expectVisibleLocator(page, '[data-testid="maya-case-worklist-rail"]', "Maya Beat 4 worklist rail");
  await expectVisibleLocator(page, '[data-testid="maya-case-overview"]', "Maya Beat 4 overview tab");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");

  const result = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[data-testid="maya-case-workspace"]');
    const rail = document.querySelector<HTMLElement>('[data-testid="maya-case-worklist-rail"]');
    const selectedRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"][aria-selected="true"]')].filter(
      (row) => row.offsetParent !== null
    );
    const amount = document.querySelector<HTMLElement>('[data-testid="maya-case-overview-readonly-amount"]');
    const basis = document.querySelector<HTMLElement>('[data-testid="maya-case-deterministic-basis"]');
    const primaryDraftFacts = document.querySelector<HTMLElement>('[data-testid="maya-case-primary-draft-facts"]');
    const draftReadonlyStatus = document.querySelector<HTMLElement>('[data-testid="maya-case-draft-readonly-status"]');
    const draftControls = [...document.querySelectorAll<HTMLElement>('[data-testid^="maya-case-draft-action-"]')];

    return {
      amountReadOnly: amount?.getAttribute("aria-readonly") ?? "",
      draftControlCount: draftControls.length,
      draftReadonlyStatusText: draftReadonlyStatus?.innerText ?? "",
      primaryDraftFactsText: primaryDraftFacts?.innerText ?? "",
      railWidth: rail?.getBoundingClientRect().width ?? 0,
      selectedDataLineId: selectedRows[0]?.dataset.lineId ?? "",
      selectedRowCount: selectedRows.length,
      text: workspace?.innerText ?? "",
      usesBasis: basis?.innerText ?? ""
    };
  });

  assert(result.selectedRowCount === 1, "Beat 4 rail must expose exactly one selected row");
  assert(result.selectedDataLineId === expectedRow.lineId, `Beat 4 rail must keep ${expectedRow.lineId} selected`);
  assert(result.railWidth > 220 && result.railWidth < 390, `Beat 4 worklist rail must be narrow: ${String(result.railWidth)}px`);
  assert(result.text.includes(expectedRow.scenarioLabel), "Beat 4 workspace must use backend scenario label");
  assert(result.text.includes(expectedRow.customerLabel), "Beat 4 workspace must use backend customer label");
  assert(result.text.includes(expectedRow.amount), "Beat 4 workspace must use backend amount string");
  assert(result.text.includes(expectedRow.verdictLabel), "Beat 4 workspace must use backend verdict label");
  assert(result.text.includes(expectedRow.routingLabel), "Beat 4 workspace must use backend routing label");
  assert(result.text.includes(expectedRow.queueLabel), "Beat 4 workspace must use backend queue label");
  assert(result.text.includes(expectedRow.confidenceLabel), "Beat 4 workspace must use backend confidence label");
  assert(!result.text.includes(recordId), "Beat 4 workspace must keep backend record IDs out of primary overview copy");
  await page.locator('[data-testid="maya-case-basis-source-details"]').getByRole("button", { name: /^Basis source details$/u }).click();
  const basisSourceDetailsText = await page.locator('[data-testid="maya-case-basis-source-details"]').innerText();
  assert(basisSourceDetailsText.includes(recordId), "Beat 4 basis source details must retain backend record IDs");
  assert(result.primaryDraftFactsText.includes("Draft action"), "Beat 4 primary draft facts must keep the backend action label");
  assert(
    !result.primaryDraftFactsText.includes(model.selected.draft.actionId),
    "Beat 4 primary draft facts must not expose raw backend action IDs"
  );
  assert(
    !result.text.includes(model.selected.draft.actionId),
    "Beat 4 overview must not expose raw backend action IDs as business copy"
  );
  assert(
    !result.text.includes("Action type") && !result.usesBasis.includes("Action type"),
    "Beat 4 overview must not render raw action-type business labels"
  );
  assert(
    !result.text.includes("External action locked") &&
      !result.text.includes("View draft") &&
      !result.text.includes("Approval locked") &&
      !result.text.includes("More actions"),
    "Beat 4 overview must not expose disabled command/action copy"
  );
  assert(result.amountReadOnly === "true", "Beat 4 amount block must be marked read-only");
  assert(result.draftControlCount === 0, "Beat 4 overview must not render disabled draft command controls");
  assert(result.draftReadonlyStatusText.includes("Read-only"), "Beat 4 draft panel must present a read-only status");
  assert(result.text.includes("Notes unavailable"), "Beat 4 notes must be an honest unavailable state");
  assert(!result.text.includes("Case created"), "Beat 4 must not invent a case-created timeline event");

  if (expectedRow.lineIds.length > 1) {
    const line1Button = page.getByRole("button", { name: /^Line 1$/u });
    const line2Button = page.getByRole("button", { name: /^Line 2$/u });
    assert((await line1Button.getAttribute("aria-pressed")) === "true", "Beat 4 Line 1 button must start selected");
    await line2Button.click();
    assert((await line2Button.getAttribute("aria-pressed")) === "true", "Beat 4 Line 2 button must become selected after click");
    const line2Label = (await page.getByTestId("maya-selected-line-label").innerText()).replace(/\s+/gu, " ").trim();
    assert(
      line2Label.includes(`Line 2 of ${expectedRow.lineIds.length.toString()}`),
      `Beat 4 Line 2 click did not update selected-line label: ${line2Label}`
    );
    await line1Button.click();
    assert((await line1Button.getAttribute("aria-pressed")) === "true", "Beat 4 Line 1 button must restore selected state");
  }

  assert(forbiddenRequests.length === 0, `Beat 4 must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat4DraftTabFidelity(
  page: Page,
  model: ForensicsE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya Beat 4 Draft tab");
  await page.locator('[data-testid="maya-recovery-draft-review"]').getByRole("tab", { name: "Audit basis" }).click();
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");

  const result = await page.evaluate(() => {
    const draft = document.querySelector<HTMLElement>('[data-testid="maya-recovery-draft-review"]');
    const headers = [...(draft?.querySelectorAll<HTMLElement>("th") ?? [])].map((header) => header.innerText.trim());
    const disabledButtons = [...(draft?.querySelectorAll<HTMLButtonElement>("button:disabled") ?? [])].map(
      (button) => button.innerText.trim() || button.getAttribute("aria-label") || ""
    );
    const buttons = [...(draft?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map(
      (button) => button.innerText.trim() || button.getAttribute("aria-label") || ""
    );

    return {
      buttonLabels: buttons,
      disabledButtonLabels: disabledButtons,
      headers,
      text: draft?.innerText ?? ""
    };
  });

  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 4 Draft tab must keep the backend action label");
  assert(result.text.includes(model.selected.draft.statusLabel), "Beat 4 Draft tab must keep the backend status label");
  assert(result.text.includes(model.selected.draft.amount), "Beat 4 Draft tab must keep the backend amount");
  assert(result.text.includes(model.selected.draft.basis), "Beat 4 Draft tab must keep the backend deterministic basis");
  assert(!result.text.includes(recordId), "Beat 4 Draft tab must keep backend record IDs out of primary draft copy");
  await page
    .locator('[data-testid="maya-draft-audit-basis-source-details"]')
    .getByRole("button", { name: /^Audit basis source details$/u })
    .click();
  const draftSourceDetailsText = await page.locator('[data-testid="maya-draft-audit-basis-source-details"]').innerText();
  assert(draftSourceDetailsText.includes(recordId), "Beat 4 Draft tab source details must retain backend record IDs");
  assert(result.headers.includes("Draft label"), "Beat 4 Draft tab inbox must use neutral draft-label copy");
  assert(!result.headers.includes("Action"), "Beat 4 Draft tab inbox must not use command-like Action header copy");
  assert(!result.text.includes("Action ID"), "Beat 4 Draft tab must not expose raw Action ID labels");
  assert(!result.text.includes("Action type"), "Beat 4 Draft tab must not expose raw Action type labels");
  assert(!result.text.includes("draft-rebill"), "Beat 4 Draft tab must not expose raw draft-rebill metadata");
  assert(
    !result.text.includes(model.selected.draft.actionId),
    "Beat 4 Draft tab must not expose raw backend action IDs as business copy"
  );
  assert(
    !/\b(?:approve draft|preview draft|route for approval|send draft|modify)\b/iu.test(result.buttonLabels.join(" ")),
    "Beat 4 Draft tab must not expose raw approval-submit or legacy command copy"
  );
  assert(forbiddenRequests.length === 0, `Beat 4 Draft tab must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat9DraftReviewFidelity(
  page: Page,
  model: ForensicsE2EModel,
  selectedRow: ForensicsE2EModel["worklist"][number],
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya Beat 9 draft review");
  await expectVisibleLocator(page, '[data-testid="maya-draft-hitl-warning"]', "Maya Beat 9 HITL warning");
  await expectVisibleLocator(page, '[data-testid="maya-draft-packet-panel"]', "Maya Beat 9 packet panel");
  await expectVisibleLocator(page, '[data-testid="maya-draft-evidence-table"]', "Maya Beat 9 evidence table");
  await expectVisibleLocator(page, '[data-testid="maya-draft-context-rail"]', "Maya Beat 9 case context rail");
  await expectVisibleLocator(page, '[data-testid="maya-draft-command-bar"]', "Maya Beat 9 command bar");
  await expectVisibleLocator(page, '[data-testid="maya-draft-readonly-amount"]', "Maya Beat 9 read-only amount");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");

  const result = await page.evaluate(() => {
    const draft = document.querySelector<HTMLElement>('[data-testid="maya-recovery-draft-review"]');
    const amount = document.querySelector<HTMLElement>('[data-testid="maya-draft-readonly-amount"]');
    const evidenceRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-draft-evidence-row"]')];
    const headers = [...(draft?.querySelectorAll<HTMLElement>("th") ?? [])].map((header) => header.innerText.trim());
    const buttons = [...(draft?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => ({
      disabled: button.disabled,
      label: button.innerText.trim() || button.getAttribute("aria-label") || ""
    }));
    const inputs = draft?.querySelectorAll("input, textarea, select, [contenteditable='true']") ?? [];

    return {
      amountReadonly: amount?.getAttribute("aria-readonly") ?? "",
      buttonLabels: buttons.map((button) => button.label),
      disabledButtonLabels: buttons.filter((button) => button.disabled).map((button) => button.label),
      evidenceRowCount: evidenceRows.length,
      headers,
      inputCount: inputs.length,
      text: draft?.innerText ?? ""
    };
  });

  assert(result.text.includes("Recovery Draft Review"), "Beat 9 must show the draft-review title");
  assert(result.text.includes("Human approval required"), "Beat 9 must show the human-approval gate");
  assert(result.text.includes("Draft only"), "Beat 9 must show a draft-only packet state");
  assert(result.text.includes("No external action before human approval"), "Beat 9 must keep HITL posture visible");
  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 9 must render the backend draft label");
  assert(result.text.includes(model.selected.draft.statusLabel), "Beat 9 must render the backend draft status");
  assert(result.text.includes(model.selected.draft.amount), "Beat 9 must render the backend draft amount");
  assert(result.text.includes(model.selected.draft.basis), "Beat 9 must render the backend draft basis");
  assert(!result.text.includes(recordId), "Beat 9 must keep backend record IDs out of primary draft copy");
  assert(result.text.includes("Draft gate"), "Beat 9 context rail must show the backend draft gate section");
  assert(result.text.includes("Human decisions"), "Beat 9 context rail must show available human decisions");
  assert(result.text.includes("Evidence records"), "Beat 9 context rail must show backend evidence record IDs");
  await page.locator('[data-testid="maya-draft-rail-record-ids"]').getByRole("button", { name: /^Evidence source details$/u }).click();
  const draftRecordDetailsText = await page.locator('[data-testid="maya-draft-rail-record-ids"]').innerText();
  assert(draftRecordDetailsText.includes(recordId), "Beat 9 evidence source details must retain backend record IDs");
  assert(result.text.includes("Source fields pending"), "Beat 9 context rail must call out source-field gaps");
  const sourceGapDisclosure = page.locator('[data-testid="maya-draft-rail-backend-gaps"]').getByRole("button", {
    name: /^Source fields pending$/u
  });
  await sourceGapDisclosure.click();
  const sourceGapDetailText = await page.locator('[data-testid="maya-draft-rail-backend-gaps"]').innerText();
  assert(sourceGapDetailText.includes("Packet display ID not exposed"), "Beat 9 source details must avoid fake packet IDs");
  assert(sourceGapDetailText.includes("Case account and currency not exposed"), "Beat 9 source details must avoid fake account/currency facts");
  assert(sourceGapDetailText.includes("Approval owner and timestamps not exposed"), "Beat 9 source details must avoid fake owner/timestamp facts");
  assert(sourceGapDetailText.includes("Audit hash waits for human decision"), "Beat 9 source details must avoid fake audit hashes");
  assert(result.text.includes(selectedRow.customerLabel), "Beat 9 context rail must use the selected worklist customer label");
  assert(result.text.includes(selectedRow.scenarioLabel), "Beat 9 context rail must use the selected worklist scenario label");
  assert(result.text.includes(evidenceDocument.citationId), "Beat 9 evidence table must show backend citation IDs");
  assert(result.text.includes(evidenceDocument.documentId), "Beat 9 evidence table must show backend document IDs");
  assert(result.text.includes(evidenceDocument.documentType), "Beat 9 evidence table must show backend document types");
  assert(result.text.includes(evidenceDocument.description), "Beat 9 evidence table must show backend descriptions");
  assert(result.text.includes(evidenceDocument.sourceLabel), "Beat 9 evidence table must show backend source labels");
  assert(result.text.includes(evidenceDocument.verifiedLabel), "Beat 9 evidence table must show backend verification labels");
  assert(result.evidenceRowCount === model.selected.evidencePack.documents.length, "Beat 9 must render one row per evidence document");
  assert(result.headers.includes("Evidence item"), "Beat 9 evidence table must be table-led");
  assert(!result.headers.includes("Date"), "Beat 9 evidence table must not invent dates");
  assert(!result.headers.includes("File / Reference"), "Beat 9 evidence table must not invent file references");
  assert(!result.headers.includes("Included"), "Beat 9 evidence table must not invent included flags");
  assert(result.amountReadonly === "true", "Beat 9 amount must be marked read-only");
  assert(result.inputCount === 0, "Beat 9 must not render editable draft fields");
  assert(!result.buttonLabels.includes("Request changes"), "Beat 9 must not expose caption-only Request changes controls");
  assert(!result.buttonLabels.includes("Reject draft"), "Beat 9 must not expose caption-only Reject draft controls");
  assert(result.buttonLabels.includes("Open approval"), "Beat 9 must expose an Open approval affordance");
  assert(result.disabledButtonLabels.length === 0, "Beat 9 available command buttons must be keyboard reachable");
  assert(!result.text.includes("Action ID"), "Beat 9 must not expose raw Action ID as primary copy");
  assert(!result.text.includes("Action type"), "Beat 9 must not expose raw Action type as primary copy");
  assert(!result.text.includes("draft-rebill"), "Beat 9 must not expose raw draft-rebill metadata");
  assert(!result.text.includes(model.selected.draft.actionId), "Beat 9 must not show raw action IDs as packet IDs");
  assert(
    !/\b(?:Sent|Recovered|ERP written|Portal submitted|Human approved|Approved|Posted|Cleared by AI)\b/u.test(result.text),
    "Beat 9 must not render post-approval or external-action state copy"
  );
  assert(forbiddenRequests.length === 0, `Beat 9 must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat10HumanApprovalFidelity(
  page: Page,
  model: ForensicsE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya Beat 10 approval dialog");
  await expectVisibleText(page, "Human approval required");
  if (model.selected.draft.approvalEligibility.available) {
    await expectVisibleText(page, "Ready for human approval");
    await expectVisibleText(page, "Evidence eligibility is available");
  } else {
    await expectVisibleText(page, "Approval unavailable");
    await expectVisibleText(page, "Decision buttons stay disabled");
  }
  await expectVisibleText(page, "Verified human principal unavailable");
  await expectVisibleText(page, model.selected.draft.actionLabel);
  await expectVisibleText(page, model.selected.draft.statusLabel);
  await expectVisibleText(page, model.selected.draft.basis);
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  await expectVisibleText(page, "Cited evidence available");
  const approvalSourceDetails = page.locator('[data-testid="maya-approval-source-details"]');
  await approvalSourceDetails.getByRole("button", { name: /^Approval source details$/u }).click();
  const approvalSourceDetailsText = await approvalSourceDetails.innerText();
  assert(approvalSourceDetailsText.includes(recordId), "Beat 10 approval source details must retain backend record IDs");

  const expectedDecisionLabels = model.selected.approvalActions.map((action) => approvalDecisionButtonLabel(action.decision));
  const result = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[data-testid="maya-approval-gate-dialog"]');
    const buttons = [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => ({
      disabled: button.disabled,
      label: button.innerText.trim() || button.getAttribute("aria-label") || ""
    }));
    const decisionButtons = buttons.filter((button) =>
      ["Approve", "Reject", "Request changes"].includes(button.label.replace(/\s+Reason required/u, "").trim())
    );

    return {
      buttonLabels: buttons.map((button) => button.label),
      decisionButtons,
      noteCounterText:
        dialog?.querySelector<HTMLElement>('[data-testid="maya-approval-note-counter"]')?.innerText.trim() ?? "",
      textareaCount: dialog?.querySelectorAll("textarea").length ?? 0,
      text: dialog?.innerText ?? ""
    };
  });

  for (const expectedLabel of expectedDecisionLabels) {
    assert(
      result.decisionButtons.some((button) => button.label.includes(expectedLabel)),
      `Beat 10 must render backend decision ${expectedLabel}`
    );
  }

  assert(result.decisionButtons.length === expectedDecisionLabels.length, "Beat 10 must not render extra decision buttons");
  if (model.selected.draft.approvalEligibility.available) {
    assert(
      result.decisionButtons.some((button) => button.label.includes("Approve") && !button.disabled),
      "Beat 10 must enable approval when backend eligibility is available"
    );
    assert(
      result.decisionButtons
        .filter((button) => button.label.includes("Reject") || button.label.includes("Request changes"))
        .every((button) => button.disabled),
      "Beat 10 reason-required decisions must stay disabled until a human reason is entered"
    );
  } else {
    assert(
      result.decisionButtons.every((button) => button.disabled),
      "Beat 10 decision buttons must be disabled while approval eligibility is unavailable"
    );
  }
  assert(result.buttonLabels.includes("Cancel"), "Beat 10 must expose footer cancel");
  assert(result.buttonLabels.includes("Close human approval dialog"), "Beat 10 must expose icon-only close");
  assert(result.text.includes("Reason required"), "Beat 10 must keep reason-required state visible");
  assert(result.text.includes("Opening this dialog does not dispatch anything"), "Beat 10 must state open is non-dispatching");
  assert(result.text.includes("No action will be taken until you choose an option"), "Beat 10 must state decision boundary copy");
  assert(result.text.includes("Your decision, note, and timestamp will be recorded with the draft"), "Beat 10 must show audit posture");
  assert(result.noteCounterText === "0 / 500", "Beat 10 note field must show a 500-character counter");
  assert(result.textareaCount === 1, "Beat 10 must render exactly one note/reason textarea");
  assert(!/\b(?:3 of 3|Reviewed|Maya Patel|auditEntryHash|APPROVAL-HASH|dispatch success|sent to customer)\b/u.test(result.text), "Beat 10 must not invent reviewed, approver, audit, or dispatch state");
  assert(forbiddenRequests.length === 0, `Beat 10 open path must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat11AuditConfirmationFidelity(
  page: Page,
  model: ForensicsE2EModel,
  detailModel: ForensicsWorkItemDetailE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya Beat 11 audit confirmation");
  await expectVisibleText(page, "Audit confirmation");
  await expectVisibleText(page, "Audit confirmation unavailable");
  await expectVisibleText(page, "No committed approval receipt is available yet");
  await expectVisibleText(page, "verified human decision and a complete approval receipt");
  await expectVisibleText(page, "Waiting for committed approval receipt");
  await expectVisibleText(page, "missing receipt fields");
  await expectVisibleText(page, "Selected action citations");
  await expectVisibleLocator(page, '[data-testid="maya-audit-summary-panel"]', "Maya Beat 11 audit summary panel");
  await expectVisibleLocator(page, '[data-testid="maya-audit-receipt-details"]', "Maya Beat 11 audit receipt details control");
  const primaryResult = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="maya-audit-confirmation"]');

    return {
      text: panel?.innerText ?? ""
    };
  });
  assert(
    !/\b(?:status === human_decided|64-hex auditEntryHash|valid receipt hash|Read-model wired|Backend human decision recorded|Backend-owned approval receipt|No backend approval response)\b/u.test(
      primaryResult.text
    ),
    "Beat 11 primary audit copy must remain business-facing before receipt details expand"
  );
  const hiddenReceiptRowsBeforeExpand = await page
    .locator('[data-testid="maya-audit-receipt-details"] tbody tr')
    .count();
  assert(hiddenReceiptRowsBeforeExpand === 0, "Beat 11 receipt rows must not be visible before expanding audit receipt details");
  await page.getByRole("button", { name: /audit receipt details/i }).click();
  const selectedRecordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const result = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="maya-audit-confirmation"]');
    const receiptDetails = panel?.querySelector<HTMLElement>('[data-testid="maya-audit-receipt-details"]');
    const rows = [...(receiptDetails?.querySelectorAll<HTMLElement>("tbody tr") ?? [])].map((row) => row.innerText);
    const buttons = [...(panel?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => ({
      disabled: button.disabled,
      label: button.innerText.trim() || button.getAttribute("aria-label") || ""
    }));

    return {
      buttons,
      copyButtonCount: buttons.filter((button) => /copy/i.test(button.label)).length,
      receiptDetailsText: receiptDetails?.innerText ?? "",
      rowText: rows.join("\n"),
      text: panel?.innerText ?? ""
    };
  });

  for (const requiredRow of [
    "Audit entry hash",
    "Previous hash",
    "Decision/action reference",
    "Decision outcome",
    "Human approver",
    "Committed timestamp",
    "Cited record IDs",
    "Action state"
  ]) {
    assert(result.rowText.includes(requiredRow), `Beat 11 must render receipt/gap row: ${requiredRow}`);
  }

  assert(result.receiptDetailsText.includes("Receipt field"), "Beat 11 receipt table must remain available after expansion");
  assert(result.receiptDetailsText.includes("Backend contract gap"), "Beat 11 receipt details must retain fail-closed source gaps after expansion");
  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 11 must show selected backend action label only as context");
  assert(result.text.includes(detailModel.auditState.statusLabel), "Beat 11 must show selected backend audit status only as context");
  assert(result.text.includes(model.selected.draft.basis), "Beat 11 must show selected backend basis only as context");
  assert(!primaryResult.text.includes(selectedRecordId), "Beat 11 primary audit copy must keep selected record IDs behind details");
  await page
    .locator('[data-testid="maya-audit-selected-action-source-details"]')
    .getByRole("button", { name: /^Selected action source details$/u })
    .click();
  const selectedActionSourceDetailsText = await page
    .locator('[data-testid="maya-audit-selected-action-source-details"]')
    .innerText();
  assert(selectedActionSourceDetailsText.includes(selectedRecordId), "Beat 11 selected action source details must retain record IDs");
  assert(result.text.includes("Committed audit receipt citations unavailable"), "Beat 11 must not relabel selected IDs as receipt IDs");
  assert(!result.buttons.some((button) => button.label === "View audit trail"), "Beat 11 must hide unavailable audit-route controls");
  assert(result.copyButtonCount === 0, "Beat 11 unavailable state must not expose copy controls for absent hashes");
  assert(!result.text.includes(model.selected.draft.actionId), "Beat 11 unavailable state must not render raw action IDs as receipt IDs");
  assert(!/[a-fA-F0-9]{64}/u.test(result.text), "Beat 11 unavailable state must not render a fake 64-hex audit hash");
  assert(
    !/\b(?:Alex Kim|akim@acmecorp\.com|2025-05-20|Case state updated|Recovery sent|ERP updated|Billing routed|Next Case|Approved)\b/u.test(
      result.text
    ),
    "Beat 11 must not render mockup-only people, timestamps, external-action state, next-case state, or approval finality"
  );
  assert(forbiddenRequests.length === 0, `Beat 11 must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat12ReturnWorklistFidelity(
  page: Page,
  model: ForensicsE2EModel,
  expectedRow: ForensicsE2EModel["worklist"][number],
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya Beat 12 workbench");
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-worklist-page"]', "Maya Beat 12 returned worklist page");
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-source-readiness"]', "Maya Beat 12 source readiness");
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-deduction-cases"]', "Maya Beat 12 deduction cases table");
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-return-table"]', "Maya Beat 12 return table");
  await expectVisibleText(page, "Deduction Cases");
  await expectVisibleText(
    page,
    `${model.worklist.length.toString()} work items / ${model.actionInbox.length.toString()} human actions pending`
  );
  await expectVisibleText(page, "Audit status unavailable");
  await expectVisibleText(page, "Local focus");

  const result = await page.evaluate(() => {
    const workbench = document.querySelector<HTMLElement>('[data-testid="maya-shadcn-workbench"]');
    const pageRoot = document.querySelector<HTMLElement>('[data-testid="maya-beat-12-worklist-page"]');
    const table = document.querySelector<HTMLElement>('[data-testid="maya-beat-12-return-table"]');
    const selectedRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"][aria-selected="true"]')].filter(
      (row) => row.offsetParent !== null
    );
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"]')].filter(
      (row) => row.offsetParent !== null
    );

    return {
      auditPanelCount: document.querySelectorAll('[data-testid="maya-audit-confirmation"]').length,
      caseWorkspaceCount: document.querySelectorAll('[data-testid="maya-case-workspace"]').length,
      rowCount: rows.length,
      selectedDataLineId: selectedRows[0]?.dataset.lineId ?? "",
      selectedRowCount: selectedRows.length,
      pageText: pageRoot?.innerText ?? "",
      tableText: table?.innerText ?? "",
      text: workbench?.innerText ?? ""
    };
  });

  assert(result.caseWorkspaceCount === 0, "Beat 12 return must leave the case workspace and render the worklist surface");
  assert(result.auditPanelCount === 0, "Beat 12 returned worklist must not keep the audit panel mounted");
  assert(result.rowCount === model.worklist.length, "Beat 12 must keep all source worklist rows visible without queue mutation");
  assert(result.selectedRowCount === 1, "Beat 12 must keep exactly one local focused row");
  assert(result.selectedDataLineId === expectedRow.lineId, `Beat 12 must keep ${expectedRow.lineId} as local focus`);
  assert(
    result.text.includes(`Showing ${model.worklist.length.toString()} of ${model.worklist.length.toString()} work items`),
    "Beat 12 table must show work-item count only"
  );
  assert(result.pageText.includes(expectedRow.customerLabel), "Beat 12 table must use the returned work-item customer");
  assert(result.pageText.includes(expectedRow.scenarioLabel), "Beat 12 table must use the returned work-item scenario");
  assert(result.pageText.includes(expectedRow.amount), "Beat 12 table must show source amount string");
  assert(result.pageText.includes("All work items"), "Beat 12 must render the target-style work-item tabs");
  assert(result.pageText.includes("Source fields pending"), "Beat 12 must expose missing source fields through a disclosure control");
  assert(result.pageText.includes("Audit status unavailable"), "Beat 12 must avoid fake audit-success toast or status");
  assert(result.pageText.includes("no committed audit receipt"), "Beat 12 must not claim an audit receipt exists");
  assert(result.pageText.includes("Local focus"), "Beat 12 must label returned context as local focus");
  assert(!result.text.includes("Welcome back, Maya"), "Beat 12 return must not fall back to the morning-run dashboard heading");
  assert(!result.text.includes("Recommended Next"), "Beat 12 must not claim mockup-only next-case ranking");
  assert(
    !/\b(?:Audit recorded|audit recorded|Completed|Closed|Case state updated|Queue updated|Audit verified|Approved|Next Case|Next case|Next recommended|Recommended Next|128|2\.74M|14\.6 days|96%)\b/u.test(
      result.text
    ),
    "Beat 12 must not render mockup-only queue, audit, completion, or next-case claims"
  );
  assert(forbiddenRequests.length === 0, `Beat 12 return must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat5EvidenceDossierFidelity(
  page: Page,
  model: ForensicsE2EModel,
  connectors: ConnectorE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 5 evidence dossier");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-business-group"]', "Maya Beat 5 business evidence group");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-source-details"]', "Maya Beat 5 source details");
  await expectVisibleLocator(page, '[data-testid="maya-deterministic-basis-rail"]', "Maya Beat 5 deterministic basis rail");
  await expectVisibleLocator(page, '[data-testid="maya-source-provenance-rail"]', "Maya Beat 5 source provenance rail");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-review-state"]', "Maya Beat 5 review state readout");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const proxyTile = connectors.sourceTiles.find((source) => source.modeLabel === "Proxy - Supabase");
  const closedGroups = await page.locator('[data-testid="maya-evidence-business-group"] button[aria-expanded="false"]').all();
  for (const group of closedGroups) {
    await group.click();
  }
  const sourceDetails = page.locator('[data-testid="maya-evidence-source-details"]');
  await sourceDetails.getByRole("button", { name: /View details/i }).click();

  const result = await page.evaluate(() => {
    const dossier = document.querySelector<HTMLElement>('[data-testid="maya-evidence-dossier"]');
    const groups = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-business-group"]')].map((group) => ({
      text: group.innerText
    }));
    const basisRail = document.querySelector<HTMLElement>('[data-testid="maya-deterministic-basis-rail"]');
    const sourceRail = document.querySelector<HTMLElement>('[data-testid="maya-source-provenance-rail"]');
    const reviewState = document.querySelector<HTMLElement>('[data-testid="maya-evidence-review-state"]');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-document-row"]')];
    const recordBadges = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-record-id"]')].map((badge) =>
      badge.innerText.trim()
    );
    const sourceRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-source-provenance-row"]')].map((row) => ({
      statusTone: row.dataset.statusTone ?? "",
      text: row.innerText
    }));

    return {
      basisText: basisRail?.innerText ?? "",
      dossierText: dossier?.innerText ?? "",
      groupLabels: groups.map((group) => group.text),
      recordBadges,
      reviewText: reviewState?.innerText ?? "",
      rowCount: rows.length,
      sourceRows,
      sourceText: sourceRail?.innerText ?? ""
    };
  });

  assert(result.rowCount === model.selected.evidencePack.documents.length, "Beat 5 must render one row per backend evidence document");
  assert(result.groupLabels.length > 0, "Beat 5 must render grouped business evidence sections");
  assert(
    result.groupLabels.some((label) => /\b(?:Invoice|POD|Contract|Promotion|Customer record)\b/u.test(label)),
    "Beat 5 must lead with business document labels"
  );
  assert(!result.dossierText.includes("Backend evidence packet"), "Beat 5 must not use backend packet copy as primary evidence language");
  assert(result.dossierText.includes("Evidence dossier available"), "Beat 5 must show dossier availability");
  assert(result.reviewText.includes("Review state unavailable"), "Beat 5 must not imply evidence-review completion");
  assert(result.basisText.includes(model.selected.draft.basis), "Beat 5 must show backend deterministic basis text");
  assert(result.basisText.includes(model.selected.draft.statusLabel), "Beat 5 must label draft status as draft/HITL state only");
  assert(result.basisText.includes("Deterministic basis unavailable"), "Beat 5 must mark structured criteria as unavailable");
  assert(result.recordBadges.includes(recordId), "Beat 5 source details must show backend record IDs");
  assert(result.dossierText.includes(evidenceDocument.citationId), "Beat 5 must show backend citation IDs");
  assert(result.dossierText.includes(evidenceDocument.documentId), "Beat 5 must show backend document IDs");
  assert(
    result.dossierText.includes(evidenceBusinessLabelForDocumentType(evidenceDocument.documentType)),
    "Beat 5 must show the business document label derived from backend document type"
  );
  assert(result.dossierText.includes(evidenceDocument.description), "Beat 5 must show backend document descriptions");
  assert(result.dossierText.includes(evidenceDocument.summary), "Beat 5 must show backend document summaries");
  assert(result.dossierText.includes(evidenceDocument.sourceLabel), "Beat 5 must show backend source labels");
  assert(result.dossierText.includes(evidenceDocument.verifiedLabel), "Beat 5 must show backend verification labels");
  assert(result.dossierText.includes(evidenceDocument.relevance), "Beat 5 must show backend relevance labels");
  assert(
    !/\b(?:pod reviewed|review satisfied|evidence review satisfied|all criteria satisfied|3 of 3|source verified by API|auto recover|auto approve|send|execute|write back|recovered|cleared by AI)\b/iu.test(
      result.dossierText
    ),
    "Beat 5 must not render unsupported review completion or external-action copy"
  );
  assert(
    !/\b(?:Delivery and Proof of Delivery|Shipment Details|Inventory and Shortage Claim|Communications|Adjustments and Financials)\b/u.test(
      result.dossierText
    ),
    "Beat 5 must not render mockup-only evidence pod names"
  );

  if (proxyTile !== undefined) {
    const matchingSourceRow = result.sourceRows.find((row) => row.text.includes(proxyTile.label));
    assert(matchingSourceRow !== undefined, `Beat 5 source provenance must include ${proxyTile.label}`);
    assert(
      matchingSourceRow.statusTone === proxyTile.statusTone,
      `Beat 5 must keep ${proxyTile.label} on backend status tone ${proxyTile.statusTone}`
    );
    assert(matchingSourceRow.text.includes("Proxy - Supabase"), `Beat 5 must label ${proxyTile.label} as proxy-backed`);
    assert(!matchingSourceRow.text.includes("Live read"), `Beat 5 must not relabel ${proxyTile.label} as live`);
  }

  assert(forbiddenRequests.length === 0, `Beat 5 must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat6QueryStartFidelity(
  page: Page,
  model: ForensicsE2EModel,
  localQuestion: string,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 6 evidence dossier stays visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 6 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya Beat 6 query input");
  await expectVisibleLocator(page, '[data-testid="maya-query-selected-line"]', "Maya Beat 6 selected line");
  await expectVisibleLocator(page, '[data-testid="maya-query-readiness-preview"]', "Maya Beat 6 readiness preview");
  await expectVisibleLocator(page, '[data-testid="maya-selected-evidence-context"]', "Maya Beat 6 selected evidence context");
  await expectVisibleLocator(page, '[data-testid="maya-query-source-details"]', "Maya Beat 6 source details disclosure");
  const queryButton = page.getByRole("button", { name: /^Run query$/u });
  await queryButton.waitFor({ state: "visible", timeout: 15_000 });
  assert(!(await queryButton.isDisabled()), "Beat 6 query button must be enabled after typing a local question");
  const inputValue = await page.getByTestId("maya-query-input").inputValue();
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const selectedContextText = normalizeRenderedText(await page.getByTestId("maya-selected-evidence-context").innerText());
  for (const selectedRecordId of model.selected.evidencePack.recordIds) {
    if (selectedRecordId !== model.selected.lineId) {
      assert(
        !selectedContextText.includes(normalizeRenderedText(selectedRecordId)),
        `Beat 6 compact selected evidence context leaked raw backend recordId ${selectedRecordId}`
      );
    }
  }
  const sourceDetails = page.getByTestId("maya-query-source-details");
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /^Source details$/u });
  if ((await sourceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await sourceDetailsTrigger.click();
  }

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const overlay = document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]');
    const overlayStyle = overlay === null ? undefined : window.getComputedStyle(overlay);
    const recordBadges = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-query-record-id"]')].map((badge) =>
      badge.innerText.trim()
    );
    const selectedLine = document.querySelector<HTMLElement>('[data-testid="maya-query-selected-line"]')?.innerText ?? "";
    const citedAnswer = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer"]');
    const tracePanel = dock?.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const dockRect = dock?.getBoundingClientRect();
    const dockStyle = dock === null ? undefined : window.getComputedStyle(dock);

    return {
      dockBackgroundColor: dockStyle?.backgroundColor ?? "",
      dockOpacity: dockStyle?.opacity ?? "",
      dockWidth: dockRect?.width ?? 0,
      hasCitedAnswer: citedAnswer !== null,
      hasTracePanel: tracePanel !== null,
      overlayBackdropFilter: overlayStyle?.getPropertyValue("backdrop-filter") ?? "",
      overlayBackgroundColor: overlayStyle?.backgroundColor ?? "",
      overlayClassName: overlay?.className ?? "",
      overlayExists: overlay !== null,
      recordBadges,
      selectedLine,
      text: dock?.innerText ?? ""
    };
  });

  assert(inputValue === localQuestion, "Beat 6 input must preserve the typed local question");
  assert(result.text.includes("Query Evidence"), "Beat 6 dock must show the query sheet title");
  assert(result.text.includes("Selected evidence context"), "Beat 6 dock must describe selected evidence context honestly");
  assert(result.text.includes("Client-selected case context"), "Beat 6 dock must not imply server-enforced record scope");
  assert(result.text.includes("500"), "Beat 6 counter/help must use the current 500-character limit");
  assert(!result.text.includes("2000"), "Beat 6 must not show the mockup-only 2000-character counter");
  assert(result.overlayExists, "Beat 6 must keep the shadcn Sheet overlay mounted for dialog accessibility");
  assert(result.overlayClassName.includes("bg-transparent"), "Beat 6 must opt into a transparent Sheet overlay");
  assert(
    result.overlayClassName.includes("backdrop-blur-none") &&
      result.overlayClassName.includes("supports-backdrop-filter:backdrop-blur-none"),
    "Beat 6 must opt out of Sheet overlay blur on supported desktop browsers"
  );
  assert(
    result.overlayBackgroundColor === "rgba(0, 0, 0, 0)" || result.overlayBackgroundColor === "transparent",
    `Beat 6 overlay must not dim evidence workspace; received ${result.overlayBackgroundColor}`
  );
  assert(
    result.overlayBackdropFilter === "" || result.overlayBackdropFilter === "none",
    `Beat 6 overlay must not blur evidence workspace; received ${result.overlayBackdropFilter}`
  );
  assert(
    result.dockWidth >= 420 && result.dockWidth <= 480,
    `Beat 6 right rail must stay crisp and rail-sized on desktop; received width ${result.dockWidth.toString()}`
  );
  assert(
    result.dockBackgroundColor !== "" &&
      result.dockBackgroundColor !== "rgba(0, 0, 0, 0)" &&
      result.dockBackgroundColor !== "transparent",
    `Beat 6 right rail must have an opaque token background; received ${result.dockBackgroundColor}`
  );
  assert(result.dockOpacity === "1", `Beat 6 right rail must not be captured mid-fade; received opacity ${result.dockOpacity}`);
  assert(result.selectedLine.includes(model.selected.lineId), "Beat 6 must show the selected backend line ID");
  assert(result.recordBadges.includes(recordId), "Beat 6 must show backend record ID badges in Source details");
  assert(!result.hasCitedAnswer, "Beat 6 start state must not render a cited answer card");
  assert(!result.hasTracePanel, "Beat 6 start state must not render the full agent trace panel");
  assert(
    !/\b(?:server-enforced|locked records|locked to|send|recover|approve|post|write back|route to billing|change terms|release hold|freeze)\b/iu.test(
      result.text
    ),
    "Beat 6 dock must not render unsupported scope or external-action copy"
  );
  assert(forbiddenRequests.length === 0, `Beat 6 opening and typing must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat7AgentTraceInProgressFidelity(
  page: Page,
  model: ForensicsE2EModel,
  localQuestion: string,
  forbiddenRequests: string[],
  backendQueryRequestCount: number
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 7 evidence dossier stays visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 7 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-assistant-message"]', "Maya Beat 7 compact checking bubble");
  await expectVisibleLocator(page, '[data-testid="maya-query-trace-details"]', "Maya Beat 7 trace details disclosure");
  const traceDetails = page.getByTestId("maya-query-trace-details");
  const traceDetailsTrigger = traceDetails.getByRole("button", { name: /^Trace details$/u });
  if ((await traceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await traceDetailsTrigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya Beat 7 agent trace details");
  await expectVisibleLocator(page, '[data-testid="maya-trace-running-session"]', "Maya Beat 7 running session row");
  await expectVisibleLocator(page, '[data-testid="maya-trace-running-skeleton"]', "Maya Beat 7 running skeleton");
  await expectVisibleLocator(page, '[data-testid="maya-selected-evidence-context"]', "Maya Beat 7 selected evidence context");
  await expectVisibleLocator(page, '[data-testid="maya-query-source-details"]', "Maya Beat 7 source details disclosure");
  await expectVisibleLocator(page, '[data-testid="maya-submitted-query"]', "Maya Beat 7 submitted query context");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const sourceDetails = page.getByTestId("maya-query-source-details");
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /^Source details$/u });
  if ((await sourceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await sourceDetailsTrigger.click();
  }

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const dossier = document.querySelector<HTMLElement>('[data-testid="maya-evidence-dossier"]');
    const runningSession = document.querySelector<HTMLElement>('[data-testid="maya-trace-running-session"]');
    const skeletons = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-trace-running-skeleton"]')];
    const contextRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-static-context-row"]')];
    const sourceDetails = document.querySelector<HTMLElement>('[data-testid="maya-query-source-details"]');
    const citedAnswer = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer"]');
    const assistant = document.querySelector<HTMLElement>('[data-testid="maya-query-assistant-message"]');
    const selectedContext = document.querySelector<HTMLElement>('[data-testid="maya-selected-evidence-context"]');
    const submittedQuery = document.querySelector<HTMLElement>('[data-testid="maya-submitted-query"]')?.innerText ?? "";
    const viewportHeight = window.innerHeight;

    return {
      contextRowCount: contextRows.length,
      contextText: contextRows.map((row) => row.innerText).join("\n"),
      dockText: dock?.innerText ?? "",
      dossierText: dossier?.innerText ?? "",
      hasCitedAnswer: citedAnswer !== null,
      checkingBubbleText: assistant?.innerText ?? "",
      runningStatus: runningSession?.getAttribute("data-run-status") ?? "",
      runningText: runningSession?.innerText ?? "",
      selectedContextText: selectedContext?.innerText ?? "",
      skeletonCount: skeletons.length,
      sourceRecordBadges: [...(sourceDetails?.querySelectorAll<HTMLElement>('[data-testid="maya-query-record-id"]') ?? [])].map(
        (badge) => badge.innerText.trim()
      ),
      submittedQuery,
      traceText: trace?.innerText ?? "",
      visibleContextRowCount: contextRows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight;
      }).length
    };
  });

  assert(backendQueryRequestCount === 1, "Beat 7 must start exactly one held backend forensics query request");
  assert(result.dossierText.includes(evidenceDocument.citationId), "Beat 7 must keep evidence document context visible");
  assert(result.dossierText.includes(evidenceDocument.summary), "Beat 7 must keep backend evidence summaries visible");
  assert(result.submittedQuery.includes(localQuestion), "Beat 7 must show the local submitted query as query context");
  assert(result.checkingBubbleText.includes("Maya is checking evidence"), "Beat 7 must show compact evidence-checking copy");
  assert(result.runningStatus === "connecting", "Beat 7 running row must be tied to the session connecting state");
  assert(result.sourceRecordBadges.includes(recordId), "Beat 7 source details must keep selected evidence record badges visible");
  assert(result.selectedContextText.includes("Selected evidence packet"), "Beat 7 must promote selected evidence context in the dock");
  assert(result.selectedContextText.includes(model.selected.lineId), "Beat 7 selected evidence context must include the selected line");
  for (const selectedRecordId of model.selected.evidencePack.recordIds) {
    if (selectedRecordId !== model.selected.lineId) {
      assert(
        !normalizeRenderedText(result.selectedContextText).includes(normalizeRenderedText(selectedRecordId)),
        `Beat 7 compact selected evidence context leaked raw backend recordId ${selectedRecordId}`
      );
    }
    assert(result.sourceRecordBadges.includes(selectedRecordId), `Beat 7 source details must include ${selectedRecordId}`);
  }
  assert(result.skeletonCount >= 2, "Beat 7 must show shadcn skeleton loading affordance while the session is running");
  assert(
    result.contextRowCount === model.selected.evidencePack.documents.length || result.contextRowCount > 0,
    "Beat 7 must show selected source context rows"
  );
  assert(result.traceText.includes("Trace rail"), "Beat 7 trace panel must read as an operational trace rail");
  assert(result.contextText.includes("Selected source context"), "Beat 7 context rows must be labeled as selected source context");
  assert(result.traceText.includes("Step receipts will appear as the run completes"), "Beat 7 must mark pending per-step receipts honestly");
  assert(!result.hasCitedAnswer, "Beat 7 in-progress state must not render a cited answer card");
  assert(!result.traceText.includes("Cited Realtime answer received"), "Beat 7 must stop before the answered state");
  assert(
    !/\b(?:Query Agent accepted|Forensics context attached|Delivery proof retriever|Evidence reader|Citation and action guard|Proof of Delivery|POD_2025|312 KB|SHA-256|Custodian)\b/u.test(
      result.traceText
    ),
    "Beat 7 must not render mockup-only trace steps or document viewer facts"
  );
  assert(
    !/\b(?:send|recover|approve|post|write back|route to billing|change terms|release hold|freeze)\b/iu.test(result.dockText),
    "Beat 7 dock must not render external-action copy"
  );
  assert(
    forbiddenRequests.length === 0,
    `Beat 7 must not dispatch external action or OpenAI network routes while held: ${forbiddenRequests.join(", ")}`
  );
}

async function assertBeat7StopQueryResetsParentTrace(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Stop query$/u }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="maya-trace-running-session"]') === null, {
    timeout: 5_000
  });
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await page.getByTestId("maya-case-agent-trace-tab").click();
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya Beat 7 parent trace after Stop query");
  const result = await page.evaluate(() => {
    const runningSessions = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-trace-running-session"]')].filter(
      (node) => node.offsetParent !== null
    );
    const selectedEvidenceSessions = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-trace-selected-evidence-session"]')].filter(
      (node) => node.offsetParent !== null
    );
    const answeredSessions = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-trace-answered-session"]')].filter(
      (node) => node.offsetParent !== null
    );
    const traceText = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-agent-trace"]')]
      .map((trace) => trace.innerText)
      .join("\n");

    return {
      answeredSessionCount: answeredSessions.length,
      runningSessionCount: runningSessions.length,
      selectedEvidenceSessionCount: selectedEvidenceSessions.length,
      traceText
    };
  });

  assert(result.runningSessionCount === 0, "Beat 7 Stop query must not leave parent Agent Trace stuck in connecting");
  assert(
    result.traceText.includes("Query stopped"),
    "Beat 7 Stop query must publish a stopped parent Agent Trace state before the drawer closes"
  );
}

async function assertBeat8CitedAnswerFidelity(
  page: Page,
  model: ForensicsE2EModel,
  {
    acceptedAnswer,
    acceptedBasis,
    backendQueryRequestCount,
    forbiddenRequests,
    localQuestion
  }: {
    acceptedAnswer: string;
    acceptedBasis: string;
    backendQueryRequestCount: number;
    forbiddenRequests: string[];
    localQuestion: string;
  }
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 8 evidence dossier stays visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 8 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya Beat 8 persistent query input");
  await expectVisibleLocator(page, '[data-testid="maya-query-assistant-message"]', "Maya Beat 8 assistant answer bubble");
  await expectVisibleLocator(page, '[data-testid="maya-cited-answer"]', "Maya Beat 8 cited answer");
  await expectVisibleLocator(page, '[data-testid="maya-cited-answer-basis"]', "Maya Beat 8 deterministic basis");
  await expectVisibleLocator(page, '[data-testid="maya-cited-source-details"]', "Maya Beat 8 expandable source details");
  const basisDetails = page.getByTestId("maya-cited-answer-basis");
  const basisDetailsTrigger = basisDetails.getByRole("button", { name: /^Basis$/u });
  if ((await basisDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await basisDetailsTrigger.click();
  }
  await page.getByRole("button", { name: /^Sources$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-cited-record-row"]', "Maya Beat 8 citation rows");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const assistant = document.querySelector<HTMLElement>('[data-testid="maya-query-assistant-message"]');
    const answer = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer"]');
    const basis = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer-basis"]')?.innerText ?? "";
    const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const dossier = document.querySelector<HTMLElement>('[data-testid="maya-evidence-dossier"]');
    const composer = document.querySelector<HTMLElement>('[data-testid="maya-query-input"]');
    const submittedQuery = document.querySelector<HTMLElement>('[data-testid="maya-submitted-query"]')?.innerText ?? "";
    const blockedAlerts = answer?.querySelectorAll<HTMLElement>('[data-testid="maya-cited-answer-blocked"]') ?? [];
    const citationRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-cited-record-row"]')].map((row) => ({
      metadataGap: row.getAttribute("data-metadata-gap") ?? "",
      metadataJoin: row.getAttribute("data-metadata-join") ?? "",
      metadataText: row.querySelector<HTMLElement>('[data-testid="maya-cited-record-metadata"]')?.innerText ?? "",
      recordId: row.getAttribute("data-record-id") ?? "",
      text: row.innerText
    }));
    const buttons = [...(dock?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => button.innerText);
    const dockRect = dock?.getBoundingClientRect();

    return {
      assistantText: assistant?.innerText ?? "",
      basis,
      blockedCount: blockedAlerts.length,
      buttons,
      citationRows,
      dockMode: dock?.dataset.answerMode ?? "",
      dockText: dock?.innerText ?? "",
      dockWidth: dockRect?.width ?? 0,
      dossierText: dossier?.innerText ?? "",
      hasComposer: composer !== null,
      submittedQuery,
      text: answer?.innerText ?? "",
      traceText: trace?.innerText ?? ""
    };
  });

  assert(backendQueryRequestCount === 1, "Beat 8 must request exactly one backend forensics query response");
  assert(result.hasComposer, "Beat 8 must keep the query composer available after a cited answer");
  assert(result.assistantText.includes(acceptedAnswer), "Beat 8 assistant bubble must render the backend/test accepted answer text");
  assert(result.basis.includes(acceptedBasis), "Beat 8 must render the backend/test deterministic basis");
  assert(result.submittedQuery.includes(localQuestion), "Beat 8 must preserve the local submitted query context");
  assert(result.dossierText.includes(evidenceDocument.citationId), "Beat 8 must keep adjacent evidence context visible");
  assert(result.dossierText.includes(evidenceDocument.summary), "Beat 8 must keep backend evidence summaries visible");
  assert(result.dockMode === "review", "Beat 8 answered state must promote the sheet into answer-review mode");
  assert(result.dockWidth >= 760, `Beat 8 answer-review mode must be wider than the query drawer: ${String(result.dockWidth)}px`);
  assert(result.text.includes("Answered"), "Beat 8 must label the accepted answered state");
  assert(
    result.text.includes(`${String(model.selected.evidencePack.documents.length)} loaded documents`),
    "Beat 8 answer card must show a backend-document readout from the loaded evidence packet"
  );
  assert(!result.text.includes("No cited answer returned"), "Beat 8 must not show the blocked/no-answer state");
  assert(result.blockedCount === 0, "Beat 8 accepted answer must not render blocked-state content");
  assert(!result.text.includes("Partial / Blocked"), "Beat 8 must not invent a warning/caution block");
  assert(!result.text.includes("Shortage Deduction Recoverability"), "Beat 8 must not render mockup-only query title");
  assert(!result.text.includes("The shortage deduction is recoverable."), "Beat 8 must not render mockup-only answer prose");
  assert(!result.text.includes("INV-100245"), "Beat 8 must not render mockup-only citation IDs");
  assert(!result.text.includes("POD-77421"), "Beat 8 must not render mockup-only citation IDs");
  assert(!result.text.includes("CLAIM-8821"), "Beat 8 must not render mockup-only citation IDs");
  assert(!result.dockText.includes("Trace rail"), "Beat 8 answered view must not keep the Beat 7 trace rail in the first viewport");
  assert(result.traceText.length === 0, "Beat 8 answered view must focus on answer review instead of agent trace");
  assert(result.citationRows.length === model.selected.evidencePack.recordIds.length, "Beat 8 must render every cited record ID");
  for (const recordId of model.selected.evidencePack.recordIds) {
    assert(result.text.includes(recordId), `Beat 8 cited answer must show ${recordId}`);
  }
  const exactJoinedDocuments = model.selected.evidencePack.documents.filter(
    (document) =>
      model.selected.evidencePack.recordIds.includes(document.documentId) ||
      model.selected.evidencePack.recordIds.includes(document.citationId)
  );
  assert(exactJoinedDocuments.length > 0, "Beat 8 fixture must include at least one exact document metadata join");
  const firstJoinedRowIndex = result.citationRows.findIndex((row) => row.metadataJoin === "exact");
  const firstGapRowIndex = result.citationRows.findIndex((row) => row.metadataGap === "true");
  assert(firstJoinedRowIndex >= 0, "Beat 8 must render at least one exact metadata join row");
  assert(
    firstGapRowIndex === -1 || firstJoinedRowIndex < firstGapRowIndex,
    "Beat 8 must promote exact backend document metadata rows before unavailable metadata rows"
  );
  for (const document of exactJoinedDocuments) {
    const joinedRow = result.citationRows.find((row) => row.recordId === document.documentId || row.recordId === document.citationId);
    assert(joinedRow !== undefined, `Beat 8 must render a citation row for exact document ${document.documentId}`);
    assert(joinedRow.metadataJoin === "exact", `Beat 8 must mark ${document.documentId} as an exact metadata join`);
    assert(joinedRow.metadataGap !== "true", `Beat 8 must not mark ${document.documentId} as unavailable when metadata is exact`);
    assert(joinedRow.metadataText.includes(document.citationId), `Beat 8 joined metadata must show citation ${document.citationId}`);
    assert(joinedRow.metadataText.includes(document.documentId), `Beat 8 joined metadata must show document ${document.documentId}`);
    assert(joinedRow.metadataText.includes(document.documentType), `Beat 8 joined metadata must show type ${document.documentType}`);
    assert(joinedRow.metadataText.includes(document.sourceLabel), `Beat 8 joined metadata must show source ${document.sourceLabel}`);
    assert(joinedRow.metadataText.includes(document.verifiedLabel), `Beat 8 joined metadata must show verification ${document.verifiedLabel}`);
  }
  for (const row of result.citationRows) {
    const hasExactDocument = exactJoinedDocuments.some(
      (document) => row.recordId === document.documentId || row.recordId === document.citationId
    );
    if (hasExactDocument) {
      continue;
    }
    assert(row.metadataGap === "true", "Beat 8 citation rows without exact joins must honestly mark unavailable metadata");
    assert(row.text.includes("Metadata unavailable"), "Beat 8 citation rows without exact joins must expose the metadata gap");
  }
  assert(
    !/\b(?:send|recover|approve|post|write back|route to billing|change terms|release hold|freeze)\b/iu.test(
      [...result.buttons, result.dockText].join("\n")
    ),
    "Beat 8 dock must not render external-action copy"
  );
  assert(
    forbiddenRequests.length === 0,
    `Beat 8 must not dispatch external action routes or OpenAI network calls: ${forbiddenRequests.join(", ")}`
  );
}

function buildE2EForensicsQueryResponse(model: ForensicsE2EModel, answer: string, deterministicBasis: string) {
  const recordIds = model.selected.evidencePack.recordIds;
  const documents = model.selected.evidencePack.documents;
  const orderedCitationRecordIds = [...recordIds].sort((left, right) => {
    const leftHasExactDocument = documents.some((document) => document.documentId === left || document.citationId === left);
    const rightHasExactDocument = documents.some((document) => document.documentId === right || document.citationId === right);

    return Number(rightHasExactDocument) - Number(leftHasExactDocument);
  });

  return {
    answer,
    citations: orderedCitationRecordIds.map((recordId) => {
      const document = documents.find(
        (candidate) =>
          candidate.documentId === recordId ||
          candidate.citationId === recordId
      );

      return {
        deterministicBasis,
        recordId,
        ...(document === undefined
          ? {}
          : {
              documentId: document.documentId,
              source: document.sourceLabel,
              summary: document.summary
            })
      };
    }),
    deterministicBasis,
    modelExecution: {
      agentNames: ["Forensics Investigator", "Evidence Retriever"],
      deterministicBasis: "OpenAI Agents SDK live trace + Recoup deterministic query answer guard",
      handoffCount: 1,
      mode: "live_openai_agents",
      rawModelTextPolicy: "suppressed",
      tokenUsage: 64
    },
    trace: [
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        hook: "agent_start",
        label: "agent start",
        message: "E2E backend query accepted selected evidence context.",
        phase: "query",
        receiptDeterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        recordIds,
        retrievalSource: "agent_trace",
        sourceKind: "agent_trace"
      },
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        hook: "agent_tool_start",
        label: "agent tool start",
        message: "E2E backend query retrieved cited evidence records.",
        phase: "retrieval",
        receiptDeterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        recordIds,
        retrievalSource: "source_backed",
        sourceKind: "supabase",
        toolName: "forensics.queryEvidence"
      },
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        hook: "agent_end",
        label: "agent end",
        message: "E2E backend query returned cited answer with deterministic basis.",
        phase: "decision",
        receiptDeterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        recordIds,
        retrievalSource: "agent_trace",
        sourceKind: "agent_trace"
      }
    ]
  };
}

function isForbiddenBeat5Request(request: PlaywrightRequest): boolean {
  const url = new URL(request.url());
  const pathname = url.pathname.toLowerCase();

  return (
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    pathname.includes("/approval") ||
    pathname.includes("/query") ||
    pathname.includes("/realtime") ||
    pathname.includes("/sap")
  );
}

function isForbiddenBeat6StartRequest(request: PlaywrightRequest): boolean {
  const url = new URL(request.url());
  const pathname = url.pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);

  return (
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    segments.includes("approval") ||
    segments.includes("query") ||
    segments.includes("realtime") ||
    segments.includes("sap")
  );
}

function isForbiddenBeat7ExternalActionRequest(request: PlaywrightRequest): boolean {
  const url = new URL(request.url());
  const pathname = url.pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);
  const isForensicsQuery = pathname === "/api/forensics/query";

  return (
    url.hostname === "api.openai.com" ||
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    segments.includes("approval") ||
    segments.includes("sap") ||
    segments.includes("realtime") ||
    pathname === "/api/query/realtime-tool" ||
    (segments.includes("query") && !isForensicsQuery)
  );
}

function isForbiddenBeat8ExternalActionRequest(request: PlaywrightRequest): boolean {
  const url = new URL(request.url());
  const pathname = url.pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);
  const isForensicsQuery = pathname === "/api/forensics/query";

  return (
    url.hostname === "api.openai.com" ||
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    segments.includes("approval") ||
    segments.includes("sap") ||
    segments.includes("realtime") ||
    pathname === "/api/query/realtime-tool" ||
    (segments.includes("query") && !isForensicsQuery)
  );
}

function isForbiddenBeat9ExternalActionRequest(request: PlaywrightRequest): boolean {
  const url = new URL(request.url());
  const pathname = url.pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);

  return (
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    segments.includes("approval") ||
    segments.includes("query") ||
    segments.includes("realtime") ||
    segments.includes("sap") ||
    segments.includes("erp") ||
    segments.includes("billing") ||
    segments.includes("portal")
  );
}

function isForbiddenBeat10ExternalActionRequest(request: PlaywrightRequest): boolean {
  return isForbiddenBeat9ExternalActionRequest(request);
}

function isForbiddenBeat11ExternalActionRequest(request: PlaywrightRequest): boolean {
  return isForbiddenBeat10ExternalActionRequest(request);
}

function isForbiddenBeat12ExternalActionRequest(request: PlaywrightRequest): boolean {
  return isForbiddenBeat11ExternalActionRequest(request);
}

function approvalDecisionButtonLabel(decision: ForensicsE2EModel["selected"]["approvalActions"][number]["decision"]): string {
  switch (decision) {
    case "approve":
      return "Approve";
    case "modify":
      return "Request changes";
    case "reject":
      return "Reject";
  }
}

async function assertBeat2SourceReadinessFidelity(page: Page, connectors: ConnectorE2EModel, label: string): Promise<void> {
  await openMayaOverviewSourceReadiness(page, label);
  const expectedTones = connectors.sourceTiles.map((sourceTile) => sourceTile.statusTone);
  const expectedHasReady = expectedTones.includes("ready");
  const expectedHasSynthetic = expectedTones.includes("synthetic");
  const expectedHasBlocked = expectedTones.includes("blocked");
  const expectedHasProxy = connectors.sourceTiles.some(
    (sourceTile) => sourceTile.modeLabel === "Proxy - Supabase" || sourceTile.stateLabel === "Proxy - Supabase"
  );
  const sourceStrip = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('[data-testid="maya-source-readiness-strip"]');
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-source-tile"]')].filter(
      (tile) => tile.offsetParent !== null
    );
    const tones = tiles.map((tile) => tile.dataset.statusTone ?? "");
    const statuses = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-source-status"]')].filter(
      (status) => status.offsetParent !== null
    );
    const tileText = tiles.map((tile) => tile.innerText);
    const labels = tiles.flatMap((tile) =>
      [...tile.querySelectorAll<HTMLElement>("[title]")].filter((element) => element.offsetParent !== null)
    );

    return {
      hasBlocked: tones.includes("blocked"),
      hasReady: tones.includes("ready"),
      hasSynthetic: tones.includes("synthetic"),
      labelMetrics: labels.map((sourceLabel) => ({
        clientWidth: sourceLabel.clientWidth,
        label: sourceLabel.innerText.trim(),
        scrollWidth: sourceLabel.scrollWidth,
        title: sourceLabel.getAttribute("title") ?? ""
      })),
      stripHeight: strip?.getBoundingClientRect().height ?? 0,
      statusMetrics: statuses.map((status) => ({
        height: status.getBoundingClientRect().height,
        label: status.innerText.trim(),
        tone: status.closest<HTMLElement>('[data-testid="maya-source-tile"]')?.dataset.statusTone ?? ""
      })),
      tileCount: tiles.length,
      tileMinWidth: Math.min(...tiles.map((tile) => tile.getBoundingClientRect().width)),
      tileText,
      toneClassNames: tiles.map((tile) => ({
        className: tile.className,
        tone: tile.dataset.statusTone ?? ""
      }))
    };
  });

  assert(sourceStrip.stripHeight > 0, `${label} source readiness strip must render`);
  assert(
    sourceStrip.stripHeight <= 76,
    `${label} source readiness strip must stay thin while preserving readable source states: ${String(
      sourceStrip.stripHeight
    )}px`
  );
  assert(
    sourceStrip.tileCount === connectors.sourceTiles.length,
    `${label} source readiness strip must render all backend source tiles`
  );
  assert(
    sourceStrip.tileMinWidth >= 104,
    `${label} source readiness tiles must stay scan-friendly: ${String(sourceStrip.tileMinWidth)}px`
  );
  assert(
    sourceStrip.tileText.some((text) => text.includes("Contract Repo")),
    `${label} source readiness must not hide Contract Repo`
  );
  assert(sourceStrip.tileText.some((text) => text.includes("MCP")), `${label} source readiness must not hide MCP`);
  assert(
    sourceStrip.hasReady === expectedHasReady,
    `${label} source readiness must reflect backend ready state truthfully`
  );
  assert(
    sourceStrip.hasSynthetic === expectedHasSynthetic,
    `${label} source readiness must reflect backend synthetic fallback tone truthfully`
  );
  assert(
    sourceStrip.hasBlocked === expectedHasBlocked,
    `${label} source readiness must reflect backend blocked state truthfully`
  );
  if (expectedHasProxy) {
    assert(
      sourceStrip.tileText.some((text) => text.includes("Proxy - Supabase")),
      `${label} source readiness must label proxy-backed source states as Proxy - Supabase`
    );
    assert(
      sourceStrip.statusMetrics.some((status) => status.label === "Proxy - Supabase"),
      `${label} source readiness status badge must not abbreviate Proxy - Supabase`
    );
  }
  for (const sourceLabel of sourceStrip.labelMetrics) {
    assert(sourceLabel.label.length > 0, `${label} source labels must expose backend text`);
    assert(
      sourceLabel.scrollWidth <= sourceLabel.clientWidth + 1,
      `${label} source label must not visibly clip (${sourceLabel.title}): ${String(sourceLabel.scrollWidth)} > ${String(
        sourceLabel.clientWidth
      )}`
    );
  }

  const readyClass = sourceStrip.toneClassNames.find((tile) => tile.tone === "ready")?.className ?? "";
  const syntheticClass = sourceStrip.toneClassNames.find((tile) => tile.tone === "synthetic")?.className ?? "";
  if (sourceStrip.hasReady && sourceStrip.hasSynthetic) {
    assert(readyClass !== syntheticClass, `${label} ready and synthetic source tiles must have distinct visual classes`);
  }
  if (sourceStrip.hasBlocked) {
    const blockedClass = sourceStrip.toneClassNames.find((tile) => tile.tone === "blocked")?.className ?? "";
    assert(blockedClass !== readyClass, `${label} blocked source tiles must be visually distinct from ready`);
  }

  for (const status of sourceStrip.statusMetrics) {
    assert(status.height <= 24, `${label} source status badge must stay compact (${status.label})`);
    assert(status.label.length > 0, `${label} source status badge must expose accessible text`);
  }
}

async function expectLoginIdValue(page: Page, expectedValue: string): Promise<void> {
  const actualValue = await page.locator('input[name="loginId"]').inputValue();
  assert(actualValue === expectedValue, `loginId expected ${expectedValue}, received ${actualValue}`);
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

async function hasFixtureApiRoot(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (response.status !== 200) {
      return false;
    }

    const body = (await response.json()) as unknown;
    return isRecord(body) && body.dataMode === "fixture";
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
  const cockpitApi = createCockpitApi({
    env: {
      ...e2eEnv,
      RECOUP_COCKPIT_ALLOWED_ORIGINS: appUrl,
      RECOUP_DATA_MODE: "fixture",
      RECOUP_MEMORY_BACKEND: "supabase",
      RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
      SUPABASE_SERVICE_ROLE_KEY: "recoup-e2e-service-role",
      SUPABASE_URL: "https://recoup-e2e.supabase.co"
    },
    memoryFetcher: fixtureSupabaseFetcher
  });
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${String(port)}`);
    if (requestUrl.pathname === "/rest/v1/rpc/verify_recoup_demo_login") {
      handleFixtureDemoLogin(request, response);
      return;
    }
    cockpitApi(request, response);
  });

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

function handleFixtureDemoLogin(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  request.on("end", () => {
    const body = parseFixtureDemoLoginBody(Buffer.concat(chunks).toString("utf8"));
    const session = body === undefined ? undefined : demoSessionForLoginId(body.p_login_id);
    if (body === undefined || body.p_password !== demoPassword || session === undefined) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(null));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        allowed_routes: session.allowedRoutes,
        default_route: session.defaultRoute,
        display_name: session.displayName,
        login_id: session.loginId,
        role: session.role
      })
    );
  });
}

function parseFixtureDemoLoginBody(value: string): { p_login_id: string; p_password: string } | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      isRecord(parsed) &&
      typeof parsed.p_login_id === "string" &&
      typeof parsed.p_password === "string" &&
      parsed.p_login_id.length > 0 &&
      parsed.p_password.length > 0
    ) {
      return { p_login_id: parsed.p_login_id, p_password: parsed.p_password };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function demoSessionForLoginId(loginId: string): DemoProfile | undefined {
  return Object.values(demoSessions).find((session) => session.loginId === loginId);
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

  if (tableName === "recoup_agent_usage_runs") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            agent_name: "Maya Forensics",
            cached_input_tokens: 200_000,
            cache_capability: "deduction_forensics",
            cited_record_ids_json: ["S3-L1", "q1"],
            correlation_id: "e2e-evals-finops-corr-1",
            created_at: "2026-06-30T01:00:00.000Z",
            deterministic_basis: "E2E typed usage receipt from fixture Supabase rows",
            guardrail_trip_count: 2,
            handoff_count: 3,
            input_tokens: 1_000_000,
            latency_ms: 1420,
            model_execution_mode: "live_openai_agents",
            model_id: "gpt-5.5",
            output_tokens: 100_000,
            prompt_cache_key: "recoup:v2:deduction-forensics:v1",
            prompt_prefix_version: "2026-06-30",
            reasoning_tokens: 0,
            record_ids_json: ["usage-1", "S3-L1", "q1"],
            source_receipt_id: "memory-usage-1",
            status: "succeeded",
            tool_call_count: 7,
            total_tokens: 1_100_000,
            uncached_input_tokens: 800_000,
            usage_run_id: "usage-1",
            workflow_name: "maya_forensics_query"
          },
          {
            agent_name: "Release Evaluator",
            cached_input_tokens: 0,
            cache_capability: null,
            cited_record_ids_json: ["q2"],
            correlation_id: "e2e-evals-finops-corr-2",
            created_at: "2026-06-30T01:05:00.000Z",
            deterministic_basis: "E2E release-readiness usage receipt from fixture Supabase rows",
            guardrail_trip_count: 0,
            handoff_count: 0,
            input_tokens: 0,
            latency_ms: 310,
            model_execution_mode: "code_eval_harness",
            model_id: "gpt-5-nano",
            output_tokens: 1_000,
            prompt_cache_key: null,
            prompt_prefix_version: null,
            reasoning_tokens: 0,
            record_ids_json: ["usage-unpriced", "q2"],
            source_receipt_id: null,
            status: "succeeded",
            tool_call_count: 1,
            total_tokens: 1_000,
            uncached_input_tokens: 0,
            usage_run_id: "usage-unpriced",
            workflow_name: "release_readiness"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "recoup_eval_gate_runs") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            branch_name: "codex/evals-finops-governance",
            commit_sha: "e".repeat(40),
            completed_at: "2026-06-30T01:15:00.000Z",
            deterministic_basis: "E2E release-readiness fixture snapshot",
            eval_run_id: "eval-run-8fc2",
            record_ids_json: ["cfg-run-control", "release-label-manifest"],
            release_status: "blocked",
            report_hash: "8".repeat(64),
            report_json: { status: "blocked" },
            source_mode: "live_supabase",
            started_at: "2026-06-30T01:14:00.000Z"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "recoup_eval_gate_results") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            blocker_reason: null,
            deterministic_basis: "run-control gate from e2e fixture",
            eval_gate_result_id: "gate-result-run-control",
            eval_run_id: "eval-run-8fc2",
            gate: "run-control",
            open_dependencies_json: [],
            record_ids_json: ["cfg-run-control"],
            score: "1.0000",
            status: "pass",
            threshold: "1.0000"
          },
          {
            blocker_reason: "intent precision below threshold",
            deterministic_basis: "intent precision gate from e2e fixture",
            eval_gate_result_id: "gate-result-intent",
            eval_run_id: "eval-run-8fc2",
            gate: "intent-precision",
            open_dependencies_json: [],
            record_ids_json: ["q1", "q2"],
            score: "0.8200",
            status: "fail",
            threshold: "0.9000"
          },
          {
            blocker_reason: "owner label manifest update required",
            deterministic_basis: "arbitration agreement gate from e2e fixture",
            eval_gate_result_id: "gate-result-arbitration",
            eval_run_id: "eval-run-8fc2",
            gate: "arbitration-agreement",
            open_dependencies_json: ["release_eval_label_manifest"],
            record_ids_json: ["release-label-manifest"],
            score: null,
            status: "blocked",
            threshold: "0.9000"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "recoup_model_pricing") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            active: true,
            approved_by: "human:rathish-owner",
            cached_input_per_1m_tokens: "0.125",
            currency: "USD",
            effective_from: "2026-06-30T00:00:00.000Z",
            effective_to: null,
            input_per_1m_tokens: "1.250",
            model_id: "gpt-5.5",
            output_per_1m_tokens: "10.000",
            pricing_hash: "5".repeat(64),
            pricing_id: "pricing-gpt-55-default",
            reasoning_per_1m_tokens: "0.000",
            service_tier: "default"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "recoup_finops_daily_rollups") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            agent_name: "Maya Forensics",
            approved_draft_count: 1,
            blocked_count: 0,
            cached_input_tokens: 200_000,
            cases_processed_count: 4,
            cited_answer_count: 2,
            computed_cost_amount: null,
            computed_cost_currency: null,
            cost_status: "pricing_not_configured_not_computed",
            created_at: "2026-06-30T01:20:00.000Z",
            deterministic_basis: "E2E daily rollup from typed usage and business denominator rows",
            disputed_amount: "9200.00",
            failed_count: 0,
            input_tokens: 1_000_000,
            model_id: "gpt-5.5",
            output_tokens: 100_000,
            prompt_cache_hit_rate: "0.2000",
            prompt_cache_savings_amount: "0.2250",
            prompt_cache_savings_currency: "USD",
            prompt_cache_savings_status: "computed_from_owner_pricing",
            rollup_date: "2026-06-30",
            rollup_id: "rollup-e2e-maya",
            run_count: 1,
            source_record_ids_json: ["usage-1", "S3-L1", "approval-1"],
            succeeded_count: 1,
            total_tokens: 1_100_000,
            uncached_input_tokens: 800_000,
            unit_economics_json: { tokensPerRun: "1100000.0000" },
            workflow_name: "maya_forensics_query"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "recoup_finops_recommendations") {
    return Promise.resolve(
      new Response(
        JSON.stringify([
          {
            affected_agent_name: "Maya Forensics",
            affected_workflow_name: "maya_forensics_query",
            created_at: "2026-06-30T01:30:00.000Z",
            deterministic_basis: "stored-e2e-governance-action",
            evidence_record_ids_json: ["usage-1", "q1"],
            expected_impact_json: { posture: "read-only" },
            recommendation_id: "stored-e2e-governance-action",
            recommendation_type: "prompt_cache",
            recommended_action: "Review prompt-cache evidence before changing runtime prompts.",
            requires_human_approval: true,
            resolved_at: null,
            resolved_by: null,
            severity: "advisory",
            status: "open",
            title: "Review prompt-cache evidence"
          }
        ]),
        { status: 200 }
      )
    );
  }

  if (tableName === "recoup_openai_cost_buckets") {
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
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

function evidenceBusinessLabelForDocumentType(documentType: string): string {
  const normalized = documentType.trim().toLowerCase();
  if (normalized === "invoice" || normalized === "credit-memo" || normalized === "remittance-advice") {
    return "Invoice";
  }
  if (normalized === "pod" || normalized === "carrier-report") {
    return "POD";
  }
  if (normalized === "contract") {
    return "Contract";
  }
  if (normalized === "trade-promo" || normalized === "tpm" || normalized === "promotion") {
    return "Promotion";
  }
  if (normalized === "bureau-signal" || normalized === "correspondence" || normalized === "customer-record") {
    return "Customer record";
  }

  return normalized
    .split(/[-_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeRenderedText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
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

function assertNoForbiddenRequests(requests: readonly string[], label: string): void {
  assert(requests.length === 0, `${label} must not call forbidden routes: ${requests.join(", ")}`);
}

function firstItem<T>(items: readonly T[], label: string): T {
  const item = items[0];
  assert(item !== undefined, `${label} must include at least one item`);

  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
