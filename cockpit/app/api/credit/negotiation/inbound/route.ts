import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import {
  parseCreditNegotiationCounterOffer,
  validateCreditNegotiationCounterPolicy,
  type CreditNegotiationCounterParseResult
} from "../../../../../../src/services/creditNegotiationCounterParser.ts";
import { extractCreditNegotiationCounterOfferWithLiveModel } from "../../../../../../src/services/creditNegotiationCounterExtractor.ts";
import type { CreditNegotiationPolicyRow } from "../../../../../../src/services/creditNegotiationPolicy.ts";
import type { EmailFetch, RuntimeEmailEnv } from "../../../../../../src/services/emailGateway.ts";

interface CreditNegotiationInboundRouteTestOptions {
  env?: RuntimeEmailEnv;
  extractCounterOffer?: (input: { rawMessage: string }) => Promise<unknown>;
  fetchImpl?: EmailFetch;
  inboundRateLimit?: CreditNegotiationInboundRateLimit | undefined;
  nowMs?: number;
  store?: CreditNegotiationInboundStore | undefined;
}

interface CreditNegotiationInboundRateLimit {
  maxEvents: number;
  store: Map<string, CreditNegotiationInboundRateLimitState>;
  windowMs: number;
}

interface CreditNegotiationInboundRateLimitState {
  count: number;
  windowStartMs: number;
}

const defaultInboundRateLimitStore = new Map<string, CreditNegotiationInboundRateLimitState>();

export interface CreditNegotiationInboundStore {
  insertCounterOffer?: (row: CreditNegotiationCounterOfferRow) => Promise<CreditNegotiationCounterOfferRow>;
  insertInboundMetadata?: (row: CreditNegotiationInboundMetadataRow) => Promise<CreditNegotiationInboundMetadataRow>;
  markRoundCountered?: (row: { emailId?: string | undefined; roundId: string }) => Promise<unknown>;
  readCounterOfferByEmailId?: (emailId: string) => Promise<CreditNegotiationCounterOfferRow | undefined>;
  readFailedInboundMetadata?: (limit: number) => Promise<readonly CreditNegotiationInboundMetadataRow[]>;
  readPolicyRows?: () => Promise<readonly CreditNegotiationPolicyRow[]>;
  readContactForOrder?: (orderId: string, accountId?: string) => Promise<{ contactEmail: string } | undefined>;
  readInboundByEmailId?: (emailId: string) => Promise<CreditNegotiationInboundMetadataRow | undefined>;
  readRoundByToken?: (token: { orderId: string; round: number }) => Promise<CreditNegotiationRoundRow | undefined>;
  updateInboundMetadata?: (row: CreditNegotiationInboundMetadataRow) => Promise<CreditNegotiationInboundMetadataRow>;
}

export interface CreditNegotiationInboundRetryResult {
  attempted: number;
  countered: number;
  failed: number;
  humanReview: number;
  skipped: number;
  storedMetadata: number;
}

interface CreditNegotiationInboundRetryOptions {
  env?: RuntimeEmailEnv | undefined;
  extractCounterOffer?: ((input: { rawMessage: string }) => Promise<unknown>) | undefined;
  fetchImpl?: EmailFetch | undefined;
  limit: number;
  store?: CreditNegotiationInboundStore | undefined;
}

export interface CreditNegotiationRoundRow {
  accountId: string;
  orderId: string;
  round: number;
  roundId: string;
  status: string;
}

export interface CreditNegotiationInboundMetadataRow {
  accountId: string;
  bodyFetchStatus: "failed" | "fetched";
  emailId: string;
  from: string;
  messageId?: string | undefined;
  orderId: string;
  rawBodyHash: string;
  round: number;
  roundId: string;
  source: "email";
  subject: string;
  textBodyHash?: string | undefined;
  to: string;
}

export interface CreditNegotiationCounterOfferRow {
  accountId: string;
  citedSpans?: unknown;
  emailId?: string | undefined;
  extractedTerms?: unknown;
  messageId?: string | undefined;
  orderId: string;
  parseReason?: string | undefined;
  roundId: string;
  source: "email" | "manual";
  status: "grammar_valid" | "human_review";
}

interface ResendInboundEvent {
  data: {
    email_id: string;
    from: string;
    headers?: Record<string, unknown> | undefined;
    message_id?: string | undefined;
    received_for: string[];
    subject: string;
    to: string[];
  };
  type: string;
}

export async function POST(request: Request): Promise<Response> {
  return handleCreditNegotiationInboundPostForTest(request);
}

export async function handleCreditNegotiationInboundPostForTest(
  request: Request,
  options: CreditNegotiationInboundRouteTestOptions = {}
): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const signingSecret = runtimeEnv.RESEND_INBOUND_SIGNING_SECRET?.trim();
  if (signingSecret === undefined || signingSecret.length === 0) {
    return Response.json({ error: "Credit negotiation inbound webhook is not configured." }, { status: 503 });
  }

  const nowMs = options.nowMs ?? Date.now();
  const rawBody = await request.text();
  if (!verifyResendWebhookSignature({
    headers: request.headers,
    nowMs,
    rawBody,
    signingSecret
  })) {
    return Response.json({ error: "Invalid Resend webhook signature." }, { status: 401 });
  }

  const event = readResendInboundEvent(parseJson(rawBody));
  if (event === undefined || event.type !== "email.received") {
    return Response.json({ status: "ignored" });
  }
  const inboundRateLimit = options.inboundRateLimit ?? readConfiguredInboundRateLimit(runtimeEnv);
  if (inboundRateLimit === undefined && options.inboundRateLimit === undefined && options.store === undefined) {
    return Response.json({ error: "Credit negotiation inbound rate limit is not configured." }, { status: 503 });
  }
  if (inboundRateLimit !== undefined && !consumeInboundRateLimit({ event, nowMs, rateLimit: inboundRateLimit })) {
    return Response.json({ status: "dropped_rate_limited" });
  }
  const token = readNegotiationTokenFromInboundEvent(event);
  if (token === undefined) {
    return Response.json({ status: "dropped_unmatched" });
  }
  const store = options.store ?? buildSupabaseNegotiationInboundStore(runtimeEnv, options.fetchImpl ?? fetch);
  if (store === undefined) {
    return Response.json({ error: "Credit negotiation inbound store is not configured." }, { status: 503 });
  }

  const existing = await store.readInboundByEmailId?.(event.data.email_id);
  const existingCounterOffer = await store.readCounterOfferByEmailId?.(event.data.email_id);
  if (existingCounterOffer !== undefined) {
    const repairResult = await repairExistingCounteredRound({
      counterOffer: existingCounterOffer,
      emailId: event.data.email_id,
      store,
      token
    });
    if (repairResult === "failed") {
      return Response.json({ error: "Credit negotiation inbound persistence failed closed." }, { status: 503 });
    }
    return Response.json({ emailId: event.data.email_id, status: "duplicate" });
  }

  const round = await store.readRoundByToken?.(token);
  if (round === undefined || round.status !== "sent") {
    return Response.json({ emailId: event.data.email_id, status: "dropped_unmatched" });
  }

  const contact = await store.readContactForOrder?.(token.orderId, round.accountId);
  if (contact === undefined || normalizeEmail(contact.contactEmail) !== normalizeEmail(event.data.from)) {
    return Response.json({ emailId: event.data.email_id, status: "dropped_sender" });
  }

  const messageId = readInboundMessageId(event);
  const fetchedBody = await fetchInboundEmailBody({
    emailId: event.data.email_id,
    fetchImpl: options.fetchImpl ?? fetch,
    runtimeEnv
  });
  const metadata: CreditNegotiationInboundMetadataRow = {
    accountId: round.accountId,
    bodyFetchStatus: fetchedBody.ok ? "fetched" : "failed",
    emailId: event.data.email_id,
    from: event.data.from,
    ...(messageId === undefined ? {} : { messageId }),
    orderId: round.orderId,
    rawBodyHash: sha256Hex(rawBody),
    round: round.round,
    roundId: round.roundId,
    source: "email",
    subject: event.data.subject,
    ...(!fetchedBody.ok || fetchedBody.text === undefined ? {} : { textBodyHash: sha256Hex(fetchedBody.text) }),
    to: inboundRecipientMetadata(event)
  };

  if (!fetchedBody.ok) {
    const metadataWrite = await writeInboundMetadata({ existing, metadata, store });
    if (!metadataWrite.ok) {
      return Response.json({ error: "Credit negotiation inbound metadata writer is not configured." }, { status: 503 });
    }
    return Response.json(
      {
        emailId: event.data.email_id,
        error: "Credit negotiation inbound body fetch failed."
      },
      { status: 502 }
    );
  }

  if (fetchedBody.text !== undefined) {
    const modelExtraction = await (options.extractCounterOffer ?? ((counterInput: { rawMessage: string }) =>
      extractCreditNegotiationCounterOfferWithLiveModel({
        env: runtimeEnv,
        fetchImpl: options.fetchImpl ?? fetch,
        rawMessage: counterInput.rawMessage
      })))({ rawMessage: fetchedBody.text });
    if (modelExtraction === undefined) {
      await writeInboundMetadata({ existing, metadata: { ...metadata, bodyFetchStatus: "failed" }, store });
      return Response.json({ error: "Credit negotiation inbound live extractor is not configured." }, { status: 503 });
    }
    const parsedCounter = await validateParsedCounterWithPolicy(
      parseCreditNegotiationCounterOffer({
        modelExtraction,
        rawMessage: fetchedBody.text
      }),
      store
    );
    if (parsedCounter === undefined) {
      await writeInboundMetadata({ existing, metadata: { ...metadata, bodyFetchStatus: "failed" }, store });
      return Response.json({ error: "Credit negotiation policy store is not configured." }, { status: 503 });
    }
    const insertCounterOffer = store.insertCounterOffer;
    const markRoundCountered = store.markRoundCountered;
    if (insertCounterOffer === undefined || (parsedCounter.status === "grammar_valid" && markRoundCountered === undefined)) {
      await writeInboundMetadata({ existing, metadata: { ...metadata, bodyFetchStatus: "failed" }, store });
      return Response.json({ error: "store_not_configured" }, { status: 503 });
    }

    const counterOfferRow: CreditNegotiationCounterOfferRow = {
      accountId: round.accountId,
      citedSpans: parsedCounter.citedSpans,
      emailId: event.data.email_id,
      ...(parsedCounter.status === "grammar_valid" ? { extractedTerms: parsedCounter.extractedTerms } : {}),
      ...(metadata.messageId === undefined ? {} : { messageId: metadata.messageId }),
      orderId: round.orderId,
      ...(parsedCounter.status === "human_review" ? { parseReason: parsedCounter.reason } : {}),
      roundId: round.roundId,
      source: "email",
      status: parsedCounter.status
    };
    const metadataWrite = await writeInboundMetadata({ existing, metadata, store });
    if (!metadataWrite.ok) {
      return Response.json({ error: "Credit negotiation inbound metadata writer is not configured." }, { status: 503 });
    }

    try {
      await insertCounterOffer(counterOfferRow);
      if (parsedCounter.status === "grammar_valid") {
        if (markRoundCountered === undefined) {
          return Response.json({ error: "store_not_configured" }, { status: 503 });
        }
        await markRoundCountered({ emailId: event.data.email_id, roundId: round.roundId });
      }
    } catch {
      await markInboundMetadataRetryable({ metadata, store });
      return Response.json({ error: "Credit negotiation inbound persistence failed closed." }, { status: 503 });
    }

    if (parsedCounter.status === "grammar_valid") {
      return Response.json({ emailId: event.data.email_id, parseStatus: parsedCounter.status, status: "countered" });
    }

    return Response.json({ emailId: event.data.email_id, parseStatus: parsedCounter.status, status: "human_review" });
  }

  const metadataWrite = await writeInboundMetadata({ existing, metadata: { ...metadata, bodyFetchStatus: "failed" }, store });
  if (!metadataWrite.ok) {
    return Response.json({ error: "Credit negotiation inbound metadata writer is not configured." }, { status: 503 });
  }
  return Response.json({ emailId: event.data.email_id, status: "stored_metadata" });
}

export async function retryFailedCreditNegotiationInboundFetchesForTest(
  options: CreditNegotiationInboundRetryOptions
): Promise<CreditNegotiationInboundRetryResult> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const fetchImpl = options.fetchImpl ?? fetch;
  const store = options.store ?? buildSupabaseNegotiationInboundStore(runtimeEnv, fetchImpl);
  if (
    store?.readFailedInboundMetadata === undefined ||
    store.updateInboundMetadata === undefined ||
    options.limit < 1 ||
    !Number.isInteger(options.limit)
  ) {
    throw new Error("store_not_configured");
  }

  const result: CreditNegotiationInboundRetryResult = {
    attempted: 0,
    countered: 0,
    failed: 0,
    humanReview: 0,
    skipped: 0,
    storedMetadata: 0
  };
  const failedRows = await store.readFailedInboundMetadata(options.limit);
  for (const metadata of failedRows) {
    result.attempted += 1;
    const existingCounterOffer = await store.readCounterOfferByEmailId?.(metadata.emailId);
    if (existingCounterOffer !== undefined) {
      const repairResult = await repairExistingCounteredRound({
        counterOffer: existingCounterOffer,
        emailId: metadata.emailId,
        store,
        token: { orderId: metadata.orderId, round: metadata.round }
      });
      if (repairResult === "repaired") {
        result.countered += 1;
      } else if (repairResult === "failed") {
        result.failed += 1;
      } else {
        result.skipped += 1;
      }
      continue;
    }

    const round = await store.readRoundByToken?.({ orderId: metadata.orderId, round: metadata.round });
    if (
      round === undefined ||
      round.status !== "sent" ||
      round.accountId !== metadata.accountId ||
      round.orderId !== metadata.orderId ||
      round.roundId !== metadata.roundId
    ) {
      result.skipped += 1;
      continue;
    }

    const contact = await store.readContactForOrder?.(metadata.orderId, metadata.accountId);
    if (contact === undefined || normalizeEmail(contact.contactEmail) !== normalizeEmail(metadata.from)) {
      result.skipped += 1;
      continue;
    }

    const fetchedBody = await fetchInboundEmailBody({
      emailId: metadata.emailId,
      fetchImpl,
      runtimeEnv
    });
    if (!fetchedBody.ok) {
      result.failed += 1;
      continue;
    }

    if (fetchedBody.text === undefined) {
      result.failed += 1;
      continue;
    }

    const parsedCounter = await parseFetchedInboundCounter({
      extractCounterOffer: options.extractCounterOffer,
      fetchImpl,
      rawMessage: fetchedBody.text,
      runtimeEnv,
      store
    });
    if (parsedCounter === undefined) {
      result.failed += 1;
      continue;
    }

    const insertCounterOffer = store.insertCounterOffer;
    const markRoundCountered = store.markRoundCountered;
    if (insertCounterOffer === undefined || (parsedCounter.status === "grammar_valid" && markRoundCountered === undefined)) {
      throw new Error("store_not_configured");
    }

    const counterOfferRow: CreditNegotiationCounterOfferRow = {
      accountId: round.accountId,
      citedSpans: parsedCounter.citedSpans,
      emailId: metadata.emailId,
      ...(parsedCounter.status === "grammar_valid" ? { extractedTerms: parsedCounter.extractedTerms } : {}),
      ...(metadata.messageId === undefined ? {} : { messageId: metadata.messageId }),
      orderId: round.orderId,
      ...(parsedCounter.status === "human_review" ? { parseReason: parsedCounter.reason } : {}),
      roundId: round.roundId,
      source: "email",
      status: parsedCounter.status
    };
    const fetchedMetadata: CreditNegotiationInboundMetadataRow = {
      ...metadata,
      bodyFetchStatus: "fetched",
      textBodyHash: sha256Hex(fetchedBody.text)
    };
    try {
      await store.updateInboundMetadata(fetchedMetadata);
    } catch {
      result.failed += 1;
      continue;
    }

    if (parsedCounter.status === "grammar_valid") {
      if (markRoundCountered === undefined) {
        throw new Error("store_not_configured");
      }
      try {
        await insertCounterOffer(counterOfferRow);
        await markRoundCountered({ emailId: metadata.emailId, roundId: round.roundId });
        result.countered += 1;
      } catch {
        await markInboundMetadataRetryable({ metadata: fetchedMetadata, store });
        result.failed += 1;
      }
    } else {
      try {
        await insertCounterOffer(counterOfferRow);
        result.humanReview += 1;
      } catch {
        await markInboundMetadataRetryable({ metadata: fetchedMetadata, store });
        result.failed += 1;
      }
    }
  }

  return result;
}

export function buildSupabaseNegotiationInboundStore(
  env: RuntimeEmailEnv,
  fetchImpl: EmailFetch
): CreditNegotiationInboundStore | undefined {
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
    async insertCounterOffer(row) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/credit_counter_offers`, {
        body: JSON.stringify(toSupabaseCounterOfferRow(row)),
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation counter-offer insert failed.");
      }

      return counterOfferRowFromSupabase((await readJsonArray(response))[0]) ?? row;
    },
    async insertInboundMetadata(row) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/credit_negotiation_inbound_emails`, {
        body: JSON.stringify(toSupabaseInboundMetadataRow(row)),
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation inbound metadata insert failed.");
      }

      return inboundMetadataRowFromSupabase((await readJsonArray(response))[0]) ?? row;
    },
    async updateInboundMetadata(row) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_inbound_emails`);
      url.searchParams.set("email_id", `eq.${row.emailId}`);
      const response = await fetchImpl(url.toString(), {
        body: JSON.stringify(toSupabaseInboundMetadataRow(row)),
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "PATCH"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation inbound metadata update failed.");
      }

      const updatedRow = inboundMetadataRowFromSupabase((await readJsonArray(response))[0]);
      if (updatedRow === undefined) {
        throw new Error("Credit negotiation inbound metadata update failed.");
      }

      return updatedRow;
    },
    async readCounterOfferByEmailId(emailId) {
      const url = new URL(`${baseUrl}/rest/v1/credit_counter_offers`);
      url.searchParams.set(
        "select",
        "account_id,cited_spans_json,email_id,extracted_terms_json,message_id,order_id,parse_reason,round_id,source,status"
      );
      url.searchParams.set("email_id", `eq.${emailId}`);
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url.toString(), { headers, method: "GET" });
      if (!response.ok) {
        throw new Error("Credit negotiation counter-offer dedupe read failed.");
      }

      return counterOfferRowFromSupabase((await readJsonArray(response))[0]);
    },
    async readFailedInboundMetadata(limit) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_inbound_emails`);
      url.searchParams.set(
        "select",
        "account_id,body_fetch_status,email_id,from_email,message_id,order_id,raw_body_hash,round_id,round_no,source,subject,text_body_hash,to_email"
      );
      url.searchParams.set("body_fetch_status", "eq.failed");
      url.searchParams.set("order", "created_at.asc");
      url.searchParams.set("limit", limit.toString());
      const response = await fetchImpl(url.toString(), { headers, method: "GET" });
      if (!response.ok) {
        throw new Error("Credit negotiation failed inbound metadata read failed.");
      }

      const rows = await readJsonArray(response);
      return rows.flatMap((row) => {
        const metadataRow = inboundMetadataRowFromSupabase(row);
        return metadataRow === undefined ? [] : [metadataRow];
      });
    },
    async readPolicyRows() {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_policy`);
      url.searchParams.set("select", "active,approved_by,effective_from,key,policy_version,record_id,value_text");
      url.searchParams.set("active", "eq.true");
      const response = await fetchImpl(url.toString(), { headers, method: "GET" });
      if (!response.ok) {
        throw new Error("Credit negotiation policy read failed.");
      }

      const rows = await readJsonArray(response);
      return rows.flatMap((row) => {
        const policyRow = policyRowFromSupabase(row);
        return policyRow === undefined ? [] : [policyRow];
      });
    },
    async markRoundCountered(row) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_rounds`);
      url.searchParams.set("round_id", `eq.${row.roundId}`);
      const response = await fetchImpl(url.toString(), {
        body: JSON.stringify({
          ...(row.emailId === undefined ? {} : { inbound_email_id: row.emailId }),
          status: "countered"
        }),
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "PATCH"
      });
      if (!response.ok) {
        throw new Error("Credit negotiation round update failed.");
      }

      const updatedRows = await readJsonArray(response);
      if (updatedRows.length < 1) {
        throw new Error("Credit negotiation round update failed.");
      }

      return updatedRows;
    },
    async readContactForOrder(_orderId, accountId) {
      if (accountId === undefined) {
        return undefined;
      }

      const url = new URL(`${baseUrl}/rest/v1/credit_account_contacts`);
      url.searchParams.set("select", "contact_email");
      url.searchParams.set("account_id", `eq.${accountId}`);
      url.searchParams.set("role", "eq.ap");
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url.toString(), { headers, method: "GET" });
      if (!response.ok) {
        throw new Error("Credit negotiation account contact read failed.");
      }

      const row = asRecord((await readJsonArray(response))[0]);
      const contactEmail = readString(row?.contact_email);
      return contactEmail === undefined ? undefined : { contactEmail };
    },
    async readInboundByEmailId(emailId) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_inbound_emails`);
      url.searchParams.set(
        "select",
        "account_id,body_fetch_status,email_id,from_email,message_id,order_id,raw_body_hash,round_id,round_no,source,subject,text_body_hash,to_email"
      );
      url.searchParams.set("email_id", `eq.${emailId}`);
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url.toString(), { headers, method: "GET" });
      if (!response.ok) {
        throw new Error("Credit negotiation inbound dedupe read failed.");
      }

      return inboundMetadataRowFromSupabase((await readJsonArray(response))[0]);
    },
    async readRoundByToken(token) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_rounds`);
      url.searchParams.set("select", "account_id,order_id,round_id,round_no,status");
      url.searchParams.set("order_id", `eq.${token.orderId}`);
      url.searchParams.set("round_no", `eq.${token.round.toString()}`);
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url.toString(), { headers, method: "GET" });
      if (!response.ok) {
        throw new Error("Credit negotiation round read failed.");
      }

      return roundRowFromSupabase((await readJsonArray(response))[0]);
    }
  };
}

function verifyResendWebhookSignature(input: {
  headers: Headers;
  nowMs: number;
  rawBody: string;
  signingSecret: string;
}): boolean {
  const webhookId = input.headers.get("svix-id")?.trim();
  const timestamp = input.headers.get("svix-timestamp")?.trim();
  const signatureHeader = input.headers.get("svix-signature")?.trim();
  if (webhookId === undefined || timestamp === undefined || signatureHeader === undefined) {
    return false;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(input.nowMs / 1000) - timestampSeconds) > 300) {
    return false;
  }

  const secret = decodeSvixSecret(input.signingSecret);
  if (secret === undefined) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${webhookId}.${timestamp}.${input.rawBody}`).digest("base64");
  return signatureHeader
    .split(/\s+/u)
    .flatMap((entry) => {
      const [version, signature, extra] = entry.split(",");
      return version === "v1" && signature !== undefined && extra === undefined ? [signature] : [];
    })
    .some((signature) => safeEqualStrings(signature, expected));
}

function decodeSvixSecret(secret: string): Buffer | undefined {
  const trimmed = secret.trim();
  if (!trimmed.startsWith("whsec_")) {
    return undefined;
  }
  const encoded = trimmed.slice("whsec_".length);
  if (encoded.length === 0 || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    return undefined;
  }

  const decoded = Buffer.from(encoded, "base64");
  return decoded.length === 0 ? undefined : decoded;
}

function readConfiguredInboundRateLimit(env: RuntimeEmailEnv): CreditNegotiationInboundRateLimit | undefined {
  const maxEvents = readPositiveInteger(env.RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS);
  const windowMs = readPositiveInteger(env.RESEND_INBOUND_RATE_LIMIT_WINDOW_MS);
  if (maxEvents === undefined || windowMs === undefined) {
    return undefined;
  }

  return { maxEvents, store: defaultInboundRateLimitStore, windowMs };
}

async function writeInboundMetadata(input: {
  existing: CreditNegotiationInboundMetadataRow | undefined;
  metadata: CreditNegotiationInboundMetadataRow;
  store: CreditNegotiationInboundStore;
}): Promise<{ ok: boolean }> {
  const metadataWriter = input.existing === undefined ? input.store.insertInboundMetadata : input.store.updateInboundMetadata;
  if (metadataWriter === undefined) {
    return { ok: false };
  }

  try {
    await metadataWriter(input.metadata);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function markInboundMetadataRetryable(input: {
  metadata: CreditNegotiationInboundMetadataRow;
  store: CreditNegotiationInboundStore;
}): Promise<void> {
  if (input.store.updateInboundMetadata === undefined) {
    return;
  }

  try {
    await input.store.updateInboundMetadata({
      ...input.metadata,
      bodyFetchStatus: "failed"
    });
  } catch {
    // The caller already fails closed; this best-effort revert keeps successful updates retryable.
  }
}

async function repairExistingCounteredRound(input: {
  counterOffer: CreditNegotiationCounterOfferRow;
  emailId: string;
  store: CreditNegotiationInboundStore;
  token: { orderId: string; round: number };
}): Promise<"failed" | "repaired" | "skipped"> {
  if (input.counterOffer.status !== "grammar_valid" || input.store.readRoundByToken === undefined) {
    return "skipped";
  }

  let round: CreditNegotiationRoundRow | undefined;
  try {
    round = await input.store.readRoundByToken(input.token);
  } catch {
    return "failed";
  }

  if (
    round === undefined ||
    round.status !== "sent" ||
    round.accountId !== input.counterOffer.accountId ||
    round.orderId !== input.counterOffer.orderId ||
    round.roundId !== input.counterOffer.roundId
  ) {
    return "skipped";
  }

  if (input.store.markRoundCountered === undefined) {
    return "failed";
  }

  try {
    await input.store.markRoundCountered({ emailId: input.emailId, roundId: round.roundId });
    return "repaired";
  } catch {
    return "failed";
  }
}

function consumeInboundRateLimit(input: {
  event: ResendInboundEvent;
  nowMs: number;
  rateLimit: CreditNegotiationInboundRateLimit;
}): boolean {
  if (
    !Number.isFinite(input.nowMs) ||
    input.rateLimit.maxEvents < 1 ||
    input.rateLimit.windowMs < 1
  ) {
    return false;
  }

  const keys = rateLimitKeysForEvent(input.event);
  if (keys.length === 0) {
    return false;
  }

  if (keys.some((key) => rateLimitKeyIsExhausted(input.rateLimit.store.get(key), input.nowMs, input.rateLimit.windowMs, input.rateLimit.maxEvents))) {
    return false;
  }

  for (const key of keys) {
    consumeRateLimitKey(input.rateLimit.store, key, input.nowMs, input.rateLimit.windowMs);
  }
  return true;
}

function rateLimitKeyIsExhausted(
  current: CreditNegotiationInboundRateLimitState | undefined,
  nowMs: number,
  windowMs: number,
  maxEvents: number
): boolean {
  if (
    current === undefined ||
    nowMs < current.windowStartMs ||
    nowMs - current.windowStartMs >= windowMs
  ) {
    return false;
  }

  return current.count >= maxEvents;
}

function consumeRateLimitKey(
  store: Map<string, CreditNegotiationInboundRateLimitState>,
  key: string,
  nowMs: number,
  windowMs: number
): void {
  const current = store.get(key);
  if (
    current === undefined ||
    nowMs < current.windowStartMs ||
    nowMs - current.windowStartMs >= windowMs
  ) {
    store.set(key, { count: 1, windowStartMs: nowMs });
    return;
  }

  current.count += 1;
}

function rateLimitKeysForEvent(event: ResendInboundEvent): string[] {
  const sender = normalizeEmail(event.data.from);
  const senderDomain = emailDomain(sender);
  return dedupeStrings([
    "catch-all",
    `sender:${sender}`,
    senderDomain === undefined ? undefined : `sender-domain:${senderDomain}`
  ]);
}

async function fetchInboundEmailBody(input: {
  emailId: string;
  fetchImpl: EmailFetch;
  runtimeEnv: RuntimeEmailEnv;
}): Promise<{ ok: false } | { ok: true; text?: string | undefined }> {
  const response = await input.fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(input.emailId)}`, {
    headers: {
      authorization: `Bearer ${input.runtimeEnv.RESEND_API_KEY ?? ""}`
    },
    method: "GET"
  }).catch(() => undefined);
  if (response === undefined) {
    return { ok: false };
  }
  if (!response.ok) {
    return { ok: false };
  }

  const payload = asRecord(await readJson(response));
  return { ok: true, text: readString(payload?.text) };
}

function readNegotiationToken(value: string): { orderId: string; round: number } | undefined {
  const plusMatch = /(?:\+|\b)([A-Z0-9-]+)-r([1-9]\d*)\b/u.exec(value);
  if (plusMatch !== null) {
    return { orderId: plusMatch[1] as string, round: Number.parseInt(plusMatch[2] as string, 10) };
  }

  const subjectMatch = /\bRecoup\s+Deal\s+([A-Z0-9-]+)\s+(?:·|-)\s+Round\s+([1-9]\d*)\b/iu.exec(value);
  return subjectMatch === null ? undefined : { orderId: subjectMatch[1] as string, round: Number.parseInt(subjectMatch[2] as string, 10) };
}

function readNegotiationTokenFromInboundEvent(event: ResendInboundEvent): { orderId: string; round: number } | undefined {
  for (const candidate of [...event.data.to, ...event.data.received_for, event.data.subject]) {
    const token = readNegotiationToken(candidate);
    if (token !== undefined) {
      return token;
    }
  }

  return undefined;
}

function readResendInboundEvent(value: unknown): ResendInboundEvent | undefined {
  const event = asRecord(value);
  const data = asRecord(event?.data);
  const to = readStringList(data?.to);
  const receivedFor = readStringList(data?.received_for);
  if (
    !isNonEmptyString(event?.type) ||
    !isNonEmptyString(data?.email_id) ||
    !isNonEmptyString(data.from) ||
    !isNonEmptyString(data.subject) ||
    to.length + receivedFor.length === 0
  ) {
    return undefined;
  }

  return {
    data: {
      email_id: data.email_id,
      from: data.from,
      headers: asRecord(data.headers),
      message_id: readString(data.message_id),
      received_for: receivedFor,
      subject: data.subject,
      to
    },
    type: event.type
  };
}

function readInboundMessageId(event: ResendInboundEvent): string | undefined {
  return event.data.message_id ?? readString(event.data.headers?.["message-id"]);
}

function inboundRecipientMetadata(event: ResendInboundEvent): string {
  return [...event.data.to, ...event.data.received_for].join(",");
}

function toSupabaseCounterOfferRow(row: CreditNegotiationCounterOfferRow): Record<string, unknown> {
  return {
    account_id: row.accountId,
    cited_spans_json: row.citedSpans ?? [],
    ...(row.emailId === undefined ? {} : { email_id: row.emailId }),
    extracted_terms_json: row.extractedTerms ?? {},
    ...(row.messageId === undefined ? {} : { message_id: row.messageId }),
    order_id: row.orderId,
    parse_reason: row.parseReason,
    round_id: row.roundId,
    source: row.source,
    status: row.status
  };
}

function toSupabaseInboundMetadataRow(row: CreditNegotiationInboundMetadataRow): Record<string, unknown> {
  return {
    account_id: row.accountId,
    body_fetch_status: row.bodyFetchStatus,
    email_id: row.emailId,
    from_email: row.from,
    message_id: row.messageId,
    order_id: row.orderId,
    raw_body_hash: row.rawBodyHash,
    round_id: row.roundId,
    round_no: row.round,
    source: row.source,
    subject: row.subject,
    text_body_hash: row.textBodyHash,
    to_email: row.to
  };
}

async function parseFetchedInboundCounter(input: {
  extractCounterOffer?: ((counterInput: { rawMessage: string }) => Promise<unknown>) | undefined;
  fetchImpl: EmailFetch;
  rawMessage: string;
  runtimeEnv: RuntimeEmailEnv;
  store: CreditNegotiationInboundStore;
}): Promise<CreditNegotiationCounterParseResult | undefined> {
  const modelExtraction = await (input.extractCounterOffer ?? ((counterInput: { rawMessage: string }) =>
    extractCreditNegotiationCounterOfferWithLiveModel({
      env: input.runtimeEnv,
      fetchImpl: input.fetchImpl,
      rawMessage: counterInput.rawMessage
    })))({ rawMessage: input.rawMessage });
  if (modelExtraction === undefined) {
    return undefined;
  }

  return validateParsedCounterWithPolicy(
    parseCreditNegotiationCounterOffer({
      modelExtraction,
      rawMessage: input.rawMessage
    }),
    input.store
  );
}

async function validateParsedCounterWithPolicy(
  parsedCounter: CreditNegotiationCounterParseResult,
  store: CreditNegotiationInboundStore
): Promise<CreditNegotiationCounterParseResult | undefined> {
  if (parsedCounter.status !== "grammar_valid") {
    return parsedCounter;
  }

  const policyRows = await store.readPolicyRows?.();
  if (policyRows === undefined) {
    return undefined;
  }

  return validateCreditNegotiationCounterPolicy(parsedCounter, policyRows);
}

function inboundMetadataRowFromSupabase(value: unknown): CreditNegotiationInboundMetadataRow | undefined {
  const row = asRecord(value);
  if (
    !isNonEmptyString(row?.account_id) ||
    (row.body_fetch_status !== "fetched" && row.body_fetch_status !== "failed") ||
    !isNonEmptyString(row.email_id) ||
    !isNonEmptyString(row.from_email) ||
    !isNonEmptyString(row.order_id) ||
    !isNonEmptyString(row.raw_body_hash) ||
    !isNonEmptyString(row.round_id) ||
    typeof row.round_no !== "number" ||
    row.source !== "email" ||
    !isNonEmptyString(row.subject) ||
    !isNonEmptyString(row.to_email)
  ) {
    return undefined;
  }

  return {
    accountId: row.account_id,
    bodyFetchStatus: row.body_fetch_status,
    emailId: row.email_id,
    from: row.from_email,
    messageId: readString(row.message_id),
    orderId: row.order_id,
    rawBodyHash: row.raw_body_hash,
    round: row.round_no,
    roundId: row.round_id,
    source: "email",
    subject: row.subject,
    textBodyHash: readString(row.text_body_hash),
    to: row.to_email
  };
}

function policyRowFromSupabase(value: unknown): CreditNegotiationPolicyRow | undefined {
  const row = asRecord(value);
  if (
    typeof row?.active !== "boolean" ||
    !isNonEmptyString(row.approved_by) ||
    !isNonEmptyString(row.effective_from) ||
    !isNonEmptyString(row.key) ||
    typeof row.policy_version !== "number" ||
    !isNonEmptyString(row.record_id) ||
    !isNonEmptyString(row.value_text)
  ) {
    return undefined;
  }

  return {
    active: row.active,
    approvedBy: row.approved_by,
    effectiveFrom: row.effective_from,
    key: row.key,
    policyVersion: row.policy_version,
    recordId: row.record_id,
    valueText: row.value_text
  };
}

function counterOfferRowFromSupabase(value: unknown): CreditNegotiationCounterOfferRow | undefined {
  const row = asRecord(value);
  if (
    !isNonEmptyString(row?.account_id) ||
    !isNonEmptyString(row.order_id) ||
    !isNonEmptyString(row.round_id) ||
    (row.source !== "email" && row.source !== "manual") ||
    (row.status !== "grammar_valid" && row.status !== "human_review")
  ) {
    return undefined;
  }

  return {
    accountId: row.account_id,
    citedSpans: row.cited_spans_json,
    ...(readString(row.email_id) === undefined ? {} : { emailId: readString(row.email_id) }),
    extractedTerms: row.extracted_terms_json,
    ...(readString(row.message_id) === undefined ? {} : { messageId: readString(row.message_id) }),
    orderId: row.order_id,
    parseReason: readString(row.parse_reason),
    roundId: row.round_id,
    source: row.source,
    status: row.status
  };
}

function roundRowFromSupabase(value: unknown): CreditNegotiationRoundRow | undefined {
  const row = asRecord(value);
  if (
    !isNonEmptyString(row?.account_id) ||
    !isNonEmptyString(row.order_id) ||
    !isNonEmptyString(row.round_id) ||
    !isNonEmptyString(row.status) ||
    typeof row.round_no !== "number"
  ) {
    return undefined;
  }

  return {
    accountId: row.account_id,
    orderId: row.order_id,
    round: row.round_no,
    roundId: row.round_id,
    status: row.status
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function readJsonArray(response: Response): Promise<unknown[]> {
  const payload = await readJson(response);
  return Array.isArray(payload) ? payload.map((item: unknown) => item) : [];
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? [] : [trimmed];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    const trimmed = entry.trim();
    return trimmed.length === 0 ? [] : [trimmed];
  });
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^[1-9]\d*$/u.test(value.trim())) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailDomain(value: string): string | undefined {
  const [, domain] = value.split("@");
  return domain === undefined || domain.trim().length === 0 ? undefined : domain.trim().toLowerCase();
}

function dedupeStrings(values: ReadonlyArray<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => (value === undefined || value.trim().length === 0 ? [] : [value])))];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
