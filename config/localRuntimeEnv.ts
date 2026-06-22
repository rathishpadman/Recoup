import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export type RuntimeEnv = Partial<Record<string, string | undefined>>;

export function loadLocalRuntimeEnv(filePath = ".env", baseEnv: RuntimeEnv = process.env): RuntimeEnv {
  return loadLocalRuntimeEnvFiles([filePath], baseEnv);
}

export function loadLocalRuntimeEnvFiles(
  filePaths: readonly string[] = [".env", ".env.local", "env.local"],
  baseEnv: RuntimeEnv = process.env
): RuntimeEnv {
  const merged: RuntimeEnv = {};

  for (const filePath of filePaths) {
    Object.assign(merged, parseLocalRuntimeEnvFile(filePath));
  }

  return mergeRuntimeEnvWithShell(merged, baseEnv);
}

function parseLocalRuntimeEnvFile(filePath: string): RuntimeEnv {
  if (!existsSync(filePath)) {
    return {};
  }

  const body = stripUtf8Bom(readFileSync(filePath, "utf8"));
  const parsed = parseEnv(body);
  const env: RuntimeEnv = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (isConfiguredRuntimeValue(value)) {
      env[key] = value;
    }
  }

  return env;
}

function mergeRuntimeEnvWithShell(fileEnv: RuntimeEnv, baseEnv: RuntimeEnv): RuntimeEnv {
  const merged: RuntimeEnv = { ...fileEnv };

  for (const [key, value] of Object.entries(baseEnv)) {
    if (isConfiguredRuntimeValue(value)) {
      merged[key] = value;
    }
  }

  return merged;
}

function stripUtf8Bom(body: string): string {
  return body.startsWith("\uFEFF") ? body.slice(1) : body;
}

function isConfiguredRuntimeValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
