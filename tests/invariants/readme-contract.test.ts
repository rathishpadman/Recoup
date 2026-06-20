import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("judge README contract", () => {
  it("keeps a root README with problem, OpenAI usage, traceability, setup, and open items", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("# Recoup");
    expect(readme).toContain("NorthBay");
    expect(readme).toContain("How It Works");
    expect(readme).toContain("How OpenAI Is Used");
    expect(readme).toContain("Claim To Code To Test");
    expect(readme).toContain("Memory And Compaction");
    expect(readme).toContain("Agent Skills");
    expect(readme).toContain("Agent-To-Agent Communication");
    expect(readme).toContain("Tool Permissions");
    expect(readme).toContain("Independent Multi-Agent Audit Evidence");
    expect(readme).toContain("docs/independent-audit-log.md");
    expect(readme).toContain("What Is Still Deferred");
    expect(readme).toContain("Run Locally");
    expect(readme).toContain("Open Items");
    expect(readme).toContain("npm.cmd run verify");
  });
});
