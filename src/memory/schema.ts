import { z } from "zod";

export const memoryCategories = [
  "session_state",
  "workflow_state",
  "case_state",
  "transaction_state",
  "evidence_refs",
  "approval_records",
  "audit_refs",
  "connector_state",
  "compaction_summaries",
  "artifact_refs",
  "agent_handoff_packets"
] as const;

export const TrustLevelSchema = z.enum(["trusted", "semi_trusted", "untrusted"]);
export const MemoryCategorySchema = z.enum(memoryCategories);

const DirectEmailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const DirectPhonePattern = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/u;
const OpenAiApiKeyPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/u;
const SecretFieldPattern = /(?:api[_-]?key|client[_-]?secret|password|token|secret)/iu;

export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  category: MemoryCategorySchema,
  trustLevel: TrustLevelSchema,
  scope: z.string().min(1),
  payload: z.record(z.unknown()).superRefine((payload, context) => {
    if (containsDirectPiiOrSecret(payload)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Memory payload must not contain direct PII or secrets."
      });
    }
  }),
  recordIds: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime()
});

export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

function containsDirectPiiOrSecret(value: unknown, fieldName = ""): boolean {
  if (typeof value === "string") {
    return (
      DirectEmailPattern.test(value) ||
      DirectPhonePattern.test(value) ||
      OpenAiApiKeyPattern.test(value) ||
      (SecretFieldPattern.test(fieldName) && value.trim().length > 0)
    );
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsDirectPiiOrSecret(item, fieldName));
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, item]) => containsDirectPiiOrSecret(item, key));
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
