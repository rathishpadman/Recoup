import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-prod public smoke script", () => {
  it("keeps David Signals In expanded in the production smoke expectations", () => {
    const source = readFileSync("scripts/runPostProdPublicSmoke.ts", "utf8");

    expect(source).toContain('assertDavidDrawerOpen(page, "david-signals-in")');
    expect(source).not.toContain('"david-assessment-timeline", "david-signals-in", "david-verdict-banner"');
  });

  it("fails the production smoke when warmed /credit load exceeds the slow-load budget", () => {
    const source = readFileSync("scripts/runPostProdPublicSmoke.ts", "utf8");

    expect(source).toContain("RECOUP_POST_PROD_CREDIT_WARM_LOAD_BUDGET_MS");
    expect(source).toContain("measureCreditWarmLoad");
    expect(source).toContain("Public /credit warmed load");
    expect(source).toContain("troubleshoot David /credit slow loading");
  });
});
