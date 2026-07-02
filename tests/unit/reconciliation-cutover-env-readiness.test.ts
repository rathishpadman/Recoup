import { describe, expect, it } from "vitest";
import { buildReconciliationCutoverEnvironmentReadinessReport } from "../../scripts/checkReconciliationCutoverEnvironmentReadiness.js";

describe("reconciliation cutover environment readiness", () => {
  it("blocks production preflight when the production project ref is missing without leaking secrets", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "https://nmwfftudympcvcjtyjbf.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report).toMatchObject({
      artifactType: "reconciliation_cutover_environment_readiness",
      generatedAt: "2026-07-01T00:00:00.000Z",
      noMutation: true,
      status: "blocked"
    });
    expect(report.productionPreflight).toMatchObject({
      status: "blocked",
      supabaseServiceRoleKeyPresent: true,
      supabaseUrlHost: "nmwfftudympcvcjtyjbf.supabase.co",
      supabaseUrlPresent: true
    });
    expect(report.productionPreflight.blockers).toContain("RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is required for production cutover preflight.");
    expect(JSON.stringify(report)).not.toContain("secret-service-role");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("service_role");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("bearer ");
  });

  it("reports production Supabase host mismatch with safe host and project-ref metadata only", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "https://devref456.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report.productionPreflight).toMatchObject({
      expectedSupabaseHost: "prodref123.supabase.co",
      productionProjectRefPresent: true,
      status: "blocked",
      supabaseUrlHost: "devref456.supabase.co"
    });
    expect(report.productionPreflight.blockers).toContain("SUPABASE_URL host does not match RECOUP_PRODUCTION_SUPABASE_PROJECT_REF.");
  });

  it("blocks non-HTTPS Supabase URLs even when the host matches", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        RECOUP_PREVIEW_URL: "https://preview-recoup.vercel.app",
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
        RECOUP_REAL_EVIDENCE_REFRESH_APPROVED: "approve-real-evidence-refresh",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "ftp://prodref123.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report.status).toBe("blocked");
    expect(report.productionPreflight).toMatchObject({
      status: "blocked",
      supabaseUrlHost: "prodref123.supabase.co"
    });
    expect(report.productionPreflight.blockers).toContain("SUPABASE_URL must use https before production cutover preflight.");
  });

  it("blocks preview URLs that do not use HTTP or HTTPS", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        RECOUP_PREVIEW_URL: "ftp://preview-recoup.vercel.app",
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
        RECOUP_REAL_EVIDENCE_REFRESH_APPROVED: "approve-real-evidence-refresh",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "https://prodref123.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report.status).toBe("blocked");
    expect(report.previewProof).toMatchObject({
      previewHost: "preview-recoup.vercel.app",
      previewUrlPresent: true,
      status: "blocked_invalid_preview_url"
    });
    expect(report.blockers).toContain("RECOUP_PREVIEW_URL must be a valid URL before preview/canary/browser proof can run.");
  });

  it("separates read-only production preflight readiness from mutation and preview approvals", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        RECOUP_PREVIEW_URL: "https://preview-recoup.vercel.app/path?token=do-not-print",
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
        RECOUP_RECONCILIATION_MODE: "legacy",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "https://prodref123.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report.productionPreflight).toMatchObject({
      status: "ready",
      expectedSupabaseHost: "prodref123.supabase.co",
      supabaseUrlHost: "prodref123.supabase.co"
    });
    expect(report.realEvidenceRefresh).toEqual({
      approved: false,
      status: "blocked_pending_human_approval"
    });
    expect(report.previewProof).toEqual({
      previewHost: "preview-recoup.vercel.app",
      previewUrlPresent: true,
      status: "ready"
    });
    expect(report.reconciliationMode).toEqual({
      canaryLinesPresent: false,
      safeForUnapprovedRuntime: true,
      value: "legacy"
    });
    expect(JSON.stringify(report)).not.toContain("do-not-print");
  });

  it("marks refresh approval and canary mode as explicit approval-controlled state", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        RECOUP_PREVIEW_URL: "https://preview-recoup.vercel.app",
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
        RECOUP_REAL_EVIDENCE_REFRESH_APPROVED: "approve-real-evidence-refresh",
        RECOUP_RECONCILIATION_CANARY_LINES: "S3-L1,S6-L1",
        RECOUP_RECONCILIATION_MODE: "canary",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "https://prodref123.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report.realEvidenceRefresh).toEqual({
      approved: true,
      status: "approved"
    });
    expect(report.reconciliationMode).toEqual({
      canaryLinesPresent: true,
      safeForUnapprovedRuntime: false,
      value: "canary"
    });
    expect(report.blockers).toContain("RECOUP_RECONCILIATION_MODE=canary requires completed production preflight and canary proof before provider promotion.");
  });

  it("blocks malformed preview URLs without echoing the raw value", () => {
    const report = buildReconciliationCutoverEnvironmentReadinessReport({
      env: {
        RECOUP_PREVIEW_URL: "not a url with token=do-not-print",
        RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
        RECOUP_REAL_EVIDENCE_REFRESH_APPROVED: "approve-real-evidence-refresh",
        SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
        SUPABASE_URL: "https://prodref123.supabase.co"
      },
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report.status).toBe("blocked");
    expect(report.previewProof).toEqual({
      previewUrlPresent: true,
      status: "blocked_invalid_preview_url"
    });
    expect(report.blockers).toContain("RECOUP_PREVIEW_URL must be a valid URL before preview/canary/browser proof can run.");
    expect(JSON.stringify(report)).not.toContain("do-not-print");
    expect(JSON.stringify(report)).not.toContain("not a url");
  });
});
