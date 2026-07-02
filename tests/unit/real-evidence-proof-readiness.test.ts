import { describe, expect, it } from "vitest";
import { buildRealEvidenceProofReadinessReport } from "../../scripts/checkRealEvidenceProofReadiness.js";

describe("real evidence proof readiness", () => {
  const generatedAt = "2026-07-01T00:00:00.000Z";
  const readyEnv = {
    RECOUP_PREVIEW_URL: "https://preview-recoup.vercel.app/path?token=do-not-print",
    RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "prodref123",
    RECOUP_REAL_EVIDENCE_REFRESH_APPROVED: "approve-real-evidence-refresh",
    SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
    SUPABASE_URL: "https://prodref123.supabase.co"
  };
  const baselineManifest = {
    captures: [
      {
        liveRoute: true,
        name: "selected case",
        screenshot: "04-forensics-selected-case.png"
      },
      {
        liveRoute: true,
        name: "evidence provenance drawer",
        screenshot: "05-evidence-provenance-drawer.png"
      }
    ]
  };

  it("blocks until post-implementation frontend proof exists without leaking URLs or secrets", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      env: readyEnv,
      generatedAt
    });

    expect(report).toMatchObject({
      artifactType: "real_evidence_visual_proof_readiness",
      generatedAt,
      noMutation: true,
      status: "blocked"
    });
    expect(report.baseline).toMatchObject({
      liveCaptureCount: 2,
      status: "ready"
    });
    expect(report.postImplementation).toMatchObject({
      manifestPresent: false,
      status: "blocked_missing_manifest"
    });
    expect(report.blockers).toContain("Post-implementation manifest is required before visual/POD media proof can pass.");
    expect(report.readOnlyVerificationCommands).toEqual(
      expect.arrayContaining([
        "npm.cmd run check:reconciliation-cutover-env",
        "npm.cmd run verify:real-evidence -- --target=production",
        "npm.cmd run preflight:reconciliation-cutover -- --target=production",
        "npm.cmd run capture:real-evidence-audit",
        "npm.cmd run verify:real-evidence-visual",
        "npm.cmd run verify:real-evidence-a11y"
      ])
    );
    expect(JSON.stringify(report)).not.toContain("do-not-print");
    expect(JSON.stringify(report)).not.toContain("secret-service-role");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("service_role");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("bearer ");
  });

  it("requires canonical POD evidence, receipt, loaded media, and passing pixel diff", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          error: "Post-implementation screenshot is missing.",
          maxChangedPixelRatio: 0.35,
          pass: false,
          postPath: "post.png",
          route: "selected case"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [{ label: "POD document/media", loaded: false, present: true, visible: true }],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            visibleEvidenceIds: [],
            visibleReceiptIds: []
          }
        ]
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      capturesWithLoadedMedia: 0,
      capturesWithProvenanceTerm: 0,
      capturesWithRequiredEvidenceId: 0,
      capturesWithRequiredReceiptId: 0,
      capturesWithVisibleContentHash: 0,
      manifestPresent: true,
      status: "blocked_missing_required_proof"
    });
    expect(report.visualDiff).toMatchObject({
      failedRoutes: ["selected case"],
      status: "blocked_failed_routes"
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Post-implementation manifest must show EVD-POD-S3-L1 on at least one live route.",
        "Post-implementation manifest must show RECON-S3-L1 on at least one live route.",
        "Post-implementation manifest must show at least one visible evidence content hash.",
        "Post-implementation manifest must show at least one visible source/provenance term.",
        "Post-implementation manifest must include at least one decoded POD image or HTTP-verified non-empty POD PDF/link media proof.",
        "Pixel-diff report has failing routes: selected case."
      ])
    );
  });

  it("requires post-implementation coverage and route health for every baseline live route", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "post.png",
          route: "selected case"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            consoleErrors: ["Hydration failed"],
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 3456,
                contentType: "application/pdf",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            status: 503,
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      missingBaselineRoutes: ["evidence provenance drawer"],
      routesWithConsoleErrors: ["selected case"],
      routesWithHttpFailures: ["selected case"],
      status: "blocked_missing_required_proof"
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Post-implementation manifest must cover every Phase 0 live route. Missing: evidence provenance drawer.",
        "Post-implementation manifest has non-2xx/3xx route statuses: selected case.",
        "Post-implementation manifest has browser console/page errors: selected case."
      ])
    );
  });

  it("requires each evidence-detail route to carry its own IDs, hash, provenance, media, and pixel diff proof", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "selected-baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "selected-post.png",
          route: "selected case"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [
              {
                complete: true,
                contentType: "image/png",
                label: "POD document/media",
                loaded: true,
                naturalHeight: 640,
                naturalWidth: 480,
                present: true,
                responseStatus: 200,
                tagName: "img",
                visible: true
              }
            ],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            status: 200,
            visibleContentHashes: ["a".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          },
          {
            liveRoute: true,
            mediaChecks: [],
            name: "evidence provenance drawer",
            screenshot: "05-evidence-provenance-drawer.png",
            status: 200,
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      routesMissingLoadedMedia: ["evidence provenance drawer"],
      routesMissingProvenanceTerm: ["evidence provenance drawer"],
      routesMissingVisibleContentHash: ["evidence provenance drawer"]
    });
    expect(report.visualDiff).toMatchObject({
      missingBaselineRoutes: ["evidence provenance drawer"],
      status: "blocked_failed_routes"
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Post-implementation evidence routes must each include decoded POD image or HTTP-verified non-empty POD PDF/link media proof. Missing: evidence provenance drawer.",
        "Post-implementation evidence routes must each show a visible evidence content hash. Missing: evidence provenance drawer.",
        "Post-implementation evidence routes must each show a visible source/provenance term. Missing: evidence provenance drawer.",
        "Pixel-diff report must include every Phase 0 live route. Missing: evidence provenance drawer."
      ])
    );
  });

  it("marks proof ready only when environment, media proof, receipts, and visual diff are all ready", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "post.png",
          route: "selected case"
        },
        {
          baselinePath: "drawer-baseline.png",
          changedPixelRatio: 0.11,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "drawer-post.png",
          route: "evidence provenance drawer"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [
              {
                complete: true,
                contentType: "image/png",
                label: "POD document/media",
                loaded: true,
                naturalHeight: 640,
                naturalWidth: 480,
                present: true,
                responseStatus: 200,
                tagName: "img",
                visible: true
              }
            ],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            status: 200,
            visibleContentHashes: ["a".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          },
          {
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 3456,
                contentType: "application/pdf",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "evidence provenance drawer",
            screenshot: "05-evidence-provenance-drawer.png",
            status: 200,
            visibleContentHashes: ["b".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      }
    });

    expect(report.status).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.postImplementation).toMatchObject({
      capturesWithLoadedMedia: 2,
      capturesWithProvenanceTerm: 2,
      capturesWithRequiredEvidenceId: 2,
      capturesWithRequiredReceiptId: 2,
      capturesWithVisibleContentHash: 2,
      status: "ready"
    });
    expect(report.visualDiff).toMatchObject({
      failedRoutes: [],
      passedRoutes: ["selected case", "evidence provenance drawer"],
      status: "ready"
    });
  });

  it("does not accept loaded POD media without decode or HTTP/content-type/byte-length proof", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "post.png",
          route: "selected case"
        },
        {
          baselinePath: "drawer-baseline.png",
          changedPixelRatio: 0.11,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "drawer-post.png",
          route: "evidence provenance drawer"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [
              {
                contentType: "image/png",
                label: "POD document/media",
                loaded: true,
                naturalHeight: 640,
                naturalWidth: 480,
                present: true,
                responseStatus: 200,
                tagName: "img",
                visible: true
              }
            ],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            status: 200,
            visibleContentHashes: ["a".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          },
          {
            liveRoute: true,
            mediaChecks: [
              {
                contentType: null,
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: null,
                tagName: "a",
                visible: true
              }
            ],
            name: "evidence provenance drawer",
            screenshot: "05-evidence-provenance-drawer.png",
            status: 200,
            visibleContentHashes: ["b".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      capturesWithLoadedMedia: 0,
      routesMissingLoadedMedia: ["selected case", "evidence provenance drawer"]
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Post-implementation manifest must include at least one decoded POD image or HTTP-verified non-empty POD PDF/link media proof.",
        "Post-implementation evidence routes must each include decoded POD image or HTTP-verified non-empty POD PDF/link media proof. Missing: selected case, evidence provenance drawer."
      ])
    );
  });

  it("does not accept zero-byte POD PDF or link proof as loaded media", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "post.png",
          route: "selected case"
        },
        {
          baselinePath: "drawer-baseline.png",
          changedPixelRatio: 0.11,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "drawer-post.png",
          route: "evidence provenance drawer"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 0,
                contentType: "application/pdf",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            status: 200,
            visibleContentHashes: ["a".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          },
          {
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 0,
                contentType: "application/pdf",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "evidence provenance drawer",
            screenshot: "05-evidence-provenance-drawer.png",
            status: 200,
            visibleContentHashes: ["b".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      capturesWithLoadedMedia: 0,
      routesMissingLoadedMedia: ["selected case", "evidence provenance drawer"]
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Post-implementation manifest must include at least one decoded POD image or HTTP-verified non-empty POD PDF/link media proof.",
        "Post-implementation evidence routes must each include decoded POD image or HTTP-verified non-empty POD PDF/link media proof. Missing: selected case, evidence provenance drawer."
      ])
    );
  });

  it("does not accept HTML safe-viewer proof as original loaded POD media", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "post.png",
          route: "selected case"
        },
        {
          baselinePath: "drawer-baseline.png",
          changedPixelRatio: 0.11,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "drawer-post.png",
          route: "evidence provenance drawer"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 3456,
                contentType: "text/html; charset=utf-8",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "selected case",
            screenshot: "04-forensics-selected-case.png",
            status: 200,
            visibleContentHashes: ["a".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          },
          {
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 3456,
                contentType: "text/html; charset=utf-8",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "evidence provenance drawer",
            screenshot: "05-evidence-provenance-drawer.png",
            status: 200,
            visibleContentHashes: ["b".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      capturesWithLoadedMedia: 0,
      routesMissingLoadedMedia: ["selected case", "evidence provenance drawer"]
    });
  });

  it("requires post-implementation screenshot names and files when filesystem proof is enabled", () => {
    const report = buildRealEvidenceProofReadinessReport({
      baselineManifest,
      diffResults: [
        {
          baselinePath: "baseline.png",
          changedPixelRatio: 0.12,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "post.png",
          route: "selected case"
        },
        {
          baselinePath: "drawer-baseline.png",
          changedPixelRatio: 0.11,
          maxChangedPixelRatio: 0.35,
          pass: true,
          postPath: "drawer-post.png",
          route: "evidence provenance drawer"
        }
      ],
      env: readyEnv,
      generatedAt,
      postManifest: {
        captures: [
          {
            liveRoute: true,
            mediaChecks: [
              {
                complete: true,
                contentType: "image/png",
                label: "POD document/media",
                loaded: true,
                naturalHeight: 640,
                naturalWidth: 480,
                present: true,
                responseStatus: 200,
                tagName: "img",
                visible: true
              }
            ],
            name: "selected case",
            status: 200,
            visibleContentHashes: ["a".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          },
          {
            liveRoute: true,
            mediaChecks: [
              {
                byteLength: 3456,
                contentType: "application/pdf",
                label: "POD document/media",
                loaded: true,
                present: true,
                responseStatus: 200,
                tagName: "a",
                visible: true
              }
            ],
            name: "evidence provenance drawer",
            screenshot: "05-evidence-provenance-drawer.png",
            status: 200,
            visibleContentHashes: ["b".repeat(64)],
            visibleEvidenceIds: ["EVD-POD-S3-L1"],
            visibleProvenanceTerms: ["source_generated"],
            visibleReceiptIds: ["RECON-S3-L1"]
          }
        ]
      },
      postScreenshotFileExists: () => false,
      verifyPostScreenshotFiles: true
    });

    expect(report.status).toBe("blocked");
    expect(report.postImplementation).toMatchObject({
      capturesWithScreenshot: 1,
      routesMissingScreenshot: ["selected case"],
      routesMissingScreenshotFile: ["evidence provenance drawer"]
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Post-implementation live routes must each include a screenshot name. Missing: selected case.",
        "Post-implementation screenshot files must exist for every live route. Missing files for: evidence provenance drawer."
      ])
    );
  });
});
