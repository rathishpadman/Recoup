import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("S5 cockpit business-logic boundary", () => {
  it("keeps the Next cockpit surface free of core rule and Decimal imports", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");

    expect(page).not.toContain("decimal.js");
    expect(page).not.toContain("../../src/services");
    expect(page).not.toContain("src/core");
    expect(page).not.toContain("evaluateRule");
    expect(page).not.toContain("runForensicsInvestigation");
  });

  it("loads cockpit data through REST and SSE API boundaries", () => {
    const page = readFileSync("cockpit/app/page.tsx", "utf8");
    const stream = readFileSync("cockpit/app/run-stream.tsx", "utf8");

    expect(page).toContain("/forensics");
    expect(stream).toContain("EventSource");
    expect(stream).toContain("/run");
  });

  it("keeps cockpit money display away from JS number conversion", () => {
    const model = readFileSync("src/services/cockpitModel.ts", "utf8");

    expect(model).not.toContain(".toNumber(");
  });

  it("wires approval controls to the cockpit REST endpoint", () => {
    const controls = readFileSync("cockpit/app/approval-controls.tsx", "utf8");

    expect(controls).toContain('"use client"');
    expect(controls).toContain("/approval");
    expect(controls).toContain("approve");
    expect(controls).toContain("modify");
    expect(controls).toContain("reject");
  });
});
