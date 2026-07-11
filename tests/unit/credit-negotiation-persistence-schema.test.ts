import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/superpowers/plans/2026-07-09-david-credit-negotiation-supabase-migration.sql", "utf8");
const serializationRpcSqlPath =
  "docs/superpowers/plans/2026-07-11-david-credit-negotiation-serialization-rpcs.sql";
const serializationRpcSql = existsSync(serializationRpcSqlPath)
  ? readFileSync(serializationRpcSqlPath, "utf8")
  : "";

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

describe("David negotiation serialization RPC migration", () => {
  it("serializes outbound reservations and inbound counters by order", () => {
    expect(serializationRpcSql).toContain(
      "CREATE OR REPLACE FUNCTION public.recoup_reserve_credit_negotiation_send(p_send jsonb)"
    );
    expect(serializationRpcSql).toContain(
      "CREATE OR REPLACE FUNCTION public.recoup_insert_credit_counter_offer(p_counter jsonb)"
    );
    expect(serializationRpcSql).toContain(
      "CREATE OR REPLACE FUNCTION public.recoup_insert_credit_negotiation_inbound(p_inbound jsonb)"
    );
    expect(
      serializationRpcSql.match(
        /PERFORM pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(v_order_id, 0\)\);/gu
      )
    ).toHaveLength(3);
  });

  it("blocks reservations for unresolved email counters requiring human review", () => {
    expect(serializationRpcSql).toContain("FROM public.credit_negotiation_rounds AS negotiation_round");
    expect(serializationRpcSql).toContain("negotiation_round.status = 'human_review'");
    expect(serializationRpcSql).toContain("FROM public.credit_counter_offers AS counter_offer");
    expect(serializationRpcSql).toContain("FROM public.credit_negotiation_inbound_emails AS inbound_email");
    expect(serializationRpcSql).toContain("JOIN public.credit_negotiation_rounds AS negotiation_round");
    expect(serializationRpcSql).toContain("counter_offer.source = 'email'");
    expect(serializationRpcSql).toContain("counter_offer.status = 'human_review'");
    expect(serializationRpcSql).toContain(
      "negotiation_round.status IN ('drafted', 'sent', 'human_review')"
    );
    expect(serializationRpcSql).toContain(
      "jsonb_build_object('status', 'blocked_human_review')"
    );
  });

  it("resolves an existing reservation or inserts a pending send without regressing its round", () => {
    expect(serializationRpcSql).toContain(
      "pg_catalog.jsonb_build_object('status', 'existing', 'send', pg_catalog.to_jsonb(v_send))"
    );
    expect(serializationRpcSql).toContain("INSERT INTO public.credit_negotiation_rounds (");
    expect(serializationRpcSql).toContain("ON CONFLICT (round_id) DO NOTHING");
    expect(serializationRpcSql).not.toMatch(/ON CONFLICT \(round_id\) DO UPDATE/iu);
    expect(serializationRpcSql).toMatch(
      /INSERT INTO public\.credit_negotiation_rounds \([\s\S]*?\)\s*VALUES \(\s*v_action_id,/u
    );
    expect(serializationRpcSql).toContain("INSERT INTO public.credit_negotiation_sends (");
    expect(serializationRpcSql).toContain("'pending'");
    expect(serializationRpcSql).toContain(
      "pg_catalog.jsonb_build_object('status', 'reserved', 'send', pg_catalog.to_jsonb(v_send))"
    );

    const roundInsertIndex = serializationRpcSql.indexOf("INSERT INTO public.credit_negotiation_rounds (");
    const sendInsertIndex = serializationRpcSql.indexOf("INSERT INTO public.credit_negotiation_sends (");
    expect(roundInsertIndex).toBeGreaterThan(-1);
    expect(sendInsertIndex).toBeGreaterThan(roundInsertIndex);
  });

  it("inserts and returns the inbound counter under the serialized transaction", () => {
    expect(serializationRpcSql).toContain("INSERT INTO public.credit_negotiation_inbound_emails (");
    expect(serializationRpcSql).toContain("INSERT INTO public.credit_counter_offers (");
    expect(serializationRpcSql).toContain("RETURNING * INTO v_counter;");
    expect(serializationRpcSql).toContain("RETURN pg_catalog.to_jsonb(v_counter);");
  });

  it("exposes both security-definer RPCs only to service_role", () => {
    expect(serializationRpcSql.match(/SECURITY DEFINER/gu) ?? []).toHaveLength(3);
    expect(serializationRpcSql.match(/SET search_path = ''/gu) ?? []).toHaveLength(3);

    for (const functionName of [
      "recoup_reserve_credit_negotiation_send",
      "recoup_insert_credit_negotiation_inbound",
      "recoup_insert_credit_counter_offer"
    ]) {
      expect(serializationRpcSql).toContain(
        `REVOKE ALL ON FUNCTION public.${functionName}(jsonb) FROM PUBLIC, anon, authenticated, service_role;`
      );
      expect(serializationRpcSql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${functionName}(jsonb) TO service_role;`
      );
    }
  });
});
