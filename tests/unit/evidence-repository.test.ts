import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import {
  createSupabaseEvidenceRepository,
  type EvidenceRepositorySupabaseFetch
} from "../../src/services/evidenceRepository.js";

describe("real evidence Supabase repository", () => {
  it("upserts evidence documents, links, and claims without serializing service-role secrets", async () => {
    const calls: Array<{ body: string; headers: Headers; method: string; url: string }> = [];
    const fetcher: EvidenceRepositorySupabaseFetch = (url, init) => {
      calls.push({
        body: typeof init.body === "string" ? init.body : "",
        headers: new Headers(init.headers),
        method: init.method ?? "GET",
        url
      });
      return Promise.resolve(new Response(JSON.stringify([]), { headers: { "content-type": "application/json" }, status: 200 }));
    };
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const repository = createSupabaseEvidenceRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    await repository.upsertEvidenceDataset(dataset);

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "POST /rest/v1/recoup_evidence_documents",
      "POST /rest/v1/recoup_evidence_links",
      "POST /rest/v1/recoup_deduction_claims"
    ]);

    for (const call of calls) {
      expect(call.headers.get("apikey")).toBe("supabase-service-secret");
      expect(call.headers.get("authorization")).toBe("Bearer supabase-service-secret");
      expect(call.body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(call.body).not.toContain("supabase-service-secret");
    }

    const documentRows = JSON.parse(calls[0]?.body ?? "[]") as Array<Record<string, unknown>>;
    const linkRows = JSON.parse(calls[1]?.body ?? "[]") as Array<Record<string, unknown>>;
    const claimRows = JSON.parse(calls[2]?.body ?? "[]") as Array<Record<string, unknown>>;

    expect(documentRows).toHaveLength(114);
    expect(documentRows).toContainEqual(
      expect.objectContaining({
        document_type: "pod",
        evidence_id: "EVD-POD-S3-L1",
        storage_uri: "supabase://recoup_evidence_documents/EVD-POD-S3-L1"
      })
    );
    expect(linkRows).toContainEqual(
      expect.objectContaining({
        evidence_id: "EVD-POD-S3-L1",
        record_id: "S3-L1",
        record_role: "deduction_line"
      })
    );
    expect(claimRows).toHaveLength(20);
    expect(JSON.stringify(claimRows)).not.toContain("scenario_id");
    expect(JSON.stringify(claimRows)).not.toContain("scenarioId");
  });
});
