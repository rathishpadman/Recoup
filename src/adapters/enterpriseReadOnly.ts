import { z } from "zod";
import type { DeductionLine } from "../types/entities.js";

export const EnterpriseConnectorNameSchema = z.enum(["bureau", "docs-repo", "edi-remittance", "remittance", "tpm"]);
export const RecordIdSourceSchema = z.enum(["customerId", "lineId", "recordIds"]);
export const SUPABASE_SYNTHETIC_SOURCE_CREDENTIAL_ENV_NAMES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
export const SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR = {
  bureau: "recoup_src_bureau",
  "docs-repo": "recoup_src_docs",
  "edi-remittance": "recoup_src_remittance",
  remittance: "recoup_src_remittance",
  tpm: "recoup_src_tpm"
} as const;

const CanonicalEvidenceMappingSchema = z.object({
  documentIdField: z.string().min(1),
  documentTypeField: z.string().min(1),
  recordIdsField: z.string().min(1),
  summaryField: z.string().min(1)
});

const SourceContractBaseSchema = z.object({
  allowedRecordPrefixes: z.array(z.string().min(1)).min(1),
  baseUrl: z.string().url().refine(hasNoSecretBearingUrlParts, {
    message: "baseUrl must not include credentials, query strings, or fragments"
  }),
  canonicalEvidenceMapping: CanonicalEvidenceMappingSchema,
  credentialEnvNames: z.array(z.string().min(1)).default([]),
  evidenceTypes: z.array(z.string().min(1)).min(1),
  readPathTemplate: z.string().min(1).refine((value) => value.includes("{recordId}"), {
    message: "readPathTemplate must include {recordId}"
  }),
  recordIdSources: z.array(RecordIdSourceSchema).min(1)
});

export function createEnterpriseSourceContractSchema<TConnectorName extends EnterpriseConnectorName>(connectorName: TConnectorName) {
  return SourceContractBaseSchema.extend({
    connectorName: z.literal(connectorName)
  }) as z.ZodType<EnterpriseSourceContract & { connectorName: TConnectorName }>;
}

export type EnterpriseConnectorName = z.infer<typeof EnterpriseConnectorNameSchema>;
export type RecordIdSource = z.infer<typeof RecordIdSourceSchema>;

export interface EnterpriseSourceContract {
  allowedRecordPrefixes: string[];
  baseUrl: string;
  canonicalEvidenceMapping: CanonicalEvidenceMapping;
  connectorName: EnterpriseConnectorName;
  credentialEnvNames: string[];
  evidenceTypes: string[];
  readPathTemplate: string;
  recordIdSources: RecordIdSource[];
}

export type CanonicalEvidenceMapping = z.infer<typeof CanonicalEvidenceMappingSchema>;

export interface EnterpriseReadRequest {
  canonicalEvidenceMapping: CanonicalEvidenceMapping;
  connectorName: EnterpriseConnectorName;
  evidenceTypes: string[];
  method: "GET";
  recordIds: string[];
  url: string;
}

export type EnterpriseReadRequestPlan =
  | {
      configured: false;
      reason: string;
      requests: [];
    }
  | {
      configured: true;
      connectorName: EnterpriseConnectorName;
      requests: EnterpriseReadRequest[];
    };

export type EnterpriseConnectorReadiness =
  | {
      configured: false;
      mode: "schema-required";
      reason: string;
    }
  | {
      baseUrl: string;
      configured: true;
      connectorName: EnterpriseConnectorName;
      mode: "read-only-source-contract";
    }
  | {
      configured: false;
      connectorName: EnterpriseConnectorName;
      liveContractStatus: "deferred_verify_v3";
      missingCredentialEnvNames: string[];
      mode: "synthetic-static-table-credentials-required";
      reason: string;
      sourceTableName: string;
    }
  | {
      configured: true;
      connectorName: EnterpriseConnectorName;
      liveContractStatus: "deferred_verify_v3";
      mode: "synthetic-static-table";
      sourceTableName: string;
    }
  | {
      configured: false;
      connectorName: EnterpriseConnectorName;
      liveContractStatus: "deferred_verify_v3";
      missingCredentialEnvNames: [];
      mode: "synthetic-static-table-schema-required";
      reason: string;
      sourceTableName: string;
    };

export function describeEnterpriseConnectorReadiness(
  contract: EnterpriseSourceContract | undefined,
  displayName: string,
  availableCredentialEnvNames: readonly string[] = [],
  syntheticSource?: {
    connectorName: EnterpriseConnectorName;
    sourceTableName: string;
  }
): EnterpriseConnectorReadiness {
  if (syntheticSource !== undefined) {
    const missingCredentialEnvNames = findMissingSyntheticSourceCredentialEnvNames(availableCredentialEnvNames);
    if (missingCredentialEnvNames.length > 0) {
      return {
        configured: false,
        connectorName: syntheticSource.connectorName,
        liveContractStatus: "deferred_verify_v3",
        missingCredentialEnvNames,
        mode: "synthetic-static-table-credentials-required",
        reason: `${displayName} synthetic source table ${syntheticSource.sourceTableName} requires Supabase source-table credentials.`,
        sourceTableName: syntheticSource.sourceTableName
      };
    }

    return {
      configured: false,
      connectorName: syntheticSource.connectorName,
      liveContractStatus: "deferred_verify_v3",
      missingCredentialEnvNames: [],
      mode: "synthetic-static-table-schema-required",
      reason: `${displayName} synthetic source table ${syntheticSource.sourceTableName} requires a Supabase schema readiness probe.`,
      sourceTableName: syntheticSource.sourceTableName
    };
  }

  if (contract === undefined) {
    return {
      configured: false,
      mode: "schema-required",
      reason: `${displayName} source contract is not configured.`
    };
  }
  const missingCredentialEnvNames = findMissingCredentialEnvNames(contract, availableCredentialEnvNames);
  if (missingCredentialEnvNames.length > 0) {
    return {
      configured: false,
      mode: "schema-required",
      reason: `${displayName} credentials are not available for ${missingCredentialEnvNames.join(", ")}.`
    };
  }

  return {
    baseUrl: contract.baseUrl,
    configured: true,
    connectorName: contract.connectorName,
    mode: "read-only-source-contract"
  };
}

export function buildEnterpriseReadRequestPlan(
  _line: DeductionLine,
  contract: EnterpriseSourceContract | undefined,
  displayName: string,
  _availableCredentialEnvNames: readonly string[] = []
): EnterpriseReadRequestPlan {
  void _line;
  void _availableCredentialEnvNames;
  if (contract === undefined) {
    return {
      configured: false,
      reason: `${displayName} source contract is not configured.`,
      requests: []
    };
  }

  return {
    configured: false,
    reason: `${displayName} live source reads are deferred to VERIFY-V3; Day-1 source readiness uses synthetic Supabase static table ${SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR[contract.connectorName]}.`,
    requests: []
  };
}

export function hasAvailableCredentialEnvNames(
  contract: EnterpriseSourceContract,
  availableCredentialEnvNames: readonly string[]
): boolean {
  return findMissingCredentialEnvNames(contract, availableCredentialEnvNames).length === 0;
}

function findMissingCredentialEnvNames(
  contract: EnterpriseSourceContract,
  availableCredentialEnvNames: readonly string[]
): string[] {
  const available = new Set(availableCredentialEnvNames);

  return contract.credentialEnvNames.filter((credentialEnvName) => !available.has(credentialEnvName));
}

export function findMissingSyntheticSourceCredentialEnvNames(availableCredentialEnvNames: readonly string[]): string[] {
  const available = new Set(availableCredentialEnvNames);

  return SUPABASE_SYNTHETIC_SOURCE_CREDENTIAL_ENV_NAMES.filter((credentialEnvName) => !available.has(credentialEnvName));
}

function hasNoSecretBearingUrlParts(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}
