import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  buildFailedRouteCapture,
  buildCaptureProofMetadata,
  buildMayaRoutePreparationPlan,
  buildRealEvidenceMediaCheckFromProbe,
  buildVercelProtectionHeaders,
  isVercelDeploymentProtectionPage,
  readCaptureKind,
  safeFetchMediaProof,
  sanitizeCaptureUrlForManifest,
  sanitizeConsoleTextForManifest
} from "../../scripts/captureRealEvidenceAudit.js";

describe("real evidence capture media proof", () => {
  const selector = "[data-testid='pod-document-preview']";

  it("does not treat classic Forensics or Run routes as shadcn evidence-detail states", () => {
    expect(
      buildMayaRoutePreparationPlan({
        name: "selected case",
        persona: "Maya",
        url: "https://preview.example.com/forensics/shadcn"
      })
    ).toMatchObject({
      kind: "shadcn",
      requiresCanonicalEvidenceProof: true,
      waitSelector: '[data-testid="maya-shadcn-workbench"]'
    });

    expect(
      buildMayaRoutePreparationPlan({
        name: "forensics classic if live",
        persona: "Maya",
        requestedPath: "/forensics",
        url: "https://preview.example.com/forensics"
      })
    ).toMatchObject({
      kind: "classic",
      requiresCanonicalEvidenceProof: false,
      waitSelector: ".workbench-grid, .dossier-workbench"
    });

    expect(
      buildMayaRoutePreparationPlan({
        name: "run workspace if live",
        persona: "Maya",
        requestedPath: "/run",
        url: "https://preview.example.com/run"
      })
    ).toMatchObject({
      kind: "run",
      requiresCanonicalEvidenceProof: false,
      waitSelector: ".run-console-layout, .run-evidence-table"
    });
  });

  it("requires image complete and decoded dimensions before marking POD image media loaded", () => {
    const incompleteImage = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: false,
        naturalHeight: 640,
        naturalWidth: 480,
        source: "https://cdn.example.com/pod.png",
        tagName: "img",
        visible: true
      },
      responseProof: {
        byteLength: 1234,
        contentType: "image/png",
        status: 200,
        urlHost: "cdn.example.com",
        urlPath: "/pod.png"
      },
      selector
    });

    expect(incompleteImage).toMatchObject({
      complete: false,
      loaded: false,
      responseStatus: 200
    });

    const loadedImage = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: true,
        naturalHeight: 640,
        naturalWidth: 480,
        source: "https://cdn.example.com/pod.png",
        tagName: "img",
        visible: true
      },
      responseProof: {
        byteLength: 1234,
        contentType: "image/png",
        status: 200,
        urlHost: "cdn.example.com",
        urlPath: "/pod.png"
      },
      selector
    });

    expect(loadedImage).toMatchObject({
      complete: true,
      loaded: true,
      naturalHeight: 640,
      naturalWidth: 480,
      responseStatus: 200
    });
  });

  it("requires non-image POD links to have HTTP status and content type proof", () => {
    const missingStatus = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: null,
        naturalHeight: null,
        naturalWidth: null,
        source: "https://cdn.example.com/pod.pdf",
        tagName: "a",
        visible: true
      },
      responseProof: {
        byteLength: null,
        contentType: "application/pdf",
        status: null,
        urlHost: "cdn.example.com",
        urlPath: "/pod.pdf"
      },
      selector
    });

    expect(missingStatus).toMatchObject({
      loaded: false,
      responseStatus: null
    });

    const missingContentType = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: null,
        naturalHeight: null,
        naturalWidth: null,
        source: "https://cdn.example.com/pod.pdf",
        tagName: "a",
        visible: true
      },
      responseProof: {
        byteLength: 3456,
        contentType: null,
        status: 200,
        urlHost: "cdn.example.com",
        urlPath: "/pod.pdf"
      },
      selector
    });

    expect(missingContentType.loaded).toBe(false);

    const zeroBytePdf = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: null,
        naturalHeight: null,
        naturalWidth: null,
        source: "https://cdn.example.com/pod.pdf",
        tagName: "a",
        visible: true
      },
      responseProof: {
        byteLength: 0,
        contentType: "application/pdf",
        status: 200,
        urlHost: "cdn.example.com",
        urlPath: "/pod.pdf"
      },
      selector
    });

    expect(zeroBytePdf).toMatchObject({
      byteLength: 0,
      loaded: false,
      responseStatus: 200
    });

    const verifiedPdf = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: null,
        naturalHeight: null,
        naturalWidth: null,
        source: "https://cdn.example.com/pod.pdf",
        tagName: "a",
        visible: true
      },
      responseProof: {
        byteLength: 3456,
        contentType: "application/pdf",
        status: 200,
        urlHost: "cdn.example.com",
        urlPath: "/pod.pdf"
      },
      selector
    });

    expect(verifiedPdf).toMatchObject({
      contentType: "application/pdf",
      loaded: true,
      responseStatus: 200,
      tagName: "a"
    });

    const genericHtml = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: null,
        naturalHeight: null,
        naturalWidth: null,
        source: "https://preview.example.com/login",
        tagName: "a",
        visible: true
      },
      responseProof: {
        byteLength: 3456,
        contentType: "text/html; charset=utf-8",
        status: 200,
        urlHost: "preview.example.com",
        urlPath: "/login"
      },
      selector
    });

    expect(genericHtml).toMatchObject({
      loaded: false,
      responseStatus: 200
    });

    const safeViewerHtml = buildRealEvidenceMediaCheckFromProbe({
      mediaProbe: {
        complete: null,
        naturalHeight: null,
        naturalWidth: null,
        source: "https://preview.example.com/api/forensics/evidence-documents/EVD-POD-S3-L1",
        tagName: "a",
        visible: true
      },
      responseProof: {
        byteLength: 3456,
        contentType: "text/html; charset=utf-8",
        status: 200,
        urlHost: "preview.example.com",
        urlPath: "/api/forensics/evidence-documents/EVD-POD-S3-L1"
      },
      selector
    });

    expect(safeViewerHtml).toMatchObject({
      contentType: "text/html; charset=utf-8",
      loaded: false,
      responseStatus: 200,
      tagName: "a"
    });
  });

  it("marks local captures as non-release proof even when capture kind is post-implementation", () => {
    expect(readCaptureKind(undefined, "docs/audit/real-evidence-preview/2026-07-01-preview-2")).toBe("preview");
    expect(readCaptureKind(undefined, "docs/audit/real-evidence-post-implementation/2026-07-01")).toBe("post-implementation");
    expect(readCaptureKind("post-implementation", "docs/audit/real-evidence-preview/2026-07-01-preview-2")).toBe("preview");
    expect(buildCaptureProofMetadata("http://127.0.0.1:3000", "post-implementation")).toEqual({
      proofScope: "local",
      releaseProof: false
    });
    expect(buildCaptureProofMetadata("https://recoup-self-eta.vercel.app", "post-implementation")).toEqual({
      proofScope: "public_alias",
      releaseProof: true
    });
    expect(buildCaptureProofMetadata("https://preview.example.com", "preview")).toEqual({
      proofScope: "preview",
      releaseProof: false
    });
  });

  it("detects Vercel deployment protection before waiting on Recoup login selectors", () => {
    expect(isVercelDeploymentProtectionPage("https://vercel.com/login", "Login – Vercel")).toBe(true);
    expect(isVercelDeploymentProtectionPage("https://preview.example.com/login", "Recoup Login")).toBe(false);
    expect(isVercelDeploymentProtectionPage("https://vercel.com/dashboard", "Vercel")).toBe(false);
  });

  it("builds Vercel automation bypass headers without requiring public preview access", () => {
    const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    try {
      delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      expect(buildVercelProtectionHeaders()).toBeUndefined();

      process.env.VERCEL_AUTOMATION_BYPASS_SECRET = " preview-proof-secret ";
      expect(buildVercelProtectionHeaders()).toEqual({
        "x-vercel-protection-bypass": "preview-proof-secret",
        "x-vercel-set-bypass-cookie": "true"
      });
    } finally {
      if (previous === undefined) {
        delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      } else {
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous;
      }
    }
  });

  it("sanitizes persisted capture URLs and console text before audit manifest output", () => {
    expect(sanitizeCaptureUrlForManifest("https://user:pass@preview.example.com/case?token=secret#frag")).toBe(
      "https://preview.example.com/case"
    );
    expect(sanitizeCaptureUrlForManifest("not a url with token=secret")).toBe("invalid-url");

    const sanitized = sanitizeConsoleTextForManifest(
      "GET https://preview.example.com/api/forensics?token=secret&bypass=hidden failed with bearer abc.def.ghi and SUPABASE_SERVICE_ROLE_KEY=value"
    );

    expect(sanitized).toContain("https://preview.example.com/api/forensics");
    expect(sanitized).not.toContain("token=secret");
    expect(sanitized).not.toContain("bypass=hidden");
    expect(sanitized).not.toContain("abc.def.ghi");
    expect(sanitized).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sanitized.toLowerCase()).not.toContain("bearer ");

    const complex = sanitizeConsoleTextForManifest(
      'GET /api/forensics?customer=NorthBay&lineId=S3-L1 failed {"serviceRoleKey":"secret value","supabase_service_role_key":"other"} authorization: Basic abc123 user@example.com'
    );

    expect(complex).not.toContain("NorthBay");
    expect(complex).not.toContain("S3-L1");
    expect(complex).not.toContain("secret value");
    expect(complex).not.toContain("other");
    expect(complex).not.toContain("abc123");
    expect(complex).not.toContain("user@example.com");
    expect(complex).not.toContain("serviceRoleKey");
    expect(complex).not.toContain("supabase_service_role_key");
    expect(complex).toContain("[redacted-secret]");
    expect(complex).toContain("authorization=[redacted]");
    expect(complex).toContain("[redacted-email]");
  });

  it("records failed route captures as blocked manifest entries without leaking URL secrets", () => {
    const failed = buildFailedRouteCapture({
      baselineCapture: {
        liveRoute: true,
        name: "query answer panel",
        persona: "Maya",
        requestedPath: "/forensics/shadcn?token=secret",
        screenshot: "06-query-answer-panel.png",
        url: "https://preview.example.com/forensics/shadcn?token=secret"
      },
      consoleErrors: ["GET https://preview.example.com/api?token=secret failed with bearer abc.def.ghi"],
      error: new Error("waiting for selector token=secret"),
      url: "https://preview.example.com/forensics/shadcn?token=secret"
    });

    expect(failed).toMatchObject({
      cacheHeader: null,
      captureError: "waiting for selector [redacted-secret]",
      liveRoute: true,
      name: "query answer panel",
      requestedPath: "/forensics/shadcn",
      screenshot: "06-query-answer-panel.png",
      status: null,
      url: "https://preview.example.com/forensics/shadcn",
      visibleEvidenceIds: [],
      visibleReceiptIds: []
    });
    expect(failed.mediaChecks[0]).toMatchObject({
      loaded: false,
      note: "Route capture did not complete.",
      present: false
    });
    expect(JSON.stringify(failed)).not.toContain("token=secret");
    expect(JSON.stringify(failed).toLowerCase()).not.toContain("bearer ");

    const timedOut = buildFailedRouteCapture({
      baselineCapture: {
        name: "approval audit panel",
        persona: "Maya",
        screenshot: "07-approval-audit-panel.png",
        url: "https://preview.example.com/forensics/shadcn"
      },
      error: new Error("ignored"),
      routeTimedOut: true,
      timeoutMs: 10
    });

    expect(timedOut.captureError).toBe("Capture timed out after 10ms.");
  });

  it("aborts stalled POD media response fetches", async () => {
    const server = createServer(() => {
      // Intentionally leave the response open so AbortSignal is the only completion path.
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected local test server address.");
    }

    const abort = new AbortController();
    const timeout = setTimeout(() => {
      abort.abort();
    }, 20);
    try {
      const proof = await safeFetchMediaProof(`http://127.0.0.1:${address.port.toString()}/pod.pdf?token=secret`, abort.signal);

      expect(proof).toMatchObject({
        byteLength: null,
        contentType: null,
        status: null,
        urlHost: `127.0.0.1:${address.port.toString()}`,
        urlPath: "/pod.pdf"
      });
    } finally {
      clearTimeout(timeout);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("passes the Vercel bypass headers alongside existing media proof cookies", async () => {
    let bypassHeader: string | string[] | undefined;
    let setBypassCookieHeader: string | string[] | undefined;
    let cookieHeader: string | string[] | undefined;
    const server = createServer((request, response) => {
      bypassHeader = request.headers["x-vercel-protection-bypass"];
      setBypassCookieHeader = request.headers["x-vercel-set-bypass-cookie"];
      cookieHeader = request.headers.cookie;
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end("%PDF-1.4\n");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected local test server address.");
    }

    const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    try {
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "media-proof-secret";
      const proof = await safeFetchMediaProof(`http://127.0.0.1:${address.port.toString()}/pod.pdf`, undefined, {
        cookie: "recoup_session=present"
      });

      expect(proof).toMatchObject({
        contentType: "application/pdf",
        status: 200,
        urlPath: "/pod.pdf"
      });
      expect(bypassHeader).toBe("media-proof-secret");
      expect(setBypassCookieHeader).toBe("true");
      expect(cookieHeader).toBe("recoup_session=present");
    } finally {
      if (previous === undefined) {
        delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      } else {
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
