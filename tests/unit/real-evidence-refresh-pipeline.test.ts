import { describe, expect, it } from "vitest";
import {
  formatRealEvidenceRefreshPipelineReport,
  refreshRealEvidencePipeline
} from "../../scripts/refreshRealEvidencePipeline.js";

describe("real evidence refresh pipeline", () => {
  it("upserts evidence, links, claims, and reconciliation receipts with sanitized output", async () => {
    const calls: Array<{ body: unknown; method?: string; tableName: string; url: string }> = [];
    const report = await refreshRealEvidencePipeline({
      env: {
        RECOUP_REAL_EVIDENCE_REFRESH_APPROVED: "approve-real-evidence-refresh",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      fetcher: (url, init) => {
        if (typeof init.body !== "string") {
          throw new Error("Expected JSON string Supabase upsert body.");
        }
        const tableName = new URL(url).pathname.split("/").at(-1);
        if (tableName === undefined) {
          throw new Error("Expected Supabase table name in request URL.");
        }
        calls.push({
          body: JSON.parse(init.body) as unknown,
          ...(init.method === undefined ? {} : { method: init.method }),
          tableName,
          url
        });
        expect(init.headers).toMatchObject({
          apikey: "supabase-secret-key",
          authorization: "Bearer supabase-secret-key"
        });

        return Promise.resolve(new Response(null, { status: 201 }));
      },
      retrievedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(report).toMatchObject({
      claims: 20,
      documents: 114,
      links: 570,
      receipts: 20,
      status: "pass"
    });
    expect(calls.map((call) => call.tableName)).toEqual([
      "recoup_evidence_documents",
      "recoup_evidence_links",
      "recoup_deduction_claims",
      "recoup_reconciliation_receipts"
    ]);
    expect(calls.every((call) => call.method === "POST")).toBe(true);
    expect(calls.map((call) => (Array.isArray(call.body) ? call.body.length : 0))).toEqual([114, 570, 20, 20]);
    expect(String(calls[0]?.url)).toContain("on_conflict=evidence_id");
    expect(String(calls[3]?.url)).toContain("on_conflict=receipt_id");

    const serialized = formatRealEvidenceRefreshPipelineReport(report);
    expect(serialized).not.toContain("supabase-secret-key");
    expect(serialized).not.toContain("payload_json");
    expect(serialized).not.toContain("derived_rule_input_json");
  });

  it("fails closed before Supabase upserts without explicit refresh approval", async () => {
    const calls: string[] = [];

    await expect(
      refreshRealEvidencePipeline({
        env: {
          SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
          SUPABASE_URL: "https://recoup.supabase.co"
        },
        fetcher: (url) => {
          calls.push(url);
          return Promise.resolve(new Response(null, { status: 201 }));
        },
        retrievedAt: "2026-07-01T00:00:00.000Z"
      })
    ).rejects.toThrow("RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh is required");
    expect(calls).toEqual([]);
  });
});
