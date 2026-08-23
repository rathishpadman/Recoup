import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cockpitDemoProfiles } from "../../config/cockpitDemoProfiles.js";

/**
 * Agent Operations must be gated like every other business surface.
 *
 * The page shipped ungated while it rendered nothing, which was harmless only
 * because the snapshot was always empty. Once the read model carries customer
 * identity and money, an ungated route serves that to anonymous callers, so the
 * gate is asserted here before the data lands rather than after.
 */

describe("agent operations auth gate", () => {
  it("gates the page behind the demo route check", () => {
    const page = readFileSync("cockpit/app/agent-operations/page.tsx", "utf8");

    expect(page).toContain('requireRouteAccess("/agent-operations")');
  });

  it("requires verified human auth on the cockpit proxy route", () => {
    const route = readFileSync("cockpit/app/api/agent-operations/route.ts", "utf8");

    expect(route).toContain("buildVerifiedHumanAuthHeaders");
    // An unauthenticated caller must be refused before any upstream read.
    expect(route).toContain("401");
  });

  it("grants the route to at least one demo profile", () => {
    const granted = cockpitDemoProfiles.filter((profile) =>
      profile.allowedRoutes.some((route) => route === "/agent-operations")
    );

    expect(granted.length).toBeGreaterThan(0);
  });
});
