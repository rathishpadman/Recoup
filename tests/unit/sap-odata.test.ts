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
      tenant: "northbay"
    });
    expect(JSON.stringify(adapter.describeReadiness())).not.toContain("client-secret");
  });

  it("validates live metadata coverage for mapped SAP services without exposing connection details", async () => {
    const fetchedServices: string[] = [];
    const proof = await validateSapODataMetadataCoverage({
      fetchMetadata(serviceName) {
        fetchedServices.push(serviceName);
        if (serviceName === "API_OUTBOUND_DELIVERY_SRV") {
          return Promise.resolve(`
            <Schema Namespace="API_OUTBOUND_DELIVERY_SRV">
              <EntityType Name="A_OutbDeliveryItemType">
                <Key><PropertyRef Name="DeliveryDocument" /></Key>
                <Property Name="DeliveryDocument" Type="Edm.String" />
              </EntityType>
              <EntityContainer>
                <EntitySet Name="A_OutbDeliveryItem" EntityType="API_OUTBOUND_DELIVERY_SRV.A_OutbDeliveryItemType" />
              </EntityContainer>
            </Schema>
          `);
        }

        return Promise.resolve(`
          <Schema Namespace="API_BILLING_DOCUMENT_SRV">
            <EntityType Name="A_BillingDocumentType">
              <Key><PropertyRef Name="BillingDocument" /></Key>
              <Property Name="BillingDocument" Type="Edm.String" />
            </EntityType>
            <EntityType Name="A_BillingDocumentItemType">
              <Key><PropertyRef Name="BillingDocument" /></Key>
              <Property Name="BillingDocument" Type="Edm.String" />
            </EntityType>
            <EntityContainer>
              <EntitySet Name="A_BillingDocument" EntityType="API_BILLING_DOCUMENT_SRV.A_BillingDocumentType" />
              <EntitySet Name="A_BillingDocumentItem" EntityType="API_BILLING_DOCUMENT_SRV.A_BillingDocumentItemType" />
            </EntityContainer>
          </Schema>
        `);
      }
    });

    expect(fetchedServices.sort()).toEqual(["API_BILLING_DOCUMENT_SRV", "API_OUTBOUND_DELIVERY_SRV"]);
    expect(proof.ready).toBe(true);
    expect(proof.services).toHaveLength(2);
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

    await client.fetchMetadata("API_BILLING_DOCUMENT_SRV");
    const payload = await client.fetchJson("API_BILLING_DOCUMENT_SRV/A_BillingDocument('INV-1')", {
      $format: "json",
      $select: "BillingDocument"
    });

    expect(payload).toEqual({ d: { results: [{ Document: "INV-1" }] } });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(calls[0]?.url).toBe("https://sap.example.test/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV/$metadata");
    expect(calls[1]?.url).toBe("https://sap.example.test/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV/A_BillingDocument('INV-1')?%24format=json&%24select=BillingDocument");
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

    await client.fetchMetadata("API_BILLING_DOCUMENT_SRV");
    await client.fetchJson("API_BILLING_DOCUMENT_SRV/A_BillingDocument('INV-1')", { $format: "json" });

    expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "GET"]);
    expect(calls[0]).toMatchObject({
      bodyKeys: ["grant_type", "client_id", "client_secret", "scope"],
      clientSecretSubmitted: true,
      url: "https://sap.example.test/oauth/token"
    });
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

    await client.fetchMetadata("FCOM_COSTCENTER_SRV");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://sap.example.test:44300/sap/opu/odata/sap/FCOM_COSTCENTER_SRV/$metadata"
    });
    expect(calls[0]?.headers).toMatchObject({
      Accept: "application/xml",
      Authorization: "Basic c2FwLXVzZXI6c2FwLXBhc3N3b3Jk"
    });
    expect(JSON.stringify(calls)).not.toContain("sap-password");
  });

  it("maps live SAP OData read responses into canonical evidence documents", async () => {
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines.find((candidate) =>
      candidate.recordIds.some((recordId) => recordId.startsWith("INV-")) && candidate.recordIds.some((recordId) => recordId.startsWith("POD-"))
    );
    if (line === undefined) {
      throw new Error("Synthetic dataset must include invoice and POD records.");
    }
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="API_BILLING_DOCUMENT_SRV">
        <EntityType Name="A_BillingDocumentType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
        </EntityType>
        <EntityType Name="A_OutbDeliveryItemType">
          <Key><PropertyRef Name="DeliveryDocument" /></Key>
          <Property Name="DeliveryDocument" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="A_BillingDocument" EntityType="API_BILLING_DOCUMENT_SRV.A_BillingDocumentType" />
          <EntitySet Name="A_OutbDeliveryItem" EntityType="API_BILLING_DOCUMENT_SRV.A_OutbDeliveryItemType" />
        </EntityContainer>
      </Schema>
    `);
    const client = new SapODataReadOnlyClient(
      {
        baseUrl: "https://sap.example.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        scope: "api.sap.read",
        tenant: "northbay",
        tokenUrl: "https://sap.example.test/oauth/token"
      },
      (url, init) => {
        const requestUrl = stringifyRequestUrl(url);
        if (init?.method === "POST") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "sap-access-token" }), { status: 200 }));
        }
        const body = requestUrl.includes("A_OutbDeliveryItem")
          ? { d: { DeliveryDocument: "POD-LIVE-1" } }
          : { d: { BillingDocument: "INV-LIVE-1" } };

        return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 }));
      }
    );

    const documents = await adapter.retrieveDeductionCaseLive(line, metadata, client);
    const invoice = documents.find((document) => document.documentId === "INV-LIVE-1");
    const pod = documents.find((document) => document.documentId === "POD-LIVE-1");

    expect(invoice).toMatchObject({ documentId: "INV-LIVE-1", documentType: "invoice", source: "sap" });
    expect(invoice?.recordIds).toContain(line.lineId);
    expect(pod).toMatchObject({ documentId: "POD-LIVE-1", documentType: "POD", source: "sap" });
    expect(pod?.recordIds).toContain(line.lineId);
    expect(JSON.stringify(documents)).not.toContain("client-secret");
  });

  it("uses service-scoped SAP metadata when live reads span multiple OData services", async () => {
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines.find((candidate) =>
      candidate.recordIds.some((recordId) => recordId.startsWith("INV-")) && candidate.recordIds.some((recordId) => recordId.startsWith("POD-"))
    );
    if (line === undefined) {
      throw new Error("Synthetic dataset must include invoice and POD records.");
    }
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "client-secret",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadataByService = {
      API_BILLING_DOCUMENT_SRV: parseSapODataMetadata(`
        <Schema Namespace="API_BILLING_DOCUMENT_SRV">
          <EntityType Name="A_BillingDocumentType">
            <Key><PropertyRef Name="BillingDocument" /></Key>
            <Property Name="BillingDocument" Type="Edm.String" />
          </EntityType>
          <EntityContainer>
            <EntitySet Name="A_BillingDocument" EntityType="API_BILLING_DOCUMENT_SRV.A_BillingDocumentType" />
          </EntityContainer>
        </Schema>
      `),
      API_OUTBOUND_DELIVERY_SRV: parseSapODataMetadata(`
        <Schema Namespace="API_OUTBOUND_DELIVERY_SRV">
          <EntityType Name="A_OutbDeliveryItemType">
            <Key><PropertyRef Name="DeliveryDocument" /></Key>
            <Property Name="DeliveryDocument" Type="Edm.String" />
          </EntityType>
          <EntityContainer>
            <EntitySet Name="A_OutbDeliveryItem" EntityType="API_OUTBOUND_DELIVERY_SRV.A_OutbDeliveryItemType" />
          </EntityContainer>
        </Schema>
      `)
    };
    const client = new SapODataReadOnlyClient(
      {
        baseUrl: "https://sap.example.test",
        clientId: "client-id",
        clientSecret: "client-secret",
        scope: "api.sap.read",
        tenant: "northbay",
        tokenUrl: "https://sap.example.test/oauth/token"
      },
      (url, init) => {
        const requestUrl = stringifyRequestUrl(url);
        if (init?.method === "POST") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "sap-access-token" }), { status: 200 }));
        }
        const body = requestUrl.includes("API_OUTBOUND_DELIVERY_SRV")
          ? { d: { DeliveryDocument: "POD-LIVE-1" } }
          : { d: { BillingDocument: "INV-LIVE-1" } };

        return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 }));
      }
    );

    const documents = await adapter.retrieveDeductionCaseLive(line, metadataByService, client);

    expect(documents.some((document) => document.documentId === "INV-LIVE-1" && document.documentType === "invoice")).toBe(true);
    expect(documents.some((document) => document.documentId === "POD-LIVE-1" && document.documentType === "POD")).toBe(true);
  });

  it("validates read-request mapping against parsed metadata before building real SAP paths", () => {
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines.find((candidate) =>
      candidate.recordIds.some((recordId) => recordId.startsWith("INV-")) && candidate.recordIds.some((recordId) => recordId.startsWith("POD-"))
    );
    if (line === undefined) {
      throw new Error("Synthetic dataset must include invoice and POD records.");
    }
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="API_BILLING_DOCUMENT_SRV">
        <EntityType Name="A_BillingDocumentType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
        </EntityType>
        <EntityType Name="A_OutbDeliveryItemType">
          <Key><PropertyRef Name="DeliveryDocument" /></Key>
          <Property Name="DeliveryDocument" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="A_BillingDocument" EntityType="API_BILLING_DOCUMENT_SRV.A_BillingDocumentType" />
          <EntitySet Name="A_OutbDeliveryItem" EntityType="API_BILLING_DOCUMENT_SRV.A_OutbDeliveryItemType" />
        </EntityContainer>
      </Schema>
    `);

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan.configured).toBe(true);
    if (!plan.configured) {
      throw new Error("Expected configured metadata-validated SAP plan.");
    }
    expect(plan.requests.some((request) => request.url.includes("A_BillingDocument(BillingDocument='INV-"))).toBe(true);
    expect(plan.requests.some((request) => request.url.includes("A_OutbDeliveryItem(DeliveryDocument='POD-"))).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("clientSecret");
  });

  it("fails closed when SAP metadata does not expose a required mapped entity set", () => {
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines.find((candidate) =>
      candidate.recordIds.some((recordId) => recordId.startsWith("INV-")) && candidate.recordIds.some((recordId) => recordId.startsWith("POD-"))
    );
    if (line === undefined) {
      throw new Error("Synthetic dataset must include invoice and POD records.");
    }
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="API_BILLING_DOCUMENT_SRV">
        <EntityType Name="A_BillingDocumentType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="A_BillingDocument" EntityType="API_BILLING_DOCUMENT_SRV.A_BillingDocumentType" />
        </EntityContainer>
      </Schema>
    `);

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan).toEqual({
      configured: false,
      reason: "SAP metadata missing mapped entity set A_OutbDeliveryItem.",
      requests: []
    });
  });

  it("fails closed when SAP metadata exposes composite keys that the record mapping cannot satisfy", () => {
    const line = buildSyntheticDataset({ seed: 42 }).deductionLines.find((candidate) =>
      candidate.recordIds.some((recordId) => recordId.startsWith("POD-"))
    );
    if (line === undefined) {
      throw new Error("Synthetic dataset must include POD records.");
    }
    const adapter = new SapODataReadOnlyAdapter({
      baseUrl: "https://sap.example.test",
      clientId: "client-id",
      clientSecret: "",
      scope: "api.sap.read",
      tenant: "northbay",
      tokenUrl: "https://sap.example.test/oauth/token"
    });
    const metadata = parseSapODataMetadata(`
      <Schema Namespace="API_OUTBOUND_DELIVERY_SRV">
        <EntityType Name="A_BillingDocumentType">
          <Key><PropertyRef Name="BillingDocument" /></Key>
          <Property Name="BillingDocument" Type="Edm.String" />
        </EntityType>
        <EntityType Name="A_OutbDeliveryItemType">
          <Key>
            <PropertyRef Name="DeliveryDocument" />
            <PropertyRef Name="DeliveryDocumentItem" />
          </Key>
          <Property Name="DeliveryDocument" Type="Edm.String" />
          <Property Name="DeliveryDocumentItem" Type="Edm.String" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="A_BillingDocument" EntityType="API_OUTBOUND_DELIVERY_SRV.A_BillingDocumentType" />
          <EntitySet Name="A_OutbDeliveryItem" EntityType="API_OUTBOUND_DELIVERY_SRV.A_OutbDeliveryItemType" />
        </EntityContainer>
      </Schema>
    `);

    const plan = adapter.buildMetadataValidatedReadRequestPlan(line, metadata);

    expect(plan).toEqual({
      configured: false,
      reason: "SAP metadata key set for mapped entity set A_OutbDeliveryItem requires unsupported key DeliveryDocumentItem.",
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
