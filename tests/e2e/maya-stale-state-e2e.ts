import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  assertBrowserTargetReachable,
  checkedGoto,
  ensurePostImplementationScreenshotDir,
  loginAsDemoUser,
  newPageWithErrors,
  resolveBaseUrl
} from "./real-evidence-browser-helpers.ts";

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  await assertBrowserTargetReachable(baseUrl);
  const screenshotDir = ensurePostImplementationScreenshotDir();
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const { page } = await newPageWithErrors(browser, { height: 1100, width: 1440 });
    await page.route("**/api/forensics/events", (route) => route.abort("failed"));
    await loginAsDemoUser(page, baseUrl, "Maya");
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "Maya Forensics degraded stream");
    await page.locator('[data-testid="maya-shadcn-workbench"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.getByTestId("forensics-stale-state").waitFor({ state: "visible", timeout: 45_000 });
    await page.getByText(/live invalidation stream is degraded|business data may be stale/i).waitFor({
      state: "visible",
      timeout: 30_000
    });
    await page.screenshot({ fullPage: true, path: join(screenshotDir, "stale-state-degraded.png") });
  } finally {
    await browser?.close();
  }
}

await main();
