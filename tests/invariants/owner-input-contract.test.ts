import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("owner input contract", () => {
  it("keeps the release-blocking owner inputs documented without secrets or invented values", () => {
    const doc = readFileSync("docs/sdd-owner-inputs-needed.md", "utf8");

    expect(doc).toContain("run-control-token-budget");
    expect(doc).toContain("run-control-step-budget");
    expect(doc).toContain("run-control-retry-cap");
    expect(doc).toContain("eval-label-manifest");
    expect(doc).toContain("complete-intent-labels");
    expect(doc).toContain("complete-arbitration-labels");
    expect(doc).toContain("decision-confidence-threshold");
    expect(doc).toContain("manifest-defined");
    expect(doc).toContain("Do not paste secrets");
    expect(doc).toContain("Do not include ERP write-back");
    expect(doc).toContain("Do not invent");
    expect(doc).not.toContain("SAP_ODATA_CLIENT_SECRET=");
    expect(doc).not.toMatch(/sk-[A-Za-z0-9]/u);
  });
});
