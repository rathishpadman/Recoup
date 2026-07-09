# David Option 1 — Dynamic Fulfilment & Terms Negotiation — Phase-wise Spec

**Owner decisions (2026-07-09):** counter-offers arrive over **live Resend email** (reuse Maya's email integration + a new inbound webhook); **the LLM drafts candidate deal structures** which the deterministic engine prices/ranks/**rejects** (LLM never emits dollars); the workbench **extends the David v2 dossier** (no new route). Economic feeds (3PL inventory, cost of capital, POS sell-through) are **simulated Supabase tables** because those integrations aren't available.

> Execution protocol: same as the David v2 plan — per task, reviewer subagent → RED (tdd-guide) → GREEN → parallel `code-reviewer` + `security-reviewer` → boundary gate → conventional commit. No `--no-verify`. Branch off freshly-fetched `origin/main` in a clean worktree.

---

## 0. Why this design (the invariants that constrain it)

The literal "agent autonomously invents deals and negotiates over email" collides with the platform's governance promise. This spec keeps the *experience* (dynamic, optimized, specific tranche deals) while honoring the invariants that make Recoup demo-credible:

| Invariant | Consequence for this feature |
|---|---|
| I-24 deterministic + replayable | Every dollar/ratio/objective is **code-computed** (Decimal), reproducible from stored inputs + seed. LLM output is *structure parameters*, never money. |
| no-float-money (`no-float-money.test.ts`) | All money math via `src/types/money.ts`. |
| I-8 proposer ≠ approver · I-20 HITL on external actions | Every outbound counter-proposal to Harbor is **draft-only → David-approved → sent**. No autonomous send. |
| I-26 no production ERP write-back | Ship/release/credit-master changes stay staged drafts; only email to Harbor is a real external action, and only after approval. |
| I-30 provenance honesty | Simulated feeds (3PL/cost-of-capital/POS) carry a **synthetic badge**; real email carries live provenance. No "Connected" without a loaded source. |
| I-21 hash-chained decisions | Each negotiation round + approval is appended to the audit chain. |

**Architecture in one line:** simulated economic data (Supabase) → **deterministic deal-space optimizer** (reuses `core/partialHold.ts` + `proposeTerms`; new `core/dealExpectedValue.ts` for EV) → **LLM drafts candidate structures** the optimizer prices/ranks/rejects → David approves → **Resend email** to Harbor → **inbound webhook** parses Harbor's counter → next round.

---

## 1. New Supabase tables (all seeded; simulated feeds badged synthetic)

```sql
-- Trigger: a pending order that may breach the limit (the $640K-over-$500K beat)
create table if not exists credit_orders (
  order_id text primary key, account_id text not null references credit_accounts(account_id),
  order_amount numeric not null, requested_ship_date date not null,
  status text not null check (status in ('pending','negotiating','partially_released','closed')) default 'pending');

-- Simulated economic feeds (synthetic-badged in UI)
create table if not exists sim_3pl_inventory (
  sku text not null, account_id text not null references credit_accounts(account_id),
  warehouse text not null, on_hand_units integer not null, unit_cost numeric not null,
  daily_holding_cost_rate numeric not null, primary key (sku, warehouse));
create table if not exists sim_cost_of_capital (
  as_of_date date primary key, annual_cost_of_capital_rate numeric not null,
  inventory_holding_annual_rate numeric not null);
create table if not exists sim_pos_sellthrough (
  account_id text not null references credit_accounts(account_id), period text not null,
  units_sold integer not null, sell_through_rate numeric not null, primary key (account_id, period));

-- Negotiation state machine + audit
create table if not exists credit_deal_scenarios (
  scenario_id text primary key, order_id text not null references credit_orders(order_id),
  seed integer not null, candidate_json jsonb not null, objective_value numeric not null,
  ranked_position integer not null,
  optimizer_run_id text not null,                     -- groups one optimizer run
  source_hash text not null, policy_hash text not null,  -- exact replay: feeds + policy at run time
  source_record_ids jsonb not null,                   -- cited rows the objective consumed
  created_at timestamptz not null default now(),
  unique(order_id, source_hash, policy_hash, seed, ranked_position)); -- dedupe only true re-runs
create table if not exists credit_negotiation_rounds (
  round_id text primary key, order_id text not null references credit_orders(order_id),
  round_no integer not null, our_proposal_json jsonb not null, their_counter_json jsonb,
  status text not null check (status in ('drafted','sent','countered','accepted','rejected','withdrawn')),
  audit_entry_hash text, created_at timestamptz not null default now(),
  unique(order_id, round_no));                         -- one row per order/round
-- Outbound send ledger: correlation + body-hash proof + idempotency (columns the plan's claims need)
create table if not exists credit_negotiation_sends (
  send_id text primary key, round_id text not null references credit_negotiation_rounds(round_id),
  action_id text not null, reply_to_token text not null,
  approved_body_hash text not null, sent_body_hash text,   -- must match on send
  provider_email_id text,                                  -- Resend send id from /emails response
  idempotency_key text not null unique,                    -- dedupe re-approvals / Resend retries
  status text not null check (status in ('approved','sent','failed')) default 'approved',
  created_at timestamptz not null default now());
create table if not exists credit_counter_offers (
  offer_id text primary key, order_id text not null references credit_orders(order_id),
  round_no integer not null, terms_json jsonb not null,
  source text not null check (source in ('email','manual')), inbound_message_ref text,
  inbound_email_id text, inbound_message_id text, cited_spans_json jsonb,
  parsed_by text, received_at timestamptz not null default now(),
  unique(inbound_message_ref),                          -- webhook-replay dedupe (NULL for manual = allowed)
  unique(inbound_email_id));                            -- Resend received-email id dedupe (NULL for manual = allowed)
-- Vendor AP contact = sender-auth key for inbound (Harbor's demo address = your Gmail, seeded from env)
create table if not exists credit_account_contacts (
  account_id text primary key references credit_accounts(account_id),
  contact_email text not null, contact_name text not null, role text not null default 'AP');
-- Governed policy bounds for the deal grammar (expert-owned, editable without code)
create table if not exists credit_negotiation_policy (key text primary key, value numeric not null);
```

`credit_negotiation_policy` seeds the **deal-grammar bounds** (expert-owned policy, like the P&L weights): `min_deposit_pct`, `max_deposit_pct`, `max_tranches`, `max_collateral_ratio`, `max_financing_spread_bps`, `min_release_pct`, `max_release_pct`, `default_prob_by_verdict_*`. Seed script `scripts/seedNegotiationDataset.ts`; verify counts.

> **BLOCKING INPUT (owner) — no invented values.** Every number in `credit_negotiation_policy` (bounds, default probabilities, collateral limits, financing spreads, release bounds) is a governed constant, and the repo forbids invented thresholds/weights/probabilities. **The owner requested a research-backed applicable policy on 2026-07-09; the table below is the P0.0 policy candidate.** Execution may use it only after owner acceptance or explicit override. Capture accepted figures in the seed script; the builder fails closed if any policy key is absent.

**P0.0 research-backed policy candidate (owner acceptance required):**

Research basis: use current U.S. prime as the financing anchor (Fed H.15 bank prime loan rate is 6.75% as of 2026-07-08), trade-credit mitigation norms that tighten terms through deposits/collateral/insurance for high-risk buyers, and current corporate/high-yield default context. These values are intentionally conservative for a **simulated David negotiation demo**, not a production underwriting policy.

| Policy key | Proposed value | Unit | Rationale / guardrail |
|---|---:|---|---|
| `min_deposit_pct` | `0` | percent | Allows no-deposit offers only when the deterministic score/risk economics justify it. |
| `max_deposit_pct` | `60` | percent | Keeps LLM/optimizer offers commercially plausible while allowing a strong cash-in-advance lever for HIGH risk. |
| `max_tranches` | `3` | count | Limits complexity: initial release + up to two triggered follow-on releases. |
| `max_collateral_ratio` | `1.25` | ratio | Caps collateral/security requests at 125% of the financed/released risk balance. |
| `max_financing_spread_bps` | `600` | basis points | Allows risk-based pricing up to prime + 600 bps; enough for HIGH risk without creating predatory demo terms. |
| `min_release_pct` | `10` | percent | Prevents meaningless offers below 10% fulfilment unless the engine chooses no deal/fail-closed. |
| `max_release_pct` | `85` | percent | Keeps a back-order/hold lever available for over-limit/high-risk negotiation; no full release without separate policy approval. |
| `default_prob_by_verdict_clear` | `0.005` | annual probability | CLEAR account baseline for expected-default-loss math. |
| `default_prob_by_verdict_watch` | `0.015` | annual probability | WATCH account baseline, above CLEAR but below stressed/high-yield context. |
| `default_prob_by_verdict_elevated` | `0.050` | annual probability | ELEVATED baseline, aligned to stressed speculative-risk range. |
| `default_prob_by_verdict_high` | `0.120` | annual probability | HIGH baseline, conservative stress for over-limit + disputed/unsupported exposure. |

Implementation note: treat `default_prob_by_verdict_*` as **annualized** PDs and convert to the candidate horizon in code (`1 - (1 - annualPd)^(days/365)`) before expected-default-loss math. Do not let the LLM see or change these constants; it can only propose bounded structure parameters.

**Policy Q&A / vector search:** `credit_negotiation_policy` remains the authoritative exact-value store. Vector search is approved only for **policy-related questions and rationale retrieval**: index the policy research notes, owner-approval note, and policy rationale chunks with record IDs + policy version/hash so David copilot can answer "why is this bound 60%?" with citations. The engine must never retrieve active numeric policy values from vector search; it reads exact rows from `credit_negotiation_policy` and fails closed on missing/conflicting values. If vector-retrieved rationale disagrees with the structured policy row, show `Policy rationale conflict` and route to human review.

**Deal grammar (the bounded space the optimizer + LLM operate in):**
`{ depositPct, tranches:[{pct, trigger:{kind:'date'|'pos_sellthrough', value}}], collateralRatio, financingSpreadBps }` — every field bounded by `credit_negotiation_policy`. A candidate outside bounds is rejected by the engine, never rendered.

---

## Phase 0 — Surface the existing engines behind "Simulate alternatives" (deterministic what-if)

**Goal:** make the currently-disabled "Simulate alternatives" button real, reusing built code, before any negotiation. De-risks the `/credit/command` retirement (which would otherwise orphan `partialHold`/`proposeTerms`).

**Backend:** new pure `src/services/creditSimulationModel.ts` wrapping `computePartialHold` (`core/partialHold.ts`) + `proposeTerms` (`tools/actions/proposeTerms.ts`); read-only `POST /credit/v2/simulate` (Express) taking `{accountId, weightOverrides?, scoreOverrides?}` → recomputed `{compositeScore, releaseRatioPercent, amountSplit, terms}` with cited basis. No approval, no external action.

**UI (extend David dossier):** enable "Simulate alternatives" → opens a `Sheet` with weight/score sliders (bounded), live-recomputed release/back-order split + terms + a **sensitivity line** ("bureau-risk weight would need to fall from X to Y before full release"). All labels pre-formatted by backend.

**Success criteria:**
- Button no longer disabled; adjusting an input returns a recomputed split from `computePartialHold` (not a constant).
- Same inputs → same output (deterministic); money via Decimal; no approval/external call fires.
- `/credit/command` engines now have a live consumer in v2.

**Test scenarios:**
- *Unit:* `computePartialHold` wrapper golden values; bounds clamp; Decimal money; fail-closed on missing scores.
- *Browser/e2e:* open Harbor dossier → "Simulate alternatives" → move a weight → split + sensitivity line update; assert **no** `/api/approval` or email network call fires on open or on simulate.
- *LLM:* n/a (Phase 0 is pure-deterministic).

---

## Phase 1 — Deterministic deal-space optimizer over simulated economic data

**Goal:** replace single-menu-pick with a code-computed optimizer that ranks candidate deal structures by **expected value of the relationship** across a seeded scenario grid.

**Backend:** `src/services/dealOptimizer.ts` (pure, Decimal):
- Inputs (all from Supabase): order (`credit_orders`), account verdict/exposure (existing `credit_*`), `sim_3pl_inventory`, `sim_cost_of_capital`, `sim_pos_sellthrough`, grammar bounds.
- Objective per candidate = `revenueCaptured − costOfCapital(financedBalance, days) − holdingCost(unshippedUnits, days) − expectedDefaultLoss(verdict, exposure)`; default probability from `credit_negotiation_policy.default_prob_by_verdict_*`; EV aggregated across a **fixed-seed** scenario grid (sell-through ± bands).
- **New helper — do NOT claim reuse of `reconstructExpectedPosition`.** `core/expected.ts` only handles three deduction shapes (`contracted-delivery`, `promo-accrual`, `contract-sla`) and is **not** a generic scenario-grid EV aggregator. Add a new deterministic **`src/core/dealExpectedValue.ts`** (pure, Decimal, seeded) that owns the objective + grid aggregation, with its own golden tests. Reference `expected.ts` for the Decimal/Money idioms only.
- Output: ranked candidates persisted to `credit_deal_scenarios` (with seed) for replay/audit.
- `GET /credit/v2/orders/:orderId/deals` returns ranked candidates + objective + basis.

**UI:** in the Harbor dossier, a "Fulfilment & Terms Negotiation" workbench: order-vs-limit breach banner, ranked candidate cards (deposit/tranches/triggers/collateral + EV + cited basis), "why this ranks first" sensitivity readout. Synthetic badges on 3PL/cost-of-capital/POS.

**Success criteria:**
- Candidates are ranked deterministically; **re-running with the same `seed` + `source_hash` + `policy_hash` reproduces the exact ranking + objective values** (I-24), persisted in `credit_deal_scenarios` with `optimizer_run_id` + `source_record_ids`. A changed feed/policy row yields a new `source_hash`/`policy_hash` (new run, not a silent overwrite) — this is what makes the hash-chain evidence real.
- Every candidate's dollars are Decimal-computed and cite the source rows; out-of-grammar candidates never appear.
- Fail-closed (503/Contract gap) if any required sim table is empty.

**Test scenarios:**
- *Unit:* golden EV for a known order+feeds; determinism (same seed → identical ranking); grammar-bounds rejection; Decimal money; missing-feed fail-closed; monotonicity checks (higher cost-of-capital → lower EV for financed-heavy deals).
- *Browser/e2e:* Harbor breach → workbench renders ranked candidates with EV + basis + synthetic badges; assert values match a fixture computed from seeded rows; no write/approval call on load.
- *LLM:* n/a (Phase 1 is deterministic).

---

## Phase 2 — LLM drafts candidate structures (engine prices, ranks, and rejects)

**Goal (owner choice):** let the LLM *propose* creative deal shapes; the deterministic engine remains the sole source of dollars and the gatekeeper.

**Backend:** extend the existing David live-agent path (`creditRiskQuerySession` pattern) with a `credit_negotiation.draft_structures` tool. Flow:
1. LLM (OpenAI Agents SDK, live trace) emits **structure parameters only** as strict JSON matching the deal-grammar schema (Zod-validated) — `depositPct`, `tranches[]`, triggers, `collateralRatio`, `financingSpreadBps`. **No dollar amounts in LLM output.**
2. `dealOptimizer` (Phase 1) validates bounds, **prices** each LLM candidate, ranks it against the deterministic candidates, and **rejects** any that break grammar/risk bounds (returns a visible rejection reason).
3. Response carries model-execution metadata (mode `live_openai_agents`, agents, handoffs, tokens, run id) + citations to the account/order/feed records, same as David copilot; raw model text suppressed.

**UI:** "Ask the copilot to draft an option" → LLM-proposed structures appear **priced by the engine**, interleaved with deterministic candidates, each tagged `agent-drafted` vs `engine-generated`; rejected drafts show the rejection reason (grammar/risk). Free-text still routes through `/api/credit/query`.

**Success criteria:**
- LLM output is **schema-valid structure params with zero dollar figures**; all pricing comes from the engine.
- An LLM structure that violates bounds is **rejected with a cited reason** and never rendered as approvable.
- The *priced* result for a given structure is identical regardless of LLM phrasing (determinism downstream of the LLM).
- Every LLM claim carries citations (I-29-style parity); model-execution drawer shows tokens/agents/handoffs.

**Test scenarios:**
- *Unit:* schema rejects any LLM JSON containing money; engine prices an agent-drafted structure identically to an equivalent hand-authored one; bounds-violation → rejection object.
- *LLM/eval (offline harness, seeded prompts):*
  - *Grammar adherence:* over N sampled generations, 100% parse to the grammar schema; **0 dollar tokens** in raw output (regex + numeric-field assertion).
  - *No-invention:* assert the LLM never returns `objectiveValue`/amounts; those exist only post-engine.
  - *Citation-scope:* every narrated rationale cites an existing record/scenario id; injected "cite a record outside the packet" prompt must refuse/Contract-gap (reuse the forensics citation-scope guard pattern).
  - *Rejection path:* a prompt nudging an out-of-bounds deal (e.g., 95% deposit) → engine rejects, UI shows reason.
  - *Determinism downstream:* same structure via 5 different phrasings → identical priced ranking.
- *Browser/e2e:* copilot "draft an aggressive tranche deal" → priced candidate appears with `agent-drafted` tag + citations + model-execution drawer; an out-of-bounds ask renders a rejection card; assert no approval/email call fires.

---

## Phase 3 — Live email negotiation loop (Resend send + inbound webhook, HITL every round)

**Goal:** close the loop over **real email**, reusing Maya's proven send path, with a human approving every outbound counter.

**Email infra (confirmed on `north-bay.dev`, 2026-07-09):** Resend sending **and** receiving are verified. Receiving MX is on the **root `@` (catch-all)** — every address at `north-bay.dev` routes to Resend inbound — so plus-addressing needs no extra config. DNS is done; the remaining setup is app-side (webhook registration + signing secret + the ported route).
- **Addresses:** send **From** `deals@north-bay.dev`; **Reply-To** `deals+<orderId>-r<roundNo>@north-bay.dev` (the catch-all captures the plus-token).
- **Harbor contact:** the owner's Gmail, seeded into `credit_account_contacts` **from env** (`HARBOR_AP_CONTACT_EMAIL`), never committed — it is both the send target and the inbound sender-auth key.

**Outbound.** David selects a candidate → **draft** counter-proposal email → **David approves** (`actionId: "credit-v2:negotiation:<orderId>:<roundNo>"`) → send via a **new `sendNegotiationEmail` primitive** → receipt + audit hash; **write a `credit_negotiation_sends` row** (`approved_body_hash`/`sent_body_hash` must match, `provider_email_id` from Resend's send response, `idempotency_key`); round persisted to `credit_negotiation_rounds` (status `sent`). From `deals@north-bay.dev` + Reply-To plus-token + subject token `[Recoup Deal <orderId> · Round <n>]`. Do **not** rely on an outbound RFC `Message-ID` from Resend send; store inbound `email_id` + `message_id` on `credit_counter_offers`, then use the latest inbound `message_id` for subsequent `In-Reply-To` / `References` headers.

> **Send-primitive gap (not just the route).** `RecoupEmailDraft` is `{actionId, body, lineId, recipientGroup, subject}`, `EmailRecipientGroup` is `billing|recovery` only, recipients come from env config, and `ResendEmailProviderBody` has **no `reply_to` and no custom `headers`** (`emailGateway.ts:14,3,23`). So `sendResendEmail` cannot address Harbor or set Reply-To / `In-Reply-To`. **Add a `sendNegotiationEmail(input)` in `emailGateway.ts`** that reuses the idempotent send-ledger + body-hash + delivery/error handling but accepts explicit `to`, `from`, `replyTo`, and `headers`. Do **not** widen the `billing|recovery` enum on the Maya path. (`emailGateway.ts` already imports `createHmac`/`timingSafeEqual`, so hashing is in-house.)

> **Two backend gaps the review surfaced — do NOT under-scope these (both need their own RED tests):**
>
> **(a) `/api/email` is Maya/forensics-shaped — you cannot just "add David access."** The route's `emailSendSchema` is `.strict()` and requires `lineId` + `recipientGroup: enum("billing","recovery")`, is gated `allowDemoSessionRoles: ["maya"]`, and **re-fetches `/forensics/work-items/:lineId`** before send (`cockpit/app/api/email/route.ts:23,66,146`). Negotiation needs order/account/round semantics, a Harbor recipient, Reply-To plus-token, and inbound Message-ID storage — none of which fit that schema. **Create a dedicated `POST /api/credit/negotiation/email` route** that calls `sendNegotiationEmail` and reuses the `email-draft-dialog` UI pattern. Reuse `emailGateway` hashing/idempotency/error-handling internals, **not `sendResendEmail` directly** and not the forensics route. The new route is david-gated, with its own send/status schema + tests. Generalizing the existing route is an option but higher-risk to Maya; prefer a new route.
>
> **(b) `credit-v2:negotiation:*` is swallowed by the existing generic resolver.** `findPendingAction` (`serviceLayer.ts:599`) enters `if (actionId.startsWith("credit-v2:"))`, searches only account `packet.actionId`, and **throws `Action not found` at :606** — it never falls through. So a negotiation id lands there and fails. **Add a `startsWith("credit-v2:negotiation:")` branch BEFORE the generic `credit-v2:` check**, resolving the action by deterministically rebuilding the negotiation round/deal (recordIds + basis, draft-only). RED test (must fail on current code): `prepareApprovalDecision({actionId:"credit-v2:negotiation:HAR-ORD-001:r1"})` currently throws `Action not found`; after the fix it resolves to a negotiation action; the generic `credit-v2:<accountId>` path still resolves unchanged.

**Inbound (new — port the Relay client's `app/api/webhooks/resend/route.ts`):** `cockpit/app/api/credit/negotiation/inbound/route.ts`:
1. **Register the webhook** in Resend (Configuration/Webhooks) for `email.received` → this deployed route; put the signing secret in env (`RESEND_INBOUND_SIGNING_SECRET`). *DNS alone does not deliver events — this step is required.*
2. **Verify the webhook signature over the RAW body** before any parsing (Resend requires raw-body verification; don't let the App Router parse JSON first); bad signature → 401, nothing written. **Recoup has no `svix` package and the plan keeps "no new deps": implement Resend's svix-compatible scheme with `node:crypto`**, correctly:
   - **Secret:** the `whsec_…` value — strip the `whsec_` prefix and **base64-decode the remainder** to get the raw HMAC key (do not HMAC with the literal string).
   - **Signed content:** `${svix-id}.${svix-timestamp}.${rawBody}`; HMAC-SHA256 → base64.
   - **Header:** `svix-signature` holds **space-separated, versioned** entries like `v1,<base64> v1,<base64>`. Split, take each `v1,…`, and accept if **any** matches (constant-time via `timingSafeEqual`).
   - **Replay guard:** reject if `svix-timestamp` is outside a tolerance window (e.g. ±5 min).
   - Ship **test vectors** (known secret + payload → expected `v1` signature; tampered-body and stale-timestamp negatives). Adding the `svix` package is the alternative **only with explicit owner approval**.
3. **Correlate:** extract the token from the `to` plus-address (primary), fall back to subject token, then use inbound `message_id` continuity for later rounds where available. Unknown/closed round → drop (fail-closed). Store both Resend's inbound `email_id` and the inbound RFC `message_id`; later outbound replies set `In-Reply-To` / `References` from that stored inbound `message_id`.
4. **Sender-auth:** `from` must equal `credit_account_contacts.contact_email` for that order's account, else drop. Catch-all means arbitrary spam hits this route — rate-limit and silently drop unmatched.
5. **Fetch body** via Resend's Received Emails API (`email.received` omits it), with retry; on fetch failure, store metadata and retry later, do **not** advance the round.
6. **LLM extracts cited spans + intent ONLY — never dollar values** (I-1). The LLM returns which grammar fields the counter touches and the exact quoted source spans; **code then deterministically extracts any dollar/number from the exact source text** (regex over the raw message) and validates against the grammar. If a required amount can't be extracted verbatim from the message → **route to human review**, do not let the model supply it. Insert `credit_counter_offers` (`source='email'`, storing the cited spans) + advance `credit_negotiation_rounds` to `countered`.

A manual "paste counter" UI field feeds the same table (`source='manual'`) — the always-works fallback if live email spam-filters or lags on stage.

**Loop:** new counter → `dealOptimizer` re-runs against it → new ranked counter-proposal (Phase 1/2) → David approves → send. Continues until `accepted`/`rejected`/`withdrawn`.

**Success criteria:**
- No email sends without an explicit David approval (I-20/I-8); duplicate approval → **idempotent** (no double-send, ledger dedup); sent body hash == approved draft hash.
- Inbound webhook is signature-verified, fail-closed on bad signature; parsed counter is grammar-valid and cited to the message; parsing never invents amounts.
- Each round hash-chained to audit; `credit_orders.status` transitions correctly; opening the workbench sends **no** email/approval request (read-only until explicit action).
- Provenance: email channel shows **live**; economic feeds still **synthetic**.

**Test scenarios:**
- *Unit:* actionId resolver for `credit-v2:negotiation:*`; idempotent send ledger (second approve → same receipt, no new send); inbound signature verification (bad sig → 401, no row written); parser rejects money-invention / out-of-grammar counter.
- *LLM/eval:* inbound-parse harness over sampled counter-offer emails → 100% grammar-valid extraction, 0 invented amounts, every field cited to the message; adversarial email ("also raise my limit to $5M") → parsed as out-of-scope, not silently actioned.
- *Browser/e2e (real backend + Supabase, seeded Harbor breach):*
  1. Harbor breach → workbench → ranked candidates (Phase 1/2).
  2. Select candidate → **Draft counter** → review dialog shows body + cited basis.
  3. Approve → assert **`POST /api/credit/negotiation/email`** fires **once**, receipt + audit hash render, round = `sent`, `credit_negotiation_sends` row written; re-approve → **no second send** (idempotency_key dedupe).
  4. Simulate inbound counter (webhook POST or manual paste) → new round `countered` appears; re-optimized counter renders.
  5. Assert opening the workbench / viewing a round fires **no** send/approval call (HITL discipline).
  6. Provenance: email `live`, 3PL/cost-of-capital/POS `synthetic` badges.
- *Regression:* Maya email path + David v2 + Maya containment unaffected (`npm run test`, `test:e2e:shared-surfaces`).

---

## Phase 4 (optional) — Continuous re-optimization & close-out

Sentinel-style re-underwrite Harbor after each round (reuse `agents/sentinel.ts`); on `accepted`, stage the (draft-only) release/back-order + credit-master change packet through the existing `/api/approval` path (no ERP write, I-26); CFO summary reflects captured revenue vs risk-priced balance. Success = accepted deal produces a hash-chained, replayable settlement draft; no autonomous execution.

---

## Cross-cutting requirements

- **Reuse over rebuild:** `computePartialHold`, `proposeTerms`, `emailGateway` hashing/idempotency/error-handling internals via the new `sendNegotiationEmail`, `email-draft-dialog`, `creditRiskQuerySession`, `findPendingAction`, David dossier components, `david-verdict-tokens`. **Reference the Decimal/Money idioms in `core/expected.ts` but do NOT reuse it for negotiation EV** (deduction-only; use the new `core/dealExpectedValue.ts`). **New deps: none** — inbound signature check is a local `node:crypto` HMAC verifier (svix package only with owner approval).
- **Boundary:** `cockpit/components/david/*` stays UI-only (no money math, no `src/` imports) — all figures arrive as pre-formatted labels + a provenance matrix row per new field (extend `david-v2-provenance-matrix.md`).
- **David dossier drawer defaults:** the **Signals in** section must be expanded by default for David negotiation/account detail review. Agent assessment, Outcome, and Action may remain collapsed by default unless a task-specific e2e asserts otherwise.
- **Policy query retrieval:** policy-related copilot questions use vector search over policy rationale/approval documents for explanation only; all executable policy constants still come from exact `credit_negotiation_policy` rows.
- **Gates before any prod movement:** `npm run verify` (lint, typecheck, full vitest, depcruise, release-readiness) green; `test:e2e:david-v2` extended; new `test:e2e:david-negotiation`; LLM eval harness green; David visual-review ≥4.5/5.
- **Security:** inbound webhook signature-verified + rate-limited; email send david/maya-gated; no secrets in code; seeded sim data only (no real customer PII).

## Troubleshooting / performance watchpoints

- **Prod `/credit` slow loading:** if `https://recoup-self-eta.vercel.app/credit` takes more than 5 seconds on a warmed browser session, stop the release path and troubleshoot before continuing. Reuse the Maya slow-load/cache troubleshooting pattern from `docs/superpowers/plans/2026-07-07-maya-prod-movement.md` (cache key/versioning, explicit refresh, first-hit/warm-hit probes, Vercel-vs-Render ownership split) and `docs/superpowers/plans/2026-07-07-david-credit-risk-review-v2-plan.md` Task 1-5.5 (prod Maya cache regression troubleshooting record). Apply the Maya lesson explicitly: measure demo-login/auth latency separately from post-login data hydration, check `x-recoup-read-model-cache: hit | miss | refresh` style route evidence when the route supports it, and verify the public alias is serving the intended Vercel route code before blaming Render/Supabase. Reproduce with browser timing + direct API timing; compare Vercel route time, Next proxy time, Render `/credit/v2` time, Supabase fetch time, and any cache/read-model headers. Check browser console/network waterfall, Vercel function logs, Render `recoup-api` logs, and direct `curl`/Playwright timings for `/credit`, `/api/credit/query`, and `${RECOUP_API_URL}/credit/v2`. Confirm Maya cache behavior is not regressed while fixing David load time.

## Execution status (2026-07-09, `codex/david-dynamic-negotiation`)

- Done locally with focused tests: policy exact-row parser/fail-closed guard (P0.1), Harbor simulation endpoint foundation (P0.2), deterministic EV/optimizer core (P1.2 core compute, without `credit_deal_scenarios` persistence yet), deal workbench endpoint/UI foundation (P1.3 except browser e2e), and governed `credit_negotiation.draft_structures` MCP/live-query backend wiring (P2.1).
- Partially done: workbench uses backend-priced labels and synthetic badges, but browser e2e and visual checks are still pending; optimizer returns source/policy/run hashes but does not yet persist `credit_deal_scenarios`; copilot can surface a priced `negotiationDraft` from a live tool receipt, but the dedicated copilot UI affordance/e2e remains pending.
- Still pending before prod movement: P0.1a vector index for policy rationale Q&A, P2.2 LLM eval harness, P2.3 copilot UI/e2e, all P3 email/inbound/round-tracking work, X.1 full `npm run verify`/e2e/visual gates, and X.2 David/Maya browser smoke including the `/credit` slow-load troubleshooting gate.

## Master checklist

- [ ] **P0.0** ⛔ research-backed `credit_negotiation_policy` candidate documented; owner accepts or overrides the values before seeding (bounds, default probs, collateral/financing limits) — blocking, no invented defaults
- [ ] **P0.1** `credit_negotiation_policy` + grammar bounds seed (from P0.0 values; fail-closed on missing key)
- [ ] **P0.1a** policy rationale/owner-approval docs indexed for vector search; copilot policy Q&A cites vector records, but optimizer reads constants only from exact `credit_negotiation_policy` rows
- [ ] **P0.2** `creditSimulationModel` + `POST /credit/v2/simulate` (reuse `computePartialHold`/`proposeTerms`)
- [ ] **P0.3** "Simulate alternatives" enabled in dossier + sensitivity line + e2e (no approval fires)
- [ ] **P1.1** sim tables (`credit_orders`, `sim_3pl_inventory`, `sim_cost_of_capital`, `sim_pos_sellthrough`, `credit_deal_scenarios`) + seed
- [ ] **P1.2** new `core/dealExpectedValue.ts` (Decimal, seeded EV/grid — NOT `reconstructExpectedPosition`) + `dealOptimizer` persisting `source_hash`/`policy_hash`/`source_record_ids`/`optimizer_run_id` + golden/determinism/replay tests
- [ ] **P1.3** `GET /credit/v2/orders/:id/deals` + workbench UI + synthetic badges + e2e
- [ ] **P2.1** `credit_negotiation.draft_structures` LLM tool (structure-params-only, Zod) + engine pricing/rejection
- [ ] **P2.2** LLM eval harness (grammar adherence, no-dollars, citation-scope, rejection, downstream determinism)
- [ ] **P2.3** copilot "draft an option" UI (agent-drafted vs engine-generated, rejection reasons) + e2e
- [ ] **P3.0** `credit_account_contacts` seeded from env (`HARBOR_AP_CONTACT_EMAIL`); register Resend `email.received` webhook → deployed route + `RESEND_INBOUND_SIGNING_SECRET` in env
- [ ] **P3.0a** before any live-email/prod test, confirm `north-bay.dev` root catch-all is safe to dedicate to Resend receiving (no real mailbox depends on the root MX)
- [ ] **P3.1** rounds/counter-offers tables (w/ idempotency uniques) + **`findPendingAction` `credit-v2:negotiation:` branch ordered BEFORE the generic `credit-v2:` branch** (RED test: negotiation id resolves; generic packet id still resolves)
- [ ] **P3.2** new **`sendNegotiationEmail` primitive** (explicit `to`/`from`/`replyTo`/`headers`, reusing the emailGateway hash/idempotency/error-handling internals but not `sendResendEmail` directly) + dedicated **`POST /api/credit/negotiation/email`** route (NOT Maya's `.strict()` forensics route): david-gated, idempotent, `credit_negotiation_sends` written, own schema + tests + approval + audit
- [ ] **P3.3** inbound route: `node:crypto` HMAC verify (svix `v1`, `whsec_` base64-decode, multi-sig, ±5min tolerance, `timingSafeEqual`) + test vectors → plus-token correlate → sender-auth vs contact → Received-Emails-API body fetch w/ retry → **LLM cited-spans-only + code dollar-extraction (no model dollars → else human review)** → round advance; catch-all fail-closed + rate-limit; manual-paste fallback
- [ ] **P3.4** full negotiation e2e (draft→approve→send→inbound→re-optimize→re-counter) + idempotency + HITL assertions
- [ ] **P4** (optional) sentinel re-underwrite + accepted-deal staged settlement draft + CFO summary
- [ ] **X.1** provenance matrix extended; `npm run verify` + all e2e + LLM evals green; visual ≥4.5/5
- [ ] **X.2** David UI e2e asserts **Signals in** is expanded by default, and prod/browser smoke includes `/credit` slow-load troubleshooting if warmed load exceeds 5s

## Open questions (non-blocking)

1. ~~Inbound Harbor address/mailbox~~ **RESOLVED except pre-prod safety gate:** `north-bay.dev` root catch-all (Resend receiving verified 2026-07-09); inbound `deals@north-bay.dev` + plus-tokens; Harbor contact = owner Gmail from env. Confirming `north-bay.dev` is not used for any real mailbox is now a checklist gate (**P3.0a**) before live-email/prod testing.
2. ~~Deal-grammar bounds — start from defaults~~ **PROMOTED TO BLOCKING (see §1 policy note):** a research-backed `credit_negotiation_policy` candidate now exists; owner must accept or override it before P0/P1 seeding — no invented defaults. Tracked as checklist **P0.0**.
3. Should P4 (continuous re-underwrite) be in-scope for the demo, or narrated?
