import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const env = {
  NODE_ENV: "test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-credit-lead",
  RECOUP_CREDIT_NEGOTIATION_RESET_ENABLED: "enabled",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
  SUPABASE_URL: "https://recoup.supabase.co"
};

function request(payload: unknown, principal = "human:david-credit-lead"): Request {
  return new Request("http://localhost/api/credit/negotiation/reset", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": principal,
      "x-recoup-human-token": "test-human-token"
    },
    method: "POST"
  });
}

async function loadResetRoute(): Promise<{
  handleCreditNegotiationResetPostForTest: (request: Request, options?: unknown) => Promise<Response>;
}> {
  const routePath = resolve("cockpit/app/api/credit/negotiation/reset/route.ts");
  expect(existsSync(routePath)).toBe(true);
  return import(pathToFileURL(routePath).href) as Promise<{
    handleCreditNegotiationResetPostForTest: (request: Request, options?: unknown) => Promise<Response>;
  }>;
}

describe("David negotiation communication reset route", () => {
  it("resets only the selected order communication artifacts and negotiation approval receipts", async () => {
    const { handleCreditNegotiationResetPostForTest } = await loadResetRoute();
    const calls: Array<{ body: BodyInit | null | undefined; method: string | undefined; url: string }> = [];
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calls.push({ body: init?.body, method: init?.method, url: urlString });

      if (urlString.includes("/rest/v1/recoup_memory_records") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                category: "approval_records",
                id: "approval:credit-v2:negotiation:ORD-HARBOR-6534:r1",
                payload_json: {
                  actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                  status: "human_decided"
                },
                record_ids_json: ["credit-v2:negotiation:ORD-HARBOR-6534:r1"],
                scope: "approval:credit-v2:negotiation:ORD-HARBOR-6534:r1",
                trust_level: "trusted"
              },
              {
                category: "approval_records",
                id: "approval:credit-v2:ACC-CRE",
                payload_json: {
                  actionId: "credit-v2:ACC-CRE",
                  status: "human_decided"
                },
                record_ids_json: ["credit-v2:ACC-CRE"],
                scope: "approval:credit-v2:ACC-CRE",
                trust_level: "trusted"
              }
            ]),
            { status: 200 }
          )
        );
      }

      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(JSON.stringify([{ deleted: true }]), { status: 200 }));
      }

      if (urlString.includes("/rest/v1/recoup_memory_records") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify([{ id: "audit:credit-negotiation-reset:ORD-HARBOR-6534" }]), { status: 201 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationResetPostForTest(
      request({ orderId: "ORD-HARBOR-6534", reason: "Fresh David negotiation human test" }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: "ORD-HARBOR-6534",
      status: "reset_recorded"
    });
    for (const tableName of [
      "credit_counter_offers",
      "credit_negotiation_inbound_emails",
      "credit_negotiation_sends",
      "credit_negotiation_rounds"
    ]) {
      expect(calls.some((call) => call.method === "DELETE" && call.url.includes(`/rest/v1/${tableName}`))).toBe(true);
    }
    expect(calls.some((call) => call.method === "DELETE" && call.url.includes("approval%3Acredit-v2%3Anegotiation%3AORD-HARBOR-6534%3Ar1"))).toBe(true);
    expect(calls.some((call) => call.method === "DELETE" && call.url.includes("approval%3Acredit-v2%3AACC-CRE"))).toBe(false);
    const auditCall = calls.find((call) => call.method === "POST" && call.url.includes("/rest/v1/recoup_memory_records"));
    expect(auditCall?.body).toContain("credit_negotiation_reset");
    expect(auditCall?.body).toContain("ORD-HARBOR-6534");
    expect(JSON.stringify(calls)).not.toContain("supabase-service-secret");
  });

  it("blocks production resets unless the explicit test reset gate is enabled", async () => {
    const { handleCreditNegotiationResetPostForTest } = await loadResetRoute();
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationResetPostForTest(
      request({ orderId: "ORD-HARBOR-6534", reason: "Production reset should not be allowed" }),
      {
        env: {
          ...env,
          NODE_ENV: "production",
          RECOUP_CREDIT_NEGOTIATION_RESET_ENABLED: undefined
        },
        fetchImpl
      }
    );

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Credit negotiation reset is available only for explicitly enabled local QA." });
  });

  it("rejects non-David principals before deleting communication artifacts", async () => {
    const { handleCreditNegotiationResetPostForTest } = await loadResetRoute();
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationResetPostForTest(
      request({ orderId: "ORD-HARBOR-6534", reason: "Unauthorized reset attempt" }, "human:maya-lead"),
      {
        env: { ...env, RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead" },
        fetchImpl
      }
    );

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "David human reset approval is required for negotiation communication reset." });
  });
});
