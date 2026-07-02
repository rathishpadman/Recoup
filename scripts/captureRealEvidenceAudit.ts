import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

type CaptureKind = "post-implementation" | "preview";
type CapturePersona = "CFO" | "Maya" | "david" | "public";

interface BaselineManifest {
  baseUrl?: string;
  browser?: string;
  captures: BaselineCapture[];
  viewport?: {
    height: number;
    width: number;
  };
}

interface BaselineCapture {
  liveRoute?: boolean;
  name: string;
  persona: CapturePersona;
  requestedPath?: string;
  screenshot: string;
  url: string;
}

interface RouteCapture {
  cacheHeader: string | null;
  captureError: string | null;
  consoleErrors: string[];
  liveRoute: boolean;
  mediaChecks: MediaCheck[];
  name: string;
  persona: CapturePersona;
  requestedPath?: string;
  screenshot: string;
  status: number | null;
  title: string;
  url: string;
  visibleContentHashes: string[];
  visibleEvidenceIds: string[];
  visibleProvenanceTerms: string[];
  visibleReceiptIds: string[];
}

interface MediaCheck {
  byteLength: number | null;
  complete: boolean | null;
  contentType: string | null;
  label: string;
  loaded: boolean;
  naturalHeight: number | null;
  naturalWidth: number | null;
  note: string;
  present: boolean;
  responseStatus: number | null;
  selector: string;
  tagName: string | null;
  urlHost: string | null;
  urlPath: string | null;
  visible: boolean;
}

type MayaRoutePreparationKind = "classic" | "run" | "shadcn";

interface MayaRoutePreparationPlan {
  kind: MayaRoutePreparationKind;
  requiresCanonicalEvidenceProof: boolean;
  waitSelector: string;
}

export function buildMayaRoutePreparationPlan(
  capture: Pick<BaselineCapture, "name" | "persona" | "requestedPath" | "url">
): MayaRoutePreparationPlan {
  const routePath = capture.requestedPath ?? pathFromCaptureUrl(capture.url);
  if (capture.persona === "Maya" && routePath === "/forensics") {
    return {
      kind: "classic",
      requiresCanonicalEvidenceProof: false,
      waitSelector: ".workbench-grid, .dossier-workbench"
    };
  }
  if (capture.persona === "Maya" && routePath === "/run") {
    return {
      kind: "run",
      requiresCanonicalEvidenceProof: false,
      waitSelector: ".run-console-layout, .run-evidence-table"
    };
  }

  const normalizedName = capture.name.toLowerCase();
  return {
    kind: "shadcn",
    requiresCanonicalEvidenceProof:
      normalizedName.includes("selected case") ||
      normalizedName.includes("evidence") ||
      normalizedName.includes("query") ||
      normalizedName.includes("approval") ||
      normalizedName.includes("audit"),
    waitSelector: '[data-testid="maya-shadcn-workbench"]'
  };
}

function pathFromCaptureUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export interface RealEvidenceMediaProbe {
  complete: boolean | null;
  naturalHeight: number | null;
  naturalWidth: number | null;
  source: string | null;
  tagName: string | null;
  visible: boolean;
}

export interface RealEvidenceMediaResponseProof {
  byteLength: number | null;
  contentType: string | null;
  status: number | null;
  urlHost: string | null;
  urlPath: string | null;
}

export interface BuildRealEvidenceMediaCheckFromProbeOptions {
  mediaProbe: RealEvidenceMediaProbe;
  responseProof: RealEvidenceMediaResponseProof;
  selector: string;
}

interface OutputManifest {
  baselineManifest: string;
  baseUrl: string;
  browser: "chromium";
  capturedAt: string;
  captureKind: CaptureKind;
  captures: RouteCapture[];
  proofScope: "local" | "preview" | "public_alias";
  releaseProof: boolean;
  routeInventorySource: string;
  viewport: {
    height: number;
    width: number;
  };
}

const auditDate = process.env.RECOUP_REAL_EVIDENCE_AUDIT_DATE ?? "2026-07-01";
const requestedOutputRoot = process.env.RECOUP_CAPTURE_OUTPUT_ROOT;
const captureKind = readCaptureKind(process.env.RECOUP_CAPTURE_KIND, requestedOutputRoot);
const baselineRoot = process.env.RECOUP_VISUAL_BASELINE_ROOT ?? join("docs", "audit", "real-evidence-baseline", auditDate);
const outputRoot =
  requestedOutputRoot ??
  join("docs", "audit", captureKind === "preview" ? "real-evidence-preview" : "real-evidence-post-implementation", auditDate);
const baselineManifestPath = join(baselineRoot, "manifest.json");
const outputManifestPath = join(outputRoot, "manifest.json");
const screenshotDir = join(outputRoot, "screenshots");
const defaultViewport = { height: 1100, width: 1440 };
const demoPassword = process.env.RECOUP_E2E_DEMO_PASSWORD ?? "Welcome#123";
const podSelector = "[data-testid='pod-document-preview'], img[alt*='POD'], iframe[src*='pod'], a[href*='pod']";
const routeCaptureTimeoutMs = readPositiveInteger(process.env.RECOUP_CAPTURE_ROUTE_TIMEOUT_MS, 60_000);

async function main(): Promise<void> {
  const baseline = await readBaselineManifest();
  const baseUrl = readBaseUrl(baseline);
  const viewport = baseline.viewport ?? defaultViewport;
  await mkdir(screenshotDir, { recursive: true });

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const captures: RouteCapture[] = [];
    for (const baselineCapture of baseline.captures) {
      if (baselineCapture.liveRoute !== true) {
        continue;
      }
      captures.push(await captureRoute(browser, baseUrl, viewport, baselineCapture));
    }

    const manifest: OutputManifest = {
      baselineManifest: baselineManifestPath,
      baseUrl: sanitizeCaptureUrlForManifest(baseUrl),
      browser: "chromium",
      capturedAt: new Date().toISOString(),
      captureKind,
      captures,
      ...buildCaptureProofMetadata(baseUrl, captureKind),
      routeInventorySource: baselineManifestPath,
      viewport
    };
    await writeFile(outputManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser?.close();
  }
}

export function buildCaptureProofMetadata(
  baseUrl: string,
  kind: CaptureKind
): Pick<OutputManifest, "proofScope" | "releaseProof"> {
  const proofScope = isLocalCaptureBaseUrl(baseUrl) ? "local" : kind === "preview" ? "preview" : "public_alias";

  return {
    proofScope,
    releaseProof: proofScope === "public_alias" && kind === "post-implementation"
  };
}

function isLocalCaptureBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function captureRoute(
  browser: Browser,
  baseUrl: string,
  viewport: { height: number; width: number },
  baselineCapture: BaselineCapture
): Promise<RouteCapture> {
  const page = await newCapturePage(browser, viewport);
  const consoleErrors: string[] = [];
  let routeTimedOut = false;
  const routeAbort = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      routeTimedOut = true;
      routeAbort.abort();
      void page.close().catch(() => undefined);
      reject(new Error(`Capture timed out after ${String(routeCaptureTimeoutMs)}ms.`));
    }, routeCaptureTimeoutMs);
  });
  timeout?.unref();

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(sanitizeConsoleTextForManifest(message.text()));
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(sanitizeConsoleTextForManifest(error.message));
  });

  try {
    return await Promise.race([
      captureRouteBody(page, baseUrl, baselineCapture, routeAbort.signal, consoleErrors),
      timeoutPromise
    ]);
  } catch (error) {
    const pageUrl = safePageUrl(page);

    return buildFailedRouteCapture({
      baselineCapture,
      consoleErrors,
      error,
      routeTimedOut,
      timeoutMs: routeCaptureTimeoutMs,
      ...(pageUrl === undefined ? {} : { url: pageUrl })
    });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    routeAbort.abort();
    await page.close().catch(() => undefined);
  }
}

async function newCapturePage(browser: Browser, viewport: { height: number; width: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  const protectionHeaders = buildVercelProtectionHeaders();
  if (protectionHeaders !== undefined) {
    await page.setExtraHTTPHeaders(protectionHeaders);
  }

  return page;
}

async function captureRouteBody(
  page: Page,
  baseUrl: string,
  baselineCapture: BaselineCapture,
  signal: AbortSignal,
  consoleErrors: string[]
): Promise<RouteCapture> {
  console.log(`capture:start ${baselineCapture.screenshot} ${baselineCapture.name}`);
  if (baselineCapture.persona !== "public") {
    await loginAsPersona(page, baseUrl, baselineCapture.persona);
  }
  const requestedPath = routePathFromCapture(baselineCapture);
  const response = await gotoCapturePath(page, baseUrl, requestedPath);
  await prepareRouteState(page, baselineCapture);
  await page.screenshot({ fullPage: true, path: join(screenshotDir, baselineCapture.screenshot), timeout: 20_000 });
  const visibleText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  const mediaCheck = await checkMedia(page, signal);
  console.log(`capture:done ${baselineCapture.screenshot} ${baselineCapture.name}`);

  return {
    cacheHeader: response?.headers()["x-recoup-read-model-cache"] ?? null,
    captureError: null,
    consoleErrors,
    liveRoute: true,
    mediaChecks: [mediaCheck],
    name: baselineCapture.name,
    persona: baselineCapture.persona,
    ...(baselineCapture.requestedPath === undefined ? {} : { requestedPath: sanitizeCapturePathForManifest(baselineCapture.requestedPath) }),
    screenshot: baselineCapture.screenshot,
    status: response?.status() ?? null,
    title: await page.title(),
    url: sanitizeCaptureUrlForManifest(page.url()),
    visibleContentHashes: uniqueMatches(visibleText, /\b[a-f0-9]{64}\b/giu),
    visibleEvidenceIds: uniqueMatches(visibleText, /\bEVD-[A-Z0-9-]+\b/gu),
    visibleProvenanceTerms: uniqueMatches(visibleText, /\b(?:sap_odata|source_generated|uploaded_document|provider_api)\b/gu),
    visibleReceiptIds: uniqueMatches(visibleText, /\bRECON-[A-Z0-9-]+\b/gu)
  };
}

export function buildFailedRouteCapture(options: {
  baselineCapture: BaselineCapture;
  consoleErrors?: readonly string[];
  error: unknown;
  routeTimedOut?: boolean;
  timeoutMs?: number;
  url?: string;
}): RouteCapture {
  const { baselineCapture } = options;
  const sanitizedConsoleErrors = (options.consoleErrors ?? []).map(sanitizeConsoleTextForManifest);
  const errorText =
    options.routeTimedOut === true
      ? `Capture timed out after ${String(options.timeoutMs ?? routeCaptureTimeoutMs)}ms.`
      : sanitizeConsoleTextForManifest(errorMessage(options.error));

  return {
    cacheHeader: null,
    captureError: errorText,
    consoleErrors: [...sanitizedConsoleErrors, errorText],
    liveRoute: true,
    mediaChecks: [missingPodMediaCheck("Route capture did not complete.")],
    name: baselineCapture.name,
    persona: baselineCapture.persona,
    ...(baselineCapture.requestedPath === undefined ? {} : { requestedPath: sanitizeCapturePathForManifest(baselineCapture.requestedPath) }),
    screenshot: baselineCapture.screenshot,
    status: null,
    title: "",
    url: sanitizeCaptureUrlForManifest(options.url ?? baselineCapture.url),
    visibleContentHashes: [],
    visibleEvidenceIds: [],
    visibleProvenanceTerms: [],
    visibleReceiptIds: []
  };
}

async function loginAsPersona(page: Page, baseUrl: string, persona: Exclude<CapturePersona, "public">): Promise<void> {
  await page.goto(`${baseUrl}/login?loginId=${encodeURIComponent(persona)}`, { waitUntil: "domcontentloaded" });
  if (isVercelDeploymentProtectionPage(page.url(), await page.title().catch(() => ""))) {
    throw new Error("Vercel deployment protection intercepted the preview before Recoup login; configure a provider-supported preview bypass or authenticate the preview before capture.");
  }
  const loginIdInput = page.locator('input[name="loginId"]');
  await loginIdInput.waitFor({ state: "visible", timeout: 5_000 });
  await loginIdInput.fill(persona);
  await page.locator('input[name="password"]').fill(demoPassword);
  await Promise.all([
    page.waitForURL((url) => url.origin === new URL(baseUrl).origin && url.pathname !== "/login", { timeout: 45_000 }),
    page.getByRole("button", { name: /Open Forensics Workspace/u }).click()
  ]);
}

async function gotoCapturePath(page: Page, baseUrl: string, path: string) {
  return page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
}

async function prepareRouteState(page: Page, capture: BaselineCapture): Promise<void> {
  const normalizedName = capture.name.toLowerCase();
  if (capture.persona !== "Maya") {
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    return;
  }

  const preparationPlan = buildMayaRoutePreparationPlan(capture);
  await page.locator(preparationPlan.waitSelector).first().waitFor({ state: "visible", timeout: 45_000 }).catch(() => undefined);
  if (preparationPlan.kind !== "shadcn") {
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    return;
  }
  if (normalizedName.includes("worklist")) {
    await clickControlIfVisible(page, /^Worklist$/u);
  }
  if (
    preparationPlan.requiresCanonicalEvidenceProof
  ) {
    await openMayaLine(page, process.env.RECOUP_CAPTURE_LINE_ID ?? "S3-L1");
    await waitForCanonicalMayaEvidenceProof(page);
  }
  if (normalizedName.includes("evidence") || normalizedName.includes("query")) {
    await clickTabIfVisible(page, /^Evidence$/u);
    await page.locator('[data-testid="maya-evidence-dossier"]').waitFor({ state: "visible", timeout: 20_000 });
    await expandMayaEvidenceDetails(page);
    await waitForCanonicalMayaEvidenceProof(page);
  }
  if (normalizedName.includes("query")) {
    await page.getByRole("button", { name: /Query evidence/u }).click({ timeout: 10_000 }).catch(() => undefined);
    await page.locator('[data-testid="maya-query-dock"]').waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    await expandMayaQueryDetails(page);
    await waitForCanonicalMayaEvidenceProof(page);
  }
  if (normalizedName.includes("approval") || normalizedName.includes("audit")) {
    await clickTabIfVisible(page, /^Audit$/u);
    await page.locator('[data-testid="maya-audit-confirmation"]').waitFor({ state: "visible", timeout: 20_000 });
    await expandMayaAuditDetails(page);
    await waitForCanonicalMayaEvidenceProof(page);
  }
}

async function openMayaLine(page: Page, lineId: string): Promise<void> {
  await clickControlIfVisible(page, /^Worklist$/u);
  const row = page.locator(`[data-testid="maya-worklist-row"][data-line-id="${escapeAttributeValue(lineId)}"]`).first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.locator('[data-testid="maya-row-action-open"]').click();
  await page.locator('[data-testid="maya-case-workspace"]').waitFor({ state: "visible", timeout: 20_000 });
}

async function clickControlIfVisible(page: Page, name: RegExp): Promise<void> {
  for (const role of ["button", "tab"] as const) {
    const target = page.getByRole(role, { name }).first();
    if ((await target.count()) > 0 && (await target.isVisible().catch(() => false))) {
      await target.click();
      return;
    }
  }
}

async function clickTabIfVisible(page: Page, name: RegExp): Promise<void> {
  const target = page.getByRole("tab", { name }).first();
  if ((await target.count()) > 0 && (await target.isVisible().catch(() => false))) {
    await target.click();
  }
}

async function expandMayaEvidenceDetails(page: Page): Promise<void> {
  const groups = page.locator('[data-testid="maya-evidence-business-group"] button');
  for (let index = 0; index < (await groups.count()); index += 1) {
    const trigger = groups.nth(index);
    if ((await trigger.getAttribute("aria-expanded").catch(() => null)) !== "true") {
      await trigger.click().catch(() => undefined);
    }
  }
  await page.locator('[data-testid="maya-evidence-provenance"]').first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  await clickCollapsibleTriggerIfClosed(page, '[data-testid="maya-evidence-source-details"]');
  await page.locator('[data-testid="maya-evidence-record-id"]').first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
}

async function expandMayaQueryDetails(page: Page): Promise<void> {
  await clickAccordionTriggerIfClosed(page, '[data-testid="maya-query-source-details"]');
  await page.locator('[data-testid="maya-query-evidence-document"]').first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
}

async function expandMayaAuditDetails(page: Page): Promise<void> {
  await clickCollapsibleTriggerIfClosed(page, '[data-testid="maya-audit-receipt-details"]');
  await clickCollapsibleTriggerIfClosed(page, '[data-testid="maya-audit-selected-action-source-details"]');
  await page.locator('[data-testid="maya-audit-selected-action-context"]').waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
}

async function clickAccordionTriggerIfClosed(page: Page, selector: string): Promise<void> {
  const trigger = page.locator(`${selector} button`).first();
  if ((await trigger.count()) > 0 && (await trigger.isVisible().catch(() => false))) {
    if ((await trigger.getAttribute("aria-expanded").catch(() => null)) !== "true") {
      await trigger.click().catch(() => undefined);
    }
  }
}

async function clickCollapsibleTriggerIfClosed(page: Page, selector: string): Promise<void> {
  const trigger = page.locator(`${selector} button`).first();
  if ((await trigger.count()) > 0 && (await trigger.isVisible().catch(() => false))) {
    if ((await trigger.getAttribute("aria-expanded").catch(() => null)) !== "true") {
      await trigger.click().catch(() => undefined);
    }
  }
}

async function waitForCanonicalMayaEvidenceProof(page: Page): Promise<void> {
  await page.locator('[data-testid="maya-selected-evidence-proof-strip"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;

      return (
        text.includes("EVD-POD-S3-L1") &&
        text.includes("RECON-S3-L1") &&
        /\b[a-f0-9]{64}\b/iu.test(text) &&
        /\b(?:sap_odata|source_generated|uploaded_document|provider_api)\b/u.test(text)
      );
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.getByTestId("pod-document-preview").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function checkMedia(page: Page, signal?: AbortSignal): Promise<MediaCheck> {
  const info = await page.locator(podSelector).first().evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const box = htmlElement.getBoundingClientRect();
    const tagName = htmlElement.tagName.toLowerCase();
    const image = htmlElement instanceof HTMLImageElement ? htmlElement : undefined;
    const source = readElementSource(htmlElement);

    return {
      complete: image?.complete ?? null,
      naturalHeight: image?.naturalHeight ?? null,
      naturalWidth: image?.naturalWidth ?? null,
      source: source ?? null,
      tagName,
      visible: box.width > 0 && box.height > 0
    };

    function readElementSource(node: HTMLElement): string | undefined {
      if (node instanceof HTMLAnchorElement) {
        return node.href;
      }
      if (node instanceof HTMLIFrameElement || node instanceof HTMLImageElement) {
        return node.src;
      }

      return undefined;
    }
  }).catch(() => undefined);

  if (info === undefined) {
    return missingPodMediaCheck("No visible POD PDF/image/media artifact in captured UI.");
  }

  const responseProof = await safeFetchMediaProofForPage(page, info.source, signal);

  return buildRealEvidenceMediaCheckFromProbe({
    mediaProbe: info,
    responseProof,
    selector: podSelector
  });
}

function missingPodMediaCheck(note: string): MediaCheck {
  return {
    byteLength: null,
    complete: null,
    contentType: null,
    label: "POD document/media",
    loaded: false,
    naturalHeight: null,
    naturalWidth: null,
    note,
    present: false,
    responseStatus: null,
    selector: podSelector,
    tagName: null,
    urlHost: null,
    urlPath: null,
    visible: false
  };
}

export function buildRealEvidenceMediaCheckFromProbe(options: BuildRealEvidenceMediaCheckFromProbeOptions): MediaCheck {
  const { mediaProbe, responseProof, selector } = options;
  const hasDecodedImageDimensions =
    mediaProbe.naturalWidth !== null &&
    mediaProbe.naturalWidth > 0 &&
    mediaProbe.naturalHeight !== null &&
    mediaProbe.naturalHeight > 0;
  const hasResponseProof =
    responseProof.status !== null &&
    responseProof.status >= 200 &&
    responseProof.status < 400 &&
    responseProof.contentType !== null &&
    responseProof.contentType.trim().length > 0;
  const hasPositiveByteLength =
    responseProof.byteLength !== null && Number.isFinite(responseProof.byteLength) && responseProof.byteLength > 0;
  const loaded =
    mediaProbe.tagName === "img"
      ? mediaProbe.complete === true && hasDecodedImageDimensions
      : mediaProbe.visible && hasResponseProof && hasPositiveByteLength && isAllowedPodDocumentResponse(responseProof);

  return {
    byteLength: responseProof.byteLength,
    complete: mediaProbe.complete,
    contentType: responseProof.contentType,
    label: "POD document/media",
    loaded,
    naturalHeight: mediaProbe.naturalHeight,
    naturalWidth: mediaProbe.naturalWidth,
    note: loaded
      ? "POD artifact preview/link is visible and load proof was collected."
      : "POD artifact was present but not load-verified.",
    present: true,
    responseStatus: responseProof.status,
    selector,
    tagName: mediaProbe.tagName,
    urlHost: responseProof.urlHost,
    urlPath: responseProof.urlPath,
    visible: mediaProbe.visible
  };
}

function isAllowedPodDocumentResponse(responseProof: RealEvidenceMediaResponseProof): boolean {
  const contentType = responseProof.contentType?.toLowerCase() ?? "";
  return contentType.startsWith("image/") || contentType.includes("application/pdf");
}

async function safeFetchMediaProofForPage(page: Page, source: string | null, signal?: AbortSignal): Promise<{
  byteLength: number | null;
  contentType: string | null;
  status: number | null;
  urlHost: string | null;
  urlPath: string | null;
}> {
  if (source === null || source.trim().length === 0) {
    return safeFetchMediaProof(source, signal);
  }

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return safeFetchMediaProof(source, signal);
  }

  if (!/^https?:$/iu.test(parsed.protocol)) {
    return safeFetchMediaProof(source, signal);
  }

  const cookies = await page.context().cookies(parsed.href).catch(() => []);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

  return safeFetchMediaProof(source, signal, cookieHeader.length === 0 ? undefined : { cookie: cookieHeader });
}

export async function safeFetchMediaProof(source: string | null, signal?: AbortSignal, headers?: HeadersInit): Promise<{
  byteLength: number | null;
  contentType: string | null;
  status: number | null;
  urlHost: string | null;
  urlPath: string | null;
}> {
  if (source === null || source.trim().length === 0) {
    return { byteLength: null, contentType: null, status: null, urlHost: null, urlPath: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return { byteLength: null, contentType: null, status: null, urlHost: null, urlPath: null };
  }

  try {
    const requestHeaders = mergeHeaders(headers, buildVercelProtectionHeaders());
    const requestInit: RequestInit = {
      ...(requestHeaders === undefined ? {} : { headers: requestHeaders }),
      method: "GET",
      redirect: "manual",
      ...(signal === undefined ? {} : { signal })
    };
    const response = await fetch(parsed, requestInit);
    const bytes = Buffer.from(await response.arrayBuffer());

    return {
      byteLength: bytes.length,
      contentType: response.headers.get("content-type"),
      status: response.status,
      urlHost: parsed.host,
      urlPath: parsed.pathname
    };
  } catch {
    return { byteLength: null, contentType: null, status: null, urlHost: parsed.host, urlPath: parsed.pathname };
  }
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

function mergeHeaders(left: HeadersInit | undefined, right: HeadersInit | undefined): HeadersInit | undefined {
  const merged = {
    ...headersToRecord(left),
    ...headersToRecord(right)
  };

  return Object.keys(merged).length === 0 ? undefined : merged;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

async function readBaselineManifest(): Promise<BaselineManifest> {
  const parsed = JSON.parse(await readFile(baselineManifestPath, "utf8")) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.captures)) {
    throw new Error(`${baselineManifestPath} is missing a captures array.`);
  }

  return {
    ...(typeof parsed.baseUrl === "string" ? { baseUrl: parsed.baseUrl } : {}),
    ...(typeof parsed.browser === "string" ? { browser: parsed.browser } : {}),
    captures: parsed.captures.map(readBaselineCapture),
    ...optionalViewport(parsed.viewport)
  };
}

function optionalViewport(value: unknown): { viewport: { height: number; width: number } } | Record<string, never> {
  const viewport = readViewport(value);

  return viewport === undefined ? {} : { viewport };
}

function readBaselineCapture(value: unknown): BaselineCapture {
  if (!isRecord(value)) {
    throw new Error("Baseline capture entry must be an object.");
  }
  if (typeof value.name !== "string" || typeof value.url !== "string" || typeof value.screenshot !== "string") {
    throw new Error("Baseline capture entry is missing name, url, or screenshot.");
  }
  const persona = readPersona(value.persona);

  return {
    liveRoute: value.liveRoute === true,
    name: value.name,
    persona,
    ...(typeof value.requestedPath === "string" ? { requestedPath: value.requestedPath } : {}),
    screenshot: value.screenshot,
    url: value.url
  };
}

function readViewport(value: unknown): { height: number; width: number } | undefined {
  if (!isRecord(value) || typeof value.height !== "number" || typeof value.width !== "number") {
    return undefined;
  }

  return { height: value.height, width: value.width };
}

function readPersona(value: unknown): CapturePersona {
  if (value === "CFO" || value === "Maya" || value === "david" || value === "public") {
    return value;
  }

  throw new Error(`Unsupported baseline persona ${String(value)}.`);
}

function readBaseUrl(baseline: BaselineManifest): string {
  const raw = process.env.RECOUP_CAPTURE_BASE_URL ?? process.env.RECOUP_E2E_BASE_URL ?? baseline.baseUrl;
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error("RECOUP_CAPTURE_BASE_URL or baseline baseUrl is required.");
  }

  return raw.replace(/\/+$/u, "");
}

function routePathFromCapture(capture: BaselineCapture): string {
  if (capture.requestedPath !== undefined) {
    return capture.requestedPath;
  }
  const url = new URL(capture.url);

  return `${url.pathname}${url.search}`;
}

export function readCaptureKind(value: string | undefined, outputRootValue?: string): CaptureKind {
  if (outputRootValue !== undefined && isPreviewOutputRoot(outputRootValue)) {
    return "preview";
  }
  if (value === undefined || value === "post-implementation") {
    return "post-implementation";
  }
  if (value === "preview") {
    return "preview";
  }

  throw new Error("RECOUP_CAPTURE_KIND must be post-implementation or preview.");
}

function isPreviewOutputRoot(value: string): boolean {
  return value.replace(/\\/gu, "/").toLowerCase().split("/").includes("real-evidence-preview");
}

export function isVercelDeploymentProtectionPage(url: string, title: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.hostname === "vercel.com" && parsed.pathname.startsWith("/login") && title.toLowerCase().includes("vercel");
  } catch {
    return false;
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function sanitizeCaptureUrlForManifest(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;

    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return "invalid-url";
  }
}

export function sanitizeConsoleTextForManifest(value: string): string {
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
    .replace(/\bhttps?:\/\/[^\s<>"')]+/giu, (match) => sanitizeCaptureUrlForManifest(match))
    .replace(/([/?&])(?:access_token|api_key|auth|bypass|code|customer|key|lineId|password|refresh_token|secret|token)=[^&\s<>"')]+/giu, "$1[redacted-param]")
    .replace(/\?(?=\s|$)/gu, "")
    .replace(/&(?=\s|$)/gu, "")
    .replace(/\\?["']?\bauthorization\\?["']?\s*[:=]\s*\\?["']?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+\\?["']?/giu, "authorization=[redacted]")
    .replace(/\\?["']?\bauthorization\\?["']?\s*[:=]\s*\\?["']?[^,\s}"'&]+\\?["']?/giu, "authorization=[redacted]")
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/giu, "[redacted-auth]")
    .replace(quotedSecretAssignmentPattern, "[redacted-secret]")
    .replace(unquotedSecretAssignmentPattern, "[redacted-secret]")
    .replace(/C:\\Users\\[^\\\s]+/giu, "C:\\Users\\[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, "[redacted-email]")
    .slice(0, 500);
}

function sanitizeCapturePathForManifest(value: string): string {
  const [withoutFragment] = value.split("#", 1);
  const [path] = (withoutFragment ?? "").split("?", 1);

  return path === undefined || path === "" ? "/" : path;
}

function safePageUrl(page: Page): string | undefined {
  try {
    return page.url();
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function uniqueMatches(value: string, pattern: RegExp): string[] {
  return [...new Set(value.match(pattern) ?? [])].sort();
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(dirname(outputManifestPath), { recursive: true });
  await main();
}
