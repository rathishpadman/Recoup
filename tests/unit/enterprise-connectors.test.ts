import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { BureauReadOnlyAdapter, BureauSourceContractSchema } from "../../src/adapters/bureau.js";
import { DocRepoReadOnlyAdapter, DocRepoSourceContractSchema } from "../../src/adapters/docRepo.js";
import { EdiRemittanceReadOnlyAdapter, EdiRemittanceSourceContractSchema } from "../../src/adapters/ediRemittance.js";
import { RemittanceReadOnlyAdapter, RemittanceSourceContractSchema } from "../../src/adapters/remittance.js";
import { TpmReadOnlyAdapter, TpmSourceContractSchema } from "../../src/adapters/tpm.js";

const baseLine = buildSyntheticDataset({ seed: 42 }).deductionLines[0];
if (baseLine === undefined) {
  throw new Error("Synthetic dataset must include at least one deduction line.");
}

const line = {
  ...baseLine,
  customerId: "CUST-GREENLEAF",
  recordIds: [
    baseLine.lineId,
    "DOC-POD-1",
    "TPM-PROMO-1",
    "REMIT-ADVICE-1",
    "EDI-812-1",
    "BUREAU-SIGNAL-1",
    "INV-SHOULD-NOT-MATCH"
  ]
};

describe("enterprise read-only connector adapters", () => {
  it("fails closed when source contracts are not configured", () => {
    expect(new BureauReadOnlyAdapter().buildReadRequestPlan(line)).toEqual({
      configured: false,
      reason: "Bureau source contract is not configured.",
      requests: []
    });
    expect(new DocRepoReadOnlyAdapter().buildReadRequestPlan(line)).toEqual({
      configured: false,
      reason: "Document repository source contract is not configured.",
      requests: []
    });
    expect(new EdiRemittanceReadOnlyAdapter().buildReadRequestPlan(line)).toEqual({
      configured: false,
      reason: "EDI remittance source contract is not configured.",
      requests: []
    });
    expect(new RemittanceReadOnlyAdapter().buildReadRequestPlan(line)).toEqual({
      configured: false,
      reason: "Remittance source contract is not configured.",
      requests: []
    });
    expect(new TpmReadOnlyAdapter().buildReadRequestPlan(line)).toEqual({
      configured: false,
      reason: "TPM source contract is not configured.",
      requests: []
    });
  });

  it("validates source contracts before building read plans", () => {
    expect(() =>
      DocRepoSourceContractSchema.parse({
        allowedRecordPrefixes: ["DOC-"],
        baseUrl: "https://docs.example.test",
        connectorName: "docs-repo",
        credentialEnvNames: ["DOCS_REPO_TOKEN"],
        evidenceTypes: ["POD"],
        readPathTemplate: "/evidence/static"
      })
    ).toThrow("readPathTemplate must include {recordId}");

    expect(() =>
      TpmSourceContractSchema.parse({
        allowedRecordPrefixes: ["TPM-"],
        baseUrl: "https://tpm.example.test",
        connectorName: "tpm",
        credentialEnvNames: ["TPM_TOKEN"],
        evidenceTypes: ["trade-promo"],
        readPathTemplate: "/promotions/{recordId}/approval",
        recordIdSources: ["recordIds"]
      })
    ).toThrow("canonicalEvidenceMapping");

    expect(() =>
      DocRepoSourceContractSchema.parse({
        allowedRecordPrefixes: ["DOC-"],
        baseUrl: "https://user:secret@docs.example.test?token=secret#frag",
        connectorName: "docs-repo",
        credentialEnvNames: ["DOCS_REPO_TOKEN"],
        evidenceTypes: ["POD"],
        readPathTemplate: "/evidence/{recordId}",
        recordIdSources: ["recordIds"]
      })
    ).toThrow("baseUrl must not include credentials, query strings, or fragments");
  });

  it("does not build live read plans until declared credentials are available", () => {
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

    expect(new DocRepoReadOnlyAdapter(contract).buildReadRequestPlan(line)).toEqual({
      configured: false,
      reason: "Document repository credentials are not available for DOCS_REPO_TOKEN.",
      requests: []
    });
  });

  it("builds GET-only request plans without leaking credential names or secret values", () => {
    const adapters = [
      new BureauReadOnlyAdapter(
        BureauSourceContractSchema.parse({
          allowedRecordPrefixes: ["BUREAU-", "CUST-"],
          baseUrl: "https://bureau.example.test",
          canonicalEvidenceMapping: {
            documentIdField: "signal_id",
            documentTypeField: "signal_type",
            recordIdsField: "record_ids",
            summaryField: "risk_summary"
          },
          connectorName: "bureau",
          credentialEnvNames: ["BUREAU_API_TOKEN"],
          evidenceTypes: ["bureau-signal"],
          readPathTemplate: "/customers/{recordId}/signals",
          recordIdSources: ["customerId", "recordIds"]
        }),
        ["BUREAU_API_TOKEN"]
      ),
      new DocRepoReadOnlyAdapter(
        DocRepoSourceContractSchema.parse({
          allowedRecordPrefixes: ["DOC-"],
          baseUrl: "https://docs.example.test/",
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
        }),
        ["DOCS_REPO_TOKEN"]
      ),
      new EdiRemittanceReadOnlyAdapter(
        EdiRemittanceSourceContractSchema.parse({
          allowedRecordPrefixes: ["EDI-"],
          baseUrl: "https://edi.example.test",
          canonicalEvidenceMapping: {
            documentIdField: "transaction_id",
            documentTypeField: "transaction_set",
            recordIdsField: "record_ids",
            summaryField: "segment_summary"
          },
          connectorName: "edi-remittance",
          credentialEnvNames: ["EDI_REMITTANCE_TOKEN"],
          evidenceTypes: ["edi-remittance"],
          readPathTemplate: "/transactions/{recordId}",
          recordIdSources: ["recordIds"]
        }),
        ["EDI_REMITTANCE_TOKEN"]
      ),
      new RemittanceReadOnlyAdapter(
        RemittanceSourceContractSchema.parse({
          allowedRecordPrefixes: ["REMIT-"],
          baseUrl: "https://remit.example.test",
          canonicalEvidenceMapping: {
            documentIdField: "advice_id",
            documentTypeField: "advice_type",
            recordIdsField: "record_ids",
            summaryField: "summary"
          },
          connectorName: "remittance",
          credentialEnvNames: ["REMITTANCE_TOKEN"],
          evidenceTypes: ["remittance-advice"],
          readPathTemplate: "/advices/{recordId}",
          recordIdSources: ["recordIds"]
        }),
        ["REMITTANCE_TOKEN"]
      ),
      new TpmReadOnlyAdapter(
        TpmSourceContractSchema.parse({
          allowedRecordPrefixes: ["TPM-"],
          baseUrl: "https://tpm.example.test",
          canonicalEvidenceMapping: {
            documentIdField: "promotion_id",
            documentTypeField: "approval_type",
            recordIdsField: "record_ids",
            summaryField: "approval_summary"
          },
          connectorName: "tpm",
          credentialEnvNames: ["TPM_TOKEN"],
          evidenceTypes: ["trade-promo"],
          readPathTemplate: "/promotions/{recordId}/approval",
          recordIdSources: ["recordIds"]
        }),
        ["TPM_TOKEN"]
      )
    ];

    const plans = adapters.map((adapter) => adapter.buildReadRequestPlan(line));

    expect(plans.every((plan) => plan.configured)).toBe(true);
    const requests = plans.flatMap((plan) => (plan.configured ? plan.requests : []));
    expect(requests.map((request) => request.connectorName).sort()).toEqual([
      "bureau",
      "bureau",
      "docs-repo",
      "edi-remittance",
      "remittance",
      "tpm"
    ]);
    expect([...new Set(requests.map((request) => request.method))]).toEqual(["GET"]);
    expect(requests.every((request) => request.recordIds.includes(line.lineId))).toBe(true);
    expect(requests.some((request) => request.url === "https://docs.example.test/evidence/DOC-POD-1")).toBe(true);
    expect(requests.some((request) => request.url === "https://bureau.example.test/customers/CUST-GREENLEAF/signals")).toBe(true);
    expect(JSON.stringify(plans)).not.toContain("TOKEN");
    expect(JSON.stringify(plans)).not.toContain("secret");
  });

  it("keeps the enterprise adapter prototypes read-only", () => {
    const prototypes = [
      BureauReadOnlyAdapter.prototype,
      DocRepoReadOnlyAdapter.prototype,
      EdiRemittanceReadOnlyAdapter.prototype,
      RemittanceReadOnlyAdapter.prototype,
      TpmReadOnlyAdapter.prototype
    ];

    for (const prototype of prototypes) {
      const methodNames = Object.getOwnPropertyNames(prototype).sort();

      expect(methodNames).toEqual(["buildReadRequestPlan", "constructor", "describeReadiness"]);
      expect(methodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    }
  });
});
