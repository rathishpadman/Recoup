import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
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

  try {
    browser = await chromium.launch({ headless: true });
    const { errors, page } = await newPageWithErrors(browser, { height: 1100, width: 1440 });
    await loginAsDemoUser(page, baseUrl, "Maya");
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "Maya Forensics");
    await openMayaEvidenceDossier(page, baseUrl);

    const beforeHash = await visibleText(page, '[data-testid="forensics-source-hash"]', "Forensics source hash");
    const beforeModelVersion = await page.locator('[data-testid="maya-shadcn-workbench"]').getAttribute("data-model-version");
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
        const workbench = document.querySelector('[data-testid="maya-shadcn-workbench"]');
        const hashText = hashNode === null ? undefined : hashNode.textContent.trim();
        const version = workbench === null ? null : workbench.getAttribute("data-model-version");

        return hashText !== undefined && hashText.length > 0 && (hashText !== beforeHashText || version !== beforeVersion);
      },
      { beforeHashText: beforeHash, beforeVersion: beforeModelVersion },
      { timeout: 60_000 }
    );
    const afterHash = await visibleText(page, '[data-testid="forensics-source-hash"]', "Forensics source hash after refresh");
    if (afterHash === beforeHash) {
      throw new Error("SSE invalidation reloaded the model but did not visibly change the source hash.");
    }

    await page.screenshot({ fullPage: true, path: join(screenshotDir, "sse-live-update-after.png") });
    assertNoBrowserErrors(errors, "Forensics SSE live-update");
  } finally {
    await browser?.close();
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
