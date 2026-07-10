import { createHash } from "node:crypto";
import { z } from "zod";
import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import {
  EmailGatewayError,
  emailSendCapabilitiesForPrincipal,
  readRecoupEmailConfig,
  sendNegotiationEmail,
  type CreditNegotiationEmailFailedLedgerEntry,
  type CreditNegotiationEmailPendingLedgerEntry,
  type CreditNegotiationEmailSendLedgerEntry,
  type CreditNegotiationEmailSendLedger,
  type EmailFetch,
  type RuntimeEmailEnv
} from "../../../../../../src/services/emailGateway.ts";
import { evaluateToolPermission } from "../../../../../../src/services/permissionEngine.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";

interface CreditNegotiationEmailRouteTestOptions {
  approvedDraftStore?: CreditNegotiationApprovedDraftStore | undefined;
  approvalStore?: CreditNegotiationApprovalStore | undefined;
  env?: RuntimeEmailEnv;
  fetchImpl?: EmailFetch;
  sendLedger?: CreditNegotiationEmailSendLedger | undefined;
}

interface CreditNegotiationApprovalLookup {
  accountId: string;
  actionId: string;
  orderId: string;
  principal: string;
}

interface CreditNegotiationApprovedActionReceipt {
  actionId: string;
  approverId: string;
  auditEntryHash: string;
  approvedBodyHash: string;
  approvedDraftRecordId: string;
  approvedRecipientConfigKey: "HARBOR_AP_CONTACT_EMAIL";
  approvedSubjectHash: string;
  approvedToHash: string;
  decision: "approve";
  recordIds: string[];
  status: "human_decided";
}

interface CreditNegotiationApprovedDraft {
  accountId: string;
  actionId: string;
  approvedBody: string;
  approvedBodyHash: string;
  approvedSubject: string;
  approvedSubjectHash: string;
  approvedToHash: string;
  orderId: string;
  round: number;
}

interface CreditNegotiationApprovalStore {
  readApprovedNegotiationAction(
    lookup: CreditNegotiationApprovalLookup
  ): Promise<CreditNegotiationApprovedActionReceipt | undefined>;
}

interface CreditNegotiationApprovedDraftStore {
  readApprovedNegotiationDraft(
    lookup: CreditNegotiationApprovalLookup,
    receipt: CreditNegotiationApprovedActionReceipt
  ): Promise<CreditNegotiationApprovedDraft | undefined>;
}

const negotiationEmailSendSchema = z
  .object({
    accountId: z.string().min(1),
    actionId: z.string().min(1),
    approvalReceipt: z.unknown().optional(),
    approvedBodyHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(),
    body: z.string().min(1).max(20_000).optional(),
    lastInboundMessageId: z.string().min(1).max(500).optional(),
    orderId: z.string().min(1),
    round: z.number().int().positive(),
    subject: z.string().min(1).max(300).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const expectedActionId = `credit-v2:negotiation:${value.orderId}:r${value.round.toString()}`;
    if (value.actionId !== expectedActionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Negotiation email action does not match the approved round.",
        path: ["actionId"]
      });
    }
  });

const emailSendPermissionMetadata = {
  riskClass: "communication",
  sideEffectClass: "external_correspondence",
  visibility: "mcp"
} as const;

export async function POST(request: Request): Promise<Response> {
  return handleCreditNegotiationEmailPostForTest(request);
}

export async function handleCreditNegotiationEmailPostForTest(
  request: Request,
  options: CreditNegotiationEmailRouteTestOptions = {}
): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const bodyText = await request.text();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "approval",
    proxyRequest: { body: bodyText, method: "POST", path: "/credit/negotiation/email" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified David cockpit auth required." }, { status: 401 });
  }
  const principal = authHeaders["x-recoup-human-principal"];
  if (!isDavidHumanPrincipal(principal)) {
    return Response.json({ error: "David human approval is required for negotiation email." }, { status: 403 });
  }

  const configResult = readRecoupEmailConfig(runtimeEnv);
  if (!configResult.ok) {
    return Response.json({ error: "Email service is not configured.", missing: configResult.missing }, { status: 503 });
  }

  const addressConfig = readCreditNegotiationAddressConfig(runtimeEnv);
  if (!addressConfig.ok) {
    return Response.json({ error: "Credit negotiation email is not configured.", missing: addressConfig.missing }, { status: 503 });
  }

  const parsed = negotiationEmailSendSchema.safeParse(parseJson(bodyText));
  if (!parsed.success) {
    return Response.json({ error: "Invalid credit negotiation email send request." }, { status: 400 });
  }

  const permission = evaluateToolPermission(emailSendPermissionMetadata, {
    actorCapabilities: emailSendCapabilitiesForPrincipal(runtimeEnv, principal),
    actorId: principal
  });
  if (permission.decision === "deny") {
    return Response.json({ error: permission.reason ?? "Email send is not permitted." }, { status: 403 });
  }

  try {
    const sendLedger = options.sendLedger ?? buildSupabaseNegotiationSendLedger(runtimeEnv, options.fetchImpl ?? fetch);
    if (sendLedger === undefined) {
      return Response.json({ error: "Credit negotiation send ledger is not configured." }, { status: 503 });
    }
    const approvalStore = options.approvalStore ?? buildSupabaseNegotiationApprovalStore(runtimeEnv, options.fetchImpl ?? fetch);
    const approvalReceipt = await approvalStore?.readApprovedNegotiationAction({
      accountId: parsed.data.accountId,
      actionId: parsed.data.actionId,
      orderId: parsed.data.orderId,
      principal
    });
    if (approvalReceipt === undefined) {
      return Response.json({ error: "Stored David negotiation approval receipt is required before email send." }, { status: 409 });
    }

    const approvalValidation = validateStoredNegotiationApprovalReceipt(approvalReceipt, {
      accountId: parsed.data.accountId,
      actionId: parsed.data.actionId,
      expectedTo: addressConfig.to,
      orderId: parsed.data.orderId,
      principal
    });
    if (!approvalValidation.ok) {
      return Response.json({ error: approvalValidation.error }, { status: approvalValidation.status });
    }

    const approvedDraftStore =
      options.approvedDraftStore ?? buildSupabaseNegotiationApprovedDraftStore(runtimeEnv, options.fetchImpl ?? fetch);
    if (approvedDraftStore === undefined) {
      return Response.json({ error: "Credit negotiation approved draft store is not configured." }, { status: 503 });
    }
    const approvedDraft = await approvedDraftStore.readApprovedNegotiationDraft(
      {
        accountId: parsed.data.accountId,
        actionId: parsed.data.actionId,
        orderId: parsed.data.orderId,
        principal
      },
      approvalReceipt
    );
    if (approvedDraft === undefined) {
      return Response.json({ error: "Stored David negotiation approved draft is required before email send." }, { status: 409 });
    }
    const draftValidation = validateStoredNegotiationApprovedDraft(approvedDraft, approvalReceipt, {
      accountId: parsed.data.accountId,
      actionId: parsed.data.actionId,
      expectedTo: addressConfig.to,
      orderId: parsed.data.orderId,
      round: parsed.data.round
    });
    if (!draftValidation.ok) {
      return Response.json({ error: draftValidation.error }, { status: draftValidation.status });
    }

    const sendResult = await sendNegotiationEmail({
      config: configResult.config,
      draft: {
        accountId: parsed.data.accountId,
        actionId: parsed.data.actionId,
        approvedBodyHash: approvedDraft.approvedBodyHash,
        body: approvedDraft.approvedBody,
        from: addressConfig.from,
        headers: headersForLastInboundMessage(parsed.data.lastInboundMessageId),
        orderId: parsed.data.orderId,
        replyTo: buildNegotiationReplyTo(addressConfig.from, parsed.data.orderId, parsed.data.round),
        round: parsed.data.round,
        subject: approvedDraft.approvedSubject,
        to: addressConfig.to
      },
      fetchImpl: options.fetchImpl,
      principal,
      sendLedger
    });
    return Response.json(sendResult);
  } catch (error) {
    return Response.json({ error: emailErrorMessage(error, "Credit negotiation email send failed.") }, { status: emailErrorStatus(error) });
  }
}

function buildSupabaseNegotiationApprovalStore(
  env: RuntimeEmailEnv,
  fetchImpl: EmailFetch
): CreditNegotiationApprovalStore | undefined {
  if (!isConfiguredValue(env.SUPABASE_URL) || !isConfiguredValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return undefined;
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/u, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    async readApprovedNegotiationAction(lookup) {
      const approvalScope = `approval:${lookup.actionId}`;
      const url = new URL(`${baseUrl}/rest/v1/recoup_memory_records`);
      url.searchParams.set("select", "id,scope,category,trust_level,payload_json,record_ids_json");
      url.searchParams.set("id", `eq.${approvalScope}`);
      url.searchParams.set("scope", `eq.${approvalScope}`);
      url.searchParams.set("category", "eq.approval_records");
      url.searchParams.set("trust_level", "eq.trusted");
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url.toString(), {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`
        },
        method: "GET"
      });
      if (!response.ok) {
        throw new EmailGatewayError("Credit negotiation approval receipt read failed.", response.status);
      }

      return approvedNegotiationReceiptFromSupabaseRow((await readJsonArray(response))[0], lookup);
    }
  };
}

function buildSupabaseNegotiationApprovedDraftStore(
  env: RuntimeEmailEnv,
  fetchImpl: EmailFetch
): CreditNegotiationApprovedDraftStore | undefined {
  if (!isConfiguredValue(env.SUPABASE_URL) || !isConfiguredValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return undefined;
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/u, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    async readApprovedNegotiationDraft(lookup, receipt) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_rounds`);
      url.searchParams.set("select", "account_id,order_id,our_proposal_json,round_id,round_no,status");
      url.searchParams.set("round_id", `eq.${lookup.actionId}`);
      url.searchParams.set("account_id", `eq.${lookup.accountId}`);
      url.searchParams.set("order_id", `eq.${lookup.orderId}`);
      url.searchParams.set("limit", "1");
      const response = await fetchImpl(url.toString(), {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`
        },
        method: "GET"
      });
      if (!response.ok) {
        throw new EmailGatewayError("Credit negotiation approved draft read failed.", response.status);
      }

      return approvedNegotiationDraftFromSupabaseRow((await readJsonArray(response))[0], lookup, receipt);
    }
  };
}

function approvedNegotiationReceiptFromSupabaseRow(
  value: unknown,
  expected: CreditNegotiationApprovalLookup
): CreditNegotiationApprovedActionReceipt | undefined {
  const row = asRecord(value);
  const payload = asRecord(row?.payload_json);
  const recordIds = readStringArray(row?.record_ids_json);
  const actionId = readString(payload?.actionId);
  const approverId = readString(payload?.approverId);
  const auditEntryHash = readString(payload?.auditEntryHash);
  const approvedBodyHash = readString(payload?.approvedBodyHash);
  const approvedDraftRecordId = readString(payload?.approvedDraftRecordId);
  const approvedRecipientConfigKey = readString(payload?.approvedRecipientConfigKey);
  const approvedSubjectHash = readString(payload?.approvedSubjectHash);
  const approvedToHash = readString(payload?.approvedToHash);
  const decision = readString(payload?.decision);
  const status = readString(payload?.status);
  const approvalScope = `approval:${expected.actionId}`;
  if (
    row?.category !== "approval_records" ||
    row.trust_level !== "trusted" ||
    row.id !== approvalScope ||
    row.scope !== approvalScope ||
    actionId !== expected.actionId ||
    approverId === undefined ||
    auditEntryHash === undefined ||
    approvedBodyHash === undefined ||
    !/^[a-f0-9]{64}$/iu.test(approvedBodyHash) ||
    approvedDraftRecordId !== creditNegotiationApprovedDraftRecordId(expected.actionId) ||
    approvedRecipientConfigKey !== "HARBOR_AP_CONTACT_EMAIL" ||
    approvedSubjectHash === undefined ||
    !/^[a-f0-9]{64}$/iu.test(approvedSubjectHash) ||
    approvedToHash === undefined ||
    !/^[a-f0-9]{64}$/iu.test(approvedToHash) ||
    !/^[a-f0-9]{64}$/iu.test(auditEntryHash) ||
    decision !== "approve" ||
    status !== "human_decided" ||
    !recordIds.includes(expected.actionId)
  ) {
    return undefined;
  }

  return {
    actionId,
    approverId,
    auditEntryHash,
    approvedBodyHash,
    approvedDraftRecordId,
    approvedRecipientConfigKey,
    approvedSubjectHash,
    approvedToHash,
    decision,
    recordIds,
    status
  };
}

function approvedNegotiationDraftFromSupabaseRow(
  value: unknown,
  expected: CreditNegotiationApprovalLookup,
  receipt: CreditNegotiationApprovedActionReceipt
): CreditNegotiationApprovedDraft | undefined {
  const row = asRecord(value);
  const proposal = asRecord(row?.our_proposal_json);
  const approvedBody = readString(proposal?.approvedBody);
  const approvedBodyHash = readString(proposal?.approvedBodyHash);
  const approvedSubject = readString(proposal?.approvedSubject);
  const approvedSubjectHash = readString(proposal?.approvedSubjectHash);
  const approvedToHash = readString(proposal?.approvedToHash);
  const round = readPositiveInteger(row?.round_no);
  const status = readString(row?.status);
  if (
    row?.account_id !== expected.accountId ||
    row.order_id !== expected.orderId ||
    row.round_id !== expected.actionId ||
    round === undefined ||
    !["drafted", "sent"].includes(status ?? "") ||
    approvedBody === undefined ||
    approvedBodyHash === undefined ||
    !/^[a-f0-9]{64}$/iu.test(approvedBodyHash) ||
    approvedSubject === undefined ||
    approvedSubjectHash === undefined ||
    !/^[a-f0-9]{64}$/iu.test(approvedSubjectHash) ||
    approvedToHash === undefined ||
    !/^[a-f0-9]{64}$/iu.test(approvedToHash) ||
    approvedBodyHash !== receipt.approvedBodyHash ||
    approvedSubjectHash !== receipt.approvedSubjectHash ||
    approvedToHash !== receipt.approvedToHash
  ) {
    return undefined;
  }

  return {
    accountId: expected.accountId,
    actionId: expected.actionId,
    approvedBody,
    approvedBodyHash,
    approvedSubject,
    approvedSubjectHash,
    approvedToHash,
    orderId: expected.orderId,
    round
  };
}

function validateStoredNegotiationApprovalReceipt(
  receipt: CreditNegotiationApprovedActionReceipt,
  expected: CreditNegotiationApprovalLookup & { expectedTo: string }
): { ok: true } | { error: string; ok: false; status: number } {
  if (receipt.approverId !== expected.principal || !isDavidHumanPrincipal(receipt.approverId)) {
    return {
      error: "Stored David negotiation approval receipt does not match the signed principal.",
      ok: false,
      status: 403
    };
  }
  for (const recordId of [expected.actionId, expected.accountId, expected.orderId]) {
    if (!receipt.recordIds.includes(recordId)) {
      return {
        error: "Stored David negotiation approval receipt is missing required source records.",
        ok: false,
        status: 409
      };
    }
  }
  if (receipt.approvedToHash !== sha256Hex(expected.expectedTo)) {
    return {
      error: "Stored David negotiation approval receipt does not match the configured recipient.",
      ok: false,
      status: 409
    };
  }

  return { ok: true };
}

function validateStoredNegotiationApprovedDraft(
  draft: CreditNegotiationApprovedDraft | undefined,
  receipt: CreditNegotiationApprovedActionReceipt,
  expected: {
    accountId: string;
    actionId: string;
    expectedTo: string;
    orderId: string;
    round: number;
  }
): { ok: true } | { error: string; ok: false; status: number } {
  if (draft === undefined) {
    return {
      error: "Stored David negotiation approved draft is required before email send.",
      ok: false,
      status: 409
    };
  }
  if (
    draft.accountId !== expected.accountId ||
    draft.actionId !== expected.actionId ||
    draft.orderId !== expected.orderId ||
    draft.round !== expected.round
  ) {
    return {
      error: "Stored David negotiation approved draft does not match the selected round.",
      ok: false,
      status: 409
    };
  }
  if (
    draft.approvedBodyHash !== receipt.approvedBodyHash ||
    sha256Hex(draft.approvedBody) !== receipt.approvedBodyHash ||
    draft.approvedSubjectHash !== receipt.approvedSubjectHash ||
    sha256Hex(draft.approvedSubject) !== receipt.approvedSubjectHash ||
    draft.approvedToHash !== receipt.approvedToHash ||
    draft.approvedToHash !== sha256Hex(expected.expectedTo)
  ) {
    return {
      error: "Stored David negotiation approved draft does not match the approval receipt.",
      ok: false,
      status: 409
    };
  }

  return { ok: true };
}

function readCreditNegotiationAddressConfig(env: RuntimeEmailEnv):
  | { from: string; ok: true; to: string }
  | { missing: string[]; ok: false } {
  const missing = ["CREDIT_NEGOTIATION_FROM_EMAIL", "HARBOR_AP_CONTACT_EMAIL"].filter((key) => !isConfiguredValue(env[key]));
  if (missing.length > 0) {
    return { missing, ok: false };
  }

  return {
    from: env.CREDIT_NEGOTIATION_FROM_EMAIL as string,
    ok: true,
    to: env.HARBOR_AP_CONTACT_EMAIL as string
  };
}

function buildSupabaseNegotiationSendLedger(
  env: RuntimeEmailEnv,
  fetchImpl: EmailFetch
): CreditNegotiationEmailSendLedger | undefined {
  if (!isConfiguredValue(env.SUPABASE_URL) || !isConfiguredValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return undefined;
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/u, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    async insertPending(row) {
      await upsertNegotiationRound(fetchImpl, {
        baseUrl,
        row,
        serviceRoleKey,
        status: "drafted"
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/credit_negotiation_sends`, {
        body: JSON.stringify(toSupabaseSendRow(row)),
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "POST"
      });
      if (!response.ok) {
        throw new EmailGatewayError("Credit negotiation send ledger reservation failed.", response.status);
      }

      const rows = await readJsonArray(response);
      return pendingLedgerEntryFromSupabaseRow(rows[0]) ?? row;
    },
    async markFailed(row) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_sends`);
      url.searchParams.set("idempotency_key", `eq.${row.idempotencyKey}`);
      const response = await fetchImpl(url.toString(), {
        body: JSON.stringify(toSupabaseSendRow(row)),
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "PATCH"
      });
      if (!response.ok) {
        throw new EmailGatewayError("Credit negotiation send ledger failed update failed.", response.status);
      }

      const rows = await readJsonArray(response);
      return failedLedgerEntryFromSupabaseRow(rows[0]) ?? row;
    },
    async markSent(row) {
      const url = new URL(`${baseUrl}/rest/v1/credit_negotiation_sends`);
      url.searchParams.set("idempotency_key", `eq.${row.idempotencyKey}`);
      const response = await fetchImpl(url.toString(), {
        body: JSON.stringify(toSupabaseSendRow(row)),
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        method: "PATCH"
      });
      if (!response.ok) {
        throw new EmailGatewayError("Credit negotiation send ledger sent update failed.", response.status);
      }
      await updateNegotiationRoundSent(fetchImpl, { baseUrl, row, serviceRoleKey });

      const rows = await readJsonArray(response);
      return sendLedgerEntryFromSupabaseRow(rows[0]) ?? row;
    },
    async readByActionId(actionId) {
      return readSupabaseSendLedgerEntry(fetchImpl, {
        baseUrl,
        filter: { key: "action_id", value: actionId },
        serviceRoleKey
      });
    },
    async readByIdempotencyKey(idempotencyKey) {
      return readSupabaseSendLedgerEntry(fetchImpl, {
        baseUrl,
        filter: { key: "idempotency_key", value: idempotencyKey },
        serviceRoleKey
      });
    }
  };
}

async function readSupabaseSendLedgerEntry(
  fetchImpl: EmailFetch,
  input: {
    baseUrl: string;
    filter: { key: "action_id" | "idempotency_key"; value: string };
    serviceRoleKey: string;
  }
): Promise<CreditNegotiationEmailFailedLedgerEntry | CreditNegotiationEmailPendingLedgerEntry | CreditNegotiationEmailSendLedgerEntry | undefined> {
  const url = new URL(`${input.baseUrl}/rest/v1/credit_negotiation_sends`);
  url.searchParams.set(
    "select",
    [
      "account_id",
      "action_id",
      "approved_body_hash",
      "from_email",
      "idempotency_key",
      "order_id",
      "principal",
      "provider_email_id",
      "reply_to_email",
      "reserved_at",
      "round_no",
      "sent_at",
      "sent_body_hash",
      "status",
      "subject",
      "to_email"
    ].join(",")
  );
  url.searchParams.set(input.filter.key, `eq.${input.filter.value}`);
  url.searchParams.set("limit", "1");
  const response = await fetchImpl(url.toString(), {
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    },
    method: "GET"
  });
  if (!response.ok) {
    throw new EmailGatewayError("Credit negotiation send ledger read failed.", response.status);
  }

  const rows = await readJsonArray(response);
  return sendLedgerEntryFromSupabaseRow(rows[0]) ?? failedLedgerEntryFromSupabaseRow(rows[0]) ?? pendingLedgerEntryFromSupabaseRow(rows[0]);
}

function toSupabaseSendRow(
  row: CreditNegotiationEmailFailedLedgerEntry | CreditNegotiationEmailPendingLedgerEntry | CreditNegotiationEmailSendLedgerEntry
): Record<string, unknown> {
  return {
    account_id: row.accountId,
    action_id: row.actionId,
    approved_body_hash: row.approvedBodyHash,
    from_email: row.from,
    idempotency_key: row.idempotencyKey,
    order_id: row.orderId,
    ...(row.principal === undefined ? {} : { principal: row.principal }),
    ...("providerEmailId" in row ? { provider_email_id: row.providerEmailId } : {}),
    reply_to_email: row.replyTo,
    ...("reservedAtIso" in row ? { reserved_at: row.reservedAtIso } : {}),
    round_id: row.actionId,
    round_no: row.round,
    ...("sentAtIso" in row ? { sent_at: row.sentAtIso } : {}),
    ...("sentBodyHash" in row ? { sent_body_hash: row.sentBodyHash } : {}),
    status: row.status,
    subject: row.subject,
    to_email: row.to
  };
}

async function upsertNegotiationRound(
  fetchImpl: EmailFetch,
  input: {
    baseUrl: string;
    row: CreditNegotiationEmailPendingLedgerEntry;
    serviceRoleKey: string;
    status: "drafted";
  }
): Promise<void> {
  const response = await fetchImpl(`${input.baseUrl}/rest/v1/credit_negotiation_rounds?on_conflict=round_id`, {
    body: JSON.stringify({
      account_id: input.row.accountId,
      order_id: input.row.orderId,
      round_id: input.row.actionId,
      round_no: input.row.round,
      status: input.status
    }),
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation"
    },
    method: "POST"
  });
  if (!response.ok) {
    throw new EmailGatewayError("Credit negotiation round reservation failed.", response.status);
  }
}

async function updateNegotiationRoundSent(
  fetchImpl: EmailFetch,
  input: {
    baseUrl: string;
    row: CreditNegotiationEmailSendLedgerEntry;
    serviceRoleKey: string;
  }
): Promise<void> {
  const url = new URL(`${input.baseUrl}/rest/v1/credit_negotiation_rounds`);
  url.searchParams.set("round_id", `eq.${input.row.actionId}`);
  const response = await fetchImpl(url.toString(), {
    body: JSON.stringify({
      audit_entry_hash: undefined,
      status: "sent"
    }),
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    method: "PATCH"
  });
  if (!response.ok) {
    throw new EmailGatewayError("Credit negotiation round sent update failed.", response.status);
  }
}

function sendLedgerEntryFromSupabaseRow(value: unknown): CreditNegotiationEmailSendLedgerEntry | undefined {
  const row = asRecord(value);
  const accountId = readString(row?.account_id);
  const actionId = readString(row?.action_id);
  const approvedBodyHash = readString(row?.approved_body_hash);
  const from = readString(row?.from_email);
  const idempotencyKey = readString(row?.idempotency_key);
  const orderId = readString(row?.order_id);
  const principal = readString(row?.principal);
  const providerEmailId = readString(row?.provider_email_id);
  const replyTo = readString(row?.reply_to_email);
  const sentAtIso = readString(row?.sent_at);
  const sentBodyHash = readString(row?.sent_body_hash);
  const status = readString(row?.status);
  const subject = readString(row?.subject);
  const to = readString(row?.to_email);
  if (
    accountId === undefined ||
    actionId === undefined ||
    approvedBodyHash === undefined ||
    from === undefined ||
    idempotencyKey === undefined ||
    orderId === undefined ||
    providerEmailId === undefined ||
    replyTo === undefined ||
    sentAtIso === undefined ||
    sentBodyHash === undefined ||
    status === undefined ||
    subject === undefined ||
    to === undefined ||
    typeof row?.round_no !== "number"
  ) {
    return undefined;
  }

  return {
    accountId,
    actionId,
    approvedBodyHash,
    from,
    idempotencyKey,
    orderId,
    ...(principal === undefined ? {} : { principal }),
    providerEmailId,
    replyTo,
    round: row.round_no,
    sentAtIso,
    sentBodyHash,
    status,
    subject,
    to
  };
}

function failedLedgerEntryFromSupabaseRow(value: unknown): CreditNegotiationEmailFailedLedgerEntry | undefined {
  const row = asRecord(value);
  const accountId = readString(row?.account_id);
  const actionId = readString(row?.action_id);
  const approvedBodyHash = readString(row?.approved_body_hash);
  const from = readString(row?.from_email);
  const idempotencyKey = readString(row?.idempotency_key);
  const orderId = readString(row?.order_id);
  const principal = readString(row?.principal);
  const replyTo = readString(row?.reply_to_email);
  const reservedAtIso = readString(row?.reserved_at);
  const round = readPositiveInteger(row?.round_no);
  const status = readString(row?.status);
  const subject = readString(row?.subject);
  const to = readString(row?.to_email);

  if (
    accountId === undefined ||
    actionId === undefined ||
    approvedBodyHash === undefined ||
    from === undefined ||
    idempotencyKey === undefined ||
    orderId === undefined ||
    replyTo === undefined ||
    reservedAtIso === undefined ||
    round === undefined ||
    status !== "failed" ||
    subject === undefined ||
    to === undefined
  ) {
    return undefined;
  }

  return {
    accountId,
    actionId,
    approvedBodyHash,
    from,
    idempotencyKey,
    orderId,
    ...(principal === undefined ? {} : { principal }),
    replyTo,
    reservedAtIso,
    round,
    status,
    subject,
    to
  };
}

function pendingLedgerEntryFromSupabaseRow(value: unknown): CreditNegotiationEmailPendingLedgerEntry | undefined {
  const row = asRecord(value);
  const accountId = readString(row?.account_id);
  const actionId = readString(row?.action_id);
  const approvedBodyHash = readString(row?.approved_body_hash);
  const from = readString(row?.from_email);
  const idempotencyKey = readString(row?.idempotency_key);
  const orderId = readString(row?.order_id);
  const principal = readString(row?.principal);
  const replyTo = readString(row?.reply_to_email);
  const reservedAtIso = readString(row?.reserved_at);
  const round = readPositiveInteger(row?.round_no);
  const status = readString(row?.status);
  const subject = readString(row?.subject);
  const to = readString(row?.to_email);

  if (
    accountId === undefined ||
    actionId === undefined ||
    approvedBodyHash === undefined ||
    from === undefined ||
    idempotencyKey === undefined ||
    orderId === undefined ||
    replyTo === undefined ||
    reservedAtIso === undefined ||
    round === undefined ||
    status !== "pending" ||
    subject === undefined ||
    to === undefined
  ) {
    return undefined;
  }

  return {
    accountId,
    actionId,
    approvedBodyHash,
    from,
    idempotencyKey,
    orderId,
    ...(principal === undefined ? {} : { principal }),
    replyTo,
    reservedAtIso,
    round,
    status,
    subject,
    to
  };
}

function buildNegotiationReplyTo(from: string, orderId: string, round: number): string {
  const [localPart, domain, extra] = from.split("@");
  if (localPart === undefined || domain === undefined || extra !== undefined || localPart.length === 0 || domain.length === 0) {
    throw new EmailGatewayError("Credit negotiation sender address is invalid.", 503);
  }

  return `${localPart}+${orderId}-r${round.toString()}@${domain}`;
}

function headersForLastInboundMessage(messageId: string | undefined): Record<string, string> | undefined {
  return messageId === undefined ? undefined : { "In-Reply-To": messageId, References: messageId };
}

function isDavidHumanPrincipal(principal: string): boolean {
  return /^human:david(?:-|$)/u.test(principal);
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

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function creditNegotiationApprovedDraftRecordId(actionId: string): string {
  return `credit_negotiation_rounds:${actionId}`;
}

function emailErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function emailErrorStatus(error: unknown): number {
  if (error instanceof EmailGatewayError) {
    return error.status >= 400 && error.status < 600 ? error.status : 502;
  }

  return 502;
}
