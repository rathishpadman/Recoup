import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackageJson {
  scripts?: Record<string, string>;
}

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as PackageJson;

describe("release readiness verify gate", () => {
  it("wires the release-readiness report into npm verify", () => {
    expect(packageJson.scripts?.["verify:release"]).toBe("tsx evals/releaseReadinessCli.ts");
    expect(packageJson.scripts?.verify).toContain("npm run verify:release");
    expect(packageJson.scripts?.verify).toMatch(/npm run depcruise && npm run verify:release/);
  });
});
