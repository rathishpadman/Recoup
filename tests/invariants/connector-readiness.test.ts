import { describe, expect, it } from "vitest";
import { ALL_TOOLS_DATA_TABLE_NAMES, buildConnectorReadiness } from "../../src/adapters/connectorRegistry.js";
import { DocRepoSourceContractSchema } from "../../src/adapters/docRepo.js";

describe("connector readiness", () => {
  it("declares SAP live readiness and non-SAP synthetic table readiness without claiming live contracts", () => {
    const readiness = buildConnectorReadiness(
      [],
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      allToolDataTablesAvailableProbe()
    );

    expect(readiness.map((connector) => connector.name).sort()).toEqual([
      "bureau",
      "docs-repo",
      "edi-remittance",
      "remittance",
      "sap-odata",
      "tpm"
    ]);
    expect(readiness.filter((connector) => connector.status === "ready_synthetic").map((connector) => connector.name).sort()).toEqual([
      "bureau",
      "docs-repo",
      "edi-remittance",
      "remittance",
      "tpm"
    ]);
    expect(readiness.every((connector) => connector.allowedOperations.join(",") === "read")).toBe(true);
    expect(readiness.map((connector) => connector.proof.externalWritesAllowed)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false
    ]);
    expect(readiness.find((connector) => connector.name === "sap-odata")).toMatchObject({
      missingCredentialEnvNames: [
        "SAP_ODATA_BASE_URL",
        "SAP_ODATA_CLIENT",
        "SAP_ODATA_USERID",
        "SAP_ODATA_CLIENT_SECRET"
      ],
      missingSourceContractInputs: [],
      sourceContractMode: "live_source_contract",
      sourceMode: "live",
      proof: {
        credentialsConfigured: false,
        canonicalMappingConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      },
      status: "blocked_credentials_required"
    });
    expect(readiness.find((connector) => connector.name === "bureau")).toMatchObject({
      liveContractStatus: "deferred_verify_v3",
      missingCredentialEnvNames: [],
      missingSourceContractInputs: [],
      sourceContractMode: "synthetic_static_table",
      sourceMode: "synthetic_static_table",
      sourceTableName: "recoup_src_bureau",
      toolDataTableNames: ["customers", "payments", "bureau_alerts"],
      proof: {
        credentialsConfigured: true,
        canonicalMappingConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      },
      status: "ready_synthetic"
    });
    expect(readiness.find((connector) => connector.name === "docs-repo")).toMatchObject({
      liveContractStatus: "deferred_verify_v3",
      sourceTableName: "recoup_src_docs",
      toolDataTableNames: ["customers", "payments", "pod_records", "carrier_reports", "damage_photos", "contracts"],
      status: "ready_synthetic"
    });
    expect(readiness.find((connector) => connector.name === "remittance")).toMatchObject({
      liveContractStatus: "deferred_verify_v3",
      sourceTableName: "recoup_src_remittance",
      status: "ready_synthetic"
    });
    expect(readiness.find((connector) => connector.name === "edi-remittance")).toMatchObject({
      liveContractStatus: "deferred_verify_v3",
      sourceTableName: "recoup_src_remittance",
      status: "ready_synthetic"
    });
    expect(readiness.find((connector) => connector.name === "tpm")).toMatchObject({
      missingCredentialEnvNames: [],
      missingSourceContractInputs: [],
      sourceTableName: "recoup_src_tpm",
      liveContractStatus: "deferred_verify_v3",
      proof: {
        credentialsConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      },
      status: "ready_synthetic"
    });
  });

  it("requires only Supabase source-table credentials for Day-1 synthetic non-SAP readiness", () => {
    const readiness = buildConnectorReadiness();

    expect(readiness.find((connector) => connector.name === "docs-repo")).toMatchObject({
      liveContractStatus: "deferred_verify_v3",
      missingCredentialEnvNames: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      missingSourceContractInputs: [],
      proof: {
        credentialsConfigured: false,
        canonicalMappingConfigured: true,
        schemaValidated: false,
        sourceContractConfigured: true
      },
      sourceContractMode: "synthetic_static_table",
      sourceTableName: "recoup_src_docs",
      status: "blocked_credentials_required"
    });
  });

  it("does not mark non-SAP Tools_data tables ready until the Supabase schema probe passes", () => {
    const readiness = buildConnectorReadiness([], ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

    expect(readiness.find((connector) => connector.name === "docs-repo")).toMatchObject({
      liveContractStatus: "deferred_verify_v3",
      missingCredentialEnvNames: [],
      proof: {
        credentialsConfigured: true,
        schemaValidated: false,
        sourceContractConfigured: true
      },
      reason: "Document repository Tools_data table readiness has not been verified by a Supabase schema probe.",
      sourceContractMode: "synthetic_static_table",
      sourceTableName: "recoup_src_docs",
      status: "blocked_schema_required"
    });
  });

  it("reports a missing Supabase Tools_data table as schema-required without exposing credentials", () => {
    const readiness = buildConnectorReadiness(
      [],
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      {
        tableStatuses: {
          ...allToolDataTablesAvailableProbe().tableStatuses,
          pod_records: "not_found_or_not_exposed"
        },
        unsafeShadowActions: []
      }
    );
    const docs = readiness.find((connector) => connector.name === "docs-repo");

    expect(docs).toMatchObject({
      proof: {
        credentialsConfigured: true,
        schemaValidated: false
      },
      status: "blocked_schema_required"
    });
    expect(docs?.reason).toContain("pod_records");
    expect(docs?.reason).toContain("not found or not exposed");
    expect(JSON.stringify(docs)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(docs)).not.toContain("supabase-service-secret");
  });

  it("blocks demo readiness when shadow action tables contain external-action statuses", () => {
    const readiness = buildConnectorReadiness(
      [],
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      {
        tableStatuses: allToolDataTablesAvailableProbe().tableStatuses,
        unsafeShadowActions: [
          {
            columnName: "status",
            tableName: "billing_requests",
            value: "SENT_TO_SAP"
          }
        ]
      }
    );
    const remittance = readiness.find((connector) => connector.name === "remittance");

    expect(remittance).toMatchObject({
      proof: {
        credentialsConfigured: true,
        schemaValidated: false
      },
      status: "blocked_schema_required"
    });
    expect(remittance?.reason).toContain("billing_requests.status=SENT_TO_SAP");
  });

  it("blocks demo readiness when shadow action tables are missing because unsafe statuses cannot be disproved", () => {
    const readiness = buildConnectorReadiness(
      [],
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      {
        tableStatuses: {
          ...allToolDataTablesAvailableProbe().tableStatuses,
          billing_requests: "not_found_or_not_exposed"
        },
        unsafeShadowActions: []
      }
    );
    const docs = readiness.find((connector) => connector.name === "docs-repo");

    expect(docs).toMatchObject({
      proof: {
        credentialsConfigured: true,
        schemaValidated: false
      },
      status: "blocked_schema_required"
    });
    expect(docs?.reason).toContain("billing_requests");
    expect(docs?.reason).toContain("not found or not exposed");
  });

  it("keeps supplied live non-SAP source contracts deferred while the synthetic source remains ready", () => {
    const contract = DocRepoSourceContractSchema.parse({
        allowedRecordPrefixes: ["DOC-"],
        baseUrl: "https://docs.example.test",
        canonicalEvidenceMapping: {
          documentIdField: "document_id",
          documentTypeField: "document_type",
          recordIdsField: "record_ids",
          summaryField: "summary"
        },
        connectorName: "docs-repo",
      credentialEnvNames: ["DOCS_REPO_TOKEN"],
      evidenceTypes: ["POD"],
      readPathTemplate: "/evidence/{recordId}",
      recordIdSources: ["recordIds"]
    });

    const readiness = buildConnectorReadiness(
      [contract],
      ["DOCS_REPO_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      allToolDataTablesAvailableProbe()
    );

    expect(readiness.find((connector) => connector.name === "docs-repo")).toMatchObject({
      allowedOperations: ["read"],
      liveContractStatus: "deferred_verify_v3",
      missingCredentialEnvNames: [],
      missingSourceContractInputs: [],
      proof: {
        credentialsConfigured: true,
        canonicalMappingConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      },
      sourceContractMode: "synthetic_static_table",
      sourceTableName: "recoup_src_docs",
      status: "ready_synthetic"
    });
  });

  it("does not mark non-SAP live source contracts ready during VERIFY-V3 deferral", () => {
    const readiness = buildConnectorReadiness(
      [
        DocRepoSourceContractSchema.parse({
          allowedRecordPrefixes: ["DOC-"],
          baseUrl: "https://docs.example.test",
          canonicalEvidenceMapping: {
            documentIdField: "document_id",
            documentTypeField: "document_type",
            recordIdsField: "record_ids",
            summaryField: "summary"
          },
          connectorName: "docs-repo",
          credentialEnvNames: ["DOCS_REPO_TOKEN"],
          evidenceTypes: ["POD"],
          readPathTemplate: "/evidence/{recordId}",
          recordIdSources: ["recordIds"]
        })
      ],
      ["DOCS_REPO_TOKEN"]
    );

    expect(readiness.find((connector) => connector.name === "docs-repo")).toMatchObject({
      allowedOperations: ["read"],
      liveContractStatus: "deferred_verify_v3",
      missingCredentialEnvNames: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      missingSourceContractInputs: [],
      proof: {
        credentialsConfigured: false,
        canonicalMappingConfigured: true,
        schemaValidated: false,
        sourceContractConfigured: true
      },
      sourceContractMode: "synthetic_static_table",
      status: "blocked_credentials_required"
    });
    expect(readiness.find((connector) => connector.name === "tpm")).toMatchObject({
      allowedOperations: ["read"],
      liveContractStatus: "deferred_verify_v3",
      status: "blocked_credentials_required"
    });
  });

  it("marks SAP OData ready when the Basic-auth Gateway credential env set is available", () => {
    const readiness = buildConnectorReadiness([], [
      "SAP_ODATA_BASE_URL",
      "SAP_ODATA_CLIENT",
      "SAP_ODATA_USERID",
      "SAP_ODATA_CLIENT_SECRET"
    ]);

    expect(readiness.find((connector) => connector.name === "sap-odata")).toMatchObject({
      allowedOperations: ["read"],
      missingCredentialEnvNames: [],
      status: "ready"
    });
  });

  it("marks SAP OData ready when the OAuth read-only credential env set is available", () => {
    const readiness = buildConnectorReadiness([], [
      "SAP_ODATA_BASE_URL",
      "SAP_ODATA_CLIENT",
      "SAP_ODATA_CLIENT_ID",
      "SAP_ODATA_CLIENT_SECRET",
      "SAP_ODATA_TOKEN_URL"
    ]);

    expect(readiness.find((connector) => connector.name === "sap-odata")).toMatchObject({
      allowedOperations: ["read"],
      missingCredentialEnvNames: [],
      status: "ready"
    });
  });

  it("keeps SAP OData blocked when any required read-only credential env name is missing", () => {
    const readiness = buildConnectorReadiness([], ["SAP_ODATA_BASE_URL", "SAP_ODATA_CLIENT_SECRET"]);

    expect(readiness.find((connector) => connector.name === "sap-odata")).toMatchObject({
      allowedOperations: ["read"],
      missingCredentialEnvNames: ["SAP_ODATA_CLIENT", "SAP_ODATA_USERID"],
      status: "blocked_credentials_required"
    });
  });
});

function allToolDataTablesAvailableProbe() {
  return {
    tableStatuses: Object.fromEntries(
      ALL_TOOLS_DATA_TABLE_NAMES.map((tableName) => [tableName, "available" as const])
    ),
    unsafeShadowActions: []
  };
}
