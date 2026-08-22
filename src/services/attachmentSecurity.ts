import { createHash } from "node:crypto";

/**
 * Attachment security boundary, from Technical Design 8.2 and 8.3.
 *
 * The scanner is an owner decision (D-04) and is injected behind this
 * interface. The service returns typed status and hashes and never returns raw
 * bytes to an agent, so an unscanned attachment has no path to a model.
 *
 * Failure is closed in every direction: an unavailable scanner blocks parser
 * and model access rather than defaulting to clean, because "we could not
 * check" and "we checked and it is safe" must never collapse into one outcome.
 */

export type AttachmentScanStatus =
  | "clean"
  | "unsafe"
  | "quarantined"
  | "scan_unavailable"
  | "unsupported";

export interface AttachmentInspectionResult {
  status: AttachmentScanStatus;
  contentHash: string;
  detectedMime: string;
  sizeBytes: number;
  scanPolicyVersion: string;
  quarantineReason?: string;
}

export interface AttachmentSecurityService {
  inspect(input: {
    provider: string;
    providerAttachmentRef: string;
    messageId: string;
  }): Promise<AttachmentInspectionResult>;
}

/**
 * DEMO SCANNER - ASSUMED POLICY, NOT OWNER-RATIFIED.
 *
 * D-04 owns the real scanner, its health contract and the archive, macro,
 * encryption, size and quarantine policy. This implementation applies an
 * assumed policy registered in the Phase 0 evidence record, and is reachable
 * only behind the demo flag.
 */
export const DEMO_SCAN_POLICY_VERSION = "demo-scan-policy-v1-ASSUMED";

/** Assumed limit. A real limit is an owner decision. */
export const DEMO_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(["text/csv", "text/plain"]);

const BLOCKED_EXTENSIONS = [".exe", ".js", ".vbs", ".scr", ".bat", ".cmd", ".ps1", ".jar"];
const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".gz", ".tar"];
const MACRO_EXTENSIONS = [".xlsm", ".docm", ".pptm"];

export interface DemoAttachment {
  filename: string;
  declaredMime: string;
  bytes: string;
}

export interface DemoScannerOptions {
  attachments: Map<string, DemoAttachment>;
  available?: boolean;
}

export function createDemoAttachmentSecurityService(
  options: DemoScannerOptions
): AttachmentSecurityService {
  const { attachments, available = true } = options;

  return {
    inspect(input) {
      const empty: AttachmentInspectionResult = {
        status: "scan_unavailable",
        contentHash: "",
        detectedMime: "application/octet-stream",
        sizeBytes: 0,
        scanPolicyVersion: DEMO_SCAN_POLICY_VERSION
      };

      // Scanner down means blocked, not clean.
      if (!available) {
        return Promise.resolve(empty);
      }

      const attachment = attachments.get(input.providerAttachmentRef);

      if (attachment === undefined) {
        return Promise.resolve(empty);
      }

      const sizeBytes = Buffer.byteLength(attachment.bytes, "utf8");
      const contentHash = createHash("sha256").update(attachment.bytes).digest("hex");
      const lowerName = attachment.filename.toLowerCase();

      const base: Omit<AttachmentInspectionResult, "status"> = {
        contentHash,
        detectedMime: attachment.declaredMime,
        sizeBytes,
        scanPolicyVersion: DEMO_SCAN_POLICY_VERSION
      };

      if (sizeBytes > DEMO_MAX_ATTACHMENT_BYTES) {
        return Promise.resolve({
          ...base,
          status: "quarantined",
          quarantineReason: "exceeds_size_limit"
        });
      }

      if (BLOCKED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
        return Promise.resolve({ ...base, status: "unsafe", quarantineReason: "executable" });
      }

      if (ARCHIVE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
        return Promise.resolve({ ...base, status: "unsupported", quarantineReason: "archive" });
      }

      if (MACRO_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
        return Promise.resolve({ ...base, status: "unsafe", quarantineReason: "macro_enabled" });
      }

      // Extension spoofing: a .csv name does not make the declared type CSV.
      if (!ALLOWED_MIME.has(attachment.declaredMime)) {
        return Promise.resolve({
          ...base,
          status: "unsupported",
          quarantineReason: "content_type_not_allowed"
        });
      }

      if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".txt")) {
        return Promise.resolve({
          ...base,
          status: "unsupported",
          quarantineReason: "extension_mime_mismatch"
        });
      }

      return Promise.resolve({ ...base, status: "clean" });
    }
  };
}
