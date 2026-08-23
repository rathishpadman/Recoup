-- Cash Application Agent Workspace - additive Supabase schema contract
--
-- Source: Technical Design 7.1 (migration strategy), 7.2 (tables), 7.4 (RLS/grants).
-- Repeatable and additive. Apply through a separately approved Supabase migration.
--
-- STATUS: D-10 is UNRATIFIED. Table shapes below follow the Technical Design
-- narrative; column-level details not specified there are implementer
-- assumptions and are registered in
-- docs/evidence/2026-08-22-cash-application-phase-0-evidence-record.md.
-- Do not apply to production before D-10 is signed.
--
-- Existing rows, grants, RLS policies, columns and the run_control payload are
-- not rewritten by this file. The only change to an existing object is the
-- explicitly reviewed atomic replacement of the recoup_config key CHECK.

-- ---------------------------------------------------------------------------
-- 1. Inbound mail intake
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_cash_inbox (
  inbox_id           text PRIMARY KEY,
  provider           text NOT NULL,
  provider_event_id  text NOT NULL,
  message_id         text NOT NULL,
  sender_hash        text NOT NULL,
  recipient          text NOT NULL,
  received_at        timestamptz NOT NULL,
  subject_sanitized  text NOT NULL CHECK (char_length(subject_sanitized) <= 1000),
  body_content_hash  text NOT NULL,
  provenance_mode    text NOT NULL CHECK (provenance_mode IN ('live', 'replay', 'synthetic')),
  status             text NOT NULL CHECK (status IN ('received', 'accepted', 'rejected', 'quarantined')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recoup_cash_inbox_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_recoup_cash_inbox_message ON recoup_cash_inbox (message_id);

-- No provider secret and no raw signature is stored. sender_hash avoids broad
-- raw sender exposure; body_content_hash means the raw body is never required
-- here.

-- ---------------------------------------------------------------------------
-- 2. Attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_cash_attachments (
  attachment_id    text PRIMARY KEY,
  inbox_id         text NOT NULL REFERENCES recoup_cash_inbox (inbox_id),
  object_ref       text NOT NULL,
  content_hash     text NOT NULL,
  detected_mime    text NOT NULL,
  size_bytes       bigint NOT NULL CHECK (size_bytes >= 0),
  scan_status      text NOT NULL CHECK (scan_status IN ('pending', 'clean', 'unsafe', 'error', 'unavailable')),
  scan_policy_version text NOT NULL,
  quarantine_reason   text,
  retention_state     text NOT NULL CHECK (retention_state IN ('retained', 'purged')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recoup_cash_attachments_canonical UNIQUE (inbox_id, content_hash, object_ref)
);

-- ---------------------------------------------------------------------------
-- 3. Canonical remittance advice
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_cash_remittances (
  remittance_id             text PRIMARY KEY,
  inbox_id                  text NOT NULL REFERENCES recoup_cash_inbox (inbox_id),
  customer_reference        text NOT NULL,
  legal_entity_reference    text NOT NULL,
  payment_reference         text NOT NULL,
  currency                  text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  instructed_payment_amount numeric NOT NULL CHECK (instructed_payment_amount >= 0),
  mapper_version            text NOT NULL,
  provenance_mode           text NOT NULL CHECK (provenance_mode IN ('live', 'replay', 'synthetic')),
  source_record_ids         jsonb NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_cash_remittance_lines (
  line_id                     text PRIMARY KEY,
  remittance_id               text NOT NULL REFERENCES recoup_cash_remittances (remittance_id),
  invoice_reference           text NOT NULL,
  instructed_amount           numeric NOT NULL CHECK (instructed_amount >= 0),
  claimed_deduction_amount    numeric NOT NULL CHECK (claimed_deduction_amount >= 0),
  claimed_reason_code         text,
  claimed_reason_text_sanitized text CHECK (char_length(claimed_reason_text_sanitized) <= 1000),
  source_record_ids           jsonb NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- The mapper never populates a validated reason. Claimed and validated reasons
-- are deliberately separate columns in separate tables so a claim cannot be
-- mistaken for a determination.

CREATE INDEX IF NOT EXISTS idx_recoup_cash_remittance_lines_remittance
  ON recoup_cash_remittance_lines (remittance_id);

-- ---------------------------------------------------------------------------
-- 4. CashReceipt evidence snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_cash_receipts (
  receipt_id               text PRIMARY KEY,
  source_system            text NOT NULL,
  source_record_id         text NOT NULL,
  payment_reference        text NOT NULL,
  customer_reference       text NOT NULL,
  legal_entity_reference   text NOT NULL,
  amount_received          numeric NOT NULL CHECK (amount_received >= 0),
  currency                 text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  settlement_status        text NOT NULL CHECK (settlement_status IN ('settled', 'pending', 'reversed', 'unknown')),
  value_date               date NOT NULL,
  observed_at              timestamptz NOT NULL,
  retrieved_at             timestamptz NOT NULL,
  freshness_policy_version text NOT NULL,
  freshness_status         text NOT NULL CHECK (freshness_status IN ('fresh', 'stale', 'unknown')),
  source_payload_hash      text NOT NULL,
  record_ids               jsonb NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- This table is evidence of a read, not an ERP mutation. Nothing here is
-- written back to any source system.

-- ---------------------------------------------------------------------------
-- 5. Immutable allocation receipts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_cash_allocations (
  allocation_id          text PRIMARY KEY,
  idempotency_key        text NOT NULL,
  receipt_id             text NOT NULL REFERENCES recoup_cash_receipts (receipt_id),
  remittance_id          text NOT NULL REFERENCES recoup_cash_remittances (remittance_id),
  supersedes_allocation_id text REFERENCES recoup_cash_allocations (allocation_id),
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  currency               text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  receipt_amount         numeric NOT NULL CHECK (receipt_amount >= 0),
  total_applied_amount   numeric NOT NULL CHECK (total_applied_amount >= 0),
  total_deduction_amount numeric NOT NULL CHECK (total_deduction_amount >= 0),
  total_unapplied_amount numeric NOT NULL,
  reconciliation_status  text NOT NULL CHECK (reconciliation_status IN ('balanced', 'imbalanced')),
  policy_version         text NOT NULL,
  calculation_version    text NOT NULL,
  record_ids             jsonb NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recoup_cash_allocations_idempotent UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS recoup_cash_allocation_lines (
  allocation_line_id text PRIMARY KEY,
  allocation_id      text NOT NULL REFERENCES recoup_cash_allocations (allocation_id),
  remittance_line_id text NOT NULL REFERENCES recoup_cash_remittance_lines (line_id),
  invoice_record_id  text NOT NULL,
  invoice_balance_before numeric NOT NULL,
  applied_amount     numeric NOT NULL CHECK (applied_amount >= 0),
  explicit_deduction_amount numeric NOT NULL CHECK (explicit_deduction_amount >= 0),
  invoice_balance_after_internal_allocation numeric NOT NULL,
  record_ids         jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recoup_cash_allocation_lines_allocation
  ON recoup_cash_allocation_lines (allocation_id);

-- A correction creates a new version linked through supersedes_allocation_id.
-- An existing receipt is never mutated into a different result.

-- ---------------------------------------------------------------------------
-- 6. Live deduction cases
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_live_deduction_cases (
  case_id             text PRIMARY KEY,
  origin              text NOT NULL CHECK (origin = 'live_cash_application'),
  run_id              text NOT NULL,
  customer_id         text NOT NULL,
  legal_entity_id     text NOT NULL,
  invoice_record_ids  jsonb NOT NULL,
  remittance_id       text NOT NULL REFERENCES recoup_cash_remittances (remittance_id),
  receipt_id          text NOT NULL REFERENCES recoup_cash_receipts (receipt_id),
  allocation_id       text NOT NULL REFERENCES recoup_cash_allocations (allocation_id),
  claimed_reason      text NOT NULL,
  validated_reason    text NOT NULL CHECK (validated_reason = 'DEP'),
  short_payment_amount numeric NOT NULL CHECK (short_payment_amount >= 0),
  currency            text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status              text NOT NULL,
  policy_versions     jsonb NOT NULL,
  record_ids          jsonb NOT NULL,
  provenance_mode     text NOT NULL CHECK (provenance_mode IN ('live', 'replay', 'synthetic')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- There is deliberately NO scenario_id column and no foreign key to any S1-S8
-- scenario table. SA-CA-03: live cases never alter S1-S8 storage, enums or gold
-- totals. A live case is not S09.

CREATE INDEX IF NOT EXISTS idx_recoup_live_deduction_cases_run
  ON recoup_live_deduction_cases (run_id);

-- ---------------------------------------------------------------------------
-- 7. Workflow runs, events, outbox and agent projection
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recoup_workflow_runs (
  run_id           text PRIMARY KEY,
  workflow_name    text NOT NULL CHECK (workflow_name = 'cash_application_to_maya'),
  workflow_version text NOT NULL,
  trigger_type     text NOT NULL CHECK (trigger_type IN ('live_email', 'replay_email', 'synthetic_email')),
  trigger_record_id text NOT NULL,
  correlation_id   text NOT NULL,
  state            text NOT NULL,
  current_phase    text NOT NULL,
  customer_reference text,
  case_id          text REFERENCES recoup_live_deduction_cases (case_id),
  provenance_mode  text NOT NULL CHECK (provenance_mode IN ('live', 'replay', 'synthetic')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  terminal_at      timestamptz
);

CREATE TABLE IF NOT EXISTS recoup_workflow_events (
  cursor_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        text NOT NULL UNIQUE,
  run_id          text NOT NULL REFERENCES recoup_workflow_runs (run_id),
  run_sequence    integer NOT NULL CHECK (run_sequence >= 1),
  correlation_id  text NOT NULL,
  case_id         text,
  event_type      text NOT NULL,
  phase           text NOT NULL,
  specialist      text,
  status          text NOT NULL,
  safe_summary    text NOT NULL CHECK (char_length(safe_summary) <= 1000),
  record_ids      jsonb NOT NULL,
  deterministic_basis_ref text,
  provenance_mode text NOT NULL CHECK (provenance_mode IN ('live', 'replay', 'synthetic')),
  occurred_at     timestamptz NOT NULL,
  CONSTRAINT recoup_workflow_events_run_sequence UNIQUE (run_id, run_sequence)
);

CREATE INDEX IF NOT EXISTS idx_recoup_workflow_events_run ON recoup_workflow_events (run_id);

CREATE TABLE IF NOT EXISTS recoup_workflow_outbox (
  command_id       text PRIMARY KEY,
  idempotency_key  text NOT NULL,
  run_id           text NOT NULL REFERENCES recoup_workflow_runs (run_id),
  command_type     text NOT NULL,
  status           text NOT NULL CHECK (status IN ('claimable', 'leased', 'completed', 'dead_letter')),
  available_at     timestamptz NOT NULL,
  lease_owner      text,
  lease_expires_at timestamptz,
  attempt          integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  wake_reason      text,
  prior_source_query_receipt jsonb,
  retry_target     text,
  dead_letter_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recoup_workflow_outbox_idempotent UNIQUE (idempotency_key)
);

-- Partial index so due work is found without scanning completed history.
CREATE INDEX IF NOT EXISTS idx_recoup_workflow_outbox_due
  ON recoup_workflow_outbox (available_at)
  WHERE status = 'claimable';

CREATE TABLE IF NOT EXISTS recoup_agent_run_state (
  run_id            text NOT NULL REFERENCES recoup_workflow_runs (run_id),
  specialist_name   text NOT NULL,
  status            text NOT NULL,
  current_phase     text NOT NULL,
  last_event_cursor bigint,
  started_at        timestamptz,
  completed_at      timestamptz,
  blocker_code      text,
  PRIMARY KEY (run_id, specialist_name)
);

-- A rebuildable projection. It contains no autonomous business decision.

-- ---------------------------------------------------------------------------
-- 8. RLS and grants (Technical Design 7.4)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  cash_table text;
BEGIN
  FOREACH cash_table IN ARRAY ARRAY[
    'recoup_cash_inbox',
    'recoup_cash_attachments',
    'recoup_cash_remittances',
    'recoup_cash_remittance_lines',
    'recoup_cash_receipts',
    'recoup_cash_allocations',
    'recoup_cash_allocation_lines',
    'recoup_live_deduction_cases',
    'recoup_workflow_runs',
    'recoup_workflow_events',
    'recoup_workflow_outbox',
    'recoup_agent_run_state'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', cash_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', cash_table);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated, service_role', cash_table);
    EXECUTE format('GRANT SELECT ON TABLE %I TO service_role', cash_table);
  END LOOP;
END
$$;

-- Writes go through narrowly scoped RPCs where an atomic multi-table boundary
-- is required. UPDATE and DELETE on the event log are granted to nobody, which
-- is what makes the log append-only in the database and not only in code.
GRANT INSERT ON TABLE recoup_workflow_events TO service_role;
GRANT INSERT, UPDATE ON TABLE recoup_workflow_runs TO service_role;
GRANT INSERT, UPDATE ON TABLE recoup_workflow_outbox TO service_role;
GRANT INSERT, UPDATE ON TABLE recoup_agent_run_state TO service_role;
GRANT INSERT ON TABLE recoup_cash_inbox TO service_role;
GRANT INSERT, UPDATE ON TABLE recoup_cash_attachments TO service_role;
GRANT INSERT ON TABLE recoup_cash_remittances TO service_role;
GRANT INSERT ON TABLE recoup_cash_remittance_lines TO service_role;
GRANT INSERT ON TABLE recoup_cash_receipts TO service_role;
GRANT INSERT ON TABLE recoup_cash_allocations TO service_role;
GRANT INSERT ON TABLE recoup_cash_allocation_lines TO service_role;
GRANT INSERT, UPDATE ON TABLE recoup_live_deduction_cases TO service_role;

-- Cockpit browser roles and anonymous/authenticated roles get no direct table
-- access at all; the REVOKE above is the whole grant for them.

-- ---------------------------------------------------------------------------
-- 9. recoup_config key CHECK widening (Technical Design 7.1)
-- ---------------------------------------------------------------------------
--
-- The only change to an existing table. Production carries a generated
-- five-key-style constraint from src/memory/supabaseStore.ts, and rerunning
-- CREATE TABLE IF NOT EXISTS does not update it. Fresh and migrated databases
-- must converge on the explicit name recoup_config_key_check.
--
-- Preflight aborts on an unknown shape rather than guessing.

DO $$
DECLARE
  prior_constraint_name text;
  prior_definition      text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid)
    INTO prior_constraint_name, prior_definition
    FROM pg_constraint
   WHERE conrelid = 'recoup_config'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%key%IN%';

  IF prior_constraint_name IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: no recoup_config key CHECK found; aborting rather than guessing.';
  END IF;

  IF prior_definition NOT ILIKE '%run_control%' THEN
    RAISE EXCEPTION 'Preflight failed: unexpected recoup_config key CHECK shape: %', prior_definition;
  END IF;

  IF prior_definition ILIKE '%cash_run_control%' THEN
    RAISE NOTICE 'cash_run_control already permitted; nothing to widen.';
    RETURN;
  END IF;

  -- 1. add the widened constraint NOT VALID
  EXECUTE $ddl$
    ALTER TABLE recoup_config
      ADD CONSTRAINT recoup_config_key_check_v2
      CHECK (key IN (
        'arbitration_weights', 'r_score_weights', 'r_drift', 'gaming_gate',
        'partial_hold', 'accuracy_bars', 'risk_mesh_cases', 'seed',
        'run_control', 'release_eval_label_manifest', 'intent_eval_labels',
        'arbitration_eval_labels', 'decision_confidence_threshold',
        'cash_run_control'
      )) NOT VALID
  $ddl$;

  -- 2. validate against existing rows
  EXECUTE 'ALTER TABLE recoup_config VALIDATE CONSTRAINT recoup_config_key_check_v2';

  -- 3. drop only the discovered prior CHECK
  EXECUTE format('ALTER TABLE recoup_config DROP CONSTRAINT %I', prior_constraint_name);

  -- 4. converge on the explicit final name
  EXECUTE 'ALTER TABLE recoup_config RENAME CONSTRAINT recoup_config_key_check_v2 TO recoup_config_key_check';
END
$$;

-- 5. The approved optional cash_run_control row is inserted only after the
-- widened constraint is active, and only once D-13 is ratified. It is
-- deliberately NOT inserted by this file.
--
-- Existing rows, grants, RLS policies, columns and the run_control payload are
-- untouched. Feature rollback leaves the widened constraint in place; removing
-- evidence or config by down migration requires separate data-operation
-- approval, and no destructive down migration is permitted for workflow
-- evidence.

-- ---------------------------------------------------------------------------
-- Demo reset (MVP)
-- ---------------------------------------------------------------------------
-- The cash tables are append-only: service_role holds INSERT and SELECT and no
-- DELETE, which is what makes the ledger usable as an audit trail. Granting
-- DELETE to clear test data between cycles would trade that away permanently.
--
-- This function is the alternative: the single named door out, SECURITY
-- DEFINER and callable only by service_role, so the tables stay append-only for
-- every other caller and every other code path.
--
-- Each DELETE carries an explicit WHERE because Supabase refuses an unqualified
-- one (SQLSTATE 21000), a guard against exactly the accident this performs on
-- purpose.
--
-- MVP SCOPE. This clears ALL cash rows, since here every row is test data. It
-- must not follow the slice into an environment holding live customer cash.
CREATE OR REPLACE FUNCTION reset_cash_application_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counts jsonb := '{}'::jsonb;
  n integer;
BEGIN
  -- Children before parents, following the foreign keys. Runs reference cases,
  -- so runs are removed before cases.
  DELETE FROM recoup_agent_run_state WHERE true;        GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('agent_run_state', n);
  DELETE FROM recoup_workflow_events WHERE true;        GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('workflow_events', n);
  DELETE FROM recoup_workflow_outbox WHERE true;        GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('workflow_outbox', n);
  DELETE FROM recoup_workflow_runs WHERE true;          GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('workflow_runs', n);
  DELETE FROM recoup_live_deduction_cases WHERE true;   GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('live_deduction_cases', n);
  DELETE FROM recoup_cash_allocation_lines WHERE true;  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('allocation_lines', n);
  DELETE FROM recoup_cash_allocations WHERE true;       GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('allocations', n);
  DELETE FROM recoup_cash_remittance_lines WHERE true;  GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('remittance_lines', n);
  DELETE FROM recoup_cash_remittances WHERE true;       GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('remittances', n);
  DELETE FROM recoup_cash_attachments WHERE true;       GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('attachments', n);
  DELETE FROM recoup_cash_receipts WHERE true;          GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('receipts', n);
  DELETE FROM recoup_cash_inbox WHERE true;             GET DIAGNOSTICS n = ROW_COUNT;
  counts := counts || jsonb_build_object('inbox', n);
  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION reset_cash_application_demo_data() FROM public;
REVOKE ALL ON FUNCTION reset_cash_application_demo_data() FROM anon;
REVOKE ALL ON FUNCTION reset_cash_application_demo_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION reset_cash_application_demo_data() TO service_role;
