import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("core memory-input boundary", () => {
  it("keeps src/core computations independent from runtime memory stores and schemas", () => {
    for (const filePath of listTypeScriptFiles("src/core")) {
      const source = readFileSync(filePath, "utf8");

      expect(source, filePath).not.toMatch(/from\s+["'][^"']*\/memory(?:\/|["'])/iu);
      expect(source, filePath).not.toContain("src/memory");
      expect(source, filePath).not.toContain("recoup_memory_records");
      expect(source, filePath).not.toContain("buildSupabaseMemorySchemaSql");
      expect(source, filePath).not.toContain("createSupabaseMemoryRepository");
    }
  });
});

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listTypeScriptFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}
