import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("docs/supabase-cash-application-schema.sql", "utf8");

const cashTables = [
  "recoup_cash_inbox",
  "recoup_cash_attachments",
  "recoup_cash_remittances",
  "recoup_cash_remittance_lines",
  "recoup_cash_receipts",
  "recoup_cash_allocations",
  "recoup_cash_allocation_lines",
  "recoup_live_deduction_cases",
  "recoup_workflow_runs",
  "recoup_workflow_events",
  "recoup_workflow_outbox",
  "recoup_agent_run_state"
];

describe("cash application schema contract (TDD 7.1, 7.2, 7.4)", () => {
  it.each(cashTables)("declares %s additively", (table) => {
    expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  });

  it("enables and forces RLS on every cash table", () => {
    expect(schema).toContain("ENABLE ROW LEVEL SECURITY");
    expect(schema).toContain("FORCE ROW LEVEL SECURITY");
    for (const table of cashTables) {
      expect(schema).toContain(`'${table}'`);
    }
  });

  it("revokes public, anon, authenticated and service_role before granting", () => {
    expect(schema).toContain(
      "REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated, service_role"
    );
    const revokeAt = schema.indexOf("REVOKE ALL ON TABLE");
    const grantAt = schema.indexOf("GRANT SELECT ON TABLE %I TO service_role");
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
  });

  it("never grants UPDATE or DELETE on the append-only event log", () => {
    const eventGrants = schema
      .split("\n")
      .filter((line) => line.startsWith("GRANT") && line.includes("recoup_workflow_events"));
    expect(eventGrants.length).toBeGreaterThan(0);
    for (const grant of eventGrants) {
      expect(grant).not.toContain("UPDATE");
      expect(grant).not.toContain("DELETE");
    }
  });

  it("grants DELETE on no cash table at all", () => {
    expect(schema).not.toMatch(/GRANT[^;]*DELETE/u);
  });

  it("gives the live case table no scenario id column or foreign key", () => {
    const start = schema.indexOf("CREATE TABLE IF NOT EXISTS recoup_live_deduction_cases");
    const caseTable = schema.slice(start, schema.indexOf("\n);", start));
    expect(caseTable).not.toMatch(/scenario/iu);
    expect(caseTable).toContain("origin = 'live_cash_application'");
  });

  it("enforces one logical command and one allocation through unique keys", () => {
    expect(schema).toContain("recoup_workflow_outbox_idempotent UNIQUE (idempotency_key)");
    expect(schema).toContain("recoup_cash_allocations_idempotent UNIQUE (idempotency_key)");
    expect(schema).toContain("recoup_workflow_events_run_sequence UNIQUE (run_id, run_sequence)");
    expect(schema).toContain("recoup_cash_inbox_provider_event UNIQUE (provider, provider_event_id)");
  });

  it("indexes due outbox work partially so completed history is not scanned", () => {
    expect(schema).toContain("WHERE status = 'claimable'");
  });

  it("uses numeric for every monetary column, never float or double", () => {
    expect(schema).not.toMatch(/\b(float|double precision|real)\b/iu);
    const normalized = schema.replace(/[ \t]+/gu, " ");
    expect(normalized).toContain("amount_received numeric");
    expect(normalized).toContain("applied_amount numeric");
  });

  it("bounds every free-text column that could accumulate customer prose", () => {
    expect(schema).toContain("char_length(subject_sanitized) <= 1000");
    expect(schema).toContain("char_length(claimed_reason_text_sanitized) <= 1000");
    expect(schema).toContain("char_length(safe_summary) <= 1000");
  });

  it("permits only DEP as a validated reason at the database boundary", () => {
    expect(schema.replace(/[ \t]+/gu, " ")).toContain(
      "validated_reason text NOT NULL CHECK (validated_reason = 'DEP')"
    );
  });

  it("preflights the config key CHECK and aborts on an unknown shape", () => {
    expect(schema).toContain("Preflight failed: no recoup_config key CHECK found");
    expect(schema).toContain("Preflight failed: unexpected recoup_config key CHECK shape");
  });

  it("widens the config CHECK in the documented five-step order", () => {
    const addAt = schema.indexOf("recoup_config_key_check_v2");
    const validateAt = schema.indexOf("VALIDATE CONSTRAINT recoup_config_key_check_v2");
    const dropAt = schema.indexOf("DROP CONSTRAINT %I");
    const renameAt = schema.indexOf("RENAME CONSTRAINT recoup_config_key_check_v2");
    expect(addAt).toBeLessThan(validateAt);
    expect(validateAt).toBeLessThan(dropAt);
    expect(dropAt).toBeLessThan(renameAt);
  });

  it("carries every current governed config key into the widened constraint", () => {
    for (const key of [
      "arbitration_weights",
      "r_score_weights",
      "r_drift",
      "gaming_gate",
      "partial_hold",
      "accuracy_bars",
      "risk_mesh_cases",
      "seed",
      "run_control",
      "release_eval_label_manifest",
      "intent_eval_labels",
      "arbitration_eval_labels",
      "decision_confidence_threshold",
      "cash_run_control"
    ]) {
      expect(schema).toContain(`'${key}'`);
    }
  });

  it("does not insert the cash_run_control row, which D-13 still owns", () => {
    expect(schema).not.toMatch(/INSERT INTO recoup_config/u);
  });

  it("performs no destructive change beyond the reviewed constraint swap", () => {
    expect(schema).not.toMatch(/DROP TABLE/iu);
    expect(schema).not.toMatch(/DROP COLUMN/iu);
    expect(schema).not.toMatch(/TRUNCATE/iu);
    const dropConstraints = schema.match(/DROP CONSTRAINT/gu) ?? [];
    expect(dropConstraints).toHaveLength(1);
  });

  it("does not append cash tables to the consolidated memory schema", () => {
    const memorySchema = readFileSync("docs/supabase-memory-schema.sql", "utf8");
    expect(memorySchema).not.toContain("recoup_cash_inbox");
    expect(memorySchema).not.toContain("recoup_live_deduction_cases");
  });

  it("states that D-10 is unratified so nobody applies it to production early", () => {
    expect(schema).toContain("D-10 is UNRATIFIED");
  });
});
