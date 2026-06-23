import { z } from "zod";
import type { RuntimeEnv } from "./localRuntimeEnv.ts";
export { loadLocalRuntimeEnv, loadLocalRuntimeEnvFiles } from "./localRuntimeEnv.ts";
export type { RuntimeEnv } from "./localRuntimeEnv.ts";

const RuntimeEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_EVIDENCE_VECTOR_STORE_ID: z.string().min(1).optional(),
  SAP_ODATA_BASE_URL: z.string().url().optional(),
  SAP_ODATA_CLIENT: z.string().min(1).optional(),
  SAP_ODATA_CLIENT_ID: z.string().min(1).optional(),
  SAP_ODATA_CLIENT_SECRET: z.string().min(1).optional(),
  SAP_ODATA_USERID: z.string().min(1).optional(),
  SAP_ODATA_TOKEN_URL: z.string().url().optional(),
  SAP_ODATA_SCOPE: z.string().min(1).optional(),
  SAP_ODATA_TENANT: z.string().min(1).optional(),
  RECOUP_MEMORY_BACKEND: z.enum(["in_memory", "sqlite", "supabase"]).optional(),
  RECOUP_MEMORY_DB_PATH: z.string().min(1).optional(),
  RECOUP_SUPABASE_MEMORY_TABLE: z.string().min(1).optional(),
  RECOUP_COCKPIT_ALLOWED_ORIGINS: z.string().min(1).optional(),
  RECOUP_COCKPIT_AUTH_TOKEN: z.string().min(1).optional(),
  RECOUP_DEMO_SESSION_SECRET: z.string().min(1).optional(),
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: z.string().startsWith("human:").optional(),
  RECOUP_MCP_AUTH_TOKEN: z.string().min(1).optional(),
  RECOUP_MCP_CLIENT_CAPABILITIES: z.string().min(1).optional(),
  RECOUP_MCP_CLIENT_PRINCIPAL: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional()
});
type ParsedRuntimeEnv = z.infer<typeof RuntimeEnvSchema>;

export interface RuntimeConfig {
  openai: {
    configured: boolean;
    fileSearch:
      | {
          configured: false;
          reason: string;
        }
      | {
          configured: true;
          redactedVectorStoreId: string;
        };
    redactedApiKey?: string;
  };
  sap: {
    authMode?: "basic" | "oauth";
    configured: boolean;
    baseUrl?: string;
    sapClient?: string;
    tenant?: string;
    tokenUrl?: string;
    scope?: string;
  };
  memory:
    | {
        configured: false;
        mode: "in_memory";
      }
    | {
        configured: true;
        dbPath: string;
        mode: "sqlite";
      }
    | {
        configured: true;
        mode: "supabase";
        tableName: string;
        url: string;
      };
  expertConstants: {
    configured: boolean;
    configHash?: string;
    configVersion?: 1;
    governedConfigRuntime: {
      bootstrapAvailable: boolean;
      dbBackedLoaderImplemented: boolean;
      liveDbValidation:
        | "blocked-missing-supabase-recoup-config-credentials"
        | "requires-async-recoup-config-loader-readiness-probe";
    };
    missing: string[];
    productionCalibration: {
      configured: boolean;
      verifyProdCalibration: string[];
    };
    source: "supabase-recoup-config";
    supplied: string[];
  };
}

export interface SapODataReadOnlyConnection {
  authMode?: "basic" | "oauth";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  sapClient: string;
  scope: string;
  tenant: string;
  tokenUrl: string;
  userId?: string;
}

export function loadRuntimeConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  const parsed = RuntimeEnvSchema.parse(env);
  const sapConfigured = isSapBasicConfigured(parsed) || isSapOAuthConfigured(parsed);

  return {
    openai: buildOpenAiConfig(parsed),
    sap: sapConfigured
      ? buildConfiguredSap(parsed)
      : { configured: false },
    memory: buildMemoryConfig(parsed),
    expertConstants: buildExpertConstantsConfig(parsed)
  };
}

function buildExpertConstantsConfig(parsed: ParsedRuntimeEnv): RuntimeConfig["expertConstants"] {
  const hasSupabaseGovernedConfigCredentials =
    parsed.SUPABASE_URL !== undefined && parsed.SUPABASE_SERVICE_ROLE_KEY !== undefined;

  return {
    configured: hasSupabaseGovernedConfigCredentials,
    governedConfigRuntime: {
      bootstrapAvailable: false,
      dbBackedLoaderImplemented: true,
      liveDbValidation: hasSupabaseGovernedConfigCredentials
        ? "requires-async-recoup-config-loader-readiness-probe"
        : "blocked-missing-supabase-recoup-config-credentials"
    },
    missing: hasSupabaseGovernedConfigCredentials
      ? ["recoup_config-live-validation"]
      : ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "recoup_config-live-validation"],
    productionCalibration: {
      configured: false,
      verifyProdCalibration: [
        "arbitration-weights",
        "embeddings-model-id",
        "codex-build-model-id",
        "sap-sandbox-instance",
        "verify-v3-live-non-sap-contracts"
      ]
    },
    source: "supabase-recoup-config",
    supplied: hasSupabaseGovernedConfigCredentials ? ["supabase-recoup-config-credentials"] : []
  };
}

function buildOpenAiConfig(parsed: ParsedRuntimeEnv): RuntimeConfig["openai"] {
  const apiKey = parsed.OPENAI_API_KEY;
  const vectorStoreId = parsed.OPENAI_EVIDENCE_VECTOR_STORE_ID;

  if (apiKey === undefined) {
    return {
      configured: false,
      fileSearch: {
        configured: false,
        reason: "OPENAI_API_KEY and OPENAI_EVIDENCE_VECTOR_STORE_ID are required for live evidence vector-store search."
      }
    };
  }

  if (vectorStoreId === undefined) {
    return {
      configured: true,
      fileSearch: {
        configured: false,
        reason: "OPENAI_EVIDENCE_VECTOR_STORE_ID is required for live evidence vector-store search."
      },
      redactedApiKey: redactSecret(apiKey)
    };
  }

  return {
    configured: true,
    fileSearch: {
      configured: true,
      redactedVectorStoreId: redactSecret(vectorStoreId)
    },
    redactedApiKey: redactSecret(apiKey)
  };
}

function buildMemoryConfig(parsed: ParsedRuntimeEnv): RuntimeConfig["memory"] {
  if (parsed.RECOUP_MEMORY_BACKEND === "supabase") {
    if (parsed.SUPABASE_URL === undefined || parsed.SUPABASE_SERVICE_ROLE_KEY === undefined) {
      return { configured: false, mode: "in_memory" };
    }

    return {
      configured: true,
      mode: "supabase",
      tableName: parsed.RECOUP_SUPABASE_MEMORY_TABLE ?? "recoup_memory_records",
      url: parsed.SUPABASE_URL
    };
  }

  if (parsed.RECOUP_MEMORY_DB_PATH !== undefined) {
    return {
      configured: true,
      dbPath: parsed.RECOUP_MEMORY_DB_PATH,
      mode: "sqlite"
    };
  }

  return { configured: false, mode: "in_memory" };
}

export function loadSapODataReadOnlyConnection(env: RuntimeEnv = process.env): SapODataReadOnlyConnection | undefined {
  const config = loadRuntimeConfig(env);
  if (!config.sap.configured) {
    return undefined;
  }

  const clientSecret = env.SAP_ODATA_CLIENT_SECRET;
  const baseUrl = env.SAP_ODATA_BASE_URL;
  const sapClient = config.sap.sapClient;
  if (baseUrl === undefined || clientSecret === undefined || sapClient === undefined) {
    throw new Error("SAP runtime config was marked configured without client credentials.");
  }

  const userId = env.SAP_ODATA_USERID;
  if (config.sap.authMode === "basic") {
    if (userId === undefined) {
      throw new Error("SAP runtime config was marked configured without a Basic auth user id.");
    }

    return {
      authMode: "basic",
      baseUrl,
      clientId: "",
      clientSecret,
      sapClient,
      scope: "",
      tenant: env.SAP_ODATA_TENANT ?? "",
      tokenUrl: "",
      userId
    };
  }

  const clientId = env.SAP_ODATA_CLIENT_ID;
  const tokenUrl = env.SAP_ODATA_TOKEN_URL;
  if (clientId === undefined || tokenUrl === undefined) {
    throw new Error("SAP runtime config was marked configured without OAuth client credentials.");
  }

  return {
    baseUrl,
    clientId,
    clientSecret,
    sapClient,
    scope: env.SAP_ODATA_SCOPE ?? "",
    tenant: env.SAP_ODATA_TENANT ?? "",
    tokenUrl
  };
}

function buildConfiguredSap(parsed: ParsedRuntimeEnv): RuntimeConfig["sap"] {
  const baseUrl = parsed.SAP_ODATA_BASE_URL;
  const sapClient = readSapClient(parsed);

  if (baseUrl === undefined || sapClient === undefined) {
    throw new Error("SAP runtime config was marked configured without the required read credentials.");
  }

  if (isSapBasicConfigured(parsed)) {
    return {
      authMode: "basic",
      configured: true,
      baseUrl,
      sapClient
    };
  }

  if (isSapOAuthConfigured(parsed)) {
    const sap: RuntimeConfig["sap"] = {
      authMode: "oauth",
      configured: true,
      baseUrl,
      sapClient
    };
    if (parsed.SAP_ODATA_TENANT !== undefined) {
      sap.tenant = parsed.SAP_ODATA_TENANT;
    }
    if (parsed.SAP_ODATA_TOKEN_URL !== undefined) {
      sap.tokenUrl = parsed.SAP_ODATA_TOKEN_URL;
    }
    if (parsed.SAP_ODATA_SCOPE !== undefined) {
      sap.scope = parsed.SAP_ODATA_SCOPE;
    }

    return sap;
  }

  throw new Error("SAP runtime config was marked configured without the required read credentials.");
}

function isSapBasicConfigured(parsed: ParsedRuntimeEnv): boolean {
  return (
    parsed.SAP_ODATA_BASE_URL !== undefined &&
    readSapClient(parsed) !== undefined &&
    parsed.SAP_ODATA_CLIENT_SECRET !== undefined &&
    parsed.SAP_ODATA_USERID !== undefined
  );
}

function isSapOAuthConfigured(parsed: ParsedRuntimeEnv): boolean {
  return (
    parsed.SAP_ODATA_BASE_URL !== undefined &&
    readSapClient(parsed) !== undefined &&
    parsed.SAP_ODATA_CLIENT_ID !== undefined &&
    parsed.SAP_ODATA_CLIENT_SECRET !== undefined &&
    parsed.SAP_ODATA_TOKEN_URL !== undefined
  );
}

function readSapClient(parsed: ParsedRuntimeEnv): string | undefined {
  return parsed.SAP_ODATA_CLIENT ?? sapClientAliasFromClientId(parsed.SAP_ODATA_CLIENT_ID);
}

function sapClientAliasFromClientId(clientId: string | undefined): string | undefined {
  if (clientId === undefined) {
    return undefined;
  }

  return /^\d{3}$/u.test(clientId) ? clientId : undefined;
}

function redactSecret(secret: string): string {
  if (secret.length <= 8) {
    return "***";
  }

  return `${secret.slice(0, 3)}...${secret.slice(-4)}`;
}

