import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { chromium, type Browser, type BrowserContext, type Page, type Request as PlaywrightRequest } from "playwright";
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
    verdictLabel: string;
  }>;
  selected: {
    lineId: string;
    approvalActions: Array<{
      decision: "approve" | "modify" | "reject";
      label: string;
      requiresReason: boolean;
    }>;
    draft: {
      actionId: string;
      actionLabel: string;
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

interface ConnectorE2EModel {
  sourceTiles: Array<{
    key: string;
    label: string;
    modeLabel: string;
    stateLabel: string;
    statusTone: "ready" | "synthetic" | "blocked";
    summary: string;
  }>;
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
    if (options.mayaLoginOnly) {
      await captureMayaLoginBeatScreenshot(browser);
      console.log(`Maya Beat 1 login screenshot written to ${outputDir}/maya-beat-01-login.png`);
      return;
    }
    if (options.mayaShadcnOnly) {
      await captureMayaLoginBeatScreenshot(browser);
      if (process.argv.includes("--maya-refresh-prior-shadcn-beats")) {
        await captureMayaBeat2LandingScreenshot(browser);
        await captureMayaBeat3RecommendedActionScreenshot(browser);
        await captureMayaBeat4CaseOverviewScreenshot(browser);
        await captureMayaBeat5EvidenceDossierScreenshot(browser);
      }
      await captureMayaBeat6QueryStartScreenshot(browser);
      await captureMayaBeat7AgentTraceScreenshot(browser);
      await captureMayaBeat8CitedAnswerScreenshot(browser);
      await captureMayaBeat9DraftReviewScreenshot(browser);
      await captureMayaBeat10HumanApprovalScreenshot(browser);
      await captureMayaBeat11AuditConfirmationScreenshot(browser);
      console.log(
        `Maya Beat 1 through Beat 11 checked; screenshots written to ${outputDir}/maya-beat-01-login.png, ${outputDir}/maya-beat-06-query-start.png, ${outputDir}/maya-beat-07-agent-trace.png, ${outputDir}/maya-beat-08-cited-answer.png, ${outputDir}/maya-beat-09-draft-review.png, ${outputDir}/maya-beat-10-human-approval.png, ${outputDir}/maya-beat-11-audit-confirmation.png`
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
  await mayaPage.waitForURL("**/forensics/shadcn", { timeout: 15_000 });
  assert(mayaPage.url().endsWith("/forensics/shadcn"), "Maya must be redirected away from /credit");
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

async function captureMayaBeat2LandingScreenshot(browser: Browser): Promise<void> {
  for (const target of [
    { height: 1024, label: "", width: 1600 },
    { height: 900, label: "-1440", width: 1440 },
    { height: 900, label: "-1280", width: 1280 }
  ]) {
    const context = await newRoleContext(browser, "maya", target.width, target.height);
    const page = await context.newPage();

    try {
      await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
      await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
      await expectVisibleText(page, "Source Readiness");
      await expectVisibleText(page, "Deduction Worklist");
      await assertNoHorizontalOverflow(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertNoClippedBeat2Chips(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2HeaderFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2WorklistFit(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2SidebarFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2RightPaneFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
      await assertBeat2SourceReadinessFidelity(page, `Maya Beat 2 ${String(target.width)}px`);
      await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-02-dashboard${target.label}.png` });
      await page.getByTestId("maya-worklist-row").first().click();
      await expectVisibleLocator(page, '[data-testid="maya-selected-work-item"]', "Maya selected work-item pane");
    } finally {
      await context.close();
    }
  }
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
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 4 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
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
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 5 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
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
    await expectVisibleText(page, "Source Readiness");
    await expectVisibleText(page, "Deduction Worklist");
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 6 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
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
  let releaseClientSecretRequest: (() => void) | undefined;
  let clientSecretRequestCount = 0;
  const clientSecretRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/query/realtime-client-secret", async (route) => {
      clientSecretRequestCount += 1;
      resolve();
      await new Promise<void>((release) => {
        releaseClientSecretRequest = release;
      });
      await route.fulfill({
        body: JSON.stringify({
          auditPolicy: {
            externalActions: "none",
            recordIds: model.selected.evidencePack.recordIds,
            retention: "e2e-beat-7"
          },
          status: "blocked_missing_credentials"
        }),
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
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 7 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Evidence/u }).click();
    await assertBeat5EvidenceDossierFidelity(page, model, connectors, forbiddenRequests);
    await page.getByRole("button", { name: /^Query evidence$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 7 query dock");
    await page.getByTestId("maya-query-input").fill(localQuestion);
    await assertBeat6QueryStartFidelity(page, model, localQuestion, forbiddenRequests);
    await page.getByRole("button", { name: /^Run query$/u }).click();
    await clientSecretRequestStarted;
    await assertBeat7AgentTraceInProgressFidelity(page, model, localQuestion, forbiddenRequests, clientSecretRequestCount);
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-07-agent-trace.png` });
  } finally {
    releaseClientSecretRequest?.();
    await page.unroute("**/api/query/realtime-client-secret");
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
  const acceptedAnswer = "E2E accepted cited answer from the realtime helper boundary.";
  const acceptedBasis = "E2E deterministic basis from the query.answer tool response.";
  let clientSecretRequestCount = 0;
  let realtimeSdpRequestCount = 0;
  let realtimeToolRequestCount = 0;
  let browserRuntimeProbe: unknown;
  const browserErrors: string[] = [];
  const browserWarnings: string[] = [];

  await page.route("**/api/query/realtime-client-secret", async (route) => {
    clientSecretRequestCount += 1;
    await route.fulfill({
      body: JSON.stringify({
        auditPolicy: {
          externalActions: "none",
          recordIds: model.selected.evidencePack.recordIds,
          retention: "e2e-beat-8"
        },
        clientSecret: { value: "ek_e2e_cited_answer" },
        deterministicBasis: "E2E credential gate issued by cockpit proxy.",
        model: "gpt-realtime-2",
        status: "issued",
        transport: "webrtc"
      }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route("https://api.openai.com/v1/realtime/calls", async (route) => {
    realtimeSdpRequestCount += 1;
    await route.fulfill({
      body: "v=0\r\ns=e2e-answer",
      contentType: "application/sdp",
      status: 200
    });
  });
  await page.route("**/api/query/realtime-tool", async (route) => {
    realtimeToolRequestCount += 1;
    const payload = (await route.request().postDataJSON()) as { name?: string };
    await route.fulfill({
      body: JSON.stringify({
        deterministicBasis: acceptedBasis,
        output: {
          answer: acceptedAnswer,
          citationParity: {
            parity: "same_record_ids",
            textRecordIds: model.selected.evidencePack.recordIds,
            voiceRecordIds: model.selected.evidencePack.recordIds
          },
          deterministicBasis: acceptedBasis,
          recordIds: model.selected.evidencePack.recordIds
        },
        recordIds: model.selected.evidencePack.recordIds,
        status: "ok",
        toolName: payload.name ?? "query.answer"
      }),
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
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 8 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
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
            clientSecretRequestCount,
            forbiddenRequests,
            realtimeSdpRequestCount,
            realtimeToolRequestCount
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
      clientSecretRequestCount,
      forbiddenRequests,
      localQuestion,
      realtimeSdpRequestCount
    });
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-08-cited-answer.png` });
  } finally {
    await page.unroute("**/api/query/realtime-client-secret");
    await page.unroute("https://api.openai.com/v1/realtime/calls");
    await page.unroute("**/api/query/realtime-tool");
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
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 9 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
    await assertBeat4CaseOverviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.getByRole("tab", { name: /Draft/u }).click();
    await assertBeat9DraftReviewFidelity(page, model, backendSelectedRow, forbiddenRequests);
    await page.evaluate(() => {
      document.querySelector('[data-testid="maya-recovery-draft-review"]')?.scrollIntoView({ block: "start" });
    });
    await assertLocatorInsideViewport(page, '[data-testid="maya-draft-command-bar"]', "Maya Beat 9 command bar");
    await page.screenshot({ fullPage: false, path: `${outputDir}/maya-beat-09-draft-review.png` });

    await page.getByRole("button", { name: /^Request changes$/u }).click();
    await expectVisibleText(page, "Request changes prepared");
    await page.getByRole("button", { name: /^Reject draft$/u }).click();
    await expectVisibleText(page, "Reject draft prepared");
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await expectVisibleText(page, "Open approval prepared");
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
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 10 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
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
    await page.locator(`[data-testid="maya-worklist-row"][data-line-id="${backendSelectedRow.lineId}"]`).click();
    await assertBeat3RecommendedActionFidelity(page, backendSelectedRow, "Maya Beat 11 pre-open selected row");
    await page.getByTestId("maya-local-row-action-open").click();
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
    await assertBeat11AuditConfirmationFidelity(page, model, forbiddenRequests);
    await page.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-11-audit-confirmation.png` });
  } finally {
    await context.close();
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

    await page.getByRole("button", { name: /Open approval/u }).click();
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
    await expectVisibleText(loginPage, "Deduction Forensics");
    await expectVisibleText(loginPage, "Open Forensics Workspace");
    await expectVisibleText(loginPage, "Invalid session");
    await expectLoginIdValue(loginPage, demoSessions.maya.loginId);

    await loginPage.getByRole("radio", { name: /Reviewer/u }).click();
    await expectLoginIdValue(loginPage, demoSessions.david.loginId);
    await loginPage.getByRole("radio", { name: /Maya/u }).click();
    await expectLoginIdValue(loginPage, demoSessions.maya.loginId);

    const forgotPassword = loginPage.getByRole("button", { name: /Forgot password unavailable/u });
    assert((await forgotPassword.count()) === 1, "forgot password must render as unavailable instead of an active inert control");
    assert(await forgotPassword.isDisabled(), "forgot password unavailable control must be disabled");

    await loginPage.getByLabel(/Remember user ID/u).click();
    await loginPage.reload({ waitUntil: "networkidle" });
    await expectLoginIdValue(loginPage, demoSessions.maya.loginId);
    await loginPage.getByLabel(/Remember user ID/u).click();

    const legacyLoginNodes = await loginPage
      .locator(".state-shell, .login-workstation, .login-rail, .login-source-rack, .login-form, .login-fields")
      .count();
    assert(legacyLoginNodes === 0, "Maya Beat 1 login must not render legacy cockpit login classes");

    await loginPage.screenshot({ fullPage: true, path: `${outputDir}/maya-beat-01-login.png` });
    await loginPage.locator('input[name="password"]').fill(demoPassword);
    const loginRequest = loginPage.waitForRequest((request) => request.url().endsWith("/api/demo-login"));
    await loginPage.getByRole("button", { name: /Open (Forensics )?Workspace/u }).click();
    const postData = (await loginRequest).postDataJSON() as { loginId?: string };
    assert(postData.loginId === demoSessions.maya.loginId, "Maya persona selection must POST the Maya loginId");
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
  const loginRequest = loginPage.waitForRequest((request) => request.url().endsWith("/api/demo-login"));
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

async function assertBeat2HeaderFidelity(page: Page, label: string): Promise<void> {
  const header = await page.evaluate(() => {
    const runDateGap = document.querySelector<HTMLElement>('[data-testid="maya-run-date-contract-gap"]');
    const refreshMetadata = document.querySelector<HTMLElement>('[data-testid="maya-refresh-metadata"]');
    const refreshGap = document.querySelector<HTMLElement>('[data-testid="maya-refresh-contract-gap"]');
    const disabledRefresh = refreshGap?.querySelector<HTMLButtonElement>("button:disabled");

    return {
      refreshButtonLabel: disabledRefresh?.getAttribute("aria-label") ?? "",
      refreshButtonText: disabledRefresh?.innerText.trim() ?? "",
      refreshMetadataText: refreshMetadata?.innerText.trim() ?? "",
      refreshUnavailableDisabled: disabledRefresh !== null && disabledRefresh !== undefined,
      runDateLabel: runDateGap?.getAttribute("aria-label") ?? ""
    };
  });

  assert(header.runDateLabel.includes("Run date not exposed"), `${label} header must not invent a calendar date`);
  assert(header.refreshMetadataText.includes("Refreshed"), `${label} header must show source refresh metadata`);
  assert(header.refreshButtonText === "Refresh", `${label} header refresh affordance should stay visually light`);
  assert(
    header.refreshButtonLabel.includes("Refresh unavailable"),
    `${label} header must label missing backend refresh action`
  );
  assert(header.refreshUnavailableDisabled, `${label} refresh control must not trigger a page reload as a fake refresh`);
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
    const fetchedRowsOnlyMentions = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(
        (element) =>
          element.offsetParent !== null &&
          typeof element.innerText === "string" &&
          element.innerText.trim() === "Fetched rows only"
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
      fetchedRowsOnlyVisibleCount: fetchedRowsOnlyMentions.length,
      hasContractGapAffordance: contractGap?.innerText.includes("Read-model gaps") ?? false,
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
  assert(fit.rowCount > 0, `${label} worklist rows must render from fetched data`);
  assert(fit.hasContractGapAffordance, `${label} worklist must honestly mark missing mockup contract fields`);
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
    fit.fetchedRowsOnlyVisibleCount === 1,
    `${label} worklist footer rhythm must expose exactly one Fetched rows only label: ${String(
      fit.fetchedRowsOnlyVisibleCount
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
  assert(fit.routingLabelMetrics.length > 0, `${label} routing labels must render from fetched rows`);
  for (const routingLabel of fit.routingLabelMetrics) {
    assert(routingLabel.label.length > 0, `${label} routing labels must expose backend text`);
    assert(
      routingLabel.height <= routingLabel.lineHeight * 2 + 4 && routingLabel.scrollHeight <= routingLabel.height + 1,
      `${label} routing label must stay compact and unclipped (${routingLabel.label}): ${String(routingLabel.height)}px`
    );
  }
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
    const filterTrigger = document.querySelector<HTMLElement>('[data-testid="maya-sidebar-filter-trigger"]');
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
      filterText: filterTrigger?.innerText.trim() ?? "",
      footerBottom: footer?.getBoundingClientRect().bottom ?? 0,
      footerText: footer?.innerText.trim() ?? "",
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
  assert(sidebar.filterText.includes("Filters"), `${label} sidebar must expose the lower filter affordance`);
  assert(sidebar.navCount >= 9, `${label} sidebar must keep the full Maya nav map`);
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
  assert(result.contractText.includes("fixed evidence packet corresponds"), `${label} must identify backend-selected detail availability`);
  assert(result.buttonLabels.includes("Open investigation"), `${label} must render local open-investigation affordance`);
  assert(result.buttonLabels.includes("Add note"), `${label} must render local add-note affordance`);
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
    result.contractText.includes("Detailed evidence is unavailable for this row until the backend exposes row switching."),
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
  assert(result.text.includes(recordId), "Beat 4 workspace must show backend record IDs");
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
  assert(forbiddenRequests.length === 0, `Beat 4 must not dispatch forbidden requests: ${forbiddenRequests.join(", ")}`);
}

async function assertBeat4DraftTabFidelity(
  page: Page,
  model: ForensicsE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya Beat 4 Draft tab");
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
  assert(result.text.includes(recordId), "Beat 4 Draft tab must keep backend record IDs");
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
  const hasModify = model.selected.approvalActions.some((action) => action.decision === "modify");
  const hasReject = model.selected.approvalActions.some((action) => action.decision === "reject");

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
  assert(result.text.includes(recordId), "Beat 9 must render backend record IDs");
  assert(result.text.includes("Draft gate"), "Beat 9 context rail must show the backend draft gate section");
  assert(result.text.includes("Human decisions"), "Beat 9 context rail must show available human decisions");
  assert(result.text.includes("Evidence records"), "Beat 9 context rail must show backend evidence record IDs");
  assert(result.text.includes("Backend gaps"), "Beat 9 context rail must call out backend contract gaps");
  assert(result.text.includes("Packet display ID not exposed"), "Beat 9 context rail must avoid fake packet IDs");
  assert(result.text.includes("Case account and currency not exposed"), "Beat 9 context rail must avoid fake account/currency facts");
  assert(result.text.includes("Approval owner and timestamps not exposed"), "Beat 9 context rail must avoid fake owner/timestamp facts");
  assert(result.text.includes("Audit hash waits for human decision"), "Beat 9 context rail must avoid fake audit hashes");
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
  if (hasModify) {
    assert(result.buttonLabels.includes("Request changes"), "Beat 9 modify action must surface as Request changes");
  }
  if (hasReject) {
    assert(result.buttonLabels.includes("Reject draft"), "Beat 9 reject action must surface as Reject draft");
  }
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
  await expectVisibleText(page, "Evidence reviewed state and approval eligibility are unavailable");
  await expectVisibleText(page, "Verified human principal unavailable");
  await expectVisibleText(page, model.selected.draft.actionLabel);
  await expectVisibleText(page, model.selected.draft.statusLabel);
  await expectVisibleText(page, model.selected.draft.basis);
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  await expectVisibleText(page, recordId);

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
  assert(
    result.decisionButtons.every((button) => button.disabled),
    "Beat 10 decision buttons must be disabled while approval eligibility is unavailable"
  );
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
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya Beat 11 audit confirmation");
  await expectVisibleText(page, "Audit confirmation");
  await expectVisibleText(page, "Audit confirmation unavailable");
  await expectVisibleText(page, "No backend approval response or audit commit is available yet");
  await expectVisibleText(page, "status === human_decided");
  await expectVisibleText(page, "valid 64-hex auditEntryHash");
  await expectVisibleText(page, "Waiting for committed backend approval response");
  await expectVisibleText(page, "Backend contract gap");
  await expectVisibleText(page, "Selected action citations");
  const selectedRecordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const result = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="maya-audit-confirmation"]');
    const rows = [...(panel?.querySelectorAll<HTMLElement>("tbody tr") ?? [])].map((row) => row.innerText);
    const buttons = [...(panel?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) => ({
      disabled: button.disabled,
      label: button.innerText.trim() || button.getAttribute("aria-label") || ""
    }));

    return {
      buttons,
      copyButtonCount: buttons.filter((button) => /copy/i.test(button.label)).length,
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

  assert(result.text.includes(model.selected.draft.actionLabel), "Beat 11 must show selected backend action label only as context");
  assert(result.text.includes(model.selected.draft.statusLabel), "Beat 11 must show selected backend draft status only as context");
  assert(result.text.includes(model.selected.draft.basis), "Beat 11 must show selected backend basis only as context");
  assert(result.text.includes(selectedRecordId), "Beat 11 must show selected record IDs as selected action citations");
  assert(result.text.includes("Committed audit receipt citations unavailable"), "Beat 11 must not relabel selected IDs as receipt IDs");
  assert(result.buttons.some((button) => button.label === "View audit trail" && button.disabled), "Beat 11 audit-route control must be disabled");
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

async function assertBeat5EvidenceDossierFidelity(
  page: Page,
  model: ForensicsE2EModel,
  connectors: ConnectorE2EModel,
  forbiddenRequests: string[]
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 5 evidence dossier");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-packet"]', "Maya Beat 5 backend evidence packet");
  await expectVisibleLocator(page, '[data-testid="maya-deterministic-basis-rail"]', "Maya Beat 5 deterministic basis rail");
  await expectVisibleLocator(page, '[data-testid="maya-source-provenance-rail"]', "Maya Beat 5 source provenance rail");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-review-state"]', "Maya Beat 5 review state readout");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");
  const syntheticTile = connectors.sourceTiles.find((source) => source.statusTone === "synthetic");

  const result = await page.evaluate(() => {
    const dossier = document.querySelector<HTMLElement>('[data-testid="maya-evidence-dossier"]');
    const packet = document.querySelector<HTMLElement>('[data-testid="maya-evidence-packet"]');
    const basisRail = document.querySelector<HTMLElement>('[data-testid="maya-deterministic-basis-rail"]');
    const sourceRail = document.querySelector<HTMLElement>('[data-testid="maya-source-provenance-rail"]');
    const reviewState = document.querySelector<HTMLElement>('[data-testid="maya-evidence-review-state"]');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-evidence-document-row"]')];
    const sourceRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-source-provenance-row"]')].map((row) => ({
      statusTone: row.dataset.statusTone ?? "",
      text: row.innerText
    }));

    return {
      basisText: basisRail?.innerText ?? "",
      dossierText: dossier?.innerText ?? "",
      packetText: packet?.innerText ?? "",
      reviewText: reviewState?.innerText ?? "",
      rowCount: rows.length,
      sourceRows,
      sourceText: sourceRail?.innerText ?? ""
    };
  });

  assert(result.rowCount === model.selected.evidencePack.documents.length, "Beat 5 must render one row per backend evidence document");
  assert(result.packetText.includes("Backend evidence packet"), "Beat 5 must render one backend-backed expanded packet");
  assert(result.dossierText.includes("Evidence dossier available"), "Beat 5 must show dossier availability");
  assert(result.reviewText.includes("Review state unavailable"), "Beat 5 must not imply evidence-review completion");
  assert(result.basisText.includes(model.selected.draft.basis), "Beat 5 must show backend deterministic basis text");
  assert(result.basisText.includes(model.selected.draft.statusLabel), "Beat 5 must label draft status as draft/HITL state only");
  assert(result.basisText.includes("Deterministic basis unavailable"), "Beat 5 must mark structured criteria as unavailable");
  assert(result.dossierText.includes(recordId), "Beat 5 must show backend record IDs");
  assert(result.dossierText.includes(evidenceDocument.citationId), "Beat 5 must show backend citation IDs");
  assert(result.dossierText.includes(evidenceDocument.documentId), "Beat 5 must show backend document IDs");
  assert(result.dossierText.includes(evidenceDocument.documentType), "Beat 5 must show backend document types");
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

  if (syntheticTile !== undefined) {
    const matchingSourceRow = result.sourceRows.find((row) => row.text.includes(syntheticTile.label));
    assert(matchingSourceRow !== undefined, `Beat 5 source provenance must include ${syntheticTile.label}`);
    assert(matchingSourceRow.statusTone === "synthetic", `Beat 5 must keep ${syntheticTile.label} marked synthetic`);
    assert(!matchingSourceRow.text.includes("Live read"), `Beat 5 must not relabel ${syntheticTile.label} as live`);
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
  const queryButton = page.getByRole("button", { name: /^Run query$/u });
  await queryButton.waitFor({ state: "visible", timeout: 15_000 });
  assert(!(await queryButton.isDisabled()), "Beat 6 query button must be enabled after typing a local question");
  const inputValue = await page.getByTestId("maya-query-input").inputValue();
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");

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
  assert(result.recordBadges.includes(recordId), "Beat 6 must show backend record ID badges near the input");
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
  clientSecretRequestCount: number
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 7 evidence dossier stays visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 7 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya Beat 7 agent trace");
  await expectVisibleLocator(page, '[data-testid="maya-trace-running-session"]', "Maya Beat 7 running session row");
  await expectVisibleLocator(page, '[data-testid="maya-trace-running-skeleton"]', "Maya Beat 7 running skeleton");
  await expectVisibleLocator(page, '[data-testid="maya-selected-evidence-context"]', "Maya Beat 7 selected evidence context");
  await expectVisibleLocator(page, '[data-testid="maya-submitted-query"]', "Maya Beat 7 submitted query context");
  const recordId = firstItem(model.selected.evidencePack.recordIds, "selected evidence record IDs");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const dossier = document.querySelector<HTMLElement>('[data-testid="maya-evidence-dossier"]');
    const runningSession = document.querySelector<HTMLElement>('[data-testid="maya-trace-running-session"]');
    const skeletons = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-trace-running-skeleton"]')];
    const contextRows = [...document.querySelectorAll<HTMLElement>('[data-testid="maya-static-context-row"]')];
    const citedAnswer = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer"]');
    const selectedContext = document.querySelector<HTMLElement>('[data-testid="maya-selected-evidence-context"]');
    const submittedQuery = document.querySelector<HTMLElement>('[data-testid="maya-submitted-query"]')?.innerText ?? "";
    const viewportHeight = window.innerHeight;

    return {
      contextRowCount: contextRows.length,
      contextText: contextRows.map((row) => row.innerText).join("\n"),
      dockText: dock?.innerText ?? "",
      dossierText: dossier?.innerText ?? "",
      hasCitedAnswer: citedAnswer !== null,
      runningText: runningSession?.innerText ?? "",
      selectedContextText: selectedContext?.innerText ?? "",
      skeletonCount: skeletons.length,
      submittedQuery,
      traceText: trace?.innerText ?? "",
      visibleContextRowCount: contextRows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight;
      }).length
    };
  });

  assert(clientSecretRequestCount === 1, "Beat 7 must start exactly one held realtime client-secret request");
  assert(result.dossierText.includes(evidenceDocument.citationId), "Beat 7 must keep evidence document context visible");
  assert(result.dossierText.includes(evidenceDocument.summary), "Beat 7 must keep backend evidence summaries visible");
  assert(result.submittedQuery.includes(localQuestion), "Beat 7 must show the local submitted query as query context");
  assert(result.runningText.includes("connecting"), "Beat 7 running row must be tied to the session connecting state");
  assert(result.dockText.includes(recordId), "Beat 7 dock must keep selected evidence record badges visible");
  assert(result.selectedContextText.includes("Selected evidence packet"), "Beat 7 must promote selected evidence context in the dock");
  assert(result.selectedContextText.includes(model.selected.lineId), "Beat 7 selected evidence context must include the selected line");
  for (const selectedRecordId of model.selected.evidencePack.recordIds) {
    assert(result.selectedContextText.includes(selectedRecordId), `Beat 7 selected evidence context must include ${selectedRecordId}`);
  }
  assert(result.skeletonCount >= 2, "Beat 7 must show shadcn skeleton loading affordance while the session is running");
  assert(
    result.contextRowCount === model.selected.evidencePack.documents.length || result.contextRowCount > 0,
    "Beat 7 must show static read-model context rows"
  );
  assert(
    result.visibleContextRowCount >= Math.min(2, result.contextRowCount),
    "Beat 7 must keep multiple static read-model context rows in the first viewport"
  );
  assert(result.traceText.includes("Trace rail"), "Beat 7 trace panel must read as an operational trace rail");
  assert(result.contextText.includes("Read-model evidence context"), "Beat 7 context rows must be labeled as static evidence context");
  assert(result.traceText.includes("Backend trace-step contract gap"), "Beat 7 must mark missing per-step trace contract honestly");
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

async function assertBeat8CitedAnswerFidelity(
  page: Page,
  model: ForensicsE2EModel,
  {
    acceptedAnswer,
    acceptedBasis,
    clientSecretRequestCount,
    forbiddenRequests,
    localQuestion,
    realtimeSdpRequestCount
  }: {
    acceptedAnswer: string;
    acceptedBasis: string;
    clientSecretRequestCount: number;
    forbiddenRequests: string[];
    localQuestion: string;
    realtimeSdpRequestCount: number;
  }
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya Beat 8 evidence dossier stays visible");
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya Beat 8 query dock");
  await expectVisibleLocator(page, '[data-testid="maya-cited-answer"]', "Maya Beat 8 cited answer");
  await expectVisibleLocator(page, '[data-testid="maya-cited-answer-text"]', "Maya Beat 8 cited answer text");
  await expectVisibleLocator(page, '[data-testid="maya-cited-answer-basis"]', "Maya Beat 8 deterministic basis");
  await expectVisibleLocator(page, '[data-testid="maya-cited-record-row"]', "Maya Beat 8 citation rows");
  const evidenceDocument = firstItem(model.selected.evidencePack.documents, "selected evidence documents");

  const result = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="maya-query-dock"]');
    const answer = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer"]');
    const answerText = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer-text"]')?.innerText ?? "";
    const basis = document.querySelector<HTMLElement>('[data-testid="maya-cited-answer-basis"]')?.innerText ?? "";
    const trace = document.querySelector<HTMLElement>('[data-testid="maya-agent-trace"]');
    const dossier = document.querySelector<HTMLElement>('[data-testid="maya-evidence-dossier"]');
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
      answerText,
      basis,
      blockedCount: blockedAlerts.length,
      buttons,
      citationRows,
      dockMode: dock?.dataset.answerMode ?? "",
      dockText: dock?.innerText ?? "",
      dockWidth: dockRect?.width ?? 0,
      dossierText: dossier?.innerText ?? "",
      submittedQuery,
      text: answer?.innerText ?? "",
      traceText: trace?.innerText ?? ""
    };
  });

  assert(clientSecretRequestCount === 1, "Beat 8 must request exactly one realtime client secret");
  assert(realtimeSdpRequestCount === 1, "Beat 8 must complete exactly one local SDP exchange");
  assert(result.answerText.includes(acceptedAnswer), "Beat 8 must render the backend/test accepted answer text");
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
  const isRealtimeClientSecret = pathname === "/api/query/realtime-client-secret";

  return (
    url.hostname === "api.openai.com" ||
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    segments.includes("approval") ||
    segments.includes("sap") ||
    pathname === "/api/query/realtime-tool" ||
    (segments.includes("query") && !isRealtimeClientSecret)
  );
}

function isForbiddenBeat8ExternalActionRequest(request: PlaywrightRequest): boolean {
  const url = new URL(request.url());
  const pathname = url.pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);
  const isRealtimeClientSecret = pathname === "/api/query/realtime-client-secret";
  const isRealtimeTool = pathname === "/api/query/realtime-tool";
  const isLocalRealtimeSdp = url.hostname === "api.openai.com" && pathname === "/v1/realtime/calls";

  return (
    (url.hostname === "api.openai.com" && !isLocalRealtimeSdp) ||
    pathname === "/run" ||
    pathname.startsWith("/run/") ||
    segments.includes("approval") ||
    segments.includes("sap") ||
    (segments.includes("query") && !isRealtimeClientSecret && !isRealtimeTool)
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

async function assertBeat2SourceReadinessFidelity(page: Page, label: string): Promise<void> {
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
  assert(sourceStrip.tileCount === 7, `${label} source readiness strip must render all backend source tiles`);
  assert(
    sourceStrip.tileMinWidth >= 104,
    `${label} source readiness tiles must stay scan-friendly: ${String(sourceStrip.tileMinWidth)}px`
  );
  assert(
    sourceStrip.tileText.some((text) => text.includes("Contract Repo")),
    `${label} source readiness must not hide Contract Repo`
  );
  assert(sourceStrip.tileText.some((text) => text.includes("MCP")), `${label} source readiness must not hide MCP`);
  assert(sourceStrip.hasReady, `${label} source readiness must show backend ready/connected state`);
  assert(sourceStrip.hasSynthetic, `${label} source readiness must show backend synthetic state distinctly`);
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
  assert(readyClass !== syntheticClass, `${label} ready and synthetic source tiles must have distinct visual classes`);
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
