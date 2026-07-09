import { describe, expect, it } from "vitest";
import { loadCreditRiskRows } from "../../src/adapters/supabaseSyntheticSource.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";
import { rowsForCreditRiskTable } from "./fixtures/creditRiskSupabaseFixture.js";

describe("credit risk Supabase loader", () => {
  it("loads typed credit risk rows from all required Supabase tables", async () => {
    const fixture = loadCreditRiskFixtureRows();
    const calls: string[] = [];

    const rows = await loadCreditRiskRows(
      {
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      (url, init) => {
        calls.push(url);
        expect(init.headers).toMatchObject({
          apikey: "supabase-service-secret",
          authorization: "Bearer supabase-service-secret"
        });

        return Promise.resolve(jsonResponse(rowsForCreditRiskTable(fixture, new URL(url).pathname.split("/").at(-1))));
      }
    );

    expect(rows.snapshot.asOfDate).toBe(fixture.snapshot.asOfDate);
    expect(rows.accounts).toHaveLength(4);
    expect(rows.accounts[0]).toMatchObject({
      accountId: fixture.accounts[0]?.accountId,
      relationshipOwner: fixture.accounts[0]?.relationshipOwner
    });
    expect(rows.deductions).toHaveLength(fixture.deductions.length);
    expect(rows.deductions[0]).toMatchObject({
      scenarioId: fixture.deductions[0]?.scenarioId,
      type: fixture.deductions[0]?.type
    });
    expect(rows.policy.reduceLimitBuffer).toBe(1.2);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rest/v1/credit_snapshot"),
        expect.stringContaining("/rest/v1/credit_accounts"),
        expect.stringContaining("/rest/v1/credit_ar_open_items"),
        expect.stringContaining("/rest/v1/credit_sales_monthly"),
        expect.stringContaining("/rest/v1/credit_payment_history"),
        expect.stringContaining("/rest/v1/credit_deductions"),
        expect.stringContaining("/rest/v1/credit_deduction_lines"),
        expect.stringContaining("/rest/v1/credit_contract_tpm"),
        expect.stringContaining("/rest/v1/credit_risk_mesh_positions"),
        expect.stringContaining("/rest/v1/credit_policy")
      ])
    );
  });

  it("fails closed when a required credit risk table is empty", async () => {
    const fixture = loadCreditRiskFixtureRows();

    await expect(
      loadCreditRiskRows(
        {
          SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
          SUPABASE_URL: "https://recoup.supabase.co"
        },
        (url) => {
          const tableName = new URL(url).pathname.split("/").at(-1);
          if (tableName === "credit_accounts") {
            return Promise.resolve(jsonResponse([]));
          }

          return Promise.resolve(jsonResponse(rowsForCreditRiskTable(fixture, tableName)));
        }
      )
    ).rejects.toMatchObject({
      missingSource: "supabase-credit-risk-credit_accounts"
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
