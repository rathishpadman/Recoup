import { createHash } from "node:crypto";
import { z } from "zod";

export const EvidenceDocumentTypeSchema = z.enum([
  "pod",
  "sap_invoice",
  "sap_credit_memo",
  "customer_po",
  "contract_pricing",
  "contract_sla",
  "tpm_promo",
  "tpm_accrual",
  "carrier_damage_report",
  "carrier_photo",
  "remittance_advice",
  "edi_812",
  "bureau_alert",
  "payment_history"
]);

export const EvidenceSourceSystemSchema = z.enum([
  "sap_odata",
  "sap",
  "three_pl",
  "contract_repo",
  "tpm",
  "carrier",
  "remittance",
  "bureau",
  "payment_history",
  "customer_po",
  "recoup_generated"
]);

export const EvidenceProvenanceSchema = z.enum([
  "sap_odata",
  "source_generated",
  "uploaded_document",
  "provider_api"
]);

export const EvidenceLinkedRecordRoleSchema = z.enum([
  "deduction_line",
  "claim",
  "customer",
  "invoice",
  "source_record"
]);

export const EvidenceContentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const EvidenceIdSchema = z.string().regex(/^EVD-[A-Z0-9-]+$/);

export const CanonicalEvidenceDocumentSchema = z
  .object({
    contentHash: EvidenceContentHashSchema,
    customerId: z.string().min(1),
    documentType: EvidenceDocumentTypeSchema,
    evidenceId: EvidenceIdSchema,
    payload: z.record(z.unknown()),
    provenance: EvidenceProvenanceSchema,
    rawText: z.string().min(1).optional(),
    retrievedAt: z.string().datetime(),
    sourceRecordId: z.string().min(1),
    sourceSystem: EvidenceSourceSystemSchema,
    storageUri: z.string().min(1).optional(),
    validFrom: z.string().date().optional(),
    validTo: z.string().date().optional()
  })
  .strict()
  .refine((document) => document.validFrom === undefined || document.validTo === undefined || document.validTo >= document.validFrom, {
    message: "validTo must be on or after validFrom"
  })
  .superRefine((document, context) => {
    try {
      const expectedHash = evidenceContentHash(document.payload);
      if (document.contentHash !== expectedHash) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "contentHash must match the canonical evidence payload hash.",
          path: ["contentHash"]
        });
      }
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Evidence payload must be JSON serializable.",
        path: ["payload"]
      });
    }
  });

export const EvidenceLinkSchema = z
  .object({
    evidenceId: EvidenceIdSchema,
    recordId: z.string().min(1),
    recordRole: EvidenceLinkedRecordRoleSchema
  })
  .strict();

export function evidenceContentHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalEvidenceJson(payload)).digest("hex");
}

export function canonicalEvidenceJson(value: unknown): string {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error("Evidence payload must be JSON serializable.");
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Evidence payload must contain only finite numbers.");
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalEvidenceJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => {
        const nestedValue = record[key];
        return `${JSON.stringify(key)}:${canonicalEvidenceJson(nestedValue)}`;
      })
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export type EvidenceDocumentType = z.infer<typeof EvidenceDocumentTypeSchema>;
export type EvidenceSourceSystem = z.infer<typeof EvidenceSourceSystemSchema>;
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;
export type EvidenceLinkedRecordRole = z.infer<typeof EvidenceLinkedRecordRoleSchema>;
export type CanonicalEvidenceDocument = z.infer<typeof CanonicalEvidenceDocumentSchema>;
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;
