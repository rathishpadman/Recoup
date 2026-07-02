import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import {
  assertBrowserTargetReachable,
  buildVercelProtectionHeaders,
  formatForensicsApiDiagnostic,
  isIgnorableBrowserConsoleError
} from "../e2e/real-evidence-browser-helpers.ts";

describe("real evidence browser target preflight", () => {
  it("passes when the configured cockpit target serves login", async () => {
    const { close, url } = await startServer(200);

    try {
      await expect(assertBrowserTargetReachable(url)).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  it("builds Vercel deployment protection headers only when the bypass secret is configured", () => {
    const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    try {
      delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      expect(buildVercelProtectionHeaders()).toBeUndefined();

      process.env.VERCEL_AUTOMATION_BYPASS_SECRET = " test-bypass-secret ";
      expect(buildVercelProtectionHeaders()).toEqual({
        "x-vercel-protection-bypass": "test-bypass-secret",
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

  it("ignores browser console noise only for failed external Google font loads", () => {
    expect(isIgnorableBrowserConsoleError("Failed to load resource: net::ERR_FAILED", "https://fonts.gstatic.com/font.woff2")).toBe(true);
    expect(isIgnorableBrowserConsoleError("Access to font at https://fonts.gstatic.com/font.woff2 has been blocked", "")).toBe(true);
    expect(isIgnorableBrowserConsoleError("Failed to load resource: net::ERR_FAILED", "https://preview.example.com/fonts/app.woff2")).toBe(
      false
    );
    expect(isIgnorableBrowserConsoleError("Failed to load resource: net::ERR_FAILED", "https://preview.example.com/api/forensics")).toBe(false);
  });

  it("fails with an actionable message when the cockpit target is unhealthy", async () => {
    const { close, url } = await startServer(503);

    try {
      await expect(assertBrowserTargetReachable(url)).rejects.toThrow(/returned HTTP 503/u);
      await expect(assertBrowserTargetReachable(url)).rejects.toThrow(/Use a reachable cockpit URL/u);
    } finally {
      await close();
    }
  });

  it("summarizes fail-closed Forensics API responses without leaking arbitrary payloads", () => {
    const diagnostic = formatForensicsApiDiagnostic(
      502,
      JSON.stringify({
        correlationId: "28cbd856-70c8-4fdb-bda5-ae0d663ef500",
        detail: "SUPABASE_SERVICE_ROLE_KEY=value should not be copied",
        missingSource: "supabase-settlement-source-rows",
        payload: { serviceRoleKey: "hidden" },
        status: "fail"
      })
    );

    expect(diagnostic).toContain("/api/forensics returned HTTP 502");
    expect(diagnostic).toContain("missingSource=supabase-settlement-source-rows");
    expect(diagnostic).toContain("correlationId=28cbd856-70c8-4fdb-bda5-ae0d663ef500");
    expect(diagnostic).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(diagnostic).not.toContain("serviceRoleKey");
    expect(diagnostic).not.toContain("hidden");
  });

  it("redacts secret-shaped values even when they appear in allowed diagnostic fields", () => {
    const diagnostic = formatForensicsApiDiagnostic(
      502,
      JSON.stringify({
        error: "token=abc123 password=hunter2 Authorization: Basic abc.def api_key=key123 secret=sauce",
        message: "serviceRoleKey=hidden service_role_key=value bearer abc.def.ghi user@example.com",
        missingSource: "supabase-settlement-source-rows"
      })
    );

    expect(diagnostic).toContain("missingSource=supabase-settlement-source-rows");
    expect(diagnostic).toContain("token=[redacted]");
    expect(diagnostic).toContain("password=[redacted]");
    expect(diagnostic).toContain("authorization=[redacted]");
    expect(diagnostic).toContain("api_key=[redacted]");
    expect(diagnostic).toContain("secret=[redacted]");
    expect(diagnostic).toContain("serviceRoleKey=[redacted]");
    expect(diagnostic).toContain("service_role_key=[redacted]");
    expect(diagnostic).toContain("bearer [redacted]");
    expect(diagnostic).toContain("[redacted-email]");
    expect(diagnostic).not.toContain("abc123");
    expect(diagnostic).not.toContain("hunter2");
    expect(diagnostic).not.toContain("abc.def");
    expect(diagnostic).not.toContain("key123");
    expect(diagnostic).not.toContain("sauce");
    expect(diagnostic).not.toContain("hidden");
    expect(diagnostic).not.toContain("user@example.com");
  });

  it("redacts quoted and env-style diagnostic secrets inside allowed fields", () => {
    const diagnostic = formatForensicsApiDiagnostic(
      502,
      JSON.stringify({
        error: String.raw`"token":"json-token" "api_key":"json-key" \"secret\":\"json-secret\"`,
        message: String.raw`SUPABASE_SERVICE_ROLE_KEY=env-role OPENAI_API_KEY=env-open AUTH_TOKEN=env-token "Authorization":"Basic quoted.auth"`,
        missingSource: "supabase-settlement-source-rows"
      })
    );

    expect(diagnostic).toContain("missingSource=supabase-settlement-source-rows");
    expect(diagnostic).toContain("token=[redacted]");
    expect(diagnostic).toContain("api_key=[redacted]");
    expect(diagnostic).toContain("secret=[redacted]");
    expect(diagnostic).toContain("SUPABASE_SERVICE_ROLE_KEY=[redacted]");
    expect(diagnostic).toContain("OPENAI_API_KEY=[redacted]");
    expect(diagnostic).toContain("AUTH_TOKEN=[redacted]");
    expect(diagnostic).toContain("authorization=[redacted]");
    expect(diagnostic).not.toContain("json-token");
    expect(diagnostic).not.toContain("json-key");
    expect(diagnostic).not.toContain("json-secret");
    expect(diagnostic).not.toContain("env-role");
    expect(diagnostic).not.toContain("env-open");
    expect(diagnostic).not.toContain("env-token");
    expect(diagnostic).not.toContain("quoted.auth");
  });

  it("redacts quoted secret values that contain spaces or commas", () => {
    const diagnostic = formatForensicsApiDiagnostic(
      502,
      JSON.stringify({
        error: String.raw`"token":"alpha, beta gamma" "api_key":"key, with suffix"`,
        message: String.raw`SUPABASE_SERVICE_ROLE_KEY="env role, with suffix" \"secret\":\"json secret, with suffix\"`,
        missingSource: "supabase-settlement-source-rows"
      })
    );

    expect(diagnostic).toContain("missingSource=supabase-settlement-source-rows");
    expect(diagnostic).toContain("token=[redacted]");
    expect(diagnostic).toContain("api_key=[redacted]");
    expect(diagnostic).toContain("SUPABASE_SERVICE_ROLE_KEY=[redacted]");
    expect(diagnostic).toContain("secret=[redacted]");
    expect(diagnostic).not.toContain("alpha");
    expect(diagnostic).not.toContain("beta");
    expect(diagnostic).not.toContain("gamma");
    expect(diagnostic).not.toContain("with suffix");
    expect(diagnostic).not.toContain("env role");
    expect(diagnostic).not.toContain("json secret");
  });
});

async function startServer(status: number): Promise<{ close: () => Promise<void>; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "text/html" });
    response.end("<!doctype html><title>Recoup test target</title>");
  });
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
    url: `http://127.0.0.1:${address.port.toString()}`
  };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}
