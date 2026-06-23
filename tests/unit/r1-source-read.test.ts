import { describe, expect, it } from "vitest";
import { parseSapODataMetadata, SapODataReadOnlyAdapter } from "../../src/adapters/sapOData.js";
import { invokeServiceTool, serviceToolMetadata } from "../../src/services/serviceLayer.js";

describe("R1 source read service tool", () => {
  it("returns a provenance-tagged SAP read-plan envelope for SAP-primary R1 needs", () => {
    const result = invokeServiceTool(
      "sources.r1Read",
      { need: "credit-exposure", businessPartner: "USCU_S04" },
      r1ServiceContext()
    );

    expect(result).toMatchObject({
      need: "credit-exposure",
      provenance: {
        ownerInput: "R2-5",
        primary: "sap",
        sourcePolicy: "sap-primary"
      },
      recordIds: ["USCU_S04"],
      sourceMode: "sap_primary"
    });
    expect(result).toMatchObject({
      readPlan: {
        sap: {
          configured: true,
          requests: [
            {
              method: "GET",
              purpose: "credit-exposure",
              recordIds: ["USCU_S04"],
              url: "https://sap.example.test/sap/opu/odata/sap/ZUI_CREDITEXPOSURE_DISPLAY_0001/CreditExposure(BusinessPartner='USCU_S04')?sap-client=100"
            }
          ]
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("client-secret");
    expect(JSON.stringify(result)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns only the owner-confirmed Supabase fallback envelope for outbound delivery", () => {
    expect(invokeServiceTool("sources.r1Read", { need: "outbound-delivery", deliveryRef: "DEL_GREEN_01" })).toEqual({
      need: "outbound-delivery",
      provenance: {
        ownerInput: "R2-5",
        primary: "supabase",
        sourcePolicy: "sap-delivery-501-supabase"
      },
      readPlan: {
        supabase: {
          filters: { delivery_ref: "eq.DEL_GREEN_01" },
          keyFields: ["delivery_ref"],
          mode: "authoritative",
          recordIds: ["DEL_GREEN_01"],
          select: ["delivery_ref", "delivery_timestamp", "signed_qty"],
          table: "pod_records"
        }
      },
      recordIds: ["DEL_GREEN_01"],
      sourceMode: "supabase_authoritative"
    });
  });

  it("keeps accrual cap on SAP primary plus Supabase authoritative fallback without computing the cap", () => {
    const result = invokeServiceTool("sources.r1Read", { need: "accrual-cap", accrualObject: "PM_HARB_02" }, r1ServiceContext());

    expect(result).toMatchObject({
      need: "accrual-cap",
      provenance: {
        fallback: "supabase",
        ownerInput: "R2-5",
        primary: "sap",
        sourcePolicy: "sap-primary-supabase-authoritative-fallback"
      },
      readPlan: {
        supabase: {
          authoritativeFields: ["accrual_cap"],
          filters: { promo_id: "eq.PM_HARB_02" },
          table: "promotions"
        }
      },
      recordIds: ["PM_HARB_02"],
      sourceMode: "sap_primary_supabase_authoritative_fallback"
    });
    expect(JSON.stringify(result)).not.toMatch(/\$|10000|20000/u);
  });

  it("fails closed for SAP-primary needs when SAP metadata is not supplied", () => {
    expect(() => invokeServiceTool("sources.r1Read", { need: "invoice", billingDocument: "90000002" })).toThrow(
      "R1 SAP metadata context required for source need invoice."
    );
  });

  it("rejects malformed or broader-than-R1 source requests at the Zod boundary", () => {
    expect(() => invokeServiceTool("sources.r1Read", { need: "sales-order" })).toThrow();
    expect(() => invokeServiceTool("sources.r1Read", { need: "invoice", billingDocument: "80000002" })).toThrow();
    expect(() => invokeServiceTool("sources.r1Read", { need: "aging-grid", customerId: "USCU_S04" })).toThrow();
    expect(() =>
      invokeServiceTool("sources.r1Read", { need: "payment-history", customerId: "USCU_S04", invoiceRef: "90000002" })
    ).toThrow();
  });

  it("classifies the R1 source tool as read-only and MCP-visible", () => {
    expect(serviceToolMetadata["sources.r1Read"]).toEqual({
      riskClass: "read_only",
      sideEffectClass: "none",
      visibility: "mcp"
    });
  });
});

function r1ServiceContext() {
  const connection = {
    baseUrl: "https://sap.example.test",
    clientId: "client-id",
    clientSecret: "client-secret",
    sapClient: "100",
    scope: "api.sap.read",
    tenant: "northbay",
    tokenUrl: "https://sap.example.test/oauth/token"
  };

  return {
    r1SapMetadata: {
      ZUI_ACCRUALS_MANAGE_0001: parseSapODataMetadata(`
        <Schema Namespace="ZUI_ACCRUALS_MANAGE_0001">
          <EntityType Name="PeriodicAmountsType">
            <Property Name="AccrualObject" Type="Edm.String" />
          </EntityType>
          <EntityContainer>
            <EntitySet Name="PeriodicAmounts" EntityType="ZUI_ACCRUALS_MANAGE_0001.PeriodicAmountsType" />
          </EntityContainer>
        </Schema>
      `),
      ZUI_CREDITEXPOSURE_DISPLAY_0001: parseSapODataMetadata(`
        <Schema Namespace="ZUI_CREDITEXPOSURE_DISPLAY_0001">
          <EntityType Name="CreditExposureType">
            <Key><PropertyRef Name="BusinessPartner" /></Key>
            <Property Name="BusinessPartner" Type="Edm.String" />
          </EntityType>
          <EntityContainer>
            <EntitySet Name="CreditExposure" EntityType="ZUI_CREDITEXPOSURE_DISPLAY_0001.CreditExposureType" />
          </EntityContainer>
        </Schema>
      `)
    },
    r1SapReadAdapter: new SapODataReadOnlyAdapter(connection)
  };
}
