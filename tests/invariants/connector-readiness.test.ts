import { describe, expect, it } from "vitest";
import { buildConnectorReadiness } from "../../src/adapters/connectorRegistry.js";
import { DocRepoSourceContractSchema } from "../../src/adapters/docRepo.js";

describe("connector readiness", () => {
  it("declares all planned enterprise connectors and fails closed without source contracts", () => {
    const readiness = buildConnectorReadiness();

    expect(readiness.map((connector) => connector.name).sort()).toEqual([
      "bureau",
      "docs-repo",
      "edi-remittance",
      "remittance",
      "sap-odata",
      "tpm"
    ]);
    expect(readiness.filter((connector) => connector.status === "blocked_schema_required").map((connector) => connector.name).sort()).toEqual([
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
        "SAP_ODATA_USERID",
        "SAP_ODATA_CLIENT_SECRET"
      ],
      missingSourceContractInputs: [],
      proof: {
        credentialsConfigured: false,
        canonicalMappingConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      }
    });
    expect(readiness.find((connector) => connector.name === "tpm")).toMatchObject({
      missingCredentialEnvNames: [],
      missingSourceContractInputs: ["TPM source contract", "promotion ID mapping", "approval status fields"],
      proof: {
        credentialsConfigured: false,
        schemaValidated: false,
        sourceContractConfigured: false
      }
    });
  });

  it("keeps source-contracted connectors blocked until declared credentials are available", () => {
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

    const readiness = buildConnectorReadiness([contract]);

    expect(readiness.find((connector) => connector.name === "docs-repo")).toMatchObject({
      allowedOperations: ["read"],
      missingCredentialEnvNames: ["DOCS_REPO_TOKEN"],
      missingSourceContractInputs: [],
      proof: {
        credentialsConfigured: false,
        canonicalMappingConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      },
      status: "blocked_credentials_required"
    });
  });

  it("marks only source-contracted non-SAP connectors ready when required credentials are available", () => {
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
      missingCredentialEnvNames: [],
      missingSourceContractInputs: [],
      proof: {
        credentialsConfigured: true,
        canonicalMappingConfigured: true,
        schemaValidated: true,
        sourceContractConfigured: true
      },
      status: "ready"
    });
    expect(readiness.find((connector) => connector.name === "tpm")).toMatchObject({
      allowedOperations: ["read"],
      status: "blocked_schema_required"
    });
  });

  it("marks SAP OData ready when the Basic-auth Gateway credential env set is available", () => {
    const readiness = buildConnectorReadiness([], ["SAP_ODATA_BASE_URL", "SAP_ODATA_USERID", "SAP_ODATA_CLIENT_SECRET"]);

    expect(readiness.find((connector) => connector.name === "sap-odata")).toMatchObject({
      allowedOperations: ["read"],
      missingCredentialEnvNames: [],
      status: "ready"
    });
  });

  it("marks SAP OData ready when the OAuth read-only credential env set is available", () => {
    const readiness = buildConnectorReadiness([], [
      "SAP_ODATA_BASE_URL",
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
      missingCredentialEnvNames: ["SAP_ODATA_USERID"],
      status: "blocked_credentials_required"
    });
  });
});
