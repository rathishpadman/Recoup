import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type EmailRecipientGroup = "billing" | "recovery";
export type EmailFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type RuntimeEmailEnv = Partial<Record<string, string | undefined>>;

export interface RecoupEmailConfig {
  billingRecipient: string;
  recoveryRecipient: string;
  resendApiKey: string;
  senderEmailAddress: string;
}

export interface RecoupEmailDraft {
  actionId: string;
  body: string;
  lineId: string;
  recipientGroup: EmailRecipientGroup;
  subject: string;
}

interface ResendEmailProviderBody {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string[];
}

interface ResendNegotiationEmailProviderBody extends ResendEmailProviderBody {
  headers?: Record<string, string> | undefined;
  reply_to: string;
}

export interface CreditNegotiationEmailDraft {
  accountId: string;
  actionId: string;
  approvedBodyHash: string;
  body: string;
  from: string;
  headers?: Record<string, string> | undefined;
  orderId: string;
  replyTo: string;
  round: number;
  subject: string;
  to: string;
}

export interface CreditNegotiationEmailSendResult {
  accountId: string;
  actionId: string;
  approvedBodyHash: string;
  idempotencyKey: string;
  orderId: string;
  principal?: string | undefined;
  providerEmailId: string;
  round: number;
  sentBodyHash: string;
  status: string;
}

interface CreditNegotiationEmailLedgerBase {
  accountId: string;
  actionId: string;
  approvedBodyHash: string;
  from: string;
  idempotencyKey: string;
  orderId: string;
  principal?: string | undefined;
  replyTo: string;
  round: number;
  subject: string;
  to: string;
}

export interface CreditNegotiationEmailPendingLedgerEntry extends CreditNegotiationEmailLedgerBase {
  reservedAtIso: string;
  status: "pending";
}

export interface CreditNegotiationEmailFailedLedgerEntry extends CreditNegotiationEmailLedgerBase {
  reservedAtIso: string;
  status: "failed";
}

export interface CreditNegotiationEmailSendLedgerEntry extends CreditNegotiationEmailLedgerBase {
  providerEmailId: string;
  sentAtIso: string;
  sentBodyHash: string;
  status: string;
}

export interface CreditNegotiationEmailSendLedger {
  insertPending(row: CreditNegotiationEmailPendingLedgerEntry): Promise<CreditNegotiationEmailPendingLedgerEntry>;
  markFailed(row: CreditNegotiationEmailFailedLedgerEntry): Promise<CreditNegotiationEmailFailedLedgerEntry>;
  markSent(row: CreditNegotiationEmailSendLedgerEntry): Promise<CreditNegotiationEmailSendLedgerEntry>;
  readByActionId(
    actionId: string
  ): Promise<
    CreditNegotiationEmailFailedLedgerEntry | CreditNegotiationEmailPendingLedgerEntry | CreditNegotiationEmailSendLedgerEntry | undefined
  >;
  readByIdempotencyKey(
    idempotencyKey: string
  ): Promise<
    CreditNegotiationEmailFailedLedgerEntry | CreditNegotiationEmailPendingLedgerEntry | CreditNegotiationEmailSendLedgerEntry | undefined
  >;
}

export interface EmailSendReceipt {
  actionId: string;
  bodyHtmlHash: string;
  bodyTextHash: string;
  lineId: string;
  principal?: string | undefined;
  providerEmailId: string;
  recipientGroup: EmailRecipientGroup;
  sentAtIso: string;
  subject: string;
}

export interface EmailSendResult {
  actionId: string;
  bodyHtmlHash: string;
  bodyTextHash: string;
  lineId: string;
  providerEmailId: string;
  recipientGroup: EmailRecipientGroup;
  status: string;
  statusToken: string;
}

export type RecoupEmailConfigResult = { config: RecoupEmailConfig; ok: true } | { missing: string[]; ok: false };
export type ApprovedEmailSendPolicyResult = { ok: true } | { error: string; ok: false; status: number };
type RequiredEmailFactFragmentsResult = { fragments: string[]; ok: true } | { ok: false };
type EmailSendLedgerEntry = { receipt: EmailSendReceipt; status: string };

const requiredEmailEnvKeys = ["RESEND_API_KEY", "EMAIL_TO_BILLING", "EMAIL_TO_RECOVERY", "SENDER_EMAIL_ADDRESS"] as const;
const emailStatusReceiptTtlMs = 15 * 60 * 1000;
const emailSendReceipts = new Map<string, EmailSendLedgerEntry>();
const emailSendInFlight = new Map<string, Promise<EmailSendLedgerEntry>>();

export function readRecoupEmailConfig(env: RuntimeEmailEnv): RecoupEmailConfigResult {
  const missing = requiredEmailEnvKeys.filter((key) => !isConfiguredValue(env[key]));
  if (missing.length > 0) {
    return { missing: [...missing], ok: false };
  }

  return {
    config: {
      billingRecipient: env.EMAIL_TO_BILLING as string,
      recoveryRecipient: env.EMAIL_TO_RECOVERY as string,
      resendApiKey: env.RESEND_API_KEY as string,
      senderEmailAddress: env.SENDER_EMAIL_ADDRESS as string
    },
    ok: true
  };
}

export async function sendResendEmail(input: {
  config: RecoupEmailConfig;
  draft: RecoupEmailDraft;
  fetchImpl?: EmailFetch | undefined;
  principal?: string | undefined;
  statusSecret: string;
}): Promise<EmailSendResult> {
  const textBody = input.draft.body;
  const htmlBody = plainTextEmailHtml(textBody);
  const bodyHtmlHash = sha256Hex(htmlBody);
  const bodyTextHash = sha256Hex(textBody);
  const providerBody = buildResendEmailProviderBody(input.config, input.draft, { htmlBody, textBody });
  const sendKey = emailSendLedgerKey(input.draft, providerBody);
  const existing = emailSendReceipts.get(sendKey);
  if (existing !== undefined) {
    return emailSendResultFromReceipt(existing.receipt, "already_sent", input.statusSecret);
  }

  const pending = emailSendInFlight.get(sendKey);
  if (pending !== undefined) {
    const entry = await pending;
    return emailSendResultFromReceipt(entry.receipt, "already_sent", input.statusSecret);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const sendPromise = deliverResendEmail({
    bodyHtmlHash,
    bodyTextHash,
    config: input.config,
    draft: input.draft,
    fetchImpl,
    htmlBody,
    principal: input.principal,
    providerBody,
    sendKey,
    textBody
  });
  emailSendInFlight.set(sendKey, sendPromise);
  try {
    const entry = await sendPromise;
    emailSendReceipts.set(sendKey, entry);
    return emailSendResultFromReceipt(entry.receipt, entry.status, input.statusSecret);
  } finally {
    emailSendInFlight.delete(sendKey);
  }
}

export async function sendNegotiationEmail(input: {
  config: RecoupEmailConfig;
  draft: CreditNegotiationEmailDraft;
  fetchImpl?: EmailFetch | undefined;
  principal?: string | undefined;
  sendLedger: CreditNegotiationEmailSendLedger;
}): Promise<CreditNegotiationEmailSendResult> {
  const sendLedger = (input as { sendLedger?: CreditNegotiationEmailSendLedger | undefined }).sendLedger;
  if (sendLedger === undefined) {
    throw new EmailGatewayError("Credit negotiation send ledger is required.", 503);
  }

  const textBody = input.draft.body;
  const htmlBody = plainTextEmailHtml(textBody);
  const sentBodyHash = sha256Hex(textBody);
  if (sentBodyHash !== input.draft.approvedBodyHash) {
    throw new EmailGatewayError("Negotiation email body does not match the approved draft.", 409);
  }

  const providerBody = buildResendNegotiationEmailProviderBody(input.draft, { htmlBody, textBody });
  const sendKey = creditNegotiationEmailSendKey(input.draft, providerBody);
  const idempotencyKey = creditNegotiationResendIdempotencyKey(sendKey);
  const existingActionSend = await sendLedger.readByActionId(input.draft.actionId);
  if (existingActionSend !== undefined) {
    if (isCreditNegotiationSentLedgerEntry(existingActionSend)) {
      return creditNegotiationEmailSendResultFromLedger(existingActionSend, "already_sent");
    }
    if (isCreditNegotiationFailedLedgerEntry(existingActionSend)) {
      throw new EmailGatewayError("Credit negotiation send has already failed.", 409);
    }
    throw new EmailGatewayError("Credit negotiation send is already pending.", 409);
  }
  const existingSend = await sendLedger.readByIdempotencyKey(idempotencyKey);
  if (existingSend !== undefined) {
    if (isCreditNegotiationSentLedgerEntry(existingSend)) {
      return creditNegotiationEmailSendResultFromLedger(existingSend, "already_sent");
    }
    if (isCreditNegotiationFailedLedgerEntry(existingSend)) {
      throw new EmailGatewayError("Credit negotiation send has already failed.", 409);
    }
    throw new EmailGatewayError("Credit negotiation send is already pending.", 409);
  }

  const pendingEntry: CreditNegotiationEmailPendingLedgerEntry = {
    accountId: input.draft.accountId,
    actionId: input.draft.actionId,
    approvedBodyHash: input.draft.approvedBodyHash,
    from: input.draft.from,
    idempotencyKey,
    orderId: input.draft.orderId,
    ...(input.principal === undefined ? {} : { principal: input.principal }),
    replyTo: input.draft.replyTo,
    reservedAtIso: new Date().toISOString(),
    round: input.draft.round,
    status: "pending",
    subject: input.draft.subject,
    to: input.draft.to
  };
  await sendLedger.insertPending(pendingEntry);

  const fetchImpl = input.fetchImpl ?? fetch;
  const failedEntry: CreditNegotiationEmailFailedLedgerEntry = { ...pendingEntry, status: "failed" };
  let response: Response;
  let payload: Record<string, unknown>;
  try {
    response = await fetchImpl("https://api.resend.com/emails", {
      body: JSON.stringify(providerBody),
      headers: {
        authorization: `Bearer ${input.config.resendApiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      method: "POST"
    });
    payload = await readJsonObject(response);
  } catch (error) {
    await sendLedger.markFailed(failedEntry);
    throw new EmailGatewayError("Negotiation email provider send failed.", error instanceof EmailGatewayError ? error.status : 502);
  }

  if (!response.ok) {
    await sendLedger.markFailed(failedEntry);
    throw new EmailGatewayError(`Negotiation email provider send failed. Provider status ${response.status.toString()}.`, response.status);
  }

  const providerEmailId = readString(payload.id);
  if (providerEmailId === undefined) {
    await sendLedger.markFailed(failedEntry);
    throw new EmailGatewayError("Negotiation email provider response missing message id.", 502);
  }

  const sentEntry: CreditNegotiationEmailSendLedgerEntry = {
    accountId: input.draft.accountId,
    actionId: input.draft.actionId,
    approvedBodyHash: input.draft.approvedBodyHash,
    from: input.draft.from,
    idempotencyKey,
    orderId: input.draft.orderId,
    ...(input.principal === undefined ? {} : { principal: input.principal }),
    providerEmailId,
    replyTo: input.draft.replyTo,
    round: input.draft.round,
    sentAtIso: new Date().toISOString(),
    sentBodyHash,
    status: "sent",
    subject: input.draft.subject,
    to: input.draft.to
  };
  const persistedEntry = await sendLedger.markSent(sentEntry);
  return creditNegotiationEmailSendResultFromLedger(persistedEntry, persistedEntry.status);
}

function isCreditNegotiationSentLedgerEntry(
  entry: CreditNegotiationEmailFailedLedgerEntry | CreditNegotiationEmailPendingLedgerEntry | CreditNegotiationEmailSendLedgerEntry
): entry is CreditNegotiationEmailSendLedgerEntry {
  return typeof (entry as { providerEmailId?: unknown }).providerEmailId === "string";
}

function isCreditNegotiationFailedLedgerEntry(
  entry: CreditNegotiationEmailFailedLedgerEntry | CreditNegotiationEmailPendingLedgerEntry | CreditNegotiationEmailSendLedgerEntry
): entry is CreditNegotiationEmailFailedLedgerEntry {
  return entry.status === "failed";
}

function creditNegotiationEmailSendResultFromLedger(
  entry: CreditNegotiationEmailSendLedgerEntry,
  status: string
): CreditNegotiationEmailSendResult {
  return {
    accountId: entry.accountId,
    actionId: entry.actionId,
    approvedBodyHash: entry.approvedBodyHash,
    idempotencyKey: entry.idempotencyKey,
    orderId: entry.orderId,
    ...(entry.principal === undefined ? {} : { principal: entry.principal }),
    providerEmailId: entry.providerEmailId,
    round: entry.round,
    sentBodyHash: entry.sentBodyHash,
    status
  };
}

async function deliverResendEmail(input: {
  bodyHtmlHash: string;
  bodyTextHash: string;
  config: RecoupEmailConfig;
  draft: RecoupEmailDraft;
  fetchImpl: EmailFetch;
  htmlBody: string;
  principal?: string | undefined;
  providerBody: ResendEmailProviderBody;
  sendKey: string;
  textBody: string;
}): Promise<EmailSendLedgerEntry> {
  const response = await input.fetchImpl("https://api.resend.com/emails", {
    body: JSON.stringify(input.providerBody),
    headers: {
      authorization: `Bearer ${input.config.resendApiKey}`,
      "content-type": "application/json",
      "idempotency-key": resendIdempotencyKey(input.sendKey)
    },
    method: "POST"
  });

  const payload = await readJsonObject(response);
  if (!response.ok) {
    throw new EmailGatewayError(providerFailureMessage("Email provider send failed.", response.status, payload), response.status);
  }

  const providerEmailId = readString(payload.id);
  if (providerEmailId === undefined) {
    throw new EmailGatewayError("Email provider response missing message id.", 502);
  }

  const result = {
    actionId: input.draft.actionId,
    bodyHtmlHash: input.bodyHtmlHash,
    bodyTextHash: input.bodyTextHash,
    lineId: input.draft.lineId,
    providerEmailId,
    recipientGroup: input.draft.recipientGroup,
    status: readString(payload.last_event) ?? "sent"
  };
  const receipt: EmailSendReceipt = {
    actionId: result.actionId,
    bodyHtmlHash: result.bodyHtmlHash,
    bodyTextHash: result.bodyTextHash,
    lineId: result.lineId,
    ...(input.principal === undefined ? {} : { principal: input.principal }),
    providerEmailId: result.providerEmailId,
    recipientGroup: result.recipientGroup,
    sentAtIso: new Date().toISOString(),
    subject: input.draft.subject
  };

  return { receipt, status: result.status };
}

export async function readResendEmailStatus(input: {
  actionId: string;
  config: RecoupEmailConfig;
  fetchImpl?: EmailFetch | undefined;
  lineId: string;
  principal?: string | undefined;
  providerEmailId: string;
  recipientGroup: EmailRecipientGroup;
  statusSecret: string;
  statusToken: string;
}): Promise<{
  actionId: string;
  bodyHtmlHash: string;
  bodyTextHash: string;
  createdAt?: string | undefined;
  lastEvent?: string | undefined;
  lineId: string;
  providerBodyHashVerified?: boolean | undefined;
  providerEmailId: string;
  recipientGroup: EmailRecipientGroup;
  status?: string | undefined;
  subject?: string | undefined;
}> {
  const receipt = readEmailStatusToken(input.statusToken, input.statusSecret);
  assertEmailStatusReceipt(input, receipt);

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.resend.com/emails/${encodeURIComponent(input.providerEmailId)}`, {
    headers: {
      authorization: `Bearer ${input.config.resendApiKey}`
    },
    method: "GET"
  });
  const payload = await readJsonObject(response);
  if (!response.ok) {
    throw new EmailGatewayError(providerFailureMessage("Email provider status read failed.", response.status, payload), response.status);
  }

  const lastEvent = readString(payload.last_event);
  const providerBodyHashVerified = verifyProviderBodyHashes({
    html: readString(payload.html),
    receipt,
    text: readString(payload.text)
  });
  return {
    actionId: input.actionId,
    bodyHtmlHash: receipt.bodyHtmlHash,
    bodyTextHash: receipt.bodyTextHash,
    createdAt: readString(payload.created_at),
    lastEvent,
    lineId: input.lineId,
    ...(providerBodyHashVerified === undefined ? {} : { providerBodyHashVerified }),
    providerEmailId: readString(payload.id) ?? input.providerEmailId,
    recipientGroup: input.recipientGroup,
    status: lastEvent,
    subject: readString(payload.subject) ?? receipt.subject
  };
}

export function verifyApprovedEmailSendPolicy(detail: unknown, draft: RecoupEmailDraft): ApprovedEmailSendPolicyResult {
  const approvalCheck = verifyApprovedEmailApproval(detail, {
    actionId: draft.actionId,
    lineId: draft.lineId
  });
  if (!approvalCheck.ok) {
    return approvalCheck;
  }

  if (containsHtmlMarkup(draft.subject) || containsHtmlMarkup(draft.body)) {
    return { error: "Email draft must be plain text.", ok: false, status: 400 };
  }

  const allowedRecipientGroups = allowedRecipientGroupsForDetail(detail);
  if (!allowedRecipientGroups.includes(draft.recipientGroup)) {
    return { error: "Email recipient does not match the approved case routing.", ok: false, status: 409 };
  }

  const factFragments = requiredEmailFactFragments(detail);
  if (!factFragments.ok) {
    return { error: "Approved case detail is missing required email facts.", ok: false, status: 409 };
  }

  const missingFacts = factFragments.fragments.filter(
    (fragment) => !normalizedIncludes(`${draft.subject}\n${draft.body}`, fragment)
  );
  if (missingFacts.length > 0) {
    return { error: "Email draft must include approved case facts.", ok: false, status: 409 };
  }

  return { ok: true };
}

export function emailStatusSecret(runtimeEnv: RuntimeEmailEnv, config: RecoupEmailConfig): string {
  return runtimeEnv.RECOUP_DEMO_SESSION_SECRET?.trim() || runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim() || config.resendApiKey;
}

export function emailSendCapabilitiesForPrincipal(runtimeEnv: RuntimeEmailEnv, principal: string): string[] {
  const explicitPrincipals = parseCsv(runtimeEnv.RECOUP_EMAIL_SEND_PRINCIPALS);
  if (explicitPrincipals.length === 0 && !isTestEmailRuntime(runtimeEnv)) {
    return ["read"];
  }

  const allowedPrincipals =
    explicitPrincipals.length > 0
      ? explicitPrincipals
      : [runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim(), "human:maya-lead"].filter(
          (value): value is string => value !== undefined && value.length > 0
        );

  return allowedPrincipals.includes(principal) ? ["read", "send_email"] : ["read"];
}

function isTestEmailRuntime(runtimeEnv: RuntimeEmailEnv): boolean {
  return runtimeEnv.NODE_ENV?.trim() === "test" && runtimeEnv.VERCEL_ENV?.trim() !== "production";
}

export function clearEmailSendReceiptsForTest(): void {
  emailSendReceipts.clear();
  emailSendInFlight.clear();
}

export class EmailGatewayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmailGatewayError";
    this.status = status;
  }
}

function recipientForGroup(config: RecoupEmailConfig, group: EmailRecipientGroup): string {
  return group === "billing" ? config.billingRecipient : config.recoveryRecipient;
}

function buildResendEmailProviderBody(
  config: RecoupEmailConfig,
  draft: RecoupEmailDraft,
  body: { htmlBody: string; textBody: string }
): ResendEmailProviderBody {
  return {
    from: config.senderEmailAddress,
    html: body.htmlBody,
    subject: draft.subject,
    text: body.textBody,
    to: [recipientForGroup(config, draft.recipientGroup)]
  };
}

function buildResendNegotiationEmailProviderBody(
  draft: CreditNegotiationEmailDraft,
  body: { htmlBody: string; textBody: string }
): ResendNegotiationEmailProviderBody {
  const headers = normalizeNegotiationEmailHeaders(draft.headers);
  return {
    from: draft.from,
    ...(headers === undefined ? {} : { headers }),
    html: body.htmlBody,
    reply_to: draft.replyTo,
    subject: draft.subject,
    text: body.textBody,
    to: [draft.to]
  };
}

function emailSendLedgerKey(draft: RecoupEmailDraft, providerBody: ResendEmailProviderBody): string {
  return [
    draft.actionId,
    draft.lineId,
    draft.recipientGroup,
    sha256Hex(JSON.stringify(providerBody))
  ].join("\u0000");
}

function creditNegotiationEmailSendKey(
  draft: CreditNegotiationEmailDraft,
  providerBody: ResendNegotiationEmailProviderBody
): string {
  return [draft.actionId, draft.accountId, draft.orderId, draft.round.toString(), sha256Hex(JSON.stringify(providerBody))].join(
    "\u0000"
  );
}

function resendIdempotencyKey(sendKey: string): string {
  return `recoup-email/${sha256Hex(sendKey)}`;
}

function creditNegotiationResendIdempotencyKey(sendKey: string): string {
  return `recoup-credit-negotiation/${sha256Hex(sendKey)}`;
}

function emailSendResultFromReceipt(receipt: EmailSendReceipt, status: string, statusSecret: string): EmailSendResult {
  return {
    actionId: receipt.actionId,
    bodyHtmlHash: receipt.bodyHtmlHash,
    bodyTextHash: receipt.bodyTextHash,
    lineId: receipt.lineId,
    providerEmailId: receipt.providerEmailId,
    recipientGroup: receipt.recipientGroup,
    status,
    statusToken: createEmailStatusToken(receipt, statusSecret)
  };
}

function plainTextEmailHtml(body: string): string {
  const escaped = escapeHtml(body).replace(/\r?\n/gu, "<br />\n");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${escaped}</div>`;
}

function normalizeNegotiationEmailHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const key of ["In-Reply-To", "References"] as const) {
    const value = headers[key]?.trim();
    if (value !== undefined && value.length > 0) {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function createEmailStatusToken(receipt: EmailSendReceipt, secret: string): string {
  const payload = encodeBase64Url(JSON.stringify({ ...receipt, version: "recoup-email-status-v1" }));
  const signature = signEmailStatusPayload(payload, secret);
  return `${payload}.${signature}`;
}

function readEmailStatusToken(token: string, secret: string): EmailSendReceipt {
  const [payload, signature, extra] = token.split(".");
  if (payload === undefined || signature === undefined || extra !== undefined) {
    throw new EmailGatewayError("Email status receipt unavailable.", 404);
  }
  const expectedSignature = signEmailStatusPayload(payload, secret);
  if (!safeEqualStrings(signature, expectedSignature)) {
    throw new EmailGatewayError("Email status receipt unavailable.", 404);
  }

  const parsed = emailStatusTokenPayload(parseJson(Buffer.from(payload, "base64url").toString("utf8")));
  if (parsed === undefined) {
    throw new EmailGatewayError("Email status receipt unavailable.", 404);
  }
  assertEmailStatusReceiptFresh(parsed);

  return parsed;
}

function emailStatusTokenPayload(value: unknown): EmailSendReceipt | undefined {
  const object = asRecord(value);
  if (
    object?.version !== "recoup-email-status-v1" ||
    !isNonEmptyString(object.actionId) ||
    !isSha256Hex(object.bodyHtmlHash) ||
    !isSha256Hex(object.bodyTextHash) ||
    !isNonEmptyString(object.lineId) ||
    !isNonEmptyString(object.providerEmailId) ||
    !isEmailRecipientGroup(object.recipientGroup) ||
    !isNonEmptyString(object.sentAtIso) ||
    !isNonEmptyString(object.subject) ||
    (object.principal !== undefined && !isNonEmptyString(object.principal))
  ) {
    return undefined;
  }

  return {
    actionId: object.actionId,
    bodyHtmlHash: object.bodyHtmlHash,
    bodyTextHash: object.bodyTextHash,
    lineId: object.lineId,
    ...(object.principal === undefined ? {} : { principal: object.principal }),
    providerEmailId: object.providerEmailId,
    recipientGroup: object.recipientGroup,
    sentAtIso: object.sentAtIso,
    subject: object.subject
  };
}

function signEmailStatusPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function verifyProviderBodyHashes(input: {
  html: string | undefined;
  receipt: EmailSendReceipt;
  text: string | undefined;
}): boolean | undefined {
  let checked = false;
  if (input.text !== undefined) {
    checked = true;
    if (sha256Hex(input.text) !== input.receipt.bodyTextHash) {
      throw new EmailGatewayError("Email provider body hash did not match the approved draft.", 502);
    }
  }
  if (input.html !== undefined) {
    checked = true;
    if (sha256Hex(input.html) !== input.receipt.bodyHtmlHash) {
      throw new EmailGatewayError("Email provider body hash did not match the approved draft.", 502);
    }
  }

  return checked ? true : undefined;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function assertEmailStatusReceipt(
  input: {
    actionId: string;
    lineId: string;
    principal?: string | undefined;
    providerEmailId: string;
    recipientGroup: EmailRecipientGroup;
  },
  receipt: EmailSendReceipt
): void {
  if (
    receipt.actionId !== input.actionId ||
    receipt.lineId !== input.lineId ||
    receipt.providerEmailId !== input.providerEmailId ||
    receipt.recipientGroup !== input.recipientGroup ||
    (input.principal !== undefined && receipt.principal !== input.principal)
  ) {
    throw new EmailGatewayError("Email status receipt unavailable.", 404);
  }
}

function assertEmailStatusReceiptFresh(receipt: EmailSendReceipt): void {
  const sentAtMs = Date.parse(receipt.sentAtIso);
  if (!Number.isFinite(sentAtMs) || Date.now() - sentAtMs > emailStatusReceiptTtlMs || sentAtMs - Date.now() > 60_000) {
    throw new EmailGatewayError("Email status receipt unavailable.", 404);
  }
}

function parseCsv(value: string | undefined): string[] {
  return value === undefined
    ? []
    : value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function verifyApprovedEmailApproval(
  detail: unknown,
  expected: { actionId: string; lineId: string }
): ApprovedEmailSendPolicyResult {
  const object = asRecord(detail);
  const detailLineId = readString(object?.lineId);
  const workItem = asRecord(object?.workItem);
  const workItemLineIds = readStringArray(workItem?.lineIds);
  const selected = asRecord(object?.selected);
  const selectedDraft = asRecord(selected?.draft);
  const recoveryDraft = asRecord(object?.recoveryDraft);
  const approvalReceipt = asRecord(object?.approvalReceipt);
  const approvalState = asRecord(object?.approvalState);
  const approvalRecordIds = readStringArray(approvalReceipt?.recordIds);
  const actionIds = [readString(selectedDraft?.actionId), readString(recoveryDraft?.actionId)].filter(
    (value): value is string => value !== undefined
  );

  if (detailLineId !== expected.lineId || (workItemLineIds.length > 0 && !workItemLineIds.includes(expected.lineId))) {
    return { error: "Email send request does not match the approved case.", ok: false, status: 409 };
  }
  if (!actionIds.includes(expected.actionId)) {
    return { error: "Email send request does not match the approved action.", ok: false, status: 409 };
  }
  if (
    readString(approvalReceipt?.actionId) !== expected.actionId ||
    !readString(approvalReceipt?.approverId)?.startsWith("human:") ||
    readString(approvalReceipt?.status) !== "human_decided" ||
    readString(approvalReceipt?.decision) !== "approve" ||
    !isAuditHash(readString(approvalReceipt?.auditEntryHash)) ||
    !approvalRecordIds.includes(expected.actionId) ||
    !approvalRecordIds.includes(expected.lineId)
  ) {
    return { error: "Human approval is required before email send.", ok: false, status: 409 };
  }
  if (readString(approvalState?.status) !== undefined && readString(approvalState?.status) !== "human_decided") {
    return { error: "Human approval is required before email send.", ok: false, status: 409 };
  }

  return { ok: true };
}

function allowedRecipientGroupsForDetail(detail: unknown): EmailRecipientGroup[] {
  const object = asRecord(detail);
  const workItem = asRecord(object?.workItem);
  const recommendedAction = asRecord(object?.recommendedAction);
  const verdictText = normalizeText([readString(workItem?.verdict), readString(workItem?.verdictLabel)].join(" "));
  const routingText = normalizeText(
    [
      readString(workItem?.routing),
      readString(workItem?.routingLabel),
      readString(workItem?.recommendedActionLabel),
      readString(recommendedAction?.actionLabel)
    ].join(" ")
  );

  if (verdictText.includes("partial") || routingText.includes("split")) {
    return ["billing", "recovery"];
  }
  if (verdictText.includes("invalid") || routingText.includes("recovery")) {
    return ["recovery"];
  }
  if (verdictText.includes("valid") || routingText.includes("billing")) {
    return ["billing"];
  }

  return [];
}

function requiredEmailFactFragments(detail: unknown): RequiredEmailFactFragmentsResult {
  const object = asRecord(detail);
  const workItem = asRecord(object?.workItem);
  const selected = asRecord(object?.selected);
  const selectedDraft = asRecord(selected?.draft);
  const recommendedAction = asRecord(object?.recommendedAction);
  const customerLabel = readString(workItem?.customerLabel);
  const workItemLabel = readString(workItem?.workItemLabel);
  const amount = readString(workItem?.amount);
  const verdict = readString(workItem?.verdictLabel) ?? readString(workItem?.verdict);
  const actionLabel = readString(workItem?.recommendedActionLabel) ?? readString(recommendedAction?.actionLabel);
  const reason = readString(workItem?.reason) ?? readString(workItem?.deductionReason) ?? readString(selectedDraft?.basis);

  if (
    customerLabel === undefined ||
    workItemLabel === undefined ||
    amount === undefined ||
    verdict === undefined ||
    actionLabel === undefined ||
    reason === undefined
  ) {
    return { ok: false };
  }

  return { fragments: dedupeStrings([
    customerLabel,
    workItemLabel,
    amount,
    verdict,
    actionLabel,
    reason
  ]), ok: true };
}

function normalizedIncludes(text: string, fragment: string): boolean {
  return normalizeText(text).includes(normalizeText(fragment));
}

function containsHtmlMarkup(value: string): boolean {
  return /<!--[\s\S]*?-->|<\/?[a-z][\w:-]*(?:\s[^>]*)?>/iu.test(value);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, " ").trim();
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmailRecipientGroup(value: unknown): value is EmailRecipientGroup {
  return value === "billing" || value === "recovery";
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}

function isAuditHash(value: string | undefined): boolean {
  return value !== undefined && /^[a-f0-9]{64}$/iu.test(value);
}

function providerFailureMessage(prefix: string, status: number, payload: Record<string, unknown>): string {
  const rawDetail =
    readString(payload.message) ??
    readString(payload.error) ??
    readString(payload.name) ??
    readString(asRecord(payload.error)?.message) ??
    readString(asRecord(payload.error)?.name);
  const detail = rawDetail === undefined ? undefined : redactProviderDetail(rawDetail);
  return detail === undefined ? `${prefix} Provider status ${status.toString()}.` : `${prefix} Provider status ${status.toString()}: ${detail}`;
}

function redactProviderDetail(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[email]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu, "$1[redacted]")
    .replace(/(api[_-]?key|token|secret)(\s*[:=]\s*)\S+/giu, "$1$2[redacted]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}
