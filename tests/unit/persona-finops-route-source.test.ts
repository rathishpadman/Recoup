import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("persona FinOps route source", () => {
  it("serves one standalone route with its own session gate and the shared real-backed surface", () => {
    const path = "cockpit/app/finops/page.tsx";
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toContain("requireDemoSession");
    expect(source).toContain("fetchPersonaFinopsModel");
    expect(source).toContain("PersonaFinopsSurface");
    expect(source).toContain("defaultPersonaFinopsPeriod");
    expect(source).toContain("searchParams");
    expect(source).toContain("periodDays");
    expect(source).toContain("displayName={session.displayName}");
    expect(source).toContain("requireBackendReadAuthHeaders");
    expect(source).toContain('path: "/persona-finops"');
    expect(source).toContain("requireBackendReadAuthHeaders([session.role]");
    expect(source).not.toContain("CockpitShell");
    expect(source).not.toContain("computedCostAmount:");
    expect(source).not.toContain("pricingProvenance:");
  });

  it("does not derive the persona scope from any client-controlled value", () => {
    const source = readFileSync("cockpit/app/finops/page.tsx", "utf8");
    expect(source).not.toContain("searchParams.persona");
    expect(source).not.toContain("persona=");
  });

  it("keeps persona FinOps out of the Maya and David workspaces", () => {
    expect(existsSync("cockpit/app/forensics/finops/page.tsx")).toBe(false);
    expect(existsSync("cockpit/app/credit/finops/page.tsx")).toBe(false);
    const shell = readFileSync("cockpit/app/cockpit-shell.tsx", "utf8");
    expect(shell).not.toContain("/forensics/finops");
    expect(shell).not.toContain("/credit/finops");
    expect(shell).not.toContain('label: "FinOps"');
  });

  it("keeps CFO Evals and FinOps on its existing route and surface", () => {
    const source = readFileSync("cockpit/app/governance/evals-finops/page.tsx", "utf8");
    expect(source).toContain('requireRouteAccess("/governance/evals-finops")');
    expect(source).toContain("fetchEvalFinopsModel");
    expect(source).toContain("EvalsFinopsSurface");
    expect(source).not.toContain("PersonaFinopsSurface");
  });
});
