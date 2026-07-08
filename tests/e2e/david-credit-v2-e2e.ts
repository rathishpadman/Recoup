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

interface CreditRiskReviewModel {
  accounts: CreditRiskAccountModel[];
}

interface CreditRiskAccountModel {
  accountId: string;
  assessmentSteps: Array<{ key: string }>;
  customer: string;
  gamingFlag: boolean;
  meshPositions: Array<{ position: string; status: string }>;
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

const localEnv = loadLocalRuntimeEnvFiles();
const baseUrl = resolveBaseUrl();
const apiUrl = normalizeBaseUrl(readEnvValue("RECOUP_E2E_API_URL", "http://127.0.0.1:4317"));
const screenshotDir = join("output", "playwright", "david-v2");
const forbiddenOpenPaths = new Set([
  "/api/approval",
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
    await loginAsDemoUser(page, baseUrl, "david");
    assert(new URL(page.url()).pathname === "/credit", `David default route was ${page.url()} instead of /credit.`);
    await page.getByText(/Credit Arbitration|Credit Sentinel alert/u).first().waitFor({ state: "visible", timeout: 45_000 });
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "task-1-4-2-credit-default-1440.png") });

    await checkedGoto(page, `${baseUrl}/credit/v2`, "david v2");
    await page.locator('[data-testid="david-shadcn-workbench"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 45_000 });

    const queueRows = page.locator('[data-testid="david-queue-account-row"]');
    await waitForCount(queueRows, 4, 45_000, "David queue rows");
    const crestlineRow = page.locator('[data-testid="david-queue-account-row"][data-account-id="ACC-CRE"]').first();
    await crestlineRow.waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(crestlineRow, "Flag [D]", "Crestline queue row gaming flag");
    await expectTextInLocator(crestlineRow, "HIGH", "Crestline queue row verdict");
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "task-1-4-2-queue-1440.png") });

    const forbiddenRequestsOnOpen: string[] = [];
    const requestListener = (request: import("playwright").Request) => {
      const path = new URL(request.url()).pathname;
      if (forbiddenOpenPaths.has(path)) {
        forbiddenRequestsOnOpen.push(`${request.method()} ${path}`);
      }
    };

    page.on("request", requestListener);
    try {
      await crestlineRow.click();
      await page.locator('[data-testid="david-account-dossier"]').waitFor({ state: "visible", timeout: 45_000 });
      await page.locator('[data-testid="david-assessment-timeline"]').waitFor({ state: "visible", timeout: 45_000 });
      await waitForCount(page.locator('[data-testid="david-assessment-step"]'), 8, 45_000, "David assessment steps");
    } finally {
      page.off("request", requestListener);
    }

    assert(forbiddenRequestsOnOpen.length === 0, `Opening Crestline triggered forbidden network calls: ${forbiddenRequestsOnOpen.join(", ")}.`);
    await page.getByText(/Crestline Grocery is HIGH risk/u).waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(page.locator('[data-testid="david-mesh-tiles"]'), "Collections", "David mesh tiles");
    await expectTextInLocator(page.locator('[data-testid="david-mesh-tiles"]'), "HIGH", "David Collections tile");

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
    await expectTextInLocator(page.getByTestId("david-action-packet-receipt"), auditHash, "David committed receipt");
    const committedModel = await waitForApprovalStatus("ACC-CRE", "committed", auditHash);
    assert(
      committedModel.meshPositions.some((position) => position.position === "Collections" && position.status === "HIGH"),
      "Committed Crestline backend state lost the Collections HIGH tile."
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="david-risk-review-queue"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="david-queue-account-row"][data-account-id="ACC-CRE"]').first().click();
    await page.locator('[data-testid="david-action-packet-receipt"]').waitFor({ state: "visible", timeout: 45_000 });
    await expectTextInLocator(page.getByTestId("david-action-packet-receipt"), auditHash, "David receipt after reload");
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "task-1-4-2-approved-1280.png") });

    await loginAsDemoUser(page, baseUrl, "Maya");
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "maya overview");
    await page.locator('[data-testid="maya-root-section-overview"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.locator('[data-testid="maya-containment-brief"]').waitFor({ state: "visible", timeout: 45_000 });
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "task-1-4-2-maya-containment-1280.png") });

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

async function expectTextInLocator(
  locator: ReturnType<Page["locator"]>,
  expectedText: string,
  label: string
): Promise<void> {
  const text = normalizeUiText(await locator.innerText({ timeout: 45_000 }));
  assert(text.includes(expectedText), `${label} did not include ${expectedText}. Rendered: ${text}`);
}

function normalizeUiText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/u, "");
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
