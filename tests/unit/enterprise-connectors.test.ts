import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { BureauReadOnlyAdapter, BureauSourceContractSchema } from "../../src/adapters/bureau.js";
import { DocRepoReadOnlyAdapter, DocRepoSourceContractSchema } from "../../src/adapters/docRepo.js";
import { EdiRemittanceReadOnlyAdapter, EdiRemittanceSourceContractSchema } from "../../src/adapters/ediRemittance.js";
import {
  createOpenAiVectorStoreEvidenceReader,
  type OpenAiVectorStoreFetch
} from "../../src/adapters/openAiVectorStore.js";
import { RemittanceReadOnlyAdapter, RemittanceSourceContractSchema } from "../../src/adapters/remittance.js";
import {
  createSupabaseSapEvidenceReader,
  createSupabaseSettlementRunReader,
  createSupabaseSyntheticSourceReader,
  sourcePortFromSupabaseSnapshots,
  type SupabaseSyntheticSourceFetch
} from "../../src/adapters/supabaseSyntheticSource.js";
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
  it("reports Day-1 synthetic source tables as schema-required until the Supabase probe verifies them", () => {
    expect(new BureauReadOnlyAdapter(undefined, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).describeReadiness()).toMatchObject({
      configured: false,
      connectorName: "bureau",
      liveContractStatus: "deferred_verify_v3",
      mode: "synthetic-source-table-schema-required",
      sourceTableName: "recoup_src_bureau"
    });
    expect(new DocRepoReadOnlyAdapter(undefined, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).describeReadiness()).toMatchObject({
      configured: false,
      connectorName: "docs-repo",
      liveContractStatus: "deferred_verify_v3",
      mode: "synthetic-source-table-schema-required",
      sourceTableName: "recoup_src_docs"
    });
    expect(new EdiRemittanceReadOnlyAdapter(undefined, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).describeReadiness()).toMatchObject({
      configured: false,
      connectorName: "edi-remittance",
      liveContractStatus: "deferred_verify_v3",
      mode: "synthetic-source-table-schema-required",
      sourceTableName: "recoup_src_remittance"
    });
    expect(new RemittanceReadOnlyAdapter(undefined, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).describeReadiness()).toMatchObject({
      configured: false,
      connectorName: "remittance",
      liveContractStatus: "deferred_verify_v3",
      mode: "synthetic-source-table-schema-required",
      sourceTableName: "recoup_src_remittance"
    });
    expect(new TpmReadOnlyAdapter(undefined, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).describeReadiness()).toMatchObject({
      configured: false,
      connectorName: "tpm",
      liveContractStatus: "deferred_verify_v3",
      mode: "synthetic-source-table-schema-required",
      sourceTableName: "recoup_src_tpm"
    });
  });

  it("loads the Forensics settlement run from Supabase source tables without using static rows", async () => {
    const calls: string[] = [];
    const reader = createSupabaseSettlementRunReader({
      fetcher: (url, init) => {
        calls.push(url);
        expect(init.headers).toMatchObject({
          apikey: "supabase-service-secret",
          authorization: "Bearer supabase-service-secret"
        });

        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "recoup_customers") {
          return Promise.resolve(jsonResponse([
            {
              customer_id: "CUST-GREENLEAF",
              name: "Greenleaf Naturals",
              profile: "Regional wholesaler"
            }
          ]));
        }
        if (tableName === "recoup_deduction_lines") {
          return Promise.resolve(jsonResponse([
            {
              amount: "2700.00",
              customer_id: "CUST-GREENLEAF",
              event_id: "0000000000000000000000000000000000000000000000000000000000000001",
              line_id: "S1-L1",
              period: "2026-06",
              record_ids_json: ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"],
              routing: "billing",
              rule_id: "damage-evidence-valid",
              rule_input_json: baseLine.ruleInput,
              scenario_id: "S1",
              scenario_type: "Damaged product, evidence received",
              verdict: "valid"
            }
          ]));
        }

        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      seed: 42,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    const settlementRun = await reader.loadSettlementRun();

    expect(settlementRun.customers).toEqual([
      {
        customerId: "CUST-GREENLEAF",
        name: "Greenleaf Naturals",
        profile: "Regional wholesaler"
      }
    ]);
    const [line] = settlementRun.deductionLines;
    if (line === undefined) {
      throw new Error("Expected a Supabase-backed settlement line.");
    }
    expect(typeof line.amount.toFixed).toBe("function");
    expect(line).toMatchObject({
      customerId: "CUST-GREENLEAF",
      lineId: "S1-L1",
      recordIds: ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"],
      routing: "billing",
      verdict: "valid"
    });
    expect(line.amount.toFixed(2)).toBe("2700.00");
    expect(calls.some((url) => url.includes("/rest/v1/recoup_customers"))).toBe(true);
    expect(calls.some((url) => url.includes("/rest/v1/recoup_deduction_lines"))).toBe(true);
  });

  it("fails closed when Supabase settlement rows are incomplete", async () => {
    const reader = createSupabaseSettlementRunReader({
      fetcher: (url) => {
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === "recoup_customers") {
          return Promise.resolve(jsonResponse([]));
        }
        if (tableName === "recoup_deduction_lines") {
          return Promise.resolve(jsonResponse([]));
        }
        throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
      },
      seed: 42,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(reader.loadSettlementRun()).rejects.toThrow("Supabase settlement source rows are incomplete.");
  });

  it("builds a sync SourcePort only from already-loaded Supabase snapshots", () => {
    const settlementRun = buildSyntheticDataset({ seed: 42 });
    const source = sourcePortFromSupabaseSnapshots({
      settlementRun,
      riskObservationSnapshot: undefined
    });

    expect(source.loadSettlementRun().deductionLines).toHaveLength(20);
    expect(source.loadRiskObservationSnapshot("CUST-HARBOR")).toBeUndefined();
  });

  it("does not report a supplied non-SAP live source contract as Day-1 readiness", () => {
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

    const readiness = new DocRepoReadOnlyAdapter(contract, [
      "DOCS_REPO_TOKEN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ]).describeReadiness();

    expect(readiness).toMatchObject({
      configured: false,
      connectorName: "docs-repo",
      liveContractStatus: "deferred_verify_v3",
      mode: "synthetic-source-table-schema-required",
      sourceTableName: "recoup_src_docs"
    });
    expect(JSON.stringify(readiness)).not.toContain("docs.example.test");
  });

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

  it("keeps supplied live source contracts deferred before checking connector credentials", () => {
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
      reason:
        "Document repository live source reads are deferred to VERIFY-V3; Day-1 source readiness uses synthetic Supabase source table recoup_src_docs.",
      requests: []
    });
  });

  it("does not build live non-SAP GET plans while VERIFY-V3 source contracts are deferred", () => {
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

    for (const plan of plans) {
      expect(plan.configured).toBe(false);
      if (plan.configured) {
        throw new Error("Non-SAP live read plans must stay disabled until VERIFY-V3.");
      }
      expect(plan.requests).toEqual([]);
      expect(plan.reason).toContain("VERIFY-V3");
      expect(plan.reason).toContain("synthetic Supabase source table");
    }
    expect(JSON.stringify(plans)).not.toContain("example.test");
    expect(JSON.stringify(plans)).not.toContain("TOKEN");
    expect(JSON.stringify(plans)).not.toContain("secret");
  });

  it("reads non-SAP synthetic Supabase source rows as canonical evidence with synthetic provenance", async () => {
    const requestedTables: string[] = [];
    const fetcher: SupabaseSyntheticSourceFetch = (url, init) => {
      const parsedUrl = new URL(url);
      const tableName = parsedUrl.pathname.split("/").at(-1);
      if (tableName === undefined) {
        throw new Error("Expected Supabase source table in request URL.");
      }
      requestedTables.push(tableName);

      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.headers).toMatchObject({
        apikey: "service-role-redacted",
        authorization: "Bearer service-role-redacted"
      });
      expect(parsedUrl.searchParams.get("customer_id")).toBe(`eq.${line.customerId}`);

      return Promise.resolve(
        new Response(JSON.stringify(rowsBySyntheticTable[tableName] ?? []), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const reader = createSupabaseSyntheticSourceReader({
      fetcher,
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    const docs = await new DocRepoReadOnlyAdapter(undefined, [], reader).retrieveSyntheticEvidence(line);
    const tpm = await new TpmReadOnlyAdapter(undefined, [], reader).retrieveSyntheticEvidence(line);
    const bureau = await new BureauReadOnlyAdapter(undefined, [], reader).retrieveSyntheticEvidence(line);
    const remittance = await new RemittanceReadOnlyAdapter(undefined, [], reader).retrieveSyntheticEvidence(line);
    const edi = await new EdiRemittanceReadOnlyAdapter(undefined, [], reader).retrieveSyntheticEvidence(line);
    const allEvidence = [...docs, ...tpm, ...bureau, ...remittance, ...edi];

    expect(requestedTables.sort()).toEqual([
      "recoup_src_bureau",
      "recoup_src_docs",
      "recoup_src_remittance",
      "recoup_src_tpm"
    ]);
    expect(allEvidence.map((evidence) => evidence.provenance)).toEqual(Array<"synthetic">(5).fill("synthetic"));
    expect(allEvidence.map((evidence) => evidence.source).sort()).toEqual([
      "bureau",
      "docs",
      "remittance",
      "remittance",
      "tpm"
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ documentId: "DOC-POD-1", documentType: "POD" });
    expect(docs[0]?.recordIds).toContain(line.lineId);
    expect(docs[0]?.recordIds).toContain("DOC-POD-1");

    expect(tpm).toHaveLength(1);
    expect(tpm[0]).toMatchObject({ documentId: "TPM-PROMO-1", documentType: "trade-promo" });
    expect(tpm[0]?.recordIds).toContain(line.lineId);
    expect(tpm[0]?.recordIds).toContain("TPM-PROMO-1");

    expect(bureau).toHaveLength(1);
    expect(bureau[0]).toMatchObject({ documentId: "BUREAU-SIGNAL-1", documentType: "bureau-signal" });
    expect(bureau[0]?.recordIds).toContain(line.lineId);
    expect(bureau[0]?.recordIds).toContain(line.customerId);
    expect(bureau[0]?.recordIds).toContain("BUREAU-SIGNAL-1");

    expect(remittance).toHaveLength(1);
    expect(remittance[0]).toMatchObject({ documentId: "REMIT-ADVICE-1", documentType: "remittance-advice" });
    expect(remittance[0]?.recordIds).toContain(line.lineId);
    expect(remittance[0]?.recordIds).toContain("REMIT-ADVICE-1");

    expect(edi).toHaveLength(1);
    expect(edi[0]).toMatchObject({ documentId: "EDI-812-1", documentType: "edi-remittance" });
    expect(edi[0]?.recordIds).toContain(line.lineId);
    expect(edi[0]?.recordIds).toContain("EDI-812-1");
  });

  it("reads SAP OData cache rows from Supabase source rows without prefix-derived fallback evidence", async () => {
    const calls: string[] = [];
    const reader = createSupabaseSapEvidenceReader({
      fetcher: (url, init) => {
        calls.push(url);
        const parsedUrl = new URL(url);

        expect(init.method).toBe("GET");
        expect(init.body).toBeUndefined();
        expect(init.headers).toMatchObject({
          apikey: "service-role-redacted",
          authorization: "Bearer service-role-redacted"
        });
        expect(parsedUrl.pathname.endsWith("/recoup_src_sap")).toBe(true);
        expect(parsedUrl.searchParams.get("customer_id")).toBe(`eq.${line.customerId}`);

        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                document_type: "invoice",
                entity_set: "C_BillingDocumentFs",
                linked_record_ids: [line.lineId, "INV-SHOULD-NOT-MATCH"],
                payload_json: { BillingDocument: "90000002" },
                provenance: "sap-odata",
                retrieved_at: "2026-06-20T00:00:00.000Z",
                sap_document_id: "SAP-90000002",
                service_name: "ZUI_BILLINGDOCUMENTFS_0001",
                summary: "Supabase SAP source row for invoice 90000002."
              }
            ]),
            { status: 200 }
          )
        );
      },
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).resolves.toEqual([
      {
        documentId: "SAP-90000002",
        documentType: "invoice",
        provenance: "sap-odata",
        recordIds: [line.lineId, "SAP-90000002", "INV-SHOULD-NOT-MATCH"],
        source: "sap",
        summary: "Supabase SAP source row for invoice 90000002."
      }
    ]);
    expect(calls).toHaveLength(1);
  });

  it("returns no SAP source evidence when the Supabase SAP source table has no matching rows", async () => {
    const reader = createSupabaseSapEvidenceReader({
      fetcher: () => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).resolves.toEqual([]);
  });

  it("reuses Supabase source table reads per customer while preserving line-specific evidence filtering", async () => {
    const firstLine = {
      ...line,
      lineId: "S1-L1",
      recordIds: ["S1-L1", "DOC-POD-1", "INV-S1-1"]
    };
    const secondLine = {
      ...line,
      lineId: "S1-L2",
      recordIds: ["S1-L2", "DOC-POD-2", "INV-S1-2"]
    };
    const calls: string[] = [];
    const fetcher: SupabaseSyntheticSourceFetch = (url) => {
      calls.push(url);
      const tableName = new URL(url).pathname.split("/").at(-1);
      if (tableName === "recoup_src_docs") {
        return Promise.resolve(jsonResponse([
          {
            customer_id: line.customerId,
            doc_id: "DOC-POD-1",
            doc_type: "POD",
            linked_record_ids: ["S1-L1", "DOC-POD-1"],
            provenance: "synthetic",
            signed_date: "2026-06-20",
            uri: "supabase://recoup_src_docs/DOC-POD-1"
          },
          {
            customer_id: line.customerId,
            doc_id: "DOC-POD-2",
            doc_type: "POD",
            linked_record_ids: ["S1-L2", "DOC-POD-2"],
            provenance: "synthetic",
            signed_date: "2026-06-20",
            uri: "supabase://recoup_src_docs/DOC-POD-2"
          }
        ]));
      }
      if (tableName === "recoup_src_sap") {
        return Promise.resolve(jsonResponse([
          {
            customer_id: line.customerId,
            document_type: "invoice",
            entity_set: "C_BillingDocumentFs",
            linked_record_ids: ["S1-L1", "INV-S1-1"],
            payload_json: { BillingDocument: "S1-1" },
            provenance: "sap-odata",
            retrieved_at: "2026-06-20T00:00:00.000Z",
            sap_document_id: "SAP-INV-S1-1",
            service_name: "ZUI_BILLINGDOCUMENTFS_0001",
            summary: "Supabase SAP source row for INV-S1-1."
          },
          {
            customer_id: line.customerId,
            document_type: "invoice",
            entity_set: "C_BillingDocumentFs",
            linked_record_ids: ["S1-L2", "INV-S1-2"],
            payload_json: { BillingDocument: "S1-2" },
            provenance: "sap-odata",
            retrieved_at: "2026-06-20T00:00:00.000Z",
            sap_document_id: "SAP-INV-S1-2",
            service_name: "ZUI_BILLINGDOCUMENTFS_0001",
            summary: "Supabase SAP source row for INV-S1-2."
          }
        ]));
      }

      throw new Error(`Unexpected source table ${String(tableName)}.`);
    };
    const syntheticReader = createSupabaseSyntheticSourceReader({
      fetcher,
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });
    const sapReader = createSupabaseSapEvidenceReader({
      fetcher,
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(syntheticReader.readEvidence("docs-repo", firstLine)).resolves.toMatchObject([{ documentId: "DOC-POD-1" }]);
    await expect(syntheticReader.readEvidence("docs-repo", secondLine)).resolves.toMatchObject([{ documentId: "DOC-POD-2" }]);
    await expect(sapReader.readEvidence(firstLine)).resolves.toMatchObject([{ documentId: "SAP-INV-S1-1" }]);
    await expect(sapReader.readEvidence(secondLine)).resolves.toMatchObject([{ documentId: "SAP-INV-S1-2" }]);

    expect(calls.filter((url) => url.includes("/rest/v1/recoup_src_docs"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("/rest/v1/recoup_src_sap"))).toHaveLength(1);
  });

  it("fails closed when a SAP source row is not tagged with SAP OData provenance", async () => {
    const reader = createSupabaseSapEvidenceReader({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                document_type: "invoice",
                entity_set: "C_BillingDocumentFs",
                linked_record_ids: [line.lineId],
                payload_json: { BillingDocument: "90000002" },
                provenance: "synthetic",
                retrieved_at: "2026-06-20T00:00:00.000Z",
                sap_document_id: "SAP-90000002",
                service_name: "ZUI_BILLINGDOCUMENTFS_0001",
                summary: "Supabase SAP source row for invoice 90000002."
              }
            ]),
            { status: 200 }
          )
        ),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).rejects.toThrow();
  });

  it("fails closed when a SAP source row has malformed linked record ids", async () => {
    const reader = createSupabaseSapEvidenceReader({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                document_type: "invoice",
                entity_set: "C_BillingDocumentFs",
                linked_record_ids: line.lineId,
                payload_json: { BillingDocument: "90000002" },
                provenance: "sap-odata",
                retrieved_at: "2026-06-20T00:00:00.000Z",
                sap_document_id: "SAP-90000002",
                service_name: "ZUI_BILLINGDOCUMENTFS_0001",
                summary: "Supabase SAP source row for invoice 90000002."
              }
            ]),
            { status: 200 }
          )
        ),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).rejects.toThrow();
  });

  it("fails closed when a SAP header row contradicts linked SAP customer provenance", async () => {
    const reader = createSupabaseSapEvidenceReader({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                document_type: "invoice",
                entity_set: "C_BillingDocumentFs",
                linked_record_ids: [line.lineId, "USCU_S04", "INV-90000005"],
                payload_json: { d: { BillingDocument: "90000005", SoldToParty: "USCU_L02" } },
                provenance: "sap-odata",
                retrieved_at: "2026-06-20T00:00:00.000Z",
                sap_document_id: "SAP-90000005",
                service_name: "ZUI_BILLINGDOCUMENTFS_0001",
                summary: "Supabase SAP source row for invoice 90000005."
              }
            ]),
            { status: 200 }
          )
        ),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).rejects.toThrow();
  });

  it("fails closed when a SAP header row has mixed SAP customer provenance", async () => {
    const reader = createSupabaseSapEvidenceReader({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                document_type: "invoice",
                entity_set: "C_BillingDocumentFs",
                linked_record_ids: [line.lineId, "USCU_S04", "USCU_L02", "INV-90000005"],
                payload_json: { d: { BillingDocument: "90000005", SoldToParty: "USCU_S04" } },
                provenance: "sap-odata",
                retrieved_at: "2026-06-20T00:00:00.000Z",
                sap_document_id: "SAP-90000005",
                service_name: "ZUI_BILLINGDOCUMENTFS_0001",
                summary: "Supabase SAP source row for invoice 90000005."
              }
            ]),
            { status: 200 }
          )
        ),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).rejects.toThrow();
  });

  it("ignores SAP source rows that do not overlap the requested line records", async () => {
    const reader = createSupabaseSapEvidenceReader({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                document_type: "invoice",
                entity_set: "C_BillingDocumentFs",
                linked_record_ids: ["UNRELATED-LINE", "INV-90000002"],
                payload_json: { BillingDocument: "90000002" },
                provenance: "sap-odata",
                retrieved_at: "2026-06-20T00:00:00.000Z",
                sap_document_id: "SAP-90000002",
                service_name: "ZUI_BILLINGDOCUMENTFS_0001",
                summary: "Supabase SAP source row for invoice 90000002."
              }
            ]),
            { status: 200 }
          )
        ),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(reader.readEvidence(line)).resolves.toEqual([]);
  });

  it("fails closed when a synthetic source row is not tagged with synthetic provenance", async () => {
    const reader = createSupabaseSyntheticSourceReader({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                customer_id: line.customerId,
                doc_id: "DOC-POD-1",
                doc_type: "POD",
                linked_record_ids: [line.lineId],
                provenance: "live",
                uri: "supabase://recoup_src_docs/DOC-POD-1"
              }
            ]),
            { status: 200 }
          )
        ),
      serviceRoleKey: "service-role-redacted",
      url: "https://recoup.supabase.test/"
    });

    await expect(new DocRepoReadOnlyAdapter(undefined, [], reader).retrieveSyntheticEvidence(line)).rejects.toThrow();
  });

  it("fails closed when synthetic source retrieval is invoked without a Supabase reader", async () => {
    await expect(new DocRepoReadOnlyAdapter().retrieveSyntheticEvidence(line)).rejects.toThrow(
      "Document repository synthetic Supabase reader is not configured."
    );
  });

  it("reads cited document evidence from an OpenAI vector store without exposing the API key", async () => {
    const calls: Array<{ body?: string; headers: Headers; method?: string; url: string }> = [];
    const fetcher: OpenAiVectorStoreFetch = (url, init) => {
      calls.push({
        ...(typeof init.body === "string" ? { body: init.body } : {}),
        headers: new Headers(init.headers),
        ...(init.method === undefined ? {} : { method: init.method }),
        url
      });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                attributes: vectorAttributes(),
                content: [{ text: "Signed POD confirms delivery timing.", type: "text" }],
                file_id: "file-pod-1",
                filename: "greenleaf-pod.pdf",
                score: 0.91
              }
            ]
          }),
          { status: 200 }
        )
      );
    };
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher,
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    const docs = await reader.searchEvidence(line);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/vector_stores/vs_recoup_evidence_123456/search");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-live-secret");
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.body).toContain(line.lineId);
    expect(calls[0]?.body).toContain(line.customerId);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ max_num_results: 5 });
    expect(docs).toEqual([
      {
        documentId: "file-pod-1",
        documentType: "POD",
        fileName: "greenleaf-pod.pdf",
        provenance: "openai-vector-store",
        recordIds: [line.lineId, "DOC-POD-1"],
        score: 0.91,
        source: "docs",
        summary: "Signed POD confirms delivery timing."
      }
    ]);
    expect(JSON.stringify({ calls, docs })).not.toContain("sk-live-secret");
  });

  it("filters unrelated OpenAI vector-store hits and dedupes repeated files", async () => {
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: vectorAttributes({
                    documentType: "contract",
                    recordIds: ["UNRELATED"],
                    record_id: "DOC-UNRELATED"
                  }),
                  content: [{ text: "This chunk is unrelated.", type: "text" }],
                  file_id: "file-unrelated",
                  filename: "unrelated.pdf",
                  score: 0.99
                },
                {
                  attributes: vectorAttributes(),
                  content: [{ text: "First matching chunk.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 0.91
                },
                {
                  attributes: vectorAttributes(),
                  content: [{ text: "Duplicate matching chunk.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 0.9
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    const docs = await reader.searchEvidence(line);

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      documentId: "file-pod-1",
      recordIds: [line.lineId, "DOC-POD-1"],
      summary: "First matching chunk."
    });
  });

  it("does not attach customer-only vector metadata to a deduction", async () => {
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: vectorAttributes({
                    documentType: "contract",
                    recordIds: [line.customerId],
                    record_id: line.customerId
                  }),
                  content: [{ text: "Customer master contract without line evidence.", type: "text" }],
                  file_id: "file-customer-only",
                  filename: "customer-master.pdf",
                  score: 0.88
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    await expect(reader.searchEvidence(line)).resolves.toEqual([]);
  });

  it("fails closed for unsafe OpenAI vector-store max result settings", () => {
    expect(() =>
      createOpenAiVectorStoreEvidenceReader({
        apiKey: "sk-live-secret",
        maxResults: 0,
        vectorStoreId: "vs_recoup_evidence_123456"
      })
    ).toThrow("OpenAI vector-store maxResults must be an integer from 1 to 10.");
    expect(() =>
      createOpenAiVectorStoreEvidenceReader({
        apiKey: "sk-live-secret",
        maxResults: 11,
        vectorStoreId: "vs_recoup_evidence_123456"
      })
    ).toThrow("OpenAI vector-store maxResults must be an integer from 1 to 10.");
  });

  it("fails closed when OpenAI vector-store metadata is missing required provenance fields", async () => {
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    documentType: "POD",
                    recordIds: [line.lineId, "DOC-POD-1"]
                  },
                  content: [{ text: "Missing metadata must not become evidence.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    await expect(reader.searchEvidence(line)).rejects.toThrow();
  });

  it("fails closed when OpenAI vector-store metadata is not synthetic", async () => {
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: vectorAttributes({ provenance: "live" }),
                  content: [{ text: "Live provenance must not become evidence.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    await expect(reader.searchEvidence(line)).rejects.toThrow();
  });

  it("filters OpenAI vector-store hits for other customers or scenarios", async () => {
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: vectorAttributes({ customer_id: "CUST-OTHER" }),
                  content: [{ text: "Wrong customer.", type: "text" }],
                  file_id: "file-wrong-customer",
                  filename: "wrong-customer.pdf",
                  score: 0.93
                },
                {
                  attributes: vectorAttributes({ scenario_type: "other-scenario" }),
                  content: [{ text: "Wrong scenario.", type: "text" }],
                  file_id: "file-wrong-scenario",
                  filename: "wrong-scenario.pdf",
                  score: 0.92
                },
                {
                  attributes: vectorAttributes(),
                  content: [{ text: "Matching metadata.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    await expect(reader.searchEvidence(line)).resolves.toEqual([
      {
        documentId: "file-pod-1",
        documentType: "POD",
        fileName: "greenleaf-pod.pdf",
        provenance: "openai-vector-store",
        recordIds: [line.lineId, "DOC-POD-1"],
        score: 0.91,
        source: "docs",
        summary: "Matching metadata."
      }
    ]);
  });

  it("uses OpenAI vector-store record_id for relevance and deduped evidence citations", async () => {
    const reader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: vectorAttributes({
                    recordIds: ["DOC-SECONDARY"],
                    record_id: "DOC-POD-1"
                  }),
                  content: [{ text: "Record id match.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    await expect(reader.searchEvidence(line)).resolves.toMatchObject([
      {
        documentId: "file-pod-1",
        recordIds: ["DOC-SECONDARY", "DOC-POD-1"],
        summary: "Record id match."
      }
    ]);
  });

  it("fails closed on malformed OpenAI vector-store rows and non-2xx responses", async () => {
    const malformedReader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: vectorAttributes(),
                  content: [{ text: "Bad score.", type: "text" }],
                  file_id: "file-pod-1",
                  filename: "greenleaf-pod.pdf",
                  score: 1.5
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_recoup_evidence_123456"
    });
    const outageReader = createOpenAiVectorStoreEvidenceReader({
      apiKey: "sk-live-secret",
      fetcher: () => Promise.resolve(new Response(JSON.stringify({ error: "temporary outage" }), { status: 503 })),
      vectorStoreId: "vs_recoup_evidence_123456"
    });

    await expect(malformedReader.searchEvidence(line)).rejects.toThrow();
    await expect(outageReader.searchEvidence(line)).rejects.toThrow("OpenAI vector-store search failed with HTTP 503.");
  });

  it("fails closed when OpenAI vector-store retrieval is invoked without an injected reader", async () => {
    await expect(new DocRepoReadOnlyAdapter().retrieveVectorStoreEvidence(line)).rejects.toThrow(
      "OpenAI vector-store evidence reader is not configured."
    );
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
      const expectedMethodNames =
        prototype === DocRepoReadOnlyAdapter.prototype
          ? [
              "buildReadRequestPlan",
              "constructor",
              "describeReadiness",
              "retrieveSyntheticEvidence",
              "retrieveVectorStoreEvidence"
            ]
          : ["buildReadRequestPlan", "constructor", "describeReadiness", "retrieveSyntheticEvidence"];

      expect(methodNames).toEqual(expectedMethodNames);
      expect(methodNames.some((methodName) => /create|update|delete|patch|post|write|mutate/i.test(methodName))).toBe(false);
    }
  });
});

const rowsBySyntheticTable: Record<string, unknown[]> = {
  recoup_src_bureau: [
    {
      as_of_date: "2026-06-01",
      bureau_id: "BUREAU-SIGNAL-1",
      customer_id: line.customerId,
      delinquency_flag: true,
      limit_recommendation: "100000.00",
      provenance: "synthetic",
      public_records: {},
      risk_score: 72
    }
  ],
  recoup_src_docs: [
    {
      customer_id: line.customerId,
      doc_id: "DOC-POD-1",
      doc_type: "POD",
      linked_record_ids: [line.lineId, "DOC-POD-1"],
      provenance: "synthetic",
      signed_date: "2026-06-01",
      uri: "supabase://recoup_src_docs/DOC-POD-1"
    },
    {
      customer_id: line.customerId,
      doc_id: "DOC-UNRELATED",
      doc_type: "contract",
      linked_record_ids: ["UNRELATED"],
      provenance: "synthetic",
      uri: "supabase://recoup_src_docs/DOC-UNRELATED"
    }
  ],
  recoup_src_remittance: [
    {
      currency: "USD",
      customer_id: line.customerId,
      deduction_refs: [line.lineId],
      invoice_refs: ["INV-GREENLEAF-1"],
      paid_amount: "100.00",
      payment_date: "2026-06-01",
      provenance: "synthetic",
      remit_id: "REMIT-ADVICE-1",
      transaction_set: "820"
    },
    {
      currency: "USD",
      customer_id: line.customerId,
      deduction_refs: [line.lineId],
      invoice_refs: ["INV-GREENLEAF-1"],
      paid_amount: "100.00",
      payment_date: "2026-06-01",
      provenance: "synthetic",
      remit_id: "EDI-812-1",
      transaction_set: "812"
    },
    {
      currency: "USD",
      customer_id: line.customerId,
      deduction_refs: ["UNRELATED"],
      invoice_refs: ["INV-OTHER"],
      paid_amount: "100.00",
      payment_date: "2026-06-01",
      provenance: "synthetic",
      remit_id: "REMIT-UNRELATED",
      transaction_set: "manual"
    }
  ],
  recoup_src_tpm: [
    {
      accrued_amount: "90.00",
      approved_allowance: "100.00",
      claim_refs: [line.lineId, "TPM-PROMO-1"],
      customer_id: line.customerId,
      product_scope: {},
      promo_id: "TPM-PROMO-1",
      promo_type: "allowance",
      provenance: "synthetic",
      window_end: "2026-06-30",
      window_start: "2026-06-01"
    }
  ]
};

function vectorAttributes(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customer_id: line.customerId,
    documentType: "POD",
    provenance: "synthetic",
    record_id: "DOC-POD-1",
    recordIds: [line.lineId, "DOC-POD-1"],
    scenario_type: line.scenarioType,
    source_table: "recoup_src_docs",
    ...overrides
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
