import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const skillPaths = [
  "skills/recoup-evidence-pack/SKILL.md",
  "skills/recoup-recovery-drafting/SKILL.md",
  "skills/recoup-risk-arbitration/SKILL.md",
  "skills/recoup-query-answering/SKILL.md",
  "skills/sap-odata-access/SKILL.md"
];

describe("agent skills contract", () => {
  it("ships reviewed Markdown-only Recoup skills", () => {
    for (const path of skillPaths) {
      expect(existsSync(path)).toBe(true);
      const body = readFileSync(path, "utf8");
      expect(body).toContain("---");
      expect(body).toContain("description:");
      expect(body).toContain("## When To Use");
      expect(body).toContain("## Validation");
      expect(body).not.toContain("compute dollar");
      expect(body).not.toContain("write back to ERP");
    }
  });
});
