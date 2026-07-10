import { timingSafeEqual } from "node:crypto";
import { loadLocalRuntimeEnvFiles } from "../../../../../../../config/localRuntimeEnv.ts";
import type { EmailFetch, RuntimeEmailEnv } from "../../../../../../../src/services/emailGateway.ts";
import {
  retryFailedCreditNegotiationInboundFetchesForTest,
  type CreditNegotiationInboundStore
} from "../route.ts";

interface CreditNegotiationInboundRetryRouteTestOptions {
  env?: RuntimeEmailEnv;
  extractCounterOffer?: (input: { rawMessage: string }) => Promise<unknown>;
  fetchImpl?: EmailFetch;
  store?: CreditNegotiationInboundStore | undefined;
}

export async function POST(request: Request): Promise<Response> {
  return handleCreditNegotiationInboundRetryPostForTest(request);
}

export async function handleCreditNegotiationInboundRetryPostForTest(
  request: Request,
  options: CreditNegotiationInboundRetryRouteTestOptions = {}
): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const retrySecret = runtimeEnv.CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET?.trim();
  if (retrySecret === undefined || retrySecret.length === 0) {
    return Response.json({ error: "Credit negotiation inbound retry is not configured." }, { status: 503 });
  }

  if (!hasBearerToken(request.headers.get("authorization"), retrySecret)) {
    return Response.json({ error: "Credit negotiation inbound retry is not authorized." }, { status: 401 });
  }

  const limit = readPositiveInteger(runtimeEnv.CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT);
  if (limit === undefined) {
    return Response.json({ error: "Credit negotiation inbound retry limit is not configured." }, { status: 503 });
  }

  try {
    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: runtimeEnv,
      extractCounterOffer: options.extractCounterOffer,
      fetchImpl: options.fetchImpl,
      limit,
      store: options.store
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "store_not_configured") {
      return Response.json({ error: "store_not_configured" }, { status: 503 });
    }
    return Response.json({ error: "Credit negotiation inbound retry failed closed." }, { status: 503 });
  }
}

function hasBearerToken(value: string | null, expectedSecret: string): boolean {
  const token = value?.trim().replace(/^Bearer\s+/iu, "");
  if (token === undefined || token.length === 0) {
    return false;
  }

  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedSecret);
  return tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer);
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^[1-9]\d*$/u.test(value.trim())) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}
