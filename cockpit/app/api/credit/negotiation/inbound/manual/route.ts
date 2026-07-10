import { z } from "zod";
import { loadLocalRuntimeEnvFiles } from "../../../../../../../config/localRuntimeEnv.ts";
import {
  parseCreditNegotiationCounterOffer,
  validateCreditNegotiationCounterPolicy
} from "../../../../../../../src/services/creditNegotiationCounterParser.ts";
import type { EmailFetch, RuntimeEmailEnv } from "../../../../../../../src/services/emailGateway.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../../human-auth.ts";
import {
  buildSupabaseNegotiationInboundStore,
  type CreditNegotiationInboundStore
} from "../route.ts";

interface CreditNegotiationManualInboundRouteTestOptions {
  env?: RuntimeEmailEnv;
  fetchImpl?: EmailFetch;
  store?: CreditNegotiationInboundStore | undefined;
}

const manualCounterSchema = z
  .object({
    fromEmail: z.string().email().optional(),
    orderId: z.string().min(1).max(120),
    pastedText: z.string().min(1).max(20_000),
    round: z.number().int().positive(),
    subject: z.string().max(500).optional()
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  return handleCreditNegotiationManualInboundPostForTest(request);
}

export async function handleCreditNegotiationManualInboundPostForTest(
  request: Request,
  options: CreditNegotiationManualInboundRouteTestOptions = {}
): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const bodyText = await request.text();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "approval",
    proxyRequest: { body: bodyText, method: "POST", path: "/credit/negotiation/inbound/manual" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified David cockpit auth required." }, { status: 401 });
  }
  const principal = authHeaders["x-recoup-human-principal"];
  if (!isDavidHumanPrincipal(principal)) {
    return Response.json({ error: "David human approval is required for manual negotiation counter." }, { status: 403 });
  }

  const parsedBody = manualCounterSchema.safeParse(parseJson(bodyText));
  if (!parsedBody.success) {
    return Response.json({ error: "Invalid manual negotiation counter request." }, { status: 400 });
  }

  const store = options.store ?? buildSupabaseNegotiationInboundStore(runtimeEnv, options.fetchImpl ?? fetch);
  if (store === undefined) {
    return Response.json({ error: "Credit negotiation inbound store is not configured." }, { status: 503 });
  }

  const token = { orderId: parsedBody.data.orderId, round: parsedBody.data.round };
  const round = await store.readRoundByToken?.(token);
  if (round === undefined || round.status !== "sent") {
    return Response.json({
      orderId: token.orderId,
      round: token.round,
      source: "manual",
      status: "dropped_unmatched"
    });
  }

  if (parsedBody.data.fromEmail !== undefined) {
    const contact = await store.readContactForOrder?.(token.orderId, round.accountId);
    if (contact === undefined || normalizeEmail(contact.contactEmail) !== normalizeEmail(parsedBody.data.fromEmail)) {
      return Response.json({
        orderId: token.orderId,
        round: token.round,
        source: "manual",
        status: "dropped_sender"
      });
    }
  }

  const unboundedCounter = parseCreditNegotiationCounterOffer({
    modelExtraction: extractManualCounterSpans(parsedBody.data.pastedText),
    rawMessage: parsedBody.data.pastedText
  });
  const parsedCounter =
    unboundedCounter.status === "grammar_valid"
      ? await validateGrammarValidCounterWithPolicy(unboundedCounter, store)
      : unboundedCounter;
  if (parsedCounter === undefined) {
    return Response.json({ error: "Credit negotiation policy store is not configured." }, { status: 503 });
  }

  const insertCounterOffer = store.insertCounterOffer;
  const markRoundCountered = store.markRoundCountered;
  if (insertCounterOffer === undefined) {
    return storeNotConfiguredResponse();
  }

  if (parsedCounter.status === "grammar_valid" && markRoundCountered === undefined) {
    return storeNotConfiguredResponse();
  }

  const counterOfferRow = {
    accountId: round.accountId,
    citedSpans: parsedCounter.citedSpans,
    ...(parsedCounter.status === "grammar_valid" ? { extractedTerms: parsedCounter.extractedTerms } : {}),
    orderId: round.orderId,
    ...(parsedCounter.status === "human_review" ? { parseReason: parsedCounter.reason } : {}),
    roundId: round.roundId,
    source: "manual",
    status: parsedCounter.status
  } as const;

  if (parsedCounter.status === "grammar_valid") {
    if (markRoundCountered === undefined) {
      return storeNotConfiguredResponse();
    }
    try {
      await insertCounterOffer(counterOfferRow);
      await markRoundCountered({ roundId: round.roundId });
    } catch {
      return Response.json({ error: "Credit negotiation manual inbound persistence failed closed." }, { status: 503 });
    }
    return Response.json({
      orderId: token.orderId,
      parseStatus: parsedCounter.status,
      round: token.round,
      source: "manual",
      status: "countered"
    });
  }

  try {
    await insertCounterOffer(counterOfferRow);
  } catch {
    return Response.json({ error: "Credit negotiation manual inbound persistence failed closed." }, { status: 503 });
  }

  return Response.json({
    orderId: token.orderId,
    parseStatus: parsedCounter.status,
    round: token.round,
    source: "manual",
    status: "human_review"
  });
}

function extractManualCounterSpans(rawMessage: string): {
  citedSpans: Array<{ field: "collateralRatio" | "depositPct" | "financingSpreadBps" | "outOfScope" | "releasePct" | "trancheCount"; text: string }>;
  intent: "counter_offer" | "out_of_scope";
} {
  const citedSpans = [
    readFirstSpan(rawMessage, "depositPct", /\b\d+(?:\.\d+)?\s*%\s+deposit\b/iu),
    readFirstSpan(rawMessage, "releasePct", /\b\d+(?:\.\d+)?\s*%\s+(?:release|ship|fulfilment|fulfillment)\b/iu),
    readFirstSpan(rawMessage, "trancheCount", /\b\d+\s+tranches?\b/iu),
    readFirstSpan(rawMessage, "collateralRatio", /\b\d+(?:\.\d+)?\s*x\s+collateral\b/iu),
    readFirstSpan(rawMessage, "financingSpreadBps", /\b\d+\s*(?:bps|basis points)\b/iu)
  ].flatMap((span) => (span === undefined ? [] : [span]));

  if (citedSpans.length > 0) {
    return { citedSpans, intent: "counter_offer" };
  }

  return {
    citedSpans: [{ field: "outOfScope", text: rawMessage.slice(0, 200) }],
    intent: "out_of_scope"
  };
}

function readFirstSpan(
  rawMessage: string,
  field: "collateralRatio" | "depositPct" | "financingSpreadBps" | "releasePct" | "trancheCount",
  pattern: RegExp
): { field: "collateralRatio" | "depositPct" | "financingSpreadBps" | "releasePct" | "trancheCount"; text: string } | undefined {
  const match = pattern.exec(rawMessage);
  return match === null ? undefined : { field, text: match[0] };
}

async function validateGrammarValidCounterWithPolicy(
  unboundedCounter: ReturnType<typeof parseCreditNegotiationCounterOffer> & { status: "grammar_valid" },
  store: CreditNegotiationInboundStore
): Promise<ReturnType<typeof parseCreditNegotiationCounterOffer> | undefined> {
  const policyRows = await store.readPolicyRows?.();
  return policyRows === undefined ? undefined : validateCreditNegotiationCounterPolicy(unboundedCounter, policyRows);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isDavidHumanPrincipal(principal: string): boolean {
  return /^human:david(?:-|$)/u.test(principal);
}

function storeNotConfiguredResponse(): Response {
  return Response.json({ error: "store_not_configured" }, { status: 503 });
}
