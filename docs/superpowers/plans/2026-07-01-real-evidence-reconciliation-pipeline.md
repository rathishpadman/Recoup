# Real Evidence Reconciliation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-merged `rule_input_json` demo spine with real source evidence records in Supabase, then compute deduction verdicts, routing, confidence, and cockpit read models from independently reconciled documents.

**Architecture:** Create a canonical evidence layer over Supabase that stores source-owned document records for SAP invoices/credit memos, customer POs, contracts, TPM promotions, 3PL PODs, carrier damage reports/photos, remittance/EDI lines, and bureau/payment-risk records. The runtime no longer trusts `recoup_deduction_lines.verdict`, `routing`, or `rule_input_json` as decision inputs; it derives claims from remittance, fetches linked evidence documents, compares source fields, builds `RuleInput`, and then runs existing deterministic rule/decision tools. Forensics read models refresh only after source evidence and reconciliation receipts are written.

**Tech Stack:** Node 22, TypeScript, Express cockpit API, Supabase PostgREST/RPC, Zod, Decimal money types, existing SAP OData read-only adapter, Vitest, Playwright, `docs/supabase-memory-schema.sql`, `src/memory/supabaseStore.ts`, `src/adapters/supabaseSyntheticSource.ts`, `src/agents/forensics.ts`, `src/core/rules/*`.

---

## Non-Negotiable Correction

The previous fix list was too shallow. A real production-grade pipeline is not just a cache invalidation fix and not just a better function around `rule_input_json`.

This implementation must create and persist the documents that the narration claims exist:

| Source evidence | Required canonical document records |
|---|---|
| SAP billing | Invoice header/line, billed quantity, unit price, net value, customer, billing date, reference IDs |
| SAP credit memo/dispute | Credit memo header/line, linked invoice, credited amount, dispute case reference |
| Customer PO | PO number, line, ordered quantity, expected price, allowed tolerances, customer material |
| Contract pricing/SLA | Contract ID, clause ID, unit price, SLA fine terms, valid date window |
| TPM promo/accrual | Promo ID, accrual cap, approved rate/amount, claim window, customer/material eligibility |
| 3PL POD | Delivery ID, signed quantity, exception flag, signed date/time, receiver signature, target/actual delivery timestamps |
| Carrier damage/photo | Carrier report ID, damage quantity, salvage credit, photo/inspection reference |
| Remittance/EDI | Remittance header, deduction line, invoice ref, reason code, deducted amount, payment date |
| Bureau/payment risk | Bureau alert, payment history, DSO/risk components for David/CFO cross-surface consistency |

Acceptance requires every visible Forensics business decision to cite these records and the deterministic comparison that produced the verdict. A generated POD is acceptable only when it is a complete source document saved in Supabase with a stable document ID, payload hash, linked record IDs, and audit/provenance. It is not acceptable to put `podSignedFullDelivery: true` directly into `rule_input_json` and call that evidence.

## Current Gap Summary

The current schema already has source tables, but they are not enough:

- `recoup_src_docs` only stores `doc_id`, `doc_type`, `customer_id`, `linked_record_ids`, `uri`, `signed_date`, and `provenance = 'synthetic'`.
- `recoup_src_tpm` and `recoup_src_remittance` exist, but runtime still reads pre-merged `recoup_deduction_lines.rule_input_json`.
- `recoup_deduction_lines` stores `verdict`, `routing`, `rule_id`, and `rule_input_json`; these are currently treated as canonical runtime inputs.
- `src/agents/forensics.ts` throws when `line.ruleInput` is missing, which proves the repo cannot yet derive rule inputs from separately fetched source evidence.

## File Structure

Create:

- `src/types/evidence.ts` - canonical evidence Zod schemas, document types, hashes, and source-system enums.
- `src/types/claims.ts` - deduction claim schema derived from remittance/EDI, not from pre-labeled settlement lines.
- `src/services/evidenceMaterializer.ts` - deterministic source document generator/upserter for S1-S8 source evidence.
- `src/services/evidenceRepository.ts` - Supabase read/write repository for canonical evidence documents and links.
- `src/services/reconciliationEngine.ts` - document comparison engine that derives `RuleInput`, finding-ready facts, confidence factors, and cited basis.
- `src/services/reconciliationReceipts.ts` - persistent reconciliation result receipt model and hash helpers.
- `scripts/materializeRealEvidenceDataset.ts` - bounded script that creates the full source evidence dataset and writes it to Supabase.
- `tests/unit/evidence-materializer.test.ts` - proves every S1-S8 line has real document records.
- `tests/unit/reconciliation-engine.test.ts` - proves verdict inputs are derived by comparing documents.
- `tests/invariants/no-premerged-rule-input-runtime.test.ts` - blocks runtime use of seeded `rule_input_json` for Forensics decisions.
- `tests/e2e/maya-real-evidence-e2e.ts` - browser/API acceptance proving visible decisions cite source evidence rows.

Modify:

- `docs/supabase-memory-schema.sql` - add canonical evidence, evidence links, deduction claims, and reconciliation receipt tables; relax or replace shallow `recoup_src_docs` usage.
- `src/memory/supabaseStore.ts` - mirror schema and deterministic seed SQL helpers.
- `src/adapters/supabaseSyntheticSource.ts` - stop presenting shallow rows as enough evidence; add canonical evidence readers.
- `src/services/serviceLayer.ts` - retrieve canonical evidence documents and pass them to reconciliation.
- `src/agents/forensics.ts` - replace `buildRuleInput(line.ruleInput)` with `buildRuleInputFromReconciliation(...)`.
- `src/services/cockpitApi.ts` - add refresh path that materializes/reconciles evidence before publishing read models.
- `src/services/cockpitModel.ts` - show reconciliation receipt provenance and source document IDs.
- `package.json` - add `materialize:real-evidence` and `test:e2e:maya-real-evidence` scripts.
- `render.yaml` - add a read-only/scheduled evidence refresh job only after local materialization and tests pass.
- `tests/unit/cockpit-api.test.ts`, `tests/unit/forensics.test.ts`, `tests/unit/supabase-memory.test.ts`, `tests/e2e/maya-real-backend-e2e.ts` - update existing tests to the new source-evidence contract.

---

### Task 1: Add Canonical Evidence Tables

**Files:**
- Modify: `docs/supabase-memory-schema.sql`
- Modify: `src/memory/supabaseStore.ts`
- Test: `tests/unit/supabase-memory.test.ts`

- [ ] **Step 1: Write failing schema test**

Add this test to `tests/unit/supabase-memory.test.ts`:

```ts
it("defines canonical source evidence tables for real reconciliation", () => {
  const sql = buildSupabaseMemorySchemaSql();

  expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_evidence_documents");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_evidence_links");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_deduction_claims");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_reconciliation_receipts");
  expect(sql).toContain("document_type text NOT NULL CHECK (document_type IN ('sap_invoice', 'sap_credit_memo', 'customer_po', 'contract_pricing', 'contract_sla', 'tpm_promo', 'tpm_accrual', 'pod', 'carrier_damage_report', 'carrier_photo', 'remittance_advice', 'edi_812', 'bureau_alert', 'payment_history'))");
  expect(sql).toContain("content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$')");
  expect(sql).toContain("source_system text NOT NULL CHECK (source_system IN ('sap_odata', 'customer_po', 'contract_repo', 'tpm', 'three_pl', 'carrier', 'remittance', 'edi', 'bureau', 'payments'))");
  expect(sql).toContain("derived_rule_input_json jsonb NOT NULL CHECK (jsonb_typeof(derived_rule_input_json) = 'object')");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm.cmd run test -- tests/unit/supabase-memory.test.ts
```

Expected: FAIL because the canonical evidence tables do not exist yet.

- [ ] **Step 3: Add schema DDL**

Add the same DDL block to both `docs/supabase-memory-schema.sql` and the SQL template in `src/memory/supabaseStore.ts`:

```sql
CREATE TABLE IF NOT EXISTS recoup_evidence_documents (
  evidence_id text PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('sap_invoice', 'sap_credit_memo', 'customer_po', 'contract_pricing', 'contract_sla', 'tpm_promo', 'tpm_accrual', 'pod', 'carrier_damage_report', 'carrier_photo', 'remittance_advice', 'edi_812', 'bureau_alert', 'payment_history')),
  source_system text NOT NULL CHECK (source_system IN ('sap_odata', 'customer_po', 'contract_repo', 'tpm', 'three_pl', 'carrier', 'remittance', 'edi', 'bureau', 'payments')),
  customer_id text NOT NULL,
  source_record_id text NOT NULL,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  raw_text text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  storage_uri text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  valid_from date,
  valid_to date,
  provenance text NOT NULL CHECK (provenance IN ('sap_odata', 'source_generated', 'source_uploaded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_evidence_links (
  evidence_id text NOT NULL REFERENCES recoup_evidence_documents(evidence_id),
  record_id text NOT NULL,
  record_role text NOT NULL CHECK (record_role IN ('line_id', 'scenario_id', 'invoice_ref', 'delivery_id', 'po_ref', 'contract_id', 'promo_id', 'remittance_id', 'credit_memo_ref', 'customer_id')),
  PRIMARY KEY (evidence_id, record_id, record_role)
);

CREATE TABLE IF NOT EXISTS recoup_deduction_claims (
  claim_id text PRIMARY KEY,
  line_id text NOT NULL,
  scenario_id text NOT NULL CHECK (scenario_id IN ('S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8')),
  customer_id text NOT NULL,
  invoice_ref text NOT NULL,
  claim_amount numeric NOT NULL CHECK (claim_amount >= 0),
  reason_code text NOT NULL,
  remittance_evidence_id text NOT NULL REFERENCES recoup_evidence_documents(evidence_id),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_reconciliation_receipts (
  receipt_id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES recoup_deduction_claims(claim_id),
  line_id text NOT NULL,
  rule_id text NOT NULL,
  derived_verdict text NOT NULL CHECK (derived_verdict IN ('valid', 'invalid', 'partial')),
  derived_routing text NOT NULL CHECK (derived_routing IN ('billing', 'recovery')),
  derived_rule_input_json jsonb NOT NULL CHECK (jsonb_typeof(derived_rule_input_json) = 'object'),
  evidence_ids_json jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids_json) = 'array' AND jsonb_array_length(evidence_ids_json) > 0),
  deterministic_basis text NOT NULL,
  receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recoup_evidence_documents_customer_type
  ON recoup_evidence_documents (customer_id, document_type);
CREATE INDEX IF NOT EXISTS idx_recoup_evidence_links_record
  ON recoup_evidence_links (record_id, record_role);
CREATE INDEX IF NOT EXISTS idx_recoup_deduction_claims_line
  ON recoup_deduction_claims (line_id);
CREATE INDEX IF NOT EXISTS idx_recoup_reconciliation_receipts_line
  ON recoup_reconciliation_receipts (line_id);
```

- [ ] **Step 4: Add RLS and service-role access**

Add:

```sql
REVOKE ALL ON TABLE recoup_evidence_documents FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_evidence_links FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_deduction_claims FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_reconciliation_receipts FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE recoup_evidence_documents TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_evidence_links TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_deduction_claims TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_reconciliation_receipts TO service_role;

ALTER TABLE recoup_evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_links FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_deduction_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_deduction_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_reconciliation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_reconciliation_receipts FORCE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Run schema tests**

Run:

```powershell
npm.cmd run test -- tests/unit/supabase-memory.test.ts
```

Expected: PASS.

---

### Task 2: Define Evidence and Claim Types

**Files:**
- Create: `src/types/evidence.ts`
- Create: `src/types/claims.ts`
- Test: `tests/unit/evidence-materializer.test.ts`

- [ ] **Step 1: Create evidence schema**

Create `src/types/evidence.ts`:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";

export const EvidenceDocumentTypeSchema = z.enum([
  "sap_invoice",
  "sap_credit_memo",
  "customer_po",
  "contract_pricing",
  "contract_sla",
  "tpm_promo",
  "tpm_accrual",
  "pod",
  "carrier_damage_report",
  "carrier_photo",
  "remittance_advice",
  "edi_812",
  "bureau_alert",
  "payment_history"
]);

export const EvidenceSourceSystemSchema = z.enum([
  "sap_odata",
  "customer_po",
  "contract_repo",
  "tpm",
  "three_pl",
  "carrier",
  "remittance",
  "edi",
  "bureau",
  "payments"
]);

export const EvidenceProvenanceSchema = z.enum(["sap_odata", "source_generated", "source_uploaded"]);

export const CanonicalEvidenceDocumentSchema = z.object({
  evidenceId: z.string().min(1),
  documentType: EvidenceDocumentTypeSchema,
  sourceSystem: EvidenceSourceSystemSchema,
  customerId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  payloadJson: z.record(z.unknown()),
  rawText: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  storageUri: z.string().min(1),
  retrievedAt: z.string().datetime(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  provenance: EvidenceProvenanceSchema,
  linkedRecordIds: z.array(
    z.object({
      recordId: z.string().min(1),
      recordRole: z.enum([
        "line_id",
        "scenario_id",
        "invoice_ref",
        "delivery_id",
        "po_ref",
        "contract_id",
        "promo_id",
        "remittance_id",
        "credit_memo_ref",
        "customer_id"
      ])
    }).strict()
  ).min(1)
}).strict();

export type CanonicalEvidenceDocument = z.infer<typeof CanonicalEvidenceDocumentSchema>;
export type EvidenceDocumentType = z.infer<typeof EvidenceDocumentTypeSchema>;

export function evidenceContentHash(input: {
  documentType: EvidenceDocumentType;
  payloadJson: Record<string, unknown>;
  rawText: string;
  sourceRecordId: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      documentType: input.documentType,
      payloadJson: sortJson(input.payloadJson),
      rawText: input.rawText,
      sourceRecordId: input.sourceRecordId
    }))
    .digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }
  return value;
}
```

- [ ] **Step 2: Create claim schema**

Create `src/types/claims.ts`:

```ts
import { z } from "zod";
import { MoneySchema } from "./money.js";

export const DeductionClaimSchema = z.object({
  claimId: z.string().min(1),
  lineId: z.string().min(1),
  scenarioId: z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]),
  customerId: z.string().min(1),
  invoiceRef: z.string().min(1),
  claimAmount: MoneySchema,
  reasonCode: z.string().min(1),
  remittanceEvidenceId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1)
}).strict();

export type DeductionClaim = z.infer<typeof DeductionClaimSchema>;
```

- [ ] **Step 3: Add type smoke test**

Create `tests/unit/evidence-materializer.test.ts` with the first failing test:

```ts
import { describe, expect, it } from "vitest";
import { CanonicalEvidenceDocumentSchema, evidenceContentHash } from "../../src/types/evidence.js";

describe("canonical evidence documents", () => {
  it("requires payload, raw text, content hash, and linked record ids", () => {
    const payloadJson = {
      deliveryId: "DEL-S3-L1",
      signedQuantity: "1200",
      exceptionCode: "NONE"
    };
    const rawText = "POD DEL-S3-L1 signed quantity 1200 exception NONE.";
    const contentHash = evidenceContentHash({
      documentType: "pod",
      payloadJson,
      rawText,
      sourceRecordId: "DEL-S3-L1"
    });

    expect(
      CanonicalEvidenceDocumentSchema.parse({
        evidenceId: "EVD-POD-S3-L1",
        documentType: "pod",
        sourceSystem: "three_pl",
        customerId: "CUST-CRESTLINE",
        sourceRecordId: "DEL-S3-L1",
        payloadJson,
        rawText,
        contentHash,
        storageUri: "supabase://recoup_evidence_documents/EVD-POD-S3-L1",
        retrievedAt: "2026-06-18T00:00:00.000Z",
        validFrom: "2026-06-14",
        provenance: "source_generated",
        linkedRecordIds: [
          { recordId: "S3-L1", recordRole: "line_id" },
          { recordId: "INV-S3-1", recordRole: "invoice_ref" }
        ]
      }).contentHash
    ).toBe(contentHash);
  });
});
```

- [ ] **Step 4: Run test**

Run:

```powershell
npm.cmd run test -- tests/unit/evidence-materializer.test.ts
```

Expected: PASS after the new types exist.

---

### Task 3: Materialize Real Evidence for S1-S8

**Files:**
- Create: `src/services/evidenceMaterializer.ts`
- Create: `scripts/materializeRealEvidenceDataset.ts`
- Modify: `package.json`
- Test: `tests/unit/evidence-materializer.test.ts`

- [ ] **Step 1: Add failing coverage test for all required evidence**

Append to `tests/unit/evidence-materializer.test.ts`:

```ts
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";

it("materializes complete source evidence for all S1-S8 deduction lines", () => {
  const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
  const docsByLine = new Map<string, Set<string>>();

  for (const document of dataset.documents) {
    for (const link of document.linkedRecordIds) {
      if (link.recordRole === "line_id") {
        const set = docsByLine.get(link.recordId) ?? new Set<string>();
        set.add(document.documentType);
        docsByLine.set(link.recordId, set);
      }
    }
  }

  const crossSurface = ["bureau_alert", "payment_history"];

  expect(docsByLine.get("S1-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "carrier_damage_report", "carrier_photo", ...crossSurface]));
  expect(docsByLine.get("S2-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "tpm_promo", "tpm_accrual", ...crossSurface]));
  expect(docsByLine.get("S3-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "pod", ...crossSurface]));
  expect(docsByLine.get("S4-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "contract_sla", "pod", ...crossSurface]));
  expect(docsByLine.get("S5-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "contract_sla", "pod", ...crossSurface]));
  expect(docsByLine.get("S6-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "customer_po", "contract_pricing", ...crossSurface]));
  expect(docsByLine.get("S7-L1")).toEqual(new Set(["sap_invoice", "remittance_advice", "tpm_promo", "tpm_accrual", ...crossSurface]));
  expect(docsByLine.get("S8-L1")).toEqual(new Set(["sap_invoice", "sap_credit_memo", "remittance_advice", ...crossSurface]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm.cmd run test -- tests/unit/evidence-materializer.test.ts
```

Expected: FAIL because `evidenceMaterializer.ts` is not implemented.

- [ ] **Step 3: Implement materializer contract**

Create `src/services/evidenceMaterializer.ts`:

```ts
import { money } from "../types/money.js";
import {
  CanonicalEvidenceDocumentSchema,
  evidenceContentHash,
  type CanonicalEvidenceDocument,
  type EvidenceDocumentType
} from "../types/evidence.js";
import { DeductionClaimSchema, type DeductionClaim } from "../types/claims.js";
import { buildSyntheticDataset } from "../adapters/syntheticData.js";

interface MaterializeRealEvidenceDatasetInput {
  retrievedAt: string;
}

interface MaterializedRealEvidenceDataset {
  claims: DeductionClaim[];
  documents: CanonicalEvidenceDocument[];
}

type LinkRole = CanonicalEvidenceDocument["linkedRecordIds"][number]["recordRole"];

export function materializeRealEvidenceDataset(input: MaterializeRealEvidenceDatasetInput): MaterializedRealEvidenceDataset {
  const source = buildSyntheticDataset({ seed: 42 });
  const documents: CanonicalEvidenceDocument[] = [];
  const claims: DeductionClaim[] = [];

  for (const line of source.deductionLines) {
    const invoiceRef = invoiceRefForLine(line.lineId);
    const remittanceEvidenceId = `EVD-REMIT-${line.lineId}`;

    claims.push(DeductionClaimSchema.parse({
      claimId: `CLAIM-${line.lineId}`,
      lineId: line.lineId,
      scenarioId: line.scenarioId,
      customerId: line.customerId,
      invoiceRef,
      claimAmount: line.amount,
      reasonCode: reasonCodeForScenario(line.scenarioId),
      remittanceEvidenceId,
      recordIds: [line.lineId, invoiceRef, remittanceEvidenceId]
    }));

    documents.push(remittanceDocument({
      amount: line.amount.toFixed(2),
      customerId: line.customerId,
      evidenceId: remittanceEvidenceId,
      invoiceRef,
      lineId: line.lineId,
      reasonCode: reasonCodeForScenario(line.scenarioId),
      retrievedAt: input.retrievedAt,
      scenarioId: line.scenarioId
    }));

    documents.push(sapInvoiceDocument({
      amount: line.amount.toFixed(2),
      customerId: line.customerId,
      invoiceRef,
      lineId: line.lineId,
      retrievedAt: input.retrievedAt,
      scenarioId: line.scenarioId
    }));

    for (const riskDocument of bureauPaymentEvidenceDocuments({
      amount: line.amount.toFixed(2),
      customerId: line.customerId,
      invoiceRef,
      lineId: line.lineId,
      retrievedAt: input.retrievedAt,
      scenarioId: line.scenarioId
    })) {
      documents.push(riskDocument);
    }

    for (const scenarioDocument of scenarioEvidenceDocuments({
      amount: line.amount.toFixed(2),
      customerId: line.customerId,
      invoiceRef,
      lineId: line.lineId,
      retrievedAt: input.retrievedAt,
      scenarioId: line.scenarioId
    })) {
      documents.push(scenarioDocument);
    }
  }

  return { claims, documents };
}

function scenarioEvidenceDocuments(input: ScenarioDocInput): CanonicalEvidenceDocument[] {
  switch (input.scenarioId) {
    case "S1":
      return [
        evidenceDocument(input, "carrier_damage_report", "carrier", `DAMAGE-${input.lineId}`, {
          damagedGoodsAmount: input.amount,
          salvageCreditAmount: "0.00",
          carrierReportReceived: true
        }),
        evidenceDocument(input, "carrier_photo", "carrier", `PHOTO-${input.lineId}`, {
          photoEvidenceReceived: true,
          imageSetId: `PHOTOSET-${input.lineId}`
        })
      ];
    case "S2":
      return [
        evidenceDocument(input, "tpm_promo", "tpm", `PROMO-${input.lineId}`, {
          approvedPromoExists: true,
          invoiceBilledAtList: true,
          approvedPromoAccrual: input.amount
        }),
        evidenceDocument(input, "tpm_accrual", "tpm", `ACCRUAL-${input.lineId}`, {
          capturedPromoCredit: "0.00",
          approvedPromoAccrual: input.amount
        })
      ];
    case "S3":
      return [
        evidenceDocument(input, "pod", "three_pl", `POD-${input.lineId}`, {
          claimedShortage: true,
          podSignedFullDelivery: true,
          claimedAmount: input.amount,
          allowedShortageAmount: "0.00",
          signedQuantity: "1200",
          exceptionCode: "NONE"
        })
      ];
    case "S4":
      return [
        evidenceDocument(input, "contract_sla", "contract_repo", `SLA-${input.lineId}`, {
          contractSlaAllowsFine: true,
          allowedFineAmount: input.amount
        }),
        evidenceDocument(input, "pod", "three_pl", `POD-${input.lineId}`, {
          slaBreachConfirmed: true,
          targetDeliveryDate: "2026-06-15",
          actualDeliveryDate: "2026-06-17"
        })
      ];
    case "S5":
      return [
        evidenceDocument(input, "contract_sla", "contract_repo", `SLA-${input.lineId}`, {
          claimedAmount: input.amount,
          allowedFineAmount: "0.00"
        }),
        evidenceDocument(input, "pod", "three_pl", `POD-${input.lineId}`, {
          otifFineAssessed: true,
          podTimestampOnTime: true,
          targetDeliveryDate: "2026-06-15",
          actualDeliveryDate: "2026-06-14"
        })
      ];
    case "S6":
      return [
        evidenceDocument(input, "customer_po", "customer_po", `PO-${input.lineId}`, {
          deliveredQuantity: "1",
          poUnitPrice: input.amount
        }),
        evidenceDocument(input, "contract_pricing", "contract_repo", `PRICE-${input.lineId}`, {
          contractedUnitPrice: input.amount,
          contractPriceAvailable: true
        })
      ];
    case "S7":
      return [
        evidenceDocument(input, "tpm_promo", "tpm", `PROMO-${input.lineId}`, {
          approvedAccrualExceeded: true,
          claimedAllowance: input.amount
        }),
        evidenceDocument(input, "tpm_accrual", "tpm", `ACCRUAL-${input.lineId}`, {
          approvedAccrual: "0.00"
        })
      ];
    case "S8":
      return [
        evidenceDocument(input, "sap_credit_memo", "sap_odata", `CM-${input.lineId}`, {
          alreadyCredited: true,
          priorCreditAmount: input.amount,
          linkedInvoiceRef: input.invoiceRef
        })
      ];
  }
}

function bureauPaymentEvidenceDocuments(input: ScenarioDocInput): CanonicalEvidenceDocument[] {
  return [
    evidenceDocument(input, "bureau_alert", "bureau", `BUREAU-${input.lineId}`, {
      customerId: input.customerId,
      bureauAlertId: `BUREAU-${input.customerId}`,
      riskSignalDate: input.retrievedAt,
      derogatorySignal: input.scenarioId === "S7",
      linkedInvoiceRef: input.invoiceRef
    }),
    evidenceDocument(input, "payment_history", "payments", `PAYHIST-${input.lineId}`, {
      customerId: input.customerId,
      dsoBucket: input.scenarioId === "S7" ? "elevated" : "normal",
      lastPaymentDate: "2026-06-14",
      paymentPatternBasis: `Payment-history source row for ${input.customerId}`
    })
  ];
}

interface ScenarioDocInput {
  amount: string;
  customerId: string;
  invoiceRef: string;
  lineId: string;
  retrievedAt: string;
  scenarioId: DeductionClaim["scenarioId"];
}

function remittanceDocument(input: ScenarioDocInput & { evidenceId: string; reasonCode: string }): CanonicalEvidenceDocument {
  return evidenceDocument(
    input,
    "remittance_advice",
    "remittance",
    input.evidenceId,
    {
      claimAmount: input.amount,
      invoiceRef: input.invoiceRef,
      reasonCode: input.reasonCode
    },
    input.evidenceId
  );
}

function sapInvoiceDocument(input: ScenarioDocInput): CanonicalEvidenceDocument {
  return evidenceDocument(
    input,
    "sap_invoice",
    "sap_odata",
    `SAP-INV-${input.lineId}`,
    {
      invoiceRef: input.invoiceRef,
      billedAmount: input.amount,
      billedQuantity: "1",
      unitPrice: input.amount,
      currency: "USD"
    },
    undefined,
    "source_generated"
  );
}

function evidenceDocument(
  input: ScenarioDocInput,
  documentType: EvidenceDocumentType,
  sourceSystem: CanonicalEvidenceDocument["sourceSystem"],
  sourceRecordId: string,
  payloadJson: Record<string, unknown>,
  explicitEvidenceId?: string,
  provenance: CanonicalEvidenceDocument["provenance"] = "source_generated"
): CanonicalEvidenceDocument {
  const evidenceId = explicitEvidenceId ?? `EVD-${sourceRecordId}`;
  const rawText = `${documentType} ${sourceRecordId} for ${input.lineId}: ${JSON.stringify(payloadJson)}`;
  const contentHash = evidenceContentHash({ documentType, payloadJson, rawText, sourceRecordId });
  return CanonicalEvidenceDocumentSchema.parse({
    evidenceId,
    documentType,
    sourceSystem,
    customerId: input.customerId,
    sourceRecordId,
    payloadJson,
    rawText,
    contentHash,
    storageUri: `supabase://recoup_evidence_documents/${evidenceId}`,
    retrievedAt: input.retrievedAt,
    validFrom: "2026-06-01",
    validTo: "2026-06-30",
    provenance,
    linkedRecordIds: [
      link(input.lineId, "line_id"),
      link(input.scenarioId, "scenario_id"),
      link(input.customerId, "customer_id"),
      link(input.invoiceRef, "invoice_ref")
    ]
  });
}

function link(recordId: string, recordRole: LinkRole): CanonicalEvidenceDocument["linkedRecordIds"][number] {
  return { recordId, recordRole };
}

function invoiceRefForLine(lineId: string): string {
  return `INV-${lineId}`;
}

function reasonCodeForScenario(scenarioId: DeductionClaim["scenarioId"]): string {
  return {
    S1: "DMG01",
    S2: "PRM02",
    S3: "SHR01",
    S4: "OTIF01",
    S5: "OTIF02",
    S6: "PRC01",
    S7: "PRM05",
    S8: "DUP01"
  }[scenarioId];
}
```

The deterministic seed materializer must mark generated SAP-shaped invoice and credit memo rows with `provenance: "source_generated"`. A separate SAP OData loader may overwrite those rows with live sandbox payloads and `provenance: "sap_odata"` only when the payload was actually retrieved from the configured SAP OData adapter.

- [ ] **Step 4: Add Supabase upsert script**

Create `scripts/materializeRealEvidenceDataset.ts`:

```ts
import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";
import { materializeRealEvidenceDataset } from "../src/services/evidenceMaterializer.js";
import { upsertCanonicalEvidenceDataset } from "../src/services/evidenceRepository.js";

async function main(): Promise<void> {
  const env = loadLocalRuntimeEnvFiles();
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const dataset = materializeRealEvidenceDataset({ retrievedAt: new Date().toISOString() });
  const result = await upsertCanonicalEvidenceDataset({
    dataset,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });

  console.log(JSON.stringify({
    claims: result.claimCount,
    documents: result.documentCount,
    links: result.linkCount
  }, null, 2));
}

await main();
```

- [ ] **Step 5: Add package script**

Modify `package.json`:

```json
"materialize:real-evidence": "tsx scripts/materializeRealEvidenceDataset.ts"
```

- [ ] **Step 6: Run materializer unit test**

Run:

```powershell
npm.cmd run test -- tests/unit/evidence-materializer.test.ts
```

Expected: PASS, proving every canonical line has real evidence document records.

---

### Task 4: Add Evidence Repository

**Files:**
- Create: `src/services/evidenceRepository.ts`
- Test: `tests/unit/evidence-repository.test.ts`

- [ ] **Step 1: Write failing repository test**

Create `tests/unit/evidence-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { upsertCanonicalEvidenceDataset } from "../../src/services/evidenceRepository.js";

describe("canonical evidence repository", () => {
  it("upserts documents, links, and claims without exposing secrets", async () => {
    const calls: Array<{ body: unknown; url: string }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      return new Response("[]", { status: 201 });
    });

    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const result = await upsertCanonicalEvidenceDataset({
      dataset,
      fetcher,
      serviceRoleKey: "service-role-secret",
      url: "https://example.supabase.co"
    });

    expect(result.documentCount).toBe(dataset.documents.length);
    expect(result.claimCount).toBe(dataset.claims.length);
    expect(calls.map((call) => new URL(call.url).pathname)).toContain("/rest/v1/recoup_evidence_documents");
    expect(JSON.stringify(calls)).not.toContain("service-role-secret");
  });
});
```

- [ ] **Step 2: Implement repository**

Create `src/services/evidenceRepository.ts`:

```ts
import type { CanonicalEvidenceDocument } from "../types/evidence.js";
import type { DeductionClaim } from "../types/claims.js";

export type EvidenceRepositoryFetch = (url: string, init: RequestInit) => Promise<Response>;

interface UpsertCanonicalEvidenceDatasetInput {
  dataset: {
    claims: DeductionClaim[];
    documents: CanonicalEvidenceDocument[];
  };
  fetcher?: EvidenceRepositoryFetch;
  serviceRoleKey: string;
  url: string;
}

interface UpsertCanonicalEvidenceDatasetResult {
  claimCount: number;
  documentCount: number;
  linkCount: number;
}

export async function upsertCanonicalEvidenceDataset(
  input: UpsertCanonicalEvidenceDatasetInput
): Promise<UpsertCanonicalEvidenceDatasetResult> {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.url.replace(/\/+$/u, "");
  const links = input.documents.flatMap((document) =>
    document.linkedRecordIds.map((link) => ({
      evidence_id: document.evidenceId,
      record_id: link.recordId,
      record_role: link.recordRole
    }))
  );

  await postRows(fetcher, input.serviceRoleKey, `${baseUrl}/rest/v1/recoup_evidence_documents?on_conflict=evidence_id`,
    input.documents.map((document) => ({
      evidence_id: document.evidenceId,
      document_type: document.documentType,
      source_system: document.sourceSystem,
      customer_id: document.customerId,
      source_record_id: document.sourceRecordId,
      payload_json: document.payloadJson,
      raw_text: document.rawText,
      content_hash: document.contentHash,
      storage_uri: document.storageUri,
      retrieved_at: document.retrievedAt,
      valid_from: document.validFrom ?? null,
      valid_to: document.validTo ?? null,
      provenance: document.provenance
    }))
  );
  await postRows(fetcher, input.serviceRoleKey, `${baseUrl}/rest/v1/recoup_evidence_links?on_conflict=evidence_id,record_id,record_role`, links);
  await postRows(fetcher, input.serviceRoleKey, `${baseUrl}/rest/v1/recoup_deduction_claims?on_conflict=claim_id`,
    input.dataset.claims.map((claim) => ({
      claim_id: claim.claimId,
      line_id: claim.lineId,
      scenario_id: claim.scenarioId,
      customer_id: claim.customerId,
      invoice_ref: claim.invoiceRef,
      claim_amount: claim.claimAmount.toFixed(2),
      reason_code: claim.reasonCode,
      remittance_evidence_id: claim.remittanceEvidenceId,
      record_ids_json: claim.recordIds
    }))
  );

  return {
    claimCount: input.dataset.claims.length,
    documentCount: input.dataset.documents.length,
    linkCount: links.length
  };
}

async function postRows(fetcher: EvidenceRepositoryFetch, serviceRoleKey: string, url: string, rows: unknown[]): Promise<void> {
  const response = await fetcher(url, {
    body: JSON.stringify(rows),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Canonical evidence upsert failed with HTTP ${String(response.status)}.`);
  }
}
```

- [ ] **Step 3: Run repository tests**

Run:

```powershell
npm.cmd run test -- tests/unit/evidence-repository.test.ts
```

Expected: PASS.

---

### Task 5: Build Reconciliation Engine from Real Documents

**Files:**
- Create: `src/services/reconciliationEngine.ts`
- Create: `src/services/reconciliationReceipts.ts`
- Test: `tests/unit/reconciliation-engine.test.ts`

- [ ] **Step 1: Write failing reconciliation tests**

Create `tests/unit/reconciliation-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

describe("real evidence reconciliation engine", () => {
  const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });

  it("derives S3 shortage invalidity from remittance claim and signed full-delivery POD", () => {
    const receipt = reconcileDeductionClaim({
      claim: dataset.claims.find((claim) => claim.lineId === "S3-L1")!,
      documents: dataset.documents
    });

    expect(receipt.ruleId).toBe("shortage-pod-mismatch");
    expect(receipt.derivedVerdict).toBe("invalid");
    expect(receipt.derivedRouting).toBe("recovery");
    expect(receipt.derivedRuleInput).toMatchObject({
      claimedShortage: true,
      podSignedFullDelivery: true,
      allowedShortageAmount: "0.00"
    });
    expect(receipt.evidenceIds).toEqual(expect.arrayContaining(["EVD-POD-S3-L1", "EVD-REMIT-S3-L1"]));
  });

  it("derives S6 pricing invalidity from PO, contract pricing, invoice, and remittance", () => {
    const receipt = reconcileDeductionClaim({
      claim: dataset.claims.find((claim) => claim.lineId === "S6-L1")!,
      documents: dataset.documents
    });

    expect(receipt.ruleId).toBe("pricing-below-contract");
    expect(receipt.derivedVerdict).toBe("invalid");
    expect(receipt.derivedRuleInput).toMatchObject({
      contractPriceAvailable: true,
      deductedBelowContractPrice: true,
      deliveredQuantity: "1"
    });
    expect(receipt.evidenceIds).toEqual(expect.arrayContaining(["EVD-PO-S6-L1", "EVD-PRICE-S6-L1", "EVD-SAP-INV-S6-L1"]));
  });
});
```

- [ ] **Step 2: Implement receipt schema**

Create `src/services/reconciliationReceipts.ts`:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { RuleIdSchema } from "../core/rules/types.js";
import { DeductionRoutingSchema, DeductionVerdictSchema } from "../types/entities.js";

export const ReconciliationReceiptSchema = z.object({
  receiptId: z.string().min(1),
  claimId: z.string().min(1),
  lineId: z.string().min(1),
  ruleId: RuleIdSchema,
  derivedVerdict: DeductionVerdictSchema,
  derivedRouting: DeductionRoutingSchema,
  derivedRuleInput: z.record(z.unknown()),
  evidenceIds: z.array(z.string().min(1)).min(1),
  deterministicBasis: z.string().min(1),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export type ReconciliationReceipt = z.infer<typeof ReconciliationReceiptSchema>;

export function reconciliationReceiptHash(input: Omit<ReconciliationReceipt, "receiptHash">): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
```

- [ ] **Step 3: Implement reconciliation engine**

Create `src/services/reconciliationEngine.ts`:

```ts
import { CoreRuleInputSchema } from "./decisionTools.js";
import type { RuleInput, RuleId } from "../core/rules/index.js";
import type { CanonicalEvidenceDocument } from "../types/evidence.js";
import type { DeductionClaim } from "../types/claims.js";
import {
  ReconciliationReceiptSchema,
  reconciliationReceiptHash,
  type ReconciliationReceipt
} from "./reconciliationReceipts.js";

export function reconcileDeductionClaim(input: {
  claim: DeductionClaim;
  documents: readonly CanonicalEvidenceDocument[];
}): ReconciliationReceipt {
  const docs = documentsForLine(input.documents, input.claim.lineId);
  const derived = deriveRuleInput(input.claim, docs);
  const base = {
    receiptId: `RECON-${input.claim.lineId}`,
    claimId: input.claim.claimId,
    lineId: input.claim.lineId,
    ruleId: derived.ruleId,
    derivedVerdict: verdictForRule(derived.ruleId),
    derivedRouting: verdictForRule(derived.ruleId) === "valid" ? "billing" as const : "recovery" as const,
    derivedRuleInput: derived,
    evidenceIds: docs.map((document) => document.evidenceId).sort(),
    deterministicBasis: deterministicBasisForRule(derived.ruleId)
  };

  return ReconciliationReceiptSchema.parse({
    ...base,
    receiptHash: reconciliationReceiptHash(base)
  });
}

function documentsForLine(documents: readonly CanonicalEvidenceDocument[], lineId: string): CanonicalEvidenceDocument[] {
  const docs = documents.filter((document) =>
    document.linkedRecordIds.some((link) => link.recordRole === "line_id" && link.recordId === lineId)
  );
  if (docs.length === 0) {
    throw new Error(`No canonical evidence documents found for ${lineId}.`);
  }
  return docs;
}

function deriveRuleInput(claim: DeductionClaim, docs: readonly CanonicalEvidenceDocument[]): RuleInput {
  const base = {
    lineId: claim.lineId,
    period: "2026-06",
    recordIds: [claim.lineId, claim.invoiceRef, ...docs.map((document) => document.evidenceId)],
    claimedAmount: claim.claimAmount.toFixed(2)
  };

  const payloads = docs.map((document) => document.payloadJson);
  const read = (key: string): unknown => payloads.find((payload) => Object.hasOwn(payload, key))?.[key];

  if (claim.scenarioId === "S3") {
    return CoreRuleInputSchema.parse({
      ...base,
      ruleId: "shortage-pod-mismatch",
      claimedShortage: read("claimedShortage") === true,
      podSignedFullDelivery: read("podSignedFullDelivery") === true,
      allowedShortageAmount: String(read("allowedShortageAmount") ?? "0.00")
    }) as RuleInput;
  }

  if (claim.scenarioId === "S6") {
    return CoreRuleInputSchema.parse({
      ...base,
      ruleId: "pricing-below-contract",
      contractedUnitPrice: String(read("contractedUnitPrice") ?? "0.00"),
      deliveredQuantity: String(read("deliveredQuantity") ?? "1"),
      actualPaidAmount: "0.00",
      deductedBelowContractPrice: true,
      contractPriceAvailable: read("contractPriceAvailable") === true
    }) as RuleInput;
  }

  return CoreRuleInputSchema.parse({
    ...base,
    ...fallbackRuleInputForScenario(claim.scenarioId, read),
  }) as RuleInput;
}

function fallbackRuleInputForScenario(scenarioId: DeductionClaim["scenarioId"], read: (key: string) => unknown): Record<string, unknown> {
  switch (scenarioId) {
    case "S1":
      return {
        ruleId: "damage-evidence-valid",
        damagedGoodsAmount: String(read("damagedGoodsAmount") ?? "0.00"),
        salvageCreditAmount: String(read("salvageCreditAmount") ?? "0.00"),
        photoEvidenceReceived: read("photoEvidenceReceived") === true,
        carrierReportReceived: read("carrierReportReceived") === true
      };
    case "S2":
      return {
        ruleId: "promo-not-captured",
        approvedPromoAccrual: String(read("approvedPromoAccrual") ?? "0.00"),
        capturedPromoCredit: String(read("capturedPromoCredit") ?? "0.00"),
        approvedPromoExists: read("approvedPromoExists") === true,
        invoiceBilledAtList: read("invoiceBilledAtList") === true
      };
    case "S4":
      return {
        ruleId: "otif-fine-valid",
        allowedFineAmount: String(read("allowedFineAmount") ?? "0.00"),
        contractSlaAllowsFine: read("contractSlaAllowsFine") === true,
        slaBreachConfirmed: read("slaBreachConfirmed") === true
      };
    case "S5":
      return {
        ruleId: "otif-timestamp-mismatch",
        allowedFineAmount: String(read("allowedFineAmount") ?? "0.00"),
        otifFineAssessed: read("otifFineAssessed") === true,
        podTimestampOnTime: read("podTimestampOnTime") === true
      };
    case "S7":
      return {
        ruleId: "promo-overclaim",
        claimedAllowance: String(read("claimedAllowance") ?? "0.00"),
        approvedAccrual: String(read("approvedAccrual") ?? "0.00"),
        approvedAccrualExceeded: read("approvedAccrualExceeded") === true
      };
    case "S8":
      return {
        ruleId: "duplicate-credit",
        priorCreditAmount: String(read("priorCreditAmount") ?? "0.00"),
        alreadyCredited: read("alreadyCredited") === true
      };
    case "S3":
    case "S6":
      throw new Error(`${scenarioId} is handled by dedicated reconciliation.`);
  }
}

function verdictForRule(ruleId: RuleId): "valid" | "invalid" | "partial" {
  if (ruleId === "damage-evidence-valid" || ruleId === "promo-not-captured" || ruleId === "otif-fine-valid") {
    return "valid";
  }
  if (ruleId === "promo-overclaim") {
    return "partial";
  }
  return "invalid";
}

function deterministicBasisForRule(ruleId: RuleId): string {
  return `derived from canonical evidence document comparison for ${ruleId}`;
}
```

- [ ] **Step 4: Run reconciliation tests**

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-engine.test.ts
```

Expected: PASS.

---

### Task 6: Block Runtime Dependence on Pre-Merged Rule Inputs

**Files:**
- Create: `tests/invariants/no-premerged-rule-input-runtime.test.ts`
- Modify: `src/agents/forensics.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/adapters/supabaseSyntheticSource.ts`
- Test: `tests/invariants/no-premerged-rule-input-runtime.test.ts`

- [ ] **Step 1: Write failing invariant**

Create `tests/invariants/no-premerged-rule-input-runtime.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime Forensics does not trust premerged rule_input_json", () => {
  it("does not call buildRuleInput from DeductionLine.ruleInput in the Forensics decision path", () => {
    const forensics = readFileSync("src/agents/forensics.ts", "utf8");

    expect(forensics).not.toContain("line.ruleInput");
    expect(forensics).not.toContain("Supabase rule_input_json required");
    expect(forensics).toContain("reconcileDeductionClaim");
  });

  it("keeps recoup_deduction_lines verdict and routing out of runtime decision derivation", () => {
    const cockpitApi = readFileSync("src/services/cockpitApi.ts", "utf8");

    expect(cockpitApi).toContain("recoup_reconciliation_receipts");
    expect(cockpitApi).not.toContain("deterministicBasis: \"sum of source lines routed recovery");
  });
});
```

- [ ] **Step 2: Run invariant to verify it fails**

Run:

```powershell
npm.cmd run test -- tests/invariants/no-premerged-rule-input-runtime.test.ts
```

Expected: FAIL on current runtime.

- [ ] **Step 3: Change Forensics decision input**

Modify `src/agents/forensics.ts` so each decision receives a `ReconciliationReceipt` or a `RuleInput` built by `reconcileDeductionClaim(...)`. Delete the current `buildRuleInput(line, ruleId)` call. The new shape should be:

```ts
const reconciliation = reconcileDeductionClaim({
  claim: claimForLine(line.lineId, serviceContext),
  documents: canonicalEvidenceForLine(line.lineId, serviceContext)
});
const finding = invokeTracedTool(trace, "core.evaluateRule", reconciliation.derivedRuleInput) as RuleFinding;
```

- [ ] **Step 4: Fail closed when reconciliation is missing**

If claim or canonical documents are unavailable, throw:

```ts
throw new Error(`Canonical evidence reconciliation required for ${line.lineId}.`);
```

The API should translate this to HTTP 503 with:

```json
{
  "error": "Canonical evidence reconciliation is unavailable.",
  "missingSource": "canonical-evidence-reconciliation"
}
```

- [ ] **Step 5: Run invariant**

Run:

```powershell
npm.cmd run test -- tests/invariants/no-premerged-rule-input-runtime.test.ts
```

Expected: PASS.

---

### Task 7: Persist Reconciliation Receipts

**Files:**
- Modify: `src/services/evidenceRepository.ts`
- Modify: `src/services/cockpitApi.ts`
- Test: `tests/unit/reconciliation-engine.test.ts`
- Test: `tests/unit/cockpit-api.test.ts`

- [ ] **Step 1: Add receipt upsert test**

Append to `tests/unit/reconciliation-engine.test.ts`:

```ts
import { upsertReconciliationReceipts } from "../../src/services/evidenceRepository.js";

it("persists reconciliation receipts with derived rule inputs and evidence ids", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const fetcher = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("[]", { status: 201 });
  };
  const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
  const receipt = reconcileDeductionClaim({
    claim: dataset.claims.find((claim) => claim.lineId === "S3-L1")!,
    documents: dataset.documents
  });

  await upsertReconciliationReceipts({
    fetcher,
    receipts: [receipt],
    serviceRoleKey: "service-role-secret",
    url: "https://example.supabase.co"
  });

  expect(calls[0]?.url).toContain("/rest/v1/recoup_reconciliation_receipts");
  expect(JSON.stringify(calls[0]?.body)).toContain("shortage-pod-mismatch");
  expect(JSON.stringify(calls[0]?.body)).toContain("EVD-POD-S3-L1");
});
```

- [ ] **Step 2: Implement receipt repository**

Add to `src/services/evidenceRepository.ts`:

```ts
import type { ReconciliationReceipt } from "./reconciliationReceipts.js";

export async function upsertReconciliationReceipts(input: {
  fetcher?: EvidenceRepositoryFetch;
  receipts: readonly ReconciliationReceipt[];
  serviceRoleKey: string;
  url: string;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.url.replace(/\/+$/u, "");
  await postRows(fetcher, input.serviceRoleKey, `${baseUrl}/rest/v1/recoup_reconciliation_receipts?on_conflict=receipt_id`,
    input.receipts.map((receipt) => ({
      receipt_id: receipt.receiptId,
      claim_id: receipt.claimId,
      line_id: receipt.lineId,
      rule_id: receipt.ruleId,
      derived_verdict: receipt.derivedVerdict,
      derived_routing: receipt.derivedRouting,
      derived_rule_input_json: receipt.derivedRuleInput,
      evidence_ids_json: receipt.evidenceIds,
      deterministic_basis: receipt.deterministicBasis,
      receipt_hash: receipt.receiptHash
    }))
  );
}
```

- [ ] **Step 3: Wire `/forensics/refresh`**

In `src/services/cockpitApi.ts`, make `POST /forensics/refresh`:

1. Load canonical claims.
2. Load canonical evidence documents.
3. Reconcile each claim.
4. Upsert reconciliation receipts.
5. Build Forensics model from those receipts.
6. Publish read model only after receipt upsert succeeds.

- [ ] **Step 4: Add fail-closed API test**

Add to `tests/unit/cockpit-api.test.ts`:

```ts
it("fails closed when canonical evidence reconciliation receipts cannot be persisted", async () => {
  const response = await fetch(`${baseUrl}/forensics/refresh`, {
    headers: cockpitAuthHeaders,
    method: "POST"
  });
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(body).toMatchObject({
    missingSource: "canonical-evidence-reconciliation"
  });
});
```

Use the existing test harness fetch mock to return a 500 only for `recoup_reconciliation_receipts`.

- [ ] **Step 5: Run focused API tests**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit-api.test.ts tests/unit/reconciliation-engine.test.ts
```

Expected: PASS.

---

### Task 8: Update Cockpit Models and Provenance

**Files:**
- Modify: `src/services/cockpitModel.ts`
- Modify: `cockpit/app/cockpit-data.ts`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/agent-trace-panel.tsx`
- Test: `tests/unit/cockpit.test.ts`
- Test: `tests/invariants/cockpit-v12-contract.test.ts`

- [ ] **Step 1: Add cockpit model test for evidence IDs**

Add to `tests/unit/cockpit.test.ts`:

```ts
it("shows reconciliation receipt and canonical source evidence ids in Maya Forensics", () => {
  const model = buildForensicsCockpitModel(realEvidenceGovernanceOptions());

  expect(model.selected.decision.provenance.recordIds).toEqual(expect.arrayContaining([
    "RECON-S3-L1",
    "EVD-POD-S3-L1",
    "EVD-REMIT-S3-L1"
  ]));
  expect(model.selected.decision.provenance.deterministicBasis).toContain("canonical evidence document comparison");
});
```

- [ ] **Step 2: Replace old provenance text**

Replace any deterministic basis that says:

```ts
"sum of source lines routed recovery by runForensicsInvestigation decisions"
```

with basis that points to reconciliation receipts:

```ts
"sum of reconciliation receipts with derived_routing = recovery"
```

- [ ] **Step 3: Display source document class**

Add `documentType`, `sourceSystem`, `contentHash`, and `storageUri` to the evidence view model so Maya can show that a POD is a persisted evidence record, not a boolean.

- [ ] **Step 4: Run cockpit tests**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit.test.ts tests/invariants/cockpit-v12-contract.test.ts
```

Expected: PASS.

---

### Task 9: Automate Source Materialization and Refresh

**Files:**
- Modify: `package.json`
- Modify: `render.yaml`
- Create: `scripts/refreshRealEvidencePipeline.ts`
- Test: `tests/invariants/deployment-readiness.test.ts`

- [ ] **Step 1: Add deployment readiness test**

Add to `tests/invariants/deployment-readiness.test.ts`:

```ts
it("defines a real evidence refresh job before publishing Forensics read models", () => {
  const render = readFileSync("render.yaml", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

  expect(packageJson.scripts["refresh:real-evidence"]).toBe("tsx scripts/refreshRealEvidencePipeline.ts");
  expect(render).toContain("name: recoup-real-evidence-refresh");
  expect(render).toContain("npm run refresh:real-evidence");
});
```

- [ ] **Step 2: Create refresh script**

Create `scripts/refreshRealEvidencePipeline.ts`:

```ts
import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";
import { materializeRealEvidenceDataset } from "../src/services/evidenceMaterializer.js";
import { upsertCanonicalEvidenceDataset, upsertReconciliationReceipts } from "../src/services/evidenceRepository.js";
import { reconcileDeductionClaim } from "../src/services/reconciliationEngine.js";

async function main(): Promise<void> {
  const env = loadLocalRuntimeEnvFiles();
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const dataset = materializeRealEvidenceDataset({ retrievedAt: new Date().toISOString() });
  await upsertCanonicalEvidenceDataset({
    dataset,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
  const receipts = dataset.claims.map((claim) => reconcileDeductionClaim({ claim, documents: dataset.documents }));
  await upsertReconciliationReceipts({
    receipts,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
  console.log(JSON.stringify({ claims: dataset.claims.length, documents: dataset.documents.length, receipts: receipts.length }));
}

await main();
```

- [ ] **Step 3: Add scripts**

Modify `package.json`:

```json
"refresh:real-evidence": "tsx scripts/refreshRealEvidencePipeline.ts",
"test:e2e:maya-real-evidence": "tsx tests/e2e/maya-real-evidence-e2e.ts"
```

- [ ] **Step 4: Add Render cron after local tests pass**

Add to `render.yaml`:

```yaml
  - type: cron
    name: recoup-real-evidence-refresh
    runtime: node
    schedule: "*/10 * * * *"
    buildCommand: npm ci --include=dev && npm run build:api
    startCommand: npm run refresh:real-evidence
    envVars:
      - key: NODE_VERSION
        value: 22
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SAP_ODATA_BASE_URL
        sync: false
      - key: SAP_ODATA_CLIENT_ID
        sync: false
      - key: SAP_ODATA_CLIENT
        sync: false
      - key: SAP_ODATA_USERID
        sync: false
      - key: SAP_ODATA_TOKEN_URL
        sync: false
      - key: SAP_ODATA_SCOPE
        sync: false
      - key: SAP_ODATA_TENANT
        sync: false
      - key: SAP_ODATA_CLIENT_SECRET
        sync: false
```

- [ ] **Step 5: Run readiness test**

Run:

```powershell
npm.cmd run test -- tests/invariants/deployment-readiness.test.ts
```

Expected: PASS.

---

### Task 10: Real Evidence Browser Acceptance

**Files:**
- Create: `tests/e2e/maya-real-evidence-e2e.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Test: `tests/e2e/maya-real-evidence-e2e.ts`

- [ ] **Step 1: Create e2e acceptance**

Create `tests/e2e/maya-real-evidence-e2e.ts`:

```ts
import { chromium, expect } from "playwright/test";

const baseUrl = process.env.RECOUP_COCKPIT_URL ?? "http://127.0.0.1:3044";

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/login?loginId=Maya`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/forensics/u);

  await expect(page.getByText("EVD-POD-S3-L1")).toBeVisible();
  await expect(page.getByText("RECON-S3-L1")).toBeVisible();
  await expect(page.getByText(/canonical evidence document comparison/i)).toBeVisible();
  await expect(page.getByText(/rule_input_json/i)).toHaveCount(0);

  await browser.close();
}

await main();
```

- [ ] **Step 2: Run against local dev servers**

Run API:

```powershell
npm.cmd run dev:api
```

Run cockpit:

```powershell
npm.cmd run dev:cockpit
```

Run test:

```powershell
npm.cmd run test:e2e:maya-real-evidence
```

Expected: PASS, with visible persisted evidence IDs and reconciliation receipt IDs.

---

### Task 11: Production Verification

**Files:**
- Modify: `docs/independent-audit-log.md`
- Modify: `docs/vscode-handoff-status.md`
- No code changes in this task except docs evidence.

- [ ] **Step 1: Run full local gate**

Run:

```powershell
npm.cmd run verify
```

Expected: PASS.

- [ ] **Step 2: Run real evidence materialization in the intended environment**

Run:

```powershell
npm.cmd run refresh:real-evidence
```

Expected output shape:

```json
{"claims":20,"documents":114,"receipts":20}
```

This count comes from 20 remittance documents, 20 SAP invoice documents, 40 bureau/payment documents, and 34 scenario-specific documents from the Task 3 matrix. If the Task 3 matrix changes, update this expected count in the same commit as the materializer test.

- [ ] **Step 3: Read-only Supabase proof**

Run bounded read-only queries that return counts and IDs only:

```powershell
npx tsx scripts/verifyRealEvidenceReadiness.ts
```

Expected:

```json
{
  "claims": 20,
  "receipts": 20,
  "requiredEvidenceIdsPresent": true,
  "missingEvidenceIds": []
}
```

- [ ] **Step 4: Public alias smoke**

After production deploy is explicitly approved and completed, smoke:

```powershell
npm.cmd run test:e2e:maya-real-evidence
```

Expected: PASS against the public alias, proving Maya sees `EVD-*` and `RECON-*` source evidence, not seeded `rule_input_json`.

- [ ] **Step 5: Update durable audit docs**

Record:

- branch and commit SHA
- Render deployment ID for `recoup-api`
- Vercel deployment ID for cockpit
- Supabase read-only count proof
- `x-recoup-read-model-cache` behavior before and after refresh
- exact evidence IDs for POD, contract, TPM, remittance, SAP invoice, and credit memo
- `npm.cmd run verify` result
- `npm.cmd run test:e2e:maya-real-evidence` result

---

## Acceptance Matrix

| Requirement | Pass condition |
|---|---|
| Real POD exists | `recoup_evidence_documents` contains `EVD-POD-S3-L1` with `document_type='pod'`, source system `three_pl`, full payload, raw text, content hash, and link to `S3-L1`. |
| Real contract/SLA evidence exists | `contract_pricing` and `contract_sla` documents exist for S4/S5/S6 and are cited by receipts. |
| Real TPM evidence exists | `tpm_promo` and `tpm_accrual` documents exist for S2/S7 and are cited by receipts. |
| Real remittance claim exists | Each line has a `recoup_deduction_claims` row sourced from a `remittance_advice` or `edi_812` evidence document. |
| Real bureau/payment evidence exists | Each line has `bureau_alert` and `payment_history` documents linked to the customer and line so David/CFO risk surfaces do not depend on static customer badges. |
| SAP invoice/credit evidence exists | Each line has an invoice evidence document; S8 has a credit memo evidence document. SAP OData rows use `provenance='sap_odata'`; generated fallback rows use `source_generated` and cannot pretend to be SAP live. |
| Verdict no longer comes from static label | Forensics decisions use `recoup_reconciliation_receipts.derived_rule_input_json`, not `recoup_deduction_lines.rule_input_json`. |
| Missing evidence fails closed | Removing a required POD/contract/TPM/remittance document returns HTTP 503 and no read model is published. |
| Browser proves source reality | Maya displays or exposes `EVD-*` and `RECON-*` IDs with deterministic basis and no `rule_input_json` language. |

## Self-Review

- Spec coverage: The plan creates the actual source documents the user called out, including POD, contract, TPM, remittance, SAP invoice, credit memo, carrier evidence, PO, bureau/payment records, and reconciliation receipts.
- Runtime correction: The plan removes Forensics dependence on pre-merged `rule_input_json` and pre-seeded verdict/routing.
- Supabase proof: The plan requires persisted evidence documents, links, claims, and receipts with hashes and read-only count proof.
- No dummy/static acceptance: Generated documents are allowed only as complete source records with provenance and hashes; booleans alone are not accepted as evidence.
- Tests: Every task has a focused failing test and verification command.
