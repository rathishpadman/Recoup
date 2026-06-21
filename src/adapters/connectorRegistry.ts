import {
  findMissingSyntheticSourceCredentialEnvNames,
  SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR,
  type EnterpriseConnectorName,
  type EnterpriseSourceContract
} from "./enterpriseReadOnly.js";
import { SAP_ODATA_BASIC_ENV_NAMES, SAP_ODATA_OAUTH_ENV_NAMES, SAP_ODATA_REQUIRED_ENV_NAMES } from "./sapOData.js";

export type ConnectorName = "bureau" | "docs-repo" | "edi-remittance" | "remittance" | "sap-odata" | "tpm";
export type ConnectorStatus = "ready" | "ready_synthetic" | "blocked_credentials_required" | "blocked_schema_required";
export type ConnectorSourceMode = "live" | "synthetic_static_table";
export type ConnectorSourceContractMode = "live_source_contract" | "synthetic_static_table";
export type ConnectorLiveContractStatus = "configured" | "deferred_verify_v3";
export type SupabaseToolDataTableStatus = "available" | "not_found_or_not_exposed" | "error";

export interface SupabaseToolDataSchemaProbe {
  tableStatuses: Record<string, SupabaseToolDataTableStatus>;
  unsafeShadowActions: Array<{
    columnName: string;
    tableName: string;
    value: string;
  }>;
}

export interface ConnectorReadiness {
  name: ConnectorName;
  status: ConnectorStatus;
  allowedOperations: ["read"];
  liveContractStatus: ConnectorLiveContractStatus;
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
  sourceContractMode: ConnectorSourceContractMode;
  sourceMode: ConnectorSourceMode;
  sourceTableName?: string;
  toolDataTableNames?: string[];
}

export function buildConnectorReadiness(
  _sourceContracts: EnterpriseSourceContract[] = [],
  availableCredentialEnvNames: readonly string[] = [],
  toolDataSchemaProbe?: SupabaseToolDataSchemaProbe
): ConnectorReadiness[] {
  void _sourceContracts;
  const readiness: ConnectorReadiness[] = [
    {
      name: "sap-odata",
      ...sapODataReadiness(availableCredentialEnvNames),
      allowedOperations: ["read"],
      requiredInputs: [...new Set(SAP_ODATA_REQUIRED_ENV_NAMES)],
      reason: "Read-only SAP OData mapping exists; sandbox credentials are required for live reads.",
      liveContractStatus: "configured",
      sourceContractMode: "live_source_contract",
      sourceMode: "live"
    }
  ];

  for (const definition of syntheticConnectorDefinitions) {
    readiness.push({
      name: definition.name,
      ...syntheticSourceReadiness(
        definition.name,
        definition.displayName,
        availableCredentialEnvNames,
        toolDataSchemaProbe
      ),
      allowedOperations: ["read"],
      requiredInputs: [definition.sourceTableName],
      liveContractStatus: "deferred_verify_v3",
      sourceContractMode: "synthetic_static_table",
      sourceMode: "synthetic_static_table",
      sourceTableName: definition.sourceTableName,
      toolDataTableNames: toolDataTableNamesForConnector(definition.name)
    });
  }

  return readiness;
}

const syntheticConnectorDefinitions: Array<{
  displayName: string;
  name: EnterpriseConnectorName;
  sourceTableName: string;
}> = [
  {
    displayName: "Bureau",
    name: "bureau",
    sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR.bureau
  },
  {
    displayName: "Remittance",
    name: "remittance",
    sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR.remittance
  },
  {
    displayName: "EDI remittance",
    name: "edi-remittance",
    sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR["edi-remittance"]
  },
  {
    displayName: "Document repository",
    name: "docs-repo",
    sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR["docs-repo"]
  },
  {
    displayName: "TPM",
    name: "tpm",
    sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR.tpm
  }
];

export const TOOLS_DATA_SHARED_TABLE_NAMES = ["customers", "payments"] as const;
export const TOOLS_DATA_TABLES_BY_CONNECTOR = {
  bureau: ["bureau_alerts"],
  "docs-repo": ["pod_records", "carrier_reports", "damage_photos", "contracts"],
  "edi-remittance": ["remittance_headers", "remittance_lines", "deductions_backlog"],
  remittance: ["remittance_headers", "remittance_lines", "deductions_backlog"],
  tpm: ["promotions", "contracts"]
} as const satisfies Record<EnterpriseConnectorName, readonly string[]>;
export const TOOLS_DATA_SHADOW_ACTION_TABLE_NAMES = [
  "billing_requests",
  "recovery_packages",
  "credit_decisions",
  "immutable_audit_log"
] as const;
export const ALL_TOOLS_DATA_TABLE_NAMES = [
  ...new Set([
    ...TOOLS_DATA_SHARED_TABLE_NAMES,
    ...Object.values(TOOLS_DATA_TABLES_BY_CONNECTOR).flat(),
    ...TOOLS_DATA_SHADOW_ACTION_TABLE_NAMES
  ])
];

function syntheticSourceReadiness(
  connectorName: Exclude<ConnectorName, "sap-odata">,
  displayName: string,
  availableCredentialEnvNames: readonly string[],
  toolDataSchemaProbe: SupabaseToolDataSchemaProbe | undefined
): Pick<ConnectorReadiness, "missingCredentialEnvNames" | "missingSourceContractInputs" | "proof" | "reason" | "status"> {
  const missingCredentialEnvNames = findMissingSyntheticSourceCredentialEnvNames(availableCredentialEnvNames);
  const credentialsConfigured = missingCredentialEnvNames.length === 0;
  const tableNames = toolDataTableNamesForConnector(connectorName);
  const readinessTableNames = [...tableNames, ...TOOLS_DATA_SHADOW_ACTION_TABLE_NAMES];
  const unavailableTableReasons =
    toolDataSchemaProbe === undefined
      ? []
      : readinessTableNames
          .map((tableName) => [tableName, toolDataSchemaProbe.tableStatuses[tableName]] as const)
          .filter((entry): entry is readonly [string, Exclude<SupabaseToolDataTableStatus, "available"> | undefined] => entry[1] !== "available")
          .map(([tableName, status]) => `${tableName} ${formatTableStatus(status)}`);
  const unsafeShadowActions =
    toolDataSchemaProbe?.unsafeShadowActions.map(
      (action) => `${action.tableName}.${action.columnName}=${action.value}`
    ) ?? [];
  const schemaValidated =
    credentialsConfigured &&
    toolDataSchemaProbe !== undefined &&
    unavailableTableReasons.length === 0 &&
    unsafeShadowActions.length === 0;

  return {
    missingCredentialEnvNames,
    missingSourceContractInputs: [],
    proof: {
      canonicalMappingConfigured: true,
      credentialsConfigured,
      externalWritesAllowed: false,
      schemaValidated,
      sourceContractConfigured: true
    },
    reason: syntheticReadinessReason(displayName, credentialsConfigured, toolDataSchemaProbe, unavailableTableReasons, unsafeShadowActions),
    status: credentialsConfigured ? (schemaValidated ? "ready_synthetic" : "blocked_schema_required") : "blocked_credentials_required"
  };
}

function toolDataTableNamesForConnector(connectorName: Exclude<ConnectorName, "sap-odata">): string[] {
  return [...TOOLS_DATA_SHARED_TABLE_NAMES, ...TOOLS_DATA_TABLES_BY_CONNECTOR[connectorName]];
}

function syntheticReadinessReason(
  displayName: string,
  credentialsConfigured: boolean,
  toolDataSchemaProbe: SupabaseToolDataSchemaProbe | undefined,
  unavailableTableReasons: readonly string[],
  unsafeShadowActions: readonly string[]
): string {
  if (!credentialsConfigured) {
    return `${displayName} Tools_data readiness requires Supabase source-table credentials.`;
  }

  if (toolDataSchemaProbe === undefined) {
    return `${displayName} Tools_data table readiness has not been verified by a Supabase schema probe.`;
  }

  if (unavailableTableReasons.length > 0) {
    return `${displayName} Tools_data table readiness blocked: ${unavailableTableReasons.join(", ")}.`;
  }

  if (unsafeShadowActions.length > 0) {
    return `${displayName} Tools_data shadow action readiness blocked by external-action statuses: ${unsafeShadowActions.join(", ")}.`;
  }

  return `${displayName} Tools_data source tables verified by Supabase schema probe; live non-SAP contracts remain deferred to VERIFY-V3.`;
}

function formatTableStatus(status: SupabaseToolDataTableStatus | undefined): string {
  if (status === "not_found_or_not_exposed" || status === undefined) {
    return "not found or not exposed";
  }

  return "probe error";
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
