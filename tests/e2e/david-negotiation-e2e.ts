import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Request, type Route } from "playwright";
import {
  assertBrowserTargetReachable,
  assertNoBrowserErrors,
  loginAsDemoUser,
  newPageWithErrors,
  resolveBaseUrl
} from "./real-evidence-browser-helpers.ts";

interface CreditRiskReviewModel {
  accounts: CreditRiskAccountModel[];
}

interface CreditRiskAccountModel {
  accountId: string;
  customer: string;
  negotiationOrders: Array<{
    nextRound: number;
    orderId: string;
    sourceRecordIds: string[];
  }>;
}

interface RouteProbeResult {
  body: unknown;
  status: number;
}

const baseUrl = resolveBaseUrl();
const apiUrl = normalizeBaseUrl(process.env.RECOUP_E2E_API_URL ?? "http://127.0.0.1:4317");
const screenshotDir = join("output", "playwright", "david-negotiation");
const forbiddenWorkbenchOpenPaths = new Set([
  "/api/approval",
  "/api/credit/negotiation/email",
  "/api/credit/negotiation/inbound",
  "/api/email"
]);

async function main(): Promise<void> {
  mkdirSync(screenshotDir, { recursive: true });
  await assertBrowserTargetReachable(baseUrl);
  const model = await fetchCreditRiskReviewModel();
  const harbor = requireAccount(model, "ACC-HAR");
  const order = harbor.negotiationOrders[0];
  assert(order !== undefined, "Harbor negotiation order must come from the backend read model.");
  assert(order.sourceRecordIds.includes(`credit_orders:${order.orderId}`), "Harbor order must cite its governed source row.");

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const { errors, page } = await newPageWithErrors(browser, { height: 1100, width: 1440 });
    await loginAsDemoUser(page, baseUrl, "david");
    await page.locator('[data-testid="david-shadcn-workbench"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 45_000 });
    await waitForClientHydration(page, 'input[aria-label="Search accounts in review"]');
    await waitForClientHydration(page, 'input[aria-label="Ask David credit copilot"]');

    await selectDavidAccount(page, harbor);
    await ensureDrawerOpen(page, "david-action-packet");

    const forbiddenRequests: string[] = [];
    const dealStatuses: number[] = [];
    const requestListener = (request: import("playwright").Request) => {
      const path = new URL(request.url()).pathname;
      if (forbiddenWorkbenchOpenPaths.has(path)) {
        forbiddenRequests.push(`${request.method()} ${path}`);
      }
    };
    const responseListener = (response: import("playwright").Response) => {
      const url = new URL(response.url());
      if (url.pathname === `/api/credit/orders/${order.orderId}/deals`) {
        dealStatuses.push(response.status());
      }
    };

    page.on("request", requestListener);
    page.on("response", responseListener);
    try {
      const simulateButton = page.getByTestId("david-simulate-alternatives");
      await simulateButton.waitFor({ state: "visible", timeout: 10_000 });
      await waitForEnabled(simulateButton, 10_000, "David simulate alternatives");
      await simulateButton.click();
      const workbench = page.getByTestId("david-negotiation-workbench");
      await workbench.waitFor({ state: "visible", timeout: 45_000 });
      const checkReplies = workbench.getByRole("button", { name: "Check replies" });
      const refreshCommunication = workbench.getByRole("button", { name: "Refresh communication" });
      await waitForEnabled(checkReplies, 10_000, "David check replies button");
      await refreshCommunication.waitFor({ state: "visible", timeout: 10_000 });
      await checkReplies.click();
      await workbench.getByTestId("david-negotiation-communication-status").waitFor({ state: "visible", timeout: 10_000 });
      const communicationFlow = workbench.getByTestId("david-negotiation-communication-flow");
      await communicationFlow.waitFor({ state: "visible", timeout: 10_000 });
      await expectTextInLocator(communicationFlow, "Order received", "Negotiation transaction order step");
      await expectTextInLocator(communicationFlow, "Outbound sent", "Negotiation transaction outbound step");
      await expectTextInLocator(communicationFlow, "Customer reply", "Negotiation transaction reply step");
      await expectTextInLocator(communicationFlow, "Governed draft", "Negotiation transaction draft step");
      assert(
        (await communicationFlow.locator('[aria-current="step"]').count()) === 1,
        "Negotiation transaction flow must expose exactly one current step."
      );
      await expectTextInLocator(workbench, `Order ${order.orderId}`, "Harbor workbench order");
      await expectTextInLocator(workbench, "max-release-85", "Harbor top deal candidate");
      await expectTextInLocator(workbench, "Synthetic 3PL", "Harbor synthetic provenance badge");
      const approvalSendPath = workbench.getByTestId("david-negotiation-approval-send-path");
      await approvalSendPath.waitFor({ state: "visible", timeout: 10_000 });
      await expectTextInLocator(approvalSendPath, `credit-v2:negotiation:${order.orderId}:r${order.nextRound.toString()}`, "Harbor negotiation approval action");
      await workbench.getByTestId("david-negotiation-draft-counter").waitFor({ state: "visible", timeout: 10_000 });
      const sendApprovedEmail = workbench.getByTestId("david-negotiation-send-approved-email");
      await sendApprovedEmail.waitFor({ state: "visible", timeout: 10_000 });
      assert(await sendApprovedEmail.isDisabled(), "Negotiation email send button must stay disabled before approval.");
      await page.screenshot({ caret: "initial", fullPage: true, path: join(screenshotDir, "harbor-workbench-open.png") });
    } finally {
      page.off("request", requestListener);
      page.off("response", responseListener);
    }

    assert(dealStatuses.some((status) => status >= 200 && status < 300), `Deal optimizer route statuses: ${dealStatuses.join(", ")}.`);
    assert(
      forbiddenRequests.length === 0,
      `Opening the David negotiation workbench triggered forbidden side effects: ${forbiddenRequests.join(", ")}.`
    );
    assertNoBrowserErrors(errors, "david negotiation workbench open");

    await exerciseApprovalAndSendUiPath(page, harbor, order);
    assertNoBrowserErrors(errors, "david negotiation approval and send UI");

    const manualCounter = await browserRouteProbe(page, "/api/credit/negotiation/inbound/manual", {
      orderId: order.orderId,
      pastedText: "Harbor can pay 20% deposit, accept 85% release, 2 tranches, 1.1x collateral, and 150 bps spread.",
      round: order.nextRound
    });
    assert(manualCounter.status === 200, `Manual counter route returned HTTP ${manualCounter.status.toString()}.`);
    assert(
      readRecordString(manualCounter.body, "status") === "dropped_unmatched",
      `Manual counter before a sent round must fail closed as dropped_unmatched: ${JSON.stringify(manualCounter.body)}.`
    );

    const emailBeforeApproval = await browserRouteProbe(page, "/api/credit/negotiation/email", {
      accountId: harbor.accountId,
      actionId: `credit-v2:negotiation:${order.orderId}:r${order.nextRound.toString()}`,
      orderId: order.orderId,
      round: order.nextRound
    });
    assert(
      emailBeforeApproval.status === 409 || emailBeforeApproval.status === 503,
      `Email send before approval/live config should fail closed with 409 or 503, got HTTP ${emailBeforeApproval.status.toString()}.`
    );
    const emailError = readRecordString(emailBeforeApproval.body, "error") ?? "";
    assert(
      /required before email send|not configured|Email service is not configured/iu.test(emailError),
      `Unexpected email fail-closed error: ${JSON.stringify(emailBeforeApproval.body)}.`
    );

    const resetResult = await browserRouteProbe(page, "/api/credit/negotiation/reset", {
      orderId: order.orderId,
      reason: "David negotiation browser fail-closed proof"
    });
    assert(
      resetResult.status === 200 || resetResult.status === 403 || resetResult.status === 503,
      `Reset route returned unexpected HTTP ${resetResult.status.toString()}.`
    );
    if (resetResult.status === 200) {
      assert(readRecordString(resetResult.body, "status") === "reset_recorded", "Enabled reset must return reset_recorded.");
    } else {
      const resetError = readRecordString(resetResult.body, "error") ?? "";
      assert(/reset|configured|unavailable/iu.test(resetError), `Unexpected reset fail-closed error: ${JSON.stringify(resetResult.body)}.`);
    }

    console.log(
      JSON.stringify(
        {
          apiUrl,
          emailBeforeApprovalStatus: emailBeforeApproval.status,
          manualCounterStatus: readRecordString(manualCounter.body, "status"),
          ok: true,
          resetStatus: resetResult.status,
          screenshots: screenshotDir
        },
        null,
        2
      )
    );
  } finally {
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

async function selectDavidAccount(page: Page, account: CreditRiskAccountModel): Promise<void> {
  const row = page.locator(`[data-testid="david-queue-account-row"][data-account-id="${account.accountId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 45_000 });
  await row.click();
  await page.locator('[data-testid="david-account-dossier"]').waitFor({ state: "visible", timeout: 45_000 });
  await expectTextInLocator(page.locator('[data-testid="david-account-dossier"]'), account.customer, "David account dossier customer");
}

async function ensureDrawerOpen(page: Page, testId: string): Promise<void> {
  const trigger = page.getByTestId(`${testId}-trigger`);
  await trigger.waitFor({ state: "visible", timeout: 10_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await page.getByTestId(testId).locator('[data-slot="collapsible-content"][data-state="open"]').waitFor({
    state: "visible",
    timeout: 10_000
  });
}

async function exerciseApprovalAndSendUiPath(
  page: Page,
  account: CreditRiskAccountModel,
  order: CreditRiskAccountModel["negotiationOrders"][number]
): Promise<void> {
  const actionId = `credit-v2:negotiation:${order.orderId}:r${order.nextRound.toString()}`;
  const approvalPayloads: unknown[] = [];
  const emailPayloads: unknown[] = [];
  const approvalRouteHandler = async (route: Route) => {
    approvalPayloads.push(readRequestJson(route.request()));
    await route.fulfill({
      body: JSON.stringify({
        actionId,
        auditEntryHash: "b".repeat(64),
        decision: "approve",
        status: "human_decided"
      }),
      contentType: "application/json",
      status: 200
    });
  };
  const emailRouteHandler = async (route: Route) => {
    emailPayloads.push(readRequestJson(route.request()));
    await route.fulfill({
      body: JSON.stringify({
        accountId: account.accountId,
        actionId,
        orderId: order.orderId,
        providerEmailId: "local-playwright-route-stub",
        round: order.nextRound,
        sentAtIso: "2026-07-10T00:00:00.000Z",
        status: "sent"
      }),
      contentType: "application/json",
      status: 200
    });
  };

  await page.route("**/api/approval", approvalRouteHandler);
  await page.route("**/api/credit/negotiation/email", emailRouteHandler);
  try {
    const workbench = page.getByTestId("david-negotiation-workbench");
    const approvalSendPath = workbench.getByTestId("david-negotiation-approval-send-path");
    await approvalSendPath.waitFor({ state: "visible", timeout: 10_000 });
    await expectTextInLocator(approvalSendPath, actionId, "Harbor negotiation approval action");
    await expectTextInLocator(approvalSendPath, "max-release-85", "Harbor backend top candidate approval packet");

    const draftCounter = workbench.getByTestId("david-negotiation-draft-counter");
    await waitForEnabled(draftCounter, 10_000, "David draft counter button");
    await draftCounter.click();

    const approvalDialog = page.getByTestId("david-approval-gate-dialog");
    await approvalDialog.waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(approvalDialog, actionId, "David negotiation approval dialog action");
    await page.getByRole("button", { name: /^Approve draft$/u }).click();
    await waitForCondition(() => approvalPayloads.length === 1, 10_000, "David approval route call");
    assertNegotiationApprovalPayload(approvalPayloads[0], actionId);
    await approvalDialog.waitFor({ state: "hidden", timeout: 10_000 });

    const sendApprovedEmail = workbench.getByTestId("david-negotiation-send-approved-email");
    await waitForEnabled(sendApprovedEmail, 10_000, "David send approved email button");
    assert(!(await sendApprovedEmail.isDisabled()), "Negotiation email send button stayed disabled after approval.");
    await sendApprovedEmail.click();

    await waitForCondition(() => emailPayloads.length === 1, 10_000, "David negotiation email route call");
    assertNegotiationEmailPayload(emailPayloads[0], {
      accountId: account.accountId,
      actionId,
      orderId: order.orderId,
      round: order.nextRound
    });
    const sendStatus = workbench.getByTestId("david-negotiation-send-status");
    await sendStatus.waitFor({ state: "visible", timeout: 10_000 });
    const sendStatusText = await sendStatus.textContent();
    assert(
      /Approved email (?:send recorded|was already sent|sent|queued)/iu.test(sendStatusText ?? ""),
      `Negotiation send status did not show a sent/queued/success state: ${sendStatusText ?? ""}.`
    );
    await page.screenshot({ caret: "initial", fullPage: true, path: join(screenshotDir, "harbor-approval-send-ui.png") });
  } finally {
    await page.unroute("**/api/approval", approvalRouteHandler);
    await page.unroute("**/api/credit/negotiation/email", emailRouteHandler);
  }
}

async function waitForEnabled(locator: ReturnType<Page["locator"]>, timeoutMs: number, label: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.isEnabled()) {
      return;
    }
    await delay(150);
  }

  throw new Error(`${label} did not become enabled.`);
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

async function waitForCondition(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(150);
  }

  throw new Error(`${label} did not occur.`);
}

async function expectTextInLocator(locator: ReturnType<Page["locator"]>, text: string, label: string): Promise<void> {
  await locator.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 45_000 });
  assert((await locator.textContent())?.includes(text) === true, `${label} did not include ${text}.`);
}

async function browserRouteProbe(page: Page, path: string, payload: unknown): Promise<RouteProbeResult> {
  return page.evaluate(
    async ({ body, targetPath }) => {
      const response = await fetch(targetPath, {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }

      return { body: parsed, status: response.status };
    },
    { body: payload, targetPath: path }
  );
}

function readRequestJson(request: Request): unknown {
  const body = request.postData();
  if (body === null) {
    return undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function assertNegotiationApprovalPayload(payload: unknown, actionId: string): void {
  assert(readRecordString(payload, "actionId") === actionId, `Approval payload did not include ${actionId}.`);
  assert(readRecordString(payload, "decision") === "approve", `Approval payload did not approve: ${JSON.stringify(payload)}.`);
}

function assertNegotiationEmailPayload(
  payload: unknown,
  expected: {
    accountId: string;
    actionId: string;
    orderId: string;
    round: number;
  }
): void {
  assert(readRecordString(payload, "accountId") === expected.accountId, `Email payload account mismatch: ${JSON.stringify(payload)}.`);
  assert(readRecordString(payload, "actionId") === expected.actionId, `Email payload action mismatch: ${JSON.stringify(payload)}.`);
  assert(readRecordString(payload, "orderId") === expected.orderId, `Email payload order mismatch: ${JSON.stringify(payload)}.`);
  assert(readRecordNumber(payload, "round") === expected.round, `Email payload round mismatch: ${JSON.stringify(payload)}.`);
}

function readRecordString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
}

function readRecordNumber(value: unknown, key: string): number | undefined {
  return isRecord(value) && typeof value[key] === "number" ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
