import { z } from "zod";
import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import type { EmailFetch, RuntimeEmailEnv } from "../../../../../../src/services/emailGateway.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";

interface CreditNegotiationResetRouteTestOptions {
  env?: RuntimeEmailEnv;
  fetchImpl?: EmailFetch;
}

interface NegotiationApprovalMemoryRecord {
  actionId: string;
  id: string;
  scope: string;
}

const negotiationResetSchema = z
  .object({
    orderId: z.string().min(1).max(120),
    reason: z.string().min(1).max(500).optional()
  })
  .strict();

const communicationTablesInDeleteOrder = [
  "credit_counter_offers",
  "credit_negotiation_inbound_emails",
  "credit_negotiation_sends",
  "credit_negotiation_rounds"
] as const;

export async function POST(request: Request): Promise<Response> {
  return handleCreditNegotiationResetPostForTest(request);
}

export async function handleCreditNegotiationResetPostForTest(
  request: Request,
  options: CreditNegotiationResetRouteTestOptions = {}
): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const bodyText = await request.text();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "admin-reset",
    proxyRequest: { body: bodyText, method: "POST", path: "/credit/negotiation/reset" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified David cockpit auth required." }, { status: 401 });
  }
  const principal = authHeaders["x-recoup-human-principal"];
  if (!isDavidHumanPrincipal(principal)) {
    return Response.json(
      { error: "David human reset approval is required for negotiation communication reset." },
      { status: 403 }
    );
  }
  if (!isLocalQaResetEnabled(runtimeEnv)) {
    return Response.json({ error: "Credit negotiation reset is available only when the explicit reset gate is enabled." }, { status: 403 });
  }

  const parsed = negotiationResetSchema.safeParse(parseJson(bodyText));
  if (!parsed.success) {
    return Response.json({ error: "Invalid credit negotiation reset request." }, { status: 400 });
  }

  const store = buildSupabaseNegotiationResetStore(runtimeEnv, options.fetchImpl ?? fetch);
  if (store === undefined) {
    return Response.json({ error: "Credit negotiation reset store is not configured." }, { status: 503 });
  }

  try {
    await store.appendResetAuditRecord({
      operatorPrincipal: principal,
      orderId: parsed.data.orderId,
      ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason })
    });
    const deletedCommunicationRows = await store.deleteCommunicationForOrder(parsed.data.orderId);
    const approvalRecords = await store.readNegotiationApprovalReceipts(parsed.data.orderId);
    let deletedApprovalReceipts = 0;
    for (const record of approvalRecords) {
      deletedApprovalReceipts += await store.deleteApprovalReceipt(record);
    }

    return Response.json({
      deletedApprovalReceipts,
      deletedCommunicationRows,
      orderId: parsed.data.orderId,
      status: "reset_recorded"
    });
  } catch {
    return Response.json({ error: "Credit negotiation reset failed closed." }, { status: 503 });
  }
}

function buildSupabaseNegotiationResetStore(
  env: RuntimeEmailEnv,
  fetchImpl: EmailFetch
):
  | {
      appendResetAuditRecord(input: { operatorPrincipal: string; orderId: string; reason?: string | undefined }): Promise<void>;
      deleteApprovalReceipt(record: NegotiationApprovalMemoryRecord): Promise<number>;
      deleteCommunicationForOrder(orderId: string): Promise<number>;
      readNegotiationApprovalReceipts(orderId: string): Promise<NegotiationApprovalMemoryRecord[]>;
    }
  | undefined {
  if (!isConfiguredValue(env.SUPABASE_URL) || !isConfiguredValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return undefined;
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/u, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };

  return {
    async appendResetAuditRecord(input) {
      const auditId = `audit:credit_negotiation_reset:${input.orderId}:${Date.now().toString()}`;
      const response = await fetchImpl(`${baseUrl}/rest/v1/recoup_memory_records`, {
        body: JSON.stringify({
          category: "audit_refs",
          created_at: new Date().toISOString(),
          id: auditId,
          payload_json: {
            memoryType: "credit_negotiation_reset",
            operatorPrincipal: input.operatorPrincipal,
            orderId: input.orderId,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            status: "reset_requested"
          },
          record_ids_json: [`credit_orders:${input.orderId}`, input.orderId],
          scope: `credit-negotiation-reset:${input.orderId}`,
          trust_level: "trusted"
        }),
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation reset audit append failed.");
      }
    },
    async deleteApprovalReceipt(record) {
      const url = new URL(`${baseUrl}/rest/v1/recoup_memory_records`);
      url.searchParams.set("id", `eq.${record.id}`);
      url.searchParams.set("scope", `eq.${record.scope}`);
      url.searchParams.set("category", "eq.approval_records");
      const response = await fetchImpl(url.toString(), {
        headers: {
          ...headers,
          prefer: "return=representation"
        },
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation approval receipt reset failed.");
      }

      return (await readJsonArray(response)).length;
    },
    async deleteCommunicationForOrder(orderId) {
      let deletedRows = 0;
      for (const tableName of communicationTablesInDeleteOrder) {
        const url = new URL(`${baseUrl}/rest/v1/${tableName}`);
        url.searchParams.set("order_id", `eq.${orderId}`);
        const response = await fetchImpl(url.toString(), {
          headers: {
            ...headers,
            prefer: "return=representation"
          },
          method: "DELETE"
        });
        if (!response.ok) {
          throw new Error("Credit negotiation communication reset failed.");
        }
        deletedRows += (await readJsonArray(response)).length;
      }

      return deletedRows;
    },
    async readNegotiationApprovalReceipts(orderId) {
      const url = new URL(`${baseUrl}/rest/v1/recoup_memory_records`);
      url.searchParams.set("select", "id,scope,category,trust_level,payload_json,record_ids_json");
      url.searchParams.set("category", "eq.approval_records");
      url.searchParams.set("trust_level", "eq.trusted");
      const response = await fetchImpl(url.toString(), {
        headers,
        method: "GET"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation approval receipt read failed.");
      }

      const actionPrefix = `credit-v2:negotiation:${orderId}:`;
      return (await readJsonArray(response)).flatMap((row) => {
        const record = approvalMemoryRecordFromSupabaseRow(row);
        return record?.actionId.startsWith(actionPrefix) === true ? [record] : [];
      });
    }
  };
}

function approvalMemoryRecordFromSupabaseRow(value: unknown): NegotiationApprovalMemoryRecord | undefined {
  const row = asRecord(value);
  const payload = asRecord(row?.payload_json);
  const id = readString(row?.id);
  const scope = readString(row?.scope);
  const actionId = readString(payload?.actionId);
  if (
    row?.category !== "approval_records" ||
    row.trust_level !== "trusted" ||
    id === undefined ||
    scope === undefined ||
    actionId === undefined ||
    id !== `approval:${actionId}` ||
    scope !== `approval:${actionId}`
  ) {
    return undefined;
  }

  return { actionId, id, scope };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

async function readJsonArray(response: Response): Promise<unknown[]> {
  try {
    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? payload.map((item: unknown) => item) : [];
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isLocalQaResetEnabled(env: RuntimeEmailEnv): boolean {
  return env.RECOUP_CREDIT_NEGOTIATION_RESET_ENABLED === "enabled";
}

function isDavidHumanPrincipal(principal: string): boolean {
  return /^human:david(?:-|$)/u.test(principal);
}
