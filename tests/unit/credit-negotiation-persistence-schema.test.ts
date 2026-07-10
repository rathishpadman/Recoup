import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/superpowers/plans/2026-07-09-david-credit-negotiation-supabase-migration.sql", "utf8");

describe("David negotiation persistence schema", () => {
  it("declares durable email negotiation rounds, sends, counter-offers, and contacts", () => {
    for (const tableName of [
      "credit_negotiation_rounds",
      "credit_negotiation_sends",
      "credit_negotiation_inbound_emails",
      "credit_counter_offers",
      "credit_account_contacts"
    ]) {
      expect(sql).toContain(`create table if not exists ${tableName}`);
      expect(sql).toContain(`alter table ${tableName} enable row level security`);
    }

    expect(sql).toContain("idempotency_key text not null unique");
    expect(sql).toContain("body_fetch_status text not null check (body_fetch_status in ('fetched','failed'))");
    expect(sql).toContain("unique(email_id)");
    expect(sql).toContain("unique(account_id, role)");
  });

  it("forward-migrates legacy credit_deal_scenarios tables to the optimizer persistence contract", () => {
    for (const columnName of ["candidate_json", "objective_value", "ranked_position", "seed"]) {
      expect(sql).toContain(`alter table credit_deal_scenarios add column if not exists ${columnName}`);
    }
  });
});
