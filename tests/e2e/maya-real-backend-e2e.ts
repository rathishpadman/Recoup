import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server
} from "node:http";
import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page, type Response as PlaywrightResponse } from "playwright";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../../config/localRuntimeEnv.ts";
import { createCockpitApi } from "../../src/services/cockpitApi.js";

type ApiRequestSource = "api-server" | "browser" | "direct-api";

interface ManagedProcess {
  child: ChildProcessWithoutNullStreams;
  command: string;
  args: string[];
  label: string;
  output: string[];
}

interface ManagedApiServer {
  close: () => Promise<void>;
  recorder: ApiCallRecorder;
  url: string;
}

interface ObservedApiCall {
  method: string;
  path: string;
  responseBodyText?: string;
  source: ApiRequestSource;
  status?: number;
}

interface KpiModelItem {
  label: string;
  support: string;
  value: string;
}

interface WorklistModelItem {
  amount: string;
  confidenceLabel: string;
  customerId?: string;
  customerLabel: string;
  evidenceLabel: string;
  evidenceScoreLabel: string;
  lineCount: number;
  lineId: string;
  lineIds: string[];
  queueLabel: string;
  recommendedActionLabel: string;
  routingLabel: string;
  scenarioLabel: string;
  scenarioType: string;
  verdictLabel: string;
}

interface EvidenceDocumentModel {
  citationId: string;
  description: string;
  documentId: string;
  documentType: string;
  relevance: string;
  sourceLabel: string;
  summary: string;
  verifiedLabel: string;
}

interface EvidencePackModel {
  documents: EvidenceDocumentModel[];
  recordIds: string[];
}

interface RecoveryDraftModel {
  actionId: string;
  actionLabel: string;
  actionType: string;
  amount: string;
  basis: string;
  status: "pending_human";
  statusLabel: string;
}

interface ApprovalActionModel {
  decision: "approve" | "modify" | "reject";
  label: string;
  requiresReason: boolean;
}

interface ActionInboxModelItem {
  actionId: string;
  actionLabel: string;
  actionType: string;
  amount: string;
  basis?: string;
  lineId: string;
  status?: "pending_human";
  statusLabel?: string;
}

interface ForensicsRealBackendModel {
  actionInbox: ActionInboxModelItem[];
  kpiStrip: KpiModelItem[];
  selected: {
    approvalActions: ApprovalActionModel[];
    draft: RecoveryDraftModel;
    evidencePack: EvidencePackModel;
    lineId: string;
  };
  surface: string;
  worklist: WorklistModelItem[];
}

interface ConnectorRealBackendModel {
  checkedAtIso: string;
  sourceTiles: Array<{
    checkedAtIso: string;
    detail: string;
    key: string;
    label: string;
    modeLabel: string;
    stateLabel: string;
    statusTone: "ready" | "synthetic" | "blocked";
    summary: string;
  }>;
  surface: string;
}

interface ForensicsWorkItemDetailModel {
  actionInbox: ActionInboxModelItem[];
  approvalState: {
    actions: ApprovalActionModel[];
    status: "pending_human";
    statusLabel: string;
  };
  auditState: {
    recordIds: string[];
    status: "pending_human";
    statusLabel: string;
  };
  lineId: string;
  multimodalDock: {
    promptSuggestions: Array<{
      label: string;
      question: string;
      recordIds: string[];
    }>;
  };
  recommendedAction: ActionInboxModelItem;
  recoveryDraft: RecoveryDraftModel;
  selected: {
    approvalActions: ApprovalActionModel[];
    draft: RecoveryDraftModel;
    evidencePack: EvidencePackModel;
    lineId: string;
  };
  surface: string;
  workItem: WorklistModelItem;
}

interface QueryTraceEvent {
  agentName: string;
  deterministicBasis: string;
  hook: string;
  label: string;
  message?: string;
  nextAgentName?: string;
  phase: string;
  recordIds: string[];
  retrievalSource?: string;
  sourceKind?: string;
  toolName?: string;
}

interface ForensicsQueryResponse {
  answer?: string;
  citations: Array<{
    deterministicBasis: string;
    documentId?: string;
    recordId: string;
    source?: string;
    summary?: string;
  }>;
  deterministicBasis?: string;
  modelExecution?: {
    agentNames?: string[];
    handoffCount?: number;
    mode: string;
    rawModelTextPolicy?: string;
  };
  trace: QueryTraceEvent[];
}

interface ForensicsQueryE2EResult {
  appResponse: ForensicsQueryResponse;
  appResponseSource: "backend_recorder_fallback" | "browser_response";
  backendResponse: ForensicsQueryResponse;
  scenario: RealMayaQueryScenario;
}

interface RealMayaQueryScenario {
  id: string;
  operatorIntent: string;
  question: string;
}

interface RenderedAgentProcessNode {
  agentName: string | null;
  deterministicBasis: string | null;
  hook: string | null;
  phase: string | null;
  processNodeKind: string | null;
  recordIds: string | null;
  retrievalSource: string | null;
  sourceKind: string | null;
  text: string;
  traceLabel: string | null;
  uiProcessKind: string | null;
}

const repoRoot = process.cwd();
const localEnv = loadLocalRuntimeEnvFiles();
const requestedApiUrl = readEnvValue("RECOUP_E2E_API_URL", "http://127.0.0.1:4317");
const requestedAppPort = Number(readEnvValue("RECOUP_E2E_COCKPIT_PORT", "3000"));
const explicitApiUrl = isConfigured(process.env.RECOUP_E2E_API_URL ?? localEnv.RECOUP_E2E_API_URL);
const reuseCockpitRequested = readBooleanEnv("RECOUP_E2E_REUSE_COCKPIT");
const demoPassword = readEnvValue("RECOUP_E2E_DEMO_PASSWORD", "Welcome#123");
const observedCalls: ObservedApiCall[] = [];
const fixtureProcessStarted = false;
const screenshotDir = join("output", "playwright", "e2e", "real-backend");
const realMayaQueryScenarios = [
  {
    id: "customer-dispute-response",
    operatorIntent: "Maya needs evidence language for a customer dispute follow-up.",
    question: "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?"
  },
  {
    id: "manager-approval-brief",
    operatorIntent: "Maya needs a manager-ready summary before opening the human approval gate.",
    question: "What should I tell my manager before I ask for approval on the recovery draft?"
  },
  {
    id: "billing-vs-recovery-route",
    operatorIntent: "Maya needs to know whether this belongs with Billing or recovery pursuit.",
    question: "Is this a billing correction or a recovery pursuit, and what proof drives that route?"
  },
  {
    id: "handoff-hitl-draft-gate",
    operatorIntent: "Maya needs live Forensics-to-Recovery handoff proof while preserving human approval gates.",
    question:
      "Using only this selected evidence packet, have Forensics hand off to Recovery Drafter and confirm whether the recovery draft remains human-approval-gated. Which cited record IDs support that?"
  }
] as const satisfies readonly RealMayaQueryScenario[];

async function main(): Promise<void> {
  assertHarnessDoesNotUsePlaywrightRoutingOrFixtureApi();
  assertAgentTraceNodeMatchingDisambiguatesDuplicateLabels();
  assert(
    !reuseCockpitRequested,
    "RECOUP_E2E_REUSE_COCKPIT=1 is disabled for Maya real-backend acceptance; start a fresh cockpit process."
  );

  const managedProcesses: ManagedProcess[] = [];
  let apiServer: ManagedApiServer | undefined;
  let browser: Browser | undefined;

  try {
    mkdirSync(screenshotDir, { recursive: true });
    apiServer = await ensureRealApi();
    const appPort = await resolveAppPort(requestedAppPort);
    const appUrl = `http://127.0.0.1:${appPort.toString()}`;
    const e2eEnv = buildE2eEnv(apiServer.url, appUrl);
    const cockpitProcess = await ensureCockpit(appUrl, appPort, e2eEnv);
    if (cockpitProcess !== undefined) {
      managedProcesses.push(cockpitProcess);
    }

    const [forensicsModel, connectorsModel] = await Promise.all([
      fetchRequiredJson<ForensicsRealBackendModel>(apiServer.url, "/forensics", "direct-api"),
      fetchRequiredJson<ConnectorRealBackendModel>(apiServer.url, "/connectors", "direct-api")
    ]);
    assertForensicsModelReady(forensicsModel);
    assertConnectorModelReady(connectorsModel);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
    observeBrowserCalls(page, appUrl, apiServer.url);

    await loginAsMaya(page, appUrl);
    clearObservedCalls();
    apiServer.recorder.clear();
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench");
    await assertObservedRealBackendCall(apiServer, "GET", "/forensics");
    await assertObservedRealBackendCall(apiServer, "GET", "/connectors");
    await assertRootSidebarSectionNavigation(page, forensicsModel);
    await assertRenderedKpiStripMatchesBackend(page, forensicsModel);
    await assertRenderedSourceReadinessMatchesBackend(page, connectorsModel);
    await assertRenderedWorklistTableMatchesBackend(page, forensicsModel);
    await captureMayaBeat(page, "02-dashboard");
    await assertRenderedRecommendedActionCellMatchesBackend(page, forensicsModel);
    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await captureMayaBeat(page, "03-recommended-action");

    const detail = await openOneRealBackendWorkItem(page, apiServer, forensicsModel);
    await captureMayaBeat(page, "04-case-overview");
    await assertAgentProcessMapBeforeQuery(page, detail, connectorsModel);
    await openEvidenceTab(page);
    await assertRenderedEvidenceDossierMatchesBackend(page, detail, connectorsModel);
    await captureMayaBeat(page, "05-evidence-dossier");
    await openEvidenceQuery(page);
    await assertRenderedQueryDockMatchesBackend(page, detail);
    await captureMayaBeat(page, "06-query-start");
    await assertClosingRunningQueryResetsParentTrace(page, realMayaQueryScenarios[0], detail);
    await openEvidenceTab(page);
    await openEvidenceQuery(page);
    const queryResults = await runRealMayaQueryScenarios(page, apiServer, detail);
    await captureMayaBeat(page, "08-cited-answer");
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
    await page.getByRole("tab", { name: /^Draft$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya draft review");
    await assertRenderedRecoveryDraftMatchesBackend(page, detail);
    await captureMayaBeat(page, "09-draft-review");
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya approval gate");
    await assertRenderedApprovalGateMatchesBackend(page, detail);
    await captureMayaBeat(page, "10-human-approval");
    await closeVisibleOverlay(page, '[data-testid="maya-approval-gate-dialog"]');
    await page.getByRole("tab", { name: /^Audit$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya audit confirmation");
    await assertRenderedAuditConfirmationMatchesBackend(page, detail);
    await captureMayaBeat(page, "11-audit-confirmation");
    await assertReturnToWorklistRestoresWorklist(page, forensicsModel, detail);
    await captureMayaBeat(page, "12-return-worklist");

    assertNoFixtureProcessStarted(managedProcesses);
    assertHarnessDoesNotUsePlaywrightRoutingOrFixtureApi();
    const totalTraceRows = queryResults.reduce((sum, result) => sum + result.backendResponse.trace.length, 0);
    console.log(
      `Maya real-backend E2E passed against ${apiServer.url}; query scenarios: ${queryResults.length.toString()}; backend trace rows: ${totalTraceRows.toString()}`
    );
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
      if (apiServer !== undefined) {
        await apiServer.close();
      }
    }
  }
}

async function ensureRealApi(): Promise<ManagedApiServer> {
  const base = new URL(requestedApiUrl);
  const requestedBaseUrl = normalizeBaseUrl(base.toString());
  const requestedPort = Number(base.port || "4317");
  if (!isLoopbackUrl(base)) {
    await assertExistingApiIsRealBackend(requestedBaseUrl);
    return startRecordingProxy(requestedBaseUrl, 4317);
  }

  if (explicitApiUrl && (await hasAnyHttpResponse(`${requestedBaseUrl}/`))) {
    await assertExistingApiIsRealBackend(requestedBaseUrl);
    return startRecordingProxy(requestedBaseUrl, requestedPort);
  }

  if (explicitApiUrl && !(await isTcpPortAvailable(requestedPort))) {
    throw new Error(`Explicit real backend URL ${requestedBaseUrl} is not reachable and port ${requestedPort.toString()} is unavailable.`);
  }

  const port = explicitApiUrl ? requestedPort : await findAvailablePort(requestedPort, "api");
  return startLocalRealApi(base, port);
}

async function startLocalRealApi(base: URL, port: number): Promise<ManagedApiServer> {
  const internalUrl = `${base.protocol}//${base.hostname}:${port.toString()}`;
  const env = buildE2eEnv(internalUrl, `http://127.0.0.1:${requestedAppPort.toString()}`);
  const app = createCockpitApi({ env });
  const server = createHttpServer((request, response) => {
    app(request, response);
  });

  await listen(server, port);
  await waitForAnyHttpResponse(`${internalUrl}/healthz`, 45_000);
  const proxy = await startRecordingProxy(internalUrl, port);

  return {
    async close() {
      await proxy.close();
      await closeServer(server);
    },
    recorder: proxy.recorder,
    url: proxy.url
  };
}

async function startRecordingProxy(targetBaseUrl: string, preferredPort: number): Promise<ManagedApiServer> {
  const proxyPort = await findAvailablePort(preferredPort, "api recording proxy");
  const proxyUrl = `http://127.0.0.1:${proxyPort.toString()}`;
  const recorder = new ApiCallRecorder();
  const server = createHttpServer((request, response) => {
    const call = recorder.record(request.method ?? "GET", request.url ?? "/", "api-server");
    void proxyRequestToRealBackend(request, response, targetBaseUrl, recorder, call);
  });

  await listen(server, proxyPort);
  await assertApiRootRealBackend(proxyUrl);

  return {
    async close() {
      await closeServer(server);
    },
    recorder,
    url: proxyUrl
  };
}

async function ensureCockpit(appUrl: string, appPort: number, env: NodeJS.ProcessEnv): Promise<ManagedProcess | undefined> {
  const managedProcess = startManagedProcess(
    "cockpit",
    process.execPath,
    [nextBin(), "dev", "cockpit", "--hostname", "127.0.0.1", "--port", appPort.toString()],
    env
  );
  try {
    await waitForAnyHttpResponse(`${appUrl}/login`, 90_000);
  } catch (error) {
    dumpRecentOutput(managedProcess);
    stopProcess(managedProcess.child);
    throw error;
  }

  return managedProcess;
}

async function loginAsMaya(page: Page, appUrl: string): Promise<void> {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await expectVisibleLocator(page, 'input[name="loginId"]', "Maya login ID input");
  await expectVisibleLocator(page, 'input[name="password"]', "Maya password input");
  await expectVisibleLocator(page, '[data-testid="maya-login-beat"]', "Maya login beat");
  await page.locator('input[name="loginId"]').fill("Maya");
  await page.locator('input[name="password"]').fill(demoPassword);
  await captureMayaBeat(page, "01-login");
  const loginRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/demo-login");
  await page.getByRole("button", { name: /Open (Forensics )?Workspace/u }).click();
  const postData = (await loginRequest).postDataJSON() as { loginId?: string };
  assert(postData.loginId === "Maya", "Maya demo login must POST loginId Maya.");
  await page.waitForURL("**/forensics/shadcn", { timeout: 30_000 });
}

async function openOneRealBackendWorkItem(
  page: Page,
  apiServer: ManagedApiServer,
  model: ForensicsRealBackendModel
): Promise<ForensicsWorkItemDetailModel> {
  const preferredLineId =
    model.worklist.find((item) => item.lineIds.includes(model.selected.lineId))?.lineId ?? model.worklist[0]?.lineId;
  assert(preferredLineId !== undefined, "Forensics read model returned no Maya worklist rows.");

  const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(preferredLineId)}"]`).first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  const rowLineId = await row.getAttribute("data-line-id");
  assert(rowLineId !== null && rowLineId.length > 0, "Maya worklist row is missing data-line-id.");
  const detailPath = `/api/forensics/work-items/${encodeURIComponent(rowLineId)}`;

  let detailResponsePromise = waitForAppJsonResponse(page, "GET", detailPath, 30_000);
  await row.click();
  let detailResponse = await settleOptionalResponse(detailResponsePromise);
  if (detailResponse === undefined) {
    const openButton = page.getByTestId("maya-local-row-action-open");
    await openButton.waitFor({ state: "visible", timeout: 10_000 });
    detailResponsePromise = waitForAppJsonResponse(page, "GET", detailPath, 30_000);
    await openButton.click();
    detailResponse = await detailResponsePromise;
  }

  const detail = await readRequiredJsonResponse<ForensicsWorkItemDetailModel>(detailResponse, "Maya work item detail");
  assert(detail.surface === "forensics-work-item-detail", "Maya detail endpoint returned the wrong surface.");
  assert(detail.lineId === rowLineId, `Maya detail lineId mismatch: expected ${rowLineId}, received ${detail.lineId}.`);
  assert(detail.workItem.lineId === rowLineId, `Maya detail work item mismatch: expected ${rowLineId}.`);
  assert(detail.selected.evidencePack.recordIds.length > 0, "Maya detail returned no evidence record IDs.");
  await expectVisibleLocator(page, '[data-testid="maya-case-workspace"]', "Maya case workspace");
  await assertObservedRealBackendCall(apiServer, "GET", `/forensics/work-items/${encodeURIComponent(rowLineId)}`);

  return detail;
}

async function openEvidenceTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /^Evidence$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya evidence dossier");
}

async function openEvidenceQuery(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Query evidence$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya query input");
}

async function runRealMayaQueryScenarios(
  page: Page,
  apiServer: ManagedApiServer,
  detail: ForensicsWorkItemDetailModel
): Promise<ForensicsQueryE2EResult[]> {
  const results: ForensicsQueryE2EResult[] = [];

  for (const [index, scenario] of realMayaQueryScenarios.entries()) {
    if (index > 0) {
      await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
      await openEvidenceTab(page);
      await openEvidenceQuery(page);
    }

    const queryResult = await runEvidenceQuery(page, apiServer, scenario, detail);
    assertQueryResponseBackedByTrace(queryResult.backendResponse, detail);
    assertAppQueryResponseMatchesBackend(queryResult.backendResponse, queryResult.appResponse);
    await assertRenderedCitedAnswerMatchesBackend(page, scenario, queryResult.backendResponse);
    await assertRenderedConversationTurnsMatchBackend(page, queryResult);
    await expectVisibleLocator(page, '[data-testid="maya-cited-answer"]', `Maya cited answer for ${scenario.id}`);
    await assertAgentProcessMapAfterQuery(page, queryResult);
    await assertRenderedTraceRowsMatchBackend(page, queryResult.backendResponse.trace);
    await captureMayaBeat(page, index === 0 ? "07-agent-trace" : `07-query-${scenario.id}`);
    logRealMayaQueryResult(queryResult, detail);
    results.push(queryResult);
  }

  return results;
}

async function runEvidenceQuery(
  page: Page,
  apiServer: ManagedApiServer,
  scenario: RealMayaQueryScenario,
  detail: ForensicsWorkItemDetailModel
): Promise<ForensicsQueryE2EResult> {
  apiServer.recorder.clear();
  await assertVisibleSelectedEvidenceScope(page, detail);
  await assertRenderedPromptChipsMatchBackend(page, detail);
  const queryRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/forensics/query" && request.method() === "POST";
  });
  const queryResponsePromise = waitForAppJsonResponse(page, "POST", "/api/forensics/query", 60_000);
  await page.getByTestId("maya-query-input").fill(scenario.question);
  await page.getByRole("button", { name: /^Run query$/u }).click();
  const queryRequest = await queryRequestPromise;
  assertBrowserSubmittedQueryScope(queryRequest.postDataJSON() as unknown, scenario, detail);
  await assertObservedRealBackendCall(apiServer, "POST", "/forensics/query");
  const backendResponse = await apiServer.recorder.waitForJsonResponse<ForensicsQueryResponse>(
    "POST",
    "/forensics/query",
    20_000
  );
  const response = await settleOptionalResponse(queryResponsePromise);
  if (response === undefined) {
    console.log(`MAYA_APP_QUERY_RESPONSE_FALLBACK ${scenario.id}`);
    return { appResponse: backendResponse, appResponseSource: "backend_recorder_fallback", backendResponse, scenario };
  }

  const appResponse = await readRequiredJsonResponse<ForensicsQueryResponse>(response, "Maya forensics query");
  assertAppQueryResponseMatchesBackend(backendResponse, appResponse);

  return { appResponse, appResponseSource: "browser_response", backendResponse, scenario };
}

async function assertClosingRunningQueryResetsParentTrace(
  page: Page,
  scenario: RealMayaQueryScenario,
  detail: ForensicsWorkItemDetailModel
): Promise<void> {
  await assertVisibleSelectedEvidenceScope(page, detail);
  await page.getByTestId("maya-query-input").fill(scenario.question);
  await page.getByRole("button", { name: /^Run query$/u }).click();
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await page.getByTestId("maya-case-agent-trace-tab").click();
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya parent agent trace after query close");
  const runningSessionCount = await visibleLocatorCount(page, '[data-testid="maya-trace-running-session"]');
  assert(
    runningSessionCount === 0,
    "Closing a running Maya query left the parent Agent Trace panel stuck in connecting."
  );
  const selectedEvidenceCount = await visibleLocatorCount(page, '[data-testid="maya-trace-selected-evidence-session"]');
  const answeredAfterCloseCount = await visibleLocatorCount(page, '[data-testid="maya-trace-answered-session"]');
  assert(
    selectedEvidenceCount > 0 || answeredAfterCloseCount > 0,
    "Closing a running Maya query neither reset to selected evidence nor preserved a completed answer trace."
  );
  if (answeredAfterCloseCount > 0) {
    const backendTraceRows = await visibleLocatorCount(page, '[data-testid="maya-backend-trace-row"]');
    assert(backendTraceRows > 0, "Closing an answered Maya query removed backend trace rows from the parent Agent Trace tab.");
  }
  const parentTraceText = normalizeUiText(await page.getByTestId("maya-agent-trace").innerText());
  assert(
    parentTraceText.includes(normalizeUiText(detail.selected.lineId)),
    `Parent trace reset omitted selected backend line ${detail.selected.lineId}.`
  );
}

function logRealMayaQueryResult(
  result: ForensicsQueryE2EResult,
  detail: ForensicsWorkItemDetailModel
): void {
  const answer = result.backendResponse.answer;
  const deterministicBasis = result.backendResponse.deterministicBasis;
  assert(answer !== undefined && answer.trim().length > 0, `Maya query scenario ${result.scenario.id} returned no answer.`);
  assert(
    deterministicBasis !== undefined && deterministicBasis.trim().length > 0,
    `Maya query scenario ${result.scenario.id} returned no deterministic basis.`
  );

  console.log(
    `MAYA_REAL_QUERY_RESULT ${JSON.stringify({
      answer,
      citationRecordIds: result.backendResponse.citations.map((citation) => citation.recordId),
      deterministicBasis,
      operatorIntent: result.scenario.operatorIntent,
      question: result.scenario.question,
      scenarioId: result.scenario.id,
      selectedLineId: detail.selected.lineId,
      traceRows: result.backendResponse.trace.length
    })}`
  );
}

function assertQueryResponseBackedByTrace(
  response: ForensicsQueryResponse,
  detail: ForensicsWorkItemDetailModel
): void {
  assert(Array.isArray(response.trace), "Maya query response is missing backend trace rows.");
  assert(response.trace.length > 0, "Maya query response returned no backend trace rows.");
  assert(response.deterministicBasis !== undefined && response.deterministicBasis.trim().length > 0, "Maya query response is missing deterministic basis.");
  assert(
    response.deterministicBasis.includes("OpenAI Agents SDK live trace"),
    "Maya query response deterministic basis does not prove live OpenAI Agents SDK trace."
  );
  assertLiveAgentModelExecution(response);
  assert(response.citations.length > 0, "Maya query response returned no citations.");
  assertCitationsStayWithinSelectedEvidenceScope(response, detail, "Maya backend query response");
  assert(
    response.citations.some((citation) => citation.source === "sap" || citation.recordId.startsWith("SAP-")),
    "Maya query citations do not include SAP-provenance evidence."
  );
  assertTraceSourceProvenanceHonest(response);
  for (const citation of response.citations) {
    assert(
      citation.deterministicBasis.trim().length > 0,
      `Maya query citation ${citation.recordId} is missing deterministic basis.`
    );
  }
  for (const event of response.trace) {
    assert(event.deterministicBasis.trim().length > 0, `Maya query trace event ${event.label} is missing deterministic basis.`);
    assert(event.recordIds.length > 0, `Maya query trace event ${event.label} is missing record IDs.`);
  }
  assert(
    response.trace.some((event) => event.hook === "agent_handoff" && event.nextAgentName === "Recovery Drafter"),
    "Maya query trace did not include a visible Forensics-to-Recovery handoff."
  );
}

async function assertVisibleSelectedEvidenceScope(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  const selectedContextText = normalizeUiText(await page.getByTestId("maya-selected-evidence-context").innerText());
  const selectedLineText = normalizeUiText(await page.getByTestId("maya-query-selected-line").innerText());
  assert(
    selectedLineText.includes(detail.selected.lineId),
    `Maya query dock selected line ${selectedLineText} did not match backend detail ${detail.selected.lineId}.`
  );
  for (const recordId of detail.selected.evidencePack.recordIds) {
    if (recordId !== detail.selected.lineId) {
      assert(
        !selectedContextText.includes(normalizeUiText(recordId)),
        `Maya query compact selected evidence context leaked raw backend recordId ${recordId}; raw IDs belong in Source details.`
      );
    }
  }
  await expectVisibleLocator(page, '[data-testid="maya-query-source-details"]', "Maya query source details disclosure");
  const sourceDetails = page.getByTestId("maya-query-source-details");
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /^Source details$/u });
  if ((await sourceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await sourceDetailsTrigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-query-record-id"]', "Maya query source detail record IDs");
  const renderedRecordIds = (await sourceDetails.getByTestId("maya-query-record-id").evaluateAll((items) =>
    items.map((item) => item.textContent.trim()).filter((item) => item.length > 0)
  )).sort();
  assertSameRecordIds(
    renderedRecordIds,
    [...detail.selected.evidencePack.recordIds].sort(),
    "Maya query dock visible selected evidence scope"
  );
}

async function assertRenderedPromptChipsMatchBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  const promptSuggestions = detail.multimodalDock.promptSuggestions;
  const renderedChipLabels = (await page.getByTestId("maya-query-prompt-chip").allTextContents()).map(normalizeUiText);
  assert(
    renderedChipLabels.length === promptSuggestions.length,
    `Maya rendered ${renderedChipLabels.length.toString()} prompt chips for ${promptSuggestions.length.toString()} backend prompt suggestions.`
  );
  promptSuggestions.forEach((prompt, index) => {
    assert(
      renderedChipLabels[index] === normalizeUiText(prompt.label),
      `Maya prompt chip ${index.toString()} did not match backend prompt label ${prompt.label}.`
    );
    assert(prompt.question.trim().length > 0, `Backend prompt suggestion ${prompt.label} returned no question.`);
    assert(prompt.recordIds.length > 0, `Backend prompt suggestion ${prompt.label} returned no cited record IDs.`);
  });
}

function assertBrowserSubmittedQueryScope(
  payload: unknown,
  scenario: RealMayaQueryScenario,
  detail: ForensicsWorkItemDetailModel
): void {
  assert(typeof payload === "object" && payload !== null, "Maya browser submitted a non-object query payload.");
  const submitted = payload as { question?: unknown; recordIds?: unknown; selectedLineId?: unknown };
  assert(submitted.question === scenario.question, `Maya browser submitted the wrong query for scenario ${scenario.id}.`);
  assert(
    submitted.selectedLineId === detail.selected.lineId,
    `Maya browser submitted selectedLineId ${String(submitted.selectedLineId)} instead of ${detail.selected.lineId}.`
  );
  const submittedRecordIds = submitted.recordIds;
  assert(Array.isArray(submittedRecordIds), "Maya browser submitted query without selected recordIds.");
  assertSameRecordIds(
    submittedRecordIds.map((recordId) => String(recordId)).sort(),
    [...detail.selected.evidencePack.recordIds].sort(),
    `Maya browser submitted selected evidence scope for ${scenario.id}`
  );
}

function assertLiveAgentModelExecution(response: ForensicsQueryResponse): void {
  const modelExecution = response.modelExecution;
  assert(modelExecution !== undefined, "Maya query response is missing live-agent modelExecution proof.");
  assert(modelExecution.mode === "live_openai_agents", `Maya query modelExecution mode was ${modelExecution.mode}.`);
  assert(
    modelExecution.rawModelTextPolicy === "suppressed",
    "Maya query modelExecution did not suppress raw model text."
  );
  assert(
    typeof modelExecution.handoffCount === "number" && modelExecution.handoffCount > 0,
    "Maya query modelExecution did not record a live handoff."
  );
  const agentNames = modelExecution.agentNames;
  assert(Array.isArray(agentNames), "Maya query modelExecution omitted agent names.");
  assert(
    agentNames.includes("Forensics Investigator"),
    "Maya query modelExecution omitted Forensics Investigator."
  );
  assert(
    agentNames.includes("Recovery Drafter"),
    "Maya query modelExecution omitted Recovery Drafter."
  );
}

function assertAppQueryResponseMatchesBackend(
  backendResponse: ForensicsQueryResponse,
  appResponse: ForensicsQueryResponse
): void {
  assert(
    JSON.stringify(appResponse.modelExecution) === JSON.stringify(backendResponse.modelExecution),
    "App query response modelExecution did not match backend live-agent proof."
  );
  assert(
    appResponse.citations.length === backendResponse.citations.length,
    `App query citations length ${appResponse.citations.length.toString()} did not match backend citations length ${backendResponse.citations.length.toString()}.`
  );
  backendResponse.citations.forEach((backendCitation, index) => {
    const appCitation = appResponse.citations[index];
    assert(appCitation !== undefined, `App query response omitted backend citation ${index.toString()}.`);
    assert(
      appCitation.recordId === backendCitation.recordId,
      `App query citation recordId mismatch at ${index.toString()}: expected ${backendCitation.recordId}, received ${appCitation.recordId}.`
    );
    assert(
      appCitation.deterministicBasis === backendCitation.deterministicBasis,
      `App query citation deterministic basis mismatch for ${backendCitation.recordId}.`
    );
  });
  assert(
    appResponse.trace.length === backendResponse.trace.length,
    `App query trace length ${appResponse.trace.length.toString()} did not match backend trace length ${backendResponse.trace.length.toString()}.`
  );
  backendResponse.trace.forEach((backendEvent, index) => {
    const appEvent = appResponse.trace[index];
    assert(appEvent !== undefined, `App query response omitted backend trace event ${index.toString()}.`);
    assert(
      appEvent.label === backendEvent.label,
      `App query trace label mismatch at ${index.toString()}: expected ${backendEvent.label}, received ${appEvent.label}.`
    );
    assert(
      appEvent.deterministicBasis === backendEvent.deterministicBasis,
      `App query trace deterministic basis mismatch for ${backendEvent.label}.`
    );
    assertSameRecordIds(
      appEvent.recordIds,
      backendEvent.recordIds,
      `App query trace recordIds mismatch for ${backendEvent.label}`
    );
  });
}

async function assertRenderedTraceRowsMatchBackend(page: Page, backendTrace: readonly QueryTraceEvent[]): Promise<void> {
  await openAgentTraceDetailsAndReadText(page);

  try {
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-testid="maya-backend-trace-row"]').length === expected,
      backendTrace.length,
      { timeout: 20_000 }
    );
  } catch (caught) {
    const renderedRows = await visibleLocatorCount(page, '[data-testid="maya-backend-trace-row"]');
    const answeredSessions = await visibleLocatorCount(page, '[data-testid="maya-trace-answered-session"]');
    const runningSessions = await visibleLocatorCount(page, '[data-testid="maya-trace-running-session"]');
    const queryDockText =
      (await visibleLocatorCount(page, '[data-testid="maya-query-dock"]')) > 0
        ? normalizeUiText(await page.getByTestId("maya-query-dock").innerText())
        : "query dock not visible";
    throw new Error(
      `Maya backend trace rows did not render before timeout: rendered=${renderedRows.toString()} expected=${backendTrace.length.toString()} answered=${answeredSessions.toString()} running=${runningSessions.toString()} dock=${JSON.stringify(queryDockText)} cause=${
        caught instanceof Error ? caught.message : String(caught)
      }`
    );
  }
  const renderedRows = await page.getByTestId("maya-backend-trace-row").evaluateAll((rows) =>
    rows.map((row) => row.textContent)
  );
  assert(
    renderedRows.length === backendTrace.length,
    `Rendered Maya backend trace row count ${renderedRows.length.toString()} did not match backend trace length ${backendTrace.length.toString()}.`
  );
  backendTrace.forEach((event, index) => {
    const renderedText = normalizeUiText(renderedRows[index] ?? "");
    assert(
      renderedText.includes(normalizeUiText(event.label)),
      `Rendered Maya trace row ${index.toString()} did not include backend label ${event.label}.`
    );
    assert(
      renderedText.includes(normalizeUiText(event.hook)),
      `Rendered Maya trace row ${index.toString()} did not include backend hook ${event.hook}.`
    );
    assert(
      renderedText.includes(normalizeUiText(event.agentName)),
      `Rendered Maya trace row ${index.toString()} did not include backend agent ${event.agentName}.`
    );
    assert(
      renderedText.includes(normalizeUiText(event.deterministicBasis)),
      `Rendered Maya trace row ${index.toString()} did not include backend deterministic basis for ${event.label}.`
    );
    for (const recordId of event.recordIds) {
      assert(
        renderedText.includes(normalizeUiText(recordId)),
        `Rendered Maya trace row ${index.toString()} did not include backend recordId ${recordId}.`
      );
    }
  });
}

async function assertAgentProcessMapBeforeQuery(
  page: Page,
  detail: ForensicsWorkItemDetailModel,
  connectorsModel: ConnectorRealBackendModel
): Promise<void> {
  await page.getByTestId("maya-case-agent-trace-tab").click();
  await expectVisibleLocator(page, '[data-testid="maya-agent-process-map"]', "Maya agent process map before query");
  await expectVisibleLocator(page, '[data-testid="maya-agent-process-node"]', "Maya agent process node before query");
  const sourceTiles = connectorsModel.sourceTiles;
  const renderedProcessNodes = await readRenderedAgentProcessNodes(page);
  const renderedProcessText = normalizeUiText(renderedProcessNodes.map((node) => node.text).join(" "));
  const recordIdsInProcessNodeData = new Set(renderedProcessNodes.flatMap((node) => splitRecordIdsAttribute(node.recordIds)));
  const selectedLineId = detail.selected.lineId;
  assert(
    renderedProcessNodes.length > 0 && sourceTiles.length > 0,
    `Pre-query process map rendered ${renderedProcessNodes.length.toString()} nodes for ${sourceTiles.length.toString()} backend source tiles.`
  );
  assert(
    renderedProcessText.includes(normalizeUiText(selectedLineId)),
    `Pre-query process map omitted selected backend line ${selectedLineId}.`
  );
  const traceDetailsText = await openAgentTraceDetailsAndReadText(page);
  for (const recordId of detail.selected.evidencePack.recordIds) {
    if (recordId !== selectedLineId) {
      assert(
        !renderedProcessText.includes(normalizeUiText(recordId)),
        `Pre-query compact process map leaked selected backend evidence recordId ${recordId}; raw IDs belong in Trace details or data-record-ids.`
      );
    }
    assert(
      recordIdsInProcessNodeData.has(recordId),
      `Pre-query process map omitted selected backend evidence recordId ${recordId} from data-record-ids.`
    );
    assert(
      traceDetailsText.includes(normalizeUiText(recordId)),
      `Pre-query Trace details omitted selected backend evidence recordId ${recordId}.`
    );
  }
  assert(
    renderedProcessNodes.some(
      (node) =>
        node.sourceKind === "sap_odata" ||
        node.retrievalSource === "sap_odata" ||
        node.text.includes("SAP OData")
    ),
    "Pre-query process map omitted SAP OData retrieval provenance from backend/read-model evidence."
  );
  assert(
    renderedProcessNodes.some((node) => {
      const renderedText = normalizeUiText(node.text);
      const hasSupabaseProvenance =
        node.sourceKind === "supabase" ||
        node.retrievalSource === "supabase" ||
        renderedText.includes("Supabase source-backed retrieval");
      const hasSourceBackedUiSummary =
        node.uiProcessKind !== null && node.retrievalSource === null && node.sourceKind === null;
      const hasVisibleSourceBackedBackendLabel = /\bsource-backed\b/iu.test(renderedText) || /\bbackend\b/iu.test(renderedText);

      return hasSupabaseProvenance || (hasSourceBackedUiSummary && hasVisibleSourceBackedBackendLabel);
    }),
    "Pre-query process map omitted Supabase/source-backed retrieval provenance from backend/read-model evidence."
  );
}

async function assertAgentProcessMapAfterQuery(page: Page, queryResult: ForensicsQueryE2EResult): Promise<void> {
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await page.getByTestId("maya-case-agent-trace-tab").click();
  await expectVisibleLocator(page, '[data-testid="maya-agent-process-map"]', "Maya agent process map after query");
  await expectVisibleLocator(page, '[data-testid="maya-agent-process-node"]', "Maya agent process node after query");
  const backendTrace = queryResult.backendResponse.trace;
  const renderedProcessNodes = await readRenderedAgentProcessNodes(page);
  const backendTraceNodes = renderedProcessNodes.filter(isRenderedBackendTraceNode);
  assert(
    backendTraceNodes.length === backendTrace.length,
    `Post-query process map rendered ${backendTraceNodes.length.toString()} backend trace nodes inside ${renderedProcessNodes.length.toString()} compact nodes for ${backendTrace.length.toString()} backend trace rows. Backend=${JSON.stringify(
      backendTrace.map((event) => ({
        agentName: event.agentName,
        hook: event.hook,
        label: event.label,
        phase: event.phase
      }))
    )} Rendered=${JSON.stringify(
      renderedProcessNodes.map((node) => ({
        agentName: node.agentName,
        kind: node.processNodeKind,
        label: node.traceLabel,
        retrievalSource: node.retrievalSource,
        sourceKind: node.sourceKind,
        uiKind: node.uiProcessKind
      }))
    )}.`
  );
  await assertRenderedAgentTracePanelMatchesBackend(page, queryResult);
}

async function assertRenderedAgentTracePanelMatchesBackend(
  page: Page,
  queryResult: ForensicsQueryE2EResult
): Promise<void> {
  const backendTrace = queryResult.backendResponse.trace;
  const appTrace = queryResult.appResponse.trace;
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace"]', "Maya agent trace panel");
  await expectVisibleLocator(page, '[data-testid="maya-agent-process-node"]', "Maya agent trace panel process node");
  const renderedProcessNodeCount = await page.getByTestId("maya-agent-process-node").count();
  const renderedProcessNodes = await readRenderedAgentProcessNodes(page);
  const backendTraceNodes = renderedProcessNodes.filter(isRenderedBackendTraceNode);
  const traceDetailsText = await openAgentTraceDetailsAndReadText(page);
  assert(
    renderedProcessNodeCount === renderedProcessNodes.length &&
      backendTraceNodes.length === backendTrace.length &&
      appTrace.length === backendTrace.length,
    `Agent trace panel rendered rows asserted against backend/app trace: rendered ${renderedProcessNodeCount.toString()}, backend trace nodes ${backendTraceNodes.length.toString()}, backend ${backendTrace.length.toString()}, app ${appTrace.length.toString()}.`
  );
  for (const event of backendTrace) {
    const renderedNode = findRenderedAgentProcessNodeForTraceEvent(backendTraceNodes, event);
    assert(renderedNode !== undefined, `Agent trace panel omitted backend process node ${event.label}.`);
    const renderedText = normalizeUiText(renderedNode.text);
    assert(processNodeMatchesTraceLabel(renderedNode, event), `Agent process node omitted backend trace label ${event.label}.`);
    assert(
      processNodeMatchesAgentName(renderedNode, event),
      `Agent process node ${event.label} data-agent-node omitted backend agent ${event.agentName}.`
    );
    assert(renderedProcessNodeMatchesPhase(renderedNode, event), `Agent process node ${event.label} omitted backend phase ${event.phase}.`);
    assert(
      normalizeUiText(renderedNode.hook ?? "") === normalizeUiText(event.hook),
      `Agent process node ${event.label} data-hook omitted backend hook ${event.hook}.`
    );
    assert(
      normalizeUiText(renderedNode.deterministicBasis ?? "") === normalizeUiText(event.deterministicBasis) ||
        traceDetailsText.includes(normalizeUiText(event.deterministicBasis)),
      `Agent process node ${event.label} omitted backend deterministic basis from data-deterministic-basis and trace details.`
    );
    const renderedNodeRecordIds = new Set(splitRecordIdsAttribute(renderedNode.recordIds));
    for (const recordId of event.recordIds) {
      assert(
        renderedNodeRecordIds.has(recordId),
        `Agent process node ${event.label} omitted backend recordId ${recordId} from data-record-ids.`
      );
      assert(
        traceDetailsText.includes(normalizeUiText(recordId)),
        `Agent trace details omitted backend recordId ${recordId} for process node ${event.label}.`
      );
    }
    const expectedSourceKind = expectedTraceSourceKind(event);
    assert(
      renderedNode.sourceKind === expectedSourceKind || renderedNode.retrievalSource === expectedSourceKind,
      `Agent process node ${event.label} rendered source ${renderedNode.sourceKind ?? renderedNode.retrievalSource ?? "missing"} instead of backend-derived ${expectedSourceKind}.`
    );
    if (event.sourceKind !== undefined) {
      assert(
        renderedNode.sourceKind === event.sourceKind,
        `Agent process node ${event.label} rendered sourceKind ${renderedNode.sourceKind ?? "missing"} instead of backend sourceKind ${event.sourceKind}.`
      );
    }
    if (event.retrievalSource !== undefined) {
      assert(
        renderedNode.retrievalSource === event.retrievalSource,
        `Agent process node ${event.label} rendered retrievalSource ${renderedNode.retrievalSource ?? "missing"} instead of backend retrievalSource ${event.retrievalSource}.`
      );
    }
    if (event.retrievalSource === "source_backed") {
      assert(
        renderedText.includes("Source-backed"),
        `Agent process node ${event.label} did not label source-backed retrieval honestly. Rendered sourceKind=${
          renderedNode.sourceKind ?? "missing"
        } retrievalSource=${renderedNode.retrievalSource ?? "missing"} text=${JSON.stringify(renderedText)}.`
      );
    }
  }
}

function isRenderedBackendTraceNode(node: RenderedAgentProcessNode): boolean {
  return node.traceLabel !== null && node.agentName !== null && node.hook !== null;
}

function findRenderedAgentProcessNodeForTraceEvent(
  renderedProcessNodes: readonly RenderedAgentProcessNode[],
  event: QueryTraceEvent
): RenderedAgentProcessNode | undefined {
  const exactAttributeMatches = renderedProcessNodes.filter(
    (node) =>
      processNodeMatchesTraceLabel(node, event) &&
      processNodeMatchesAgentName(node, event) &&
      processNodeMatchesHook(node, event)
  );
  const labelAndAgentMatches = renderedProcessNodes.filter(
    (node) => processNodeMatchesTraceLabel(node, event) && processNodeMatchesAgentName(node, event)
  );
  const labelMatches = renderedProcessNodes.filter((node) => processNodeMatchesTraceLabel(node, event));
  const agentMatches = renderedProcessNodes.filter((node) => processNodeMatchesAgentName(node, event));

  return (
    exactAttributeMatches.find((node) => renderedProcessNodeMatchesPhase(node, event)) ?? exactAttributeMatches[0] ??
    labelAndAgentMatches.find((node) => renderedProcessNodeMatchesPhase(node, event)) ??
    labelAndAgentMatches[0] ??
    labelMatches.find((node) => processNodeMatchesHook(node, event) && renderedProcessNodeMatchesPhase(node, event)) ??
    labelMatches.find((node) => processNodeMatchesHook(node, event)) ??
    labelMatches.find((node) => renderedProcessNodeMatchesPhase(node, event)) ??
    agentMatches.find(
      (node) =>
        processNodeMatchesHook(node, event) &&
        renderedProcessNodeMatchesPhase(node, event)
    ) ??
    agentMatches.find((node) => processNodeMatchesHook(node, event)) ??
    agentMatches.find((node) => renderedProcessNodeMatchesPhase(node, event)) ??
    labelMatches[0] ??
    undefined
  );
}

function processNodeMatchesTraceLabel(node: RenderedAgentProcessNode, event: QueryTraceEvent): boolean {
  return normalizeUiText(node.traceLabel ?? "") === normalizeUiText(event.label);
}

function processNodeMatchesAgentName(node: RenderedAgentProcessNode, event: QueryTraceEvent): boolean {
  return normalizeUiText(node.agentName ?? "") === normalizeUiText(event.agentName);
}

function processNodeMatchesHook(node: RenderedAgentProcessNode, event: QueryTraceEvent): boolean {
  return normalizeUiText(node.hook ?? "") === normalizeUiText(event.hook);
}

function renderedProcessNodeMatchesPhase(node: RenderedAgentProcessNode, event: QueryTraceEvent): boolean {
  const normalizedPhase = normalizeUiText(event.phase);
  return normalizeUiText(node.phase ?? "") === normalizedPhase || normalizeUiText(node.text).includes(normalizedPhase);
}

function assertAgentTraceNodeMatchingDisambiguatesDuplicateLabels(): void {
  const duplicateLabelEvent: QueryTraceEvent = {
    agentName: "Recovery Drafter",
    deterministicBasis: "OpenAI Agents SDK live trace event",
    hook: "agent_start",
    label: "agent start",
    phase: "draft_recovery",
    recordIds: ["TRACE-RECORD-001"],
    retrievalSource: "source_backed",
    sourceKind: "agent_trace"
  };
  const renderedNode = findRenderedAgentProcessNodeForTraceEvent(
    [
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK live trace event",
        hook: "agent_start",
        phase: null,
        processNodeKind: "agent-trace",
        recordIds: "TRACE-RECORD-001",
        retrievalSource: "source_backed",
        sourceKind: "agent_trace",
        text: "agent start Forensics Investigator investigate OpenAI Agents SDK live trace event TRACE-RECORD-001",
        traceLabel: "agent start",
        uiProcessKind: null
      },
      {
        agentName: "Recovery Drafter",
        deterministicBasis: "OpenAI Agents SDK live trace event",
        hook: "agent_start",
        phase: null,
        processNodeKind: "agent-trace",
        recordIds: "TRACE-RECORD-001",
        retrievalSource: "source_backed",
        sourceKind: "agent_trace",
        text: "agent start Recovery Drafter draft_recovery OpenAI Agents SDK live trace event TRACE-RECORD-001",
        traceLabel: "agent start",
        uiProcessKind: null
      }
    ],
    duplicateLabelEvent
  );

  assert(
    renderedNode?.agentName === duplicateLabelEvent.agentName,
    "Agent trace matcher did not disambiguate duplicate backend labels by agent name."
  );

  const scopeAcceptedEvent: QueryTraceEvent = {
    agentName: "Forensics Supervisor",
    deterministicBasis: "OpenAI Agents SDK live trace event",
    hook: "scope_accept",
    label: "Scope accepted",
    phase: "scope_resolution",
    recordIds: ["TRACE-RECORD-002"],
    retrievalSource: "source_backed",
    sourceKind: "agent_trace"
  };
  const scopeAcceptedNode = findRenderedAgentProcessNodeForTraceEvent(
    [
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK live trace event",
        hook: "agent_start",
        phase: null,
        processNodeKind: "agent-trace",
        recordIds: "TRACE-RECORD-002",
        retrievalSource: "source_backed",
        sourceKind: "agent_trace",
        text: "Scope accepted investigate OpenAI Agents SDK live trace event TRACE-RECORD-002",
        traceLabel: "Scope accepted",
        uiProcessKind: null
      },
      {
        agentName: "Forensics Supervisor",
        deterministicBasis: "OpenAI Agents SDK live trace event",
        hook: "scope_accept",
        phase: null,
        processNodeKind: "agent-trace",
        recordIds: "TRACE-RECORD-002",
        retrievalSource: "source_backed",
        sourceKind: "agent_trace",
        text: "Scope accepted scope_resolution OpenAI Agents SDK live trace event TRACE-RECORD-002",
        traceLabel: "Scope accepted",
        uiProcessKind: null
      }
    ],
    scopeAcceptedEvent
  );

  assert(
    scopeAcceptedNode?.agentName === scopeAcceptedEvent.agentName &&
      scopeAcceptedNode.hook === scopeAcceptedEvent.hook &&
      renderedProcessNodeMatchesPhase(scopeAcceptedNode, scopeAcceptedEvent),
    "Agent trace matcher did not prefer exact Scope accepted agent/hook/phase attributes before fallback."
  );
}

async function readRenderedAgentProcessNodes(page: Page): Promise<RenderedAgentProcessNode[]> {
  return page.getByTestId("maya-agent-process-node").evaluateAll((nodes) =>
    nodes.map((node) => ({
      agentName: node.getAttribute("data-agent-node"),
      deterministicBasis: node.getAttribute("data-deterministic-basis"),
      hook: node.getAttribute("data-hook"),
      phase: node.getAttribute("data-phase"),
      processNodeKind: node.getAttribute("data-process-node-kind"),
      recordIds: node.getAttribute("data-record-ids"),
      retrievalSource: node.getAttribute("data-retrieval-source"),
      sourceKind: node.getAttribute("data-source-kind"),
      text: node.textContent,
      traceLabel: node.getAttribute("data-trace-label"),
      uiProcessKind: node.getAttribute("data-ui-process-kind")
    }))
  );
}

async function openAgentTraceDetailsAndReadText(page: Page): Promise<string> {
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace-details"]', "Maya trace details disclosure");
  const traceDetails = page.getByTestId("maya-agent-trace-details");
  const trigger = traceDetails.getByRole("button", { name: /^Trace details$/u });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }

  return normalizeUiText(await traceDetails.innerText());
}

function splitRecordIdsAttribute(recordIds: string | null): string[] {
  return (recordIds ?? "")
    .split(/\s+/u)
    .map((recordId) => recordId.trim())
    .filter((recordId) => recordId.length > 0);
}

function expectedTraceSourceKind(event: QueryTraceEvent): string {
  const toolName = event.toolName?.toLowerCase() ?? "";
  if (event.sourceKind === "sap_odata" || event.retrievalSource === "sap_odata" || toolName.includes("sap")) {
    return "sap_odata";
  }
  if (event.sourceKind === "supabase" || event.retrievalSource === "supabase" || toolName.includes("supabase")) {
    return "supabase";
  }
  if (event.retrievalSource === "source_backed" || toolName.includes("sourcebacked")) {
    return "source_backed";
  }
  if (toolName.startsWith("retrieval.")) {
    return event.sourceKind ?? "source_backed";
  }

  return event.sourceKind ?? "agent_trace";
}

function assertTraceSourceProvenanceHonest(response: ForensicsQueryResponse): void {
  const retrievalEvent = response.trace.find((event) => event.label === "Evidence cited");
  assert(retrievalEvent !== undefined, "Maya query trace omitted the Evidence cited retrieval event.");
  const citationSourceKinds = new Set(response.citations.map(citationTraceSourceKind));
  const hasMixedCitationSources = citationSourceKinds.size > 1;
  const hasGenericSourceBackedCitation = citationSourceKinds.has("source_backed");
  if (hasMixedCitationSources || hasGenericSourceBackedCitation) {
    assert(
      retrievalEvent.retrievalSource === "source_backed",
      `Mixed/source-backed citations rendered retrievalSource ${retrievalEvent.retrievalSource ?? "missing"} instead of source_backed.`
    );
    assert(
      retrievalEvent.sourceKind === "derived_backend",
      `Mixed/source-backed citations rendered sourceKind ${retrievalEvent.sourceKind ?? "missing"} instead of derived_backend.`
    );
  }
}

function citationTraceSourceKind(citation: ForensicsQueryResponse["citations"][number]): string {
  if (citation.source === "sap") {
    return "sap_odata";
  }
  if (citation.source === "supabase") {
    return "supabase";
  }

  return "source_backed";
}

async function assertRenderedCitedAnswerMatchesBackend(
  page: Page,
  scenario: RealMayaQueryScenario,
  backendResponse: ForensicsQueryResponse
): Promise<void> {
  assert(backendResponse.answer !== undefined, `Maya query scenario ${scenario.id} returned no backend answer.`);
  assert(backendResponse.deterministicBasis !== undefined, `Maya query scenario ${scenario.id} returned no backend basis.`);

  const submittedQueryText = normalizeUiText(await page.getByTestId("maya-submitted-query").innerText());
  assert(
    submittedQueryText.includes(normalizeUiText(scenario.question)),
    `Maya UI did not render submitted query for scenario ${scenario.id}.`
  );

  const assistantText = normalizeUiText(await page.getByTestId("maya-query-assistant-message").innerText());
  assert(
    !assistantText.includes(normalizeUiText(backendResponse.answer)),
    `Maya assistant status bubble duplicated backend answer for scenario ${scenario.id}.`
  );
  const citedReviewText = normalizeUiText(await page.getByTestId("maya-cited-answer-text").innerText());
  assert(
    citedReviewText.includes(normalizeUiText(backendResponse.answer)),
    `Maya cited answer card did not render backend answer for scenario ${scenario.id}.`
  );
  const combinedAssistantAnswerText = normalizeUiText(`${assistantText} ${citedReviewText}`);
  assert(
    countNormalizedOccurrences(combinedAssistantAnswerText, backendResponse.answer) === 1,
    `Maya assistant/provenance region duplicated or omitted the backend answer for scenario ${scenario.id}.`
  );
  const basisText = normalizeUiText(await page.getByTestId("maya-cited-answer-basis").innerText());
  assert(
    basisText.includes(normalizeUiText(backendResponse.deterministicBasis)),
    `Maya visible deterministic basis did not match backend basis for scenario ${scenario.id}.`
  );

  const citedSourceDetails = page.getByTestId("maya-cited-source-details");
  await citedSourceDetails.waitFor({ state: "visible", timeout: 20_000 });
  if ((await citedSourceDetails.getAttribute("data-state")) !== "open") {
    await citedSourceDetails.getByRole("button", { name: "Sources" }).click();
  }
  const citationRows = page.getByTestId("maya-cited-record-row");
  if (backendResponse.citations.length > 0) {
    await citationRows.first().waitFor({ state: "visible", timeout: 20_000 });
  }
  const renderedCitationCount = await citationRows.count();
  assert(
    renderedCitationCount === backendResponse.citations.length,
    `Maya rendered ${renderedCitationCount.toString()} citation rows for ${backendResponse.citations.length.toString()} backend citations.`
  );
  const renderedCitationRecordIds = await citationRows.evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-record-id") ?? "")
  );
  assertSameRecordIds(
    renderedCitationRecordIds,
    backendResponse.citations.map((citation) => citation.recordId),
    `Maya rendered cited record row order for scenario ${scenario.id}`
  );
  const metadataGapCount = await page.locator('[data-testid="maya-cited-record-row"][data-metadata-gap="true"]').count();
  assert(metadataGapCount === 0, `Maya rendered ${metadataGapCount.toString()} cited record metadata gaps.`);

  for (const citation of backendResponse.citations) {
    const row = page.locator(`[data-testid="maya-cited-record-row"][data-record-id="${escapeAttributeValue(citation.recordId)}"]`);
    await row.waitFor({ state: "visible", timeout: 20_000 });
    const rowText = normalizeUiText(await row.innerText());
    assert(rowText.includes(citation.recordId), `Maya visible citation row omitted recordId ${citation.recordId}.`);
    assert(
      rowText.includes(normalizeUiText(citation.deterministicBasis)),
      `Maya visible citation row ${citation.recordId} omitted backend citation deterministicBasis.`
    );
    for (const field of ["documentId", "source", "summary"] as const) {
      const value = citation[field];
      if (value !== undefined) {
        assert(
          rowText.includes(normalizeUiText(value)),
          `Maya visible citation row ${citation.recordId} omitted backend citation ${field}.`
        );
      }
    }
  }
}

async function assertRenderedConversationTurnsMatchBackend(
  page: Page,
  queryResult: ForensicsQueryE2EResult
): Promise<void> {
  assert(
    queryResult.backendResponse.answer !== undefined,
    `Maya query scenario ${queryResult.scenario.id} returned no backend answer.`
  );
  assert(
    queryResult.backendResponse.deterministicBasis !== undefined,
    `Maya query scenario ${queryResult.scenario.id} returned no backend deterministic basis.`
  );
  const userTurnText = normalizeUiText(await page.getByTestId("maya-query-user-message").innerText());
  assert(
    userTurnText.includes(normalizeUiText(queryResult.scenario.question)),
    `Maya user conversation turn did not match backend query scenario ${queryResult.scenario.id}.`
  );
  const assistantTurnText = normalizeUiText(await page.getByTestId("maya-query-assistant-message").innerText());
  const citedRecordIdCount = new Set(
    queryResult.backendResponse.citations.map((citation) => citation.recordId.trim()).filter((recordId) => recordId.length > 0)
  ).size;
  assert(
    !assistantTurnText.includes(normalizeUiText(queryResult.backendResponse.answer)),
    `Maya assistant status bubble duplicated backend answer for ${queryResult.scenario.id}.`
  );
  assert(
    !assistantTurnText.includes(normalizeUiText(queryResult.backendResponse.deterministicBasis)),
    `Maya assistant status bubble duplicated backend basis for ${queryResult.scenario.id}.`
  );
  assert(
    assistantTurnText.includes(`${queryResult.backendResponse.citations.length.toString()} citations`),
    `Maya assistant status bubble omitted backend citation count for ${queryResult.scenario.id}.`
  );
  assert(
    assistantTurnText.includes(`${citedRecordIdCount.toString()} record IDs`),
    `Maya assistant status bubble omitted backend cited record ID count for ${queryResult.scenario.id}.`
  );
  for (const citation of queryResult.backendResponse.citations) {
    assert(
      !assistantTurnText.includes(normalizeUiText(citation.deterministicBasis)),
      `Maya assistant status bubble duplicated backend citation basis for ${citation.recordId}.`
    );
  }
}

async function assertReturnToWorklistRestoresWorklist(
  page: Page,
  forensicsModel: ForensicsRealBackendModel,
  detail: ForensicsWorkItemDetailModel
): Promise<void> {
  const returnControl = page.getByTestId("maya-case-return-to-worklist");
  assert((await returnControl.count()) > 0, "Maya case detail is missing the persistent return-to-worklist control.");
  await returnControl.click();
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-worklist-page"]', "Maya returned worklist");
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-return-table"]', "Maya restored Beat 12 return worklist table");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "maya-beat-12-return-table",
    undefined,
    { timeout: 10_000 }
  );
  const renderedRowCount = await page.getByTestId("maya-worklist-row").count();
  assert(
    renderedRowCount === forensicsModel.worklist.length,
    `Maya restored ${renderedRowCount.toString()} worklist rows for ${forensicsModel.worklist.length.toString()} backend rows.`
  );
  const returnedDetailRow = page.locator(
    `[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(detail.lineId)}"]`
  );
  await returnedDetailRow.waitFor({ state: "visible", timeout: 20_000 });
  const visibleCaseWorkspaceCount = await visibleLocatorCount(page, '[data-testid="maya-case-workspace"]');
  assert(
    visibleCaseWorkspaceCount === 0,
    "Maya case-detail-only state was not cleared after returning to the worklist."
  );
}

async function captureMayaBeat(page: Page, slug: string): Promise<void> {
  await page.screenshot({
    fullPage: true,
    path: join(screenshotDir, `maya-real-backend-beat-${slug}.png`)
  });
}

async function closeVisibleOverlay(page: Page, selector: string): Promise<void> {
  const closeButton = page.getByRole("button", { name: /^(Close|Cancel|Close human approval dialog)$/u }).last();
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible())) {
    await closeButton.click();
    await page.locator(selector).waitFor({ state: "hidden", timeout: 10_000 });
    return;
  }

  await page.keyboard.press("Escape");
  await page.locator(selector).waitFor({ state: "hidden", timeout: 10_000 });
}

async function visibleLocatorCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.filter((node) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).length
  );
}

function assertForensicsModelReady(model: ForensicsRealBackendModel): void {
  assert(model.surface === "forensics-analyst", "Real backend /forensics returned the wrong surface.");
  assert(model.worklist.length > 0, "Real backend /forensics returned no Maya worklist rows.");
  assert(model.worklist.every((item) => item.lineId.length > 0), "Real backend /forensics returned a worklist row without lineId.");
}

function assertConnectorModelReady(model: ConnectorRealBackendModel): void {
  assert(model.surface === "connector-readiness", "Real backend /connectors returned the wrong surface.");
  assert(model.sourceTiles.length > 0, "Real backend /connectors returned no source readiness rows.");
  assert(
    model.sourceTiles.some((source) => source.key === "sap-odata"),
    "Real backend /connectors returned no SAP OData readiness tile."
  );
  assert(
    model.sourceTiles.some((source) => source.key === "mcp" && source.statusTone === "ready"),
    "Real backend /connectors returned no ready MCP source readiness tile."
  );
}

async function assertRootSidebarSectionNavigation(page: Page, forensicsModel: ForensicsRealBackendModel): Promise<void> {
  const rootSections = [
    { buttonName: /^Overview$/u, label: "Overview", testId: "maya-root-section-overview" },
    { buttonName: /^Worklist$/u, label: "Worklist", testId: "maya-root-section-worklist" },
    { buttonName: /^Cases$/u, label: "Cases", testId: "maya-root-section-cases" },
    { buttonName: /^Evidence$/u, label: "Evidence", testId: "maya-root-section-evidence" },
    { buttonName: /^Approvals$/u, label: "Approvals", testId: "maya-root-section-approvals" }
  ] as const;

  for (const section of rootSections) {
    await page.getByRole("button", { name: section.buttonName }).click();
    await expectVisibleLocator(page, `[data-testid="${section.testId}"]`, `Maya ${section.label} root section`);
  }

  const renderedNavItems = await page.getByTestId("maya-sidebar-nav-item").count();
  assert(
    renderedNavItems >= rootSections.length,
    `Maya sidebar rendered ${renderedNavItems.toString()} root nav items for ${rootSections.length.toString()} sections.`
  );
  const expectedWorklistCount = forensicsModel.worklist.length.toString();
  const expectedActionCount = forensicsModel.actionInbox.length.toString();
  const sidebarText = normalizeUiText(await page.getByTestId("maya-sidebar").innerText());
  assert(sidebarText.includes(expectedWorklistCount), `Maya sidebar omitted backend worklist count ${expectedWorklistCount}.`);
  assert(sidebarText.includes(expectedActionCount), `Maya sidebar omitted backend approval count ${expectedActionCount}.`);

  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist root section");
}

async function assertRenderedKpiStripMatchesBackend(page: Page, forensicsModel: ForensicsRealBackendModel): Promise<void> {
  assert(forensicsModel.kpiStrip.length > 0, "Real backend /forensics returned no KPI strip rows.");
  await page.getByRole("button", { name: /^Overview$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview root section");
  await expectVisibleLocator(page, '[data-testid="maya-run-kpi-strip"]', "Maya run KPI strip");
  const renderedKpiCards = page.getByTestId("maya-kpi-card");
  const renderedKpiCardCount = await renderedKpiCards.count();
  assert(
    renderedKpiCardCount === forensicsModel.kpiStrip.length,
    `Maya KPI strip rendered ${renderedKpiCardCount.toString()} KPI cards for ${forensicsModel.kpiStrip.length.toString()} backend rows.`
  );
  const renderedKpiLabels = await renderedKpiCards.evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-kpi-label") ?? "")
  );
  const renderedKpiTexts = await renderedKpiCards.evaluateAll((cards) => cards.map((card) => card.textContent));
  forensicsModel.kpiStrip.forEach((item, index) => {
    const renderedLabel = renderedKpiLabels.at(index) ?? "";
    const renderedText = normalizeUiText(renderedKpiTexts.at(index) ?? "");
    assert(renderedLabel === item.label, `Maya KPI strip changed backend KPI order at ${index.toString()}: ${renderedLabel}.`);
    assert(renderedText.includes(normalizeUiText(item.label)), `Maya KPI strip omitted backend KPI label ${item.label}.`);
    assert(renderedText.includes(normalizeUiText(item.value)), `Maya KPI strip omitted backend KPI value for ${item.label}.`);
    assert(renderedText.includes(normalizeUiText(item.support)), `Maya KPI strip omitted backend KPI support for ${item.label}.`);
  });
}

async function assertRenderedSourceReadinessMatchesBackend(
  page: Page,
  connectorsModel: ConnectorRealBackendModel
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-source-readiness-strip"]', "Maya source readiness strip");
  const sourceTiles = page.getByTestId("maya-source-tile");
  const sourceStatuses = page.getByTestId("maya-source-status");
  const renderedTileCount = await sourceTiles.count();
  const renderedStatusCount = await sourceStatuses.count();
  assert(
    renderedTileCount === connectorsModel.sourceTiles.length,
    `Maya rendered ${renderedTileCount.toString()} source tiles for ${connectorsModel.sourceTiles.length.toString()} backend sources.`
  );
  assert(
    renderedStatusCount === connectorsModel.sourceTiles.length,
    `Maya rendered ${renderedStatusCount.toString()} source statuses for ${connectorsModel.sourceTiles.length.toString()} backend sources.`
  );
  const renderedTileText = normalizeUiText(await sourceTiles.evaluateAll((tiles) => tiles.map((tile) => tile.textContent).join(" ")));
  const renderedTileMetadata = await sourceTiles.evaluateAll((tiles) =>
    tiles.map((tile) => ({
      statusTone: tile.getAttribute("data-status-tone"),
      label: tile.getAttribute("aria-label") ?? "",
      text: tile.textContent
    }))
  );
  for (const source of connectorsModel.sourceTiles) {
    const renderedSource = renderedTileMetadata.find((tile) => normalizeUiText(tile.label).includes(normalizeUiText(source.label)));
    assert(renderedSource !== undefined, `Maya visible source readiness omitted backend source ${source.label}.`);
    assert(
      renderedTileText.includes(normalizeUiText(source.label)),
      `Maya visible source readiness omitted backend source ${source.label}.`
    );
    assert(
      renderedSource.statusTone === source.statusTone,
      `Maya source readiness tile ${source.label} rendered status tone ${renderedSource.statusTone ?? "missing"} instead of ${source.statusTone}.`
    );
    assert(
      normalizeUiText(renderedSource.label).includes(normalizeUiText(source.stateLabel)),
      `Maya source readiness tile ${source.label} omitted backend state ${source.stateLabel}.`
    );
  }
  console.log(
    `MAYA_SOURCE_READINESS_RESULT ${JSON.stringify(
      connectorsModel.sourceTiles.map((source) => ({
        key: source.key,
        label: source.label,
        stateLabel: source.stateLabel,
        statusTone: source.statusTone
      }))
    )}`
  );
}

async function assertRenderedWorklistTableMatchesBackend(page: Page, forensicsModel: ForensicsRealBackendModel): Promise<void> {
  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist root section");
  await expectVisibleLocator(page, '[data-testid="maya-worklist-table"]', "Maya worklist table");
  const renderedRows = page.getByTestId("maya-worklist-row");
  const renderedRowCount = await renderedRows.count();
  assert(
    renderedRowCount === forensicsModel.worklist.length,
    `Maya rendered ${renderedRowCount.toString()} worklist rows for ${forensicsModel.worklist.length.toString()} backend worklist rows.`
  );
  for (const item of forensicsModel.worklist) {
    const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(item.lineId)}"]`).first();
    await row.waitFor({ state: "visible", timeout: 20_000 });
    const rowText = normalizeUiText(await row.innerText());
    for (const expectedText of [
      item.lineId,
      item.scenarioLabel,
      item.customerLabel,
      item.amount,
      item.verdictLabel,
      item.evidenceScoreLabel,
      item.evidenceLabel,
      item.queueLabel,
      item.routingLabel
    ]) {
      assert(
        rowText.includes(normalizeUiText(expectedText)),
        `Maya worklist row ${item.lineId} omitted backend text ${expectedText}.`
      );
    }
  }
}

async function assertRenderedRecommendedActionCellMatchesBackend(
  page: Page,
  forensicsModel: ForensicsRealBackendModel
): Promise<void> {
  const renderedBadges = page.getByTestId("maya-recommended-action-badge");
  const renderedBadgeCount = await renderedBadges.count();
  assert(
    renderedBadgeCount === forensicsModel.worklist.length,
    `Maya rendered ${renderedBadgeCount.toString()} recommended action badges for ${forensicsModel.worklist.length.toString()} backend worklist rows.`
  );
  for (const item of forensicsModel.worklist) {
    const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(item.lineId)}"]`).first();
    const badgeText = normalizeUiText(await row.getByTestId("maya-recommended-action-badge").innerText());
    assert(
      badgeText.includes(normalizeUiText(item.recommendedActionLabel)),
      `Maya recommended action badge for ${item.lineId} omitted backend action ${item.recommendedActionLabel}.`
    );
  }
}

async function assertRenderedEvidenceDossierMatchesBackend(
  page: Page,
  detail: ForensicsWorkItemDetailModel,
  connectorsModel: ConnectorRealBackendModel
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-evidence-dossier"]', "Maya evidence dossier");
  const renderedDossierText = normalizeUiText(await page.getByTestId("maya-evidence-dossier").innerText());
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(renderedDossierText.includes(normalizeUiText(recordId)), `Maya evidence dossier omitted backend recordId ${recordId}.`);
  }
  const renderedDocumentRows = page.getByTestId("maya-evidence-document-row");
  const renderedDocumentCount = await renderedDocumentRows.count();
  assert(
    renderedDocumentCount === detail.selected.evidencePack.documents.length,
    `Maya evidence dossier rendered ${renderedDocumentCount.toString()} document rows for ${detail.selected.evidencePack.documents.length.toString()} backend documents.`
  );
  for (const document of detail.selected.evidencePack.documents) {
    assert(
      renderedDossierText.includes(normalizeUiText(document.documentId)),
      `Maya evidence dossier omitted backend document ${document.documentId}.`
    );
    assert(
      renderedDossierText.includes(normalizeUiText(document.citationId)),
      `Maya evidence dossier omitted backend citation ${document.citationId}.`
    );
    assert(
      renderedDossierText.includes(normalizeUiText(document.summary)),
      `Maya evidence dossier omitted backend document summary for ${document.documentId}.`
    );
  }
  const renderedSourceRows = page.getByTestId("maya-source-provenance-row");
  assert(
    (await renderedSourceRows.count()) === connectorsModel.sourceTiles.length,
    "Maya evidence dossier source provenance row count did not match connector source tiles."
  );
}

async function assertRenderedQueryDockMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
  const renderedDockText = normalizeUiText(await page.getByTestId("maya-query-dock").innerText());
  assert(
    renderedDockText.includes(normalizeUiText(detail.selected.lineId)),
    `Maya query dock omitted backend selected line ${detail.selected.lineId}.`
  );
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(renderedDockText.includes(normalizeUiText(recordId)), `Maya query dock omitted backend recordId ${recordId}.`);
  }
  await assertRenderedPromptChipsMatchBackend(page, detail);
}

async function assertRenderedRecoveryDraftMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya recovery draft review");
  const draft = detail.recoveryDraft;
  const approvalActions = detail.approvalState.actions;
  const renderedDraftText = normalizeUiText(await page.getByTestId("maya-recovery-draft-review").innerText());
  for (const expectedText of [draft.actionLabel, draft.statusLabel, draft.amount, draft.basis, detail.selected.lineId]) {
    assert(
      renderedDraftText.includes(normalizeUiText(expectedText)),
      `Maya recovery draft review omitted backend draft text ${expectedText}.`
    );
  }
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(renderedDraftText.includes(normalizeUiText(recordId)), `Maya recovery draft review omitted backend recordId ${recordId}.`);
  }
  const humanDecisionText = normalizeUiText(await page.getByTestId("maya-draft-rail-human-decisions").innerText());
  assert(
    approvalActions.length === detail.selected.approvalActions.length,
    "Maya recovery draft approval action count did not match selected backend approval actions."
  );
  for (const action of approvalActions) {
    const reasonState = action.requiresReason ? "Reason required" : "Reason optional";
    assert(humanDecisionText.includes(reasonState), `Maya recovery draft review omitted backend approval state ${reasonState}.`);
  }
  assert(
    renderedDraftText.includes("Human approval required") && renderedDraftText.includes("No external action before human approval"),
    "Maya recovery draft review did not render the explicit fail-closed human approval state."
  );
}

async function assertRenderedApprovalGateMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya approval gate dialog");
  const draft = detail.recoveryDraft;
  const approvalActions = detail.approvalState.actions;
  const renderedGateText = normalizeUiText(await page.getByTestId("maya-approval-gate-dialog").innerText());
  for (const expectedText of [draft.actionLabel, draft.statusLabel, draft.basis]) {
    assert(renderedGateText.includes(normalizeUiText(expectedText)), `Maya approval gate omitted backend draft text ${expectedText}.`);
  }
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(renderedGateText.includes(normalizeUiText(recordId)), `Maya approval gate omitted backend cited recordId ${recordId}.`);
  }
  const renderedButtonText = normalizeUiText(
    (await page.getByTestId("maya-approval-gate-dialog").locator("button").allTextContents()).join(" ")
  );
  for (const action of approvalActions) {
    assert(
      renderedButtonText.includes(approvalDecisionButtonLabel(action.decision)),
      `Maya approval gate omitted backend approval decision ${action.decision}.`
    );
  }
  assert(
    renderedGateText.includes("Approval blocked by missing eligibility") &&
      renderedGateText.includes("External action remains blocked"),
    "Maya approval gate did not render the explicit fail-closed approval eligibility state."
  );
}

async function assertRenderedAuditConfirmationMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya audit confirmation");
  const auditState = detail.auditState;
  const actionInbox = detail.actionInbox;
  const renderedAuditText = normalizeUiText(await page.getByTestId("maya-audit-confirmation").innerText());
  assert(
    actionInbox.some((action) => action.actionId === detail.recommendedAction.actionId),
    "Maya audit confirmation backend action inbox did not include the selected recommended action."
  );
  for (const expectedText of [detail.recommendedAction.actionLabel, auditState.statusLabel, detail.recommendedAction.basis ?? detail.recoveryDraft.basis]) {
    assert(renderedAuditText.includes(normalizeUiText(expectedText)), `Maya audit confirmation omitted backend audit text ${expectedText}.`);
  }
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(renderedAuditText.includes(normalizeUiText(recordId)), `Maya audit confirmation omitted selected action recordId ${recordId}.`);
  }
  assert(
    auditState.recordIds.length > 0 &&
      renderedAuditText.includes("Audit confirmation unavailable") &&
      renderedAuditText.includes("Backend contract gap"),
    "Maya audit confirmation did not render the explicit fail-closed audit state."
  );
}

function approvalDecisionButtonLabel(decision: ApprovalActionModel["decision"]): string {
  switch (decision) {
    case "approve":
      return "Approve";
    case "modify":
      return "Request changes";
    case "reject":
      return "Reject";
  }
}

function observeBrowserCalls(page: Page, appUrl: string, apiUrl: string): void {
  const appOrigin = new URL(appUrl).origin;
  const apiOrigin = new URL(apiUrl).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === appOrigin || url.origin === apiOrigin) {
      observedCalls.push({ method: request.method(), path: url.pathname, source: "browser" });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === appOrigin || url.origin === apiOrigin) {
      observedCalls.push({ method: response.request().method(), path: url.pathname, source: "browser", status: response.status() });
    }
  });
}

async function assertObservedRealBackendCall(apiServer: ManagedApiServer, method: string, path: string): Promise<void> {
  const normalizedPath = normalizeObservedPath(path);
  await apiServer.recorder.waitFor(method, normalizedPath, 20_000);
}

async function waitForAppJsonResponse(
  page: Page,
  method: string,
  pathname: string,
  timeoutMs: number
): Promise<PlaywrightResponse> {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname === pathname && response.request().method() === method;
    },
    { timeout: timeoutMs }
  );
}

async function settleOptionalResponse(responsePromise: Promise<PlaywrightResponse>): Promise<PlaywrightResponse | undefined> {
  try {
    return await responsePromise;
  } catch {
    return undefined;
  }
}

async function readRequiredJsonResponse<T>(response: PlaywrightResponse, label: string): Promise<T> {
  const bodyText = await response.text();
  if (!response.ok()) {
    throw new Error(`${label} failed closed with ${response.status().toString()}: ${bodyText}`);
  }

  return JSON.parse(bodyText) as T;
}

async function fetchRequiredJson<T>(apiUrl: string, path: string, source: ApiRequestSource): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { cache: "no-store", headers: directBackendAuthHeaders() });
  observedCalls.push({ method: "GET", path, source, status: response.status });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Real backend ${path} failed closed with ${response.status.toString()}: ${bodyText}`);
  }

  return JSON.parse(bodyText) as T;
}

function directBackendAuthHeaders(): HeadersInit {
  return {
    "x-recoup-human-principal": readEnvValue("RECOUP_COCKPIT_HUMAN_PRINCIPAL", "human:maya-lead"),
    "x-recoup-human-token": readEnvValue("RECOUP_COCKPIT_AUTH_TOKEN", "recoup-local-e2e-human-token")
  };
}

async function assertExistingApiIsRealBackend(apiUrl: string): Promise<void> {
  await assertApiRootRealBackend(normalizeBaseUrl(apiUrl));
}

async function assertApiRootRealBackend(apiUrl: string): Promise<void> {
  const response = await fetch(`${apiUrl}/`, { cache: "no-store" });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Real backend root failed closed with ${response.status.toString()}: ${bodyText}`);
  }
  const body = JSON.parse(bodyText) as { dataMode?: string };
  assert(body.dataMode === "real-backend", `Configured cockpit API is not real-backend; received ${body.dataMode ?? "missing"}.`);
}

async function resolveAppPort(port: number): Promise<number> {
  return findAvailablePort(port, "cockpit");
}

async function findAvailablePort(basePort: number, label: string): Promise<number> {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = basePort + offset;
    if (await isTcpPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Unable to find an available ${label} port starting at ${basePort.toString()}.`);
}

async function isTcpPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createTcpServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
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

async function hasAnyHttpResponse(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: "manual" });

    return response.status >= 200 && response.status < 600;
  } catch {
    return false;
  }
}

function buildE2eEnv(apiUrl: string, appUrl: string): NodeJS.ProcessEnv {
  const authToken = readEnvValue("RECOUP_COCKPIT_AUTH_TOKEN", "recoup-local-e2e-human-token");
  const demoSecret = readEnvValue("RECOUP_DEMO_SESSION_SECRET", authToken);

  return sanitizedEnv({
    ...localEnv,
    ...process.env,
    NODE_ENV: "development",
    RECOUP_API_URL: apiUrl,
    RECOUP_COCKPIT_ALLOWED_ORIGINS: appUrl,
    RECOUP_COCKPIT_AUTH_TOKEN: authToken,
    RECOUP_COCKPIT_HUMAN_PRINCIPAL: readEnvValue("RECOUP_COCKPIT_HUMAN_PRINCIPAL", "human:maya-lead"),
    RECOUP_DATA_MODE: "real-backend",
    RECOUP_DEMO_SESSION_SECRET: demoSecret
  });
}

function readEnvValue(key: string, fallback: string): string {
  return process.env[key] ?? localEnv[key] ?? fallback;
}

function readBooleanEnv(key: string): boolean {
  return (process.env[key] ?? localEnv[key])?.trim() === "1";
}

function sanitizedEnv(env: RuntimeEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  ) as NodeJS.ProcessEnv;
}

function startManagedProcess(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): ManagedProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "pipe",
    windowsHide: true
  });
  const managedProcess: ManagedProcess = { args, child, command, label, output: [] };

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

function stopProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", child.pid.toString(), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      child.kill();
      return;
    }
  }

  child.kill("SIGTERM");
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function proxyRequestToRealBackend(
  request: IncomingMessage,
  response: import("node:http").ServerResponse,
  targetBaseUrl: string,
  recorder: ApiCallRecorder,
  call: ObservedApiCall
): Promise<void> {
  try {
    const requestPath = request.url ?? "/";
    const targetUrl = new URL(requestPath, `${targetBaseUrl}/`);
    const method = request.method ?? "GET";
    const body = await readIncomingBody(request);
    const requestInit: RequestInit = {
      cache: "no-store",
      headers: copyProxyHeaders(request.headers),
      method,
      redirect: "manual"
    };
    if (body.length > 0 && method !== "GET" && method !== "HEAD") {
      requestInit.body = new Blob([new Uint8Array(body)]);
    }
    const upstream = await fetch(targetUrl, requestInit);
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    recorder.recordResponse(call, upstream.status, upstreamBody.toString("utf8"));
    response.statusCode = upstream.status;
    copyProxyResponseHeaders(upstream.headers, response);
    response.end(upstreamBody);
  } catch (error) {
    const body = JSON.stringify({
      error: error instanceof Error ? error.message : "Recording proxy failed to reach real backend."
    });
    recorder.recordResponse(call, 502, body);
    response.statusCode = 502;
    response.setHeader("content-type", "application/json");
    response.end(body);
  }
}

async function readIncomingBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<string | Uint8Array>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function copyProxyHeaders(headers: IncomingHttpHeaders): Headers {
  const copied = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || key.toLowerCase() === "host" || key.toLowerCase() === "content-length") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        copied.append(key, item);
      }
      continue;
    }
    copied.set(key, value);
  }

  return copied;
}

function copyProxyResponseHeaders(headers: Headers, response: import("node:http").ServerResponse): void {
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length" || key.toLowerCase() === "transfer-encoding") {
      return;
    }
    response.setHeader(key, value);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function expectVisibleLocator(page: Page, selector: string, label: string): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 30_000 });
  assert(await locator.isVisible(), `${label} was not visible.`);
}

function assertNoFixtureProcessStarted(managedProcesses: readonly ManagedProcess[]): void {
  assert(!fixtureProcessStarted, "Maya real-backend E2E started a fixture process.");
  const fixtureHarness = ["cockpit-premium", "e2e.ts"].join("-");
  const fixtureFlag = ["--fixture", "api"].join("-");
  for (const managedProcess of managedProcesses) {
    assert(
      !managedProcess.args.includes(fixtureFlag) && !managedProcess.args.some((arg) => arg.includes(fixtureHarness)),
      "Maya real-backend E2E must not start the fixture API harness."
    );
  }
}

function assertHarnessDoesNotUsePlaywrightRoutingOrFixtureApi(): void {
  const source = readCurrentSource();
  const forbiddenFragments = [
    ["page", "route"].join(".") + "(",
    ["context", "route"].join(".") + "(",
    ["browserContext", "route"].join(".") + "(",
    "." + ["fulfill"].join("") + "(",
    ["--fixture", "api"].join("-"),
    ["cockpit-premium", "e2e.ts"].join("-")
  ];
  for (const fragment of forbiddenFragments) {
    assert(!source.includes(fragment), `Maya real-backend E2E contains forbidden Playwright fixture/route fragment: ${fragment}`);
  }
}

function readCurrentSource(): string {
  return readFileSync(fileURLToPath(import.meta.url), "utf8");
}

function clearObservedCalls(): void {
  observedCalls.length = 0;
}

function normalizeObservedPath(path: string): string {
  return path.replace(/\/$/u, "") || "/";
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/u, "");
}

function normalizeUiText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function countNormalizedOccurrences(haystack: string, needle: string): number {
  const normalizedNeedle = normalizeUiText(needle);
  if (normalizedNeedle.length === 0) {
    return 0;
  }

  return haystack.split(normalizedNeedle).length - 1;
}

function assertCitationsStayWithinSelectedEvidenceScope(
  response: ForensicsQueryResponse,
  detail: ForensicsWorkItemDetailModel,
  context: string
): void {
  const selectedRecordIds = new Set([detail.selected.lineId, ...detail.selected.evidencePack.recordIds]);
  for (const citation of response.citations) {
    assert(
      selectedRecordIds.has(citation.recordId),
      `${context} included foreign citation ${citation.recordId} outside selected line ${detail.selected.lineId}.`
    );
  }
}

function assertSameRecordIds(left: readonly string[], right: readonly string[], context: string): void {
  assert(left.length === right.length, `${context}: expected ${right.length.toString()} recordIds, received ${left.length.toString()}.`);
  right.forEach((recordId, index) => {
    assert(left[index] === recordId, `${context}: expected recordId ${recordId} at ${index.toString()}, received ${left[index] ?? "missing"}.`);
  });
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function isLoopbackUrl(url: URL): boolean {
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

function isConfigured(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function nextBin(): string {
  return join(repoRoot, "node_modules", "next", "dist", "bin", "next");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class ApiCallRecorder {
  private readonly calls: ObservedApiCall[] = [];

  clear(): void {
    this.calls.length = 0;
  }

  record(method: string, requestUrl: string, source: ApiRequestSource): ObservedApiCall {
    const parsed = new URL(requestUrl, "http://127.0.0.1");
    const call = { method: method.toUpperCase(), path: normalizeObservedPath(parsed.pathname), source };
    this.calls.push(call);

    return call;
  }

  recordResponse(call: ObservedApiCall, status: number, responseBodyText: string): void {
    call.status = status;
    call.responseBodyText = responseBodyText;
  }

  async waitFor(method: string, path: string, timeoutMs: number): Promise<ObservedApiCall> {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizeObservedPath(path);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const call = this.calls.find((candidate) => candidate.method === normalizedMethod && candidate.path === normalizedPath);
      if (call !== undefined) {
        return call;
      }
      await delay(250);
    }

    throw new Error(`Did not observe real backend call ${normalizedMethod} ${normalizedPath}.`);
  }

  async waitForJsonResponse<T>(method: string, path: string, timeoutMs: number): Promise<T> {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizeObservedPath(path);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const call = this.calls.find(
        (candidate) =>
          candidate.method === normalizedMethod &&
          candidate.path === normalizedPath &&
          candidate.responseBodyText !== undefined
      );
      if (call?.responseBodyText !== undefined) {
        assert(call.status !== undefined && call.status >= 200 && call.status < 300, `Backend ${normalizedMethod} ${normalizedPath} failed with ${String(call.status)}: ${call.responseBodyText}`);

        return JSON.parse(call.responseBodyText) as T;
      }
      await delay(250);
    }

    throw new Error(`Did not observe real backend response body ${normalizedMethod} ${normalizedPath}.`);
  }
}

await main();
