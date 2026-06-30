import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Evals FinOps KPI surface source", () => {
  it("renders the KPI dashboard sections without blocked or missing labels", () => {
    const surface = readFileSync("cockpit/app/governance/evals-finops/evals-finops-surface.tsx", "utf8");
    const governanceNav = readFileSync("cockpit/app/governance/governance-nav.tsx", "utf8");
    const visibleSources = [surface, governanceNav].join("\n");

    for (const requiredLabel of ["Agent Scorecard", "Persona KPI Matrix", "Token Usage", "Cost Efficiency", "Action Queue"]) {
      expect(surface).toContain(requiredLabel);
    }

    for (const forbiddenLabel of ["Blocked inputs", "Pricing blocked", "Pricing not configured", "Usage unavailable", "blocked-safe", "missing"]) {
      expect(visibleSources).not.toContain(forbiddenLabel);
    }
  });
});
