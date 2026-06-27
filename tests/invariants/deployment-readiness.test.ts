import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
  scripts?: Record<string, string>;
}

interface VercelJson {
  buildCommand?: string;
  env?: unknown;
  framework?: string;
  installCommand?: string;
  outputDirectory?: string;
}

const serverSecretKeys = [
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RECOUP_COCKPIT_AUTH_TOKEN",
  "RECOUP_DEMO_SESSION_SECRET",
  "RECOUP_MCP_AUTH_TOKEN",
  "SAP_ODATA_CLIENT_SECRET"
] as const;

const requiredRenderPromptedEnvKeys = [
  "OPENAI_API_KEY",
  "OPENAI_EVIDENCE_VECTOR_STORE_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RECOUP_COCKPIT_ALLOWED_ORIGINS",
  "RECOUP_COCKPIT_AUTH_TOKEN",
  "RECOUP_DEMO_SESSION_SECRET",
  "RECOUP_MCP_AUTH_TOKEN",
  "SAP_ODATA_BASE_URL",
  "SAP_ODATA_CLIENT_ID",
  "SAP_ODATA_CLIENT",
  "SAP_ODATA_USERID",
  "SAP_ODATA_TOKEN_URL",
  "SAP_ODATA_SCOPE",
  "SAP_ODATA_TENANT",
  "SAP_ODATA_CLIENT_SECRET"
] as const;

const requiredRenderValueEnvKeys = {
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  RECOUP_DATA_MODE: "real-backend",
  RECOUP_MCP_CLIENT_CAPABILITIES: "read",
  RECOUP_MCP_CLIENT_PRINCIPAL: "human:maya-lead",
  RECOUP_MEMORY_BACKEND: "supabase",
  RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records"
} as const;

function readEnvExample(): Map<string, string> {
  return new Map(
    readFileSync(".env.example", "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function readRenderServiceBlock(): string {
  const renderYaml = readFileSync("render.yaml", "utf8");
  const serviceMatches = renderYaml.match(/^\s*-\s+type:\s+web\b[\s\S]*?(?=^\s*-\s+type:|(?![\s\S]))/gmu) ?? [];
  expect(serviceMatches).toHaveLength(1);
  const serviceBlock = serviceMatches[0];
  if (serviceBlock === undefined) {
    throw new Error("render.yaml must define exactly one Render web service.");
  }

  return serviceBlock;
}

function readRenderCronBlock(): string {
  const renderYaml = readFileSync("render.yaml", "utf8");
  const serviceMatches = renderYaml.match(/^\s*-\s+type:\s+cron\b[\s\S]*?(?=^\s*-\s+type:|(?![\s\S]))/gmu) ?? [];
  expect(serviceMatches).toHaveLength(1);
  const serviceBlock = serviceMatches[0];
  if (serviceBlock === undefined) {
    throw new Error("render.yaml must define exactly one Render source-health cron service.");
  }

  return serviceBlock;
}

function readRenderEnvVars(serviceBlock: string): Map<string, string> {
  const envVars = new Map<string, string>();
  let currentKey: string | undefined;
  let currentDeclaration: string[] = [];

  const flushCurrent = (): void => {
    if (currentKey !== undefined) {
      envVars.set(currentKey, currentDeclaration.join("\n"));
    }
  };

  for (const line of serviceBlock.split(/\r?\n/u)) {
    const keyMatch = line.match(/^\s*-\s+key:\s+([A-Z0-9_]+)\s*$/u);
    if (keyMatch !== null) {
      const key = keyMatch[1];
      if (key === undefined) {
        continue;
      }
      flushCurrent();
      currentKey = key;
      currentDeclaration = [];
      continue;
    }

    if (currentKey !== undefined) {
      currentDeclaration.push(line);
    }
  }
  flushCurrent();

  return envVars;
}

describe("deployment readiness scripts", () => {
  it("declares production scripts for the Render API and Vercel cockpit surfaces", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

    expect(packageJson.engines?.node).toBe(">=22 <26");
    expect(packageJson.scripts).toMatchObject({
      build: "npm run build:api && npm run build:cockpit",
      "build:api": "npm run typecheck",
      "build:cockpit": "next build cockpit",
      "refresh:source-health": "tsx scripts/refreshSourceHealthSnapshots.ts",
      start: "npm run start:api",
      "start:api": "tsx src/services/cockpitApi.ts",
      "start:cockpit": "next start cockpit"
    });
  });

  it("keeps the Render API start runner available to production installs", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

    if (packageJson.scripts?.["start:api"] !== "tsx src/services/cockpitApi.ts") {
      return;
    }

    expect(packageJson.dependencies?.tsx).toBeDefined();
    expect(packageJson.devDependencies?.tsx).toBeUndefined();
  });
});

describe("deployment readiness manifests", () => {
  it("defines exactly one native Node Render web service for the API", () => {
    expect(existsSync("render.yaml")).toBe(true);

    const serviceBlock = readRenderServiceBlock();

    expect(serviceBlock).toMatch(/^\s*runtime:\s+node\s*$/mu);
    expect(serviceBlock).toMatch(/^\s*buildCommand:\s+npm ci --include=dev && npm run build:api\s*$/mu);
    expect(serviceBlock).toMatch(/^\s*startCommand:\s+npm run start:api\s*$/mu);
    expect(serviceBlock).toMatch(/^\s*healthCheckPath:\s+\/healthz\s*$/mu);

    const envVars = readRenderEnvVars(serviceBlock);
    expect(envVars.get("NODE_VERSION")).toMatch(/^\s*value:\s+22\s*$/mu);
    expect(envVars.get("PORT")).toMatch(/^\s*value:\s+4317\s*$/mu);
  });

  it("declares required Render runtime env names without committed secret or instance values", () => {
    const renderBlocks = [readRenderServiceBlock(), readRenderCronBlock()];

    for (const renderBlock of renderBlocks) {
      const envVars = readRenderEnvVars(renderBlock);

      for (const envKey of requiredRenderPromptedEnvKeys) {
        const declaration = envVars.get(envKey);
        expect(declaration, `${envKey} must be declared in Render envVars`).toBeDefined();
        expect(declaration).toMatch(/^\s*sync:\s+false\s*$/mu);
        expect(declaration).not.toMatch(/^\s*value:\s*\S+/mu);
      }

      for (const [envKey, expectedValue] of Object.entries(requiredRenderValueEnvKeys)) {
        const declaration = envVars.get(envKey);
        expect(declaration, `${envKey} must be declared in Render envVars`).toBeDefined();
        expect(declaration).toMatch(new RegExp(`^\\s*value:\\s+${expectedValue}\\s*$`, "mu"));
        expect(declaration).not.toMatch(/^\s*sync:\s+false\s*$/mu);
      }
    }
  });

  it("defines a Render cron job that refreshes source-health snapshots before they go stale", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
    const cronBlock = readRenderCronBlock();

    expect(packageJson.scripts?.["refresh:source-health"]).toBe("tsx scripts/refreshSourceHealthSnapshots.ts");
    expect(cronBlock).toMatch(/^\s*name:\s+recoup-source-health-refresh\s*$/mu);
    expect(cronBlock).toMatch(/^\s*runtime:\s+node\s*$/mu);
    expect(cronBlock).toMatch(/^\s*schedule:\s+"(?:\*\/10|0\/10) \* \* \* \*"\s*$/mu);
    expect(cronBlock).toMatch(/^\s*buildCommand:\s+npm ci --include=dev && npm run build:api\s*$/mu);
    expect(cronBlock).toMatch(/^\s*startCommand:\s+npm run refresh:source-health\s*$/mu);
    expect(cronBlock).not.toMatch(/\b(?:RECOUP_API_URL|NEXT_PUBLIC_RECOUP_API_URL)\b/u);
  });

  it("defines the root Vercel cockpit build contract without repo-committed env values", () => {
    expect(existsSync("vercel.json")).toBe(true);

    const vercelRaw = readFileSync("vercel.json", "utf8");
    const vercelJson = JSON.parse(vercelRaw) as VercelJson;
    expect(vercelJson.framework).toBe("nextjs");
    expect(vercelJson.installCommand).toBe("npm ci");
    expect(vercelJson.buildCommand).toBe("npm run build:cockpit");
    expect(vercelJson.outputDirectory).toBe("cockpit/.next");
    expect(Object.prototype.hasOwnProperty.call(vercelJson, "env")).toBe(false);

    for (const secretKey of serverSecretKeys) {
      expect(vercelRaw).not.toContain(secretKey);
    }
  });
});

describe("deployment readiness env example", () => {
  it("documents the API and cockpit deployment env contract without committed secret values", () => {
    const envExample = readEnvExample();

    expect(envExample.get("PORT")).toBe("4317");
    expect(envExample.get("RECOUP_DATA_MODE")).toBe("");
    expect(envExample.get("RECOUP_API_URL")).toBe("");
    expect(envExample.get("NEXT_PUBLIC_RECOUP_API_URL")).toBe("");

    for (const secretKey of serverSecretKeys) {
      expect(envExample.get(secretKey)).toBe("");
      expect(envExample.has(`NEXT_PUBLIC_${secretKey}`)).toBe(false);
    }
  });

  it("keeps cockpit API URL access split between server and browser env names", () => {
    const serverCockpitData = readFileSync("cockpit/app/cockpit-data.ts", "utf8");
    const clientRunStream = readFileSync("cockpit/app/run-stream.tsx", "utf8");

    expect(serverCockpitData).toContain("process.env.RECOUP_API_URL");
    expect(serverCockpitData).not.toContain("NEXT_PUBLIC_RECOUP_API_URL");

    expect(clientRunStream).toContain("process.env.NEXT_PUBLIC_RECOUP_API_URL");
    expect(clientRunStream).not.toContain("process.env.RECOUP_API_URL");
  });
});
