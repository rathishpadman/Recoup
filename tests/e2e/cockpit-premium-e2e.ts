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
  type Request as PlaywrightRequest
} from "playwright";
import { governedConfigSeedRows } from "../../config/governed.js";
import { releaseOwnerInputSeedRows } from "../../config/releaseOwnerInputs.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import type { EvalFinopsCockpitModel } from "../../src/services/evalsFinopsTypes.js";
import { loadCreditRiskFixtureRows } from "../unit/fixtures/creditRiskFixture.js";
import { rowsForCreditRiskTable } from "../unit/fixtures/creditRiskSupabaseFixture.js";

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
  settlementRunId: string;
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
    provenance: {
      deterministicBasis: string;
      recordIds: string[];
      sourceKind: string;
      sourceName: string;
    };
    queueLabel: string;
    recommendedActionLabel: string;
    reason: string;
    routingLabel: string;
    workItemLabel: string;
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
type ForensicsSelectedEvidenceContext = Pick<ForensicsE2EModel, "selected">;

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
  selected: ForensicsE2EModel["selected"];
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
    evalsFinopsOnly: process.argv.includes("--evals-finops-only"),
    mayaLoginOnly: process.argv.includes("--maya-login-only"),
    mayaShadcnOnly: process.argv.includes("--maya-shadcn-only")
  });
}

async function main(options: { evalsFinopsOnly: boolean; mayaLoginOnly: boolean; mayaShadcnOnly: boolean }): Promise<void> {
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
    if (options.evalsFinopsOnly) {
      await assertEvalsFinopsGovernanceRoute(browser);
      console.log(`Evals FinOps governance route checked; screenshot written to ${outputDir}/governance-evals-finops-1440.png`);
      return;
    }

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
    await expectVisibleLocator(page, '[data-testid="recoup-landing-shell"]', "Recoup scrollable landing shell");
    await expectVisibleLocator(page, '[data-testid="recoup-landing-hero"]', "Recoup landing hero");
    await expectVisibleText(page, "CPG manufacturers lose");
    await expectVisibleText(page, "2–5% of gross revenue");
    await expectVisibleText(page, "retailer deductions");
    await expectVisibleText(page, "Recoup is an agentic Order-to-Cash recovery cockpit");
    await expectVisibleText(page, "Every decision cites evidence");
    await expectVisibleText(page, "Code computes every dollar");
    await expectVisibleText(page, "Humans approve");
    const heroImage = page.locator('img[src="/recoup-agentic-hero-visual.png"]');
    await heroImage.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector('img[src="/recoup-agentic-hero-visual.png"]');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      },
      undefined,
      { timeout: 15_000 }
    );
    const heroImageRender = await heroImage.evaluate((element) => {
      const image = element as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      return {
        alt: image.alt,
        complete: image.complete,
        height: rect.height,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
        width: rect.width
      };
    });
    assert(
      heroImageRender.complete &&
        heroImageRender.naturalWidth > 0 &&
        heroImageRender.naturalHeight > 0 &&
        heroImageRender.width > 0 &&
        heroImageRender.height > 0 &&
        heroImageRender.alt.includes("governed approval"),
      `Landing hero visual must decode and render the supplied PNG, received ${JSON.stringify(heroImageRender)}`
    );
    const heroCopy = await page.getByTestId("recoup-landing-hero").innerText();
    assert(!heroCopy.includes("McKinsey"), "Landing hero must not show the reference strip below the persona CTAs");
    assert(!heroCopy.includes("RVCF"), "Landing hero must not show the reference strip below the persona CTAs");
    assert(!heroCopy.includes("APQC"), "Landing hero must not show the reference strip below the persona CTAs");
    assert(!heroCopy.includes("UpClear"), "Landing hero must not show the reference strip below the persona CTAs");
    const pageCopy = await page.locator("body").innerText();
    assert(!pageCopy.includes("McKinsey"), "Landing page must not carry unsourced McKinsey attribution");
    assert(!pageCopy.includes("RVCF"), "Landing page must not carry unsourced RVCF attribution");
    assert(!pageCopy.includes("UpClear"), "Landing page must not carry unsourced UpClear attribution");
    assert(!pageCopy.includes("VIDEO_ID_HERE"), "Landing page must not expose a placeholder demo video URL");
    await expectVisibleText(page, "Industry estimate");
    await expectVisibleText(page, "Retail claims benchmark");
    await expectVisibleLocator(page, '[data-testid="recoup-landing-tab-problem"]', "Recoup Problem tab");

    const tablistOverflow = await page.getByRole("tablist", { name: "Recoup overview sections" }).evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        overflowX: style.overflowX,
        scrollWidth: element.scrollWidth
      };
    });
    assert(
      tablistOverflow.scrollWidth <= tablistOverflow.clientWidth + 2,
      `Landing tab navigation must not require horizontal scrolling, received ${JSON.stringify(tablistOverflow)}`
    );
    assert(
      tablistOverflow.overflowX !== "auto" && tablistOverflow.overflowX !== "scroll",
      `Landing tab navigation must not render as a horizontal scroller, received ${JSON.stringify(tablistOverflow)}`
    );
    const tabVerticalClearance = await page.evaluate(() => {
      const tablist = document.querySelector('[role="tablist"][aria-label="Recoup overview sections"]');
      const activePanel = document.querySelector('[data-testid="recoup-landing-tab-problem"]');
      const panelEyebrow = activePanel?.querySelector("p");
      if (!(tablist instanceof HTMLElement) || !(panelEyebrow instanceof HTMLElement)) {
        return null;
      }

      const tabRect = tablist.getBoundingClientRect();
      const eyebrowRect = panelEyebrow.getBoundingClientRect();
      return {
        clearance: eyebrowRect.top - tabRect.bottom,
        eyebrowTop: eyebrowRect.top,
        tabBottom: tabRect.bottom
      };
    });
    assert(
      tabVerticalClearance !== null && tabVerticalClearance.clearance >= 16,
      `Landing tab navigation must not overlap active panel content, received ${JSON.stringify(tabVerticalClearance)}`
    );
    const activeTabContainment = await page.getByRole("tablist", { name: "Recoup overview sections" }).evaluate((element) => {
      const activeTab = element.querySelector('[data-active], [aria-selected="true"]');
      if (!(activeTab instanceof HTMLElement)) {
        return null;
      }
      const tabRect = activeTab.getBoundingClientRect();
      const listRect = element.getBoundingClientRect();
      return {
        bottomInset: listRect.bottom - tabRect.bottom,
        listHeight: listRect.height,
        tabHeight: tabRect.height,
        topInset: tabRect.top - listRect.top
      };
    });
    assert(
      activeTabContainment !== null && activeTabContainment.topInset >= -1 && activeTabContainment.bottomInset >= -1,
      `Landing active tab must stay inside the rail, received ${JSON.stringify(activeTabContainment)}`
    );

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
    await expectVisibleText(page, "Ingest");
    await expectVisibleText(page, "Investigate");
    await expectVisibleText(page, "Decide");
    await expectVisibleText(page, "Act (draft-only)");
    await expectVisibleText(page, "Audit & Govern");
    await expectVisibleText(page, "Governed end to end");
    await expectVisibleText(page, "30 invariant controls tracked");
    await expectVisibleText(page, "Code computes dollars and risk math");
    await expectVisibleText(page, "Tamper-evident audit trail");

    await page.getByRole("tab", { name: "Tech" }).click();
    const architectureImage = page.getByRole("img", {
      name: "Recoup architecture: read-only evidence in, human-approved action out"
    });
    await architectureImage.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector('img[src="/recoup-tech-architecture-infographic.png"]');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      },
      undefined,
      { timeout: 15_000 }
    );
    const initialArchitectureImage = await architectureImage.evaluate((element) => {
      if (!(element instanceof HTMLImageElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        complete: element.complete,
        height: rect.height,
        naturalHeight: element.naturalHeight,
        naturalWidth: element.naturalWidth,
        src: element.getAttribute("src"),
        tagName: element.tagName.toLowerCase(),
        width: rect.width
      };
    });
    assert(
      initialArchitectureImage !== null &&
        initialArchitectureImage.tagName === "img" &&
        initialArchitectureImage.src === "/recoup-tech-architecture-infographic.png" &&
        initialArchitectureImage.complete &&
        initialArchitectureImage.naturalWidth > 0 &&
        initialArchitectureImage.naturalHeight > 0 &&
        initialArchitectureImage.width > 0 &&
        initialArchitectureImage.height > 0,
      `architecture infographic must render as the supplied decoded PNG, received ${JSON.stringify(initialArchitectureImage)}`
    );
    await expectVisibleText(page, "No ERP write-back");
    await expectVisibleText(page, "Deterministic basis");
    await expectVisibleText(page, "Citations required");
    await expectVisibleText(page, "gpt-5.4 family, gpt-realtime-2, gpt-4o-mini-transcribe");

    await page.getByRole("tab", { name: "How We Built It" }).click();
    await expectVisibleText(page, "OpenAI Agents SDK orchestration");
    const buildCopy = await page.getByTestId("recoup-landing-tab-build").innerText();
    assert(!/Claude|Codex|Superpowers/iu.test(buildCopy), "How We Built It must not expose internal coding tool references");
    const buildCardHeights = await page.evaluate(() => {
      const invariantsCard = document.querySelector('[data-testid="recoup-landing-invariants-card"]');
      const runFlowCard = document.querySelector('[data-testid="recoup-landing-run-flow-card"]');
      if (!(invariantsCard instanceof HTMLElement) || !(runFlowCard instanceof HTMLElement)) {
        return null;
      }
      const invariantsHeight = invariantsCard.getBoundingClientRect().height;
      const runFlowHeight = runFlowCard.getBoundingClientRect().height;
      return {
        delta: Math.abs(invariantsHeight - runFlowHeight),
        invariantsHeight,
        runFlowHeight
      };
    });
    assert(
      buildCardHeights !== null && buildCardHeights.delta <= 2,
      `Landing Build invariant and run-flow cards must align in height, received ${JSON.stringify(buildCardHeights)}`
    );
    assertNoForbiddenRequests(apiRequests, "Public landing page");
    await assertNoHorizontalOverflow(page, "Recoup landing desktop");
    const viewportFit = await page.evaluate(() => ({
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight
    }));
    assert(
      viewportFit.scrollHeight > viewportFit.innerHeight + 4,
      `landing page must be a normal scrollable document, received ${JSON.stringify(viewportFit)}`
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
    JSON.stringify(mayaNavLabels) === JSON.stringify(["Overview", "Worklist 8", "Approvals 20"]),
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
  await expectLocator(davidPage, '[data-testid="david-shadcn-workbench"]', "David risk review v2 workbench");
  await expectText(davidPage, "Good morning, David.");
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
      await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
      await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
      await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview landing section");
      await expectVisibleLocator(page, '[data-testid="maya-overview-summary-card"]', "Maya Overview summary cards");
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
      await assertOverviewSortControlsFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
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
        await assertRecoupAgentLauncherDoesNotReplayAfterOverviewDockOpen(browser, beat2RowOpenTarget);
        await assertMayaDetailErrorStateIsActionable(browser, beat2RowOpenTarget);
        await assertRecoupAgentLauncherOpensGroundedDock(page, model);
      }
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
          "Recoup Copilot launcher signal must not replay when opening an investigation normally"
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
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

async function assertRecoupAgentLauncherOpensGroundedDock(page: Page, model: ForensicsE2EModel): Promise<void> {
  const launcherRect = await assertRecoupAgentLauncherPlacement(page, "Maya Recoup Copilot query dock");
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
    `Recoup Copilot launcher must use the distinct floating chat treatment; background=${launcherStyle.backgroundColor}`
  );
  assert(launcherStyle.color !== "", "Recoup Copilot launcher must expose readable foreground color");
  const casePickerTarget =
    model.worklist.find((item) => !item.lineIds.includes(model.selected.lineId)) ??
    firstItem(model.worklist, "Overview copilot case picker options");
  const caseScopedAnswer = `E2E Overview case-scoped cited answer for ${casePickerTarget.lineId}.`;
  const workspaceAnswer = "E2E Overview workspace cited answer from the backend query route.";
  let workspaceQueryBody: Record<string, unknown> | undefined;
  let caseQueryBody: Record<string, unknown> | undefined;
  let markWorkspaceQueryStarted: (() => void) | undefined;
  let markCaseQueryStarted: (() => void) | undefined;
  const workspaceQueryStarted = new Promise<void>((resolve) => {
    markWorkspaceQueryStarted = resolve;
  });
  const caseQueryStarted = new Promise<void>((resolve) => {
    markCaseQueryStarted = resolve;
  });
  await page.route("**/api/forensics/query", async (route) => {
    const requestBody = parseOptionalJsonRecord(route.request().postData());
    if (requestBody?.["scope"] === "workspace") {
      workspaceQueryBody = requestBody;
      markWorkspaceQueryStarted?.();
      await route.fulfill({
        body: JSON.stringify(
          buildE2EForensicsQueryResponse(
            model,
            workspaceAnswer,
            "E2E deterministic basis from the Overview workspace backend query response."
          )
        ),
        contentType: "application/json",
        status: 200
      });
      return;
    } else {
      caseQueryBody = requestBody;
      markCaseQueryStarted?.();
    }
    await route.fulfill({
      body: JSON.stringify(
        buildE2EForensicsQueryResponse(
          selectedEvidenceContextForWorklistItem(model, casePickerTarget),
          caseScopedAnswer,
          `E2E deterministic basis from the Overview case-scoped backend query response for ${casePickerTarget.lineId}.`
        )
      ),
      contentType: "application/json",
      status: 200
    });
  });
  try {
    await page.getByTestId("recoup-agent-launcher").click();
    await page.locator('[data-testid="maya-query-dock"]').waitFor({ state: "visible", timeout: 15_000 });
    await page.locator('[data-testid="maya-selected-evidence-context"]').waitFor({ state: "visible", timeout: 15_000 });
    await assertRecoupAgentLauncherDoesNotObstructQueryDock(page, launcherRect);
    const dockText = await page.getByTestId("maya-query-dock").innerText();
    assert(dockText.includes("Settlement run packet"), "Recoup Copilot launcher must open the workspace evidence packet context");
    assert(dockText.includes("Workspace evidence context"), "Recoup Copilot launcher must keep honest workspace evidence context");
    assert(!dockText.includes("Client-selected case context"), "Recoup Copilot launcher must not expose developer-facing selected-case copy");
    await expectVisibleLocator(page, '[data-testid="maya-query-case-picker"]', "Maya Overview copilot case picker");
    await expectVisibleLocator(page, 'button[aria-label="Ask by voice"]', "Maya Overview Recoup Copilot idle voice button");
    await page.getByRole("combobox", { name: /^Choose copilot case focus$/u }).click();
    for (const item of model.worklist) {
      await page
        .getByRole("option", { name: new RegExp(`^${escapeRegExp(item.customerLabel)} - ${escapeRegExp(item.workItemLabel)}`, "u") })
        .waitFor({ state: "visible", timeout: 5_000 });
    }
    await page
      .getByRole("option", {
        name: new RegExp(`^${escapeRegExp(casePickerTarget.customerLabel)} - ${escapeRegExp(casePickerTarget.workItemLabel)}`, "u")
      })
      .click();
    await page.getByTestId("maya-query-selected-line").waitFor({ state: "visible", timeout: 5_000 });
    const selectedCaseLabel = await page.getByTestId("maya-query-selected-line").innerText();
    assert(
      selectedCaseLabel.includes("Selected case"),
      `Overview Recoup Copilot case picker must show business selected-case copy for ${casePickerTarget.lineId}`
    );
    await page.getByTestId("maya-query-input").fill(`What evidence supports ${casePickerTarget.lineId}?`);
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await Promise.race([
      caseQueryStarted,
      delay(5_000).then(() => {
        throw new Error("Overview Recoup Copilot case-scoped query request did not start.");
      })
    ]);
    assert(caseQueryBody !== undefined, "Overview Recoup Copilot case-scoped query body must be JSON.");
    assert(caseQueryBody["selectedLineId"] === casePickerTarget.lineId, "Overview Recoup Copilot case picker must submit selectedLineId.");
    assert(Array.isArray(caseQueryBody["recordIds"]), "Overview Recoup Copilot case picker must submit case record IDs.");
    assert(
      (caseQueryBody["recordIds"] as unknown[]).includes(casePickerTarget.lineId),
      "Overview Recoup Copilot case picker record IDs must include the selected line."
    );
    for (const lineId of casePickerTarget.lineIds) {
      assert(
        (caseQueryBody["recordIds"] as unknown[]).includes(lineId),
        `Overview Recoup Copilot case picker record IDs must include picked case line ${lineId}.`
      );
    }
    for (const recordId of new Set(casePickerTarget.provenance.recordIds)) {
      assert(
        (caseQueryBody["recordIds"] as unknown[]).includes(recordId),
        `Overview Recoup Copilot case picker record IDs must include selected-case provenance record ${recordId}.`
      );
    }
    await expectVisibleLocator(page, '[data-testid="maya-copilot-verdict-band"]', "Overview case-scoped Copilot verdict band");
    const pickedCaseStory = await page.getByTestId("maya-query-dock").innerText();
    assert(
      pickedCaseStory.includes(casePickerTarget.verdictLabel) &&
        pickedCaseStory.includes(casePickerTarget.recommendedActionLabel) &&
        pickedCaseStory.includes(casePickerTarget.amount) &&
        pickedCaseStory.includes(casePickerTarget.reason),
      `Overview case-scoped Copilot story must render the picked case verdict/action/amount/reason for ${casePickerTarget.lineId}.`
    );
    await page.getByTestId("maya-copilot-citations-drawer").getByRole("button", { name: /^Citations/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-citation-record"]', "Overview case-scoped Copilot citation records");
    const pickedCaseCitations = await page.getByTestId("maya-copilot-citation-records").innerText();
    for (const lineId of casePickerTarget.lineIds) {
      assert(pickedCaseCitations.includes(lineId), `Overview case-scoped Copilot citation drawer must include ${lineId}.`);
    }
    if (!casePickerTarget.lineIds.includes(model.selected.lineId)) {
      assert(
        !pickedCaseCitations.includes(model.selected.lineId),
        `Overview case-scoped Copilot citation drawer must not leak default selected line ${model.selected.lineId}.`
      );
    }
    await page.getByRole("combobox", { name: /^Choose copilot case focus$/u }).click();
    await page.getByRole("option", { name: /^Workspace$/u }).click();
    await page.getByTestId("maya-query-input").fill("What did the agents conclude across the settlement run?");
    await page.waitForFunction(() => {
      const selectedLine = document.querySelector<HTMLElement>('[data-testid="maya-query-selected-line"]')?.innerText ?? "";
      const input = document.querySelector<HTMLTextAreaElement>('[data-testid="maya-query-input"]');
      return selectedLine.includes("Workspace") && input?.value === "What did the agents conclude across the settlement run?";
    });
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await Promise.race([
      workspaceQueryStarted,
      delay(5_000).then(() => {
        throw new Error("Overview Recoup Copilot workspace query request did not start.");
      })
    ]);
    assert(workspaceQueryBody !== undefined, "Overview Recoup Copilot workspace query body must be JSON.");
    assert(workspaceQueryBody["scope"] === "workspace", "Overview Recoup Copilot must submit workspace query scope.");
    assert(
      workspaceQueryBody["settlementRunId"] === model.settlementRunId,
      "Overview Recoup Copilot must submit the backend settlementRunId."
    );
    assert(
      workspaceQueryBody["recordIds"] === undefined && workspaceQueryBody["selectedLineId"] === undefined,
      "Overview Recoup Copilot workspace query must not fall back to selected-line payload fields."
    );
    await page.waitForFunction((answer) => {
      const assistantText = document.querySelector<HTMLElement>('[data-testid="maya-query-assistant-message"]')?.innerText ?? "";
      return assistantText.includes(answer);
    }, workspaceAnswer);
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  } finally {
    await page.unroute("**/api/forensics/query").catch(() => undefined);
  }
}

async function assertRecoupAgentLauncherMobilePlacement(browser: Browser): Promise<void> {
  const context = await newRoleContext(browser, "maya", 390, 844);
  const page = await context.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya mobile shadcn workbench");
    await assertRecoupAgentLauncherPlacement(page, "Maya mobile Recoup Copilot launcher");
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
  await expectVisibleLocator(page, '[data-testid="recoup-agent-launcher"]', "Recoup Copilot launcher");
  const launcherRect = await page.getByTestId("recoup-agent-launcher").boundingBox();
  const viewportSize = page.viewportSize();
  assert(launcherRect !== null, `${label} Recoup Copilot launcher must expose a measurable viewport rect`);
  assert(viewportSize !== null, `${label} Recoup Copilot launcher viewport check requires a viewport`);
  const rightInset = viewportSize.width - (launcherRect.x + launcherRect.width);
  const bottomInset = viewportSize.height - (launcherRect.y + launcherRect.height);
  assert(
    launcherRect.x >= 0 &&
      launcherRect.x + launcherRect.width <= viewportSize.width &&
      launcherRect.y >= 0 &&
      launcherRect.y + launcherRect.height <= viewportSize.height,
    `${label} Recoup Copilot launcher must be fully visible in the current viewport before click; rect=${JSON.stringify(launcherRect)}`
  );
  const desktopPlacement = viewportSize.width >= 768 ? launcherRect.x > viewportSize.width / 2 : launcherRect.x >= viewportSize.width / 3;
  assert(
    rightInset >= 8 &&
      rightInset <= 56 &&
      bottomInset >= 8 &&
      bottomInset <= 72 &&
      desktopPlacement,
    `${label} Recoup Copilot launcher must pin to the bottom-right viewport edge as an independent floating entry point; rect=${JSON.stringify(
      launcherRect
    )} viewport=${JSON.stringify(viewportSize)}`
  );

  return launcherRect;
}

async function openRecoupCopilotDock(page: Page, label: string): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="recoup-agent-launcher"]', "Recoup Copilot launcher");
  await page.getByTestId("recoup-agent-launcher").click();
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', label);
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', `${label} input`);
}

async function assertRecoupAgentLauncherAvoidsOverviewData(page: Page, label: string): Promise<void> {
  const launcherRect = await page.getByTestId("recoup-agent-launcher").boundingBox();
  assert(launcherRect !== null, `${label} Recoup Copilot launcher overlap check requires a launcher rect`);
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
        `${label} Recoup Copilot launcher must not overlap the concentration header or first rows (${selector}); launcher=${JSON.stringify(
          launcherRect
        )} data=${JSON.stringify(box)}`
      );
    }
  }
}

async function assertOverviewSortControlsFidelity(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-testid="maya-overview-case-concentration-header-row"]');
    const firstRow = document.querySelector<HTMLElement>('[data-testid="maya-overview-case-concentration-row"]');
    const buttonKeys = [
      ["id", "maya-overview-case-concentration-sort-id"],
      ["customer", "maya-overview-case-concentration-sort-customer"],
      ["lines", "maya-overview-case-concentration-sort-lines"],
      ["exposure", "maya-overview-case-concentration-sort-exposure"]
    ] as const;
    const buttons = buttonKeys
      .map(([key, testId]) => {
        const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
        return button !== null && button.offsetParent !== null ? { button, key } : undefined;
      })
      .filter((entry): entry is { button: HTMLButtonElement; key: (typeof buttonKeys)[number][0] } => entry !== undefined);
    const rects = buttons.map(({ button, key }) => {
      const rect = button.getBoundingClientRect();
      const visibleSpans = [...button.querySelectorAll<HTMLElement>("span")]
        .filter((span) => {
          const style = window.getComputedStyle(span);
          const spanRect = span.getBoundingClientRect();

          return style.position !== "absolute" && spanRect.width > 0 && spanRect.height > 0;
        })
        .map((span) => span.innerText.trim())
        .filter((text) => text.length > 0);

      return {
        height: rect.height,
        key,
        text: visibleSpans.join(" "),
        width: rect.width,
        x: rect.x,
        y: rect.y
      };
    });
    const rowCells = firstRow === null
      ? []
      : [...firstRow.children].map((cell) => {
          const rect = cell.getBoundingClientRect();
          return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
        });
    const overlaps = rects.flatMap((left, leftIndex) =>
      rects.slice(leftIndex + 1).flatMap((right, rightOffset) => {
        const rightIndex = leftIndex + rightOffset + 1;
        const intersects =
          left.x < right.x + right.width &&
          left.x + left.width > right.x &&
          left.y < right.y + right.height &&
          left.y + left.height > right.y;

        return intersects ? [`${leftIndex.toString()}-${rightIndex.toString()}`] : [];
      })
    );

    return {
      buttonCount: buttons.length,
      headerText: header?.innerText.trim() ?? "",
      rowCells,
      overlaps,
      rects
    };
  });

  assert(result.buttonCount === 4, `${label} Overview sort controls must render four controls`);
  assert(result.overlaps.length === 0, `${label} Overview sort controls must not overlap: ${JSON.stringify(result)}`);
  assert(
    !/\bSort by\b|\b(?:ID|Customer|Lines|Exposure)\s+Sort\b/u.test(result.headerText),
    `${label} Overview sort controls must read as an aligned header, not a combined Sort by toolbar: ${result.headerText}`
  );
  assert(result.rowCells.length >= 5, `${label} Overview sort alignment requires first row cell rects: ${JSON.stringify(result)}`);
  const sortRectByKey = Object.fromEntries(result.rects.map((rect) => [rect.key, rect]));
  const anchoredAlignmentPairs = [
    ["id", 0],
    ["customer", 1]
  ] as const;
  for (const [key, rowCellIndex] of anchoredAlignmentPairs) {
    const sortRect = sortRectByKey[key];
    const rowCell = result.rowCells[rowCellIndex];
    assert(sortRect !== undefined && rowCell !== undefined, `${label} Overview sort ${key} alignment data missing: ${JSON.stringify(result)}`);
    assert(
      Math.abs(sortRect.x - rowCell.x) <= 12,
      `${label} Overview sort ${key} must align with row column ${rowCellIndex.toString()}: ${JSON.stringify({ rowCell, sortRect })}`
    );
  }
  const amountCell = result.rowCells[3];
  assert(amountCell !== undefined, `${label} Overview sort amount/lines alignment data missing: ${JSON.stringify(result)}`);
  for (const key of ["exposure", "lines"] as const) {
    const sortRect = sortRectByKey[key];
    assert(sortRect !== undefined, `${label} Overview sort ${key} alignment data missing: ${JSON.stringify(result)}`);
    assert(
      sortRect.x >= amountCell.x - 12 && sortRect.x + sortRect.width <= amountCell.x + amountCell.width + 12,
      `${label} Overview sort ${key} must stay inside the exposure/lines row column: ${JSON.stringify({ amountCell, sortRect })}`
    );
  }
  for (const rect of result.rects) {
    assert(rect.width >= 52, `${label} Overview sort control must have scan-friendly width: ${JSON.stringify(rect)}`);
    assert(rect.height <= 36, `${label} Overview sort control must stay compact: ${JSON.stringify(rect)}`);
    assert(!/\bSort\b/u.test(rect.text), `${label} inactive Overview sort control must hide the visible Sort helper: ${rect.text}`);
  }
}

async function assertRecoupAgentLauncherDoesNotObstructQueryDock(page: Page, launcherRect: RectLike): Promise<void> {
  const dockRect = await page.getByTestId("maya-query-dock").boundingBox();
  assert(dockRect !== null, "Recoup Copilot launcher query-dock overlap check requires a dock rect");
  if (!rectsIntersect(launcherRect, dockRect)) {
    return;
  }

  const topTestId = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest("[data-testid]")?.getAttribute("data-testid") ?? "";
  }, centerOfRect(launcherRect));
  assert(
    topTestId !== "recoup-agent-launcher",
    `Recoup Copilot launcher must not sit above the right-side query dock when the dock is open; topTestId=${topTestId}`
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

async function assertRecoupAgentLauncherDoesNotReplayAfterOverviewDockOpen(
  browser: Browser,
  normalOpenItem: ForensicsE2EWorklistItem
): Promise<void> {
  const context = await newRoleContext(browser, "maya", 1440, 900);
  const page = await context.newPage();
  const routePattern = "**/api/forensics/work-items/**";
  let detailRequestCount = 0;

  await page.route(routePattern, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      detailRequestCount += 1;
    }

    await route.continue();
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="recoup-agent-launcher"]', "Recoup Copilot launcher");
    await page.getByTestId("recoup-agent-launcher").click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Overview Recoup Copilot dock");
    await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview remains mounted after Copilot dock open");
    await expectNoVisibleLocator(page, '[data-testid="maya-case-workspace"]', "Maya case workspace after Overview Copilot dock open");
    assert(
      detailRequestCount === 0,
      `Overview Recoup Copilot launcher must not request a case detail packet before backend workspace query support; received ${detailRequestCount.toString()} requests`
    );
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
    await page.getByRole("button", { name: /^Worklist$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist section after Overview dock close");
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${normalOpenItem.lineId}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${normalOpenItem.lineId}"]`).click();
    await page.getByTestId("maya-local-row-action-open").click();
    await page.locator('[data-testid="maya-query-dock"]').waitFor({ state: "hidden", timeout: 5_000 });
    assert(
      (await page.locator('[data-testid="maya-query-dock"]').count()) === 0,
      "Recoup Copilot launcher signal must not replay after Overview dock close"
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
      await delay(150);
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${errorTarget.lineId}"]`).click();
    await page.getByTestId("maya-local-row-action-open").click();
    await expectVisibleLocator(
      page,
      '[data-testid="maya-work-item-detail-loading-skeleton"]',
      "Maya detail loading skeleton before fail-closed error"
    );
    await expectVisibleLocator(page, '[data-testid="maya-work-item-detail-state"]', "Maya detail error state");
    await page.waitForFunction(() => document.body.innerText.includes("Source unavailable"), undefined, { timeout: 10_000 });
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 4 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaDraftReviewSection(page);
    await assertBeat4DraftTabFidelity(page, detailModel, forbiddenRequests);
    await scrollToMayaCaseSection(page, "maya-case-detail-b2-dossier-head", "Maya Beat 4 dossier head restored");
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 5 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaEvidenceSection(page);
    await assertBeat5EvidenceDossierFidelity(page, detailModel, connectors, forbiddenRequests);
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaOverviewSourceReadiness(page, "Maya Beat 6", { expectInitiallyHidden: true });
    await openMayaWorklistSection(page);
    await expectVisibleText(page, "Deduction Worklist");
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 6 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaEvidenceSection(page);
    await assertBeat5EvidenceDossierFidelity(page, detailModel, connectors, forbiddenRequests);
    await openRecoupCopilotDock(page, "Maya Beat 6 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, detailModel, localQuestion, forbiddenRequests);
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
  let queryEvidenceContext: ForensicsSelectedEvidenceContext = model;
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
        body: JSON.stringify(buildE2EForensicsQueryResponse(queryEvidenceContext, heldAnswer, heldBasis)),
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 7 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    queryEvidenceContext = detailModel;
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaEvidenceSection(page);
    await assertBeat5EvidenceDossierFidelity(page, detailModel, connectors, forbiddenRequests);
    await openRecoupCopilotDock(page, "Maya Beat 7 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, detailModel, localQuestion, forbiddenRequests);
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await Promise.race([
      backendQueryRequestStarted,
      delay(5_000).then(() => {
        throw new Error("Beat 7 backend forensics query request did not start.");
      })
    ]);
    await assertBeat7AgentTraceInProgressFidelity(page, detailModel, localQuestion, forbiddenRequests, backendQueryRequestCount);
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
  let queryEvidenceContext: ForensicsSelectedEvidenceContext = model;
  let browserRuntimeProbe: unknown;
  const browserErrors: string[] = [];
  const browserWarnings: string[] = [];

  await page.route("**/api/forensics/query", async (route) => {
    backendQueryRequestCount += 1;
    await route.fulfill({
      body: JSON.stringify(buildE2EForensicsQueryResponse(queryEvidenceContext, acceptedAnswer, acceptedBasis)),
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    browserRuntimeProbe = await page.evaluate(() => ({
      mediaGetUserMediaType: typeof navigator.mediaDevices.getUserMedia,
      rtcType: typeof RTCPeerConnection,
      rtcValue: String(RTCPeerConnection).slice(0, 80)
    }));
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 8 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    queryEvidenceContext = detailModel;
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaEvidenceSection(page);
    await assertBeat5EvidenceDossierFidelity(page, detailModel, connectors, forbiddenRequests);
    await openRecoupCopilotDock(page, "Maya Beat 8 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, detailModel, localQuestion, forbiddenRequests);
    await page.getByRole("button", { name: /^Run query$/u }).click();
    try {
      await page.locator('[data-testid="maya-copilot-verdict-band"]').waitFor({ state: "visible", timeout: 15_000 });
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
    await expectVisibleLocator(page, '[data-testid="maya-copilot-verdict-band"]', "Maya Beat 8 Copilot verdict band");
    await assertBeat8CitedAnswerFidelity(page, detailModel, {
      acceptedAnswer,
      acceptedBasis,
      backendQueryRequestCount,
      forbiddenRequests,
      localQuestion,
    });
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-08-cited-answer.png` });
    await assertBeat8VoiceQueryFidelity(page, detailModel, localQuestion);
  } finally {
    await page.unroute("https://api.openai.com/v1/realtime/calls").catch(() => undefined);
    await page.unroute("**/api/forensics/query");
    await context.close();
  }
}

async function installBeat8RealtimeFakes(context: BrowserContext): Promise<void> {
  await context.addInitScript({
    content: String.raw`
(() => {
  const runtimeState = {
    denyMedia: false,
    mediaTrackStops: 0,
    peerConnections: []
  };
  Object.defineProperty(window, "__recoupE2ERealtime", {
    configurable: true,
    value: runtimeState
  });

  class E2EDataChannel extends EventTarget {
    constructor() {
      super();
      this.closed = false;
      this.sentMessages = [];
      this.sentResponseCreate = false;
    }

    close() {
      this.closed = true;
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
      this.closed = false;
      this.dataChannel = new E2EDataChannel();
      this.ontrack = null;
      runtimeState.peerConnections.push(this);
    }

    addTrack() {}

    close() {
      this.closed = true;
      this.dataChannel.close();
    }

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
    getUserMedia: () => {
      if (runtimeState.denyMedia) {
        return Promise.reject(new DOMException("Microphone permission denied in E2E", "NotAllowedError"));
      }

      return Promise.resolve({
        getTracks: () => [
          {
            stop: () => {
              runtimeState.mediaTrackStops += 1;
            }
          }
        ]
      });
    }
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
  await expectVisibleText(forensics, "Source readiness");
  await expectVisibleText(forensics, "Investigation checklist");

  const run = await mayaContext.newPage();
  await run.goto(`${appUrl}/run`, { waitUntil: "networkidle" });
  await expectLocator(run, ".agent-trace-visualizer", "Run AgentTraceVisualizer");
  await expectText(run, "Trace lanes");
  await expectVisibleText(run, "Recoup Copilot");
  const runCopilot = run.getByTestId("run-copilot-drawer");
  assert(!(await runCopilot.locator(".query-box").isVisible()), "Run Recoup Copilot query controls must stay collapsed until clicked");
  await runCopilot.locator("summary").click();
  await expectVisibleLocator(run, '[data-testid="run-copilot-drawer"] .query-box', "Run Recoup Copilot query controls");
  await mayaContext.close();

  await assertMayaShadcnReviewRoute(browser);

  const davidContext = await newRoleContext(browser, "david", 1440, 900);
  const credit = await davidContext.newPage();
  await credit.goto(`${appUrl}/credit`, { waitUntil: "networkidle" });
  await expectLocator(credit, '[data-testid="david-shadcn-workbench"]', "David risk review v2 workbench");
  await expectLocator(credit, '[data-testid="david-risk-review-queue"]', "David risk review queue");
  await expectText(credit, "Good morning, David.");
  await credit.locator('[data-testid="david-queue-account-row"][data-account-id="ACC-CRE"]').click();
  await expectLocator(credit, '[data-testid="david-account-dossier"]', "David account dossier");
  await expectLocator(credit, '[data-testid="david-decision-flow"]', "David decision flow");
  await expectText(credit, "Crestline Grocery");
  await expectText(credit, "Action packet");
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
    await expectVisibleText(page, "Agent Scorecard");
    await expectVisibleText(page, "Persona KPI Matrix");
    await expectVisibleText(page, "Token Usage");
    await expectVisibleText(page, "Cost Efficiency");
    await expectVisibleText(page, "Action Queue");

    assert(model.evalGates.length > 0, "Evals FinOps model must expose eval gate rows");
    assert(model.agentMetrics.length > 0, "Evals FinOps model must expose typed agent metrics");
    assert(model.recommendations.length > 0, "Evals FinOps model must expose deterministic recommendations");

    await expectVisibleText(page, "1/3");
    await expectVisibleText(page, "2/3");
    await expectVisibleText(page, "33%");
    await expectVisibleText(page, "Maya Forensics");
    await expectVisibleText(page, "Release Evaluator");
    await expectVisibleText(page, "20.0%");
    await expectVisibleText(page, "1,101,000");
    await expectVisibleText(page, "200K");
    await expectVisibleText(page, "0.2250");
    await expectVisibleText(page, "USD / owner pricing");
    await expectVisibleText(page, "Approve model pricing");
    await expectVisibleText(page, "Approve eval labels");

    const surfaceText = await page.getByTestId("evals-finops-surface").innerText();
    assert(!surfaceText.includes("$0"), "Evals FinOps incomplete-pricing state must not render $0");
    assert(!surfaceText.includes("Pricing blocked"), "Evals FinOps KPI surface must not show the old pricing-blocked label");
    assert(!surfaceText.includes("Blocked inputs"), "Evals FinOps KPI surface must not show blocked-input copy");
    assert(!surfaceText.includes("pricing-missing-for-observed-model"), "Evals FinOps KPI surface must hide raw recommendation IDs");
    assert(!surfaceText.includes("Human approval required"), "Evals FinOps KPI surface must avoid workflow narration in the CFO readout");
    await assertNoHorizontalOverflow(page, "Evals FinOps governance desktop");
    await page.screenshot({ fullPage: true, path: `${outputDir}/governance-evals-finops-1440.png` });
  } finally {
    await cfoContext.close();
  }
}

async function assertMayaShadcnReviewRoute(browser: Browser): Promise<void> {
  const mayaContext = await newRoleContext(browser, "maya", 1440, 900);
  const page = await mayaContext.newPage();

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await expectVisibleText(page, "Maya");
    await expectVisibleLocator(page, '[data-testid="maya-overview-kpi-band"]', "Maya Overview KPI band");
    await expectVisibleLocator(page, '[data-testid="maya-overview-concentration-band"]', "Maya Overview concentration band");
    await expectVisibleLocator(page, '[data-testid="maya-overview-source-readiness-toggle"]', "Maya Overview source readiness toggle");
    await expectVisibleLocator(page, '[data-testid="maya-overview-summary-card"]', "Maya Overview summary cards");
    await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-table"]', "Maya Overview concentration table");
    await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-filter"]', "Maya Overview concentration filter");
    await expectVisibleLocator(page, '[data-testid="maya-overview-case-concentration-sort-customer"]', "Maya Overview concentration customer sort");
    await expectVisibleText(page, "Case Concentration Analysis");
    await expectVisibleText(page, "Deduction cases");

    await page.getByRole("button", { name: /^Worklist$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist root section");
    await expectVisibleText(page, "Deduction Worklist");
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
      const waitUntil = target.name === "maya-shadcn-forensics" ? "domcontentloaded" : "networkidle";
      await page.goto(`${appUrl}${target.path}`, { waitUntil });
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 9 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaDraftReviewSection(page);
    await assertBeat9DraftReviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await assertLocatorInsideViewport(page, '[data-testid="maya-draft-command-bar"]', "Maya Beat 9 command bar");
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-09-draft-review.png` });

    await markMayaEvidenceReviewed(page);
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
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 10 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaDraftReviewSection(page);
    await assertBeat9DraftReviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await markMayaEvidenceReviewed(page);
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, detailModel, forbiddenRequests);
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-10-human-approval.png` });

    await page.getByRole("button", { name: /^Close approval dialog$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 10 close icon");

    await markMayaEvidenceReviewed(page);
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, detailModel, forbiddenRequests);
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
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat11ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 11 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaDraftReviewSection(page);
    await assertBeat9DraftReviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await markMayaEvidenceReviewed(page);
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, detailModel, forbiddenRequests);
    await page.getByRole("button", { name: /^Cancel$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 11 pre-audit approval cancel");

    await openMayaAuditDepthDrawer(page);
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-11-audit-confirmation.png` });
    await assertBeat11AuditConfirmationFidelity(page, detailModel, detailModel, forbiddenRequests);
  } finally {
    await context.close();
  }
}

async function captureMayaBeat12ReturnWorklistScreenshot(browser: Browser): Promise<void> {
  const model = await loadForensicsE2EModel();
  const backendSelectedRow =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? firstItem(model.worklist, "worklist rows");
  const context = await newRoleContext(browser, "maya", 1600, 1024);
  const page = await context.newPage();
  const forbiddenRequests: string[] = [];

  page.on("request", (request) => {
    if (isForbiddenBeat12ExternalActionRequest(request)) {
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await openMayaWorklistSection(page);
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 12 pre-open selected row");
    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya case detail open");
    await assertBeat4CaseOverviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await openMayaDraftReviewSection(page);
    await assertBeat9DraftReviewFidelity(page, detailModel, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await markMayaEvidenceReviewed(page);
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await assertBeat10HumanApprovalFidelity(page, detailModel, forbiddenRequests);
    await page.getByRole("button", { name: /^Cancel$/u }).click();
    await page.locator('[data-testid="maya-approval-gate-dialog"]').waitFor({ state: "hidden", timeout: 5_000 });
    assertNoForbiddenRequests(forbiddenRequests, "Beat 12 pre-audit approval cancel");

    await openMayaAuditDepthDrawer(page);
    await assertBeat11AuditConfirmationFidelity(page, detailModel, detailModel, forbiddenRequests);
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
  let queryEvidenceContext: ForensicsSelectedEvidenceContext = model;

  await page.route("**/api/forensics/query", async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        buildE2EForensicsQueryResponse(
          queryEvidenceContext,
          "E2E storyboard cited answer from the backend query route.",
          "E2E deterministic basis from the storyboard backend query response."
        )
      ),
      contentType: "application/json",
      status: 200
    });
  });

  try {
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-02-dashboard.png` });

    await page.getByRole("button", { name: /^Worklist$/u }).click();
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-03-recommended-action.png` });

    const detailModel = await openSelectedMayaWorkItemDetail(page, backendSelectedRow, "Maya storyboard case detail open");
    queryEvidenceContext = detailModel;
    await page.getByTestId("maya-case-workspace").scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-04-case-overview.png` });

    await openMayaEvidenceSection(page);
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-05-evidence-dossier.png` });

    await openRecoupCopilotDock(page, "Maya query dock");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-06-query-start.png` });
    await page.getByTestId("maya-query-input").fill("What evidence supports the selected draft?");
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await page.getByTestId("maya-copilot-verdict-band").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByTestId("maya-copilot-verdict-band").scrollIntoViewIfNeeded();
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-08-cited-answer.png` });
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');

    await openMayaInvestigationSection(page);
    await openMayaAgentTraceDepthDrawer(page);
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-07-agent-trace.png` });

    await openMayaDraftReviewSection(page);
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-09-draft-review.png` });

    await markMayaEvidenceReviewed(page);
    await page.getByRole("button", { name: /Open approval/u }).click();
    await expectVisibleLocator(page, '[role="alertdialog"]', "Maya approval dialog");
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-10-human-approval.png` });
    await closeVisibleOverlay(page, '[role="alertdialog"]');

    await openMayaAuditDepthDrawer(page);
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
): Promise<ForensicsWorkItemDetailE2EModel> {
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
  await explicitDetailRequest;
  const response = await explicitDetailResponse;
  assert(response.ok(), `${label} backend detail response must be 2xx for ${expectedRow.lineId}: ${response.status().toString()}`);
  const detailModel = (await response.json()) as ForensicsWorkItemDetailE2EModel;
  await expectMayaCaseDetailFlow(page, expectedRow, label);
  await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 20_000 });
  await assertMayaSinglePageCaseSkeleton(page, label);

  return detailModel;
}

async function scrollToMayaCaseSection(page: Page, testId: string, label: string): Promise<void> {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, `[data-testid="${testId}"]`, label);
}

async function openMayaEvidenceSection(page: Page): Promise<void> {
  await scrollToMayaCaseSection(page, "maya-case-detail-b4-evidence", "Maya evidence section");
  const drawer = page.getByTestId("maya-evidence-fact-cards");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya evidence fact cards");
  const trigger = drawer.getByTestId("maya-evidence-fact-cards-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-card"]', "Maya evidence fact card");
}

async function openMayaInvestigationSection(page: Page): Promise<void> {
  await scrollToMayaCaseSection(page, "maya-case-detail-b3-investigation", "Maya investigation section");
  const drawer = page.getByTestId("maya-agent-investigation-drawer");
  if ((await drawer.getAttribute("data-state")) !== "open") {
    await drawer.getByTestId("maya-agent-investigation-trigger").click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-timeline"]', "Maya agent investigation timeline");
}

async function openMayaAgentTraceDepthDrawer(page: Page): Promise<void> {
  const drawer = page.getByTestId("maya-case-depth-drawer-audit-provenance");
  await drawer.scrollIntoViewIfNeeded();
  if (!(await hasVisibleLocator(page, '[data-testid="maya-agent-trace"]'))) {
    await drawer.getByTestId("maya-case-depth-drawer-trigger").click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya agent trace");
}

async function openMayaDraftReviewSection(page: Page): Promise<void> {
  await scrollToMayaCaseSection(page, "maya-case-detail-b6-outcome", "Maya draft review section");
  const drawer = page.getByTestId("maya-recovery-draft-review");
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya draft review");
  const trigger = drawer.getByTestId("maya-recommended-action-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-outcome-action-package"]', "Maya draft review action package");
}

async function openMayaAuditDepthDrawer(page: Page): Promise<void> {
  const drawer = page.getByTestId("maya-case-depth-drawer-audit-provenance");
  await drawer.scrollIntoViewIfNeeded();
  const trigger = drawer.getByTestId("maya-case-depth-drawer-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya audit confirmation");
}

async function markMayaEvidenceReviewed(page: Page): Promise<void> {
  await openMayaDraftReviewSection(page);
  const toggle = page.getByTestId("maya-evidence-reviewed-toggle");
  await toggle.scrollIntoViewIfNeeded();
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.waitForFunction(() => {
    return [...document.querySelectorAll<HTMLButtonElement>("button")].some(
      (button) => button.innerText.trim() === "Open approval" && !button.disabled && button.offsetParent !== null
    );
  }, { timeout: 5_000 });
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

async function assertMayaSinglePageCaseSkeleton(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => {
    const sectionIds = [
      "maya-case-detail-b1-stepper",
      "maya-case-detail-b2-dossier-head",
      "maya-case-detail-b3-investigation",
      "maya-case-detail-b4-evidence",
      "maya-case-detail-b5-verdict",
      "maya-case-detail-b6-outcome",
      "maya-case-detail-b7-depth-drawers"
    ];
    const drawerIds = [
      "maya-case-depth-drawer-audit-provenance"
    ];
    const sectionDisclosureSpecs = [
      {
        label: "Evidence retrieved",
        rootTestId: "maya-evidence-fact-cards",
        triggerTestId: "maya-evidence-fact-cards-trigger"
      },
      {
        label: "Recommended Action",
        rootTestId: "maya-recovery-draft-review",
        triggerTestId: "maya-recommended-action-trigger"
      }
    ];
    const workspace = document.querySelector<HTMLElement>('[data-testid="maya-case-workspace"]');
    if (workspace === null) {
      return {
        annotationArtifacts: ["maya-case-workspace missing"],
        bodyText: document.body.innerText,
        drawerCount: 0,
        drawers: [],
        liveDrawerIds: [],
        missingDrawerIds: drawerIds,
        ordered: false,
        roleTabCount: document.querySelectorAll('[role="tab"]').length,
        roleTablistCount: document.querySelectorAll('[role="tablist"]').length,
        sectionDisclosures: [],
        sectionIdsFound: [],
        unexpectedDrawerIds: []
      };
    }

    const sections: Array<HTMLElement | null> = sectionIds.map((sectionId) =>
      workspace.querySelector<HTMLElement>(`[data-testid="${sectionId}"]`)
    );
    let ordered = true;
    let previousSection: HTMLElement | undefined;
    for (const section of sections) {
      if (section === null) {
        ordered = false;
        break;
      }
      if (previousSection !== undefined && !(previousSection.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        ordered = false;
        break;
      }
      previousSection = section;
    }
    const drawers = drawerIds.map((drawerId) => {
      const drawer = workspace.querySelector<HTMLElement>(`[data-testid="${drawerId}"]`);
      const trigger = drawer?.querySelector<HTMLElement>('[data-testid="maya-case-depth-drawer-trigger"]') ?? null;
      const content = drawer?.querySelector<HTMLElement>('[data-slot="collapsible-content"]') ?? null;
      const rect = content?.getBoundingClientRect();

      return {
        contentState: content?.getAttribute("data-state") ?? "",
        contentVisible: content !== null && rect !== undefined && rect.width > 0 && rect.height > 0,
        drawerId,
        rootState: drawer?.getAttribute("data-state") ?? "",
        triggerExpanded: trigger?.getAttribute("aria-expanded") ?? "",
        triggerText: trigger?.innerText.replace(/\s+/gu, " ").trim() ?? ""
      };
    });
    const sectionDisclosures = sectionDisclosureSpecs.map((spec) => {
      const root = workspace.querySelector<HTMLElement>(`[data-testid="${spec.rootTestId}"]`);
      const trigger = root?.querySelector<HTMLElement>(`[data-testid="${spec.triggerTestId}"]`) ?? null;
      const content = root?.querySelector<HTMLElement>('[data-slot="collapsible-content"]') ?? null;
      const rect = content?.getBoundingClientRect();

      return {
        contentState: content?.getAttribute("data-state") ?? "",
        contentVisible: content !== null && rect !== undefined && rect.width > 0 && rect.height > 0,
        label: spec.label,
        rootState: root?.getAttribute("data-state") ?? "",
        triggerExpanded: trigger?.getAttribute("aria-expanded") ?? "",
        triggerText: trigger?.innerText.replace(/\s+/gu, " ").trim() ?? ""
      };
    });
    const depthDrawerContainer = workspace.querySelector<HTMLElement>(
      '[data-testid="maya-case-detail-b7-depth-drawers"]'
    );
    const liveDrawerNodes =
      depthDrawerContainer === null
        ? []
        : Array.from(depthDrawerContainer.children).filter(
            (child): child is HTMLElement =>
              child instanceof HTMLElement &&
              child.dataset.testid?.startsWith("maya-case-depth-drawer-") === true
          );
    const liveDrawerIds = liveDrawerNodes.map((node) => node.dataset.testid ?? "");
    const expectedDrawerIdSet = new Set(drawerIds);
    const missingDrawerIds = drawerIds.filter((drawerId) => !liveDrawerIds.includes(drawerId));
    const unexpectedDrawerIds = liveDrawerIds.filter((drawerId) => !expectedDrawerIdSet.has(drawerId));
    const annotationArtifacts = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((node) => node.innerText)
      .filter((text) =>
        /\{(?:item|doc|trace\[|path|curly|\w+\.)/u.test(text) ||
        /RENDER ONLY IF|PANEL\s+\d|B[1-7]\b/u.test(text)
      );

    return {
      annotationArtifacts,
      bodyText: document.body.innerText,
      drawerCount: liveDrawerIds.length,
      drawers,
      liveDrawerIds,
      missingDrawerIds,
      ordered,
      roleTabCount: document.querySelectorAll('[role="tab"]').length,
      roleTablistCount: document.querySelectorAll('[role="tablist"]').length,
      sectionDisclosures,
      sectionIdsFound: sections.map((section) => section?.dataset.testid ?? ""),
      unexpectedDrawerIds
    };
  });

  assert(result.roleTablistCount === 0, `${label} case detail must not expose a tablist in the browser DOM`);
  assert(result.roleTabCount === 0, `${label} case detail must not expose old tab controls in the browser DOM`);
  assert(result.ordered, `${label} case detail sections must render in B1 to B7 DOM order: ${result.sectionIdsFound.join(" > ")}`);
  assert(
    result.drawerCount === 1,
    `${label} case detail must render exactly one live depth drawer; saw ${String(result.drawerCount)}: ${result.liveDrawerIds.join(", ")}`
  );
  assert(
    result.unexpectedDrawerIds.length === 0,
    `${label} case detail rendered unexpected depth drawers: ${result.unexpectedDrawerIds.join(", ")}`
  );
  assert(
    result.missingDrawerIds.length === 0,
    `${label} case detail is missing expected depth drawers: ${result.missingDrawerIds.join(", ")}`
  );
  for (const drawer of result.drawers) {
    assert(drawer.rootState === "closed", `${label} ${drawer.drawerId} must start data-state=closed; saw ${drawer.rootState}`);
    assert(drawer.triggerExpanded === "false", `${label} ${drawer.drawerId} trigger must start aria-expanded=false`);
    assert(drawer.contentState === "closed", `${label} ${drawer.drawerId} content must start data-state=closed; saw ${drawer.contentState}`);
    assert(!drawer.contentVisible, `${label} ${drawer.drawerId} collapsed content must not be visible`);
    assert(
      /^[^.]+(?:\u00b7|\u00c2\u00b7)[^.]+$/u.test(drawer.triggerText),
      `${label} ${drawer.drawerId} trigger must be fact-bearing only; saw "${drawer.triggerText}"`
    );
  }
  for (const disclosure of result.sectionDisclosures) {
    assert(disclosure.rootState === "closed", `${label} ${disclosure.label} drawer must start data-state=closed; saw ${disclosure.rootState}`);
    assert(disclosure.triggerExpanded === "false", `${label} ${disclosure.label} trigger must start aria-expanded=false`);
    assert(
      disclosure.contentState === "closed",
      `${label} ${disclosure.label} content must start data-state=closed; saw ${disclosure.contentState}`
    );
    assert(!disclosure.contentVisible, `${label} ${disclosure.label} collapsed content must not be visible`);
    assert(
      disclosure.triggerText.includes(disclosure.label),
      `${label} ${disclosure.label} trigger must keep the visible drawer label; saw "${disclosure.triggerText}"`
    );
  }
  assert(!/\bdata proof\b|\bdecision proof\b/iu.test(result.bodyText), `${label} must not expose data/decision proof chips in the header`);
  assert(
    result.annotationArtifacts.length === 0,
    `${label} must not render blueprint annotation artifacts: ${result.annotationArtifacts.slice(0, 3).join(" | ")}`
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
      runDateGapExists: runDateGap !== null,
      runDateText: runDateGap?.innerText.trim() ?? "",
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
  assert(!header.runDateGapExists, `${label} header must omit unavailable run-date contract gap copy`);
  assert(header.runDateText.length === 0, `${label} header must not render unavailable run-date text`);
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
      hasContractGapAffordance: contractGap?.innerText.includes("Evidence details") ?? false,
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
  assert(result.text.includes(expectedRow.workItemLabel), `${label} target row must show backend Work item ${expectedRow.workItemLabel}`);
  assert(!result.text.includes(expectedRow.lineId), `${label} target row must not expose raw backend line IDs as primary copy`);
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
    return button.getAttribute("data-sort-state") ?? "";
  });
  assert(
    customerSortState === "ascending" || customerSortState === "descending",
    `${label} customer sort must update data-sort-state after click: ${customerSortState}`
  );

  const invalidRows = model.worklist.filter((item) => item.verdict === "invalid");
  if (invalidRows.length > 0) {
    await expectVisibleLocator(page, '[data-testid="maya-overview-verdict-filter"]', `${label} verdict quick filters`);
    await page.locator('[data-testid="maya-overview-verdict-filter"] [data-filter="invalid"]').click();
    await page.waitForFunction((expectedCount) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-overview-case-concentration-row"]')].filter(
        (row) => row.offsetParent !== null
      );

      return rows.length === expectedCount && rows.every((row) => row.getAttribute("data-verdict") === "invalid");
    }, invalidRows.length);
    const invalidFilterText = await page.locator('[data-testid="maya-overview-concentration-band"]').innerText();
    assert(
      invalidFilterText.includes(`Showing ${invalidRows.length.toString()} of ${model.worklist.length.toString()} cases`),
      `${label} invalid quick filter must update the visible row count`
    );
    await page.locator('[data-testid="maya-overview-verdict-filter"] [data-filter="all"]').click();
    await page.waitForFunction((expectedCount) => {
      return (
        [...document.querySelectorAll<HTMLElement>('[data-testid="maya-overview-case-concentration-row"]')].filter(
          (row) => row.offsetParent !== null
        ).length === expectedCount
      );
    }, model.worklist.length);
  }

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
    sidebar.footerBottom >= sidebar.documentHeight - 72,
    `${label} sidebar user identity must sit at the bottom of the full rail: ${String(sidebar.footerBottom)}px < ${String(
      sidebar.documentHeight
    )}px`
  );
  assert(sidebar.brandHeight >= 54, `${label} sidebar brand lockup must have stronger presence`);
  assert(sidebar.collapseVisible, `${label} sidebar must expose a working collapse affordance`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Overview")), `${label} sidebar must expose Overview`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Worklist")), `${label} sidebar must expose Worklist`);
  assert(sidebar.navLabels.some((navLabel) => navLabel.includes("Approvals")), `${label} sidebar must expose Approvals`);
  assert(sidebar.navCount >= 3, `${label} sidebar must keep the actual Maya section map`);
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
  assert(result.paneText.includes(expectedRow.workItemLabel), `${label} pane must summarize selected row Work item`);
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
  model: ForensicsSelectedEvidenceContext,
  expectedRow: ForensicsE2EModel["worklist"][number],
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-case-workspace"]', "Maya Beat 4 case workspace");
  await expectVisibleLocator(page, '[data-testid="maya-case-worklist-rail"]', "Maya Beat 4 worklist rail");
  await expectVisibleLocator(page, '[data-testid="maya-case-overview"]', "Maya Beat 4 overview tab");
  const primaryRecordIds = evidenceRecordIdsExcludingSelectedLine(model);
  const basisDocumentId = firstItem(model.selected.evidencePack.documents, "selected evidence documents").documentId;

  const result = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[data-testid="maya-case-workspace"]');
    const overview = document.querySelector<HTMLElement>('[data-testid="maya-case-overview"]');
    const rail = document.querySelector<HTMLElement>('[data-testid="maya-case-worklist-rail"]');
    const selectedRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-worklist-row"][aria-selected="true"]')].filter(
      (row) => row.offsetParent !== null
    );
    const amount = document.querySelector<HTMLElement>('[data-testid="maya-case-overview-readonly-amount"]');
    const basis = document.querySelector<HTMLElement>('[data-testid="maya-case-deterministic-basis"]');

    return {
      amountReadOnly: amount?.getAttribute("aria-readonly") ?? "",
      overviewText: overview?.innerText ?? "",
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
  assert(result.overviewText.includes(expectedRow.workItemLabel), "Beat 4 workspace must use backend Work item label");
  assert(result.overviewText.includes(expectedRow.customerLabel), "Beat 4 workspace must use backend customer label");
  assert(result.overviewText.includes(expectedRow.amount), "Beat 4 workspace must use backend amount string");
  assert(result.overviewText.includes(expectedRow.verdictLabel), "Beat 4 workspace must use backend verdict label");
  assert(result.text.includes(expectedRow.recommendedActionLabel), "Beat 4 outcome must use backend recommended action label");
  assert(result.overviewText.includes(expectedRow.queueLabel), "Beat 4 workspace must use backend queue label");
  for (const recordId of primaryRecordIds) {
    assert(
      !result.overviewText.includes(recordId),
      `Beat 4 overview copy must keep backend record ID ${recordId} out of primary overview copy`
    );
  }
  await page.getByTestId("maya-case-detail-b5-verdict").scrollIntoViewIfNeeded();
  const basisSourceDetailsText = await page.locator('[data-testid="maya-deterministic-basis-document-details"]').innerText();
  assert(basisSourceDetailsText.includes(basisDocumentId), "Beat 4 basis evidence details must retain backend document IDs");
  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 4 outcome must keep the backend action label");
  assert(result.usesBasis.includes(expectedRow.reason), "Beat 4 verdict band must keep the backend worklist reason");
  assert(
    !result.text.includes(model.selected.draft.actionId),
    "Beat 4 case detail must not expose raw backend action IDs as business copy"
  );
  assert(
    !result.overviewText.includes(model.selected.draft.actionId),
    "Beat 4 overview must not expose raw backend action IDs as business copy"
  );
  assert(
    !result.overviewText.includes("Action type") && !result.usesBasis.includes("Action type"),
    "Beat 4 overview must not render raw action-type business labels"
  );
  assert(
    !result.overviewText.includes("External action locked") &&
      !result.overviewText.includes("View draft") &&
      !result.overviewText.includes("Approval locked") &&
      !result.overviewText.includes("More actions"),
    "Beat 4 overview must not expose disabled command/action copy"
  );
  assert(result.amountReadOnly === "true", "Beat 4 amount block must be marked read-only");
  assert(result.text.includes("Human approval required"), "Beat 4 outcome must present the human approval posture");
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
  model: ForensicsSelectedEvidenceContext,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya Beat 4 Draft section");
  await expectVisibleLocator(page, '[data-testid="maya-outcome-action-package"]', "Maya Beat 4 action package");
  await expectVisibleLocator(page, '[data-testid="maya-draft-letter-preview"]', "Maya Beat 4 draft letter preview");
  const primaryRecordIds = evidenceRecordIdsExcludingSelectedLine(model);

  const result = await page.evaluate(() => {
    const draft = document.querySelector<HTMLElement>('[data-testid="maya-recovery-draft-review"]');
    const primaryDraft = draft?.cloneNode(true) as HTMLElement | undefined;
    primaryDraft
      ?.querySelectorAll(
        '[data-testid="maya-draft-source-details"], [data-testid="maya-draft-letter-preview"], [data-testid="maya-draft-message-section"]'
      )
      .forEach((node) => {
        node.remove();
      });
    const buttons = [...(draft?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map(
      (button) => button.innerText.trim() || button.getAttribute("aria-label") || ""
    );

    return {
      buttonLabels: buttons,
      primaryText: primaryDraft?.textContent ?? "",
      text: draft?.innerText ?? ""
    };
  });

  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 4 Draft section must keep the backend action label");
  assert(result.text.includes(model.selected.draft.statusLabel), "Beat 4 Draft section must keep the backend status label");
  assert(result.text.includes(model.selected.draft.amount), "Beat 4 Draft section must keep the backend amount");
  assert(result.text.includes(model.selected.draft.basis), "Beat 4 Draft section must keep the backend deterministic basis");
  for (const recordId of primaryRecordIds) {
    assert(!result.primaryText.includes(recordId), `Beat 4 Draft section must keep backend record ID ${recordId} out of primary draft copy`);
  }
  await page.locator('[data-testid="maya-draft-source-details"]').getByRole("button", { name: /^Details$/u }).click();
  const draftSourceDetailsText = await page.locator('[data-testid="maya-draft-source-details"]').innerText();
  assert(draftSourceDetailsText.includes(model.selected.lineId), "Beat 4 Draft evidence details must retain backend record IDs");
  assert(result.text.includes("Recommended Action"), "Beat 4 Draft section must use current recommended-action package copy");
  assert(result.text.includes("Draft letter preview"), "Beat 4 Draft section must expose the prepared email draft preview");
  assert(!result.text.includes("Action ID"), "Beat 4 Draft section must not expose raw Action ID labels");
  assert(!result.text.includes("Action type"), "Beat 4 Draft section must not expose raw Action type labels");
  assert(!result.text.includes("draft-rebill"), "Beat 4 Draft section must not expose raw draft-rebill metadata");
  assert(
    !result.text.includes(model.selected.draft.actionId),
    "Beat 4 Draft section must not expose raw backend action IDs as business copy"
  );
  assert(
    !/\b(?:approve draft|preview draft|route for approval|send draft|modify)\b/iu.test(result.buttonLabels.join(" ")),
    "Beat 4 Draft section must not expose raw approval-submit or legacy command copy"
  );
  assert(forbiddenRequests.length === 0, `Beat 4 Draft section must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat9DraftReviewFidelity(
  page: Page,
  model: ForensicsSelectedEvidenceContext,
  selectedRow: ForensicsE2EModel["worklist"][number],
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya Beat 9 draft review");
  await expectVisibleLocator(page, '[data-testid="maya-draft-hitl-warning"]', "Maya Beat 9 HITL warning");
  await expectVisibleLocator(page, '[data-testid="maya-outcome-action-packages"]', "Maya Beat 9 outcome action packages");
  await expectVisibleLocator(page, '[data-testid="maya-outcome-action-package"]', "Maya Beat 9 outcome action package");
  await expectVisibleLocator(page, '[data-testid="maya-draft-letter-preview"]', "Maya Beat 9 draft letter preview");
  await expectVisibleLocator(page, '[data-testid="maya-draft-rail-human-decisions"]', "Maya Beat 9 human decisions rail");
  await expectVisibleLocator(page, '[data-testid="maya-draft-command-bar"]', "Maya Beat 9 command bar");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-reviewed-toggle"]', "Maya Beat 9 evidence reviewed gate");
  const primaryRecordIds = evidenceRecordIdsExcludingSelectedLine(model);

  const result = await page.evaluate(() => {
    const draft = document.querySelector<HTMLElement>('[data-testid="maya-recovery-draft-review"]');
    const actionPackages = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-outcome-action-package"]')];
    const draftPreviews = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-draft-letter-preview"]')];
    const primaryDraft = draft?.cloneNode(true) as HTMLElement | undefined;
    primaryDraft
      ?.querySelectorAll(
        '[data-testid="maya-draft-source-details"], [data-testid="maya-draft-letter-preview"], [data-testid="maya-draft-message-section"]'
      )
      .forEach((node) => {
        node.remove();
      });
    const buttons = [...(draft?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => ({
      disabled: button.disabled,
      label: button.innerText.trim() || button.getAttribute("aria-label") || ""
    }));
    const editableInputs = draft?.querySelectorAll("textarea, select, [contenteditable='true'], input:not([type='checkbox'])") ?? [];

    return {
      actionPackageCount: actionPackages.length,
      buttonLabels: buttons.map((button) => button.label),
      disabledButtonLabels: buttons.filter((button) => button.disabled).map((button) => button.label),
      draftPreviewCount: draftPreviews.length,
      editableInputCount: editableInputs.length,
      primaryText: primaryDraft?.textContent ?? "",
      text: draft?.innerText ?? ""
    };
  });

  assert(result.text.includes("Recommended Action"), "Beat 9 must show the recommended-action title");
  assert(result.text.includes("Human approval required"), "Beat 9 must show the human-approval gate");
  assert(result.text.includes("External send gated"), "Beat 9 must keep HITL posture visible");
  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 9 must render the backend draft label");
  assert(result.text.includes(model.selected.draft.statusLabel), "Beat 9 must render the backend draft status");
  assert(result.text.includes(model.selected.draft.amount), "Beat 9 must render the backend draft amount");
  assert(result.text.includes(model.selected.draft.basis), "Beat 9 must render the backend draft basis");
  for (const selectedRecordId of primaryRecordIds) {
    assert(
      !result.primaryText.includes(selectedRecordId),
      `Beat 9 must keep backend record ID ${selectedRecordId} out of primary draft copy`
    );
  }
  assert(result.text.includes("Gate"), "Beat 9 must show the draft gate section");
  assert(result.text.includes("Approval review"), "Beat 9 must show the backend approval decision option");
  assert(result.text.includes("Change request"), "Beat 9 must show the backend change-request decision option");
  assert(result.text.includes("Rejection review"), "Beat 9 must show the backend rejection decision option");
  await page.locator('[data-testid="maya-draft-source-details"]').getByRole("button", { name: /^Details$/u }).click();
  const draftRecordDetailsText = await page.locator('[data-testid="maya-draft-source-details"]').innerText();
  assert(draftRecordDetailsText.includes(model.selected.lineId), "Beat 9 draft evidence details must retain backend record IDs");
  assert(result.text.includes(selectedRow.customerLabel), "Beat 9 draft preview must use the selected worklist customer label");
  assert(!result.text.includes(selectedRow.lineId), "Beat 9 draft preview must keep raw selected line IDs out of primary copy");
  assert(result.text.includes("Selected case line"), "Beat 9 draft preview must use business selected-line copy");
  assert(result.text.includes(selectedRow.reason), "Beat 9 draft preview must use the real agent reason");
  assert(result.actionPackageCount > 0, "Beat 9 must render at least one backend action package");
  assert(result.draftPreviewCount > 0, "Beat 9 must render at least one real draft preview");
  assert(result.editableInputCount === 0, "Beat 9 must not render editable draft fields before the approval dialog");
  assert(!result.buttonLabels.includes("Request changes"), "Beat 9 must not expose caption-only Request changes controls");
  assert(!result.buttonLabels.includes("Reject draft"), "Beat 9 must not expose caption-only Reject draft controls");
  assert(result.buttonLabels.includes("Open approval"), "Beat 9 must expose an Open approval affordance");
  assert(result.disabledButtonLabels.includes("Open approval"), "Beat 9 Open approval must stay disabled until evidence is marked reviewed");
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
  model: ForensicsSelectedEvidenceContext,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya Beat 10 approval dialog");
  await expectVisibleText(page, "Approve");
  await expectVisibleText(page, "Review the case facts and record your decision");
  await expectVisibleText(page, "Details");
  await expectVisibleText(page, model.selected.draft.actionLabel);
  await expectVisibleText(page, model.selected.draft.basis);
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const approvalSourceDetails = page.locator('[data-testid="maya-approval-details"]');
  await approvalSourceDetails.getByRole("button", { name: /^Details$/u }).click();
  const approvalSourceDetailsText = await approvalSourceDetails.innerText();
  assert(approvalSourceDetailsText.includes(recordId), "Beat 10 approval evidence details must retain backend record IDs");

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
  assert(result.buttonLabels.includes("Close approval dialog"), "Beat 10 must expose icon-only close");
  assert(result.text.includes("Reason required"), "Beat 10 must keep reason-required state visible");
  assert(result.text.includes("Review the case facts and record your decision"), "Beat 10 must show approval purpose copy");
  assert(result.text.includes("Email remains locked until an approved decision is returned"), "Beat 10 must show audit posture in details");
  assert(!/Verified human principal unavailable|Approval owner pending|Opening this dialog does not dispatch anything/u.test(result.text), "Beat 10 must not show deprecated approval copy");
  assert(result.noteCounterText === "0 / 500", "Beat 10 note field must show a 500-character counter");
  assert(result.textareaCount === 1, "Beat 10 must render exactly one note/reason textarea");
  assert(!/\b(?:3 of 3|Reviewed|Maya Patel|auditEntryHash|APPROVAL-HASH|dispatch success|sent to customer)\b/u.test(result.text), "Beat 10 must not invent reviewed, approver, audit, or dispatch state");
  assert(forbiddenRequests.length === 0, `Beat 10 open path must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat11AuditConfirmationFidelity(
  page: Page,
  model: ForensicsSelectedEvidenceContext,
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
    .getByRole("button", { name: /^Selected action evidence details$/u })
    .click();
  const selectedActionSourceDetailsText = await page
    .locator('[data-testid="maya-audit-selected-action-source-details"]')
    .innerText();
  assert(selectedActionSourceDetailsText.includes(selectedRecordId), "Beat 11 selected action evidence details must retain record IDs");
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
  assert(result.pageText.includes(expectedRow.workItemLabel), "Beat 12 table must use the returned work-item Work item");
  assert(result.pageText.includes(expectedRow.amount), "Beat 12 table must show source amount string");
  assert(!result.tableText.includes(expectedRow.lineId), "Beat 12 returned worklist table must keep raw backend line IDs out of primary copy");
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
  model: ForensicsSelectedEvidenceContext,
  connectors: ConnectorE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya Beat 5 evidence fact cards");
  await expectVisibleLocator(page, '[data-testid="maya-deterministic-basis-band"]', "Maya Beat 5 deterministic basis band");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const proxyTile = connectors.sourceTiles.find((source) => source.modeLabel === "Proxy - Supabase");
  const firstProvenanceTrigger = page.getByTestId("maya-evidence-provenance-trigger").first();
  if ((await firstProvenanceTrigger.getAttribute("aria-expanded")) !== "true") {
    await firstProvenanceTrigger.click();
  }
  const auditDrawer = page.getByTestId("maya-case-depth-drawer-audit-provenance");
  await auditDrawer.scrollIntoViewIfNeeded();
  const auditTrigger = auditDrawer.getByTestId("maya-case-depth-drawer-trigger");
  if ((await auditTrigger.getAttribute("aria-expanded")) !== "true") {
    await auditTrigger.click();
  }

  const result = await page.evaluate(() => {
    const evidenceSurface = document.querySelector<HTMLElement>('[data-testid="maya-evidence-fact-cards"]');
    const basisBand = document.querySelector<HTMLElement>('[data-testid="maya-deterministic-basis-band"]');
    const auditDrawer = document.querySelector<HTMLElement>('[data-testid="maya-case-depth-drawer-audit-provenance"]');
    const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-fact-card"]')];
    const primaryRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-fact-row"]')].map((row) => ({
      label: row.dataset.label ?? "",
      value: row.dataset.value ?? ""
    }));
    const provenanceRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-provenance-row"]')].map((row) => ({
      label: row.dataset.label ?? "",
      value: row.dataset.value ?? ""
    }));

    return {
      auditText: auditDrawer?.innerText ?? "",
      basisText: basisBand?.innerText ?? "",
      evidenceText: evidenceSurface?.innerText ?? "",
      primaryRows,
      provenanceRows,
      rowCount: cards.length
    };
  });

  assert(result.rowCount === model.selected.evidencePack.documents.length, "Beat 5 must render one row per backend evidence document");
  assert(result.primaryRows.some((row) => row.label === "Document"), "Beat 5 evidence fact cards must expose Document as a primary row");
  assert(result.primaryRows.some((row) => row.label === "Source"), "Beat 5 evidence fact cards must expose Source as a primary row");
  assert(result.primaryRows.some((row) => row.label === "Status"), "Beat 5 evidence fact cards must expose Status as a primary row");
  assert(!result.evidenceText.includes("Backend evidence packet"), "Beat 5 must not use backend packet copy as primary evidence language");
  assert(!result.evidenceText.includes("Evidence dossier available"), "Beat 5 must not keep the removed dossier status copy");
  assert(result.basisText.includes(model.selected.draft.basis), "Beat 5 must show backend deterministic basis text");
  assert(result.basisText.includes(model.selected.draft.statusLabel), "Beat 5 must label draft status as draft/HITL state only");
  assert(
    result.provenanceRows.some((row) => row.value === evidenceDocument.citationId),
    "Beat 5 must keep backend citation IDs in the details disclosure"
  );
  assert(
    result.provenanceRows.some((row) => row.value === evidenceDocument.documentId),
    "Beat 5 must keep backend document IDs in the details disclosure"
  );
  assert(
    result.evidenceText.includes(evidenceBusinessLabelForDocumentType(evidenceDocument.documentType)),
    "Beat 5 must show the business document label derived from backend document type"
  );
  assert(result.evidenceText.includes(evidenceDocument.sourceLabel), "Beat 5 must show backend source labels");
  assert(result.evidenceText.includes(evidenceDocument.verifiedLabel), "Beat 5 must show backend verification labels");
  assert(result.provenanceRows.some((row) => row.value === evidenceDocument.relevance), "Beat 5 must keep backend relevance labels in details");
  assert(
    !/\b(?:pod reviewed|review satisfied|evidence review satisfied|all criteria satisfied|3 of 3|source verified by API|auto recover|auto approve|send|execute|write back|recovered|cleared by AI)\b/iu.test(
      result.evidenceText
    ),
    "Beat 5 must not render unsupported review completion or external-action copy"
  );
  assert(
    !/\b(?:Delivery and Proof of Delivery|Shipment Details|Inventory and Shortage Claim|Communications|Adjustments and Financials)\b/u.test(
      result.evidenceText
    ),
    "Beat 5 must not render mockup-only evidence pod names"
  );

  if (proxyTile !== undefined) {
    assert(result.auditText.includes(proxyTile.label), `Beat 5 audit provenance must include ${proxyTile.label}`);
    assert(
      result.auditText.includes(proxyTile.statusTone),
      `Beat 5 must keep ${proxyTile.label} on backend status tone ${proxyTile.statusTone}`
    );
    assert(!result.auditText.includes("Live read"), `Beat 5 must not relabel ${proxyTile.label} as live`);
  }

  assert(forbiddenRequests.length === 0, `Beat 5 must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat6QueryStartFidelity(
  page: Page,
  model: ForensicsSelectedEvidenceContext,
  localQuestion: string,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya Beat 6 evidence fact cards stay visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 6 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya Beat 6 query input");
  await expectVisibleLocator(page, '[data-testid="maya-query-selected-line"]', "Maya Beat 6 selected line");
  await expectVisibleLocator(page, '[data-testid="maya-query-readiness-preview"]', "Maya Beat 6 readiness preview");
  await expectVisibleLocator(page, '[data-testid="maya-selected-evidence-context"]', "Maya Beat 6 selected evidence context");
  await expectVisibleLocator(page, '[data-testid="maya-query-source-details"]', "Maya Beat 6 evidence details disclosure");
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
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /^Evidence details$/u });
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
  assert(result.text.includes("Case evidence"), "Beat 6 dock must describe selected evidence context honestly");
  assert(!result.text.includes("Client-selected case context"), "Beat 6 dock must not expose developer-facing selected-case copy");
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
  assert(result.selectedLine.includes("Selected case"), "Beat 6 must show business selected-case copy");
  assert(result.recordBadges.includes(recordId), "Beat 6 must show backend record ID badges in Evidence details");
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
  model: ForensicsSelectedEvidenceContext,
  localQuestion: string,
  forbiddenRequests: string[],
  backendQueryRequestCount: number
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya Beat 7 evidence fact cards stay visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 7 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-assistant-message"]', "Maya Beat 7 compact checking bubble");
  await expectVisibleLocator(page, '[data-testid="maya-query-trace-details"]', "Maya Beat 7 trace details disclosure");
  assert((await page.getByRole("button", { name: /^Ask by voice$/u }).count()) === 0, "Beat 7 must hide the voice button while a text query is in flight");
  const traceDetails = page.getByTestId("maya-query-trace-details");
  const traceDetailsTrigger = traceDetails.getByRole("button", { name: /^Trace details$/u });
  if ((await traceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await traceDetailsTrigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya Beat 7 agent trace details");
  await expectVisibleLocator(page, '[data-testid="maya-trace-running-session"]', "Maya Beat 7 running session row");
  await expectVisibleLocator(page, '[data-testid="maya-trace-running-skeleton"]', "Maya Beat 7 running skeleton");
  await expectVisibleLocator(page, '[data-testid="maya-selected-evidence-context"]', "Maya Beat 7 selected evidence context");
  await expectVisibleLocator(page, '[data-testid="maya-query-source-details"]', "Maya Beat 7 evidence details disclosure");
  await expectVisibleLocator(page, '[data-testid="maya-submitted-query"]', "Maya Beat 7 submitted query context");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const sourceDetails = page.getByTestId("maya-query-source-details");
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /^Evidence details$/u });
  if ((await sourceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await sourceDetailsTrigger.click();
  }

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const evidenceSurface = document.querySelector<HTMLElement>('[data-testid="maya-evidence-fact-cards"]');
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
      evidenceText: evidenceSurface?.innerText ?? "",
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
  assert(result.evidenceText.includes(evidenceBusinessLabelForDocumentType(evidenceDocument.documentType)), "Beat 7 must keep evidence document context visible");
  assert(result.evidenceText.includes(evidenceDocument.sourceLabel), "Beat 7 must keep backend evidence source labels visible");
  assert(result.submittedQuery.includes(localQuestion), "Beat 7 must show the local submitted query as query context");
  assert(result.checkingBubbleText.includes("Maya is checking evidence"), "Beat 7 must show compact evidence-checking copy");
  assert(result.runningStatus === "connecting", "Beat 7 running row must be tied to the session connecting state");
  assert(result.sourceRecordBadges.includes(recordId), "Beat 7 evidence details must keep selected evidence record badges visible");
  assert(result.selectedContextText.includes("Case evidence packet"), "Beat 7 must promote case evidence context in the dock");
  assert(result.selectedContextText.includes("Selected case"), "Beat 7 selected evidence context must use business selected-case copy");
  for (const selectedRecordId of model.selected.evidencePack.recordIds) {
    if (selectedRecordId !== model.selected.lineId) {
      assert(
        !normalizeRenderedText(result.selectedContextText).includes(normalizeRenderedText(selectedRecordId)),
        `Beat 7 compact selected evidence context leaked raw backend recordId ${selectedRecordId}`
      );
    }
    assert(result.sourceRecordBadges.includes(selectedRecordId), `Beat 7 evidence details must include ${selectedRecordId}`);
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
  await openMayaInvestigationSection(page);
  await openMayaAgentTraceDepthDrawer(page);
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
  model: ForensicsSelectedEvidenceContext,
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
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya Beat 8 evidence fact cards stay visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 8 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya Beat 8 persistent query input");
  await expectVisibleLocator(page, '[data-testid="maya-query-assistant-message"]', "Maya Beat 8 assistant answer bubble");
  await expectVisibleLocator(page, '[data-testid="maya-copilot-verdict-band"]', "Maya Beat 8 Copilot verdict band");
  await expectVisibleLocator(page, '[data-testid="maya-copilot-citations-drawer"]', "Maya Beat 8 citations drawer");
  await expectVisibleLocator(page, '[data-testid="maya-copilot-trace-drawer"]', "Maya Beat 8 trace drawer");
  await expectVisibleLocator(page, '[data-testid="maya-copilot-model-drawer"]', "Maya Beat 8 model execution drawer");
  await expectVisibleLocator(page, 'button[aria-label="Ask by voice"]', "Maya Beat 8 completed answer voice button");
  const citationsDrawer = page.getByTestId("maya-copilot-citations-drawer");
  const traceDrawer = page.getByTestId("maya-copilot-trace-drawer");
  const modelDrawer = page.getByTestId("maya-copilot-model-drawer");
  assert(
    (await citationsDrawer.getByRole("button", { name: /^Citations/u }).getAttribute("aria-expanded")) !== "true",
    "Beat 8 citations drawer must be collapsed by default"
  );
  assert(
    (await traceDrawer.getByRole("button", { name: /^Trace/u }).getAttribute("aria-expanded")) !== "true",
    "Beat 8 trace drawer must be collapsed by default"
  );
  await citationsDrawer.getByRole("button", { name: /^Citations/u }).click();
  await modelDrawer.getByRole("button", { name: /^Model execution/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-query-citation-record"]', "Maya Beat 8 citation records");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const assistant = document.querySelector<HTMLElement>('[data-testid="maya-query-assistant-message"]');
    const modelDrawer = document.querySelector<HTMLElement>('[data-testid="maya-copilot-model-drawer"]');
    const verdictBand = document.querySelector<HTMLElement>('[data-testid="maya-copilot-verdict-band"]');
    const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const evidenceSurface = document.querySelector<HTMLElement>('[data-testid="maya-evidence-fact-cards"]');
    const composer = document.querySelector<HTMLElement>('[data-testid="maya-query-input"]');
    const submittedQuery = document.querySelector<HTMLElement>('[data-testid="maya-submitted-query"]')?.innerText ?? "";
    const citationRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-query-citation-record"]')].map((row) => ({
      recordId: row.innerText.trim(),
      text: row.innerText
    }));
    const buttons = [...(dock?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => button.innerText);
    const dockRect = dock?.getBoundingClientRect();

    return {
      assistantText: assistant?.innerText ?? "",
      buttons,
      citationRows,
      dockMode: dock?.dataset.answerMode ?? "",
      dockText: dock?.innerText ?? "",
      dockWidth: dockRect?.width ?? 0,
      evidenceText: evidenceSurface?.innerText ?? "",
      hasComposer: composer !== null,
      modelText: modelDrawer?.innerText ?? "",
      submittedQuery,
      text: assistant?.innerText ?? "",
      traceText: trace?.innerText ?? "",
      verdictText: verdictBand?.innerText ?? ""
    };
  });

  assert(backendQueryRequestCount === 1, "Beat 8 must request exactly one backend forensics query response");
  assert(result.hasComposer, "Beat 8 must keep the query composer available after a cited answer");
  assert(result.assistantText.includes(acceptedAnswer), "Beat 8 assistant bubble must render the backend/test accepted answer text");
  assert(result.modelText.includes(acceptedBasis), "Beat 8 model execution drawer must render the backend/test deterministic basis");
  assert(result.submittedQuery.includes(localQuestion), "Beat 8 must preserve the local submitted query context");
  assert(result.evidenceText.includes(evidenceBusinessLabelForDocumentType(evidenceDocument.documentType)), "Beat 8 must keep adjacent evidence context visible");
  assert(result.evidenceText.includes(evidenceDocument.sourceLabel), "Beat 8 must keep backend evidence source labels visible");
  assert(result.dockMode === "review", "Beat 8 answered state must promote the sheet into answer-review mode");
  assert(result.dockWidth >= 760, `Beat 8 answer-review mode must be wider than the query drawer: ${String(result.dockWidth)}px`);
  assert(result.dockText.includes("Complete"), "Beat 8 must label the accepted answered state as complete");
  assert(
    result.dockText.includes(`Citations`) && result.dockText.includes(`${String(model.selected.evidencePack.recordIds.length)} records`),
    "Beat 8 completed answer must expose citation count in the drawer trigger"
  );
  assert(!result.text.includes("No cited answer returned"), "Beat 8 must not show the blocked/no-answer state");
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
    assert(
      result.citationRows.some((row) => row.recordId.includes(recordId)),
      `Beat 8 citation drawer must show ${recordId}`
    );
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

async function assertBeat8VoiceQueryFidelity(
  page: Page,
  model: ForensicsSelectedEvidenceContext,
  localQuestion: string
): Promise<void> {
  const voiceAnswer = "E2E accepted cited voice answer from the realtime tool route.";
  const voiceBasis = "E2E deterministic basis from the realtime voice tool response.";
  const recordIds = model.selected.evidencePack.recordIds;
  const selectedLineId = model.selected.lineId;
  let voiceMode: "answered" | "blocked" = "answered";
  let releaseVoiceTool: (() => void) | undefined;
  let markVoiceToolStarted: (() => void) | undefined;
  let voiceToolStarted = new Promise<void>((resolve) => {
    markVoiceToolStarted = resolve;
  });
  const voiceRequests: string[] = [];

  await page.route("**/api/query/realtime-client-secret", async (route) => {
    const requestBody = parseOptionalJsonRecord(route.request().postData());
    voiceRequests.push("client-secret");
    assert(requestBody !== undefined, "Voice query client-secret request body must be JSON");
    assert(requestBody["question"] === localQuestion, "Voice query must reuse the typed Maya question");
    assert(requestBody["selectedLineId"] === selectedLineId, "Voice query must send the selected line id");
    assert(Array.isArray(requestBody["recordIds"]), "Voice query must send scoped record ids");
    for (const recordId of recordIds) {
      assert((requestBody["recordIds"] as unknown[]).includes(recordId), `Voice query must scope record ${recordId}`);
    }

    await route.fulfill({
      body: JSON.stringify({
        auditPolicy: {
          externalActions: "none",
          recordIds,
          retention: "Audit hashes and cited record ids only; no raw audio."
        },
        clientSecret: { value: "ek_e2e_voice_client_secret" },
        deterministicBasis: "E2E realtime client-secret proxy gate",
        model: "gpt-realtime-2",
        status: "issued",
        transport: "webrtc"
      }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route("https://api.openai.com/v1/realtime/calls", async (route) => {
    voiceRequests.push("sdp");
    await route.fulfill({
      body: "v=0\r\ns=e2e-voice-answer",
      contentType: "application/sdp",
      status: 200
    });
  });
  await page.route("**/api/query/realtime-tool", async (route) => {
    const requestBody = parseOptionalJsonRecord(route.request().postData());
    voiceRequests.push(`tool:${voiceMode}`);
    assert(requestBody !== undefined, "Voice query realtime-tool request body must be JSON");
    assert(requestBody["name"] === "query.answer", "Voice query may only bridge the query.answer realtime tool");
    const argumentsJson = typeof requestBody["argumentsJson"] === "string" ? requestBody["argumentsJson"] : "{}";
    const parsedArguments = parseOptionalJsonRecord(argumentsJson);
    assert(parsedArguments !== undefined, "Voice query tool arguments must be JSON");
    assert(parsedArguments["selectedLineId"] === selectedLineId, "Voice query tool args must retain selected line id");
    assert(Array.isArray(parsedArguments["recordIds"]), "Voice query tool args must retain scoped record ids");
    for (const recordId of recordIds) {
      assert((parsedArguments["recordIds"] as unknown[]).includes(recordId), `Voice query tool args must include ${recordId}`);
    }

    assert(markVoiceToolStarted !== undefined, "Voice query tool-start resolver must be initialized");
    markVoiceToolStarted();
    await new Promise<void>((resolve) => {
      releaseVoiceTool = resolve;
    });

    await route.fulfill({
      body: JSON.stringify({
        deterministicBasis: "E2E realtime tool allowlist + citation parity",
        output:
          voiceMode === "answered"
            ? {
                answer: voiceAnswer,
                citationParity: {
                  parity: "same_record_ids",
                  textRecordIds: recordIds,
                  voiceRecordIds: recordIds
                },
                deterministicBasis: voiceBasis,
                recordIds
              }
            : {
                answer: "This uncited voice output must not render as an answer.",
                deterministicBasis: voiceBasis,
                recordIds
              },
        recordIds,
        status: "ok",
        toolName: "query.answer"
      }),
      contentType: "application/json",
      status: 200
    });
  });

  try {
    await page.evaluate(() => {
      const runtime = (window as unknown as { __recoupE2ERealtime?: { denyMedia: boolean } }).__recoupE2ERealtime;
      if (runtime !== undefined) {
        runtime.denyMedia = true;
      }
    });
    await page.getByRole("button", { name: /^Ask by voice$/u }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Voice permission or session setup failed."), undefined, {
      timeout: 10_000
    });
    const deniedState = await page.evaluate(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-testid="maya-query-input"]');

      return {
        hasError: document.body.innerText.includes("Voice permission or session setup failed. Text query is still available."),
        inputDisabled: input?.disabled ?? true,
        voiceButtonVisible: [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Ask by voice"]')].some(
          (button) => button.offsetParent !== null
        )
      };
    });
    assert(deniedState.hasError, "Voice mic-denied state must render the one-line fallback notice");
    assert(!deniedState.inputDisabled, "Voice mic-denied state must keep text query input available");
    assert(deniedState.voiceButtonVisible, "Voice mic-denied state must leave the voice control recoverable");
    await page.evaluate(() => {
      const runtime = (window as unknown as { __recoupE2ERealtime?: { denyMedia: boolean } }).__recoupE2ERealtime;
      if (runtime !== undefined) {
        runtime.denyMedia = false;
      }
    });

    voiceMode = "blocked";
    voiceToolStarted = new Promise<void>((resolve) => {
      markVoiceToolStarted = resolve;
    });
    await page.getByRole("button", { name: /^Ask by voice$/u }).click();
    await Promise.race([
      voiceToolStarted,
      delay(10_000).then(() => {
        throw new Error("Beat 8 voice blocked query did not reach the realtime tool bridge.");
      })
    ]);
    await expectVisibleLocator(page, '[data-testid="maya-query-voice-recording-indicator"]', "Maya Beat 8 voice listening indicator");
    releaseVoiceTool?.();
    await page.waitForFunction(
      () => document.body.innerText.includes("Blocked cited Realtime answer without matching voice/text citation parity."),
      undefined,
      { timeout: 10_000 }
    );
    assert(
      !(await hasVisibleLocator(page, '[data-testid="maya-query-assistant-answer"]')),
      "Voice blocked/uncited output must not render as an assistant answer"
    );

    voiceMode = "answered";
    voiceToolStarted = new Promise<void>((resolve) => {
      markVoiceToolStarted = resolve;
    });
    await page.getByRole("button", { name: /^Ask by voice$/u }).click();
    await Promise.race([
      voiceToolStarted,
      delay(10_000).then(() => {
        throw new Error("Beat 8 voice cited query did not reach the realtime tool bridge.");
      })
    ]);
    await expectVisibleLocator(page, '[data-testid="maya-query-voice-recording-indicator"]', "Maya Beat 8 voice cited listening indicator");
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-08-voice-listening.png` });
    releaseVoiceTool?.();
    await page.waitForFunction(
      (answer) => document.querySelector<HTMLElement>('[data-testid="maya-query-assistant-answer"]')?.innerText.includes(answer) === true,
      voiceAnswer,
      { timeout: 10_000 }
    );
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-08-voice-answer.png` });
    const voiceCitationsDrawer = page.getByTestId("maya-copilot-citations-drawer");
    if ((await voiceCitationsDrawer.getByRole("button", { name: /^Citations/u }).getAttribute("aria-expanded")) !== "true") {
      await voiceCitationsDrawer.getByRole("button", { name: /^Citations/u }).click();
    }
    await expectVisibleLocator(page, '[data-testid="maya-query-citation-record"]', "Maya Beat 8 voice citation records");
    const answeredState = await page.evaluate((expectedRecordIds) => {
      const assistant = document.querySelector<HTMLElement>('[data-testid="maya-query-assistant-message"]');
      const citations = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-query-citation-record"]')].map((node) =>
        node.innerText.trim()
      );

      return {
        citationCount: citations.length,
        missingRecordIds: expectedRecordIds.filter((recordId) => !citations.some((citation) => citation.includes(recordId))),
        mode: assistant?.dataset.queryMode ?? "",
        text: assistant?.innerText ?? ""
      };
    }, recordIds);
    assert(answeredState.mode === "voice", `Voice answer must render in the Copilot story panel with data-query-mode=voice; saw ${answeredState.mode}`);
    assert(answeredState.text.includes(voiceAnswer), "Voice answer must render the cited realtime answer text");
    assert(answeredState.text.includes("Specialist checks complete"), "Voice answer must render the completed specialist checklist");
    assert(answeredState.citationCount >= 1, "Voice answer must retain at least one citation");
    assert(answeredState.missingRecordIds.length === 0, `Voice answer citations missing ${answeredState.missingRecordIds.join(", ")}`);

    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
    const teardown = await page.evaluate(() => {
      const runtime = (
        window as unknown as {
          __recoupE2ERealtime?: { mediaTrackStops: number; peerConnections: Array<{ closed?: boolean }> };
        }
      ).__recoupE2ERealtime;

      return {
        livePeerCount: runtime?.peerConnections.filter((peer) => peer.closed !== true).length ?? -1,
        mediaTrackStops: runtime?.mediaTrackStops ?? 0,
        peerCount: runtime?.peerConnections.length ?? 0
      };
    });
    assert(teardown.peerCount >= 2, "Voice proof must create fake peers for blocked and cited voice sessions");
    assert(teardown.livePeerCount === 0, `Voice dock close must leave zero live RTCPeerConnection objects; saw ${String(teardown.livePeerCount)}`);
    assert(teardown.mediaTrackStops >= 2, "Voice dock close must stop local microphone tracks for voice sessions");
    assert(
      voiceRequests.includes("client-secret") &&
        voiceRequests.includes("sdp") &&
        voiceRequests.includes("tool:blocked") &&
        voiceRequests.includes("tool:answered"),
      `Voice proof missed expected realtime calls: ${voiceRequests.join(", ")}`
    );
  } finally {
    releaseVoiceTool?.();
    await page.unroute("**/api/query/realtime-client-secret").catch(() => undefined);
    await page.unroute("https://api.openai.com/v1/realtime/calls").catch(() => undefined);
    await page.unroute("**/api/query/realtime-tool").catch(() => undefined);
  }
}

function buildE2EForensicsQueryResponse(
  model: ForensicsSelectedEvidenceContext,
  answer: string,
  deterministicBasis: string
) {
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

function selectedEvidenceContextForWorklistItem(
  model: ForensicsSelectedEvidenceContext,
  item: ForensicsE2EWorklistItem
): ForensicsSelectedEvidenceContext {
  return {
    selected: {
      ...model.selected,
      evidencePack: {
        documents: [],
        recordIds: [...item.lineIds]
      },
      lineId: item.lineId
    }
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

  if (tableName.startsWith("credit_")) {
    const rows = rowsForCreditRiskTable(loadCreditRiskFixtureRows(), tableName);
    return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
  }

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
    const customerIds = customerIdsFromPostgrestFilter(parsedUrl.searchParams.get("customer_id"));
    return Promise.resolve(new Response(JSON.stringify(toPostgrestSyntheticEvidenceRows(tableName, customerIds)), { status: 200 }));
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

function customerIdsFromPostgrestFilter(filter: string | null): readonly string[] | undefined {
  const normalized = filter?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (normalized.startsWith("eq.")) {
    return [normalized.slice("eq.".length)];
  }

  const inMatch = /^in\.\((.*)\)$/u.exec(normalized);
  if (inMatch === null) {
    return undefined;
  }

  const inFilterBody = inMatch[1];
  if (inFilterBody === undefined) {
    return undefined;
  }

  return inFilterBody
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/u)
    .map((value) => value.trim().replace(/^"|"$/gu, "").replace(/\\"/gu, '"'))
    .filter((value) => value.length > 0);
}

function toPostgrestSyntheticEvidenceRows(tableName: string, customerIds: readonly string[] | undefined): unknown[] {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const customerIdSet = customerIds === undefined ? undefined : new Set(customerIds);
  const lines = dataset.deductionLines.filter((line) => customerIdSet === undefined || customerIdSet.has(line.customerId));

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
    ].filter((row) => customerIdSet === undefined || customerIdSet.has(row.customer_id));
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

function evidenceRecordIdsExcludingSelectedLine(model: ForensicsSelectedEvidenceContext): string[] {
  return model.selected.evidencePack.recordIds.filter((recordId) => recordId !== model.selected.lineId);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function firstItem<T>(items: readonly T[], label: string): T {
  const item = items[0];
  assert(item !== undefined, `${label} must include at least one item`);

  return item;
}

function parseOptionalJsonRecord(value: string | null): Record<string, unknown> | undefined {
  if (value === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
