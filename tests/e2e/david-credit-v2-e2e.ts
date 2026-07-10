import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { loadLocalRuntimeEnvFiles } from "../../config/localRuntimeEnv.ts";
import {
  assertBrowserTargetReachable,
  assertNoBrowserErrors,
  checkedGoto,
  loginAsDemoUser,
  newPageWithErrors,
  resolveBaseUrl
} from "./real-evidence-browser-helpers.ts";
import { validateDavidCreditQueryGolden } from "../helpers/llm-query-golden.js";

interface CreditRiskReviewModel {
  accounts: CreditRiskAccountModel[];
}

interface CreditRiskAccountModel {
  accountId: string;
  assessmentSteps: Array<{ key: string }>;
  customer: string;
  gamingFlag: boolean;
  meshPositions: Array<{ position: string; status: string }>;
  negotiationOrders: Array<{ orderId: string; sourceRecordIds: string[] }>;
  packet: {
    actionId: string;
    approvalStatus: "awaiting" | "committed";
    auditEntryHash?: string | undefined;
  };
  verdict: string;
}

interface ApprovalRouteResult {
  actionId?: unknown;
  auditEntryHash?: unknown;
  decision?: unknown;
  status?: unknown;
}

interface CreditQueryRouteResult {
  answer?: unknown;
  citations?: unknown;
  deterministicBasis?: unknown;
  modelExecution?: {
    agentNames?: unknown;
    handoffCount?: unknown;
    mode?: unknown;
    rawModelTextPolicy?: unknown;
    sourceReadMode?: unknown;
    tokenUsage?: unknown;
    tokenUsageSnapshot?: { totalTokens?: unknown };
  };
  negotiationDraft?: {
    deterministicBasis?: unknown;
    model?: {
      rankedCandidates?: Array<{ candidateId?: unknown; objectiveValueLabel?: unknown }>;
      rejectedCandidates?: Array<{ reason?: unknown }>;
    };
    toolName?: unknown;
  };
  policyRationale?: {
    citations?: Array<{ content?: unknown; recordId?: unknown; source?: unknown }>;
    executablePolicySource?: unknown;
    message?: unknown;
    policyKey?: unknown;
    policyValueText?: unknown;
    status?: unknown;
  };
  trace?: Array<{ toolName?: unknown }>;
}

const localEnv = loadLocalRuntimeEnvFiles();
const baseUrl = resolveBaseUrl();
const apiUrl = normalizeBaseUrl(readEnvValue("RECOUP_E2E_API_URL", "http://127.0.0.1:4317"));
const screenshotDir = join("output", "playwright", "david-v2");
const forbiddenOpenPaths = new Set([
  "/api/approval",
  "/api/credit/negotiation/email",
  "/api/credit/negotiation/inbound",
  "/api/email",
  "/api/forensics/query",
  "/api/query/realtime-client-secret",
  "/api/query/realtime-tool"
]);

async function main(): Promise<void> {
  mkdirSync(screenshotDir, { recursive: true });
  await assertBrowserTargetReachable(baseUrl);

  const initialModel = await fetchCreditRiskReviewModel();
  const crestline = requireAccount(initialModel, "ACC-CRE");
  assert(initialModel.accounts.length === 4, `Expected 4 David queue rows, received ${initialModel.accounts.length.toString()}.`);
  assert(crestline.verdict === "HIGH", `Expected Crestline verdict HIGH, received ${crestline.verdict}.`);
  assert(crestline.gamingFlag, "Expected Crestline gaming flag to be true.");
  assert(crestline.assessmentSteps.length === 8, `Expected 8 streamed assessment steps, received ${crestline.assessmentSteps.length.toString()}.`);
  assert(
    crestline.meshPositions.some((position) => position.position === "Collections" && position.status === "HIGH"),
    "Expected Crestline Collections tile to be HIGH."
  );

  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const pageResult = await newPageWithErrors(browser, { height: 1100, width: 1440 });
    const { errors } = pageResult;
    page = pageResult.page;

    await loginAsDemoUser(page, baseUrl, "CFO");
    await resetApprovalStateInBrowser(page, crestline.packet.actionId, "Prepare David v2 real-backend browser proof.");
    await waitForApprovalStatus("ACC-CRE", "awaiting");
    await verifyLandingDavidDemoCta(page, baseUrl);
    assert(new URL(page.url()).pathname === "/credit", `David default route was ${page.url()} instead of /credit.`);
    await page.locator('[data-testid="david-shadcn-workbench"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 45_000 });
    await waitForClientHydration(page, 'input[aria-label="Search accounts in review"]');
    await waitForClientHydration(page, 'input[aria-label="Ask David credit copilot"]');
    await page.screenshot({ caret: "initial", fullPage: true, path: join(screenshotDir, "task-1-4-2-credit-default-1440.png") });

    await checkedGoto(page, `${baseUrl}/credit/v2`, "david v2");
    assert(new URL(page.url()).pathname === "/credit", `David legacy /credit/v2 route did not resolve to /credit. Current URL: ${page.url()}.`);
    await page.locator('[data-testid="david-shadcn-workbench"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 45_000 });
    await waitForClientHydration(page, 'input[aria-label="Search accounts in review"]');
    await waitForClientHydration(page, 'input[aria-label="Ask David credit copilot"]');

    const queueRows = page.locator('[data-testid="david-queue-account-row"]');
    await waitForCount(queueRows, 4, 45_000, "David queue rows");
    const crestlineRow = page.locator('[data-testid="david-queue-account-row"][data-account-id="ACC-CRE"]').first();
    await crestlineRow.waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(crestlineRow, "Flag [D]", "Crestline queue row gaming flag");
    await expectTextInLocator(crestlineRow, "HIGH", "Crestline queue row verdict");
    await page.screenshot({ caret: "initial", fullPage: true, path: join(screenshotDir, "task-1-4-2-queue-1440.png") });

    const forbiddenRequestsOnOpen: string[] = [];
    const requestListener = (request: import("playwright").Request) => {
      const path = new URL(request.url()).pathname;
      if (forbiddenOpenPaths.has(path)) {
        forbiddenRequestsOnOpen.push(`${request.method()} ${path}`);
      }
    };

    const creditQueryResponsePromise = page.waitForResponse(
      (response) => isCreditQueryResponseForAccount(response, crestline.accountId),
      { timeout: 90_000 }
    );

    page.on("request", requestListener);
    try {
      await crestlineRow.click();
      await page.locator('[data-testid="david-account-dossier"]').waitFor({ state: "visible", timeout: 45_000 });
      await page.locator('[data-testid="david-assessment-timeline"]').waitFor({ state: "visible", timeout: 45_000 });
      await assertDrawerClosed(page, "david-assessment-timeline");
      await assertDrawerOpen(page, "david-signals-in");
      await assertDrawerClosed(page, "david-verdict-banner");
      await assertDrawerClosed(page, "david-action-packet");
      await page.getByTestId("david-assessment-timeline-trigger").click();
      await waitForCount(page.locator('[data-testid="david-assessment-step"]'), 8, 45_000, "David assessment steps");
    } finally {
      page.off("request", requestListener);
    }

    assert(forbiddenRequestsOnOpen.length === 0, `Opening Crestline triggered forbidden network calls: ${forbiddenRequestsOnOpen.join(", ")}.`);
    const creditQueryResponse = await creditQueryResponsePromise;
    const creditQueryResult = (await creditQueryResponse.json()) as CreditQueryRouteResult;
    assertDavidLiveCreditQueryResult(crestline, creditQueryResponse.status(), creditQueryResult);
    await page.locator('[data-testid="david-copilot-live-result"]').waitFor({ state: "visible", timeout: 45_000 });
    await page
      .getByTestId("david-copilot-live-result")
      .getByText(/Crestline Grocery is HIGH risk/u)
      .waitFor({ state: "visible", timeout: 45_000 });
    logDavidCreditQueryResult(crestline, creditQueryResult);

    for (const account of initialModel.accounts.filter((candidate) => candidate.accountId !== crestline.accountId)) {
      const accountQueryResult = await runDavidAccountLiveQuery(page, account);
      logDavidCreditQueryResult(account, accountQueryResult);
    }

    await verifyHarborNegotiationWorkbench(page, requireAccount(initialModel, "ACC-HAR"));
    await runHarborNegotiationDraftCopilotQuery(page, requireAccount(initialModel, "ACC-HAR"));
    await runHarborPolicyRationaleCopilotQuery(page, requireAccount(initialModel, "ACC-HAR"));

    await selectDavidAccount(page, crestline);
    await page.locator('[data-testid="david-copilot-live-result"]').waitFor({ state: "visible", timeout: 45_000 });
    await page
      .getByTestId("david-copilot-live-result")
      .getByText(/Crestline Grocery is HIGH risk/u)
      .waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(page.locator('[data-testid="david-mesh-tiles"]'), "Collections", "David mesh tiles");
    await expectTextInLocator(page.locator('[data-testid="david-mesh-tiles"]'), "HIGH", "David Collections tile");

    await ensureDrawerOpen(page, "david-action-packet");
    await page.getByText("Mark basis reviewed", { exact: true }).click();
    const sendActionPacketButton = page.getByTestId("david-send-action-packet");
    await waitForEnabled(sendActionPacketButton, 10_000, "David send action packet button");

    const approvalResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/approval" && response.request().method() === "POST",
      { timeout: 45_000 }
    );
    await sendActionPacketButton.click();
    await page.locator('[data-testid="david-approval-gate-dialog"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.getByRole("button", { name: /^Approve and refresh$/u }).click();

    const approvalResponse = await approvalResponsePromise;
    const approvalResult = (await approvalResponse.json()) as ApprovalRouteResult;
    assert(approvalResponse.ok(), `Approval route returned HTTP ${approvalResponse.status().toString()}.`);
    assert(approvalResult.actionId === crestline.packet.actionId, "Approval route actionId did not match Crestline.");
    assert(approvalResult.decision === "approve", "Approval route did not record approve.");
    assert(approvalResult.status === "human_decided", "Approval route did not return human_decided.");
    assert(
      typeof approvalResult.auditEntryHash === "string" && /^[a-f0-9]{64}$/iu.test(approvalResult.auditEntryHash),
      "Approval route did not return a valid audit hash."
    );
    const auditHash = approvalResult.auditEntryHash;

    await page.locator('[data-testid="david-action-packet-receipt"]').waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(page.getByTestId("david-action-packet-receipt"), formatAuditHash(auditHash), "David committed receipt");
    await page.locator(`[data-testid="david-action-packet-receipt"] code[title="${auditHash}"]`).waitFor({ state: "visible", timeout: 10_000 });
    const committedModel = await waitForApprovalStatus("ACC-CRE", "committed", auditHash);
    assert(
      committedModel.meshPositions.some((position) => position.position === "Collections" && position.status === "HIGH"),
      "Committed Crestline backend state lost the Collections HIGH tile."
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 45_000 });
    await waitForClientHydration(page, 'input[aria-label="Ask David credit copilot"]');
    await page.locator('[data-testid="david-queue-account-row"][data-account-id="ACC-CRE"]').first().click();
    await page.locator('[data-testid="david-account-dossier"]').waitFor({ state: "visible", timeout: 45_000 });
    await ensureDrawerOpen(page, "david-action-packet");
    await page.locator('[data-testid="david-action-packet-receipt"]').waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(page.getByTestId("david-action-packet-receipt"), formatAuditHash(auditHash), "David receipt after reload");
    await page.locator(`[data-testid="david-action-packet-receipt"] code[title="${auditHash}"]`).waitFor({ state: "visible", timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ caret: "initial", fullPage: true, path: join(screenshotDir, "task-1-4-2-approved-1280.png") });

    await loginAsDemoUser(page, baseUrl, "Maya");
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "maya overview");
    await page.locator('[data-testid="maya-root-section-overview"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.getByRole("button", { name: /^Containment$/u }).click();
    await page.locator('[data-testid="maya-root-section-containment"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="maya-containment-brief"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.screenshot({ caret: "initial", fullPage: true, path: join(screenshotDir, "task-1-4-2-maya-containment-1280.png") });

    assertNoBrowserErrors(errors, "david credit v2 real-backend e2e");
    console.log(JSON.stringify({ apiUrl, auditHash, ok: true, screenshots: screenshotDir }, null, 2));
  } finally {
    if (page !== undefined) {
      await loginAsDemoUser(page, baseUrl, "CFO");
      await resetApprovalStateInBrowser(page, crestline.packet.actionId, "Reset David v2 real-backend browser proof.");
      await waitForApprovalStatus("ACC-CRE", "awaiting");
    }
    await browser?.close();
  }
}

async function fetchCreditRiskReviewModel(): Promise<CreditRiskReviewModel> {
  const response = await fetch(`${apiUrl}/credit/v2`, { cache: "no-store" });
  const bodyText = await response.text();
  assert(response.ok, `Credit v2 backend returned HTTP ${response.status.toString()}: ${bodyText}`);

  return JSON.parse(bodyText) as CreditRiskReviewModel;
}

function requireAccount(model: CreditRiskReviewModel, accountId: string): CreditRiskAccountModel {
  const account = model.accounts.find((entry) => entry.accountId === accountId);
  assert(account !== undefined, `Credit v2 backend did not expose account ${accountId}.`);

  return account;
}

async function verifyLandingDavidDemoCta(page: Page, baseUrl: string): Promise<void> {
  await checkedGoto(page, `${baseUrl}/`, "Recoup landing David demo CTA");
  const demoTab = page.getByRole("tab", { name: "Demo" });
  await demoTab.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[role="tab"]')).some((element) => {
        return (
          element.textContent.includes("Demo") &&
          Object.keys(element).some((key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"))
        );
      }),
    undefined,
    { timeout: 10_000 }
  );
  await demoTab.click();
  const demoPanel = page.getByTestId("recoup-landing-tab-demo");
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('[data-testid="recoup-landing-tab-demo"]');

      return panel?.getAttribute("data-state") === "active" && !panel.hasAttribute("hidden");
    },
    undefined,
    { timeout: 15_000 }
  );
  await demoPanel.waitFor({ state: "visible", timeout: 15_000 });
  await expectTextInLocator(demoPanel, "Review the 4-account weekly risk queue", "David landing demo card");
  await page.getByTestId("recoup-landing-david-cta").click();
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("loginId") === "david", { timeout: 15_000 });
  const loginIdValue = await page.locator('input[name="loginId"]').inputValue();
  assert(loginIdValue === "david", `David landing CTA prefilled loginId=${loginIdValue}.`);
  await loginAsDemoUser(page, baseUrl, "david");
}

async function resetApprovalStateInBrowser(page: Page, actionId: string, reason: string): Promise<void> {
  const result = await page.evaluate(
    async ({ nextActionId, nextReason }) => {
      const response = await fetch("/api/admin/demo-reset", {
        body: JSON.stringify({ actionId: nextActionId, reason: nextReason }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      return {
        body: (await response.text()).slice(0, 500),
        status: response.status
      };
    },
    { nextActionId: actionId, nextReason: reason }
  );

  assert(result.status >= 200 && result.status < 300, `Admin demo reset returned HTTP ${result.status.toString()}: ${result.body}`);
}

async function waitForApprovalStatus(
  accountId: string,
  status: "awaiting" | "committed",
  auditHash?: string
): Promise<CreditRiskAccountModel> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const model = await fetchCreditRiskReviewModel();
    const account = requireAccount(model, accountId);
    const matchesStatus = account.packet.approvalStatus === status;
    const matchesHash = auditHash === undefined || account.packet.auditEntryHash === auditHash;
    if (matchesStatus && matchesHash) {
      return account;
    }
    await delay(750);
  }

  throw new Error(`Timed out waiting for ${accountId} packet status ${status}${auditHash === undefined ? "" : ` with hash ${auditHash}`}.`);
}

async function runDavidAccountLiveQuery(page: Page, account: CreditRiskAccountModel): Promise<CreditQueryRouteResult> {
  const responsePromise = page.waitForResponse((response) => isCreditQueryResponseForAccount(response, account.accountId), {
    timeout: 120_000
  });

  await selectDavidAccount(page, account);
  const response = await responsePromise;
  const result = (await response.json()) as CreditQueryRouteResult;
  assertDavidLiveCreditQueryResult(account, response.status(), result);
  const liveResult = page.getByTestId("david-copilot-live-result");
  await liveResult.waitFor({ state: "visible", timeout: 45_000 });
  await expectTextInLocator(liveResult, account.customer, `David live result ${account.accountId} customer`);
  await expectTextInLocator(liveResult, account.verdict, `David live result ${account.accountId} verdict`);

  return result;
}

async function verifyHarborNegotiationWorkbench(page: Page, harbor: CreditRiskAccountModel): Promise<void> {
  const [order] = harbor.negotiationOrders;
  assert(order !== undefined, "Harbor negotiation order must come from the backend read model.");
  assert(order.sourceRecordIds.includes(`credit_orders:${order.orderId}`), "Harbor negotiation order must cite its governed source row.");
  await selectDavidAccount(page, harbor);
  await ensureDrawerOpen(page, "david-action-packet");
  const simulateButton = page.getByTestId("david-simulate-alternatives");
  await simulateButton.waitFor({ state: "visible", timeout: 10_000 });
  await waitForEnabled(simulateButton, 10_000, "David simulate alternatives button");
  const routeStatuses: number[] = [];
  const forbiddenRequests: string[] = [];
  const requestListener = (request: import("playwright").Request) => {
    const path = new URL(request.url()).pathname;
    if (forbiddenOpenPaths.has(path)) {
      forbiddenRequests.push(`${request.method()} ${path}`);
    }
  };
  const responseListener = (response: import("playwright").Response) => {
    if (
      new URL(response.url()).pathname === `/api/credit/orders/${order.orderId}/deals` &&
      response.request().method() === "GET"
    ) {
      routeStatuses.push(response.status());
    }
  };
  page.on("request", requestListener);
  page.on("response", responseListener);
  await simulateButton.click();
  const workbench = page.getByTestId("david-negotiation-workbench");
  try {
    await workbench.waitFor({ state: "visible", timeout: 45_000 });
    await workbench.getByText("max-release-85", { exact: true }).first().waitFor({ state: "visible", timeout: 45_000 });
    await workbench.getByText("$75,077.00", { exact: true }).first().waitFor({ state: "visible", timeout: 45_000 });
    assert(routeStatuses.length > 0, "Harbor deal optimizer route was not observed.");
    assert(routeStatuses.every((status) => status >= 200 && status < 300), `Harbor deal optimizer route returned HTTP ${routeStatuses.join(", ")}.`);
    assert(forbiddenRequests.length === 0, `Harbor simulation triggered forbidden external action calls: ${forbiddenRequests.join(", ")}.`);
    await expectTextInLocator(workbench, `Order ${order.orderId}`, "Harbor negotiation workbench order");
    await expectTextInLocator(workbench, "Synthetic 3PL", "Harbor negotiation workbench synthetic source badge");
    await expectTextInLocator(workbench, "max-release-85", "Harbor negotiation top candidate");
    await expectTextInLocator(workbench, "$75,077.00", "Harbor negotiation deterministic objective");
    const resetButton = workbench.getByTestId("david-negotiation-reset");
    await resetButton.waitFor({ state: "visible", timeout: 10_000 });
    assert(await resetButton.isEnabled(), "David negotiation reset control must be available for fresh human tests.");
    await page.keyboard.press("Escape");
    await workbench.waitFor({ state: "hidden", timeout: 10_000 });
  } finally {
    page.off("request", requestListener);
    page.off("response", responseListener);
  }
}

async function runHarborNegotiationDraftCopilotQuery(page: Page, harbor: CreditRiskAccountModel): Promise<void> {
  const [order] = harbor.negotiationOrders;
  assert(order !== undefined, "Harbor negotiation order must come from the backend read model.");
  await selectDavidAccount(page, harbor);
  const question = `Draft a safe negotiation structure for ${harbor.customer} order ${order.orderId}.`;
  const responsePromise = page.waitForResponse((response) => isCreditQueryResponseForAccountQuestion(response, harbor.accountId, question), {
    timeout: 120_000
  });

  const input = page.getByLabel("Ask David credit copilot");
  await input.fill(question);
  await input.press("Enter");

  const response = await responsePromise;
  const result = (await response.json()) as CreditQueryRouteResult;
  assertDavidLiveCreditQueryResult(harbor, response.status(), result);
  assert(
    result.negotiationDraft?.toolName === "credit_negotiation.draft_structures",
    `Harbor draft query did not return a governed negotiation draft: ${JSON.stringify(result.negotiationDraft)}`
  );
  const rankedCandidates = result.negotiationDraft.model?.rankedCandidates ?? [];
  const rejectedCandidates = result.negotiationDraft.model?.rejectedCandidates ?? [];
  assert(rankedCandidates.length > 0 || rejectedCandidates.length > 0, "Harbor draft query returned neither engine-priced ranked candidates nor policy rejection reasons.");
  const topCandidate = rankedCandidates[0];
  const firstRejectedCandidate = rejectedCandidates[0];
  assert(
    result.trace?.some((event) => event.toolName === "credit_negotiation.draft_structures") === true,
    `Harbor draft query trace did not include credit_negotiation.draft_structures: ${JSON.stringify(result.trace)}`
  );

  const draftPanel = page.getByTestId("david-copilot-negotiation-draft");
  await draftPanel.waitFor({ state: "visible", timeout: 45_000 });
  await expectTextInLocator(draftPanel, "Agent-drafted", "David copilot negotiation draft panel");
  await expectTextInLocator(draftPanel, "Engine-priced", "David copilot negotiation draft panel");
  if (topCandidate !== undefined) {
    assert(typeof topCandidate.candidateId === "string", "Harbor draft query top candidate omitted candidateId.");
    assert(typeof topCandidate.objectiveValueLabel === "string", "Harbor draft query top candidate omitted objectiveValueLabel.");
    await expectTextInLocator(draftPanel, topCandidate.candidateId, "David copilot negotiation draft top candidate");
    await expectTextInLocator(draftPanel, topCandidate.objectiveValueLabel, "David copilot negotiation draft objective");
  } else {
    assert(typeof firstRejectedCandidate?.reason === "string", "Harbor draft query rejected candidate omitted reason.");
    await expectTextInLocator(draftPanel, "Rejected structures", "David copilot negotiation draft rejected structures");
    await expectTextInLocator(draftPanel, firstRejectedCandidate.reason, "David copilot negotiation draft rejection reason");
  }
  await expectTextInLocator(draftPanel, "credit_negotiation.draft_structures + deterministic deal optimizer", "David copilot negotiation draft basis");
}

async function runHarborPolicyRationaleCopilotQuery(page: Page, harbor: CreditRiskAccountModel): Promise<void> {
  const question = "Why is max deposit capped at 60%?";
  const responsePromise = page.waitForResponse((response) => isCreditQueryResponseForAccountQuestion(response, harbor.accountId, question), {
    timeout: 120_000
  });

  await selectDavidAccount(page, harbor);
  const input = page.getByLabel("Ask David credit copilot");
  await input.fill(question);
  await input.press("Enter");

  const response = await responsePromise;
  const result = (await response.json()) as CreditQueryRouteResult;
  assertDavidLiveCreditQueryResult(harbor, response.status(), result);
  assert(
    result.policyRationale?.executablePolicySource === "credit_negotiation_policy",
    `David policy query did not keep executable policy anchored to exact rows: ${JSON.stringify(result.policyRationale)}`
  );
  assert(result.policyRationale.policyKey === "max_deposit_pct", "David policy query did not resolve max_deposit_pct.");
  assert(result.policyRationale.policyValueText === "60", "David policy query did not show exact policy value 60.");
  assert(result.policyRationale.status === "available", `David policy rationale was not available: ${JSON.stringify(result.policyRationale)}`);
  assert(
    Array.isArray(result.policyRationale.citations) && result.policyRationale.citations.length > 0,
    "David policy rationale did not include vector citations."
  );
  assert(!JSON.stringify(result.policyRationale).includes("value_text"), "David policy rationale exposed vector-side value_text.");
  assert(!JSON.stringify(result.policyRationale).includes("valueText"), "David policy rationale exposed vector-side valueText.");

  const policyPanel = page.getByTestId("david-copilot-policy-rationale");
  await policyPanel.waitFor({ state: "visible", timeout: 45_000 });
  await expectTextInLocator(policyPanel, "Policy rationale", "David copilot policy rationale panel");
  await expectTextInLocator(policyPanel, "Exact policy row", "David copilot policy rationale panel");
  await expectTextInLocator(policyPanel, "credit_negotiation_policy", "David copilot policy exact source");
  await expectTextInLocator(policyPanel, "max_deposit_pct", "David copilot policy key");
  await expectTextInLocator(policyPanel, "60", "David copilot policy value");
  await expectTextInLocator(policyPanel, "Vector rationale", "David copilot vector rationale section");
  await expectTextInLocator(policyPanel, String(result.policyRationale.citations[0]?.recordId), "David copilot vector citation");
}

async function selectDavidAccount(page: Page, account: CreditRiskAccountModel): Promise<void> {
  const queueRow = page.locator(`[data-testid="david-queue-account-row"][data-account-id="${escapeAttributeValue(account.accountId)}"]`).first();
  if (await queueRow.isVisible()) {
    await queueRow.click();
  } else {
    await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(account.customer)}$`, "u") }).click();
  }

  const dossier = page.locator('[data-testid="david-account-dossier"]');
  await dossier.waitFor({ state: "visible", timeout: 45_000 });
  await expectTextInLocator(dossier, account.customer, `David account dossier ${account.accountId}`);
}

function isCreditQueryResponseForAccount(response: import("playwright").Response, accountId: string): boolean {
  const url = new URL(response.url());
  if (url.pathname !== "/api/credit/query" || response.request().method() !== "POST") {
    return false;
  }

  const payload = safeJsonParse(response.request().postData() ?? "");
  return typeof payload === "object" && payload !== null && (payload as { accountId?: unknown }).accountId === accountId;
}

function isCreditQueryResponseForAccountQuestion(response: import("playwright").Response, accountId: string, question: string): boolean {
  const url = new URL(response.url());
  if (url.pathname !== "/api/credit/query" || response.request().method() !== "POST") {
    return false;
  }

  const payload = safeJsonParse(response.request().postData() ?? "");
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { accountId?: unknown; question?: unknown }).accountId === accountId &&
    (payload as { accountId?: unknown; question?: unknown }).question === question
  );
}

function assertDavidLiveCreditQueryResult(
  account: CreditRiskAccountModel,
  httpStatus: number,
  result: CreditQueryRouteResult
): void {
  assert(httpStatus >= 200 && httpStatus < 300, `David credit query for ${account.accountId} returned HTTP ${httpStatus.toString()}.`);
  assert(typeof result.answer === "string" && result.answer.trim().length > 0, `David credit query for ${account.accountId} returned no answer.`);
  assert(
    typeof result.deterministicBasis === "string" && result.deterministicBasis.includes("OpenAI Agents SDK live trace"),
    `David credit query for ${account.accountId} did not prove OpenAI Agents SDK live trace.`
  );
  assert(
    result.modelExecution?.mode === "live_openai_agents",
    `David credit query for ${account.accountId} did not return live_openai_agents mode: ${JSON.stringify(result)}`
  );
  assert(
    Array.isArray(result.modelExecution.agentNames) && result.modelExecution.agentNames.length >= 2,
    `David credit query for ${account.accountId} did not include agent names.`
  );
  assert(
    typeof result.modelExecution.handoffCount === "number" && result.modelExecution.handoffCount > 0,
    `David credit query for ${account.accountId} did not include a live handoff.`
  );
  assert(result.modelExecution.rawModelTextPolicy === "suppressed", `David credit query for ${account.accountId} did not suppress raw model text.`);
  assert(
    result.modelExecution.sourceReadMode === "live_sdk_mcp",
    `David credit query for ${account.accountId} did not report live MCP source-read mode: ${JSON.stringify(result.modelExecution)}`
  );
  assert(
    typeof result.modelExecution.tokenUsage === "number" || typeof result.modelExecution.tokenUsageSnapshot?.totalTokens === "number",
    `David credit query for ${account.accountId} did not include token usage.`
  );
  assert(Array.isArray(result.citations) && result.citations.length > 0, `David credit query for ${account.accountId} did not return citations.`);
  assert(Array.isArray(result.trace) && result.trace.length > 0, `David credit query for ${account.accountId} did not return trace rows.`);
  assert(
    result.trace.some((event) => event.toolName === "credit_risk.answer"),
    `David credit query for ${account.accountId} trace did not include credit_risk.answer: ${JSON.stringify(result.trace)}`
  );
  const goldenErrors = validateDavidCreditQueryGolden(
    { accountId: account.accountId, customer: account.customer, verdict: account.verdict },
    result
  );
  assert(goldenErrors.length === 0, `David credit query missed golden expectations: ${goldenErrors.join("; ")}`);
}

function logDavidCreditQueryResult(account: CreditRiskAccountModel, result: CreditQueryRouteResult): void {
  console.log(
    `DAVID_LIVE_QUERY_RESULT ${JSON.stringify({
      accountId: account.accountId,
      agentNames: result.modelExecution?.agentNames ?? [],
      citationCount: Array.isArray(result.citations) ? result.citations.length : 0,
      customer: account.customer,
      handoffCount: result.modelExecution?.handoffCount ?? null,
      mode: result.modelExecution?.mode ?? null,
      question: `Why is ${account.customer} ${account.verdict.toLowerCase()} risk?`,
      sourceReadMode: result.modelExecution?.sourceReadMode ?? null,
      tokenUsage: result.modelExecution?.tokenUsage ?? result.modelExecution?.tokenUsageSnapshot?.totalTokens ?? null,
      traceRows: Array.isArray(result.trace) ? result.trace.length : 0,
      verdict: account.verdict
    })}`
  );
}

async function waitForCount(
  locator: ReturnType<Page["locator"]>,
  expectedCount: number,
  timeoutMs: number,
  label: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await locator.count()) === expectedCount) {
      return;
    }
    await delay(250);
  }

  throw new Error(`${label} did not reach count ${expectedCount.toString()}.`);
}

async function waitForEnabled(locator: ReturnType<Page["getByTestId"]>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await locator.isDisabled())) {
      return;
    }
    await delay(200);
  }

  throw new Error(`${label} did not become enabled.`);
}

async function assertDrawerClosed(page: Page, testId: string): Promise<void> {
  const state = await page.getByTestId(testId).getAttribute("data-open", { timeout: 10_000 });
  assert(state === "false", `${testId} should be collapsed by default, received data-open=${String(state)}.`);
}

async function assertDrawerOpen(page: Page, testId: string): Promise<void> {
  const state = await page.getByTestId(testId).getAttribute("data-open", { timeout: 10_000 });
  assert(state === "true", `${testId} should be expanded by default, received data-open=${String(state)}.`);
}

async function ensureDrawerOpen(page: Page, testId: string): Promise<void> {
  const drawer = page.getByTestId(testId);
  const state = await drawer.getAttribute("data-open", { timeout: 10_000 });
  if (state !== "true") {
    await page.getByTestId(`${testId}-trigger`).click();
  }
  await assertDrawerOpen(page, testId);
}

async function expectTextInLocator(
  locator: ReturnType<Page["locator"]>,
  expectedText: string,
  label: string
): Promise<void> {
  const text = normalizeUiText(await locator.innerText({ timeout: 45_000 }));
  assert(text.includes(expectedText), `${label} did not include ${expectedText}. Rendered: ${text}`);
}

async function waitForClientHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (element === null) {
        return false;
      }

      return Object.keys(element).some((key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"));
    },
    selector,
    { timeout: 10_000 }
  );
}

function normalizeUiText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function formatAuditHash(hash: string): string {
  if (hash.length <= 24) {
    return hash;
  }

  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/u, "");
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function readEnvValue(key: string, fallback: string): string {
  return process.env[key] ?? localEnv[key] ?? fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
