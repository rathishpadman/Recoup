import { hasAvailableCredentialEnvNames, type EnterpriseSourceContract } from "./enterpriseReadOnly.js";
import { SAP_ODATA_BASIC_ENV_NAMES, SAP_ODATA_OAUTH_ENV_NAMES, SAP_ODATA_REQUIRED_ENV_NAMES } from "./sapOData.js";

export type ConnectorName = "bureau" | "docs-repo" | "edi-remittance" | "remittance" | "sap-odata" | "tpm";
export type ConnectorStatus = "ready" | "blocked_credentials_required" | "blocked_schema_required";

export interface ConnectorReadiness {
  name: ConnectorName;
  status: ConnectorStatus;
  allowedOperations: ["read"];
  missingCredentialEnvNames: string[];
  missingSourceContractInputs: string[];
  proof: {
    canonicalMappingConfigured: boolean;
    credentialsConfigured: boolean;
    externalWritesAllowed: false;
    schemaValidated: boolean;
    sourceContractConfigured: boolean;
  };
  requiredInputs: string[];
  reason: string;
}

export function buildConnectorReadiness(
  sourceContracts: EnterpriseSourceContract[] = [],
  availableCredentialEnvNames: readonly string[] = []
): ConnectorReadiness[] {
  const sourceContractByName = new Map(sourceContracts.map((contract) => [contract.connectorName, contract]));

  return [
    {
      name: "sap-odata",
      ...sapODataReadiness(availableCredentialEnvNames),
      allowedOperations: ["read"],
      requiredInputs: [...new Set(SAP_ODATA_REQUIRED_ENV_NAMES)],
      reason: "Read-only SAP OData mapping exists; sandbox credentials are required for live reads."
    },
    {
      name: "bureau",
      ...sourceContractReadiness("bureau", sourceContractByName, availableCredentialEnvNames, [
        "bureau source contract",
        "risk score fields",
        "permissible-purpose policy"
      ]),
      allowedOperations: ["read"],
      requiredInputs: ["bureau source contract", "risk score fields", "permissible-purpose policy"],
      reason: "Bureau fields and evidence policy are not specified in the SDD."
    },
    {
      name: "remittance",
      ...sourceContractReadiness("remittance", sourceContractByName, availableCredentialEnvNames, [
        "remittance source contract",
        "deduction reference mapping"
      ]),
      allowedOperations: ["read"],
      requiredInputs: ["remittance source contract", "deduction reference mapping"],
      reason: "Remittance schema and matching keys are not specified in the SDD."
    },
    {
      name: "edi-remittance",
      ...sourceContractReadiness("edi-remittance", sourceContractByName, availableCredentialEnvNames, [
        "EDI transaction set",
        "segment mapping",
        "trading-partner mapping"
      ]),
      allowedOperations: ["read"],
      requiredInputs: ["EDI transaction set", "segment mapping", "trading-partner mapping"],
      reason: "EDI transaction set and segment mapping are not specified in the SDD."
    },
    {
      name: "docs-repo",
      ...sourceContractReadiness("docs-repo", sourceContractByName, availableCredentialEnvNames, [
        "document repository API",
        "document type mapping",
        "retention policy"
      ]),
      allowedOperations: ["read"],
      requiredInputs: ["document repository API", "document type mapping", "retention policy"],
      reason: "Document repository API shape is not specified in the SDD."
    },
    {
      name: "tpm",
      ...sourceContractReadiness("tpm", sourceContractByName, availableCredentialEnvNames, [
        "TPM source contract",
        "promotion ID mapping",
        "approval status fields"
      ]),
      allowedOperations: ["read"],
      requiredInputs: ["TPM source contract", "promotion ID mapping", "approval status fields"],
      reason: "Real TPM adapter schema is not specified in the SDD."
    }
  ];
}

function sapODataReadiness(availableCredentialEnvNames: readonly string[]): Pick<
  ConnectorReadiness,
  "missingCredentialEnvNames" | "missingSourceContractInputs" | "proof" | "status"
> {
  const available = new Set(availableCredentialEnvNames);
  const missingBasicCredentialEnvNames = SAP_ODATA_BASIC_ENV_NAMES.filter((envName) => !available.has(envName));
  const missingOAuthCredentialEnvNames = SAP_ODATA_OAUTH_ENV_NAMES.filter((envName) => !available.has(envName));
  const credentialsConfigured = missingBasicCredentialEnvNames.length === 0 || missingOAuthCredentialEnvNames.length === 0;
  const missingCredentialEnvNames =
    missingBasicCredentialEnvNames.length <= missingOAuthCredentialEnvNames.length
      ? missingBasicCredentialEnvNames
      : missingOAuthCredentialEnvNames;

  return {
    missingCredentialEnvNames: credentialsConfigured ? [] : [...missingCredentialEnvNames],
    missingSourceContractInputs: [],
    proof: {
      canonicalMappingConfigured: true,
      credentialsConfigured,
      externalWritesAllowed: false,
      schemaValidated: true,
      sourceContractConfigured: true
    },
    status: credentialsConfigured ? "ready" : "blocked_credentials_required"
  };
}

function sourceContractReadiness(
  connectorName: Exclude<ConnectorName, "sap-odata">,
  sourceContractByName: Map<EnterpriseSourceContract["connectorName"], EnterpriseSourceContract>,
  availableCredentialEnvNames: readonly string[],
  missingSourceContractInputs: string[]
): Pick<ConnectorReadiness, "missingCredentialEnvNames" | "missingSourceContractInputs" | "proof" | "status"> {
  const contract = sourceContractByName.get(connectorName);
  if (contract === undefined) {
    return {
      missingCredentialEnvNames: [],
      missingSourceContractInputs,
      proof: {
        canonicalMappingConfigured: false,
        credentialsConfigured: false,
        externalWritesAllowed: false,
        schemaValidated: false,
        sourceContractConfigured: false
      },
      status: "blocked_schema_required"
    };
  }

  const missingCredentialEnvNames = contract.credentialEnvNames.filter(
    (credentialEnvName) => !availableCredentialEnvNames.includes(credentialEnvName)
  );

  return {
    missingCredentialEnvNames,
    missingSourceContractInputs: [],
    proof: {
      canonicalMappingConfigured: true,
      credentialsConfigured: missingCredentialEnvNames.length === 0,
      externalWritesAllowed: false,
      schemaValidated: true,
      sourceContractConfigured: true
    },
    status: hasAvailableCredentialEnvNames(contract, availableCredentialEnvNames)
      ? "ready"
      : "blocked_credentials_required"
  };
}
