import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export type DemoRuntimeEnv = Partial<Record<string, string | undefined>>;

export function loadDemoRuntimeEnv(baseEnv: DemoRuntimeEnv = process.env): DemoRuntimeEnv {
  const fileEnv = [".env", ".env.local", "env.local"].reduce<DemoRuntimeEnv>((merged, filePath) => {
    if (!existsSync(filePath)) {
      return merged;
    }

    const parsed = parseEnv(readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined && value.trim().length > 0) {
        merged[key] = value;
      }
    }

    return merged;
  }, {});

  return { ...fileEnv, ...baseEnv };
}
