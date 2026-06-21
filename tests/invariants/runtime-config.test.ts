import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadLocalRuntimeEnv,
  loadLocalRuntimeEnvFiles,
  loadRuntimeConfig,
  loadSapODataReadOnlyConnection
} from "../../config/env.js";
import { day1GovernedConfigSeed } from "../../config/governed.js";

describe("runtime credential and expert config gates", () => {
  it("documents local-only credential names without real secrets", () => {
    expect(existsSync(".env.example")).toBe(true);
    const example = readFileSync(".env.example", "utf8");

    expect(example).toContain("OPENAI_API_KEY=");
    expect(example).toContain("SAP_ODATA_BASE_URL=");
    expect(example).toContain("SAP_ODATA_CLIENT_ID=");
    expect(example).toContain("SAP_ODATA_CLIENT_SECRET=");
    expect(example).toContain("SAP_ODATA_CLIENT=");
    expect(example).toContain("SAP_ODATA_USERID=");
    expect(example).toContain("SAP_ODATA_TOKEN_URL=");
    expect(example).toContain("SAP_ODATA_SCOPE=");
    expect(example).toContain("SAP_ODATA_TENANT=");
    expect(example).toContain("RECOUP_MEMORY_BACKEND=");
    expect(example).toContain("RECOUP_MEMORY_DB_PATH=");
    expect(example).toContain("SUPABASE_URL=");
    expect(example).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(example).toContain("RECOUP_SUPABASE_MEMORY_TABLE=");
    expect(example).toContain("RECOUP_COCKPIT_ALLOWED_ORIGINS=");
    expect(example).toContain("RECOUP_COCKPIT_AUTH_TOKEN=");
    expect(example).toContain("RECOUP_COCKPIT_HUMAN_PRINCIPAL=");
    expect(example).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_AUTH_TOKEN=");
    expect(example).not.toContain("NEXT_PUBLIC_RECOUP_COCKPIT_HUMAN_PRINCIPAL=");
    expect(example).toContain("RECOUP_MCP_AUTH_TOKEN=");
    expect(example).toContain("RECOUP_MCP_CLIENT_CAPABILITIES=");
    expect(example).toContain("RECOUP_MCP_CLIENT_PRINCIPAL=");
    expect(example).toContain("MCP_PORT=");
    expect(example).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(example).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./u);
  });

  it("fails closed when runtime credentials are absent while keeping owner-supplied Day-1 tunables available", () => {
    expect(loadRuntimeConfig({})).toMatchObject({
      openai: { configured: false },
      sap: { configured: false },
      memory: { configured: false, mode: "in_memory" },
      expertConstants: {
        configured: true,
        configHash: day1GovernedConfigSeed.configHash,
        configVersion: 1,
        governedConfigRuntime: {
          bootstrapAvailable: true,
          dbBackedLoaderImplemented: true,
          liveDbValidation: "requires-async-recoup-config-loader-readiness-probe"
        },
        missing: [],
        source: "owner-ratified-day-1",
        productionCalibration: {
          configured: false,
          verifyProdCalibration: [
            "arbitration-weights",
            "embeddings-model-id",
            "codex-build-model-id",
            "sap-sandbox-instance",
            "verify-v3-live-non-sap-contracts"
          ]
        }
      }
    });
  });

  it("does not require legacy RECOUP approval flags for supplied Day-1 tunables", () => {
    const config = loadRuntimeConfig({});

    expect(config.expertConstants.governedConfigRuntime).toEqual({
      bootstrapAvailable: true,
      dbBackedLoaderImplemented: true,
      liveDbValidation: "requires-async-recoup-config-loader-readiness-probe"
    });
    expect(config.expertConstants.missing).toEqual([]);
    expect(config.expertConstants.missing).not.toContain("db-backed-governed-config-loader");
    expect(config.expertConstants.supplied).toEqual([
      "arbitration-weights",
      "r-score-weights",
      "r-drift-trigger",
      "gaming-gate",
      "partial-hold",
      "accuracy-bars",
      "seed"
    ]);
    expect(config.expertConstants.productionCalibration.configured).toBe(false);
    expect(config.expertConstants.productionCalibration.verifyProdCalibration).toContain("arbitration-weights");
    expect(config.expertConstants.productionCalibration.verifyProdCalibration).not.toContain(
      "db-backed-governed-config-loader"
    );
    expect(config.expertConstants.productionCalibration.verifyProdCalibration).toContain("embeddings-model-id");
    expect(config.expertConstants.productionCalibration.verifyProdCalibration).toContain("codex-build-model-id");
    expect(config.expertConstants.productionCalibration.verifyProdCalibration).toContain("sap-sandbox-instance");
    expect(config.expertConstants.productionCalibration.verifyProdCalibration).toContain(
      "verify-v3-live-non-sap-contracts"
    );
  });

  it("recognizes configured SAP and OpenAI runtime credentials without exposing secret values", () => {
    const config = loadRuntimeConfig({
      OPENAI_API_KEY: "sk-test-redacted",
      SAP_ODATA_BASE_URL: "https://sap.example.test",
      SAP_ODATA_CLIENT_ID: "client-id",
      SAP_ODATA_CLIENT_SECRET: "client-secret",
      SAP_ODATA_CLIENT: "100",
      SAP_ODATA_TOKEN_URL: "https://sap.example.test/oauth/token",
      SAP_ODATA_SCOPE: "api.sap.read",
      SAP_ODATA_TENANT: "northbay"
    });

    expect(config.openai).toEqual({ configured: true, redactedApiKey: "sk-...cted" });
    expect(config.sap).toMatchObject({
      baseUrl: "https://sap.example.test",
      configured: true,
      sapClient: "100",
      tenant: "northbay"
    });
    expect(JSON.stringify(config)).not.toContain("client-secret");
  });

  it("loads secret-bearing SAP read-only connection separately from JSON-safe runtime config", () => {
    const env = {
      SAP_ODATA_BASE_URL: "https://sap.example.test",
      SAP_ODATA_CLIENT_ID: "client-id",
      SAP_ODATA_CLIENT_SECRET: "client-secret",
      SAP_ODATA_CLIENT: "100",
      SAP_ODATA_TOKEN_URL: "https://sap.example.test/oauth/token",
      SAP_ODATA_SCOPE: "api.sap.read",
      SAP_ODATA_TENANT: "northbay"
    };

    expect(loadRuntimeConfig(env).sap).toMatchObject({
      baseUrl: "https://sap.example.test",
      configured: true,
      sapClient: "100",
      tenant: "northbay"
    });
    expect(JSON.stringify(loadRuntimeConfig(env))).not.toContain("client-secret");
    expect(loadSapODataReadOnlyConnection(env)).toEqual({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    expect(loadSapODataReadOnlyConnection({})).toBeUndefined();
  });

  it("supports read-only SAP Basic auth without scope or tenant when the Gateway endpoint does not require OAuth", () => {
    const env = {
      SAP_ODATA_BASE_URL: "https://sap.example.test:44300",
      SAP_ODATA_CLIENT: "100",
      SAP_ODATA_CLIENT_SECRET: "sap-password",
      SAP_ODATA_USERID: "sap-user"
    };

    expect(loadRuntimeConfig(env).sap).toMatchObject({
      authMode: "basic",
      baseUrl: "https://sap.example.test:44300",
      configured: true
    });
    expect(JSON.stringify(loadRuntimeConfig(env))).not.toContain("sap-password");
    expect(loadSapODataReadOnlyConnection(env)).toMatchObject({
      authMode: "basic",
      baseUrl: "https://sap.example.test:44300",
      clientSecret: "sap-password",
      sapClient: "100",
      userId: "sap-user"
    });
  });

  it("recognizes a configured SQLite memory path without exposing unrelated secrets", () => {
    const config = loadRuntimeConfig({
      OPENAI_API_KEY: "sk-test-redacted",
      RECOUP_MEMORY_DB_PATH: "C:/tmp/recoup-memory.sqlite"
    });

    expect(config.memory).toEqual({
      configured: true,
      dbPath: "C:/tmp/recoup-memory.sqlite",
      mode: "sqlite"
    });
    expect(JSON.stringify(config)).not.toContain("sk-test-redacted");
  });

  it("recognizes configured Supabase memory without exposing the service role key", () => {
    const config = loadRuntimeConfig({
      RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
      SUPABASE_URL: "https://recoup.supabase.co"
    });

    expect(config.memory).toEqual({
      configured: true,
      mode: "supabase",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });
    expect(JSON.stringify(config)).not.toContain("supabase-service-secret");
  });

  it("prefers Supabase memory over SQLite when shared database credentials are available", () => {
    const config = loadRuntimeConfig({
      RECOUP_MEMORY_DB_PATH: "C:/tmp/recoup-memory.sqlite",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
      SUPABASE_URL: "https://recoup.supabase.co"
    });

    expect(config.memory).toEqual({
      configured: true,
      mode: "supabase",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });
  });

  it("loads local env files without overriding existing shell values or leaking secrets through config", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-local-env-"));
    const envPath = join(dir, ".env");

    try {
      writeFileSync(
        envPath,
        [
          "# local development secrets",
          "OPENAI_API_KEY=sk-file-secret",
          "SAP_ODATA_BASE_URL=https://sap.example.test",
          "SAP_ODATA_CLIENT_ID='client-id'",
          "SAP_ODATA_CLIENT_SECRET=\"client-secret\"",
          "SAP_ODATA_CLIENT=100",
          "SAP_ODATA_TOKEN_URL=https://sap.example.test/oauth/token",
          "SAP_ODATA_SCOPE=api.sap.read",
          "SAP_ODATA_TENANT=northbay",
          "RECOUP_MEMORY_DB_PATH=C:/tmp/recoup memory.sqlite",
          "MCP_PORT=4319"
        ].join("\n")
      );

      const env = loadLocalRuntimeEnv(envPath, { OPENAI_API_KEY: "sk-shell-secret" });

      expect(env.OPENAI_API_KEY).toBe("sk-shell-secret");
      expect(env.SAP_ODATA_CLIENT_ID).toBe("client-id");
      expect(env.SAP_ODATA_CLIENT_SECRET).toBe("client-secret");
      expect(env.SAP_ODATA_CLIENT).toBe("100");
      expect(env.MCP_PORT).toBe("4319");
      expect(loadRuntimeConfig(env)).toMatchObject({
        memory: { configured: true, dbPath: "C:/tmp/recoup memory.sqlite", mode: "sqlite" },
        openai: { configured: true, redactedApiKey: "sk-...cret" },
        sap: { configured: true, tenant: "northbay" }
      });
      expect(JSON.stringify(loadRuntimeConfig(env))).not.toContain("client-secret");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads UTF-8 BOM local env files without dropping the first credential", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-bom-local-env-"));
    const envPath = join(dir, ".env.local");

    try {
      writeFileSync(
        envPath,
        [
          "\uFEFFOPENAI_API_KEY=sk-bom-secret",
          "RECOUP_COCKPIT_AUTH_TOKEN=test-human-token",
          "RECOUP_COCKPIT_HUMAN_PRINCIPAL=human:maya-lead"
        ].join("\n")
      );

      const env = loadLocalRuntimeEnv(envPath, {});

      expect(env.OPENAI_API_KEY).toBe("sk-bom-secret");
      expect(loadRuntimeConfig(env).openai).toEqual({ configured: true, redactedApiKey: "sk-...cret" });
      expect(JSON.stringify(loadRuntimeConfig(env))).not.toContain("sk-bom-secret");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads layered local env files for desktop runtime without exposing secret values", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-layered-local-env-"));
    const basePath = join(dir, ".env");
    const localPath = join(dir, ".env.local");

    try {
      writeFileSync(
        basePath,
        [
          "OPENAI_API_KEY=sk-base-secret",
          "SAP_ODATA_BASE_URL=https://sap-base.example.test",
          "SAP_ODATA_CLIENT_ID=base-client",
          "SAP_ODATA_CLIENT_SECRET=base-secret",
          "SAP_ODATA_CLIENT=100",
          "SAP_ODATA_TOKEN_URL=https://sap-base.example.test/oauth/token",
          "SAP_ODATA_SCOPE=base.scope",
          "SAP_ODATA_TENANT=base"
        ].join("\n")
      );
      writeFileSync(
        localPath,
        [
          "OPENAI_API_KEY=sk-local-secret",
          "SAP_ODATA_BASE_URL=https://sap-local.example.test",
          "SAP_ODATA_CLIENT_ID=local-client",
          "SAP_ODATA_CLIENT_SECRET=local-secret",
          "SAP_ODATA_CLIENT=200",
          "SAP_ODATA_TOKEN_URL=https://sap-local.example.test/oauth/token",
          "SAP_ODATA_SCOPE=local.scope",
          "SAP_ODATA_TENANT=local"
        ].join("\n")
      );

      const env = loadLocalRuntimeEnvFiles([basePath, localPath], { OPENAI_API_KEY: "sk-shell-secret" });
      const config = loadRuntimeConfig(env);

      expect(env.OPENAI_API_KEY).toBe("sk-shell-secret");
      expect(env.SAP_ODATA_BASE_URL).toBe("https://sap-local.example.test");
      expect(env.SAP_ODATA_CLIENT_ID).toBe("local-client");
      expect(env.SAP_ODATA_CLIENT_SECRET).toBe("local-secret");
      expect(env.SAP_ODATA_CLIENT).toBe("200");
      expect(config).toMatchObject({
        openai: { configured: true, redactedApiKey: "sk-...cret" },
        sap: { configured: true, baseUrl: "https://sap-local.example.test", sapClient: "200", tenant: "local" }
      });
      expect(JSON.stringify(config)).not.toContain("local-secret");
      expect(JSON.stringify(config)).not.toContain("sk-shell-secret");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats blank example placeholders as unset runtime values", () => {
    const env = loadLocalRuntimeEnv(".env.example", {});

    expect(loadRuntimeConfig(env)).toMatchObject({
      memory: { configured: false, mode: "in_memory" },
      openai: { configured: false },
      sap: { configured: false }
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SAP_ODATA_BASE_URL).toBeUndefined();
    expect(env.RECOUP_MEMORY_DB_PATH).toBeUndefined();
    expect(env.RECOUP_COCKPIT_AUTH_TOKEN).toBeUndefined();
    expect(env.RECOUP_MCP_AUTH_TOKEN).toBeUndefined();
    expect(env.RECOUP_MCP_CLIENT_CAPABILITIES).toBeUndefined();
    expect(env.MCP_PORT).toBeUndefined();
  });
});
