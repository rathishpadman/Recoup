import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("core config purity", () => {
  it("keeps src/core from reading governed config through DB or memory loaders while allowing config-as-code imports", () => {
    for (const filePath of listTypeScriptFiles("src/core")) {
      const source = readFileSync(filePath, "utf8");

      expect(source, filePath).not.toMatch(/recoup_config/iu);
      expect(source, filePath).not.toMatch(/supabase|Supabase/iu);
      expect(source, filePath).not.toMatch(/supabaseStore|MemoryRepository|ConfigRepository/iu);
      expect(source, filePath).not.toMatch(/from\s+["'][^"']*(?:memory|db|database|repository)[^"']*["']/iu);
    }
  });
});

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listTypeScriptFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}
