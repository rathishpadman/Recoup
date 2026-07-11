import { z } from "zod";
import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";

const orderIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9:_.-]+$/u);
const roundRowSchema = z.object({
  inbound_email_id: z.string().nullable().optional(),
  round_id: z.string().min(1),
  round_no: z.number().int().positive(),
  status: z.enum(["drafted", "sent", "countered", "human_review", "accepted", "rejected", "withdrawn", "closed"]),
  updated_at: z.string().datetime({ offset: true })
}).strict();

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified David cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  const orderId = orderIdSchema.safeParse(new URL(request.url).searchParams.get("orderId"));
  if (!orderId.success) {
    return Response.json({ error: "A valid negotiation orderId is required." }, { headers: noStoreHeaders(), status: 400 });
  }
  const baseUrl = runtimeEnv.SUPABASE_URL?.replace(/\/+$/u, "");
  const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (baseUrl === undefined || serviceRoleKey === undefined) {
    return Response.json({ error: "Credit negotiation status source is not configured." }, { headers: noStoreHeaders(), status: 503 });
  }

  try {
    const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_rounds`);
    url.searchParams.set("select", "round_id,round_no,status,updated_at,inbound_email_id");
    url.searchParams.set("order_id", `eq.${orderId.data}`);
    url.searchParams.set("order", "round_no.desc,updated_at.desc");
    url.searchParams.set("limit", "1");
    const response = await fetch(url.href, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      }
    });
    if (!response.ok) {
      return Response.json({ error: "Credit negotiation status source is unavailable." }, { headers: noStoreHeaders(), status: 503 });
    }
    const rows = z.array(roundRowSchema).max(1).safeParse(await response.json());
    if (!rows.success) {
      return Response.json({ error: "Credit negotiation status source failed validation." }, { headers: noStoreHeaders(), status: 503 });
    }
    const latest = rows.data[0];

    return Response.json({
      checkedAtIso: new Date().toISOString(),
      latestRound: latest === undefined
        ? undefined
        : {
            hasInboundReply: latest.inbound_email_id !== null && latest.inbound_email_id !== undefined,
            round: latest.round_no,
            roundId: latest.round_id,
            status: latest.status,
            updatedAtIso: latest.updated_at
          },
      orderId: orderId.data
    }, { headers: noStoreHeaders() });
  } catch {
    return Response.json({ error: "Credit negotiation status source is unavailable." }, { headers: noStoreHeaders(), status: 503 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
