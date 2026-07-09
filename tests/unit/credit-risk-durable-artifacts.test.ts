import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("David credit risk durable artifacts", () => {
  it("declares and seeds the governed credit evidence document table", () => {
    const schema = readFileSync("docs/supabase-credit-risk-schema.sql", "utf8");
    const seedScript = readFileSync("scripts/seedCreditRiskDataset.ts", "utf8");
    const dataset = JSON.parse(readFileSync("docs/Tools_data/credit_risk_dataset.json", "utf8")) as {
      evidenceDocuments?: unknown[];
    };

    expect(schema).toContain("create table if not exists credit_evidence_documents");
    expect(schema).toContain("record_ids jsonb not null");
    expect(seedScript).toContain("credit_evidence_documents?on_conflict=document_id");
    expect(seedScript).toContain("evidence_documents: dataset.evidenceDocuments.length");
    expect(dataset.evidenceDocuments).toHaveLength(4);
  });
});
