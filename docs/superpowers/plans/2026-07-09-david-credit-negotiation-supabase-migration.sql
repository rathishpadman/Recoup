-- David dynamic negotiation simulated-source migration.
-- Applied to Supabase project nmwfftudympcvcjtyjbf on 2026-07-09 for local/e2e proof.
-- These tables are read by the backend through the service-role source loader.
-- RLS is enabled and no anon/authenticated policies are created here.

create table if not exists credit_orders (
  order_id text primary key,
  account_id text not null references credit_accounts(account_id),
  order_amount numeric not null,
  gross_margin_pct numeric not null,
  units numeric not null,
  record_ids jsonb not null check (jsonb_typeof(record_ids) = 'array')
);

create table if not exists sim_cost_of_capital (
  account_id text primary key references credit_accounts(account_id),
  annual_bps numeric not null,
  record_ids jsonb not null check (jsonb_typeof(record_ids) = 'array')
);

create table if not exists sim_3pl_inventory (
  order_id text not null references credit_orders(order_id),
  scenario_id text not null,
  holding_days integer not null,
  holding_cost_per_unit_per_day numeric not null,
  record_ids jsonb not null check (jsonb_typeof(record_ids) = 'array'),
  primary key (order_id, scenario_id)
);

create table if not exists sim_pos_sellthrough (
  order_id text not null references credit_orders(order_id),
  scenario_id text not null,
  probability numeric not null,
  sell_through_pct numeric not null,
  record_ids jsonb not null check (jsonb_typeof(record_ids) = 'array'),
  primary key (order_id, scenario_id)
);

create table if not exists credit_deal_candidate_grid (
  candidate_id text primary key,
  release_pct numeric not null,
  deposit_pct numeric not null,
  tranche_count integer not null,
  collateral_ratio numeric not null,
  financing_spread_bps numeric not null,
  record_ids jsonb not null check (jsonb_typeof(record_ids) = 'array')
);

create table if not exists credit_negotiation_policy (
  key text primary key,
  value_text text not null,
  policy_version integer not null,
  record_id text not null unique,
  approved_by text not null,
  effective_from timestamptz not null,
  active boolean not null default true
);

create table if not exists credit_deal_scenarios (
  scenario_id text primary key,
  order_id text not null references credit_orders(order_id),
  candidate_id text not null,
  seed integer not null,
  candidate_json jsonb not null check (jsonb_typeof(candidate_json) = 'object'),
  objective_value numeric not null,
  ranked_position integer not null,
  optimizer_run_id text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  source_record_ids jsonb not null check (jsonb_typeof(source_record_ids) = 'array'),
  payload_json jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  created_at timestamptz not null default now(),
  unique(order_id, source_hash, policy_hash, seed, ranked_position)
);

alter table credit_deal_scenarios add column if not exists candidate_id text;
alter table credit_deal_scenarios add column if not exists seed integer;
alter table credit_deal_scenarios add column if not exists candidate_json jsonb;
alter table credit_deal_scenarios add column if not exists objective_value numeric;
alter table credit_deal_scenarios add column if not exists ranked_position integer;
alter table credit_deal_scenarios add column if not exists payload_json jsonb not null default '{}'::jsonb;

create table if not exists credit_negotiation_rounds (
  round_id text primary key,
  order_id text not null references credit_orders(order_id),
  account_id text not null references credit_accounts(account_id),
  round_no integer not null check (round_no > 0),
  status text not null check (status in ('drafted','sent','countered','human_review','accepted','rejected','withdrawn','closed')),
  our_proposal_json jsonb not null default '{}'::jsonb check (jsonb_typeof(our_proposal_json) = 'object'),
  their_counter_json jsonb check (their_counter_json is null or jsonb_typeof(their_counter_json) = 'object'),
  approved_action_id text,
  inbound_email_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, round_no)
);

create table if not exists credit_negotiation_sends (
  send_id text primary key default gen_random_uuid()::text,
  round_id text not null references credit_negotiation_rounds(round_id),
  action_id text not null,
  account_id text not null references credit_accounts(account_id),
  order_id text not null references credit_orders(order_id),
  round_no integer not null check (round_no > 0),
  approved_body_hash text not null check (approved_body_hash ~ '^[a-f0-9]{64}$'),
  sent_body_hash text check (sent_body_hash is null or sent_body_hash ~ '^[a-f0-9]{64}$'),
  provider_email_id text,
  idempotency_key text not null unique,
  from_email text not null,
  reply_to_email text not null,
  to_email text not null,
  subject text not null,
  principal text,
  status text not null check (status in ('pending','sent','failed')),
  reserved_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(action_id)
);

create table if not exists credit_negotiation_inbound_emails (
  inbound_email_id text primary key default gen_random_uuid()::text,
  round_id text not null references credit_negotiation_rounds(round_id),
  account_id text not null references credit_accounts(account_id),
  order_id text not null references credit_orders(order_id),
  round_no integer not null check (round_no > 0),
  email_id text not null,
  message_id text,
  from_email text not null,
  to_email text not null,
  subject text not null,
  source text not null check (source in ('email')),
  raw_body_hash text not null check (raw_body_hash ~ '^[a-f0-9]{64}$'),
  text_body_hash text check (text_body_hash is null or text_body_hash ~ '^[a-f0-9]{64}$'),
  body_fetch_status text not null check (body_fetch_status in ('fetched','failed')),
  created_at timestamptz not null default now(),
  unique(email_id)
);

create table if not exists credit_counter_offers (
  counter_offer_id text primary key default gen_random_uuid()::text,
  round_id text not null references credit_negotiation_rounds(round_id),
  account_id text not null references credit_accounts(account_id),
  order_id text not null references credit_orders(order_id),
  source text not null check (source in ('email','manual')),
  email_id text,
  message_id text,
  cited_spans_json jsonb not null default '[]'::jsonb check (jsonb_typeof(cited_spans_json) = 'array'),
  extracted_terms_json jsonb not null default '{}'::jsonb check (jsonb_typeof(extracted_terms_json) = 'object'),
  parse_reason text,
  status text not null check (status in ('grammar_valid','human_review')),
  created_at timestamptz not null default now(),
  unique(email_id)
);

create table if not exists credit_account_contacts (
  account_id text not null references credit_accounts(account_id),
  contact_email text not null,
  contact_name text not null,
  role text not null default 'ap',
  created_at timestamptz not null default now(),
  primary key (account_id, role),
  unique(account_id, role)
);

alter table credit_orders enable row level security;
alter table sim_cost_of_capital enable row level security;
alter table sim_3pl_inventory enable row level security;
alter table sim_pos_sellthrough enable row level security;
alter table credit_deal_candidate_grid enable row level security;
alter table credit_negotiation_policy enable row level security;
alter table credit_deal_scenarios enable row level security;
alter table credit_negotiation_rounds enable row level security;
alter table credit_negotiation_sends enable row level security;
alter table credit_negotiation_inbound_emails enable row level security;
alter table credit_counter_offers enable row level security;
alter table credit_account_contacts enable row level security;

insert into credit_orders (order_id, account_id, order_amount, gross_margin_pct, units, record_ids)
values
  ('ORD-HARBOR-6534', 'ACC-HAR', 640010.00, 0.18, 1000, '["credit_orders:ORD-HARBOR-6534"]'::jsonb)
on conflict (order_id) do update set
  account_id = excluded.account_id,
  gross_margin_pct = excluded.gross_margin_pct,
  order_amount = excluded.order_amount,
  record_ids = excluded.record_ids,
  units = excluded.units;

insert into sim_cost_of_capital (account_id, annual_bps, record_ids)
values
  ('ACC-HAR', 900, '["sim_cost_of_capital:ACC-HAR:2026-01"]'::jsonb)
on conflict (account_id) do update set
  annual_bps = excluded.annual_bps,
  record_ids = excluded.record_ids;

insert into sim_3pl_inventory (order_id, scenario_id, holding_days, holding_cost_per_unit_per_day, record_ids)
values
  ('ORD-HARBOR-6534', 'base-sellthrough', 30, 0.75, '["sim_3pl_inventory:ORD-HARBOR-6534:base"]'::jsonb),
  ('ORD-HARBOR-6534', 'upside-sellthrough', 21, 0.75, '["sim_3pl_inventory:ORD-HARBOR-6534:upside"]'::jsonb)
on conflict (order_id, scenario_id) do update set
  holding_cost_per_unit_per_day = excluded.holding_cost_per_unit_per_day,
  holding_days = excluded.holding_days,
  record_ids = excluded.record_ids;

insert into sim_pos_sellthrough (order_id, scenario_id, probability, sell_through_pct, record_ids)
values
  ('ORD-HARBOR-6534', 'base-sellthrough', 0.60, 0.80, '["sim_pos_sellthrough:ORD-HARBOR-6534:base"]'::jsonb),
  ('ORD-HARBOR-6534', 'upside-sellthrough', 0.40, 0.95, '["sim_pos_sellthrough:ORD-HARBOR-6534:upside"]'::jsonb)
on conflict (order_id, scenario_id) do update set
  probability = excluded.probability,
  record_ids = excluded.record_ids,
  sell_through_pct = excluded.sell_through_pct;

insert into credit_deal_candidate_grid (
  candidate_id,
  release_pct,
  deposit_pct,
  tranche_count,
  collateral_ratio,
  financing_spread_bps,
  record_ids
)
values
  ('partial-release-55', 55, 25, 2, 1.00, 200, '["credit_deal_candidate_grid:partial-release-55"]'::jsonb),
  ('max-release-85', 85, 60, 3, 1.25, 100, '["credit_deal_candidate_grid:max-release-85"]'::jsonb),
  ('low-release-10', 10, 0, 1, 0.75, 500, '["credit_deal_candidate_grid:low-release-10"]'::jsonb)
on conflict (candidate_id) do update set
  collateral_ratio = excluded.collateral_ratio,
  deposit_pct = excluded.deposit_pct,
  financing_spread_bps = excluded.financing_spread_bps,
  record_ids = excluded.record_ids,
  release_pct = excluded.release_pct,
  tranche_count = excluded.tranche_count;

insert into credit_negotiation_policy (key, value_text, policy_version, record_id, approved_by, effective_from, active)
values
  ('min_deposit_pct', '0', 1, 'credit_negotiation_policy:min_deposit_pct:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('max_deposit_pct', '60', 1, 'credit_negotiation_policy:max_deposit_pct:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('max_tranches', '3', 1, 'credit_negotiation_policy:max_tranches:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('max_collateral_ratio', '1.25', 1, 'credit_negotiation_policy:max_collateral_ratio:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('max_financing_spread_bps', '600', 1, 'credit_negotiation_policy:max_financing_spread_bps:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('min_release_pct', '10', 1, 'credit_negotiation_policy:min_release_pct:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('max_release_pct', '85', 1, 'credit_negotiation_policy:max_release_pct:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('default_prob_by_verdict_clear', '0.005', 1, 'credit_negotiation_policy:default_prob_by_verdict_clear:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('default_prob_by_verdict_watch', '0.015', 1, 'credit_negotiation_policy:default_prob_by_verdict_watch:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('default_prob_by_verdict_elevated', '0.050', 1, 'credit_negotiation_policy:default_prob_by_verdict_elevated:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true),
  ('default_prob_by_verdict_high', '0.120', 1, 'credit_negotiation_policy:default_prob_by_verdict_high:v1', 'human:owner-accepted-2026-07-09', '2026-07-09T00:00:00.000Z', true)
on conflict (key) do update set
  active = excluded.active,
  approved_by = excluded.approved_by,
  effective_from = excluded.effective_from,
  policy_version = excluded.policy_version,
  record_id = excluded.record_id,
  value_text = excluded.value_text;
