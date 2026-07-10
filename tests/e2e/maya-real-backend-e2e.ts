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
import { chromium, type Browser, type Page, type Request as PlaywrightRequest, type Response as PlaywrightResponse } from "playwright";
import {
  buildCaseScopedQueryRecordIds,
  buildCitedRecordChips,
  buildDraftLetterPreview,
  buildEvidenceFactCard,
  buildOutcomeActionPackages,
  buildOverviewSummaryCards,
  buildRoutingBanner,
  buildVerdictLead,
  deriveEmailRecipientGroups,
  resolveMayaWorklistReason
} from "../../cockpit/components/maya/maya-workspace-derived.ts";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../../config/localRuntimeEnv.ts";
import { createCockpitApi } from "../../src/services/cockpitApi.js";

type ApiRequestSource = "api-server" | "browser" | "direct-api";
type MayaGovernanceStatus = "human_decided" | "pending_human";

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
  requestBodyText?: string;
  responseBodyText?: string;
  source: ApiRequestSource;
  status?: number;
}

interface KpiModelItem {
  label: string;
  provenance: MayaFieldProvenance;
  support: string;
  value: string;
}

interface MayaFieldProvenance {
  deterministicBasis: string;
  recordIds: string[];
  sourceKind: "agent_trace" | "derived_backend" | "operator_session" | "sap_odata" | "supabase";
  sourceName: string;
}

interface WorklistModelItem {
  amount: string;
  approvalStatus: MayaGovernanceStatus;
  approvalStatusLabel: string;
  confidence: string;
  confidenceLabel: string;
  customerId?: string;
  customerLabel: string;
  evidenceLabel: string;
  evidenceScoreLabel: string;
  lineCount: number;
  lineId: string;
  lineIds: string[];
  provenance: MayaFieldProvenance;
  queueLabel: string;
  recommendedActionLabel: string;
  routing: string;
  routingLabel: string;
  workItemId: string;
  workItemLabel: string;
  deductionReason: string;
  reason?: string;
  verdict: string;
  verdictLabel: string;
}

interface EvidenceDocumentModel {
  citationId: string;
  contentHash?: string;
  description: string;
  deterministicComparisonBasis?: string;
  documentId: string;
  documentType: string;
  evidenceId?: string;
  evidenceProvenance?: string;
  provenance: MayaFieldProvenance;
  receiptContentHash?: string;
  receiptId?: string;
  relevance: string;
  retrievedAt?: string;
  retrieval?: {
    fileName: string;
    mode: "semantic-vector";
    provenance: "openai-vector-store";
    score: number;
    vectorStoreId: string;
  };
  sourceFreshness?: string;
  sourceLabel: string;
  sourceRecordId?: string;
  sourceSystem?: string;
  storageHref?: string;
  storageUri?: string;
  summary: string;
  verifiedLabel: string;
}

interface EvidencePackModel {
  documents: EvidenceDocumentModel[];
  provenance: MayaFieldProvenance;
  recordIds: string[];
}

interface ApprovalEligibilityModel {
  available: boolean;
  provenance: MayaFieldProvenance;
  statusLabel: string;
}

interface RecoveryDraftModel {
  actionId: string;
  actionLabel: string;
  actionType: string;
  amount: string;
  approvalEligibility: ApprovalEligibilityModel;
  basis: string;
  provenance: MayaFieldProvenance;
  status: MayaGovernanceStatus;
  statusLabel: string;
}

interface ApprovalActionModel {
  decision: "approve" | "modify" | "reject";
  label: string;
  provenance: MayaFieldProvenance;
  requiresReason: boolean;
}

interface ActionInboxModelItem {
  actionId: string;
  actionLabel: string;
  actionType: string;
  amount: string;
  basis?: string;
  lineId: string;
  provenance: MayaFieldProvenance;
  status?: MayaGovernanceStatus;
  statusLabel?: string;
}

interface ForensicsRealBackendModel {
  actionInbox: ActionInboxModelItem[];
  containmentPanel?: unknown;
  kpiStrip: KpiModelItem[];
  selected: {
    approvalActions: ApprovalActionModel[];
    approvalEligibility: ApprovalEligibilityModel;
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
    proofItems?: string[];
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
    provenance: MayaFieldProvenance;
    status: MayaGovernanceStatus;
    statusLabel: string;
  };
  auditState: {
    provenance: MayaFieldProvenance;
    recordIds: string[];
    status: MayaGovernanceStatus;
    statusLabel: string;
  };
  lineId: string;
  multimodalDock: {
    promptSuggestions: Array<{
      label: string;
      provenance: MayaFieldProvenance;
      question: string;
      recordIds: string[];
    }>;
  };
  recommendedAction: ActionInboxModelItem;
  recoveryDraft: RecoveryDraftModel;
  selected: {
    approvalActions: ApprovalActionModel[];
    approvalEligibility: ApprovalEligibilityModel;
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
  receiptDeterministicBasis?: string;
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
    deterministicBasis?: string;
    handoffCount?: number;
    mode: string;
    rawModelTextPolicy?: string;
    reason?: string;
    tokenUsage?: number;
  };
  trace: QueryTraceEvent[];
}

interface ForensicsQueryE2EResult {
  appResponse: ForensicsQueryResponse;
  appResponseSource: "browser_response";
  backendResponse: ForensicsQueryResponse;
  durationMs: number;
  workItem: RealMayaQueryWorkItem;
}

interface RealMayaQueryWorkItem {
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
  toolName: string | null;
  traceLabel: string | null;
  uiProcessKind: string | null;
}

interface RenderedAgentInvestigationStep {
  agentName: string | null;
  phase: string | null;
  recordIds: string | null;
  sourceLabel: string | null;
  text: string;
  toolName: string | null;
  verdict: string | null;
}

const repoRoot = process.cwd();
const localEnv = loadLocalRuntimeEnvFiles();
const requestedApiUrl = readEnvValue("RECOUP_E2E_API_URL", "http://127.0.0.1:4317");
const requestedAppPort = Number(readEnvValue("RECOUP_E2E_COCKPIT_PORT", "3000"));
const explicitApiUrl = isConfigured(process.env.RECOUP_E2E_API_URL ?? localEnv.RECOUP_E2E_API_URL);
const reuseCockpitRequested = readBooleanEnv("RECOUP_E2E_REUSE_COCKPIT");
const demoPassword = readEnvValue("RECOUP_E2E_DEMO_PASSWORD", "Welcome#123");
const queryResponseTimeoutMs = 120_000;
const observedCalls: ObservedApiCall[] = [];
const backendDelayMsByPath = new Map<string, number>();
const fixtureProcessStarted = false;
const screenshotDir = join("output", "playwright", "e2e", "real-backend");
const canonicalMayaWorkItemLineCounts = [
  { groupKey: "S1", lineCount: 3 },
  { groupKey: "S2", lineCount: 2 },
  { groupKey: "S3", lineCount: 4 },
  { groupKey: "S4", lineCount: 2 },
  { groupKey: "S5", lineCount: 3 },
  { groupKey: "S6", lineCount: 2 },
  { groupKey: "S7", lineCount: 2 },
  { groupKey: "S8", lineCount: 2 }
] as const;
const canonicalMayaWorkItemGroupKeys = canonicalMayaWorkItemLineCounts.map((workItem) => workItem.groupKey);
const canonicalMayaWorkItemIds = canonicalMayaWorkItemLineCounts.map((workItem) => `${workItem.groupKey}-L1`);
const canonicalMayaLineIds = canonicalMayaWorkItemLineCounts.flatMap((workItem) =>
  Array.from({ length: workItem.lineCount }, (_, index) => `${workItem.groupKey}-L${String(index + 1)}`)
);
const realMayaQueryWorkItems = [
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
  },
  {
    id: "valid-deduction-counterfactual",
    operatorIntent: "Maya needs to distinguish a valid deduction proof pattern from the selected recoverable case.",
    question:
      "What cited evidence would make this a valid deduction, and which selected SAP or document records show that this case does not meet that valid-deduction pattern?"
  }
] as const satisfies readonly RealMayaQueryWorkItem[];

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
  let page: Page | undefined;
  const browserDiagnostics: string[] = [];

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
    let activeForensicsModel = forensicsModel;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        browserDiagnostics.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserDiagnostics.push(`pageerror: ${error.message}`);
    });
    observeBrowserCalls(page, appUrl, apiServer.url);

    await loginAsMaya(page, appUrl);
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench after login", 90_000);
    await assertMayaShadcnLoadingShellStreamsDuringBackendDelay(page, appUrl);
    clearObservedCalls();
    apiServer.recorder.clear();
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya shadcn workbench", 90_000);
    await assertObservedForensicsReadOrRefresh(apiServer);
    await assertObservedRealBackendCall(apiServer, "GET", "/connectors");
    await assertRootSidebarSectionNavigation(page, forensicsModel);
    await assertRenderedOverviewSummaryCardsMatchBackend(page, activeForensicsModel);
    await assertRenderedSourceReadinessMatchesBackend(page, connectorsModel);
    await assertRenderedWorklistTableMatchesBackend(page, activeForensicsModel);
    activeForensicsModel = await assertForceRefreshReloadsSourceBackedWorklist(page, apiServer);
    await captureMayaBeat(page, "02-dashboard");
    await assertRenderedRecommendedActionCellMatchesBackend(page, activeForensicsModel);
    await page.getByTestId("maya-worklist-recommended-action").first().scrollIntoViewIfNeeded();
    await captureMayaBeat(page, "03-recommended-action");

    const detail = await sweepCanonicalMayaWorklist(page, apiServer, activeForensicsModel, connectorsModel);
    await assertCaseLineSelectorControls(page, apiServer, detail, connectorsModel);
    await captureMayaBeat(page, "04-case-overview");
    await assertAgentProcessMapBeforeQuery(page, detail, connectorsModel);
    await openEvidenceTab(page);
    await assertRenderedEvidenceDossierMatchesBackend(page, detail, connectorsModel);
    await captureMayaBeat(page, "05-evidence-dossier");
    await openEvidenceQuery(page);
    await assertRenderedQueryDockMatchesBackend(page, detail);
    await captureMayaBeat(page, "06-query-start");
    await assertClosingRunningQueryResetsParentTrace(page, realMayaQueryWorkItems[0], detail);
    await openEvidenceTab(page);
    await openEvidenceQuery(page);
    const queryResults = await runRealMayaQueryWorkItems(page, apiServer, detail);
    await captureMayaBeat(page, "08-cited-answer");
    await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
    await openDraftReviewSection(page);
    await assertRenderedRecoveryDraftMatchesBackend(page, detail);
    await captureMayaBeat(page, "09-draft-review");
    await page.getByRole("button", { name: /^Open approval$/u }).click();
    await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya approval gate");
    await assertRenderedApprovalGateMatchesBackend(page, detail);
    await captureMayaBeat(page, "10-human-approval");
    await closeVisibleOverlay(page, '[data-testid="maya-approval-gate-dialog"]');
    await openAuditDepthDrawer(page);
    await assertRenderedAuditConfirmationMatchesBackend(page, detail);
    await captureMayaBeat(page, "11-audit-confirmation");
    await assertReturnToWorklistRestoresWorklist(page, activeForensicsModel, detail);
    await captureMayaBeat(page, "12-return-worklist");

    assertNoFixtureProcessStarted(managedProcesses);
    assertHarnessDoesNotUsePlaywrightRoutingOrFixtureApi();
    const totalTraceRows = queryResults.reduce((sum, result) => sum + result.backendResponse.trace.length, 0);
    console.log(
      `Maya real-backend E2E passed against ${apiServer.url}; query workItems: ${queryResults.length.toString()}; backend trace rows: ${totalTraceRows.toString()}`
    );
  } catch (error) {
    if (page !== undefined) {
      console.log(
        `--- Maya real-backend diagnostics ---\n${JSON.stringify(
          {
            apiCalls: summarizeObservedCalls(apiServer?.recorder.snapshot().slice(-20) ?? []),
            browserDiagnostics: browserDiagnostics.slice(-20),
            observedCalls: summarizeObservedCalls(observedCalls.slice(-30)),
            url: page.url()
          },
          null,
          2
        )}`
      );
    }
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
    [nextBin(), "dev", "cockpit", "--webpack", "--hostname", "127.0.0.1", "--port", appPort.toString()],
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

async function assertMayaShadcnLoadingShellStreamsDuringBackendDelay(page: Page, appUrl: string): Promise<void> {
  backendDelayMsByPath.set("/forensics", 2_500);
  backendDelayMsByPath.set("/connectors", 2_500);
  try {
    const startedAt = Date.now();
    await page.goto(`${appUrl}/forensics/shadcn`, { waitUntil: "domcontentloaded" });
    await expectVisibleLocator(page, '[data-testid="maya-shadcn-loading-shell"]', "Maya shadcn streaming loading shell");
    const shellVisibleMs = Date.now() - startedAt;
    assert(
      shellVisibleMs < 2_500,
      `Maya shadcn loading shell appeared only after the delayed backend window: ${shellVisibleMs.toString()}ms.`
    );
    await expectVisibleLocator(
      page,
      '[data-testid="maya-shadcn-workbench"]',
      "Maya shadcn workbench after delayed backend reads",
      90_000
    );
    console.log(`MAYA_STREAMING_SHELL_RESULT {"loadingShellVisibleMs":${shellVisibleMs.toString()},"delayedBackendMs":2500}`);
  } finally {
    backendDelayMsByPath.clear();
  }
}

async function sweepCanonicalMayaWorklist(
  page: Page,
  apiServer: ManagedApiServer,
  model: ForensicsRealBackendModel,
  connectorsModel: ConnectorRealBackendModel
): Promise<ForensicsWorkItemDetailModel> {
  assertCanonicalForensicsModelCoverage(model);
  const visitedLineIds: string[] = [];

  for (const workItemId of canonicalMayaWorkItemIds) {
    const item = model.worklist.find((candidate) => candidate.workItemId === workItemId);
    assert(item !== undefined, `Maya canonical worklist omitted Work item ${workItemId}.`);
    const firstDetail = await openBackendWorklistItem(page, apiServer, item);

    for (const [lineIndex, lineId] of item.lineIds.entries()) {
      const detail =
        lineId === firstDetail.lineId
          ? firstDetail
          : await switchToBackendCaseLine(page, apiServer, item.lineIds, lineId, lineIndex, item);
      assertCanonicalWorkItemDetailBackendModel(detail, item, lineId);
      await assertCanonicalVisibleDetailState(page, detail, connectorsModel, lineIndex);
      visitedLineIds.push(lineId);
    }

    await returnToCanonicalWorklist(page, model, item);
  }

  assertCanonicalBrowseCoverage(visitedLineIds);
  console.log(
    `MAYA_CANONICAL_BROWSE_RESULT ${JSON.stringify({
      lineIds: visitedLineIds,
      lines: visitedLineIds.length,
      workItems: canonicalMayaWorkItemIds.length
    })}`
  );

  const selectedDetail = await openCanonicalWorklistLine(page, apiServer, model, model.selected.lineId);
  await openCaseDetailSection(page, "maya-case-detail-b2-dossier-head", "Maya dossier head");
  const selectedLineIndex = selectedDetail.workItem.lineIds.indexOf(selectedDetail.lineId);
  assert(selectedLineIndex >= 0, `Maya selected line ${selectedDetail.lineId} was not present in its work item group.`);
  await assertSelectedCaseLineOverviewMatchesBackend(page, selectedDetail.workItem.lineIds, selectedDetail, selectedLineIndex);

  return selectedDetail;
}

async function openCanonicalWorklistLine(
  page: Page,
  apiServer: ManagedApiServer,
  model: ForensicsRealBackendModel,
  lineId: string
): Promise<ForensicsWorkItemDetailModel> {
  const item = model.worklist.find((candidate) => candidate.lineIds.includes(lineId));
  assert(item !== undefined, `Maya canonical worklist cannot open missing line ${lineId}.`);
  const detail = await openBackendWorklistItem(page, apiServer, item);
  if (detail.lineId === lineId) {
    return detail;
  }

  const lineIndex = item.lineIds.indexOf(lineId);
  assert(lineIndex >= 0, `Maya canonical worklist item ${item.workItemId} does not include ${lineId}.`);

  return switchToBackendCaseLine(page, apiServer, item.lineIds, lineId, lineIndex, item);
}

async function openBackendWorklistItem(
  page: Page,
  apiServer: ManagedApiServer,
  item: WorklistModelItem
): Promise<ForensicsWorkItemDetailModel> {
  await showRootWorklist(page);
  const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(item.lineId)}"]`).first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.scrollIntoViewIfNeeded();
  const rowLineId = await row.getAttribute("data-line-id");
  assert(rowLineId === item.lineId, `Maya worklist row identity mismatch: expected ${item.lineId}, received ${rowLineId ?? "missing"}.`);
  const detailPath = `/api/forensics/work-items/${encodeURIComponent(item.lineId)}`;
  let detailResponsePromise = waitForAppJsonResponse(page, "GET", detailPath, 90_000);
  const rowOpenButton = row.getByTestId("maya-row-action-open");

  if ((await rowOpenButton.count()) > 0 && (await rowOpenButton.isVisible())) {
    await rowOpenButton.click();
  } else {
    await row.click();
    let detailResponse = await settleOptionalResponse(detailResponsePromise);
    if (detailResponse === undefined) {
      const openButton = page.getByTestId("maya-local-row-action-open");
      await openButton.waitFor({ state: "visible", timeout: 10_000 });
      detailResponsePromise = waitForAppJsonResponse(page, "GET", detailPath, 90_000);
      await openButton.click();
      detailResponse = await detailResponsePromise;
    }

    return readAndAssertWorkItemDetail(page, detailResponse, apiServer, item, item.lineId);
  }

  return readAndAssertWorkItemDetail(page, await detailResponsePromise, apiServer, item, item.lineId);
}

async function readAndAssertWorkItemDetail(
  page: Page,
  detailResponse: PlaywrightResponse,
  apiServer: ManagedApiServer,
  item: WorklistModelItem,
  lineId: string
): Promise<ForensicsWorkItemDetailModel> {
  const detail = await readRequiredJsonResponse<ForensicsWorkItemDetailModel>(detailResponse, `Maya ${lineId} work item detail`);
  assert(detail.surface === "forensics-work-item-detail", "Maya detail endpoint returned the wrong surface.");
  assert(detail.lineId === lineId, `Maya detail lineId mismatch: expected ${lineId}, received ${detail.lineId}.`);
  assert(detail.selected.lineId === lineId, `Maya selected detail mismatch: expected ${lineId}, received ${detail.selected.lineId}.`);
  assert(detail.workItem.lineId === item.lineId, `Maya detail work item mismatch: expected ${item.lineId}.`);
  assert(detail.workItem.workItemId === item.workItemId, `Maya detail Work item mismatch: expected ${item.workItemId}.`);
  assert(detail.selected.evidencePack.recordIds.length > 0, `Maya ${lineId} detail returned no evidence record IDs.`);
  await expectVisibleLocator(page, '[data-testid="maya-case-workspace"]', "Maya case workspace");
  await assertObservedRealBackendCall(apiServer, "GET", `/forensics/work-items/${encodeURIComponent(lineId)}`);

  return withWorklistReason(detail, item);
}

function withWorklistReason(
  detail: ForensicsWorkItemDetailModel,
  workItem: WorklistModelItem
): ForensicsWorkItemDetailModel {
  if (typeof workItem.reason !== "string" || workItem.reason.trim().length === 0 || typeof detail.workItem.reason === "string") {
    return detail;
  }

  return {
    ...detail,
    workItem: {
      ...detail.workItem,
      reason: workItem.reason
    }
  };
}

async function showRootWorklist(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist root section");
  await expectVisibleLocator(page, '[data-testid="maya-worklist-table"]', "Maya worklist table");
}

async function returnToCanonicalWorklist(
  page: Page,
  model: ForensicsRealBackendModel,
  item: WorklistModelItem
): Promise<void> {
  const returnControl = page.getByTestId("maya-case-return-to-worklist");
  assert((await returnControl.count()) > 0, `Maya ${item.workItemId} case detail is missing the return-to-worklist control.`);
  await returnControl.click();
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-worklist-page"]', "Maya returned canonical worklist");
  await expectVisibleLocator(page, '[data-testid="maya-beat-12-return-table"]', "Maya returned canonical table");
  const renderedRowCount = await page.getByTestId("maya-worklist-row").count();
  assert(
    renderedRowCount === model.worklist.length,
    `Maya returned ${renderedRowCount.toString()} worklist rows for ${model.worklist.length.toString()} backend rows.`
  );
  const returnedWorkItemRow = page.locator(
    `[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(item.lineId)}"]`
  );
  await returnedWorkItemRow.waitFor({ state: "visible", timeout: 20_000 });
}

async function assertCanonicalVisibleDetailState(
  page: Page,
  detail: ForensicsWorkItemDetailModel,
  connectorsModel: ConnectorRealBackendModel,
  lineIndex: number
): Promise<void> {
  await openCaseDetailSection(page, "maya-case-detail-b2-dossier-head", "Maya dossier head");
  await assertSelectedCaseLineOverviewMatchesBackend(page, detail.workItem.lineIds, detail, lineIndex);
  await openCaseDetailSection(page, "maya-case-detail-b5-verdict", "Maya verdict section");
  await assertRenderedVerdictBlockMatchesBackend(page, detail);

  await assertCanonicalAgentProcessMapBeforeQuery(page, detail, connectorsModel);
  await openEvidenceTab(page);
  await assertRenderedEvidenceDossierMatchesBackend(page, detail, connectorsModel);
  await openEvidenceQuery(page);
  await assertRenderedQueryDockMatchesBackend(page, detail);
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await openDraftReviewSection(page);
  await assertRenderedRecoveryDraftMatchesBackend(page, detail);
  await page.getByRole("button", { name: /^Open approval$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya approval gate");
  await assertRenderedApprovalGateMatchesBackend(page, detail);
  await closeVisibleOverlay(page, '[data-testid="maya-approval-gate-dialog"]');
  await openAuditDepthDrawer(page);
  await assertRenderedAuditConfirmationMatchesBackend(page, detail);
}

async function assertCanonicalAgentProcessMapBeforeQuery(
  page: Page,
  detail: ForensicsWorkItemDetailModel,
  connectorsModel: ConnectorRealBackendModel
): Promise<void> {
  await page.getByTestId("maya-case-detail-b3-investigation").scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, '[data-testid="maya-case-detail-b3-investigation"]', "Maya investigation section before query");
  await openAgentInvestigationDrawer(page);
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-timeline"]', "Maya canonical investigation timeline before query");
  const renderedSteps = await assertOvernightInvestigationSteps(page, "Canonical pre-query", detail, connectorsModel);
  const traceDetailsText = await openAgentTraceDetailsAndReadText(page);
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(
      traceDetailsText.includes(normalizeUiText(recordId)),
      `Canonical pre-query Trace details omitted selected backend evidence recordId ${recordId}.`
    );
  }

  assertPreQuerySourceProvenance("Canonical pre-query", detail, renderedSteps, traceDetailsText);
}

async function assertOvernightInvestigationSteps(
  page: Page,
  label: string,
  detail: ForensicsWorkItemDetailModel,
  connectorsModel: ConnectorRealBackendModel
): Promise<RenderedAgentInvestigationStep[]> {
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-step"]', `${label} overnight investigation steps`);
  await openAgentInvestigationCitationDetails(page);
  const renderedSteps = await readRenderedAgentInvestigationSteps(page);
  assert(
    renderedSteps.length >= 3 && connectorsModel.sourceTiles.length > 0,
    `${label} timeline rendered ${renderedSteps.length.toString()} overnight steps; expected at least 3 from real evidence before query.`
  );
  assert(
    renderedSteps.every((step) => normalizeUiText(step.text).length > 0),
    `${label} timeline rendered an empty investigation step.`
  );
  const renderedRecordIds = normalizeUiText(renderedSteps.map((step) => `${step.recordIds ?? ""} ${step.text}`).join(" "));
  assert(
    detail.selected.evidencePack.recordIds.some((recordId) => renderedRecordIds.includes(normalizeUiText(recordId))),
    `${label} timeline did not cite any selected evidence record IDs.`
  );

  return renderedSteps;
}

function assertPreQuerySourceProvenance(
  label: string,
  detail: ForensicsWorkItemDetailModel,
  renderedProcessNodes: ReadonlyArray<RenderedAgentProcessNode | RenderedAgentInvestigationStep>,
  traceDetailsText: string
): void {
  const expectedSourceKinds = new Set(detail.selected.evidencePack.documents.map((document) => document.provenance.sourceKind));
  for (const sourceKind of expectedSourceKinds) {
    const sourceLabel = sourceKindDetailLabel(sourceKind);
    const sourceDocumentLabels = [
      ...new Set(
        detail.selected.evidencePack.documents
          .filter((document) => document.provenance.sourceKind === sourceKind)
          .map((document) => document.sourceLabel)
      )
    ];
    const hasSupabaseSourceBackedSummary =
      sourceKind === "supabase" &&
      (traceDetailsText.includes("Source-backed") ||
        traceDetailsText.includes("source-backed") ||
        traceDetailsText.includes("backend") ||
        sourceDocumentLabels.some((documentLabel) => traceDetailsText.includes(normalizeUiText(documentLabel))));
    assert(
      renderedProcessNodes.some(
        (node) =>
          ("sourceKind" in node && node.sourceKind === sourceKind) ||
          ("retrievalSource" in node && node.retrievalSource === sourceKind) ||
          traceDetailsText.includes(sourceLabel)
      ) || hasSupabaseSourceBackedSummary,
      `${label} Agent Trace omitted ${sourceLabel} provenance for ${detail.lineId}.`
    );
  }
}

function assertCanonicalForensicsModelCoverage(model: ForensicsRealBackendModel): void {
  const workItemIds = model.worklist.map((item) => item.workItemId);
  const lineIds = model.worklist.flatMap((item) => item.lineIds);
  assert(
    model.worklist.length === canonicalMayaWorkItemIds.length,
    `Maya worklist exposed ${model.worklist.length.toString()} Work items instead of ${canonicalMayaWorkItemIds.length.toString()}.`
  );
  assertNoDuplicateStrings(workItemIds, "Maya canonical worklist Work items");
  assertNoDuplicateStrings(lineIds, "Maya canonical worklist lines");
  assertSameRecordIds(
    [...workItemIds].sort(),
    [...canonicalMayaWorkItemIds].sort(),
    "Maya canonical worklist item IDs"
  );
  assertSameRecordIds(
    [...lineIds].sort(),
    [...canonicalMayaLineIds].sort(),
    "Maya canonical S1-S8 worklist line IDs"
  );

  for (const item of model.worklist) {
    assert(item.lineCount === item.lineIds.length, `Maya worklist ${item.workItemId} lineCount did not match lineIds.`);
    assert(item.lineIds.includes(item.lineId), `Maya worklist ${item.workItemId} row lineId ${item.lineId} was not in lineIds.`);
    assert(
      item.workItemId === item.lineId,
      `Maya worklist ${item.lineId} workItemId ${item.workItemId} did not match its source line identity.`
    );
    const workItemGroupKey = canonicalWorkItemGroupKeyForLineId(item.workItemId);
    for (const lineId of item.lineIds) {
      assert(
        canonicalWorkItemGroupKeyForLineId(lineId) === workItemGroupKey,
        `Maya worklist Work item ${item.workItemId} included foreign line ${lineId}.`
      );
    }
    assertMayaFieldProvenance(item.provenance, `Maya worklist ${item.workItemId}`, item.lineIds);
  }
}

function assertCanonicalWorkItemDetailBackendModel(
  detail: ForensicsWorkItemDetailModel,
  item: WorklistModelItem,
  lineId: string
): void {
  assert((canonicalMayaLineIds as readonly string[]).includes(lineId), `Maya detail opened non-canonical line ${lineId}.`);
  assert(detail.lineId === lineId, `Maya detail returned ${detail.lineId} instead of ${lineId}.`);
  assert(detail.selected.lineId === lineId, `Maya selected detail returned ${detail.selected.lineId} instead of ${lineId}.`);
  assert(detail.workItem.lineId === item.lineId, `Maya detail ${lineId} changed Work item row identity.`);
  assert(detail.workItem.workItemId === item.workItemId, `Maya detail ${lineId} changed Work item ID.`);
  assertSameRecordIds(detail.workItem.lineIds, item.lineIds, `Maya detail ${lineId} Work item line IDs`);
  assert(detail.recommendedAction.lineId === lineId, `Maya detail ${lineId} recommended action is scoped to ${detail.recommendedAction.lineId}.`);
  assert(
    detail.selected.draft.actionId === detail.recoveryDraft.actionId &&
      detail.recoveryDraft.actionId === detail.recommendedAction.actionId,
    `Maya detail ${lineId} returned mismatched draft/action identity.`
  );
  assert(detail.selected.evidencePack.recordIds.includes(lineId), `Maya detail ${lineId} evidence pack omitted its selected line ID.`);
  assert(detail.selected.evidencePack.documents.length > 0, `Maya detail ${lineId} returned no cited evidence documents.`);
  assert(detail.selected.draft.status === "pending_human", `Maya selected draft ${lineId} was not pending human approval.`);
  assert(detail.recoveryDraft.status === "pending_human", `Maya recovery draft ${lineId} was not pending human approval.`);
  assert(detail.approvalState.status === "pending_human", `Maya approval state ${lineId} was not pending human approval.`);
  assert(detail.auditState.status === "pending_human", `Maya audit state ${lineId} was not pending human approval.`);
  assert(detail.recommendedAction.status === "pending_human", `Maya recommended action ${lineId} was not pending human approval.`);
  assert(
    detail.auditState.recordIds.length > 0,
    `Maya audit state ${lineId} did not cite backend record IDs for the pending HITL state.`
  );
  assert(
    detail.selected.approvalActions.length === detail.approvalState.actions.length && detail.approvalState.actions.length > 0,
    `Maya approval state ${lineId} did not expose backend HITL decisions.`
  );

  assertMayaFieldProvenance(detail.workItem.provenance, `Maya detail ${lineId} work item`, item.lineIds);
  assertMayaFieldProvenance(detail.selected.evidencePack.provenance, `Maya detail ${lineId} evidence pack`, [lineId]);
  assertMayaFieldProvenance(detail.selected.draft.provenance, `Maya detail ${lineId} selected draft`, [lineId]);
  assertMayaFieldProvenance(detail.selected.approvalEligibility.provenance, `Maya detail ${lineId} approval eligibility`);
  assertMayaFieldProvenance(detail.recoveryDraft.provenance, `Maya detail ${lineId} recovery draft`, [lineId]);
  assertMayaFieldProvenance(detail.recommendedAction.provenance, `Maya detail ${lineId} recommended action`, [lineId]);
  assertMayaFieldProvenance(detail.approvalState.provenance, `Maya detail ${lineId} approval state`);
  assertMayaFieldProvenance(detail.auditState.provenance, `Maya detail ${lineId} audit state`);
  for (const document of detail.selected.evidencePack.documents) {
    assert(document.documentId.trim().length > 0, `Maya detail ${lineId} cited document with blank documentId.`);
    assert(document.citationId.trim().length > 0, `Maya detail ${lineId} cited document ${document.documentId} with blank citationId.`);
    assertMayaFieldProvenance(document.provenance, `Maya detail ${lineId} evidence document ${document.documentId}`);
    assertCanonicalEvidenceMetadata(document, lineId);
  }
  for (const prompt of detail.multimodalDock.promptSuggestions) {
    assert(prompt.recordIds.length > 0, `Maya detail ${lineId} prompt ${prompt.label} omitted cited record IDs.`);
    assertMayaFieldProvenance(prompt.provenance, `Maya detail ${lineId} prompt ${prompt.label}`, prompt.recordIds);
  }
}

function assertMayaFieldProvenance(
  provenance: MayaFieldProvenance | undefined,
  context: string,
  expectedRecordIds: readonly string[] = []
): void {
  assert(provenance !== undefined, `${context} is missing backend provenance.`);
  assert(provenance.sourceName.trim().length > 0, `${context} provenance has blank sourceName.`);
  assert(provenance.deterministicBasis.trim().length > 0, `${context} provenance has blank deterministicBasis.`);
  assert(
    ["agent_trace", "derived_backend", "operator_session", "sap_odata", "supabase"].includes(provenance.sourceKind),
    `${context} provenance sourceKind ${provenance.sourceKind} is not allowed.`
  );
  if (provenance.sourceKind !== "operator_session") {
    assert(provenance.recordIds.length > 0, `${context} provenance has no cited record IDs.`);
  }
  for (const recordId of expectedRecordIds) {
    assert(
      provenance.recordIds.includes(recordId),
      `${context} provenance omitted expected recordId ${recordId}.`
    );
  }
}

function assertCanonicalEvidenceMetadata(document: EvidenceDocumentModel, lineId: string): void {
  const expectedReceiptLineId = canonicalEvidenceLineId(document) ?? lineId;
  assert(
    document.evidenceId !== undefined && /^EVD-[A-Z0-9-]+$/u.test(document.evidenceId),
    `Maya detail ${lineId} evidence document ${document.documentId} omitted canonical evidenceId.`
  );
  assert(
    document.receiptId === `RECON-${expectedReceiptLineId}`,
    `Maya detail ${lineId} evidence document ${document.documentId} omitted RECON receipt for ${expectedReceiptLineId}.`
  );
  assert(
    document.contentHash !== undefined && /^[a-f0-9]{64}$/u.test(document.contentHash),
    `Maya detail ${lineId} evidence document ${document.documentId} omitted canonical content hash.`
  );
  assert(
    document.receiptContentHash !== undefined && /^[a-f0-9]{64}$/u.test(document.receiptContentHash),
    `Maya detail ${lineId} evidence document ${document.documentId} omitted receipt content hash.`
  );
  assert(
    document.sourceFreshness !== undefined && document.sourceFreshness.includes("retrieved at"),
    `Maya detail ${lineId} evidence document ${document.documentId} omitted source freshness.`
  );
  assert(
    document.sourceRecordId !== undefined && document.sourceRecordId.trim().length > 0,
    `Maya detail ${lineId} evidence document ${document.documentId} omitted sourceRecordId.`
  );
  assert(
    document.sourceSystem !== undefined && document.sourceSystem.trim().length > 0,
    `Maya detail ${lineId} evidence document ${document.documentId} omitted sourceSystem.`
  );
  assert(
    document.deterministicComparisonBasis?.includes("canonical evidence document comparison") === true,
    `Maya detail ${lineId} evidence document ${document.documentId} omitted deterministic comparison basis.`
  );
  if (document.documentType === "pod") {
    assert(
      document.storageUri !== undefined && document.storageUri.trim().length > 0,
      `Maya detail ${lineId} POD evidence document ${document.documentId} omitted storageUri.`
    );
  }
}

function canonicalWorkItemGroupKeyForLineId(lineId: string): string {
  const match = /^(S[1-8])-L\d+$/u.exec(lineId);
  assert(match !== null, `Maya line ID ${lineId} is not a canonical S1-S8 line ID.`);
  const workItemGroupKey = match[1];
  assert(
    workItemGroupKey !== undefined && (canonicalMayaWorkItemGroupKeys as readonly string[]).includes(workItemGroupKey),
    `Maya line ID ${lineId} has non-canonical work item group ${workItemGroupKey ?? "missing"}.`
  );

  return workItemGroupKey;
}

function assertNoDuplicateStrings(values: readonly string[], context: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assert(!seen.has(value), `${context} contains duplicate value ${value}.`);
    seen.add(value);
  }
}

async function openCaseDetailSection(page: Page, testId: string, label: string): Promise<void> {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, `[data-testid="${testId}"]`, label);
}

async function openEvidenceTab(page: Page): Promise<void> {
  await openCaseDetailSection(page, "maya-case-detail-b4-evidence", "Maya evidence section");
  const drawer = page.getByTestId("maya-evidence-fact-cards");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya evidence fact cards");
  const trigger = drawer.getByTestId("maya-evidence-fact-cards-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-card"]', "Maya evidence fact card");
}

async function openDraftReviewSection(page: Page): Promise<void> {
  await openCaseDetailSection(page, "maya-case-detail-b6-outcome", "Maya draft review section");
  const review = page.getByTestId("maya-recovery-draft-review");
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya recovery draft review");
  const trigger = review.getByTestId("maya-recommended-action-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-outcome-action-packages"]', "Maya recommended action packages");
}

async function openAgentInvestigationDrawer(page: Page): Promise<void> {
  const drawer = page.getByTestId("maya-agent-investigation-drawer");
  await drawer.scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-drawer"]', "Maya agent investigation drawer");
  const trigger = drawer.getByTestId("maya-agent-investigation-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
}

async function openAgentInvestigationCitationDetails(page: Page): Promise<void> {
  const disclosures = page.getByTestId("maya-agent-investigation-record-disclosure");
  const count = await disclosures.count();
  for (let index = 0; index < count; index += 1) {
    const disclosure = disclosures.nth(index);
    const trigger = disclosure.getByRole("button", { name: /^Citation details$/u });
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
  }
}

async function openCaseDepthDrawerText(page: Page, testId: string, label: string): Promise<string> {
  const drawer = page.getByTestId(testId);
  await drawer.scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, `[data-testid="${testId}"]`, label);
  const trigger = drawer.getByTestId("maya-case-depth-drawer-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  return normalizeUiText(await drawer.innerText());
}

async function openAuditDepthDrawer(page: Page): Promise<string> {
  const text = await openCaseDepthDrawerText(page, "maya-case-depth-drawer-audit-provenance", "Maya audit provenance depth drawer");
  await expectVisibleLocator(page, '[data-testid="maya-audit-confirmation"]', "Maya audit confirmation");
  return text;
}

async function openEvidenceQuery(page: Page): Promise<void> {
  await page.getByTestId("recoup-agent-launcher").click();
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya query input");
}

async function assertCaseLineSelectorControls(
  page: Page,
  apiServer: ManagedApiServer,
  detail: ForensicsWorkItemDetailModel,
  connectorsModel: ConnectorRealBackendModel
): Promise<void> {
  const lineIds = detail.workItem.lineIds;
  assert(lineIds.length >= 2, `Maya line selector requires a backend work item with multiple lines; received ${lineIds.length.toString()}.`);
  await expectVisibleLocator(page, '[data-testid="maya-case-workspace"]', "Maya case workspace before line selector");

  for (const [index, lineId] of lineIds.entries()) {
    const lineButton = page.getByRole("button", { name: new RegExp(`^Line ${String(index + 1)}$`, "u") });
    await lineButton.waitFor({ state: "visible", timeout: 10_000 });
    const rawLineIdButton = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(lineId)}$`, "u") });
    assert((await rawLineIdButton.count()) === 0, `Maya exposed raw line ID ${lineId} as a primary button instead of Line ${String(index + 1)}.`);
  }
  const lineSelectorText = normalizeUiText(await page.getByTestId("maya-line-selector").innerText());
  for (const lineId of lineIds) {
    assert(
      !lineSelectorText.includes(normalizeUiText(lineId)),
      `Maya exposed raw line ID ${lineId} inside the primary line selector.`
    );
  }

  const secondLineId = lineIds[1];
  assert(secondLineId !== undefined, "Maya line selector test could not resolve the second backend line ID.");
  const secondLineDetail = await switchToBackendCaseLine(page, apiServer, lineIds, secondLineId, 1, detail.workItem);
  await assertSelectedCaseLineOverviewMatchesBackend(page, lineIds, secondLineDetail, 1);
  await assertAgentProcessMapBeforeQuery(page, secondLineDetail, connectorsModel);
  await openEvidenceTab(page);
  await assertRenderedEvidenceDossierMatchesBackend(page, secondLineDetail, connectorsModel);
  await openEvidenceQuery(page);
  await assertRenderedQueryDockMatchesBackend(page, secondLineDetail);
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await openDraftReviewSection(page);
  await assertRenderedRecoveryDraftMatchesBackend(page, secondLineDetail);
  await page.getByRole("button", { name: /^Open approval$/u }).click();
  await assertRenderedApprovalGateMatchesBackend(page, secondLineDetail);
  await closeVisibleOverlay(page, '[data-testid="maya-approval-gate-dialog"]');
  await openAuditDepthDrawer(page);
  await assertRenderedAuditConfirmationMatchesBackend(page, secondLineDetail);

  if (lineIds.length >= 3) {
    const thirdLineId = lineIds[2];
    assert(thirdLineId !== undefined, "Maya line selector test could not resolve the third backend line ID.");
    const thirdLineDetail = await switchToBackendCaseLine(page, apiServer, lineIds, thirdLineId, 2, detail.workItem);
    await assertSelectedCaseLineOverviewMatchesBackend(page, lineIds, thirdLineDetail, 2);
  }

  const originalLineIndex = lineIds.indexOf(detail.selected.lineId);
  assert(originalLineIndex >= 0, `Backend selected line ${detail.selected.lineId} is not present in work item line IDs.`);
  const restoredDetail = await switchToBackendCaseLine(page, apiServer, lineIds, detail.selected.lineId, originalLineIndex, detail.workItem);
  assert(restoredDetail.lineId === detail.selected.lineId, "Maya restored-line detail did not match the original backend-selected line.");
  const restoredLineLabel = normalizeUiText(await page.getByTestId("maya-selected-line-label").innerText());
  assert(
    restoredLineLabel.includes(`Line ${String(originalLineIndex + 1)} of ${lineIds.length.toString()}`),
    `Maya selected-line label did not restore the backend-selected line before downstream query assertions: ${restoredLineLabel}.`
  );
}

async function switchToBackendCaseLine(
  page: Page,
  apiServer: ManagedApiServer,
  lineIds: readonly string[],
  lineId: string,
  lineIndex: number,
  workItem?: WorklistModelItem
): Promise<ForensicsWorkItemDetailModel> {
  const detailPath = `/api/forensics/work-items/${encodeURIComponent(lineId)}`;
  await page.getByTestId("maya-line-selector").scrollIntoViewIfNeeded();
  const responsePromise = waitForAppJsonResponse(page, "GET", detailPath, 90_000);
  await page.getByRole("button", { name: new RegExp(`^Line ${String(lineIndex + 1)}$`, "u") }).click();
  const lineDetail = await readRequiredJsonResponse<ForensicsWorkItemDetailModel>(
    await responsePromise,
    `Maya Line ${String(lineIndex + 1)} work item detail`
  );
  assert(lineDetail.lineId === lineId, `Maya Line ${String(lineIndex + 1)} detail returned ${lineDetail.lineId} instead of ${lineId}.`);
  assert(lineDetail.selected.lineId === lineId, `Maya Line ${String(lineIndex + 1)} selected payload stayed on ${lineDetail.selected.lineId}.`);
  assert(
    lineDetail.recommendedAction.lineId === lineId,
    `Maya Line ${String(lineIndex + 1)} recommended action stayed on ${lineDetail.recommendedAction.lineId}.`
  );
  assert(
    lineDetail.selected.draft.actionId === lineDetail.recoveryDraft.actionId &&
      lineDetail.recoveryDraft.actionId === lineDetail.recommendedAction.actionId,
    `Maya Line ${String(lineIndex + 1)} returned mismatched draft/action identity.`
  );
  assert(
    lineIds.includes(lineDetail.selected.lineId),
    `Maya Line ${String(lineIndex + 1)} selected payload is outside the opened backend work item group.`
  );
  await assertObservedRealBackendCall(apiServer, "GET", `/forensics/work-items/${encodeURIComponent(lineId)}`);
  await expectVisibleLocator(
    page,
    '[data-testid="maya-case-workspace"]',
    `Maya Line ${String(lineIndex + 1)} case workspace`
  );
  await expectVisibleLocator(
    page,
    '[data-testid="maya-case-detail-b2-dossier-head"]',
    `Maya Line ${String(lineIndex + 1)} dossier head`
  );
  return workItem === undefined ? lineDetail : withWorklistReason(lineDetail, workItem);
}

async function assertSelectedCaseLineOverviewMatchesBackend(
  page: Page,
  lineIds: readonly string[],
  detail: ForensicsWorkItemDetailModel,
  lineIndex: number
): Promise<void> {
  const selectedLineLabel = normalizeUiText(await page.getByTestId("maya-selected-line-label").innerText());
  assert(
    selectedLineLabel.includes(`Line ${String(lineIndex + 1)} of ${lineIds.length.toString()}`),
    `Maya selected-line label did not move to Line ${String(lineIndex + 1)} of ${lineIds.length.toString()}: ${selectedLineLabel}.`
  );
  const lineSourceDetailsText = await openCaseDepthDrawerText(page, "maya-case-depth-drawer-audit-provenance", "Maya audit provenance drawer");
  assert(
    lineSourceDetailsText.includes(detail.selected.lineId),
    `Maya case detail did not keep backend raw ID ${detail.selected.lineId} available inside line evidence details.`
  );
  const detailReason = (detail.workItem as { reason?: unknown }).reason;
  assert(
    typeof detailReason === "string" && detailReason.trim().length > 0,
    `Maya backend detail ${detail.selected.lineId} did not expose a worklist reason.`
  );
  const expectedReason = normalizeUiText(detailReason);
  try {
    await page.waitForFunction(
      (expected) => {
        const text = document.querySelector('[data-testid="maya-case-deterministic-basis-body"]')?.textContent ?? "";
        return text.replace(/\s+/gu, " ").trim() === expected;
      },
      expectedReason,
      { timeout: 10_000 }
    );
  } catch (error) {
    const currentReason = normalizeUiText(await page.getByTestId("maya-case-deterministic-basis-body").innerText());
    throw new Error(
      `Maya case overview basis did not settle for ${detail.selected.lineId}. Expected "${expectedReason}" but rendered "${currentReason}".`,
      { cause: error }
    );
  }
  const lineBasisText = normalizeUiText(await page.getByTestId("maya-case-deterministic-basis-body").innerText());
  assert(
    lineBasisText === expectedReason,
    `Maya case overview basis did not equal the worklist reason for ${detail.selected.lineId}.`
  );
}

async function runRealMayaQueryWorkItems(
  page: Page,
  apiServer: ManagedApiServer,
  detail: ForensicsWorkItemDetailModel
): Promise<ForensicsQueryE2EResult[]> {
  const results: ForensicsQueryE2EResult[] = [];

  for (const [index, workItem] of realMayaQueryWorkItems.entries()) {
    if (index > 0) {
      await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
      await openEvidenceTab(page);
      await openEvidenceQuery(page);
    }

    const queryResult = await runEvidenceQuery(page, apiServer, workItem, detail);
    assertQueryResponseBackedByTrace(queryResult.backendResponse, detail);
    assertAppQueryResponseMatchesBackend(queryResult.backendResponse, queryResult.appResponse);
    await assertRenderedCitedAnswerMatchesBackend(page, workItem, queryResult.backendResponse);
    await assertRenderedConversationTurnsMatchBackend(page, queryResult);
    await expectVisibleLocator(page, '[data-testid="maya-copilot-verdict-band"]', `Maya Copilot verdict for ${workItem.id}`);
    await assertAgentProcessMapAfterQuery(page, queryResult, detail);
    await assertRenderedTraceRowsMatchBackend(page, queryResult.backendResponse.trace);
    await captureMayaBeat(page, index === 0 ? "07-agent-trace" : `07-query-${workItem.id}`);
    logRealMayaQueryResult(queryResult, detail);
    results.push(queryResult);
  }

  return results;
}

async function runEvidenceQuery(
  page: Page,
  apiServer: ManagedApiServer,
  workItem: RealMayaQueryWorkItem,
  detail: ForensicsWorkItemDetailModel
): Promise<ForensicsQueryE2EResult> {
  apiServer.recorder.clear();
  await assertVisibleSelectedEvidenceScope(page, detail);
  await assertRenderedPromptChipsMatchBackend(page, detail);
  const queryStartedAt = Date.now();
  const queryRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/forensics/query" &&
      request.method() === "POST" &&
      isSubmittedQueryScope(safePostDataJson(request), workItem, detail)
    );
  });
  await page.getByTestId("maya-query-input").fill(workItem.question);
  await page.getByRole("button", { name: /^Run query$/u }).click();
  const queryRequest = await queryRequestPromise;
  assertBrowserSubmittedQueryScope(queryRequest.postDataJSON() as unknown, workItem, detail);
  await assertObservedRealBackendCall(apiServer, "POST", "/forensics/query");
  const backendResponse = await apiServer.recorder.waitForJsonResponse<ForensicsQueryResponse>(
    "POST",
    "/forensics/query",
    queryResponseTimeoutMs,
    (response, call) =>
      isSubmittedQueryScope(safeJsonParse(call.requestBodyText), workItem, detail) &&
      Array.isArray(response.trace) &&
      response.trace.length > 0
  );
  const queryResponse = await queryRequest.response();
  if (queryResponse === null) {
    throw new Error(`Maya forensics query ${workItem.id} did not receive a browser response.`);
  }
  const appResponse = await readRequiredJsonResponse<ForensicsQueryResponse>(
    queryResponse,
    "Maya forensics query"
  );
  assertAppQueryResponseMatchesBackend(backendResponse, appResponse);

  return { appResponse, appResponseSource: "browser_response", backendResponse, durationMs: Date.now() - queryStartedAt, workItem };
}

async function assertClosingRunningQueryResetsParentTrace(
  page: Page,
  workItem: RealMayaQueryWorkItem,
  detail: ForensicsWorkItemDetailModel
): Promise<void> {
  await assertVisibleSelectedEvidenceScope(page, detail);
  await page.getByTestId("maya-query-input").fill(workItem.question);
  await page.getByRole("button", { name: /^Run query$/u }).click();
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await page.getByTestId("maya-case-detail-b3-investigation").scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, '[data-testid="maya-case-detail-b3-investigation"]', "Maya investigation section after query");
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
  const renderedProcessNodes = await readRenderedAgentProcessNodes(page);
  const parentTraceRecordIds = new Set(renderedProcessNodes.flatMap((node) => splitRecordIdsAttribute(node.recordIds)));
  assert(
    parentTraceRecordIds.has(detail.selected.lineId),
    `Parent trace reset omitted selected backend line ${detail.selected.lineId} from process-node data-record-ids.`
  );
  const traceDetailsText = await openAgentTraceDetailsAndReadText(page);
  assert(
    traceDetailsText.includes(normalizeUiText(detail.selected.lineId)),
    `Parent trace reset omitted selected backend line ${detail.selected.lineId} from Trace details.`
  );
}

function logRealMayaQueryResult(
  result: ForensicsQueryE2EResult,
  detail: ForensicsWorkItemDetailModel
): void {
  const answer = result.backendResponse.answer;
  const deterministicBasis = result.backendResponse.deterministicBasis;
  assert(answer !== undefined && answer.trim().length > 0, `Maya query Work item ${result.workItem.id} returned no answer.`);
  assert(
    deterministicBasis !== undefined && deterministicBasis.trim().length > 0,
    `Maya query Work item ${result.workItem.id} returned no deterministic basis.`
  );

  console.log(
    `MAYA_REAL_QUERY_RESULT ${JSON.stringify({
      answer,
      citationRecordIds: result.backendResponse.citations.map((citation) => citation.recordId),
      deterministicBasis,
      durationMs: result.durationMs,
      mcpTrace: result.backendResponse.trace
        .filter(
          (event) =>
            event.receiptDeterministicBasis === "OpenAI Agents SDK RunHooks lifecycle event" &&
            (event.toolName === "query.answer" || event.toolName === "retrieval.sap")
        )
        .map((event) => ({
          agentName: event.agentName,
          hook: event.hook,
          retrievalSource: event.retrievalSource ?? null,
          sourceKind: event.sourceKind ?? null,
          toolName: event.toolName ?? null
        })),
      operatorIntent: result.workItem.operatorIntent,
      question: result.workItem.question,
      workItemId: result.workItem.id,
      selectedLineId: detail.selected.lineId,
      trace: result.backendResponse.trace.map((event) => ({
        agentName: event.agentName,
        hook: event.hook,
        label: event.label,
        nextAgentName: event.nextAgentName ?? null,
        phase: event.phase,
        retrievalSource: event.retrievalSource ?? null,
        sourceKind: event.sourceKind ?? null,
        toolName: event.toolName ?? null
      })),
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
  assert(
    response.trace.some(
      (event) =>
        event.hook === "agent_tool_end" &&
        (event.toolName === "query.answer" || event.toolName === "retrieval.sap") &&
        event.receiptDeterministicBasis === "OpenAI Agents SDK RunHooks lifecycle event"
    ),
    "Maya query trace did not include a real SDK MCP source tool output receipt."
  );
  assert(
    response.trace.some(
      (event) =>
        event.hook === "agent_tool_end" &&
        event.toolName === "query.answer" &&
        event.receiptDeterministicBasis === "OpenAI Agents SDK RunHooks lifecycle event" &&
        event.retrievalSource === "sap_odata" &&
        event.sourceKind === "sap_odata"
    ),
    "Maya query trace did not surface the real SDK MCP query.answer output as SAP OData provenance."
  );
}

async function assertVisibleSelectedEvidenceScope(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  const selectedContextText = normalizeUiText(await page.getByTestId("maya-selected-evidence-context").innerText());
  const selectedLineText = normalizeUiText(await page.getByTestId("maya-query-selected-line").innerText());
  const expectedQueryRecordIds = expectedSelectedCaseQueryRecordIds(detail);
  assert(
    selectedLineText.includes("Selected case"),
    `Maya query dock selected line ${selectedLineText} did not use business selected-case copy.`
  );
  for (const recordId of expectedQueryRecordIds) {
    if (recordId !== detail.selected.lineId) {
      assert(
        !selectedContextText.includes(normalizeUiText(recordId)),
        `Maya query compact selected evidence context leaked raw backend recordId ${recordId}; raw IDs belong in Evidence details.`
      );
    }
  }
  await expectVisibleLocator(page, '[data-testid="maya-query-source-details"]', "Maya query evidence details disclosure");
  const sourceDetails = page.getByTestId("maya-query-source-details");
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /^Evidence details$/u });
  if ((await sourceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await sourceDetailsTrigger.click();
  }
  await expectVisibleLocator(page, '[data-testid="maya-query-record-id"]', "Maya query source detail record IDs");
  const renderedRecordIds = (await sourceDetails.getByTestId("maya-query-record-id").evaluateAll((items) =>
    items.map((item) => item.textContent.trim()).filter((item) => item.length > 0)
  )).sort();
  assertSameRecordIds(
    renderedRecordIds,
    [...expectedQueryRecordIds].sort(),
    "Maya query dock visible selected evidence scope"
  );
}

function canonicalEvidenceLineId(document: EvidenceDocumentModel): string | undefined {
  const match = /S\d+-L\d+/u.exec(`${document.evidenceId ?? ""} ${document.documentId} ${document.sourceRecordId ?? ""}`);
  return match?.[0];
}

async function assertRenderedPromptChipsMatchBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  const promptSuggestions = dedupePromptSuggestionsByQuestion(detail.multimodalDock.promptSuggestions);
  const renderedPromptChips = page.getByTestId("maya-query-prompt-chip");
  const renderedPromptChipCount = await renderedPromptChips.count();
  const renderedChipLabels = (await page.getByTestId("maya-query-prompt-question").allTextContents()).map(normalizeUiText);
  const renderedRecordCountLabels = (await page.getByTestId("maya-query-prompt-record-count").allTextContents()).map(normalizeUiText);
  assert(
    renderedPromptChipCount === promptSuggestions.length,
    `Maya rendered ${renderedPromptChipCount.toString()} prompt chip controls for ${promptSuggestions.length.toString()} unique backend prompt questions.`
  );
  assert(
    renderedChipLabels.length === promptSuggestions.length,
    `Maya rendered ${renderedChipLabels.length.toString()} prompt chips for ${promptSuggestions.length.toString()} unique backend prompt questions.`
  );
  promptSuggestions.forEach((prompt, index) => {
    assert(
      renderedChipLabels[index] === normalizeUiText(prompt.question),
      `Maya prompt chip ${index.toString()} did not match backend prompt question ${prompt.question}.`
    );
    const expectedRecordCount = new Set([...prompt.recordIds, ...prompt.provenance.recordIds].map((recordId) => recordId.trim()).filter(Boolean)).size;
    assert(
      renderedRecordCountLabels[index] === `${expectedRecordCount.toString()} records`,
      `Maya prompt chip ${index.toString()} did not match backend prompt record count.`
    );
    assert(prompt.question.trim().length > 0, `Backend prompt suggestion ${prompt.label} returned no question.`);
    assert(prompt.recordIds.length > 0, `Backend prompt suggestion ${prompt.label} returned no cited record IDs.`);
  });
}

function dedupePromptSuggestionsByQuestion<T extends { question: string }>(prompts: readonly T[]): T[] {
  const seen = new Set<string>();
  return prompts.filter((prompt) => {
    const normalizedQuestion = normalizeUiText(prompt.question).toLowerCase();
    if (normalizedQuestion.length === 0 || seen.has(normalizedQuestion)) {
      return false;
    }
    seen.add(normalizedQuestion);
    return true;
  });
}

function assertBrowserSubmittedQueryScope(
  payload: unknown,
  workItem: RealMayaQueryWorkItem,
  detail: ForensicsWorkItemDetailModel
): void {
  assert(typeof payload === "object" && payload !== null, "Maya browser submitted a non-object query payload.");
  const submitted = payload as { question?: unknown; recordIds?: unknown; selectedLineId?: unknown };
  assert(submitted.question === workItem.question, `Maya browser submitted the wrong query for Work item ${workItem.id}.`);
  assert(
    submitted.selectedLineId === detail.selected.lineId,
    `Maya browser submitted selectedLineId ${String(submitted.selectedLineId)} instead of ${detail.selected.lineId}.`
  );
  const submittedRecordIds = submitted.recordIds;
  assert(Array.isArray(submittedRecordIds), "Maya browser submitted query without selected recordIds.");
  assertSameRecordIds(
    submittedRecordIds.map((recordId) => String(recordId)).sort(),
    [...expectedSelectedCaseQueryRecordIds(detail)].sort(),
    `Maya browser submitted selected evidence scope for ${workItem.id}`
  );
}

function isSubmittedQueryScope(
  payload: unknown,
  workItem: RealMayaQueryWorkItem,
  detail: ForensicsWorkItemDetailModel
): boolean {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const submitted = payload as { question?: unknown; recordIds?: unknown; selectedLineId?: unknown };
  if (submitted.question !== workItem.question || submitted.selectedLineId !== detail.selected.lineId) {
    return false;
  }
  if (!Array.isArray(submitted.recordIds)) {
    return false;
  }

  return sameRecordIds(
    submitted.recordIds.map((recordId) => String(recordId)).sort(),
    [...expectedSelectedCaseQueryRecordIds(detail)].sort()
  );
}

function safePostDataJson(request: PlaywrightRequest): unknown {
  try {
    return request.postDataJSON() as unknown;
  } catch {
    return undefined;
  }
}

function safeJsonParse(value: string | undefined): unknown {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function sameRecordIds(left: readonly string[], right: readonly string[]): boolean {
  try {
    assertSameRecordIds(left, right, "Maya query request matcher");
    return true;
  } catch {
    return false;
  }
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
  await page.getByTestId("maya-case-detail-b3-investigation").scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, '[data-testid="maya-case-detail-b3-investigation"]', "Maya investigation section before query");
  await openAgentInvestigationDrawer(page);
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-timeline"]', "Maya investigation timeline before query");
  const renderedSteps = await assertOvernightInvestigationSteps(page, "Pre-query", detail, connectorsModel);
  assert((await page.getByTestId("maya-agent-investigation-empty").count()) === 0, "Pre-query process map showed the empty investigation state.");
  assert(
    renderedSteps.length >= 3 && connectorsModel.sourceTiles.length > 0 && detail.selected.evidencePack.recordIds.length > 0,
    "Pre-query process map did not render from the forensics detail and connector read models."
  );
  const traceDetailsText = await openAgentTraceDetailsAndReadText(page);
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(
      traceDetailsText.includes(normalizeUiText(recordId)),
      `Pre-query Trace details omitted selected backend evidence recordId ${recordId}.`
    );
  }
  assertPreQuerySourceProvenance("Pre-query", detail, renderedSteps, traceDetailsText);
}

async function assertAgentProcessMapAfterQuery(
  page: Page,
  queryResult: ForensicsQueryE2EResult,
  detail: ForensicsWorkItemDetailModel
): Promise<void> {
  await closeVisibleOverlay(page, '[data-testid="maya-query-dock"]');
  await page.getByTestId("maya-case-detail-b3-investigation").scrollIntoViewIfNeeded();
  await expectVisibleLocator(page, '[data-testid="maya-case-detail-b3-investigation"]', "Maya investigation section after query");
  await openAgentInvestigationDrawer(page);
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-timeline"]', "Maya investigation timeline after query");
  await expectVisibleLocator(page, '[data-testid="maya-agent-investigation-step"]', "Maya investigation timeline step after query");
  await openAgentInvestigationCitationDetails(page);
  const backendTrace = queryResult.backendResponse.trace;
  const renderedSteps = await readRenderedAgentInvestigationSteps(page);
  assert(
    renderedSteps.length === backendTrace.length,
    `Post-query investigation timeline rendered ${renderedSteps.length.toString()} steps for ${backendTrace.length.toString()} backend trace rows. Backend=${JSON.stringify(
      backendTrace.map((event) => ({
        agentName: event.agentName,
        hook: event.hook,
        label: event.label,
        phase: event.phase
      }))
    )} Rendered=${JSON.stringify(
      renderedSteps.map((step) => ({
        agentName: step.agentName,
        phase: step.phase,
        recordIds: step.recordIds,
        sourceLabel: step.sourceLabel,
        toolName: step.toolName,
        verdict: step.verdict
      }))
    )}.`
  );
  const evidenceRecordIds = new Set(detail.selected.evidencePack.recordIds);
  backendTrace.forEach((event, index) => {
    const renderedStep = renderedSteps[index];
    assert(renderedStep !== undefined, `Maya investigation timeline omitted backend trace step ${event.label}.`);
    const renderedText = normalizeUiText(renderedStep.text);
    assert(
      normalizeUiText(renderedStep.agentName ?? "") === normalizeUiText(event.agentName),
      `Maya investigation step ${index.toString()} omitted backend agent ${event.agentName}.`
    );
    assert(
      normalizeUiText(renderedStep.phase ?? "") === normalizeUiText(event.phase),
      `Maya investigation step ${event.label} omitted backend phase ${event.phase}.`
    );
    assert(
      renderedText.includes(normalizeUiText(event.label)),
      `Maya investigation step ${index.toString()} omitted backend label ${event.label}.`
    );
    assert(
      normalizeUiText(renderedStep.sourceLabel ?? "") === normalizeUiText(expectedInvestigationSourceLabel(event)),
      `Maya investigation step ${event.label} rendered source ${renderedStep.sourceLabel ?? "missing"} instead of backend-derived ${expectedInvestigationSourceLabel(event)}.`
    );
    if (event.toolName !== undefined) {
      assert(
        normalizeUiText(renderedStep.toolName ?? "") === normalizeUiText(event.toolName) &&
          renderedText.includes(normalizeUiText(event.toolName)),
        `Maya investigation step ${event.label} omitted backend toolName ${event.toolName}.`
      );
    }
    const renderedRecordIds = splitRecordIdsAttribute(renderedStep.recordIds);
    for (const recordId of renderedRecordIds) {
      assert(
        evidenceRecordIds.has(recordId),
        `Maya investigation step ${event.label} rendered citation ${recordId} outside selected evidence pack.`
      );
    }
  });
  const finalRenderedStep = renderedSteps.at(-1);
  const expectedVerdict = detail.workItem.verdict;
  assert(finalRenderedStep !== undefined, "Maya investigation timeline rendered no final step.");
  assert(
    finalRenderedStep.verdict === expectedVerdict,
    `Maya investigation final step verdict ${finalRenderedStep.verdict ?? "missing"} did not match backend verdict ${expectedVerdict}.`
  );
  assert(
    normalizeUiText(finalRenderedStep.text).includes(normalizeUiText(detail.workItem.verdictLabel)),
    `Maya investigation final step omitted backend verdict label ${detail.workItem.verdictLabel}.`
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
  const compactTraceText = normalizeUiText(backendTraceNodes.map((node) => node.text).join(" "));
  for (const debugTerm of ["agent_tool_start", "agent_tool_end", "sourceKind", "retrievalSource", "OpenAI Agents SDK", "SAP OData", "Supabase", "Source-backed"]) {
    assert(
      !compactTraceText.includes(debugTerm),
      `Agent process primary timeline leaked debug term ${debugTerm}; technical trace text belongs in Trace details.`
    );
  }
  for (const event of backendTrace) {
    assert(
      traceDetailsText.includes(normalizeUiText(event.message ?? "")),
      `Agent trace details omitted backend message for ${event.label}.`
    );
  }
  assertModelExecutionVisibleInTraceDetails(traceDetailsText, queryResult.backendResponse);
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
      traceDetailsText.includes(normalizeUiText(event.hook)) && traceDetailsText.includes(normalizeUiText(event.agentName)),
      `Agent trace details omitted backend hook/agent receipt for process node ${event.label}.`
    );
    if (event.toolName !== undefined) {
      assert(
        normalizeUiText(renderedNode.toolName ?? "") === normalizeUiText(event.toolName) &&
          traceDetailsText.includes(normalizeUiText(event.toolName)),
        `Agent trace receipts omitted backend toolName ${event.toolName} for process node ${event.label}.`
      );
    }
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
      assert(
        traceDetailsText.includes(normalizeUiText(event.sourceKind)) ||
          traceDetailsText.includes(normalizeUiText(sourceKindDetailLabel(event.sourceKind))),
        `Agent trace details omitted backend sourceKind ${event.sourceKind} for process node ${event.label}.`
      );
    }
    if (event.retrievalSource !== undefined) {
      assert(
        renderedNode.retrievalSource === event.retrievalSource,
        `Agent process node ${event.label} rendered retrievalSource ${renderedNode.retrievalSource ?? "missing"} instead of backend retrievalSource ${event.retrievalSource}.`
      );
      assert(
        traceDetailsText.includes(normalizeUiText(event.retrievalSource)) ||
          traceDetailsText.includes(normalizeUiText(retrievalSourceDetailLabel(event.retrievalSource))),
        `Agent trace details omitted backend retrievalSource ${event.retrievalSource} for process node ${event.label}.`
      );
    }
    if (event.retrievalSource === "source_backed") {
      assert(
        traceDetailsText.includes("Source-backed") || traceDetailsText.includes("Deterministic backend"),
        `Agent process node ${event.label} did not preserve source-backed retrieval proof in Trace details. Rendered sourceKind=${
          renderedNode.sourceKind ?? "missing"
        } retrievalSource=${renderedNode.retrievalSource ?? "missing"} text=${JSON.stringify(renderedText)}.`
      );
    }
  }
}

function assertModelExecutionVisibleInTraceDetails(traceDetailsText: string, backendResponse: ForensicsQueryResponse): void {
  const modelExecution = backendResponse.modelExecution;
  assert(modelExecution !== undefined, "Maya backend response omitted modelExecution proof for Trace details assertion.");
  assert(
    traceDetailsText.includes(normalizeUiText(modelExecution.mode)),
    `Agent trace details omitted modelExecution mode ${modelExecution.mode}.`
  );
  if (modelExecution.rawModelTextPolicy !== undefined) {
    assert(
      traceDetailsText.includes(normalizeUiText(modelExecution.rawModelTextPolicy)),
      `Agent trace details omitted raw-model policy ${modelExecution.rawModelTextPolicy}.`
    );
  }
  if (modelExecution.deterministicBasis !== undefined) {
    assert(
      traceDetailsText.includes(normalizeUiText(modelExecution.deterministicBasis)),
      "Agent trace details omitted modelExecution deterministic basis."
    );
  }
  if (modelExecution.reason !== undefined) {
    assert(
      traceDetailsText.includes(normalizeUiText(modelExecution.reason)),
      "Agent trace details omitted modelExecution blocked reason."
    );
  }
  if (modelExecution.handoffCount !== undefined) {
    assert(
      traceDetailsText.includes(modelExecution.handoffCount.toString()),
      `Agent trace details omitted modelExecution handoff count ${modelExecution.handoffCount.toString()}.`
    );
  }
  if (modelExecution.tokenUsage !== undefined) {
    assert(
      traceDetailsText.includes(modelExecution.tokenUsage.toString()),
      `Agent trace details omitted modelExecution token usage ${modelExecution.tokenUsage.toString()}.`
    );
  }
  for (const agentName of modelExecution.agentNames ?? []) {
    assert(
      traceDetailsText.includes(normalizeUiText(agentName)),
      `Agent trace details omitted modelExecution agent ${agentName}.`
    );
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
        toolName: null,
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
        toolName: null,
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
        toolName: null,
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
        toolName: null,
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
      toolName: node.getAttribute("data-tool-name"),
      traceLabel: node.getAttribute("data-trace-label"),
      uiProcessKind: node.getAttribute("data-ui-process-kind")
    }))
  );
}

async function readRenderedAgentInvestigationSteps(page: Page): Promise<RenderedAgentInvestigationStep[]> {
  return page.getByTestId("maya-agent-investigation-step").evaluateAll((nodes) =>
    nodes.map((node) => ({
      agentName: node.getAttribute("data-agent-name"),
      phase: node.getAttribute("data-phase"),
      recordIds: node.getAttribute("data-record-ids"),
      sourceLabel: node.getAttribute("data-source-label"),
      text: node.textContent,
      toolName: node.getAttribute("data-tool-name"),
      verdict: node.getAttribute("data-verdict")
    }))
  );
}

function sourceKindDetailLabel(sourceKind: string): string {
  if (sourceKind === "sap_odata") {
    return "SAP OData";
  }
  if (sourceKind === "derived_backend") {
    return "Deterministic backend";
  }
  if (sourceKind === "agent_trace") {
    return "OpenAI Agents SDK trace";
  }
  if (sourceKind === "supabase") {
    return "Supabase";
  }
  if (sourceKind === "operator_session") {
    return "Operator session";
  }

  return sourceKind;
}

function retrievalSourceDetailLabel(retrievalSource: string): string {
  if (retrievalSource === "sap_odata") {
    return "SAP OData";
  }
  if (retrievalSource === "source_backed") {
    return "Source-backed";
  }
  if (retrievalSource === "agent_trace") {
    return "Agent trace";
  }

  return retrievalSource;
}

function expectedInvestigationSourceLabel(event: QueryTraceEvent): string {
  if (event.retrievalSource === "sap_odata" || event.sourceKind === "sap_odata") {
    return "SAP OData";
  }
  if (event.retrievalSource === "supabase" || event.sourceKind === "supabase") {
    return "Supabase";
  }
  if (event.retrievalSource === "source_backed" || event.sourceKind === "derived_backend") {
    return "Source-backed";
  }
  if (event.sourceKind === "operator_session") {
    return "Operator session";
  }

  return "Agent trace";
}

async function openAgentTraceDetailsAndReadText(page: Page): Promise<string> {
  await openCaseDepthDrawerText(page, "maya-case-depth-drawer-audit-provenance", "Maya audit and provenance depth drawer");
  await expectVisibleLocator(page, '[data-testid="maya-agent-trace-details"]', "Maya trace details disclosure");
  const traceDetails = page.getByTestId("maya-agent-trace-details");
  const trigger = traceDetails.getByRole("button", { name: /^Trace details$/u });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }

  return normalizeUiText(await traceDetails.innerText());
}

async function openDisclosureAndReadText(
  page: Page,
  testId: string,
  triggerName: RegExp,
  label: string
): Promise<string> {
  await expectVisibleLocator(page, `[data-testid="${testId}"]`, label);
  const details = page.getByTestId(testId);
  const trigger = details.getByRole("button", { name: triggerName });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }

  return normalizeUiText(await details.innerText());
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
  workItem: RealMayaQueryWorkItem,
  backendResponse: ForensicsQueryResponse
): Promise<void> {
  assert(backendResponse.answer !== undefined, `Maya query Work item ${workItem.id} returned no backend answer.`);
  assert(backendResponse.deterministicBasis !== undefined, `Maya query Work item ${workItem.id} returned no backend basis.`);

  const submittedQueryText = normalizeUiText(await page.getByTestId("maya-submitted-query").innerText());
  assert(
    submittedQueryText.includes(normalizeUiText(workItem.question)),
    `Maya UI did not render submitted query for Work item ${workItem.id}.`
  );

  const assistantText = normalizeUiText(await page.getByTestId("maya-query-assistant-message").innerText());
  await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya persistent query input after cited answer");
  const expectedDisplayAnswer = displayAnswerWithoutInlineRecordIds(
    backendResponse.answer,
    backendResponse.citations.map((citation) => citation.recordId)
  );
  assert(
    assistantText.includes(normalizeUiText(expectedDisplayAnswer)),
    `Maya assistant answer bubble did not render the redacted backend answer for Work item ${workItem.id}.`
  );
  for (const citation of backendResponse.citations) {
    assert(
      !assistantText.includes(normalizeUiText(citation.recordId)),
      `Maya assistant answer prose leaked raw backend recordId ${citation.recordId}; raw IDs belong in Sources.`
    );
  }
  await expectVisibleLocator(page, '[data-testid="maya-copilot-verdict-band"]', `Maya Copilot verdict band for ${workItem.id}`);
  const modelExecutionDrawer = page.getByTestId("maya-copilot-model-drawer");
  if ((await modelExecutionDrawer.getByRole("button", { name: /^Model execution/u }).getAttribute("aria-expanded")) !== "true") {
    await modelExecutionDrawer.getByRole("button", { name: /^Model execution/u }).click();
  }
  const basisText = normalizeUiText(await modelExecutionDrawer.innerText());
  assert(
    basisText.includes(normalizeUiText(backendResponse.deterministicBasis)),
    `Maya model execution drawer did not match backend basis for Work item ${workItem.id}.`
  );

  const citedSourceDetails = page.getByTestId("maya-copilot-citations-drawer");
  await citedSourceDetails.waitFor({ state: "visible", timeout: 20_000 });
  if ((await citedSourceDetails.getByRole("button", { name: /^Citations/u }).getAttribute("aria-expanded")) !== "true") {
    await citedSourceDetails.getByRole("button", { name: /^Citations/u }).click();
  }
  const citationRows = page.getByTestId("maya-copilot-citation-row");
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
    `Maya rendered cited record row order for Work item ${workItem.id}`
  );

  for (const citation of backendResponse.citations) {
    const row = page.locator(`[data-testid="maya-copilot-citation-row"][data-record-id="${escapeAttributeValue(citation.recordId)}"]`);
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
    `Maya query Work item ${queryResult.workItem.id} returned no backend answer.`
  );
  assert(
    queryResult.backendResponse.deterministicBasis !== undefined,
    `Maya query Work item ${queryResult.workItem.id} returned no backend deterministic basis.`
  );
  const userTurnText = normalizeUiText(await page.getByTestId("maya-query-user-message").innerText());
  assert(
    userTurnText.includes(normalizeUiText(queryResult.workItem.question)),
    `Maya user conversation turn did not match backend query Work item ${queryResult.workItem.id}.`
  );
  const assistantTurnText = normalizeUiText(await page.getByTestId("maya-query-assistant-message").innerText());
  const expectedDisplayAnswer = displayAnswerWithoutInlineRecordIds(
    queryResult.backendResponse.answer,
    queryResult.backendResponse.citations.map((citation) => citation.recordId)
  );
  const citationDrawerText = normalizeUiText(await page.getByTestId("maya-copilot-citations-drawer").innerText());
  assert(
    assistantTurnText.includes(normalizeUiText(expectedDisplayAnswer)),
    `Maya assistant answer bubble omitted backend answer for ${queryResult.workItem.id}.`
  );
  assert(
    !assistantTurnText.includes(normalizeUiText(queryResult.backendResponse.deterministicBasis)),
    `Maya assistant answer bubble leaked backend technical basis for ${queryResult.workItem.id}.`
  );
  assert(
    citationDrawerText.includes(`${queryResult.backendResponse.citations.length.toString()} records`),
    `Maya citations drawer omitted backend citation count for ${queryResult.workItem.id}.`
  );
  for (const citation of queryResult.backendResponse.citations) {
    assert(
      !assistantTurnText.includes(normalizeUiText(citation.deterministicBasis)),
      `Maya assistant answer bubble leaked backend citation basis for ${citation.recordId}.`
    );
    assert(
      !assistantTurnText.includes(normalizeUiText(citation.recordId)),
      `Maya assistant answer bubble leaked raw backend recordId ${citation.recordId}.`
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
  const closeButton = page.getByRole("button", { name: /^(Close|Cancel|Close approval dialog)$/u }).last();
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
  const mcpSource = model.sourceTiles.find((source) => source.key === "mcp");
  assert(mcpSource !== undefined, "Real backend /connectors returned no MCP source readiness tile.");
  assert(mcpSource.label === "MCP Gateway", `Real backend /connectors must label the mcp source as MCP Gateway; got ${mcpSource.label}.`);
  if (mcpSource.statusTone === "ready") {
    const hasLiveMcpHealthDetail =
      mcpSource.stateLabel === "Connected" && mcpSource.detail.includes("MCP health reachable");
    const hasSavedMcpHealthSnapshot =
      mcpSource.stateLabel === "Connected" &&
      (mcpSource.proofItems ?? []).includes("mcp healthz reachable") &&
      (mcpSource.proofItems ?? []).includes("supabase source-health snapshot");
    assert(
      hasLiveMcpHealthDetail || hasSavedMcpHealthSnapshot,
      "Real backend /connectors marked MCP ready without health-confirmed MCP status."
    );
  } else {
    const failClosedMcpStates = ["Setup", "Probe failed", "Refresh overdue", "Status unavailable"];
    assert(
      mcpSource.statusTone === "blocked" && failClosedMcpStates.includes(mcpSource.stateLabel),
      `Real backend /connectors must fail closed for unavailable MCP health; got ${mcpSource.statusTone}/${mcpSource.stateLabel}.`
    );
    if (mcpSource.stateLabel === "Refresh overdue") {
      assert(
        (mcpSource.proofItems ?? []).includes("source-health refresh overdue") &&
          (mcpSource.proofItems ?? []).includes("supabase source-health snapshot"),
        "Real backend /connectors marked MCP refresh overdue without stale source-health snapshot proof."
      );
    }
  }
}

function assertCanonicalBrowseCoverage(visitedLineIds: readonly string[]): void {
  assertSameRecordIds(
    visitedLineIds,
    canonicalMayaLineIds,
    "Maya canonical S1-S8 browse/detail coverage"
  );
}

async function assertRootSidebarSectionNavigation(page: Page, forensicsModel: ForensicsRealBackendModel): Promise<void> {
  const rootSections = [
    { buttonName: /^Overview$/u, label: "Overview", testId: "maya-root-section-overview" },
    { buttonName: /^Worklist$/u, label: "Worklist", testId: "maya-root-section-worklist" },
    { buttonName: /^Containment$/u, label: "Containment", testId: "maya-root-section-containment" }
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
  const expectedContainmentCount = forensicsModel.containmentPanel === undefined ? "0" : "1";
  const sidebarText = normalizeUiText(await page.getByTestId("maya-sidebar").innerText());
  assert(sidebarText.includes(expectedWorklistCount), `Maya sidebar omitted backend worklist count ${expectedWorklistCount}.`);
  assert(sidebarText.includes(expectedContainmentCount), `Maya sidebar omitted containment count ${expectedContainmentCount}.`);

  await page.getByRole("button", { name: /^Worklist$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-worklist"]', "Maya Worklist root section");
}

async function assertRenderedOverviewSummaryCardsMatchBackend(page: Page, forensicsModel: ForensicsRealBackendModel): Promise<void> {
  assert(forensicsModel.worklist.length > 0, "Real backend /forensics returned no worklist rows for overview summary.");
  await page.getByRole("button", { name: /^Overview$/u }).click();
  await expectVisibleLocator(page, '[data-testid="maya-root-section-overview"]', "Maya Overview root section");
  await expectVisibleLocator(page, '[data-testid="maya-overview-intelligence-grid"]', "Maya overview summary grid");
  const renderedSummaryCards = page.getByTestId("maya-overview-summary-card");
  const renderedSummaryCardCount = await renderedSummaryCards.count();
  const expectedCards = buildOverviewSummaryCards(forensicsModel.worklist);
  assert(
    renderedSummaryCardCount === expectedCards.length,
    `Maya overview rendered ${renderedSummaryCardCount.toString()} summary cards for ${expectedCards.length.toString()} derived worklist cards.`
  );
  const renderedSummaryTexts = await renderedSummaryCards.evaluateAll((cards) => cards.map((card) => card.textContent));
  expectedCards.forEach((item, index) => {
    const renderedText = normalizeUiText(renderedSummaryTexts.at(index) ?? "");
    assert(renderedText.includes(normalizeUiText(item.label)), `Maya overview omitted summary card label ${item.label}.`);
    assert(renderedText.includes(item.count.toString()), `Maya overview omitted summary card count for ${item.label}.`);
    assert(renderedText.includes(normalizeUiText(item.amountLabel)), `Maya overview omitted summary card amount for ${item.label}.`);
    if (item.lineCount !== undefined) {
      assert(renderedText.includes(item.lineCount.toString()), `Maya overview omitted line count for ${item.label}.`);
    }
  });
  const summaryText = normalizeUiText(await page.getByTestId("maya-overview-verdict-summary").innerText());
  assert(
    summaryText.includes(forensicsModel.worklist.length.toString()),
    `Maya overview verdict summary omitted backend case count ${forensicsModel.worklist.length.toString()}.`
  );
}

async function assertRenderedSourceReadinessMatchesBackend(
  page: Page,
  connectorsModel: ConnectorRealBackendModel
): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-overview-source-readiness-toggle"]', "Maya Ready sources toggle");
  const sourceReadinessStrip = page.locator('[data-testid="maya-source-readiness-strip"]').first();
  assert(
    !(await sourceReadinessStrip.isVisible()),
    "Maya source readiness strip must start behind Ready sources toggle."
  );
  await page.getByTestId("maya-overview-source-readiness-toggle").click();
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
  for (const [index, item] of forensicsModel.worklist.entries()) {
    const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(item.lineId)}"]`).first();
    await row.waitFor({ state: "visible", timeout: 20_000 });
    const rowText = normalizeUiText(await row.innerText());
    const identityCellText = normalizeUiText(await row.locator("td").nth(1).innerText());
    const expectedCaseLabel = `Case ${String(index + 1)}`;
    assert(
      identityCellText.includes(expectedCaseLabel),
      `Maya worklist row ${item.lineId} omitted business case label ${expectedCaseLabel}.`
    );
    assert(
      !identityCellText.includes(item.lineId),
      `Maya worklist row ${item.lineId} must keep raw backend line IDs out of the primary case-label cell.`
    );
    for (const expectedText of [
      item.workItemLabel,
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

async function assertForceRefreshReloadsSourceBackedWorklist(
  page: Page,
  apiServer: ManagedApiServer
): Promise<ForensicsRealBackendModel> {
  apiServer.recorder.clear();
  const refreshButton = page.getByTestId("maya-source-force-refresh");
  await refreshButton.waitFor({ state: "visible", timeout: 20_000 });
  const refreshResponsePromise = waitForAppJsonResponse(page, "POST", "/api/forensics/refresh", 120_000);
  await refreshButton.click();
  const appRefreshResponse = await refreshResponsePromise;
  const refreshedModel = await readRequiredJsonResponse<ForensicsRealBackendModel>(
    appRefreshResponse,
    "Maya force source refresh"
  );
  assertForensicsModelReady(refreshedModel);
  await assertObservedRealBackendCall(apiServer, "POST", "/forensics/refresh");
  const backendRefreshModel = await apiServer.recorder.waitForJsonResponse<ForensicsRealBackendModel>(
    "POST",
    "/forensics/refresh",
    120_000
  );
  assertForensicsModelReady(backendRefreshModel);
  assert(
    JSON.stringify(refreshedModel.worklist.map((item) => item.lineId)) ===
      JSON.stringify(backendRefreshModel.worklist.map((item) => item.lineId)),
    "Maya source refresh app response did not match backend worklist line IDs."
  );
  await expectVisibleLocator(page, '[data-testid="maya-shadcn-workbench"]', "Maya workbench after source refresh");
  await assertRenderedWorklistTableMatchesBackend(page, refreshedModel);
  console.log(
    `MAYA_SOURCE_FORCE_REFRESH_RESULT ${JSON.stringify({
      lineIds: refreshedModel.worklist.map((item) => item.lineId),
      refreshedRows: refreshedModel.worklist.length
    })}`
  );

  return refreshedModel;
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
  assert(connectorsModel.sourceTiles.length > 0, "Maya connector source tiles were unavailable for evidence verification.");
  await expectVisibleLocator(page, '[data-testid="maya-evidence-fact-cards"]', "Maya evidence fact cards");
  const factCards = page.getByTestId("maya-evidence-fact-card");
  const renderedDocumentCount = await factCards.count();
  assert(
    renderedDocumentCount === detail.selected.evidencePack.documents.length,
    `Maya evidence fact cards rendered ${renderedDocumentCount.toString()} cards for ${detail.selected.evidencePack.documents.length.toString()} backend documents.`
  );
  for (const document of detail.selected.evidencePack.documents) {
    const card = page.locator(`[data-testid="maya-evidence-fact-card"][data-document-id="${escapeAttributeValue(document.documentId)}"]`).first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    const cardText = normalizeUiText(await card.innerText());
    const titleText = normalizeUiText(await card.getByTestId("maya-evidence-fact-card-title").innerText());
    const expectedCard = buildEvidenceFactCard(document);
    assert(
      titleText === normalizeUiText(expectedCard.title),
      `Maya evidence fact card title ${titleText} did not match derived title ${expectedCard.title}.`
    );
    assertNoRawEvidenceCopy(titleText, `Maya evidence fact card title for ${document.documentId}`);
    assert(
      cardText.includes(normalizeUiText(document.sourceLabel)),
      `Maya evidence fact card ${document.documentId} omitted source badge ${document.sourceLabel}.`
    );
    const rows = await card.getByTestId("maya-evidence-fact-card-body").getByTestId("maya-evidence-fact-row").evaluateAll((items) =>
      items.map((item) => ({
        label: item.getAttribute("data-label") ?? "",
        text: item.textContent,
        value: item.getAttribute("data-value") ?? ""
      }))
    );
    const expectedRows = expectedEvidenceFactRows(document);
    assert(
      rows.length === expectedRows.length,
      `Maya evidence fact card ${document.documentId} rendered ${rows.length.toString()} rows for ${expectedRows.length.toString()} backend facts.`
    );
    for (const expectedRow of expectedRows) {
      assert(
        rows.some(
          (row) =>
            normalizeUiText(row.label) === normalizeUiText(expectedRow.label) &&
            normalizeUiText(row.value) === normalizeUiText(expectedRow.value) &&
            normalizeUiText(row.text).includes(normalizeUiText(expectedRow.value))
        ),
        `Maya evidence fact card ${document.documentId} omitted ${expectedRow.label}=${expectedRow.value}.`
      );
    }
    const bodyAudit = await card.getByTestId("maya-evidence-fact-card-body").evaluate((body) => ({
      nonRowElements: Array.from(body.children).filter((element) => element.getAttribute("data-testid") !== "maya-evidence-fact-row").length,
      paragraphCount: body.querySelectorAll("p, li").length
    }));
    assert(
      bodyAudit.nonRowElements === 0 && bodyAudit.paragraphCount === 0,
      `Maya evidence fact card ${document.documentId} body is not key/value rows only: ${JSON.stringify(bodyAudit)}.`
    );
    assert(
      !cardText.includes(normalizeUiText(document.summary)) || document.summary === document.description,
      `Maya evidence fact card ${document.documentId} rendered summary prose inside the card body.`
    );
    assertNoRawEvidenceCopy(cardText, `Maya evidence fact card ${document.documentId}`);
    const documentViewTrigger = card.getByTestId("maya-evidence-document-view-trigger");
    if (document.storageHref === undefined) {
      assert(
        (await documentViewTrigger.count()) === 0,
        `Maya evidence fact card ${document.documentId} rendered a document trigger without stored content.`
      );
    } else {
      await documentViewTrigger.click();
    }
    if (document.storageHref !== undefined) {
      const frame = card.getByTestId("maya-evidence-document-frame");
      await frame.waitFor({ state: "visible", timeout: 10_000 });
      assert(
        (await frame.getAttribute("src")) === document.storageHref,
        `Maya evidence fact card ${document.documentId} iframe did not use backend storageHref ${document.storageHref}.`
      );
    }
    await card.getByTestId("maya-evidence-provenance-trigger").click();
    const provenanceRows = await card.getByTestId("maya-evidence-provenance-row").evaluateAll((items) =>
      items.map((item) => ({
        label: item.getAttribute("data-label") ?? "",
        text: item.textContent,
        value: item.getAttribute("data-value") ?? ""
      }))
    );
    const expectedProvenanceRows = expectedEvidenceProvenanceRows(document);
    for (const expectedRow of expectedProvenanceRows) {
      assert(
        provenanceRows.some(
          (row) =>
            normalizeUiText(row.label) === normalizeUiText(expectedRow.label) &&
            normalizeUiText(row.value) === normalizeUiText(expectedRow.value) &&
            normalizeUiText(row.text).includes(normalizeUiText(expectedRow.value))
        ),
        `Maya evidence provenance drawer ${document.documentId} omitted ${expectedRow.label}=${expectedRow.value}.`
      );
    }
  }
  const vectorDocuments = detail.selected.evidencePack.documents.filter(
    (document) => document.retrieval?.provenance === "openai-vector-store"
  );
  const semanticBadges = page.getByTestId("maya-evidence-semantic-badge");
  assert(
    (await semanticBadges.count()) === vectorDocuments.length,
    `Maya rendered ${(await semanticBadges.count()).toString()} semantic retrieval badges for ${vectorDocuments.length.toString()} vector evidence documents.`
  );
  for (const document of vectorDocuments) {
    const card = page.locator(`[data-testid="maya-evidence-fact-card"][data-document-id="${escapeAttributeValue(document.documentId)}"]`).first();
    const expectedBadge = expectedSemanticRetrievalBadge(document);
    assert(expectedBadge !== undefined, `Backend vector document ${document.documentId} had no parseable semantic score.`);
    assert(
      normalizeUiText(await card.getByTestId("maya-evidence-semantic-badge").innerText()) === normalizeUiText(expectedBadge),
      `Maya vector evidence card ${document.documentId} semantic badge did not match backend score ${expectedBadge}.`
    );
  }
  await openCaseDepthDrawerText(page, "maya-case-depth-drawer-audit-provenance", "Maya audit provenance drawer");
  const evidencePacketSection = page.getByTestId("maya-depth-evidence-packet-section");
  const evidencePacketSectionText = normalizeUiText(await evidencePacketSection.innerText());
  const expectedAvailability = `${detail.selected.evidencePack.documents.length.toString()} documents / ${detail.selected.evidencePack.recordIds.length.toString()} records`;
  assert(
    evidencePacketSectionText.includes(expectedAvailability),
    `Maya evidence packet drawer omitted availability summary ${expectedAvailability}.`
  );
  if (detail.selected.evidencePack.documents.length > 0 || detail.selected.evidencePack.recordIds.length > 0) {
    assert(
      !evidencePacketSectionText.includes("Unavailable"),
      `Maya evidence packet drawer showed Unavailable while backend returned ${expectedAvailability}.`
    );
  }
  const renderedRecordIds = (await page
    .getByTestId("maya-depth-evidence-packet-section")
    .locator('[aria-label="Backend record IDs"] [title]')
    .evaluateAll((items) => items.map((item) => item.textContent.trim()).filter((item) => item.length > 0))).sort();
  assertSameRecordIds(
    renderedRecordIds,
    [...detail.selected.evidencePack.recordIds].sort(),
    "Maya evidence packet drawer record IDs"
  );
}

function expectedEvidenceFactRows(document: EvidenceDocumentModel): Array<{ label: string; value: string }> {
  return buildEvidenceFactCard(document).rows;
}

function expectedEvidenceProvenanceRows(document: EvidenceDocumentModel): Array<{ label: string; value: string }> {
  return buildEvidenceFactCard(document).provenanceRows;
}

function assertNoRawEvidenceCopy(text: string, label: string): void {
  assert(
    !/(^|\s)#\s|retrieved through|read-model|source receipt|plumbing|system prompt|do not reveal/iu.test(text),
    `${label} exposed raw retrieval or developer-facing proof text: ${text}`
  );
}

function expectedSemanticRetrievalBadge(document: EvidenceDocumentModel): string | undefined {
  if (document.retrieval?.provenance !== "openai-vector-store") {
    return undefined;
  }
  const match = /\bscore\s+([01](?:\.\d+)?)\b/iu.exec(document.provenance.deterministicBasis);
  if (match?.[1] === undefined) {
    return undefined;
  }

  return `Semantic retrieval · score ${Number(match[1]).toFixed(2)}`;
}

async function assertRenderedQueryDockMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-query-dock"]', "Maya query dock");
  const sourceDetails = page.getByTestId("maya-query-source-details");
  const sourceDetailsTrigger = sourceDetails.getByRole("button", { name: /Evidence details/u });
  const expectedQueryRecordIds = expectedSelectedCaseQueryRecordIds(detail);
  if ((await sourceDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await sourceDetailsTrigger.click();
  }
  const renderedCompactText = normalizeUiText(await page.getByTestId("maya-selected-evidence-context").innerText());
  assert(
    !renderedCompactText.includes(normalizeUiText(detail.selected.lineId)),
    `Maya query compact context leaked backend selected line ${detail.selected.lineId}.`
  );
  const renderedDockText = normalizeUiText(await page.getByTestId("maya-query-dock").innerText());
  for (const recordId of expectedQueryRecordIds) {
    assert(renderedDockText.includes(normalizeUiText(recordId)), `Maya query dock omitted backend recordId ${recordId}.`);
  }
  for (const document of detail.selected.evidencePack.documents) {
    for (const expectedMetadata of [
      document.evidenceId,
      document.receiptId,
      document.contentHash,
      document.storageUri,
      document.sourceFreshness,
      document.deterministicComparisonBasis
    ]) {
      if (expectedMetadata !== undefined) {
        assert(
          renderedDockText.includes(normalizeUiText(expectedMetadata)),
          `Maya query dock omitted backend evidence metadata ${expectedMetadata} for ${document.documentId}.`
        );
      }
    }
  }
  await assertRenderedPromptChipsMatchBackend(page, detail);
}

async function assertRenderedVerdictBlockMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-deterministic-basis-band"]', "Maya deterministic verdict block");
  const verdictBlockText = normalizeUiText(await page.getByTestId("maya-deterministic-basis-band").innerText());
  const expectedLead = buildVerdictLead(detail.workItem);
  const expectedReason = resolveMayaWorklistReason(detail.workItem);
  assert(verdictBlockText.includes(normalizeUiText(expectedLead)), `Maya verdict block omitted lead ${expectedLead}.`);
  const renderedBasisBody = normalizeUiText(await page.getByTestId("maya-case-deterministic-basis-body").innerText());
  assert(
    renderedBasisBody === normalizeUiText(expectedReason),
    `Maya verdict basis body did not equal worklist reason. Expected ${expectedReason}; got ${renderedBasisBody}.`
  );

  const citedChips = buildCitedRecordChips(
    detail.selected.evidencePack.recordIds,
    [detail.selected.lineId, ...detail.selected.evidencePack.documents.map((document) => document.documentId)],
    detail.selected.evidencePack.documents
  );
  const renderedChipTexts = (await page.getByTestId("maya-verdict-cited-record").allTextContents()).map(normalizeUiText);
  const visibleChips = citedChips.slice(0, 3);
  assert(renderedChipTexts.length === visibleChips.length, "Maya verdict cited chip count did not match capped business labels.");
  for (const chip of visibleChips) {
    assert(
      renderedChipTexts.includes(normalizeUiText(chip.label)),
      `Maya verdict cited chips omitted business label ${chip.label}.`
    );
  }
  const disclosure = page.getByTestId("maya-verdict-cited-record-disclosure");
  await disclosure.getByRole("button", { name: /^All \d+ cited records$/u }).click();
  const disclosureText = normalizeUiText(await disclosure.innerText());
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(disclosureText.includes(normalizeUiText(recordId)), `Maya verdict cited disclosure omitted record ${recordId}.`);
  }
}

async function assertRenderedRecoveryDraftMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-recovery-draft-review"]', "Maya recovery draft review");
  const draft = detail.recoveryDraft;
  const approvalActions = detail.approvalState.actions;
  const renderedDraftText = normalizeUiText(await page.getByTestId("maya-recovery-draft-review").innerText());
  for (const expectedText of [draft.actionLabel, draft.statusLabel, draft.amount, draft.basis]) {
    assert(
      renderedDraftText.includes(normalizeUiText(expectedText)),
      `Maya recovery draft review omitted backend draft text ${expectedText}.`
    );
  }
  const draftSourceDetailsText = await openDisclosureAndReadText(
    page,
    "maya-draft-source-details",
    /^Details$/u,
    "Maya draft evidence details"
  );
  assert(
    draftSourceDetailsText.includes(normalizeUiText(detail.selected.lineId)),
    `Maya recovery draft evidence details omitted backend selected line ${detail.selected.lineId}.`
  );
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(
      draftSourceDetailsText.includes(normalizeUiText(recordId)),
      `Maya recovery draft evidence details omitted backend recordId ${recordId}.`
    );
  }
  const routingBanner = buildRoutingBanner(detail.workItem);
  const routingBannerText = normalizeUiText(await page.getByTestId("maya-outcome-routing-banner").innerText());
  for (const expectedText of [routingBanner.title, routingBanner.amountLabel, routingBanner.routeLine]) {
    assert(
      routingBannerText.includes(normalizeUiText(expectedText)),
      `Maya outcome routing banner omitted backend route text ${expectedText}.`
    );
  }

  const expectedActionPackages = buildOutcomeActionPackages({
    actionInbox: detail.actionInbox.map((action) => ({
      actionId: action.actionId,
      actionLabel: action.actionLabel,
      actionType: action.actionType,
      amount: action.amount,
      ...(action.basis === undefined ? {} : { basis: action.basis }),
      lineId: action.lineId,
      provenance: action.provenance,
      ...(action.status === "pending_human" ? { status: action.status } : {}),
      ...(action.statusLabel === undefined ? {} : { statusLabel: action.statusLabel })
    })),
    draft: { ...detail.recoveryDraft, status: "pending_human" as const },
    selectedLineId: detail.selected.lineId
  });
  const renderedActionPackages = page.getByTestId("maya-outcome-action-package");
  assert(
    (await renderedActionPackages.count()) === expectedActionPackages.length,
    "Maya outcome action package count did not match backend action rows."
  );
  const renderedActionPackageText = normalizeUiText((await renderedActionPackages.allTextContents()).join(" "));
  for (const actionPackage of expectedActionPackages) {
    for (const expectedText of [actionPackage.title, actionPackage.amount, actionPackage.basis, actionPackage.statusLabel]) {
      assert(
        renderedActionPackageText.includes(normalizeUiText(expectedText)),
        `Maya outcome action package omitted backend action field ${expectedText}.`
      );
    }
  }
  assert(
    renderedActionPackageText.includes("Selected case line"),
    "Maya outcome action package omitted the business selected-case-line label."
  );

  const expectedPreviews = deriveEmailRecipientGroups(detail.workItem).flatMap((recipientGroup) => {
    const preview = buildDraftLetterPreview({
      draft: { ...detail.recoveryDraft, status: "pending_human" as const },
      evidenceRecordIds: detail.selected.evidencePack.recordIds,
      reason: resolveMayaWorklistReason(detail.workItem),
      recipientGroup,
      workItem: detail.workItem
    });
    return preview === undefined ? [] : [preview];
  });
  assert(expectedPreviews.length > 0, "Maya selected test detail did not derive any expected draft preview.");
  const renderedPreviewBodies = (await page.getByTestId("maya-draft-letter-body").allTextContents()).map(normalizeUiText);
  const renderedPreviewSubjects = (await page.getByTestId("maya-draft-letter-subject").allTextContents()).map(normalizeUiText);
  assert(
    renderedPreviewBodies.length === expectedPreviews.length,
    "Maya draft preview body count did not match derived recipient routes."
  );
  assert(
    renderedPreviewSubjects.length === expectedPreviews.length,
    "Maya draft preview subject count did not match derived recipient routes."
  );
  for (const expectedPreview of expectedPreviews) {
    assert(
      renderedPreviewBodies.includes(normalizeUiText(expectedPreview.body)),
      `Maya draft preview body did not match the derived ${expectedPreview.recipientGroup} draft message.`
    );
    assert(
      renderedPreviewSubjects.includes(normalizeUiText(expectedPreview.subject)),
      `Maya draft preview subject did not match the derived ${expectedPreview.recipientGroup} draft subject.`
    );
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
    renderedDraftText.includes("Human approval required") && renderedDraftText.includes("External send gated"),
    "Maya recovery draft review did not render the explicit fail-closed human approval state."
  );
  const openApprovalButton = page.getByRole("button", { name: /^Open approval$/u });
  assert(await openApprovalButton.isDisabled(), "Maya Open approval button was enabled before evidence review was marked.");
  const emailButtons = page.getByTestId("maya-email-draft-action");
  for (let index = 0; index < await emailButtons.count(); index += 1) {
    assert(await emailButtons.nth(index).isDisabled(), `Maya email draft action ${index.toString()} was enabled before approval.`);
  }
  await page.getByTestId("maya-evidence-reviewed-toggle").check();
  assert(!(await openApprovalButton.isDisabled()), "Maya Open approval button stayed disabled after evidence review was marked.");
  for (let index = 0; index < await emailButtons.count(); index += 1) {
    assert(await emailButtons.nth(index).isDisabled(), `Maya email draft action ${index.toString()} enabled before approval response.`);
  }
}

async function assertRenderedApprovalGateMatchesBackend(page: Page, detail: ForensicsWorkItemDetailModel): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="maya-approval-gate-dialog"]', "Maya approval gate dialog");
  const draft = detail.recoveryDraft;
  const approvalActions = detail.approvalState.actions;
  const renderedGateText = normalizeUiText(await page.getByTestId("maya-approval-gate-dialog").innerText());
  for (const expectedText of [draft.amount, draft.basis]) {
    assert(renderedGateText.includes(normalizeUiText(expectedText)), `Maya approval gate omitted backend draft text ${expectedText}.`);
  }
  const approvalSourceDetailsText = await openDisclosureAndReadText(
    page,
    "maya-approval-details",
    /^Details$/u,
    "Maya approval evidence details"
  );
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(
      approvalSourceDetailsText.includes(normalizeUiText(recordId)),
      `Maya approval evidence details omitted backend cited recordId ${recordId}.`
    );
  }
  assert(
    approvalSourceDetailsText.includes(normalizeUiText(detail.selected.lineId)),
    `Maya approval evidence details omitted backend selected line ${detail.selected.lineId}.`
  );
  const renderedButtonText = normalizeUiText(
    (await page.getByTestId("maya-approval-gate-dialog").locator("button").allTextContents()).join(" ")
  );
  for (const action of approvalActions) {
    assert(
      renderedButtonText.includes(approvalDecisionButtonLabel(action.decision)),
      `Maya approval gate omitted backend approval decision ${action.decision}.`
    );
  }
  if (detail.selected.approvalEligibility.available) {
    assert(
      approvalSourceDetailsText.includes(detail.selected.approvalEligibility.statusLabel),
      "Maya approval gate did not render the explicit backend approval eligibility state."
    );
  } else {
    assert(
      approvalSourceDetailsText.includes(detail.selected.approvalEligibility.statusLabel) &&
        renderedGateText.includes("Decision buttons stay disabled"),
      "Maya approval gate did not render the explicit fail-closed approval eligibility state."
    );
  }
  assert(
    !/Verified human principal unavailable|Approval owner pending|Opening this dialog does not dispatch anything/u.test(renderedGateText),
    "Maya approval gate rendered deprecated approval copy."
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
  const auditActionDetailsText = await openDisclosureAndReadText(
    page,
    "maya-audit-selected-action-source-details",
    /^Selected action evidence details$/u,
    "Maya selected action evidence details"
  );
  for (const recordId of detail.selected.evidencePack.recordIds) {
    assert(
      auditActionDetailsText.includes(normalizeUiText(recordId)),
      `Maya audit selected action details omitted selected action recordId ${recordId}.`
    );
  }
  assert(
    auditState.recordIds.length > 0 &&
      renderedAuditText.includes("Audit confirmation unavailable") &&
      renderedAuditText.includes("No committed approval receipt is available yet"),
    "Maya audit confirmation did not render the explicit fail-closed audit state."
  );
  await expectVisibleLocator(page, '[data-testid="maya-audit-receipt-details"]', "Maya audit receipt details disclosure");
  const receiptDetails = page.getByTestId("maya-audit-receipt-details");
  const receiptDetailsTrigger = receiptDetails.getByRole("button", { name: /Audit receipt details/u });
  if ((await receiptDetailsTrigger.getAttribute("aria-expanded")) !== "true") {
    await receiptDetailsTrigger.click();
  }
  const receiptDetailsText = normalizeUiText(await receiptDetails.innerText());
  assert(
    receiptDetailsText.includes("Backend contract gap"),
    "Maya audit receipt details did not render backend contract gaps."
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

async function assertObservedForensicsReadOrRefresh(apiServer: ManagedApiServer): Promise<void> {
  const acceptedCalls = [
    { method: "GET", path: normalizeObservedPath("/forensics") },
    { method: "POST", path: normalizeObservedPath("/forensics/refresh") }
  ] as const;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const observed = apiServer.recorder.snapshot();
    if (acceptedCalls.some((expected) => observed.some((call) => call.method === expected.method && call.path === expected.path))) {
      return;
    }
    await delay(250);
  }

  throw new Error("Did not observe a real backend forensics read or source-refresh call.");
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
    RECOUP_DEMO_SESSION_SECRET: demoSecret,
    RECOUP_RECONCILIATION_MODE: "authoritative"
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
    const delayMs = backendDelayMsByPath.get(normalizeObservedPath(targetUrl.pathname));
    if (delayMs !== undefined) {
      await delay(delayMs);
    }
    if (body.length > 0 && method !== "GET" && method !== "HEAD") {
      recorder.recordRequestBody(call, body.toString("utf8"));
    }
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

async function expectVisibleLocator(page: Page, selector: string, label: string, timeoutMs = 30_000): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
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

function summarizeObservedCalls(
  calls: readonly ObservedApiCall[]
): Array<{
  method: string;
  path: string;
  requestBodyBytes?: number;
  responseBodyBytes?: number;
  source: ApiRequestSource;
  status?: number;
}> {
  return calls.map((call) => ({
    method: call.method,
    path: call.path,
    ...(call.requestBodyText === undefined ? {} : { requestBodyBytes: call.requestBodyText.length }),
    ...(call.responseBodyText === undefined ? {} : { responseBodyBytes: call.responseBodyText.length }),
    source: call.source,
    ...(call.status === undefined ? {} : { status: call.status })
  }));
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

function displayAnswerWithoutInlineRecordIds(answer: string, recordIds: readonly string[]): string {
  const trimmedAnswer = answer.trim();
  const withoutTrailingRecordList = trimmedAnswer
    .replace(/\s*(?:The answer is limited to cited record IDs|Cited record IDs|Record IDs)\s*:\s*[^.]+\.?\s*$/iu, "")
    .trim();
  const redacted = [...recordIds]
    .sort((left, right) => right.length - left.length)
    .reduce((current, recordId) => {
      const escapedRecordId = escapeRegExp(recordId);
      return current
        .replace(new RegExp(`\\bLine\\s+${escapedRecordId}\\b`, "gu"), "The selected line")
        .replace(new RegExp(escapedRecordId, "gu"), "a cited record");
    }, withoutTrailingRecordList)
    .replace(/\s+/gu, " ")
    .trim();

  return redacted.length === 0 ? "Answer details are available with citations in evidence details." : redacted;
}

function assertCitationsStayWithinSelectedEvidenceScope(
  response: ForensicsQueryResponse,
  detail: ForensicsWorkItemDetailModel,
  context: string
): void {
  const selectedRecordIds = new Set(expectedSelectedCaseQueryRecordIds(detail));
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

function expectedSelectedCaseQueryRecordIds(detail: ForensicsWorkItemDetailModel): string[] {
  return buildCaseScopedQueryRecordIds(detail.workItem, { selectedEvidenceRecordIds: detail.selected.evidencePack.recordIds });
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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

  recordRequestBody(call: ObservedApiCall, requestBodyText: string): void {
    call.requestBodyText = requestBodyText;
  }

  recordResponse(call: ObservedApiCall, status: number, responseBodyText: string): void {
    call.status = status;
    call.responseBodyText = responseBodyText;
  }

  snapshot(): ObservedApiCall[] {
    return [...this.calls];
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

  async waitForJsonResponse<T>(
    method: string,
    path: string,
    timeoutMs: number,
    predicate: (body: T, call: ObservedApiCall) => boolean = () => true
  ): Promise<T> {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizeObservedPath(path);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const call of this.calls) {
        if (call.method !== normalizedMethod || call.path !== normalizedPath || call.responseBodyText === undefined) {
          continue;
        }
        assert(call.status !== undefined && call.status >= 200 && call.status < 300, `Backend ${normalizedMethod} ${normalizedPath} failed with ${String(call.status)}: ${call.responseBodyText}`);

        const parsed = JSON.parse(call.responseBodyText) as T;
        if (predicate(parsed, call)) {
          return parsed;
        }
      }
      await delay(250);
    }

    throw new Error(
      `Did not observe real backend response body ${normalizedMethod} ${normalizedPath}. Candidates=${JSON.stringify(
        this.calls
          .filter((call) => call.method === normalizedMethod && call.path === normalizedPath)
          .map((call) => summarizeObservedCall(call))
      )}`
    );
  }
}

function summarizeObservedCall(call: ObservedApiCall): Record<string, unknown> {
  const requestBody = safeJsonParse(call.requestBodyText);
  const responseBody = safeJsonParse(call.responseBodyText);
  const requestRecord = typeof requestBody === "object" && requestBody !== null ? (requestBody as Record<string, unknown>) : {};
  const responseRecord = typeof responseBody === "object" && responseBody !== null ? (responseBody as Record<string, unknown>) : {};
  const modelExecution =
    typeof responseRecord.modelExecution === "object" && responseRecord.modelExecution !== null
      ? (responseRecord.modelExecution as Record<string, unknown>)
      : {};
  const trace = Array.isArray(responseRecord.trace) ? responseRecord.trace : [];

  return {
    hasRequestBody: call.requestBodyText !== undefined,
    mode: typeof modelExecution.mode === "string" ? modelExecution.mode : null,
    question: typeof requestRecord.question === "string" ? requestRecord.question : null,
    recordIds: Array.isArray(requestRecord.recordIds) ? requestRecord.recordIds.map((recordId) => String(recordId)) : null,
    reason: typeof modelExecution.reason === "string" ? modelExecution.reason : null,
    selectedLineId: typeof requestRecord.selectedLineId === "string" ? requestRecord.selectedLineId : null,
    status: call.status ?? null,
    traceRows: trace.length
  };
}

await main();
