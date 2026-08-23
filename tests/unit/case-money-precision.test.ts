import { describe, expect, it } from "vitest";

import { createSupabaseWorkflowRepository } from "../../src/services/supabaseWorkflowRepository.ts";

/**
 * PostgREST serialises a numeric column as a JSON number, so 250.00 arrives as
 * 250 and the cents are gone before any mapper can see them. The read model
 * then showed "250 USD" for a short payment the database records as "250.00".
 *
 * The cockpit is forbidden from reformatting money, so the fix has to be in the
 * query: the money column is selected as text and the string survives intact.
 */

describe("case money precision", () => {
  it("asks PostgREST for the short payment as text", async () => {
    const urls: string[] = [];
    const fetcher = ((input: URL | RequestInfo) => {
      urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return Promise.resolve(new Response("[]", { status: 200 }));
    }) as typeof fetch;

    const repository = createSupabaseWorkflowRepository({
      url: "https://stub.invalid",
      serviceRoleKey: "stub-key",
      fetcher
    });

    await repository.listCases();

    expect(urls[0]).toContain("short_payment_amount::text");
  });

  it("keeps the cents a numeric column would have dropped", async () => {
    const row = {
      case_id: "CASE-1",
      origin: "live_cash_application",
      run_id: "RUN-1",
      customer_id: "CUST-001",
      legal_entity_id: "LE-001",
      invoice_record_ids: ["INV-1"],
      remittance_id: "REM-1",
      receipt_id: "REC-1",
      allocation_id: "ALLOC-1",
      claimed_reason: "DMG",
      validated_reason: "DEP",
      short_payment_amount: "250.00",
      currency: "USD",
      status: "Ready",
      policy_versions: { allocation: "v1" },
      record_ids: ["REC-1"],
      provenance_mode: "replay",
      created_at: "2026-08-23T09:00:00.000Z"
    };

    const fetcher = (() =>
      Promise.resolve(new Response(JSON.stringify([row]), { status: 200 }))) as typeof fetch;

    const repository = createSupabaseWorkflowRepository({
      url: "https://stub.invalid",
      serviceRoleKey: "stub-key",
      fetcher
    });

    const [liveCase] = await repository.listCases();

    expect(liveCase?.shortPaymentAmount).toBe("250.00");
  });
});
