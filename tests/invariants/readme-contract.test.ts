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
    expect(readme).toContain("Maya Patel");
    expect(readme).toContain("David Kim");
    expect(readme).toContain("two-persona demo");
    expect(readme).toContain("Realtime query");
    expect(readme).toContain("read-only executive close");
    expect(readme).toContain("owner-ratified Day-1 tunables");
    expect(readme).toContain("governed config loader");
    expect(readme).toContain("synthetic Supabase static tables");
    expect(readme).toContain("VERIFY-PROD calibration");
    expect(readme).toContain("embeddings model id");
    expect(readme).toContain("Codex build-model id");
    expect(readme).toContain("SAP sandbox instance");
    expect(readme).toContain("VERIFY-V3 live non-SAP contracts");
    expect(readme).toContain("What Is Still Deferred");
    expect(readme).toContain("Run Locally");
    expect(readme).toContain("Open Items");
    expect(readme).toContain("npm.cmd run verify");
  });

  it("keeps the VS Code handoff verification evidence aligned with the final proof pack", () => {
    const handoff = readFileSync("docs/vscode-handoff-status.md", "utf8");

    expect(handoff).toContain("Vitest passed: `66` test files, `349` tests.");
    expect(handoff).not.toContain("Vitest passed: `61` test files, `304` tests.");
    expect(handoff).not.toContain("Vitest passed: `53` test files, `251` tests.");
  });
});
