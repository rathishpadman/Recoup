import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { runtimeModelSettings, runtimeModels } from "../../config/models.js";

describe("runtime model config", () => {
  it("uses only pinned runtime model identifiers", () => {
    expect(runtimeModels).toEqual({
      reasoning: "gpt-5.5",
      fast: "gpt-5.4",
      fastMini: "gpt-5.4-mini",
      fastNano: "gpt-5.4-nano",
      realtime: "gpt-realtime-2"
    });
  });

  it("pins explicit model settings for reproducible reasoning effort", () => {
    expect(runtimeModelSettings).toEqual({
      forensicsInvestigator: { reasoning: { effort: "high" }, text: { verbosity: "low" } },
      riskMeshSupervisor: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
      recoveryDrafter: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
      sentinel: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
      containmentIntent: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
      conversationalQuery: {}
    });
  });

  it("routes OpenAI Agents SDK imports through the tracing-safe local wrapper", () => {
    const allowedWrapperPath = "src/agents/openAiAgentsSdk.ts";
    const sdkPackageName = "@openai/" + "agents";
    const directImportPattern = new RegExp(
      `(?:from\\s+["']${escapeRegExp(sdkPackageName)}["']|import\\s*\\(\\s*["']${escapeRegExp(sdkPackageName)}["']\\s*\\))`
    );
    const filesWithDirectImports = listTypeScriptFiles(readTypeScriptRootsFromTsconfig())
      .filter((filePath) => normalizeProjectPath(filePath) !== allowedWrapperPath)
      .filter((filePath) => directImportPattern.test(readFileSync(filePath, "utf8")))
      .map(normalizeProjectPath);

    expect(filesWithDirectImports).toEqual([]);
  });

  it("keeps SDK trace export disabled when OPENAI_API_KEY is absent", () => {
    const script = [
      "delete process.env.OPENAI_API_KEY;",
      'const { getGlobalTraceProvider, withTrace } = await import("./src/agents/openAiAgentsSdk.ts");',
      'await withTrace("recoup-tracing-warning-regression", async (trace) => {',
      "  await trace.start();",
      "  await trace.end();",
      "});",
      "await getGlobalTraceProvider().forceFlush();"
    ].join("\n");
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAI_API_KEY: ""
      }
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(output).not.toContain("No API key provided for OpenAI tracing exporter");
    expect(result.status).toBe(0);
  });
});

interface TsconfigJson {
  include?: string[];
}

function readTypeScriptRootsFromTsconfig(): string[] {
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as TsconfigJson;
  const roots = new Set<string>();
  for (const includePattern of tsconfig.include ?? []) {
    const [rootDirectory] = includePattern.split("/");
    if (rootDirectory !== undefined && rootDirectory.length > 0) {
      roots.add(rootDirectory);
    }
  }

  return Array.from(roots);
}

function listTypeScriptFiles(rootDirectories: readonly string[]): string[] {
  return rootDirectories.flatMap((rootDirectory) => listTypeScriptFilesInDirectory(rootDirectory));
}

function listTypeScriptFilesInDirectory(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFilesInDirectory(entryPath);
    }

    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

function normalizeProjectPath(filePath: string): string {
  return relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
