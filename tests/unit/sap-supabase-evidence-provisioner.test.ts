import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import {
  parseSapODataMetadata,
  SapODataReadOnlyAdapter,
  type SapODataReadRequest
} from "../../src/adapters/sapOData.js";
import {
  assertCompleteSapSupabaseEvidenceProvisioning,
  buildSapSupabaseEvidenceRows,
  type SapSupabaseEvidenceRow,
  type SapSupabaseEvidenceSourceLink
} from "../../src/services/sapSupabaseEvidenceProvisioner.js";
import type { DeductionLine } from "../../src/types/entities.js";

describe("SAP to Supabase evidence provisioner", () => {
  it("produces header and item recoup_src_sap rows from metadata-planned SAP reads", async () => {
    const line = mayaLine();
    const link = sapLink(line);
    const fetcher = recordingSapFetcher({
      "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
      "billing-document-items": {
        d: { results: [{ BillingDocument: "90000002", BillingDocumentItem: "10", Material: "NB-100" }] }
      }
    });

    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: fetcher,
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [link]
    });

    expect(fetcher.requests.map((request) => request.purpose)).toEqual(["billing-document", "billing-document-items"]);
    expect(result.diagnostics).toEqual([]);
    expect(result.rows).toEqual([
      {
        customer_id: line.customerId,
        document_type: "invoice",
        entity_set: "C_BillingDocumentFs",
        linked_record_ids: [
          line.lineId,
          "INV-S1-1",
          "PHOTO-CARRIER-1",
          "INV-90000002",
          "BP-GREENLEAF",
          "SOURCE:docs/Tools_data/seed_data.sql",
          ...link.sourceRecordIds
        ],
        payload_json: { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
        provenance: "sap-odata",
        retrieved_at: "2026-06-24T00:00:00.000Z",
        sap_document_id: "SAP-90000002",
        service_name: "ZUI_BILLINGDOCUMENTFS_0001",
        summary: "SAP OData billing-document 90000002 retrieved through read-only mapping."
      },
      {
        customer_id: line.customerId,
        document_type: "invoice",
        entity_set: "C_BillingDocumentItemFs",
        linked_record_ids: [
          line.lineId,
          "INV-S1-1",
          "PHOTO-CARRIER-1",
          "INV-90000002",
          "BP-GREENLEAF",
          "SOURCE:docs/Tools_data/seed_data.sql",
          ...link.sourceRecordIds
        ],
        payload_json: {
          d: { results: [{ BillingDocument: "90000002", BillingDocumentItem: "10", Material: "NB-100" }] }
        },
        provenance: "sap-odata",
        retrieved_at: "2026-06-24T00:00:00.000Z",
        sap_document_id: "SAP-C_BillingDocumentItemFs:90000002",
        service_name: "ZUI_BILLINGDOCUMENTFS_0001",
        summary:
          "SAP OData billing-document-items C_BillingDocumentItemFs:90000002 retrieved through read-only mapping."
      }
    ]);
  });

  it("keeps only the header row when SAP returns an empty item collection", async () => {
    const line = mayaLine();
    const fetcher = recordingSapFetcher({
      "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
      "billing-document-items": { d: { results: [] } }
    });

    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: fetcher,
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [sapLink(line)]
    });

    expect(result.rows.map((row) => row.sap_document_id)).toEqual(["SAP-90000002"]);
    expect(result.diagnostics).toEqual([
      {
        code: "sap-read-empty-result",
        invoiceRef: "90000002",
        lineId: line.lineId,
        message: "SAP OData billing-document-items returned no evidence row.",
        sourceName: "docs/Tools_data/seed_data.sql"
      }
    ]);
  });

  it("merges linked record ids when multiple lines share one SAP invoice document", async () => {
    const firstLine = mayaLine();
    const secondLine = {
      ...mayaLine(),
      lineId: "S1-L2",
      recordIds: ["S1-L2", "INV-S1-2", "PHOTO-CARRIER-2"]
    };
    const fetcher = recordingSapFetcher({
      "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
      "billing-document-items": {
        d: { results: [{ BillingDocument: "90000002", BillingDocumentItem: "10", Material: "NB-100" }] }
      }
    });

    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: fetcher,
      lines: [firstLine, secondLine],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [sapLink(firstLine), sapLink(secondLine)]
    });

    expect(result.rows.map((row) => row.sap_document_id)).toEqual([
      "SAP-90000002",
      "SAP-C_BillingDocumentItemFs:90000002"
    ]);
    expect(result.rows[0]?.linked_record_ids).toEqual([
      "S1-L1",
      "INV-S1-1",
      "PHOTO-CARRIER-1",
      "INV-90000002",
      "BP-GREENLEAF",
      "SOURCE:docs/Tools_data/seed_data.sql",
      "TOOLS-DATA:S1",
      "POD-90000002",
      "S1-L2",
      "INV-S1-2",
      "PHOTO-CARRIER-2"
    ]);
    expect(result.rows[1]?.linked_record_ids).toEqual(result.rows[0]?.linked_record_ids);
  });

  it("fails closed with diagnostics when a line has no explicit approved source link", async () => {
    const line = mayaLine();
    const fetcher = recordingSapFetcher({});

    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: fetcher,
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: []
    });

    expect(result.rows).toEqual([]);
    expect(fetcher.requests).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "missing-explicit-source-link",
        lineId: line.lineId,
        message: "No explicit SAP source link was provided for deduction line."
      }
    ]);
  });

  it("fails closed when an explicit link does not match the deduction customer", async () => {
    const line = mayaLine();
    const fetcher = recordingSapFetcher({});

    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: fetcher,
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [{ ...sapLink(line), customerId: "CUST-HARBOR" }]
    });

    expect(result.rows).toEqual([]);
    expect(fetcher.requests).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "source-link-customer-mismatch",
        invoiceRef: "90000002",
        lineId: line.lineId,
        message: "SAP source link customer does not match deduction line customer.",
        sourceName: "docs/Tools_data/seed_data.sql"
      }
    ]);
  });

  it("does not create SAP reads for non-numeric invoice references", async () => {
    const line = mayaLine();
    const fetcher = recordingSapFetcher({});

    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: fetcher,
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [{ ...sapLink(line), invoiceRef: "INV-S1-1" }]
    });

    expect(result.rows).toEqual([]);
    expect(fetcher.requests).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "source-link-nonnumeric-invoice-ref",
        invoiceRef: "INV-S1-1",
        lineId: line.lineId,
        message: "SAP source link invoiceRef is not numeric; no SAP read was planned.",
        sourceName: "docs/Tools_data/seed_data.sql"
      }
    ]);
  });

  it("does not serialize SAP credentials into provisioned row output", async () => {
    const line = mayaLine();
    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter("client-secret"),
      client: recordingSapFetcher({
        "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
        "billing-document-items": { d: { results: [] } }
      }),
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [sapLink(line)]
    });

    expect(JSON.stringify(result)).not.toContain("client-secret");
  });

  it("retains the structured SAP customer id even when source record ids omit it", async () => {
    const line = mayaLine();
    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: recordingSapFetcher({
        "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
        "billing-document-items": { d: { results: [] } }
      }),
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [{ ...sapLink(line), sourceRecordIds: ["TOOLS-DATA:S1"] }]
    });

    expect(result.rows[0]?.linked_record_ids).toContain("BP-GREENLEAF");
  });

  it("rejects SAP header payloads that do not match the approved invoice link", async () => {
    const line = mayaLine();
    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: recordingSapFetcher({
        "billing-document": { d: { BillingDocument: "90000003", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
        "billing-document-items": {
          d: { results: [{ BillingDocument: "90000002", BillingDocumentItem: "10", Material: "NB-100" }] }
        }
      }),
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [sapLink(line)]
    });

    expect(result.rows.map((row) => row.sap_document_id)).not.toContain("SAP-90000003");
    expect(result.diagnostics).toContainEqual({
      code: "sap-read-payload-document-mismatch",
      invoiceRef: "90000002",
      lineId: line.lineId,
      message: "SAP OData billing-document payload did not match the approved invoice reference.",
      sourceName: "docs/Tools_data/seed_data.sql"
    });
  });

  it("rejects SAP header payloads that do not match the approved SAP customer", async () => {
    const line = mayaLine();
    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: recordingSapFetcher({
        "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-HARBOR" } },
        "billing-document-items": {
          d: { results: [{ BillingDocument: "90000002", BillingDocumentItem: "10", Material: "NB-100" }] }
        }
      }),
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [sapLink(line)]
    });

    expect(result.rows.map((row) => row.entity_set)).not.toContain("C_BillingDocumentFs");
    expect(result.diagnostics).toContainEqual({
      code: "sap-read-payload-customer-mismatch",
      invoiceRef: "90000002",
      lineId: line.lineId,
      message: "SAP OData billing-document payload did not match the approved SAP customer.",
      sourceName: "docs/Tools_data/seed_data.sql"
    });
  });

  it("rejects SAP item collections with mixed billing documents", async () => {
    const line = mayaLine();
    const result = await buildSapSupabaseEvidenceRows({
      adapter: sapAdapter(),
      client: recordingSapFetcher({
        "billing-document": { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
        "billing-document-items": {
          d: {
            results: [
              { BillingDocument: "90000002", BillingDocumentItem: "10", Material: "NB-100" },
              { BillingDocument: "90000003", BillingDocumentItem: "20", Material: "NB-200" }
            ]
          }
        }
      }),
      lines: [line],
      metadata: billingMetadataByService(),
      retrievedAt: "2026-06-24T00:00:00.000Z",
      sourceLinks: [sapLink(line)]
    });

    expect(result.rows.map((row) => row.entity_set)).not.toContain("C_BillingDocumentItemFs");
    expect(result.diagnostics).toContainEqual({
      code: "sap-read-payload-document-mismatch",
      invoiceRef: "90000002",
      lineId: line.lineId,
      message: "SAP OData billing-document-items payload did not match the approved invoice reference.",
      sourceName: "docs/Tools_data/seed_data.sql"
    });
  });

  it("fails completion when SAP provisioning has diagnostics even if rows were produced", () => {
    const line = mayaLine();

    expect(() => {
      assertCompleteSapSupabaseEvidenceProvisioning({
        diagnostics: [
          {
            code: "sap-read-empty-result",
            invoiceRef: "90000002",
            lineId: line.lineId,
            message: "SAP OData billing-document-items returned no evidence row.",
            sourceName: "docs/Tools_data/seed_data.sql"
          }
        ],
        lines: [line],
        rows: [sapEvidenceRow(line)]
      });
    }).toThrow("SAP OData provisioning failed closed with diagnostics for line S1-L1.");
  });

  it("fails completion when any deduction line lacks SAP evidence coverage", () => {
    const coveredLine = mayaLine();
    const uncoveredLine = { ...mayaLine(), lineId: "S1-L2", recordIds: ["S1-L2", "INV-S1-2"] };

    expect(() => {
      assertCompleteSapSupabaseEvidenceProvisioning({
        diagnostics: [],
        lines: [coveredLine, uncoveredLine],
        rows: [sapEvidenceRow(coveredLine)]
      });
    }).toThrow("SAP OData provisioning missing recoup_src_sap coverage for line S1-L2.");
  });

  it("accepts completion only when diagnostics are empty and every deduction line is covered", () => {
    const line = mayaLine();

    expect(() => {
      assertCompleteSapSupabaseEvidenceProvisioning({
        diagnostics: [],
        lines: [line],
        rows: [sapEvidenceRow(line)]
      });
    }).not.toThrow();
  });
});

function mayaLine(): DeductionLine {
  const baseLine = buildSyntheticDataset({ seed: 42 }).deductionLines[0];
  if (baseLine === undefined) {
    throw new Error("Synthetic dataset must include at least one deduction line.");
  }

  return {
    ...baseLine,
    customerId: "CUST-GREENLEAF",
    lineId: "S1-L1",
    recordIds: ["S1-L1", "INV-S1-1", "PHOTO-CARRIER-1"]
  };
}

function sapLink(line: DeductionLine): SapSupabaseEvidenceSourceLink {
  return {
    customerId: line.customerId,
    invoiceRef: "90000002",
    lineId: line.lineId,
    sapCustomerId: "BP-GREENLEAF",
    sourceName: "docs/Tools_data/seed_data.sql",
    sourceRecordIds: ["TOOLS-DATA:S1", "POD-90000002"]
  };
}

function sapEvidenceRow(line: DeductionLine): SapSupabaseEvidenceRow {
  return {
    customer_id: line.customerId,
    document_type: "invoice",
    entity_set: "C_BillingDocumentFs",
    linked_record_ids: [line.lineId, "INV-90000002", "SOURCE:docs/Tools_data/seed_data.sql"],
    payload_json: { d: { BillingDocument: "90000002", BillingDocumentType: "F2", SoldToParty: "BP-GREENLEAF" } },
    provenance: "sap-odata",
    retrieved_at: "2026-06-24T00:00:00.000Z",
    sap_document_id: "SAP-90000002",
    service_name: "ZUI_BILLINGDOCUMENTFS_0001",
    summary: "SAP OData billing-document 90000002 retrieved through read-only mapping."
  };
}

function sapAdapter(clientSecret = ""): SapODataReadOnlyAdapter {
  return new SapODataReadOnlyAdapter({
    baseUrl: "https://sap.example.test",
    clientId: "client-id",
    clientSecret,
    sapClient: "100",
    scope: "api.sap.read",
    tenant: "northbay",
    tokenUrl: "https://sap.example.test/oauth/token"
  });
}

function recordingSapFetcher(payloads: Partial<Record<SapODataReadRequest["purpose"], unknown>>) {
  const requests: SapODataReadRequest[] = [];

  return {
    requests,
    fetchReadRequest(request: SapODataReadRequest): Promise<unknown> {
      requests.push(request);

      return Promise.resolve(payloads[request.purpose] ?? { d: {} });
    }
  };
}

function billingMetadataByService() {
  return {
    ZUI_BILLINGDOCUMENTFS_0001: parseSapODataMetadata(`
      <Schema Namespace="ZUI_BILLINGDOCUMENTFS_0001">
        <EntityType Name="C_BillingDocumentFsType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
          <Property Name="BillingDocumentType" Type="Edm.String" />
        </EntityType>
        <EntityType Name="C_BillingDocumentItemFsType">
          <Key>
            <PropertyRef Name="BillingDocument" />
            <PropertyRef Name="BillingDocumentItem" />
          </Key>
          <Property Name="BillingDocument" Type="Edm.String" />
          <Property Name="BillingDocumentItem" Type="Edm.String" />
          <Property Name="Material" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="C_BillingDocumentFs" EntityType="ZUI_BILLINGDOCUMENTFS_0001.C_BillingDocumentFsType" />
          <EntitySet Name="C_BillingDocumentItemFs" EntityType="ZUI_BILLINGDOCUMENTFS_0001.C_BillingDocumentItemFsType" />
        </EntityContainer>
      </Schema>
    `)
  };
}
