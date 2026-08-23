import { createHash } from "node:crypto";

import type { RemittanceAdviceInput } from "../core/cashApplication/match.js";

/**
 * Canonical remittance evidence.
 *
 * The intake mapped an advice and handed it straight to the run, so nothing
 * ever wrote the inbox, remittance and line rows. Creating a live case then
 * violated the foreign key from recoup_live_deduction_cases back to
 * recoup_cash_remittances, and the run failed after allocating.
 *
 * Written in dependency order because each table references the one before it.
 * The raw sender and the raw attachment body never land here: the schema takes
 * a sender hash and a content hash precisely so they do not have to.
 */

export interface PersistRemittanceEvidenceInput {
  url: string;
  serviceRoleKey: string;
  inboxId: string;
  advice: RemittanceAdviceInput;
  message: {
    provider: string;
    providerEventId: string;
    messageId: string;
    recipient: string;
    sender: string;
    subject: string;
    receivedAt: string;
  };
  attachmentContentHash: string;
  fetcher?: typeof fetch;
}

/** Subjects are capped at 1000 characters by the schema. */
const MAX_SUBJECT = 1_000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function persistRemittanceEvidence(
  input: PersistRemittanceEvidenceInput
): Promise<void> {
  const { url, serviceRoleKey, inboxId, advice, message, attachmentContentHash } = input;
  const fetcher = input.fetcher ?? fetch;
  const rest = `${url.replace(/\/$/u, "")}/rest/v1`;
  const headers = {
    "content-type": "application/json",
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };

  const write = async (table: string, body: unknown): Promise<void> => {
    const response = await fetcher(`${rest}/${table}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    // 409 is a unique violation, which is what a provider redelivery looks
    // like. The row is already recorded, so there is nothing to do and nothing
    // to report. Any other failure is real and must not be swallowed.
    if (!response.ok && response.status !== 409) {
      throw new Error(`${table} write failed: ${String(response.status)} ${await response.text()}`);
    }
  };

  await write("recoup_cash_inbox", {
    inbox_id: inboxId,
    provider: message.provider,
    provider_event_id: message.providerEventId,
    message_id: message.messageId,
    // Hashed, so a broad read of this table does not expose who wrote in.
    sender_hash: sha256(message.sender),
    recipient: message.recipient,
    received_at: message.receivedAt,
    subject_sanitized: message.subject.slice(0, MAX_SUBJECT),
    body_content_hash: attachmentContentHash,
    provenance_mode: advice.provenanceMode,
    status: "accepted"
  });

  await write("recoup_cash_remittances", {
    remittance_id: advice.remittanceId,
    inbox_id: inboxId,
    customer_reference: advice.customerReference,
    legal_entity_reference: advice.legalEntityReference,
    payment_reference: advice.paymentReference,
    currency: advice.currency,
    instructed_payment_amount: advice.instructedPaymentAmount,
    mapper_version: advice.mapperVersion,
    provenance_mode: advice.provenanceMode,
    source_record_ids: advice.sourceRecordIds
  });

  await write(
    "recoup_cash_remittance_lines",
    advice.lines.map((line) => ({
      line_id: line.lineId,
      remittance_id: advice.remittanceId,
      invoice_reference: line.invoiceReference,
      instructed_amount: line.instructedAmount,
      claimed_deduction_amount: line.claimedDeductionAmount,
      claimed_reason_code: line.claimedReasonCode,
      // The claim only. The mapper never produces a validated reason.
      claimed_reason_text_sanitized: line.claimedReasonTextSanitized,
      source_record_ids: line.sourceRecordIds
    }))
  );
}
