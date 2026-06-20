import { z } from "zod";
import type { DeductionLine } from "../types/entities.js";

export const EnterpriseConnectorNameSchema = z.enum(["bureau", "docs-repo", "edi-remittance", "remittance", "tpm"]);
export const RecordIdSourceSchema = z.enum(["customerId", "lineId", "recordIds"]);

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
    };

export function describeEnterpriseConnectorReadiness(
  contract: EnterpriseSourceContract | undefined,
  displayName: string,
  availableCredentialEnvNames: readonly string[] = []
): EnterpriseConnectorReadiness {
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
  line: DeductionLine,
  contract: EnterpriseSourceContract | undefined,
  displayName: string,
  availableCredentialEnvNames: readonly string[] = []
): EnterpriseReadRequestPlan {
  if (contract === undefined) {
    return {
      configured: false,
      reason: `${displayName} source contract is not configured.`,
      requests: []
    };
  }
  const missingCredentialEnvNames = findMissingCredentialEnvNames(contract, availableCredentialEnvNames);
  if (missingCredentialEnvNames.length > 0) {
    return {
      configured: false,
      reason: `${displayName} credentials are not available for ${missingCredentialEnvNames.join(", ")}.`,
      requests: []
    };
  }

  return {
    configured: true,
    connectorName: contract.connectorName,
    requests: collectRecordIds(line, contract)
      .filter((recordId) => contract.allowedRecordPrefixes.some((prefix) => recordId.startsWith(prefix)))
      .map((recordId) => ({
        canonicalEvidenceMapping: { ...contract.canonicalEvidenceMapping },
        connectorName: contract.connectorName,
        evidenceTypes: [...contract.evidenceTypes],
        method: "GET",
        recordIds: [line.lineId, recordId],
        url: buildReadUrl(contract.baseUrl, contract.readPathTemplate, recordId)
      }))
  };
}

function collectRecordIds(line: DeductionLine, contract: EnterpriseSourceContract): string[] {
  const ids = new Set<string>();

  for (const source of contract.recordIdSources) {
    if (source === "customerId") {
      ids.add(line.customerId);
    } else if (source === "lineId") {
      ids.add(line.lineId);
    } else {
      for (const recordId of line.recordIds) {
        ids.add(recordId);
      }
    }
  }

  return [...ids];
}

function buildReadUrl(baseUrl: string, readPathTemplate: string, recordId: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const expandedPath = readPathTemplate.replace(/\{recordId\}/g, encodeURIComponent(recordId));
  const normalizedPath = expandedPath.startsWith("/") ? expandedPath : `/${expandedPath}`;

  return `${normalizedBase}${normalizedPath}`;
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

function hasNoSecretBearingUrlParts(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}
