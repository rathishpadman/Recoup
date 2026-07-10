import { describe, expect, it } from "vitest";
import { seedCreditNegotiationContactsFromEnv } from "../../src/services/creditNegotiationContactSeed.js";

type FetchCall = [string | URL | Request, RequestInit | undefined];

const baseEnv = {
  HARBOR_AP_CONTACT_EMAIL: "harbor-ap@example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_URL: "https://recoup.supabase.co"
};

describe("credit negotiation contact seed", () => {
  it("fails closed without the Harbor AP contact env and does not call Supabase", async () => {
    const fetchSpy = createFetchSpy();
    const result = await seedCreditNegotiationContactsFromEnv({
      env: {
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      fetchImpl: fetchSpy.fetchImpl
    });

    expect(result).toEqual({
      missing: ["HARBOR_AP_CONTACT_EMAIL"],
      status: "missing_config"
    });
    expect(fetchSpy.calls).toHaveLength(0);
  });

  it("rejects malformed Harbor AP contact email before calling Supabase", async () => {
    const fetchSpy = createFetchSpy();
    const result = await seedCreditNegotiationContactsFromEnv({
      env: {
        ...baseEnv,
        HARBOR_AP_CONTACT_EMAIL: "not-an-email"
      },
      fetchImpl: fetchSpy.fetchImpl
    });

    expect(result).toEqual({
      invalid: ["HARBOR_AP_CONTACT_EMAIL"],
      status: "invalid_config"
    });
    expect(fetchSpy.calls).toHaveLength(0);
  });

  it("upserts and reads back the Harbor AP contact from env without returning the raw email", async () => {
    const fetchSpy = createFetchSpy([
      new Response(null, { status: 201 }),
      Response.json([
        {
          account_id: "ACC-HAR",
          contact_email: "harbor-ap@example.com",
          role: "ap"
        }
      ])
    ]);
    const result = await seedCreditNegotiationContactsFromEnv({
      env: baseEnv,
      fetchImpl: fetchSpy.fetchImpl
    });

    expect(fetchSpy.calls).toHaveLength(2);
    const firstCall = fetchSpy.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected one Supabase fetch call.");
    }
    const [url, init] = firstCall;
    expect(urlToString(url)).toBe("https://recoup.supabase.co/rest/v1/credit_account_contacts?on_conflict=account_id,role");
    if (init === undefined) {
      throw new Error("Expected Supabase upsert request init.");
    }
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "service-role-key",
      authorization: "Bearer service-role-key",
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    });
    expect(typeof init.body).toBe("string");
    const requestBody = JSON.parse(init.body as string) as unknown;
    expect(requestBody).toEqual([
      {
        account_id: "ACC-HAR",
        contact_email: "harbor-ap@example.com",
        contact_name: "Harbor AP",
        role: "ap"
      }
    ]);
    const secondCall = fetchSpy.calls[1];
    if (secondCall === undefined) {
      throw new Error("Expected Supabase read-back fetch call.");
    }
    const [readBackUrl, readBackInit] = secondCall;
    expect(urlToString(readBackUrl)).toBe(
      "https://recoup.supabase.co/rest/v1/credit_account_contacts?select=account_id%2Ccontact_email%2Crole&account_id=eq.ACC-HAR&role=eq.ap&limit=1"
    );
    expect(readBackInit?.method).toBe("GET");
    expect(readBackInit?.headers).toMatchObject({
      apikey: "service-role-key",
      authorization: "Bearer service-role-key"
    });
    expect(result.status).toBe("seeded");
    if (result.status !== "seeded") {
      throw new Error("Expected seeded result.");
    }
    expect(result.accountId).toBe("ACC-HAR");
    expect(result.contactEmailHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.readBack).toBe(true);
    expect(result.rows).toBe(1);
    expect(JSON.stringify(result)).not.toContain("harbor-ap@example.com");
  });
});

function createFetchSpy(responses: Response | Response[] = new Response(null, { status: 204 })): {
  calls: FetchCall[];
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
} {
  const calls: FetchCall[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];

  return {
    calls,
    fetchImpl(input, init) {
      calls.push([input, init]);
      const response = queue.shift();
      if (response === undefined) {
        return Promise.reject(new Error("Unexpected fetch call."));
      }
      return Promise.resolve(response);
    }
  };
}

function urlToString(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
