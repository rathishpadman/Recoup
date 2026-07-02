import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright";

export type DemoLoginId = "CFO" | "Maya" | "david";

export const realEvidenceAuditDate = process.env.RECOUP_REAL_EVIDENCE_AUDIT_DATE ?? "2026-07-01";
export const postImplementationScreenshotDir = join(
  "docs",
  "audit",
  "real-evidence-post-implementation",
  realEvidenceAuditDate,
  "screenshots"
);

const demoPassword = process.env.RECOUP_E2E_DEMO_PASSWORD ?? "Welcome#123";
const demoDefaultRoutes = {
  CFO: "/cfo",
  Maya: "/forensics/shadcn",
  david: "/credit"
} as const satisfies Record<DemoLoginId, string>;

export function resolveBaseUrl(): string {
  return (process.env.RECOUP_E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/u, "");
}

export function buildVercelProtectionHeaders(): Record<string, string> | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (secret === undefined || secret.length === 0) {
    return undefined;
  }

  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true"
  };
}

export async function assertBrowserTargetReachable(baseUrl: string): Promise<void> {
  const loginUrl = new URL(baseUrl);
  loginUrl.pathname = "/login";
  loginUrl.search = "?loginId=Maya";

  let response: Response;
  try {
    const headers = buildVercelProtectionHeaders();
    response = await fetch(loginUrl, {
      ...(headers === undefined ? {} : { headers }),
      redirect: "manual"
    });
  } catch (error) {
    const reason = sanitizeDiagnosticText(error instanceof Error ? error.message : String(error));
    throw new Error(
      `Real-evidence browser target ${safeTargetLabel(baseUrl)} is not reachable. Start the cockpit dev server or set RECOUP_E2E_BASE_URL to an approved preview/public alias before running browser hardening. Cause: ${reason}`
    );
  }

  if (response.status < 200 || response.status >= 400) {
    throw new Error(
      `Real-evidence browser target ${safeTargetLabel(baseUrl)} returned HTTP ${response.status.toString()} for the login preflight. Use a reachable cockpit URL before running browser hardening.`
    );
  }
}

export function ensurePostImplementationScreenshotDir(): string {
  mkdirSync(postImplementationScreenshotDir, { recursive: true });

  return postImplementationScreenshotDir;
}

export function recordBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return errors;
}

export function assertNoBrowserErrors(errors: readonly string[], label: string): void {
  if (errors.length > 0) {
    throw new Error(`${label} browser errors: ${errors.map(sanitizeDiagnosticText).join(" | ")}`);
  }
}

export async function newPageWithErrors(browser: Browser, viewport: { height: number; width: number }): Promise<{
  errors: string[];
  page: Page;
}> {
  const page = await browser.newPage({ viewport });
  const protectionHeaders = buildVercelProtectionHeaders();
  if (protectionHeaders !== undefined) {
    await page.setExtraHTTPHeaders(protectionHeaders);
  }
  const errors = recordBrowserErrors(page);

  return { errors, page };
}

export async function loginAsDemoUser(page: Page, baseUrl: string, loginId: DemoLoginId): Promise<void> {
  await page.goto(`${baseUrl}/login?loginId=${encodeURIComponent(loginId)}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill(demoPassword);
  const loginResult = await page.evaluate(
    async ({ password, userId }) => {
      const response = await fetch("/api/demo-login", {
        body: JSON.stringify({ loginId: userId, password }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      return {
        body: (await response.text()).slice(0, 240),
        status: response.status
      };
    },
    { password: demoPassword, userId: loginId }
  );
  if (loginResult.status < 200 || loginResult.status >= 300) {
    throw new Error(`Demo login for ${loginId} returned HTTP ${loginResult.status.toString()}: ${loginResult.body}`);
  }
  await page.goto(`${baseUrl}${demoDefaultRoutes[loginId]}`, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname === "/login") {
    throw new Error(`Demo login for ${loginId} redirected back to /login instead of ${demoDefaultRoutes[loginId]}.`);
  }
}

export async function openMayaEvidenceDossier(page: Page, baseUrl: string, lineId = "S3-L1"): Promise<void> {
  if (!page.url().startsWith(`${baseUrl}/forensics`)) {
    await checkedGoto(page, `${baseUrl}/forensics/shadcn`, "Maya Forensics evidence dossier");
  }
  await waitForMayaWorkbench(page);
  const worklistSection = page.locator('[data-testid="maya-root-section-worklist"]');
  if (!(await worklistSection.isVisible())) {
    const headerWorklistButton = page.getByTestId("maya-header-work-items-link");
    const worklistButton = (await headerWorklistButton.isVisible()) ? headerWorklistButton : page.getByRole("button", { name: /^Worklist$/u });
    if (!(await worklistButton.isVisible())) {
      throw new Error(`Maya evidence dossier cannot open Worklist. Visible buttons: ${await visibleButtonSummary(page)}`);
    }
    await worklistButton.click();
    await worklistSection.waitFor({ state: "visible", timeout: 30_000 });
  }
  const desktopRow = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(lineId)}"]`).first();
  const mobileRow = page.getByTestId("maya-mobile-worklist-row").filter({ hasText: lineId }).first();
  if (await desktopRow.isVisible()) {
    await desktopRow.locator('[data-testid="maya-row-action-open"]').click();
  } else {
    await mobileRow.waitFor({ state: "visible", timeout: 30_000 });
    await mobileRow.click();
    await page.getByTestId("maya-local-row-action-open").click();
  }
  await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("tab", { name: /^Evidence$/u }).click();
  await page.locator('[data-testid="maya-evidence-dossier"]').waitFor({ state: "visible", timeout: 30_000 });
  await waitForVisibleTextWithin(page, '[data-testid="maya-evidence-dossier"]', "EVD-POD-S3-L1", 30_000);
  await page
    .locator('[data-testid="maya-evidence-dossier"]')
    .getByTestId("pod-document-preview")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

export async function checkedGoto(page: Page, url: string, label: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  const status = response?.status();
  if (status === undefined) {
    throw new Error(`${label} did not return an HTTP response.`);
  }
  if (status < 200 || status >= 400) {
    throw new Error(`${label} returned HTTP ${status.toString()}.`);
  }
  if (new URL(page.url()).pathname === "/login") {
    throw new Error(`${label} redirected to /login.`);
  }
}

export function formatForensicsApiDiagnostic(status: number, body: string): string {
  const summary = summarizeJsonFields(body, ["status", "error", "message", "missingSource", "correlationId", "source", "code"]);

  return summary.length > 0
    ? `/api/forensics returned HTTP ${status.toString()} (${summary}).`
    : `/api/forensics returned HTTP ${status.toString()}.`;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

async function waitForMayaWorkbench(page: Page): Promise<void> {
  try {
    await page.locator('[data-testid="maya-shadcn-workbench"]').waitFor({ state: "visible", timeout: 60_000 });
  } catch (error) {
    const diagnostic = await forensicsApiDiagnostic(page);
    const reason = sanitizeDiagnosticText(error instanceof Error ? error.message : String(error));

    throw new Error(`Maya workbench did not become visible. ${diagnostic} Original wait failure: ${reason}`);
  }
}

async function forensicsApiDiagnostic(page: Page): Promise<string> {
  try {
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/forensics", { cache: "no-store", credentials: "same-origin" });

      return {
        body: (await response.text()).slice(0, 1000),
        status: response.status
      };
    });

    return formatForensicsApiDiagnostic(result.status, result.body);
  } catch (error) {
    const reason = sanitizeDiagnosticText(error instanceof Error ? error.message : String(error));

    return `/api/forensics diagnostic probe failed: ${reason}`;
  }
}

function summarizeJsonFields(body: string, allowedKeys: readonly string[]): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "";
  }
  if (!isRecord(parsed)) {
    return "";
  }

  return allowedKeys
    .flatMap((key) => {
      const value = parsed[key];

      return typeof value === "string" && value.length > 0 ? [`${key}=${sanitizeDiagnosticText(value)}`] : [];
    })
    .join(", ");
}

export function sanitizeDiagnosticText(value: string): string {
  const secretKeyPattern =
    "[A-Z0-9_]*(?:API_KEY|PASSWORD|SECRET|SERVICE_ROLE_KEY|TOKEN)|api[_-]?key|password|secret|service[_-]?role[_-]?key|serviceRoleKey|token";
  const quotedSecretAssignmentPattern = new RegExp(
    String.raw`\\?["']?\b(${secretKeyPattern})\\?["']?\s*[:=]\s*\\?(["'])[\s\S]*?\\?\2`,
    "giu"
  );
  const unquotedSecretAssignmentPattern = new RegExp(
    String.raw`\\?["']?\b(${secretKeyPattern})\\?["']?\s*[:=]\s*[^,\s}&"']+`,
    "giu"
  );

  return value
    .replace(/bearer\s+[A-Za-z0-9._-]+/giu, "bearer [redacted]")
    .replace(/\\?["']?\bauthorization\\?["']?\s*[:=]\s*\\?["']?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+\\?["']?/giu, "authorization=[redacted]")
    .replace(/\\?["']?\bauthorization\\?["']?\s*[:=]\s*\\?["']?[^,\s}"'&]+\\?["']?/giu, "authorization=[redacted]")
    .replace(quotedSecretAssignmentPattern, "$1=[redacted]")
    .replace(unquotedSecretAssignmentPattern, "$1=[redacted]")
    .replace(/C:\\Users\\[^\\\s]+/giu, "C:\\Users\\[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, "[redacted-email]")
    .slice(0, 180);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function visibleButtonSummary(page: Page): Promise<string> {
  const buttons = await page.locator("button").evaluateAll((elements) =>
    elements
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => [button.getAttribute("aria-label"), button.textContent].filter(Boolean).join(" ").replace(/\s+/gu, " ").trim())
      .filter((label) => label.length > 0)
      .slice(0, 12)
  );

  return buttons.length === 0 ? "none" : buttons.join(" | ");
}

async function waitForVisibleTextWithin(page: Page, rootSelector: string, text: string, timeout: number): Promise<void> {
  await page.waitForFunction(
    ({ expectedText, selector }) => {
      const root = document.querySelector(selector);
      if (root === null) {
        return false;
      }

      return Array.from(root.querySelectorAll("*")).some((element) => {
        if (element.textContent.trim() !== expectedText || element.getClientRects().length === 0) {
          return false;
        }
        const style = window.getComputedStyle(element);

        return style.display !== "none" && style.visibility !== "hidden";
      });
    },
    { expectedText: text, selector: rootSelector },
    { timeout }
  );
}

function safeTargetLabel(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);

    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "configured URL";
  }
}
