import { join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import {
  assertNoBrowserErrors,
  assertBrowserTargetReachable,
  ensurePostImplementationScreenshotDir,
  loginAsDemoUser,
  newPageWithErrors,
  openMayaEvidenceDossier,
  resolveBaseUrl,
  sanitizeDiagnosticText
} from "../tests/e2e/real-evidence-browser-helpers.ts";

interface ViewportSpec {
  height: number;
  label: string;
  width: number;
}

interface BrowserSpec {
  label: string;
  type: BrowserType;
}

interface LowContrastNode {
  background: string;
  color: string;
  ratio: number;
  text: string;
}

const viewports = [
  { height: 844, label: "mobile", width: 390 },
  { height: 1024, label: "tablet", width: 768 },
  { height: 1100, label: "desktop", width: 1440 }
] as const satisfies readonly ViewportSpec[];

const allBrowsers = [
  { label: "chromium", type: chromium },
  { label: "firefox", type: firefox },
  { label: "webkit", type: webkit }
] as const satisfies readonly BrowserSpec[];
const browsers = selectBrowsers(process.argv.slice(2));

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  await assertBrowserTargetReachable(baseUrl);
  const screenshotDir = ensurePostImplementationScreenshotDir();
  const browserBlockers: string[] = [];

  for (const browserSpec of browsers) {
    const browser = await launchBrowser(browserSpec);
    if (browser === undefined) {
      browserBlockers.push(`${browserSpec.label}: browser launch blocked`);
      continue;
    }
    try {
      for (const viewport of viewports) {
        const { errors, page } = await newPageWithErrors(browser, viewport);
        await loginAsDemoUser(page, baseUrl, "Maya");
        await openMayaEvidenceDossier(page, baseUrl);
        await assertEvidenceUiAccessible(page, `${browserSpec.label}/${viewport.label}`);
        await page.screenshot({
          fullPage: true,
          path: join(screenshotDir, `${browserSpec.label}-${viewport.label}-evidence-ui.png`)
        });
        assertNoBrowserErrors(errors, `${browserSpec.label}/${viewport.label}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }

  if (browserBlockers.length > 0) {
    throw new Error(
      `verify:real-evidence-a11y BLOCKED: required cross-browser evidence UI proof did not complete. ` +
        `Chromium-only results are not release proof. Browser launch blockers: ${browserBlockers.join(" | ")}`
    );
  }
}

function selectBrowsers(argv: readonly string[]): readonly BrowserSpec[] {
  const browserArg = argv.find((arg) => arg.startsWith("--browsers="))?.slice("--browsers=".length).trim();
  if (browserArg === undefined || browserArg.length === 0 || browserArg === "all") {
    return allBrowsers;
  }

  const labels = browserArg
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter((label) => label.length > 0);
  const selected = labels.map((label) => {
    const match = allBrowsers.find((browser) => browser.label === label);
    if (match === undefined) {
      throw new Error(`Unsupported accessibility browser "${label}". Use --browsers=chromium,firefox,webkit or --browsers=all.`);
    }

    return match;
  });
  if (selected.length === 0) {
    throw new Error("At least one accessibility browser is required.");
  }

  return selected;
}

async function launchBrowser(browserSpec: BrowserSpec): Promise<Browser | undefined> {
  try {
    return await browserSpec.type.launch({ headless: true, timeout: 60_000 });
  } catch (error) {
    console.error(
      `${browserSpec.label}: Playwright browser launch blocked before evidence accessibility checks. ` +
        `Cause: ${summarizeLaunchError(error)}`
    );

    return undefined;
  }
}

function summarizeLaunchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return sanitizeDiagnosticText(message).replace(/\s+/gu, " ").slice(0, 700);
}

async function assertEvidenceUiAccessible(page: Page, label: string): Promise<void> {
  await page.getByTestId("maya-evidence-dossier").waitFor({ state: "visible", timeout: 30_000 });
  await waitForAnyVisible(page, '[data-testid="maya-evidence-provenance"]', "Maya evidence provenance", 30_000);
  await page
    .locator('[data-testid="maya-evidence-dossier"]')
    .getByTestId("pod-document-preview")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });

  const unlabeledButtons = await page.locator("button").evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const style = getComputedStyle(button);
        if (
          button.getClientRects().length === 0 ||
          button.closest("[aria-hidden='true']") !== null ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          return false;
        }
        const accessibleName = [
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          ...(button.getAttribute("aria-labelledby")?.split(/\s+/u).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "") ?? []),
          button.textContent
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .trim();

        return accessibleName.length === 0;
      })
      .map((button) => button.outerHTML.slice(0, 140))
  );
  if (unlabeledButtons.length > 0) {
    throw new Error(`${label}: ${unlabeledButtons.length.toString()} button(s) lack an accessible name: ${unlabeledButtons.join(" | ")}`);
  }

  const horizontalOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  if (horizontalOverflow.scrollWidth > horizontalOverflow.clientWidth + 2) {
    throw new Error(
      `${label}: document has horizontal overflow ${horizontalOverflow.scrollWidth.toString()} > ${horizontalOverflow.clientWidth.toString()}.`
    );
  }

  const lowContrastNodes = await page.locator('[data-testid="maya-evidence-dossier"] *').evaluateAll(
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- static browser-context script avoids TSX helper injection in Playwright evaluateAll.
    new Function(
      "nodes",
      String.raw`
function directText(node) {
  return Array.from(node.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent || "")
    .join(" ");
}

function parseCssRgb(value) {
  const match = value.match(/rgba?\(([^)]+)\)/u);
  const rawBody = match && match[1];
  if (rawBody == null) {
    return undefined;
  }

  const slashParts = rawBody.split("/").map((part) => part.trim());
  const colorPart = slashParts[0];
  if (colorPart === undefined) {
    return undefined;
  }

  const rawParts = colorPart.includes(",")
    ? colorPart.split(",").map((part) => part.trim())
    : colorPart.split(/\s+/u).map((part) => part.trim());
  if (rawParts.length < 3) {
    return undefined;
  }

  const rawRed = rawParts[0];
  const rawGreen = rawParts[1];
  const rawBlue = rawParts[2];
  const rawInlineAlpha = rawParts[3];
  if (rawRed === undefined || rawGreen === undefined || rawBlue === undefined) {
    return undefined;
  }

  const red = Number(rawRed);
  const green = Number(rawGreen);
  const blue = Number(rawBlue);
  const rawAlpha = slashParts[1] || rawInlineAlpha;
  const alpha = rawAlpha === undefined ? 1 : Number(rawAlpha);
  if (![red, green, blue, alpha].every(Number.isFinite)) {
    return undefined;
  }

  return { alpha, blue, green, red };
}

function effectiveBackground(node) {
  let current = node;
  while (current !== null) {
    const background = getComputedStyle(current).backgroundColor;
    const parsed = parseCssRgb(background);
    if (parsed !== undefined && parsed.alpha > 0.05) {
      return background;
    }
    current = current.parentElement;
  }

  return "rgb(255, 255, 255)";
}

function relativeLuminance(rgb) {
  const channels = [rgb.red, rgb.green, rgb.blue].map((value) => {
    const normalized = value / 255;

    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const red = channels[0];
  const green = channels[1];
  const blue = channels[2];

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(left, right) {
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

return Array.from(nodes).flatMap((node) => {
  if (!(node instanceof HTMLElement) || node.closest("[aria-hidden='true']") !== null) {
    return [];
  }
  if (node.getClientRects().length === 0) {
    return [];
  }
  const text = directText(node).replace(/\s+/gu, " ").trim();
  if (text.length < 2) {
    return [];
  }
  const style = getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.fontSize) < 10) {
    return [];
  }

  const foreground = parseCssRgb(style.color);
  const backgroundText = effectiveBackground(node);
  const background = parseCssRgb(backgroundText);
  if (foreground === undefined || background === undefined) {
    return [];
  }

  const ratio = contrastRatio(relativeLuminance(foreground), relativeLuminance(background));

  return ratio < 4.5
    ? [
        {
          background: backgroundText,
          color: style.color,
          ratio,
          text: text.slice(0, 80)
        }
      ]
    : [];
});
`
    ) as (nodes: Element[]) => LowContrastNode[]
  );
  if (lowContrastNodes.length > 0) {
    throw new Error(
      `${label}: ${lowContrastNodes.length.toString()} evidence/provenance text node(s) are below 4.5 contrast: ${lowContrastNodes
        .slice(0, 6)
        .map((node) => `${node.text} (${node.ratio.toFixed(2)}, ${node.color} on ${node.background})`)
        .join(" | ")}`
    );
  }
}

async function waitForAnyVisible(page: Page, selector: string, label: string, timeout: number): Promise<void> {
  try {
    await page.waitForFunction(
      ({ targetSelector }) =>
        Array.from(document.querySelectorAll(targetSelector)).some((element) => {
          if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) {
            return false;
          }
          const style = getComputedStyle(element);

          return style.display !== "none" && style.visibility !== "hidden";
        }),
      { targetSelector: selector },
      { timeout }
    );
  } catch (error) {
    throw new Error(`${label} did not become visible: ${sanitizeDiagnosticText(error instanceof Error ? error.message : String(error))}`);
  }
}

await main();
