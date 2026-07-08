import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readTree(root: string): string {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
        files.push(path);
      }
    }
  }

  walk(root);
  return files.sort().map((path) => readFileSync(path, "utf8")).join("\n");
}

describe("David credit v2 route scaffold", () => {
  it("ships as the guarded /credit App Router route backed by the credit-v2 read model", () => {
    const pagePath = "cockpit/app/credit/page.tsx";
    const legacyRedirectPath = "cockpit/app/credit/v2/route.ts";
    const surfacePath = "cockpit/components/david/david-risk-review-surface.tsx";

    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(legacyRedirectPath)).toBe(true);
    expect(existsSync(surfacePath)).toBe(true);

    const page = readFileSync(pagePath, "utf8");
    const legacyRedirect = readFileSync(legacyRedirectPath, "utf8");

    expect(page).toContain('requireRouteAccess("/credit")');
    expect(page).toContain("fetchCreditRiskReviewModel");
    expect(page).toContain("DavidRiskReviewSurface");
    for (const forbidden of [
      "ApprovalControls",
      "AuditVerifyChip",
      "NegotiationGraph",
      "fetchCreditModel",
      "premium-components",
      "decimal.js",
      "src/core",
      "src/services"
    ]) {
      expect(page).not.toContain(forbidden);
    }

    expect(legacyRedirect).toContain("NextResponse.redirect");
    expect(legacyRedirect).toContain('new URL("/credit", request.url)');
    expect(legacyRedirect).toContain("status: 308");
  });

  it("keeps David scaffold components inside the cockpit boundary", () => {
    const sources = readTree("cockpit/components/david");

    expect(sources).toContain("@/components/ui/card");
    expect(sources).toContain("@/components/ui/skeleton");
    expect(sources).toContain('from "lucide-react"');

    for (const forbidden of [
      "cockpit-shell",
      "premium-components",
      "@phosphor-icons",
      "phosphor-react",
      "decimal.js",
      "src/core",
      "src/services",
      "../../app/demo-auth.ts",
      "../maya/",
      "mayaAccent"
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });
});
