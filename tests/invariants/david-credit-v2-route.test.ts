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

  it("keeps the David review surface aligned to the approved journey feedback", () => {
    const surface = readFileSync("cockpit/components/david/david-risk-review-surface.tsx", "utf8");
    const shell = readFileSync("cockpit/components/david/david-workspace-shell.tsx", "utf8");
    const copilot = readFileSync("cockpit/components/david/david-copilot-dock.tsx", "utf8");
    const dossier = readFileSync("cockpit/components/david/david-account-dossier.tsx", "utf8");
    const negotiationWorkbench = readFileSync("cockpit/components/david/david-negotiation-workbench.tsx", "utf8");
    const watchlist = readFileSync("cockpit/components/david/david-behavioural-watchlist.tsx", "utf8");

    expect(surface).not.toContain("DavidWalkthroughStrip");
    expect(surface).not.toContain("walkthroughStrip=");
    expect(surface).not.toContain("{selectedAccount === undefined ? null : accountQueue}");
    expect(shell).not.toContain("walkthroughStrip");
    expect(copilot).toContain('fetch("/api/credit/query"');
    expect(copilot).toContain("modelExecution");
    expect(copilot).not.toContain("disabledInputPlaceholder");
    expect(dossier).toContain("DavidDecisionFlow");
    expect(negotiationWorkbench).toContain("account.negotiationOrders");
    expect(negotiationWorkbench).not.toContain("round: 1");
    expect(negotiationWorkbench).not.toContain("ORD-HARBOR-6534");
    expect(negotiationWorkbench).not.toContain("ACC-HAR");
    expect(watchlist).not.toContain('new Set(["S3", "S6"])');
  });

  it("defaults David investigation drawers to the approved review posture", () => {
    const assessment = readFileSync("cockpit/components/david/david-assessment-timeline.tsx", "utf8");
    const signals = readFileSync("cockpit/components/david/david-signals-in.tsx", "utf8");
    const verdict = readFileSync("cockpit/components/david/david-verdict-banner.tsx", "utf8");
    const packet = readFileSync("cockpit/components/david/david-action-packet.tsx", "utf8");

    for (const source of [assessment, verdict, packet]) {
      expect(source).toContain("DavidCollapsibleCard");
      expect(source).toContain("defaultOpen={false}");
    }
    expect(signals).toContain("DavidCollapsibleCard");
    expect(signals).toContain("defaultOpen");
    expect(signals).not.toContain("defaultOpen={false}");
  });
});
