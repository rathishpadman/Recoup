import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildReconciliationCutoverEnvironmentReadinessReport,
  type ReconciliationCutoverEnvironmentReadinessReport
} from "./checkReconciliationCutoverEnvironmentReadiness.js";
import { type RuntimeEnv } from "../config/env.js";

type ProofReadinessStatus = "blocked" | "ready";

interface MediaCheckInput {
  byteLength?: number | null;
  complete?: boolean | null;
  contentType?: string | null;
  label?: string;
  loaded?: boolean;
  naturalHeight?: number | null;
  naturalWidth?: number | null;
  present?: boolean;
  responseStatus?: number | null;
  tagName?: string | null;
  visible?: boolean;
}

interface CaptureInput {
  consoleErrors?: string[];
  liveRoute?: boolean;
  mediaChecks?: MediaCheckInput[];
  name?: string;
  screenshot?: string;
  status?: number | null;
  visibleContentHashes?: string[];
  visibleEvidenceIds?: string[];
  visibleProvenanceTerms?: string[];
  visibleReceiptIds?: string[];
}

interface ManifestInput {
  captures?: CaptureInput[];
}

interface DiffResultInput {
  baselinePath: string;
  changedPixelRatio?: number;
  error?: string;
  maxChangedPixelRatio: number;
  pass: boolean;
  postPath: string;
  route: string;
}

interface ProofReadinessOptions {
  auditDate?: string;
  baselineManifest?: ManifestInput;
  baselineManifestPath?: string;
  diffResults?: DiffResultInput[];
  env?: RuntimeEnv;
  generatedAt?: string;
  postManifest?: ManifestInput;
  postManifestPath?: string;
  postScreenshotFileExists?: (screenshot: string, manifestPath: string) => boolean;
  verifyPostScreenshotFiles?: boolean;
  visualDiffPath?: string;
}

export interface RealEvidenceProofReadinessReport {
  artifactType: "real_evidence_visual_proof_readiness";
  auditDate: string;
  baseline: {
    liveCaptureCount: number;
    manifestPath: string;
    manifestPresent: boolean;
    screenshotsWithNames: number;
    status: "blocked_missing_manifest" | "blocked_no_live_routes" | "ready";
  };
  blockers: string[];
  environment: ReconciliationCutoverEnvironmentReadinessReport;
  generatedAt: string;
  noMutation: true;
  postImplementation: {
    capturesWithLoadedMedia: number;
    capturesWithProvenanceTerm: number;
    capturesWithRequiredEvidenceId: number;
    capturesWithRequiredReceiptId: number;
    capturesWithScreenshot: number;
    capturesWithVisibleContentHash: number;
    liveCaptureCount: number;
    manifestPath: string;
    manifestPresent: boolean;
    missingBaselineRoutes: string[];
    routesMissingLoadedMedia: string[];
    routesMissingProvenanceTerm: string[];
    routesMissingRequiredEvidenceId: string[];
    routesMissingRequiredReceiptId: string[];
    routesMissingScreenshot: string[];
    routesMissingScreenshotFile: string[];
    routesMissingVisibleContentHash: string[];
    routesWithConsoleErrors: string[];
    routesWithHttpFailures: string[];
    status: "blocked_missing_manifest" | "blocked_missing_required_proof" | "ready";
  };
  readOnlyVerificationCommands: string[];
  requiredEvidenceId: "EVD-POD-S3-L1";
  requiredReceiptId: "RECON-S3-L1";
  status: ProofReadinessStatus;
  visualDiff: {
    failedRoutes: string[];
    missingBaselineRoutes: string[];
    outputPath: string;
    passedRoutes: string[];
    reportPresent: boolean;
    status: "blocked_missing_report" | "blocked_failed_routes" | "ready";
  };
}

const defaultAuditDate = process.env.RECOUP_REAL_EVIDENCE_AUDIT_DATE ?? "2026-07-01";
const requiredEvidenceId = "EVD-POD-S3-L1";
const requiredReceiptId = "RECON-S3-L1";

export function buildRealEvidenceProofReadinessReport(options: ProofReadinessOptions = {}): RealEvidenceProofReadinessReport {
  const auditDate = options.auditDate ?? defaultAuditDate;
  const baselineManifestPath =
    options.baselineManifestPath ?? join("docs", "audit", "real-evidence-baseline", auditDate, "manifest.json");
  const postManifestPath =
    options.postManifestPath ?? join("docs", "audit", "real-evidence-post-implementation", auditDate, "manifest.json");
  const visualDiffPath =
    options.visualDiffPath ?? join("docs", "audit", "real-evidence-comparison", `${auditDate}-visual-diff.json`);
  const environment = buildReconciliationCutoverEnvironmentReadinessReport({
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt })
  });
  const baseline = summarizeBaselineManifest(options.baselineManifest, baselineManifestPath);
  const postImplementation = summarizePostManifest(options.postManifest, postManifestPath, options.baselineManifest, {
    postScreenshotFileExists: options.postScreenshotFileExists ?? postScreenshotFileExists,
    verifyPostScreenshotFiles: options.verifyPostScreenshotFiles ?? false
  });
  const visualDiff = summarizeVisualDiff(options.diffResults, visualDiffPath, options.baselineManifest);
  const blockers = [
    ...environment.blockers.map((blocker) => `Environment readiness: ${blocker}`),
    ...baselineBlockers(baseline),
    ...postImplementationBlockers(postImplementation),
    ...visualDiffBlockers(visualDiff)
  ];

  return {
    artifactType: "real_evidence_visual_proof_readiness",
    auditDate,
    baseline,
    blockers,
    environment,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    noMutation: true,
    postImplementation,
    readOnlyVerificationCommands: [
      "npm.cmd run check:reconciliation-cutover-env",
      "npm.cmd run verify:real-evidence -- --target=production",
      "npm.cmd run preflight:reconciliation-cutover -- --target=production",
      "npm.cmd run capture:real-evidence-audit",
      "npm.cmd run verify:real-evidence-visual",
      "npm.cmd run verify:real-evidence-a11y"
    ],
    requiredEvidenceId,
    requiredReceiptId,
    status: blockers.length === 0 ? "ready" : "blocked",
    visualDiff
  };
}

export function formatRealEvidenceProofReadinessReport(report: RealEvidenceProofReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function main(): Promise<void> {
  const auditDate = defaultAuditDate;
  const baselineManifestPath = join("docs", "audit", "real-evidence-baseline", auditDate, "manifest.json");
  const postManifestPath = join("docs", "audit", "real-evidence-post-implementation", auditDate, "manifest.json");
  const visualDiffPath = join("docs", "audit", "real-evidence-comparison", `${auditDate}-visual-diff.json`);
  const baselineManifest = await readJsonIfPresent<ManifestInput>(baselineManifestPath);
  const postManifest = await readJsonIfPresent<ManifestInput>(postManifestPath);
  const diffResults = await readJsonIfPresent<DiffResultInput[]>(visualDiffPath);
  const report = buildRealEvidenceProofReadinessReport({
    auditDate,
    baselineManifestPath,
    ...(baselineManifest === undefined ? {} : { baselineManifest }),
    ...(diffResults === undefined ? {} : { diffResults }),
    ...(postManifest === undefined ? {} : { postManifest }),
    postManifestPath,
    verifyPostScreenshotFiles: true,
    visualDiffPath
  });
  process.stdout.write(formatRealEvidenceProofReadinessReport(report));
  if (report.status === "blocked") {
    process.exitCode = 1;
  }
}

function summarizeBaselineManifest(
  manifest: ManifestInput | undefined,
  manifestPath: string
): RealEvidenceProofReadinessReport["baseline"] {
  const liveCaptures = liveRoutes(manifest);
  const screenshotsWithNames = liveCaptures.filter(
    (capture) => typeof capture.name === "string" && typeof capture.screenshot === "string"
  ).length;

  return {
    liveCaptureCount: liveCaptures.length,
    manifestPath,
    manifestPresent: manifest !== undefined,
    screenshotsWithNames,
    status: manifest === undefined ? "blocked_missing_manifest" : liveCaptures.length === 0 ? "blocked_no_live_routes" : "ready"
  };
}

function summarizePostManifest(
  manifest: ManifestInput | undefined,
  manifestPath: string,
  baselineManifest: ManifestInput | undefined,
  options: {
    postScreenshotFileExists: (screenshot: string, manifestPath: string) => boolean;
    verifyPostScreenshotFiles: boolean;
  }
): RealEvidenceProofReadinessReport["postImplementation"] {
  const liveCaptures = liveRoutes(manifest);
  const baselineRouteNames = liveRoutes(baselineManifest)
    .map(readRouteName)
    .filter((value): value is string => value !== undefined);
  const evidenceRouteNames = baselineRouteNames.filter(routeRequiresEvidenceProof);
  const postCapturesByRoute = new Map(
    liveCaptures.map((capture) => [readRouteName(capture), capture] as const).filter((entry): entry is readonly [string, CaptureInput] => entry[0] !== undefined)
  );
  const postRouteNames = new Set(liveCaptures.map(readRouteName).filter((value): value is string => value !== undefined));
  const missingBaselineRoutes = baselineRouteNames.filter((route) => !postRouteNames.has(route));
  const routesWithHttpFailures = liveCaptures
    .filter((capture) => capture.status === null || capture.status === undefined || capture.status < 200 || capture.status >= 400)
    .map(readRouteName)
    .filter((value): value is string => value !== undefined);
  const routesWithConsoleErrors = liveCaptures
    .filter((capture) => (capture.consoleErrors?.length ?? 0) > 0)
    .map(readRouteName)
    .filter((value): value is string => value !== undefined);
  const capturesWithRequiredEvidenceId = liveCaptures.filter((capture) => capture.visibleEvidenceIds?.includes(requiredEvidenceId)).length;
  const capturesWithRequiredReceiptId = liveCaptures.filter((capture) => capture.visibleReceiptIds?.includes(requiredReceiptId)).length;
  const capturesWithVisibleContentHash = liveCaptures.filter((capture) => (capture.visibleContentHashes?.length ?? 0) > 0).length;
  const capturesWithProvenanceTerm = liveCaptures.filter((capture) => (capture.visibleProvenanceTerms?.length ?? 0) > 0).length;
  const capturesWithLoadedMedia = liveCaptures.filter((capture) => capture.mediaChecks?.some(isLoadedMediaProof) === true).length;
  const capturesWithScreenshot = liveCaptures.filter(hasScreenshotName).length;
  const routesMissingScreenshot = liveCaptures
    .filter((capture) => !hasScreenshotName(capture))
    .map(readRouteNameOrFallback);
  const routesMissingScreenshotFile = options.verifyPostScreenshotFiles
    ? liveCaptures
        .filter(hasScreenshotName)
        .filter((capture) => !options.postScreenshotFileExists(capture.screenshot, manifestPath))
        .map(readRouteNameOrFallback)
    : [];
  const routesMissingRequiredEvidenceId = evidenceRouteNames.filter(
    (route) => postCapturesByRoute.get(route)?.visibleEvidenceIds?.includes(requiredEvidenceId) !== true
  );
  const routesMissingRequiredReceiptId = evidenceRouteNames.filter(
    (route) => postCapturesByRoute.get(route)?.visibleReceiptIds?.includes(requiredReceiptId) !== true
  );
  const routesMissingVisibleContentHash = evidenceRouteNames.filter(
    (route) => (postCapturesByRoute.get(route)?.visibleContentHashes?.length ?? 0) === 0
  );
  const routesMissingProvenanceTerm = evidenceRouteNames.filter(
    (route) => (postCapturesByRoute.get(route)?.visibleProvenanceTerms?.length ?? 0) === 0
  );
  const routesMissingLoadedMedia = evidenceRouteNames.filter(
    (route) => postCapturesByRoute.get(route)?.mediaChecks?.some(isLoadedMediaProof) !== true
  );
  const ready =
    capturesWithRequiredEvidenceId > 0 &&
    capturesWithRequiredReceiptId > 0 &&
    capturesWithVisibleContentHash > 0 &&
    capturesWithProvenanceTerm > 0 &&
    capturesWithLoadedMedia > 0 &&
    missingBaselineRoutes.length === 0 &&
    routesMissingRequiredEvidenceId.length === 0 &&
    routesMissingRequiredReceiptId.length === 0 &&
    routesMissingVisibleContentHash.length === 0 &&
    routesMissingProvenanceTerm.length === 0 &&
    routesMissingLoadedMedia.length === 0 &&
    routesMissingScreenshot.length === 0 &&
    routesMissingScreenshotFile.length === 0 &&
    routesWithHttpFailures.length === 0 &&
    routesWithConsoleErrors.length === 0;

  return {
    capturesWithLoadedMedia,
    capturesWithProvenanceTerm,
    capturesWithRequiredEvidenceId,
    capturesWithRequiredReceiptId,
    capturesWithScreenshot,
    capturesWithVisibleContentHash,
    liveCaptureCount: liveCaptures.length,
    manifestPath,
    manifestPresent: manifest !== undefined,
    missingBaselineRoutes,
    routesMissingLoadedMedia,
    routesMissingProvenanceTerm,
    routesMissingRequiredEvidenceId,
    routesMissingRequiredReceiptId,
    routesMissingScreenshot,
    routesMissingScreenshotFile,
    routesMissingVisibleContentHash,
    routesWithConsoleErrors,
    routesWithHttpFailures,
    status: manifest === undefined ? "blocked_missing_manifest" : ready ? "ready" : "blocked_missing_required_proof"
  };
}

function summarizeVisualDiff(
  diffResults: DiffResultInput[] | undefined,
  outputPath: string,
  baselineManifest: ManifestInput | undefined
): RealEvidenceProofReadinessReport["visualDiff"] {
  const failedRoutes = diffResults?.filter((result) => !result.pass).map((result) => result.route) ?? [];
  const passedRoutes = diffResults?.filter((result) => result.pass).map((result) => result.route) ?? [];
  const comparedRoutes = new Set(diffResults?.map((result) => result.route) ?? []);
  const missingBaselineRoutes = liveRoutes(baselineManifest)
    .map(readRouteName)
    .filter((value): value is string => value !== undefined && !comparedRoutes.has(value));

  return {
    failedRoutes,
    missingBaselineRoutes,
    outputPath,
    passedRoutes,
    reportPresent: diffResults !== undefined,
    status:
      diffResults === undefined
        ? "blocked_missing_report"
        : failedRoutes.length > 0 || missingBaselineRoutes.length > 0
          ? "blocked_failed_routes"
          : "ready"
  };
}

function baselineBlockers(baseline: RealEvidenceProofReadinessReport["baseline"]): string[] {
  if (baseline.status === "ready") {
    return [];
  }
  if (baseline.status === "blocked_missing_manifest") {
    return ["Baseline manifest is required before visual/POD media proof can be compared."];
  }

  return ["Baseline manifest must contain at least one live route capture."];
}

function postImplementationBlockers(postImplementation: RealEvidenceProofReadinessReport["postImplementation"]): string[] {
  if (postImplementation.status === "ready") {
    return [];
  }
  if (postImplementation.status === "blocked_missing_manifest") {
    return ["Post-implementation manifest is required before visual/POD media proof can pass."];
  }

  const blockers: string[] = [];
  if (postImplementation.capturesWithRequiredEvidenceId === 0) {
    blockers.push(`Post-implementation manifest must show ${requiredEvidenceId} on at least one live route.`);
  }
  if (postImplementation.routesMissingRequiredEvidenceId.length > 0) {
    blockers.push(
      `Post-implementation evidence routes must each show ${requiredEvidenceId}. Missing: ${postImplementation.routesMissingRequiredEvidenceId.join(", ")}.`
    );
  }
  if (postImplementation.capturesWithRequiredReceiptId === 0) {
    blockers.push(`Post-implementation manifest must show ${requiredReceiptId} on at least one live route.`);
  }
  if (postImplementation.routesMissingRequiredReceiptId.length > 0) {
    blockers.push(
      `Post-implementation evidence routes must each show ${requiredReceiptId}. Missing: ${postImplementation.routesMissingRequiredReceiptId.join(", ")}.`
    );
  }
  if (postImplementation.capturesWithVisibleContentHash === 0) {
    blockers.push("Post-implementation manifest must show at least one visible evidence content hash.");
  }
  if (postImplementation.routesMissingVisibleContentHash.length > 0) {
    blockers.push(
      `Post-implementation evidence routes must each show a visible evidence content hash. Missing: ${postImplementation.routesMissingVisibleContentHash.join(", ")}.`
    );
  }
  if (postImplementation.capturesWithProvenanceTerm === 0) {
    blockers.push("Post-implementation manifest must show at least one visible source/provenance term.");
  }
  if (postImplementation.routesMissingProvenanceTerm.length > 0) {
    blockers.push(
      `Post-implementation evidence routes must each show a visible source/provenance term. Missing: ${postImplementation.routesMissingProvenanceTerm.join(", ")}.`
    );
  }
  if (postImplementation.capturesWithLoadedMedia === 0) {
    blockers.push("Post-implementation manifest must include at least one decoded POD image or HTTP-verified non-empty POD PDF/link media proof.");
  }
  if (postImplementation.routesMissingLoadedMedia.length > 0) {
    blockers.push(
      `Post-implementation evidence routes must each include decoded POD image or HTTP-verified non-empty POD PDF/link media proof. Missing: ${postImplementation.routesMissingLoadedMedia.join(", ")}.`
    );
  }
  if (postImplementation.routesMissingScreenshot.length > 0) {
    blockers.push(`Post-implementation live routes must each include a screenshot name. Missing: ${postImplementation.routesMissingScreenshot.join(", ")}.`);
  }
  if (postImplementation.routesMissingScreenshotFile.length > 0) {
    blockers.push(
      `Post-implementation screenshot files must exist for every live route. Missing files for: ${postImplementation.routesMissingScreenshotFile.join(", ")}.`
    );
  }
  if (postImplementation.missingBaselineRoutes.length > 0) {
    blockers.push(`Post-implementation manifest must cover every Phase 0 live route. Missing: ${postImplementation.missingBaselineRoutes.join(", ")}.`);
  }
  if (postImplementation.routesWithHttpFailures.length > 0) {
    blockers.push(`Post-implementation manifest has non-2xx/3xx route statuses: ${postImplementation.routesWithHttpFailures.join(", ")}.`);
  }
  if (postImplementation.routesWithConsoleErrors.length > 0) {
    blockers.push(`Post-implementation manifest has browser console/page errors: ${postImplementation.routesWithConsoleErrors.join(", ")}.`);
  }

  return blockers;
}

function visualDiffBlockers(visualDiff: RealEvidenceProofReadinessReport["visualDiff"]): string[] {
  if (visualDiff.status === "ready") {
    return [];
  }
  if (visualDiff.status === "blocked_missing_report") {
    return ["Pixel-diff report is required before post-implementation visual proof can pass."];
  }

  return [
    ...(visualDiff.failedRoutes.length === 0 ? [] : [`Pixel-diff report has failing routes: ${visualDiff.failedRoutes.join(", ")}.`]),
    ...(visualDiff.missingBaselineRoutes.length === 0
      ? []
      : [`Pixel-diff report must include every Phase 0 live route. Missing: ${visualDiff.missingBaselineRoutes.join(", ")}.`])
  ];
}

function liveRoutes(manifest: ManifestInput | undefined): CaptureInput[] {
  return manifest?.captures?.filter((capture) => capture.liveRoute === true) ?? [];
}

function readRouteName(capture: CaptureInput): string | undefined {
  return typeof capture.name === "string" && capture.name.trim().length > 0 ? capture.name.trim() : undefined;
}

function readRouteNameOrFallback(capture: CaptureInput): string {
  return readRouteName(capture) ?? "unnamed live route";
}

function hasScreenshotName(capture: CaptureInput): capture is CaptureInput & { screenshot: string } {
  return typeof capture.screenshot === "string" && capture.screenshot.trim().length > 0;
}

function routeRequiresEvidenceProof(routeName: string): boolean {
  return /selected case|evidence provenance|query answer|approval audit/iu.test(routeName);
}

function isLoadedMediaProof(mediaCheck: MediaCheckInput): boolean {
  if (mediaCheck.present !== true || mediaCheck.loaded !== true || mediaCheck.visible === false) {
    return false;
  }

  const contentType = mediaCheck.contentType?.toLowerCase().trim() ?? "";
  const hasSuccessfulResponse =
    mediaCheck.responseStatus !== null &&
    mediaCheck.responseStatus !== undefined &&
    mediaCheck.responseStatus >= 200 &&
    mediaCheck.responseStatus < 400;
  const hasContentType = contentType.length > 0;
  const hasPositiveByteLength =
    mediaCheck.byteLength !== null &&
    mediaCheck.byteLength !== undefined &&
    Number.isFinite(mediaCheck.byteLength) &&
    mediaCheck.byteLength > 0;
  const tagName = mediaCheck.tagName?.toLowerCase().trim() ?? "";
  const isImage = tagName === "img" || contentType.startsWith("image/");
  const isPdfOrDocument =
    contentType.includes("pdf") ||
    contentType.includes("msword") ||
    contentType.includes("officedocument") ||
    contentType.includes("octet-stream");

  if (!hasSuccessfulResponse || !hasContentType) {
    return false;
  }

  if (isImage) {
    return (
      contentType.startsWith("image/") &&
      mediaCheck.complete === true &&
      mediaCheck.naturalWidth !== null &&
      mediaCheck.naturalWidth !== undefined &&
      mediaCheck.naturalWidth > 0 &&
      mediaCheck.naturalHeight !== null &&
      mediaCheck.naturalHeight !== undefined &&
      mediaCheck.naturalHeight > 0
    );
  }

  return isPdfOrDocument && hasPositiveByteLength;
}

function postScreenshotFileExists(screenshot: string, manifestPath: string): boolean {
  return existsSync(join(dirname(manifestPath), "screenshots", screenshot));
}

async function readJsonIfPresent<T>(path: string): Promise<T | undefined> {
  if (!(await exists(path))) {
    return undefined;
  }

  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Real evidence proof readiness check failed."}\n`);
    process.exitCode = 1;
  });
}
