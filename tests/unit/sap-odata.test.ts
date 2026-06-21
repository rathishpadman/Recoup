import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import {
  buildODataKeyPredicate,
  buildParameterizedResultsPath,
  createSapODataReadOnlyAdapter,
  parseSapODataMetadata,
  SapODataReadOnlyAdapter,
  SapODataReadOnlyClient,
  validateSapODataMetadataCoverage
} from "../../src/adapters/sapOData.js";

describe("SAP OData read-only query mapping", () => {
  it("fails closed when SAP runtime credentials are absent", () => {
    const adapter = new SapODataReadOnlyAdapter();

    expect(adapter.describeReadiness()).toEqual({
      configured: false,
      mode: "synthetic-readonly-fallback",
      reason: "SAP OData credentials are not configured."
    });
  });

  it("creates a configured read-only adapter from complete runtime env without leaking secrets", () => {
    const adapter = createSapODataReadOnlyAdapter({
      SAP_ODATA_BASE_URL: "https://sap.example.test",
      SAP_ODATA_CLIENT: "100",
      SAP_ODATA_CLIENT_ID: "client-id",
      SAP_ODATA_CLIENT_SECRET: "client-secret",
      SAP_ODATA_TOKEN_URL: "https://sap.example.test/oauth/token",
      SAP_ODATA_SCOPE: "api.sap.read",
      SAP_ODATA_TENANT: "northbay"
    });

    expect(adapter.describeReadiness()).toEqual({
      baseUrl: "https://sap.example.test",
      configured: true,
      mode: "sap-odata-readonly",
      sapClient: "100",
      tenant: "northbay"
    });
    expect(JSON.stringify(adapter.describeReadiness())).not.toContain("client-secret");
  });

  it("validates live metadata coverage for mapped SAP services without exposing connection details", async () => {
    const fetchedServices: string[] = [];
    const proof = await validateSapODataMetadataCoverage({
      fetchMetadata(serviceName) {
        fetchedServices.push(serviceName);
        return Promise.resolve(toolsDataMetadata(serviceName));
      }
    });

    expect(fetchedServices.sort()).toEqual([
      "ZAPI_SALES_ORDER_SRV_0001",
      "ZUI_ACCRUALS_MANAGE_0001",
      "ZUI_BILLINGDOCUMENTFS_0001",
      "ZUI_CREDITACCOUNT_DISPLAY_0001"
    ]);
    expect(proof.ready).toBe(true);
    expect(proof.services).toHaveLength(4);
    expect(proof.mappings).toContainEqual({
      entitySet: "C_BillingDocumentFs",
      keyNames: ["BillingDocument"],
      purpose: "billing-document",
      ready: true,
      serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
    });
    expect(proof.mappings).toContainEqual({
      entitySet: "CreditAccountSummary",
      keyNames: ["BusinessPartner", "CreditSegment"],
      purpose: "reference-document",
      ready: true,
      serviceName: "ZUI_CREDITACCOUNT_DISPLAY_0001"
    });
    expect(proof.mappings.every((mapping) => mapping.ready)).toBe(true);
    expect(JSON.stringify(proof)).not.toContain("sap.example.test");
    expect(JSON.stringify(proof)).not.toContain("client-secret");
  });

  it("does not expose secret-bearing SAP connections through object serialization", () => {
    const connection = {
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    };
    const adapter = new SapODataReadOnlyAdapter(connection);
    const client = new SapODataReadOnlyClient(connection);

    expect(JSON.stringify(adapter)).not.toContain("client-secret");
    expect(JSON.stringify(client)).not.toContain("client-secret");
  });

  it("builds read-only S/4HANA OData request plans without secret values", () => {
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines.find((candidate) =>
      candidate.recordIds.some((recordId) => recordId.startsWith("INV-")) && candidate.recordIds.some((recordId) => recordId.startsWith("POD-"))
    );
    if (line === undefined) {
      throw new Error("Synthetic dataset must include at least one deduction line.");
    }
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });

    const plan = adapter.buildReadRequestPlan(line);

    expect(plan).toEqual({
      configured: false,
      reason: "SAP OData metadata is required before building request plans.",
      requests: []
    });
  });

  it("parses OData v2 metadata and builds parameterized CDS /Results paths", () => {
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="ZC_TOTALACCOUNTSRECEIVABLES_CDS">
        <EntityType Name="C_TOTALACCOUNTSRECEIVABLESParameters">
          <Key>
            <PropertyRef Name="P_DisplayCurrency" />
            <PropertyRef Name="P_KeyDate" />
            <PropertyRef Name="P_NetDueInterval1InDays" />
          </Key>
          <Property Name="P_DisplayCurrency" Type="Edm.String" />
          <Property Name="P_KeyDate" Type="Edm.DateTime" />
          <Property Name="P_NetDueInterval1InDays" Type="Edm.Int32" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="C_TOTALACCOUNTSRECEIVABLES" EntityType="ZC_TOTALACCOUNTSRECEIVABLES_CDS.C_TOTALACCOUNTSRECEIVABLESParameters" />
        </EntityContainer>
      </Schema>
    `);
    const keys = metadata.entitySets.C_TOTALACCOUNTSRECEIVABLES?.keys;

    expect(keys).toEqual([
      { name: "P_DisplayCurrency", type: "Edm.String" },
      { name: "P_KeyDate", type: "Edm.DateTime" },
      { name: "P_NetDueInterval1InDays", type: "Edm.Int32" }
    ]);
    expect(
      buildODataKeyPredicate(keys ?? [], {
        P_DisplayCurrency: "USD",
        P_KeyDate: "2026-06-19T00:00:00",
        P_NetDueInterval1InDays: 30
      })
    ).toBe("P_DisplayCurrency='USD',P_KeyDate=datetime'2026-06-19T00:00:00',P_NetDueInterval1InDays=30");
    expect(
      buildParameterizedResultsPath("C_TOTALACCOUNTSRECEIVABLES", keys ?? [], {
        P_DisplayCurrency: "USD",
        P_KeyDate: "2026-06-19T00:00:00",
        P_NetDueInterval1InDays: 30
      })
    ).toBe("/C_TOTALACCOUNTSRECEIVABLES(P_DisplayCurrency='USD',P_KeyDate=datetime'2026-06-19T00:00:00',P_NetDueInterval1InDays=30)/Results");
  });

  it("uses GET-only fetches for metadata and JSON reads through the read-only client", async () => {
    const calls: Array<{ headers: HeadersInit | undefined; method: string | undefined; url: string }> = [];
    const client = new SapODataReadOnlyClient(
      {
        baseUrl: "https://sap.example.test",
        clientId: "client-id",
        clientSecret: "",
        sapClient: "100",
        scope: "api.sap.read",
        tenant: "northbay",
        tokenUrl: "https://sap.example.test/oauth/token"
      },
      (url, init) => {
        calls.push({ headers: init?.headers, method: init?.method, url: stringifyRequestUrl(url) });
        return Promise.resolve(
          new Response(calls.length === 1 ? "<Schema />" : JSON.stringify({ d: { results: [{ Document: "INV-1" }] } }), {
            headers: { "content-type": calls.length === 1 ? "application/xml" : "application/json" },
            status: 200
          })
        );
      }
    );

    await client.fetchMetadata("ZUI_BILLINGDOCUMENTFS_0001");
    const payload = await client.fetchJson("ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs(BillingDocument='90000002')", {
      $format: "json",
      $select: "BillingDocument"
    });

    expect(payload).toEqual({ d: { results: [{ Document: "INV-1" }] } });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(calls[0]?.url).toBe(
      "https://sap.example.test/sap/opu/odata/sap/ZUI_BILLINGDOCUMENTFS_0001/$metadata?sap-client=100"
    );
    expect(calls[1]?.url).toBe(
      "https://sap.example.test/sap/opu/odata/sap/ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs(BillingDocument='90000002')?%24format=json&%24select=BillingDocument&sap-client=100"
    );
    expect(JSON.stringify(calls)).not.toContain("clientSecret");
  });

  it("requests an OAuth token once and attaches bearer auth to SAP read-only GETs", async () => {
    const calls: Array<{
      bodyKeys?: string[];
      clientSecretSubmitted?: boolean;
      headers: HeadersInit | undefined;
      method: string | undefined;
      url: string;
    }> = [];
    const client = new SapODataReadOnlyClient(
      {
        baseUrl: "https://sap.example.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        sapClient: "100",
        scope: "api.sap.read",
        tenant: "northbay",
        tokenUrl: "https://sap.example.test/oauth/token"
      },
      (url, init) => {
        const body = init?.body instanceof URLSearchParams ? init.body : undefined;
        calls.push({
          ...(body === undefined ? {} : { bodyKeys: [...body.keys()], clientSecretSubmitted: body.has("client_secret") }),
          headers: init?.headers,
          method: init?.method,
          url: stringifyRequestUrl(url)
        });
        return Promise.resolve(
          calls.length === 1
            ? new Response(JSON.stringify({ access_token: "sap-access-token", token_type: "Bearer" }), {
                headers: { "content-type": "application/json" },
                status: 200
              })
            : new Response(calls.length === 2 ? "<Schema />" : JSON.stringify({ d: { BillingDocument: "INV-1" } }), {
                headers: { "content-type": calls.length === 2 ? "application/xml" : "application/json" },
                status: 200
              })
        );
      }
    );

    await client.fetchMetadata("ZUI_BILLINGDOCUMENTFS_0001");
    await client.fetchJson("ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs(BillingDocument='90000002')", { $format: "json" });

    expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "GET"]);
    expect(calls[0]).toMatchObject({
      bodyKeys: ["grant_type", "client_id", "client_secret", "scope"],
      clientSecretSubmitted: true,
      url: "https://sap.example.test/oauth/token"
    });
    expect(calls[1]?.url).toBe(
      "https://sap.example.test/sap/opu/odata/sap/ZUI_BILLINGDOCUMENTFS_0001/$metadata?sap-client=100"
    );
    expect(calls[2]?.url).toBe(
      "https://sap.example.test/sap/opu/odata/sap/ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs(BillingDocument='90000002')?%24format=json&sap-client=100"
    );
    expect(calls[1]?.headers).toMatchObject({ Accept: "application/xml", Authorization: "Bearer sap-access-token" });
    expect(calls[2]?.headers).toMatchObject({ Accept: "application/json", Authorization: "Bearer sap-access-token" });
    expect(JSON.stringify(calls)).not.toContain("client-secret");
  });

  it("attaches Basic auth to SAP read-only GETs when a Gateway user id is configured", async () => {
    const calls: Array<{ headers: HeadersInit | undefined; method: string | undefined; url: string }> = [];
    const client = new SapODataReadOnlyClient(
      {
        authMode: "basic",
        baseUrl: "https://sap.example.test:44300",
        clientId: "",
        clientSecret: "sap-password",
        sapClient: "100",
        scope: "",
        tenant: "",
        tokenUrl: "",
        userId: "sap-user"
      },
      (url, init) => {
        calls.push({ headers: init?.headers, method: init?.method, url: stringifyRequestUrl(url) });
        return Promise.resolve(new Response("<Schema />", { headers: { "content-type": "application/xml" }, status: 200 }));
      }
    );

    await client.fetchMetadata("ZUI_BILLINGDOCUMENTFS_0001");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://sap.example.test:44300/sap/opu/odata/sap/ZUI_BILLINGDOCUMENTFS_0001/$metadata?sap-client=100"
    });
    expect(calls[0]?.headers).toMatchObject({
      Accept: "application/xml",
      Authorization: "Basic c2FwLXVzZXI6c2FwLXBhc3N3b3Jk"
    });
    expect(JSON.stringify(calls)).not.toContain("sap-password");
  });

  it("maps live SAP OData read responses into canonical evidence documents", async () => {
    const line = sapInvoiceLine();
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(toolsDataMetadata("ZUI_BILLINGDOCUMENTFS_0001"));
    const client = new SapODataReadOnlyClient(
      {
        baseUrl: "https://sap.example.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        sapClient: "100",
        scope: "api.sap.read",
        tenant: "northbay",
        tokenUrl: "https://sap.example.test/oauth/token"
      },
      (url, init) => {
        const requestUrl = stringifyRequestUrl(url);
        if (init?.method === "POST") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "sap-access-token" }), { status: 200 }));
        }
        expect(requestUrl).toContain("ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs(BillingDocument='90000002')");
        expect(requestUrl).toContain("sap-client=100");
        expect(requestUrl).toContain("%24format=json");
        const body = { d: { BillingDocument: "90000002" } };

        return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 }));
      }
    );

    const documents = await adapter.retrieveDeductionCaseLive(line, metadata, client);
    const invoice = documents.find((document) => document.documentId === "90000002");

    expect(invoice).toMatchObject({ documentId: "90000002", documentType: "invoice", source: "sap" });
    expect(invoice?.recordIds).toContain(line.lineId);
    expect(documents).toHaveLength(1);
    expect(JSON.stringify(documents)).not.toContain("client-secret");
  });

  it("uses service-scoped SAP metadata for Tools_data invoice reads", async () => {
    const line = sapInvoiceLine();
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadataByService = {
      ZUI_BILLINGDOCUMENTFS_0001: parseSapODataMetadata(toolsDataMetadata("ZUI_BILLINGDOCUMENTFS_0001"))
    };
    const client = new SapODataReadOnlyClient(
      {
        baseUrl: "https://sap.example.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        sapClient: "100",
        scope: "api.sap.read",
        tenant: "northbay",
        tokenUrl: "https://sap.example.test/oauth/token"
      },
      (url, init) => {
        const requestUrl = stringifyRequestUrl(url);
        if (init?.method === "POST") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "sap-access-token" }), { status: 200 }));
        }
        expect(requestUrl).toContain("ZUI_BILLINGDOCUMENTFS_0001");
        const body = { d: { BillingDocument: "90000002" } };

        return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 }));
      }
    );

    const documents = await adapter.retrieveDeductionCaseLive(line, metadataByService, client);

    expect(documents).toHaveLength(1);
    expect(documents.some((document) => document.documentId === "90000002" && document.documentType === "invoice")).toBe(true);
  });

  it("validates read-request mapping against parsed metadata before building real SAP paths", () => {
    const line = sapInvoiceLine();
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(toolsDataMetadata("ZUI_BILLINGDOCUMENTFS_0001"));

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan.configured).toBe(true);
    if (!plan.configured) {
      throw new Error("Expected configured metadata-validated SAP plan.");
    }
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0]?.url).toBe(
      "https://sap.example.test/sap/opu/odata/sap/ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs(BillingDocument='90000002')?sap-client=100"
    );
    expect(plan.requests[0]?.recordIds).toEqual([line.lineId, "INV-90000002"]);
    expect(JSON.stringify(plan)).not.toContain("clientSecret");
  });

  it("does not build live SAP read requests for non-numeric synthetic invoice record ids", () => {
    const line = sapInvoiceLine(["INV-S1-1"]);
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(toolsDataMetadata("ZUI_BILLINGDOCUMENTFS_0001"));

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan).toEqual({
      configured: true,
      requests: [],
      tenant: "northbay"
    });
    expect(JSON.stringify(plan)).not.toContain("INV-S1-1");
  });

  it("keeps the SAP synthetic fallback invoice-only so POD and reference evidence stay with non-SAP sources", () => {
    const line = sapInvoiceLine(["INV-90000002", "POD-SIGNED-1", "CREDIT-MEMO-1", "DUP-CLAIM-1"]);
    const adapter = new SapODataReadOnlyAdapter();

    expect(adapter.retrieveDeliveryItem(line)).toEqual([]);
    expect(adapter.retrieveReferenceDocuments(line)).toEqual([]);
    expect(adapter.retrieveDeductionCase(line)).toEqual([
      {
        documentId: "INV-90000002",
        documentType: "invoice",
        recordIds: [line.lineId, "INV-90000002"],
        source: "sap",
        summary: `Read-only SAP billing document for ${line.lineId}.`
      }
    ]);
  });

  it("fails closed when SAP metadata does not expose a required mapped entity set", () => {
    const line = sapInvoiceLine();
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="ZUI_BILLINGDOCUMENTFS_0001">
        <EntityType Name="C_BillingDocumentItemFsType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="C_BillingDocumentItemFs" EntityType="ZUI_BILLINGDOCUMENTFS_0001.C_BillingDocumentItemFsType" />
        </EntityContainer>
      </Schema>
    `);

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan).toEqual({
      configured: false,
      reason: "SAP metadata missing mapped entity set C_BillingDocumentFs.",
      requests: []
    });
  });

  it("fails closed when SAP metadata exposes composite keys that the invoice record mapping cannot satisfy", () => {
    const line = sapInvoiceLine();
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      sapClient: "100",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="ZUI_BILLINGDOCUMENTFS_0001">
        <EntityType Name="C_BillingDocumentFsType">
          <Key>
            <PropertyRef Name="BillingDocument" />
            <PropertyRef Name="BillingDocumentItem" />
          </Key>
          <Property Name="BillingDocument" Type="Edm.String" />
          <Property Name="BillingDocumentItem" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="C_BillingDocumentFs" EntityType="ZUI_BILLINGDOCUMENTFS_0001.C_BillingDocumentFsType" />
        </EntityContainer>
      </Schema>
    `);

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan).toEqual({
      configured: false,
      reason: "SAP metadata key set for mapped entity set C_BillingDocumentFs requires unsupported key BillingDocumentItem.",
      requests: []
    });
  });

  it("formats OData string literals with deterministic escaping and URL encoding", () => {
    expect(buildODataKeyPredicate([{ name: "BillingDocument", type: "Edm.String" }], { BillingDocument: "INV O'Brien/42" })).toBe(
      "BillingDocument='INV%20O%27%27Brien%2F42'"
    );
  });

  it("rejects empty OData key predicates instead of building malformed parameterized paths", () => {
    expect(() => buildODataKeyPredicate([], {})).toThrow("OData key predicates require at least one metadata key.");
    expect(() => buildParameterizedResultsPath("C_TOTALACCOUNTSRECEIVABLES", [], {})).toThrow(
      "OData key predicates require at least one metadata key."
    );
  });
});

function stringifyRequestUrl(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
}

function sapInvoiceLine(recordIds = ["INV-90000002"]) {
  const line = buildSyntheticDataset({ seed: 42 }).deductionLines[0];
  if (line === undefined) {
    throw new Error("Synthetic dataset must include at least one deduction line.");
  }

  return {
    ...line,
    lineId: "LINE-SAP-INVOICE",
    recordIds: ["LINE-SAP-INVOICE", ...recordIds]
  };
}

function toolsDataMetadata(serviceName: string): string {
  if (serviceName === "ZUI_BILLINGDOCUMENTFS_0001") {
    return `
      <Schema Namespace="ZUI_BILLINGDOCUMENTFS_0001">
        <EntityType Name="C_BillingDocumentFsType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
          <Property Name="BillingDocumentType" Type="Edm.String" />
          <Property Name="SoldToParty" Type="Edm.String" />
          <Property Name="TotalNetAmount" Type="Edm.Decimal" />
        </EntityType>
        <EntityType Name="C_BillingDocumentItemFsType">
          <Key>
            <PropertyRef Name="BillingDocument" />
            <PropertyRef Name="BillingDocumentItem" />
          </Key>
          <Property Name="BillingDocument" Type="Edm.String" />
          <Property Name="BillingDocumentItem" Type="Edm.String" />
          <Property Name="Material" Type="Edm.String" />
          <Property Name="NetAmount" Type="Edm.Decimal" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="C_BillingDocumentFs" EntityType="ZUI_BILLINGDOCUMENTFS_0001.C_BillingDocumentFsType" />
          <EntitySet Name="C_BillingDocumentItemFs" EntityType="ZUI_BILLINGDOCUMENTFS_0001.C_BillingDocumentItemFsType" />
        </EntityContainer>
      </Schema>
    `;
  }

  if (serviceName === "ZAPI_SALES_ORDER_SRV_0001") {
    return `
      <Schema Namespace="ZAPI_SALES_ORDER_SRV_0001">
        <EntityType Name="A_SalesOrderType">
          <Key><PropertyRef Name="SalesOrder" /></Key>
          <Property Name="SalesOrder" Type="Edm.String" />
          <Property Name="SoldToParty" Type="Edm.String" />
          <Property Name="TotalNetAmount" Type="Edm.Decimal" />
        </EntityType>
        <EntityType Name="A_SalesOrderItemType">
          <Key>
            <PropertyRef Name="SalesOrder" />
            <PropertyRef Name="SalesOrderItem" />
          </Key>
          <Property Name="SalesOrder" Type="Edm.String" />
          <Property Name="SalesOrderItem" Type="Edm.String" />
          <Property Name="Material" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="A_SalesOrder" EntityType="ZAPI_SALES_ORDER_SRV_0001.A_SalesOrderType" />
          <EntitySet Name="A_SalesOrderItem" EntityType="ZAPI_SALES_ORDER_SRV_0001.A_SalesOrderItemType" />
        </EntityContainer>
      </Schema>
    `;
  }

  if (serviceName === "ZUI_CREDITACCOUNT_DISPLAY_0001") {
    return `
      <Schema Namespace="ZUI_CREDITACCOUNT_DISPLAY_0001">
        <EntityType Name="CreditAccountSummaryType">
          <Key>
            <PropertyRef Name="BusinessPartner" />
            <PropertyRef Name="CreditSegment" />
          </Key>
          <Property Name="BusinessPartner" Type="Edm.String" />
          <Property Name="CreditSegment" Type="Edm.String" />
          <Property Name="CreditLimitAmount" Type="Edm.Decimal" />
          <Property Name="DaysSalesOutstanding" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="CreditAccountSummary" EntityType="ZUI_CREDITACCOUNT_DISPLAY_0001.CreditAccountSummaryType" />
        </EntityContainer>
      </Schema>
    `;
  }

  if (serviceName === "ZUI_ACCRUALS_MANAGE_0001") {
    return `
      <Schema Namespace="ZUI_ACCRUALS_MANAGE_0001">
        <EntityType Name="PeriodicAmountsType">
          <Property Name="AccrualObject" Type="Edm.String" />
          <Property Name="ActualAccrualItemType" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="PeriodicAmounts" EntityType="ZUI_ACCRUALS_MANAGE_0001.PeriodicAmountsType" />
        </EntityContainer>
      </Schema>
    `;
  }

  throw new Error(`Unexpected Tools_data SAP service ${serviceName}.`);
}
