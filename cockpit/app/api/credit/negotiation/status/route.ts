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
const humanReviewCounterRowSchema = z.object({
  counter_offer_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  round_id: z.string().min(1),
  source: z.literal("email"),
  status: z.literal("human_review")
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
    let statusRound = latest;
    let hasHumanReviewReply = false;
    if (latest?.status === "sent" || latest?.status === "drafted") {
      const counterUrl = new URL(`${baseUrl}/rest/v1/credit_counter_offers`);
      counterUrl.searchParams.set("select", "counter_offer_id,round_id,source,status,created_at");
      counterUrl.searchParams.set("order_id", `eq.${orderId.data}`);
      counterUrl.searchParams.set("source", "eq.email");
      counterUrl.searchParams.set("status", "eq.human_review");
      counterUrl.searchParams.set("order", "created_at.desc");
      counterUrl.searchParams.set("limit", "1");
      const counterResponse = await fetch(counterUrl.href, {
        cache: "no-store",
        headers: {
          accept: "application/json",
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`
        }
      });
      if (!counterResponse.ok) {
        return Response.json({ error: "Credit negotiation status source is unavailable." }, { headers: noStoreHeaders(), status: 503 });
      }
      const counterRows = z.array(humanReviewCounterRowSchema).max(1).safeParse(await counterResponse.json());
      if (!counterRows.success) {
        return Response.json({ error: "Credit negotiation status source failed validation." }, { headers: noStoreHeaders(), status: 503 });
      }
      const humanReviewCounter = counterRows.data[0];
      if (humanReviewCounter !== undefined) {
        let humanReviewRound = latest.round_id === humanReviewCounter.round_id ? latest : undefined;
        if (humanReviewRound === undefined) {
          const humanReviewRoundUrl = new URL(`${baseUrl}/rest/v1/credit_negotiation_rounds`);
          humanReviewRoundUrl.searchParams.set("select", "round_id,round_no,status,updated_at,inbound_email_id");
          humanReviewRoundUrl.searchParams.set("order_id", `eq.${orderId.data}`);
          humanReviewRoundUrl.searchParams.set("round_id", `eq.${humanReviewCounter.round_id}`);
          humanReviewRoundUrl.searchParams.set("limit", "1");
          const humanReviewRoundResponse = await fetch(humanReviewRoundUrl.href, {
            cache: "no-store",
            headers: {
              accept: "application/json",
              apikey: serviceRoleKey,
              authorization: `Bearer ${serviceRoleKey}`
            }
          });
          if (!humanReviewRoundResponse.ok) {
            return Response.json({ error: "Credit negotiation status source is unavailable." }, { headers: noStoreHeaders(), status: 503 });
          }
          const humanReviewRoundRows = z.array(roundRowSchema).max(1).safeParse(await humanReviewRoundResponse.json());
          if (!humanReviewRoundRows.success) {
            return Response.json({ error: "Credit negotiation status source failed validation." }, { headers: noStoreHeaders(), status: 503 });
          }
          humanReviewRound = humanReviewRoundRows.data[0];
        }
        if (humanReviewRound !== undefined && isUnresolvedHumanReviewRoundStatus(humanReviewRound.status)) {
          hasHumanReviewReply = true;
          statusRound = humanReviewRound;
        }
      }
    }

    return Response.json({
      checkedAtIso: new Date().toISOString(),
      latestRound: statusRound === undefined
        ? undefined
        : {
            hasInboundReply: hasHumanReviewReply || (statusRound.inbound_email_id !== null && statusRound.inbound_email_id !== undefined),
            humanReviewRequired: hasHumanReviewReply || statusRound.status === "human_review",
            persistedRoundStatus: statusRound.status,
            round: statusRound.round_no,
            roundId: statusRound.round_id,
            status: hasHumanReviewReply ? "human_review" : statusRound.status,
            statusSource: hasHumanReviewReply ? "credit_counter_offers" : "credit_negotiation_rounds",
            updatedAtIso: statusRound.updated_at
          },
      orderId: orderId.data
    }, { headers: noStoreHeaders() });
  } catch {
    return Response.json({ error: "Credit negotiation status source is unavailable." }, { headers: noStoreHeaders(), status: 503 });
  }
}

function isUnresolvedHumanReviewRoundStatus(status: string): boolean {
  return status === "drafted" || status === "sent" || status === "human_review";
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
