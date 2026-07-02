import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  assertNoBrowserErrors,
  assertBrowserTargetReachable,
  checkedGoto,
  ensurePostImplementationScreenshotDir,
  loginAsDemoUser,
  newPageWithErrors,
  openMayaEvidenceDossier,
  resolveBaseUrl
} from "./real-evidence-browser-helpers.ts";

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  await assertBrowserTargetReachable(baseUrl);
  const screenshotDir = ensurePostImplementationScreenshotDir();
  let browser: Browser | undefined;
  let approvedActionId: string | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const { errors, page } = await newPageWithErrors(browser, { height: 1100, width: 1440 });
    await loginAsDemoUser(page, baseUrl, "Maya");
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "Maya Forensics");
    await openMayaEvidenceDossier(page, baseUrl);

    const actionId = await readSelectedApprovalActionId(page, "S3-L1");
    await resetApprovalWithCfo(browser, baseUrl, actionId, "Prepare SSE live-update proof from a clean approval baseline.");
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "Maya Forensics after approval reset");
    await openMayaEvidenceDossier(page, baseUrl);

    const beforeHash = await visibleText(page, '[data-testid="forensics-source-hash"]', "Forensics source hash");
    const beforeReceiptHash = await visibleText(page, '[data-testid="forensics-receipt-hash"]', "Forensics receipt hash");
    const beforeModelVersion = await page.locator('[data-testid="maya-shadcn-workbench"]').getAttribute("data-model-version");
    await approveActionWithMaya(page, actionId);
    approvedActionId = actionId;
    const refreshStatus = await page.evaluate(async () => {
      const response = await fetch("/api/forensics/refresh", { cache: "no-store", method: "POST" });

      return response.status;
    });
    if (refreshStatus >= 500) {
      throw new Error(`/api/forensics/refresh returned HTTP ${refreshStatus.toString()}.`);
    }

    await page.waitForFunction(
      ({ beforeHashText, beforeVersion }) => {
        const hashNode = document.querySelector('[data-testid="forensics-source-hash"]');
        const receiptNode = document.querySelector('[data-testid="forensics-receipt-hash"]');
        const workbench = document.querySelector('[data-testid="maya-shadcn-workbench"]');
        const hashText = hashNode === null ? undefined : hashNode.textContent.trim();
        const receiptText = receiptNode === null ? undefined : receiptNode.textContent.trim();
        const version = workbench === null ? null : workbench.getAttribute("data-model-version");

        return (
          hashText !== undefined &&
          hashText.length > 0 &&
          receiptText !== undefined &&
          receiptText.length > 0 &&
          (receiptText !== beforeHashText || version !== beforeVersion)
        );
      },
      { beforeHashText: beforeReceiptHash, beforeVersion: beforeModelVersion },
      { timeout: 60_000 }
    );
    const afterHash = await visibleText(page, '[data-testid="forensics-source-hash"]', "Forensics source hash after refresh");
    const afterReceiptHash = await visibleText(page, '[data-testid="forensics-receipt-hash"]', "Forensics receipt hash after refresh");
    if (afterReceiptHash === beforeReceiptHash) {
      throw new Error("SSE invalidation reloaded the model but did not visibly change the receipt hash.");
    }
    if (afterHash.length === 0 || beforeHash.length === 0) {
      throw new Error("SSE live-update proof could not read visible source hashes.");
    }

    await page.screenshot({ fullPage: true, path: join(screenshotDir, "sse-live-update-after.png") });
    assertNoBrowserErrors(errors, "Forensics SSE live-update");
  } finally {
    if (browser !== undefined && approvedActionId !== undefined) {
      await resetApprovalWithCfo(browser, baseUrl, approvedActionId, "Clean up SSE live-update approval proof.").catch(() => undefined);
    }
    await browser?.close();
  }
}

async function readSelectedApprovalActionId(page: Page, lineId: string): Promise<string> {
  const result = await page.evaluate(async (targetLineId) => {
    const response = await fetch(`/api/forensics/work-items/${encodeURIComponent(targetLineId)}`, { cache: "no-store" });
    const body = (await response.json()) as { recoveryDraft?: { actionId?: unknown } };

    return {
      actionId: typeof body.recoveryDraft?.actionId === "string" ? body.recoveryDraft.actionId : undefined,
      status: response.status
    };
  }, lineId);
  if (result.status < 200 || result.status >= 300 || result.actionId === undefined) {
    throw new Error(`Could not read approval action for ${lineId}; status ${result.status.toString()}.`);
  }

  return result.actionId;
}

async function approveActionWithMaya(page: Page, actionId: string): Promise<void> {
  const result = await page.evaluate(async (targetActionId) => {
    const response = await fetch("/api/approval", {
      body: JSON.stringify({ actionId: targetActionId, decision: "approve" }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    return {
      body: (await response.text()).slice(0, 240),
      status: response.status
    };
  }, actionId);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Maya approval for SSE proof returned HTTP ${result.status.toString()}: ${result.body}`);
  }
}

async function resetApprovalWithCfo(browser: Browser, baseUrl: string, actionId: string, reason: string): Promise<void> {
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    const page = await context.newPage();
    await loginAsDemoUser(page, baseUrl, "CFO");
    const result = await page.evaluate(
      async ({ targetActionId, targetReason }) => {
        const response = await fetch("/api/admin/demo-reset", {
          body: JSON.stringify({ actionId: targetActionId, reason: targetReason }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST"
        });

        return {
          body: (await response.text()).slice(0, 240),
          status: response.status
        };
      },
      { targetActionId: actionId, targetReason: reason }
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`CFO approval reset returned HTTP ${result.status.toString()}: ${result.body}`);
    }
  } finally {
    await context?.close();
  }
}

async function visibleText(page: Page, selector: string, label: string): Promise<string> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 30_000 });
  const text = (await locator.innerText()).trim();
  if (text.length === 0) {
    throw new Error(`${label} was empty.`);
  }

  return text;
}

await main();
