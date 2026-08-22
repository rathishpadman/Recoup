import { describe, expect, it, vi } from "vitest";

import {
  createSupabaseCashReceiptSource,
  isAuthoritativeSourceSystem
} from "../../src/adapters/supabaseCashReceipt.js";

const options = {
  url: "https://example.supabase.co",
  serviceRoleKey: "test-service-role-key",
  freshnessMaxAgeSeconds: 86_400,
  freshnessPolicyVersion: "rehearsal-freshness-v1",
  now: () => new Date("2026-08-22T12:00:00Z")
};

const query = {
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  instructedAmount: "1250.00",
  currency: "USD",
  asOf: "2026-08-22T12:00:00Z"
};

const settledRow = {
  receipt_id: "REHEARSAL-PAY-1001",
  source_system: "rehearsal-proxy",
  source_record_id: "REHEARSAL-SRC-1001",
  payment_reference: "PAY-1001",
  customer_reference: "CUST-001",
  legal_entity_reference: "LE-001",
  amount_received: "1250.00",
  currency: "USD",
  settlement_status: "settled",
  value_date: "2026-08-20",
  observed_at: "2026-08-22T10:00:00Z",
  retrieved_at: "2026-08-22T10:00:00Z",
  freshness_policy_version: "rehearsal-freshness-v1",
  freshness_status: "fresh",
  record_ids: ["REHEARSAL-SRC-1001"]
};

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function fetcherReturning(body: unknown, status = 200): ReturnType<typeof vi.fn<Fetcher>> {
  return vi.fn<Fetcher>(() => Promise.resolve(respond(body, status)));
}

describe("Supabase cash receipt source", () => {
  it("returns a settled receipt from a durable row", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([settledRow])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("settled");
    if (result.status !== "settled") return;

    expect(result.receipt.receiptId).toBe("REHEARSAL-PAY-1001");
    expect(result.receipt.amountReceived).toBe("1250.00");
    expect(result.receipt.freshnessStatus).toBe("fresh");
  });

  it("scopes the query by payment, customer and legal entity", async () => {
    const fetcher = fetcherReturning([settledRow]);
    const source = createSupabaseCashReceiptSource({ ...options, fetcher });

    await source.findReceipt(query);

    const requested = fetcher.mock.calls[0]?.[0] ?? "";
    expect(requested).toContain("payment_reference=eq.PAY-1001");
    expect(requested).toContain("customer_reference=eq.CUST-001");
    expect(requested).toContain("legal_entity_reference=eq.LE-001");
  });

  it("reports pending for an unsettled row rather than allocating it", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([{ ...settledRow, settlement_status: "pending" }])
    });

    expect((await source.findReceipt(query)).status).toBe("pending");
  });

  it("evaluates freshness at read time rather than trusting the stored flag", async () => {
    // The row claims fresh, but it was observed sixty days ago. A stored
    // freshness flag ages the moment it is written, so the read must decide.
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([
        { ...settledRow, observed_at: "2026-06-01T10:00:00Z", freshness_status: "fresh" }
      ])
    });

    expect((await source.findReceipt(query)).status).toBe("stale");
  });

  it("returns not_found with no receipt when nothing matches", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([])
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("not_found");
    expect(result).not.toHaveProperty("receipt");
  });

  it("reports ambiguous rather than picking one of two rows", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([settledRow, settledRow])
    });

    expect((await source.findReceipt(query)).status).toBe("ambiguous");
  });

  it("keeps a read failure distinct from a zero result", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning({ message: "permission denied" }, 403)
    });

    const result = await source.findReceipt(query);
    expect(result.status).toBe("source_unavailable");
    expect(result.status).not.toBe("not_found");
  });

  it("treats a thrown network error as an outage", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: vi.fn<Fetcher>(() => Promise.reject(new Error("socket hang up")))
    });

    expect((await source.findReceipt(query)).status).toBe("source_unavailable");
  });

  it("reports contract_gap for a cross-currency row instead of converting", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([{ ...settledRow, currency: "EUR" }])
    });

    expect((await source.findReceipt(query)).status).toBe("contract_gap");
  });

  it("accepts a numeric amount from the driver without losing precision", async () => {
    const source = createSupabaseCashReceiptSource({
      ...options,
      fetcher: fetcherReturning([{ ...settledRow, amount_received: 1250 }])
    });

    const result = await source.findReceipt(query);
    if (result.status !== "settled") throw new Error("expected a settled receipt");
    expect(result.receipt.amountReceived).toBe("1250.00");
  });
});

describe("authoritative source classification", () => {
  it.each(["rehearsal-proxy", "synthetic-source", "demo-bank", "seed-loader"])(
    "refuses to call %s authoritative",
    (sourceSystem) => {
      expect(isAuthoritativeSourceSystem(sourceSystem)).toBe(false);
    }
  );

  it("admits a real ERP source system", () => {
    expect(isAuthoritativeSourceSystem("sap-odata")).toBe(true);
  });

  it("keeps the judgement in one place rather than in every caller", () => {
    // A row read from the database carries whatever source_system was written.
    // Callers must not re-derive this from a substring check of their own.
    expect(isAuthoritativeSourceSystem("REHEARSAL-PROXY")).toBe(false);
  });
});
