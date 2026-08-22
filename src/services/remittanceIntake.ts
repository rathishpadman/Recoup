import { createHash } from "node:crypto";

import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import type { RemittanceAdviceInput } from "../core/cashApplication/match.js";
import { deriveInboundCommandKey } from "../types/workflow.js";
import type { AttachmentSecurityService } from "./attachmentSecurity.js";
import { mapRemittanceCsvV1, type MappingFailure } from "./remittanceMapper.js";

/**
 * Inbound remittance intake.
 *
 * Order matters and is the whole point of this module: verify the provider
 * signature, then the recipient, then scan the attachment, and only then map
 * it. Mapping before scanning would hand unscanned bytes to a parser, which is
 * exactly what the attachment boundary exists to prevent.
 *
 * Nothing here reaches a model. The mapper is deterministic and the agent sees
 * canonical values only.
 */

export type IntakeRejection =
  | "signature_invalid"
  | "replay_detected"
  | "wrong_recipient"
  | "attachment_missing"
  | "attachment_unsafe"
  | "attachment_quarantined"
  | "attachment_unsupported"
  | "scan_unavailable"
  | "mapping_failed"
  | "intake_disabled";

export type IntakeResult =
  | {
      status: "accepted";
      inboxId: string;
      advice: RemittanceAdviceInput;
      attachmentContentHash: string;
    }
  | { status: "rejected"; reason: IntakeRejection; detail: string };

export interface InboundMessage {
  provider: string;
  providerEventId: string;
  messageId: string;
  signature: string;
  recipient: string;
  sender: string;
  subject: string;
  attachmentRef: string;
  receivedAt: string;
}

export interface IntakeDependencies {
  env: RuntimeEnv;
  scanner: AttachmentSecurityService;
  attachmentBody: (ref: string) => string | undefined;
  approvedRecipient: string;
  verifySignature: (message: InboundMessage) => boolean;
  seenEventKeys: Set<string>;
  provenanceMode: RemittanceAdviceInput["provenanceMode"];
}

const INTAKE_FLAG = "RECOUP_CASH_INTAKE_ENABLED";

function reject(reason: IntakeRejection, detail: string): IntakeResult {
  return { status: "rejected", reason, detail };
}

const REJECTION_BY_SCAN_STATUS = {
  unsafe: "attachment_unsafe",
  quarantined: "attachment_quarantined",
  unsupported: "attachment_unsupported",
  scan_unavailable: "scan_unavailable"
} as const;

const REJECTION_DETAIL_BY_MAPPING: Record<MappingFailure, string> = {
  empty_file: "no header or data rows",
  header_mismatch: "header does not match the approved CSV v1 contract",
  row_invalid: "a row failed the approved field contract",
  inconsistent_header_row: "a row has a different cell count from the header",
  missing_reason_code: "the required machine-readable claimed reason code is absent",
  not_utf8: "file is not valid UTF-8"
};

export async function acceptInboundRemittance(
  message: InboundMessage,
  dependencies: IntakeDependencies
): Promise<IntakeResult> {
  const { env, scanner, attachmentBody, approvedRecipient, verifySignature, seenEventKeys } =
    dependencies;

  if (env[INTAKE_FLAG]?.trim().toLowerCase() !== "true") {
    return reject("intake_disabled", `${INTAKE_FLAG} is not enabled`);
  }

  if (!verifySignature(message)) {
    return reject("signature_invalid", "provider signature did not verify");
  }

  // Replay is checked on the deterministic inbound key, so a resent webhook for
  // the same provider event is refused rather than creating a second run.
  const eventKey = deriveInboundCommandKey(message.provider, message.providerEventId);

  if (seenEventKeys.has(eventKey)) {
    return reject("replay_detected", "provider event already accepted");
  }

  if (message.recipient !== approvedRecipient) {
    return reject("wrong_recipient", "message was not addressed to the approved recipient");
  }

  const inspection = await scanner.inspect({
    provider: message.provider,
    providerAttachmentRef: message.attachmentRef,
    messageId: message.messageId
  });

  if (inspection.status !== "clean") {
    return reject(
      REJECTION_BY_SCAN_STATUS[inspection.status],
      inspection.quarantineReason ?? inspection.status
    );
  }

  // Only now may bytes reach the mapper.
  const body = attachmentBody(message.attachmentRef);

  if (body === undefined) {
    return reject("attachment_missing", "scanned attachment body is not retrievable");
  }

  const inboxId = `INBOX-${eventKey.slice(0, 16)}`;

  const mapped = mapRemittanceCsvV1({
    csv: body,
    inboundMessageId: inboxId,
    provenanceMode: dependencies.provenanceMode,
    sourceRecordIds: [inboxId, `ATT-${inspection.contentHash.slice(0, 16)}`]
  });

  if (mapped.status !== "mapped") {
    return reject("mapping_failed", REJECTION_DETAIL_BY_MAPPING[mapped.reason]);
  }

  seenEventKeys.add(eventKey);

  return {
    status: "accepted",
    inboxId,
    advice: mapped.advice,
    attachmentContentHash: inspection.contentHash
  };
}

/** Sender is stored as a hash, never as a raw address. */
export function hashSender(sender: string): string {
  return createHash("sha256").update(sender.trim().toLowerCase()).digest("hex");
}
