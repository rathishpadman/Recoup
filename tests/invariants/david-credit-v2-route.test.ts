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
  it("ships as a guarded App Router route backed by the credit-v2 read model", () => {
    const pagePath = "cockpit/app/credit/v2/page.tsx";
    const loadingPath = "cockpit/app/credit/v2/loading.tsx";
    const surfacePath = "cockpit/components/david/david-risk-review-surface.tsx";
    const loadingShellPath = "cockpit/components/david/david-shadcn-loading-shell.tsx";

    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(loadingPath)).toBe(true);
    expect(existsSync(surfacePath)).toBe(true);
    expect(existsSync(loadingShellPath)).toBe(true);

    const page = readFileSync(pagePath, "utf8");
    const loading = readFileSync(loadingPath, "utf8");

    expect(page).toContain('requireRouteAccess("/credit/v2")');
    expect(page).toContain("fetchCreditRiskReviewModel");
    expect(page).toContain("DavidRiskReviewSurface");
    expect(page).not.toContain("decimal.js");
    expect(page).not.toContain("src/core");
    expect(page).not.toContain("src/services");
    expect(loading).toContain("DavidShadcnLoadingShell");
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
