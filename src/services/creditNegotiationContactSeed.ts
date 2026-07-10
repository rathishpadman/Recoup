import { createHash } from "node:crypto";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.ts";

export type CreditNegotiationContactSeedResult =
  | {
      accountId: "ACC-HAR";
      contactEmailHash: string;
      readBack: true;
      role: "ap";
      rows: 1;
      status: "seeded";
    }
  | {
      missing: string[];
      status: "missing_config";
    }
  | {
      invalid: string[];
      status: "invalid_config";
    };

type ContactSeedFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const requiredEnvKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HARBOR_AP_CONTACT_EMAIL"] as const;
const harborAccountId = "ACC-HAR" as const;
const harborContactRole = "ap" as const;

export async function seedCreditNegotiationContactsFromEnv(input: {
  env: RuntimeEnv;
  fetchImpl?: ContactSeedFetch | undefined;
}): Promise<CreditNegotiationContactSeedResult> {
  const missing = requiredEnvKeys.filter((key) => !isConfiguredValue(input.env[key]));
  if (missing.length > 0) {
    return { missing: [...missing], status: "missing_config" };
  }

  const contactEmail = input.env.HARBOR_AP_CONTACT_EMAIL as string;
  if (!isEmailAddress(contactEmail)) {
    return { invalid: ["HARBOR_AP_CONTACT_EMAIL"], status: "invalid_config" };
  }

  const supabaseUrl = normalizeSupabaseUrl(input.env.SUPABASE_URL as string);
  const serviceRoleKey = input.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const response = await (input.fetchImpl ?? fetch)(
    `${supabaseUrl}/rest/v1/credit_account_contacts?on_conflict=account_id,role`,
    {
      body: JSON.stringify([
        {
          account_id: harborAccountId,
          contact_email: contactEmail,
          contact_name: "Harbor AP",
          role: harborContactRole
        }
      ]),
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      method: "POST"
    }
  );
  if (!response.ok) {
    throw new Error(`Supabase credit_account_contacts upsert failed with HTTP ${response.status.toString()}.`);
  }

  const readBack = await readBackHarborContact({
    contactEmail,
    fetchImpl: input.fetchImpl ?? fetch,
    serviceRoleKey,
    supabaseUrl
  });

  return {
    accountId: harborAccountId,
    contactEmailHash: readBack.contactEmailHash,
    readBack: true,
    role: harborContactRole,
    rows: 1,
    status: "seeded"
  };
}

async function readBackHarborContact(input: {
  contactEmail: string;
  fetchImpl: ContactSeedFetch;
  serviceRoleKey: string;
  supabaseUrl: string;
}): Promise<{ contactEmailHash: string }> {
  const url = new URL(`${input.supabaseUrl}/rest/v1/credit_account_contacts`);
  url.searchParams.set("select", "account_id,contact_email,role");
  url.searchParams.set("account_id", `eq.${harborAccountId}`);
  url.searchParams.set("role", `eq.${harborContactRole}`);
  url.searchParams.set("limit", "1");
  const response = await input.fetchImpl(url.toString(), {
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    },
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`Supabase credit_account_contacts read-back failed with HTTP ${response.status.toString()}.`);
  }
  const rows = (await response.json()) as unknown;
  const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
  if (!isHarborContactRow(row) || sha256Hex(row.contact_email) !== sha256Hex(input.contactEmail)) {
    throw new Error("Supabase credit_account_contacts read-back did not match Harbor AP contact.");
  }

  return { contactEmailHash: sha256Hex(row.contact_email) };
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function isHarborContactRow(value: unknown): value is {
  account_id: typeof harborAccountId;
  contact_email: string;
  role: typeof harborContactRole;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { account_id?: unknown }).account_id === harborAccountId &&
    typeof (value as { contact_email?: unknown }).contact_email === "string" &&
    (value as { role?: unknown }).role === harborContactRole
  );
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
