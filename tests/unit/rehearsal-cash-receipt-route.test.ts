import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * POST /rehearsal/cash-receipt stands in for an SAP posting while D-02 is
 * unsigned, by writing the proxy receipt row the adapter reads.
 *
 * The property that matters is that it cannot launder itself into authority.
 * The row is always stamped rehearsal-proxy no matter what the caller sends, so
 * an allocation citing it still reads as non-authoritative, and D-02 stays open.
 */

const secret = "receipt-secret";

const baseEnv: RuntimeEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_INBOUND_SHARED_SECRET: secret,
  RECOUP_SUPABASE_URL: "https://stub.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "stub-key"
};

function sign(raw: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

async function startApi(
  env: RuntimeEnv,
  capture: { rows: unknown[] }
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    createCockpitApi({
      env,
      cashReceiptWriteFetcher: (input: URL | RequestInfo, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        capture.rows.push({ url, body });
        return Promise.resolve(new Response("[]", { status: 201 }));
      }
    })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve) => server.close(() => { resolve(); }))
  };
}

const receipt = {
  paymentReference: "PAY-E2E-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  amountReceived: "1250.00",
  currency: "USD",
  settlementStatus: "settled"
};

describe("POST /rehearsal/cash-receipt", () => {
  it("writes the receipt the adapter will read", async () => {
    const capture = { rows: [] as unknown[] };
    const api = await startApi(baseEnv, capture);

    try {
      const raw = JSON.stringify(receipt);
      const response = await fetch(`${api.baseUrl}/rehearsal/cash-receipt`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-recoup-signature": sign(raw) },
        body: raw
      });

      expect(response.status).toBe(201);
      expect(capture.rows).toHaveLength(1);
      const written = capture.rows[0] as { url: string; body: Record<string, unknown> };
      expect(written.url).toContain("recoup_cash_receipts");
      expect(written.body.payment_reference).toBe("PAY-E2E-1");
      expect(written.body.settlement_status).toBe("settled");
    } finally {
      await api.close();
    }
  });

  it("stamps rehearsal-proxy even when the caller claims SAP", async () => {
    const capture = { rows: [] as unknown[] };
    const api = await startApi(baseEnv, capture);

    try {
      const raw = JSON.stringify({ ...receipt, sourceSystem: "sap-odata" });
      await fetch(`${api.baseUrl}/rehearsal/cash-receipt`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-recoup-signature": sign(raw) },
        body: raw
      });

      const written = capture.rows[0] as { body: Record<string, unknown> };
      // D-02 is unsigned; nothing written here may present itself as authority.
      expect(written.body.source_system).toBe("rehearsal-proxy");
    } finally {
      await api.close();
    }
  });

  it("refuses an unsigned caller", async () => {
    const capture = { rows: [] as unknown[] };
    const api = await startApi(baseEnv, capture);

    try {
      const response = await fetch(`${api.baseUrl}/rehearsal/cash-receipt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(receipt)
      });

      expect(response.status).toBe(401);
      expect(capture.rows).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("does not exist when rehearsal is off", async () => {
    const capture = { rows: [] as unknown[] };
    const api = await startApi({ ...baseEnv, RECOUP_CASH_ROLLOUT_STAGE: "disabled" }, capture);

    try {
      const raw = JSON.stringify(receipt);
      const response = await fetch(`${api.baseUrl}/rehearsal/cash-receipt`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-recoup-signature": sign(raw) },
        body: raw
      });

      expect(response.status).toBe(404);
      expect(capture.rows).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
});
