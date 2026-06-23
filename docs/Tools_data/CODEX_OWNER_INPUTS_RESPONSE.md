# Owner Inputs — Response to Codex SDD-Completion Request

**Owner:** Rathish (product owner / domain authority)
**Sources cited:** `RECONCILIATION_LEDGER.md` §3/§4/§6 · `Recoup_v2_SDD.md` §5/§6/Appendix G · `seed_data.sql` · `CODEX_CONFIG.md` · `O2C_DATA_MAP.md` · `OPENAI_STACK_DOSSIER.md`
**Precedence reminder (AGENTS.md §1):** `INVARIANTS.md` > `RECONCILIATION_LEDGER.md` > SDD section > AGENTS.md > model judgment. Nothing below overrides a higher source; where a value is owner-set it is marked.

**Status:** All items answered and **all owner decisions locked** (see final section). Release gate cleared **and** full SDD-completion set satisfied. Only mechanical build-time verifications remain (§6 vector-store provisioning, §7 V3/V6/V7) — none block the build.

---

## 1. Appendix G run-control values — BINDING (Day-1 tunable, I-16)

These are **runaway-protection ceilings**, not expected consumption. Calibrated to demo scale (seed-42, 20 deduction lines, 4 customers, 1 arbitration scenario). After the first full sweep, instrument actual usage and tighten each cap to ~1.5× observed p95. `tokenBudget` = cumulative input+output tokens per phase-run; `stepBudget` = max agent steps/tool-calls per phase-run; `retryCap` = max retries per individual tool call.

```json
{
  "forensics":   { "tokenBudget": 200000, "stepBudget": 80, "retryCap": 2 },
  "recovery":    { "tokenBudget": 90000,  "stepBudget": 40, "retryCap": 2 },
  "riskMesh":    { "tokenBudget": 90000,  "stepBudget": 36, "retryCap": 2 },
  "sentinel":    { "tokenBudget": 70000,  "stepBudget": 30, "retryCap": 2 },
  "containment": { "tokenBudget": 45000,  "stepBudget": 24, "retryCap": 2 },
  "query":       { "tokenBudget": 32000,  "stepBudget": 12, "retryCap": 1 }
}
```

| Phase | Model (SDD §6.1) | Workload shape | Why this ceiling |
|---|---|---|---|
| forensics | `gpt-5.5` reasoning med/high | Per-line fan-out across 20 lines; each line joins SAP billing + POD + TPM + contract retrieval, then classifies | Heaviest phase; ~9–10k token + ~3–4 step headroom per line. Highest caps. |
| recovery | `gpt-5.4` | Drafts correspondence + re-bill for the 13 recovery/partial lines (S3,S5,S6,S7,S8) | Drafting, not reasoning; bounded by line count. |
| riskMesh | `gpt-5.5` reasoning high | Gathers 4 function positions (credit/fulfilment/billing/collections) via agents-as-tools + arbitration ranking for **1** scenario | One scenario but high-reasoning + multi-agent gather. |
| sentinel | `gpt-5.4` + `5.4-mini` | Re-underwrites portfolio (4 customers); bureau retrieval; R-score/R-drift | Math is deterministic core; LLM only narrates → modest cap. |
| containment | `gpt-5.4` + `5.4-nano` | Gaming-gate eval + partial-hold compute (core does the arithmetic) | Mostly deterministic; LLM narrates intent → low cap. |
| query | `gpt-realtime-2` voice + `gpt-5.4` text | Single Q&A turn; fileSearch + audit read | Latency-sensitive single turn → tightest cap, `retryCap 1`. |

Retry policy: reads/compute tools are idempotent (events hash-keyed by `eventId`, I-4) → `retryCap 2` is safe even on draft-write tools. Query voice turn kept at `1` to protect interactive latency.

---

## 2. Expert eval labels — BINDING

### 2a. Customer intent labels (capability D; I-19 requires cited behavioral evidence)

| Customer | SAP ID | Label | Cited evidence (deterministic basis) |
|---|---|---|---|
| **Crestline Grocery** | `USCU_L10` | `gaming` | Two source-contradicted invalid claims in one settlement: **S3** shortage INVALID (signed POD `90000000` shows 1,200/1,200 received in full, no exceptions) + **S6** pricing chargeback INVALID (billed $15.00 = contracted price in `CON_CREST_01`). `gaming_pattern_flag=true` on S3. Repeat-invalid-shortage/pricing pattern = gate fires (SDD §5.5). Ledger §3. |
| **Harbor Foods** | `USCU_S04` | `distressed-honest` | DSO drift 32→51 days (`payments` 90000036…90000085) + CRITICAL bureau `TAX_LIEN` ($45K, 2026-06-12). Claim errors are a cap-breach (**S7**: claimed $25,900 vs $10,000 accrual `PM_HARB_02`) and a duplicate (**S8**: already credited under DisputeCase `FIN-DISP-202`) — consistent with distress/sloppiness, **not** source-contradicting gaming. `gaming_pattern_flag=false`. Ledger §3. |
| **ValuMart Club** | `USCU_S07` | `genuine` | Mixed correct/incorrect disputes, no systematic invalid pattern: **S4** OTIF fine VALID (2 days late, matches SLA `CON_VALU_01`) and **S5** OTIF fine INVALID (POD timestamp `90000001` shows arrival 1 day early). High fine cadence but each has a legitimate basis. Ledger §3. |
| **Greenleaf Naturals** | `USCU_S03` | `genuine` | **S1** damaged VALID — carrier report VERIFIED (12 cases), photos match, signed POD `90000002` (388/400 with documented 12-case damage). Small, corroborated, valid. Ledger §3. |

### 2b. Arbitration expert label (capability A; arbitration-agreement gate ≥0.85, I-28)

There is exactly **one** Risk-Mesh arbitration scenario in the gold set: **Harbor blocked order `6534`, $640,010** (`credit_decisions` seed; Ledger §6 worked example).

**Expected approved (ranked #1) decision:**
- **Partial release, 55%** — ship **$352,005.50** now; back-order **$288,004.50**.
- Revised terms: **2/10 Net-30 + 25% deposit**.
- Auto-release remaining tranches as Sentinel confirms DSO improvement; continued drift re-opens the Mesh (closed loop).
- Deterministic basis: composite **C = 51.25** (band 40–60 = partial); `releaseRatio = clamp(ceil(51.25/5)*5, 40, 70) = 55%`. Composite from the six partial-hold criteria (Ledger §6 / SDD §5.6).

**Expected option ranking** (what the supervisor should rank; eval compares agent ranking to this):
1. **Partial release 55% + revised terms** ← approved
2. Full hold (0% release) — rejected: forfeits ~34% margin on a stable-forecast strategic-growth account
3. Full release 100% — rejected: $140K over limit + deteriorating DSO + active tax lien
4. Full release on revised terms only (no hold) — rejected: insufficient exposure control given lien

### 2c. Arbitration P&L option weights — OWNER-SET & RATIFIED (Appendix G `<TO BE SET BY EXPERT>`, §5.7)

> ✅ **Ratified by owner.** Per AGENTS.md rule #1, Codex must **not** invent these — but these are now **expert-provided**, so use them as-is. The values below let `arbitration.ts` compute the ranking deterministically.
>
> **Codex instruction:** keep these **configurable**, not hardcoded into `arbitration.ts` logic. They live as named constants in `config/weights.ts` (Appendix G) / the governed `recoup_config` table — read at runtime, tunable by the expert, clamped to governance bands, and any agent-proposed change routes to HITL (never self-applied, I-24). "Configurable" means *owned by config*, not *free for Codex/the agent to alter*.

Arbitration score per option = Σ(optionValue · weight) across four function dimensions:

| Dimension | Weight | Rationale |
|---|---|---|
| Credit-risk / loss avoidance | **0.35** | Primary fiduciary axis given over-limit + lien |
| Revenue / fulfilment (margin capture on shipped portion) | **0.30** | High-margin holiday mix; capturing partial revenue matters |
| Collections recoverability (terms / DSO) | **0.20** | Terms structure drives realized cash |
| Relationship / strategic continuity | **0.15** | Growth-channel distributor; avoid over-penalizing |
| **Sum** | **1.00** | |

These rank the **resolution options** (capability A). They are distinct from the six **partial-hold composite** weights (20/15/20/15/15/15, capability D), which are already Day-1-tunable and locked in Ledger §6 / Appendix G — do not conflate the two layers.

---

## 3. SAP table contract — frontend-callable reads (data-resolved + GAPS flagged)

Consolidated from `CODEX_CONFIG.md` §3 and `O2C_DATA_MAP.md`. Host `crown.sapvista.com:44300`, client `100`. ✅ = probe returned data; ⚠️ = probe failed/empty → demo value lives in Supabase.

| Need | ✅/⚠️ | Service | Entity set | Key / filter predicate | Sample deterministic ID |
|---|---|---|---|---|---|
| Sales order (header/items) | ✅ | `ZAPI_SALES_ORDER_SRV_0001` | `A_SalesOrder` / `A_SalesOrderItem` | `SalesOrder` key; `SoldToParty` filter | SO `6533`; blocked order `6534` (USCU_S04) |
| Invoice (header/items) | ✅ | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` / `C_BillingDocumentItemFs` | `BillingDocument` key; `SoldToParty` filter | `90000000`,`90000002`,`90000017`,`90000080`,`90000001`,`90000061`,`90000005` |
| Credit memo / reference | ⚠️ | `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | filter `BillingDocumentType='G2'` linked to invoice | **GAP**: factsheet probe returned only 3 rows; no seeded G2. S8 duplicate proof lives in Supabase + DisputeCase `FIN-DISP-202`. |
| Outbound delivery | ⚠️ | `ZSD_SOFM_DELIVERY_SRV_01_0001` | `Delivery` | — | **GAP**: HTTP 501 (empty). Use Supabase `pod_records` (`delivery_ref`, `delivery_timestamp`, `signed_qty`) as the delivery source of truth. |
| Credit account (limit/risk/DSO) | ✅ | `ZUI_CREDITACCOUNT_DISPLAY_0001` | `CreditAccountSummary` | `BusinessPartner` + `CreditSegment` keys | `USCU_S04`, segment `1000` (DSO `51`) |
| Credit exposure | ✅ | `ZUI_CREDITEXPOSURE_DISPLAY_0001` | `CreditExposure` | `BusinessPartner` + segment | `USCU_S04` |
| Dispute case | ✅ | `ZUI_DISPUTECASE_MANAGE_0001` | `DisputeCase` | `Customer` filter; `DisputeCaseID` | `FIN-DISP-202` (S8) — note `CollectionsInvoiceNote` = HTTP 500 |
| Accrual (TPM) | ✅ | `ZUI_ACCRUALS_MANAGE_0001` | `PeriodicAmounts` | `AccrualObject` | corroborates S2/S7; **authoritative cap lives in Supabase** `promotions.accrual_cap` ($10,000 `PM_HARB_02`; $20,000 `PM_CREST_01`) |

**Honest read of the probe — RESOLVED (SAP active; Supabase = fallback).** SAP connection is **live**, so the frontend reads SAP-first for every need that resolves: invoice, sales order, credit account/exposure, DSO, dispute case, accrual. For the four needs whose entity sets returned 501/500/403 in client `100` (outbound **delivery**, **G2 credit memo**, **aging grids**), the adapter falls back to **Supabase** (`pod_records`, the duplicate-detection proof + `FIN-DISP-202`, and `payments`-derived aging respectively). No SAP-side G2/delivery seeding required for R1. Implement as a per-need source flag on the adapter: `primary=SAP, fallback=Supabase` — consistent with the source-swap boundary (port entities unchanged; only the adapter resolves the source). `provenance` stays tagged so the fallback path is auditable.

---

## 4. R-score source fields (capability C; SDD §5.4)

| R-score component | Source | Field(s) | Computation |
|---|---|---|---|
| DSO / ADP | Supabase `payments` + SAP `CreditAccountSummary` | `payments.days_to_pay` (trailing-window mean) ; live `DaysSalesOutstanding` | Avg days-to-pay over window; Harbor 32→51 visible in seed |
| Dispute rate | SAP `DisputeCase` + Supabase `deductions_backlog` | count(open disputes) / count(invoices) ; `verdict='INVALID'` count | Invalid-claim ratio per customer |
| Over-limit frequency | SAP `CreditExposure` vs `CreditAccountSummary` | `DynamicCreditExposureAmount` / `StaticCreditExposureAmount` vs `CreditLimitAmount` | # periods exposure > limit |
| Aging concentration | SAP AR (`ZC_TOTALACCOUNTSRECEIVABLES_CDS_0001` / `ZUI_HOBRECEIVABLES_DISPLAY_0001`) | aging buckets / `DueDateGrid` | % AR in oldest bucket — **GAP: `DueDateGrid`/`AgingGrid` returned HTTP 500; derive aging from `payments` + open-invoice ages instead** |
| Trailing baseline (R-drift) | Supabase `payments` | `days_to_pay` over trailing 6-mo window | Baseline mean for drift comparison |
| Cooldown / drift observations | **stateless (LOCKED)** | computed per run | **RESOLVED:** R-drift is computed **on-the-fly each run** from the trailing baseline above — no `risk_drift_events` table in R1. (A persisted drift-events table is the scale path, deferred.) |

External signals (`bureau_alerts` tax lien) are **narrative / drift-trigger only (LOCKED)** — they feed the R-drift narrative and the Sentinel proposal, **not** a weighted R-score component. The four weighted components stay as listed; no fifth term in R1.

---

## 5. Crestline beyond review-only — RESOLVED: review-only (LOCKED)

**Crestline stays review-only.** Its R1 footprint is the gaming flag (S3) + recovery packages (S3 `$21,300`, S6 `$18,400`) — already seeded. No blocked-order / `credit_decisions` row exists for Crestline, and none will be added: a hold/freeze/partial-hold path would need a new seed (blocked order + six partial-hold inputs + a new arbitration label) and would **break gold-set parity (I-27)**. The single arbitration showcase stays Harbor; Crestline's narrative is containment-via-gaming-flag, not credit-hold.

---

## 6. Production vector store — OWNER MUST PROVISION

| Item | Status | Action |
|---|---|---|
| `OPENAI_EVIDENCE_VECTOR_STORE_ID` | **not yet created** (no `vs_…` ID anywhere in specs/seed) | Owner creates the vector store and supplies the ID via env/secret — **do not paste in this file** |
| Index / upload policy | to define | Upload POD/contract/promo/remittance evidence dossiers; re-index on seed regeneration (seed-42 deterministic set) |
| Required citation metadata | to set | At minimum: `source_table`, `record_id` (e.g. `invoice_ref`/`pod_id`/`promo_id`/`contract_id`), `customer_id`, `scenario_type`, `provenance=synthetic` — so `fileSearchTool` citations resolve back to a record for I-17/I-18 |

Embeddings baseline `text-embedding-3-large` (Dossier §36, marked `[VERIFY-V6]`) — confirm current model at build (see §7).

---

## 7. Owner verification flags

| Flag | Spec value | Owner action |
|---|---|---|
| Embeddings model ID (V6) | `text-embedding-3-large` (baseline, `[VERIFY]`) | Confirm current embeddings model at build time |
| Codex build model ID (V7) | `[VERIFY-V7]` — build-only, **never** runtime | Confirm current Codex CLI/cloud default at setup; do not pin into runtime config |
| SAP sandbox identity (V3) | `crown.sapvista.com:44300`, client `100`, user `HCLTECH` | Confirm this is the canonical instance for the live retrieval path |
| Runtime models (no verify needed) | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-realtime-2` | Pinned (Ledger §7 / Dossier §46–50); no fine-tuning/RFT |

No secrets included. Vector-store ID, SAP credentials, and API keys stay in env/secret store.

---

## Decisions — RESOLVED (locked this round)

All four prior open items are now closed; nothing is pending owner input.

- **Q3 — SAP vs Supabase reads → LOCKED.** SAP connection is active and is the **primary** source for all resolving reads (invoice, SO, credit, exposure, DSO, dispute, accrual). **Supabase is the fallback** for the entity sets that failed the probe (delivery, G2 credit memo, aging). Per-need source flag on the adapter; no SAP-side seeding for R1. (§3)
- **Q4 — R-drift → LOCKED.** Stateless on-the-fly drift each run (no `risk_drift_events` table in R1); `bureau_alerts` is a narrative/drift-trigger only, not a weighted R-score component. (§4)
- **Q5 — Crestline → LOCKED.** Review-only; no second arbitration scenario; protects gold-set parity (I-27). (§5)
- **Q6 — Arbitration P&L weights → RATIFIED.** 0.35 / 0.30 / 0.20 / 0.15. Codex keeps them configurable in `config/weights.ts` / `recoup_config` (config-owned, not agent-editable; HITL-gated changes only). (§2c)

**Net effect:** the full SDD-completion set is satisfied — not just the release gate. The only remaining items are mechanical owner verifications at build time (§7: embeddings ID V6, Codex build model V7, SAP sandbox identity V3) and provisioning the evidence vector store + supplying its ID via secret (§6). None block Codex from starting the build.

---

# Round 2 — Production Runtime Values (Supabase config + .env.local)

Owner-set values for the six remaining items. Determinism rule holds throughout: these numbers live in `recoup_config` / `customers` / `.env.local` (source-owned, configurable); deterministic code multiplies and sums them; **no model asserts any of these figures**. All grounded to `seed_data.sql` (seed-42) where source data exists; owner-set demo defaults are flagged explicitly.

## R2-1. Risk Mesh ranking inputs → `recoup_config.key='risk_mesh_cases'`

One arbitration case in the gold set: Harbor `6534`, $640,010. `optionValue` ∈ [0,1] per (option × dimension), decimal strings. Dimension weights = the ratified §2c P&L weights. Code computes `weightedScore = Σ(optionValue·weight)`; highest = approved. Expected approved (Opt1, 55% partial) reproduces the seeded `credit_decisions` row ($352,005.50 / $288,004.50).

```json
{
  "risk_mesh_cases": [
    {
      "caseId": "RM-HARB-6534",
      "blockedOrderRef": "6534",
      "customerId": "USCU_S04",
      "orderAmount": "640010.00",
      "dimensionWeights": {
        "creditRisk": "0.35",
        "revenueFulfilment": "0.30",
        "collectionsRecoverability": "0.20",
        "relationshipContinuity": "0.15"
      },
      "arbitrationPositions": [
        {
          "optionId": "partial_release_55",
          "label": "Partial release 55% + revised terms (2/10 Net-30, 25% deposit)",
          "optionValue": { "creditRisk": "0.80", "revenueFulfilment": "0.65", "collectionsRecoverability": "0.85", "relationshipContinuity": "0.75" },
          "expectedWeightedScore": "0.7575", "expectedRank": 1, "approved": true
        },
        {
          "optionId": "full_release_revised_terms",
          "label": "Full release on revised terms (no hold)",
          "optionValue": { "creditRisk": "0.35", "revenueFulfilment": "0.90", "collectionsRecoverability": "0.70", "relationshipContinuity": "0.85" },
          "expectedWeightedScore": "0.6600", "expectedRank": 2, "approved": false
        },
        {
          "optionId": "full_release_100",
          "label": "Full release 100% (current terms)",
          "optionValue": { "creditRisk": "0.20", "revenueFulfilment": "0.95", "collectionsRecoverability": "0.30", "relationshipContinuity": "0.90" },
          "expectedWeightedScore": "0.5500", "expectedRank": 3, "approved": false
        },
        {
          "optionId": "full_hold_0",
          "label": "Full hold 0% release",
          "optionValue": { "creditRisk": "0.95", "revenueFulfilment": "0.10", "collectionsRecoverability": "0.50", "relationshipContinuity": "0.20" },
          "expectedWeightedScore": "0.4925", "expectedRank": 4, "approved": false
        }
      ]
    }
  ]
}
```

Codex: keep `dimensionWeights` and `optionValue` config-owned (not hardcoded, not agent-editable); the agent proposes a ranking, code scores it, and the arbitration-agreement gate (≥0.85, I-28) checks the agent's ranking against `expectedRank`. The arbitration layer is **separate** from the 6-criterion partial-hold composite (51.25 → 55%, already seeded in `credit_decisions`); both must agree that 55% partial wins — they do.

## R2-2. R-score inputs → approve rules + seeded values

**Approve the deterministic normalization rules** (so scores are computed from source, not magic numbers), **and** lock the seed-42 expected outputs below as the gold-set values the rules must reproduce. Direction for all four: **higher = higher risk (0–100)**.

| Component | Deterministic rule (owner-set anchors, configurable) |
|---|---|
| `dsoAdp` | `clamp((effectiveDSO − 30)/(60 − 30) × 100, 0, 100)`; `effectiveDSO` = SAP `CreditAccountSummary.DaysSalesOutstanding` (live), else trailing-window `max(mean, latest)` of `payments.days_to_pay`. Anchors: netTerms=30, riskCeiling=60. |
| `disputeRate` | **Dollar-weighted invalid rate** = `(Σ invalid-equiv deduction $)/(Σ deduction $) × 100`; PARTIAL counts at 0.5 of its overclaim $. |
| `overLimitFrequency` | `clamp((peakExposure/creditLimit − 1)/0.40 × 100, 0, 100)` — 40%-over-limit = max. peakExposure from SAP `CreditExposure` / blocked-order amount. |
| `agingConcentration` | % of open AR in oldest bucket. **SAP aging grids failed probe (HTTP 500)** → derive from open-invoice age distribution (`invoice_date` vs run date) at runtime. |

Seed-42 expected values → `customers.r_score_component_scores_json`:

| Customer | `agingConcentration` | `disputeRate` | `dsoAdp` | `overLimitFrequency` | Grounding |
|---|---|---|---|---|---|
| **Harbor** `USCU_S04` | `60.0` | `71.0` | `70.0` | `70.0` | Fully source-derived: DSO 51 (live), invalid $ (11,500 + 0.5·15,900)/27,400, order 640,010/limit 500,000 = +28% |
| **Crestline** `USCU_L10` | `15.0`† | `73.1` | `10.0`† | `0.0` | disputeRate = (21,300+18,400)/54,300 source-derived; aging/dso = **owner default** (no payment seed) |
| **ValuMart** `USCU_S07` | `20.0`† | `56.4` | `15.0`† | `0.0` | disputeRate = 12,700/22,500 source-derived; aging/dso = **owner default** |
| **Greenleaf** `USCU_S03` | `25.0`† | `0.0` | `20.0`† | `0.0` | disputeRate = 0/8,200 source-derived; aging/dso = **owner default** |

† **Owner demo default — not source-derived.** Only Harbor has seeded `payments`/exposure. For the other three, `dsoAdp` and `agingConcentration` are owner-set placeholders pending SAP live `DaysSalesOutstanding` + open-invoice ages at runtime (SAP-primary path will overwrite these on a live read). This is the one real data gap in the set.

## R2-3. Decision-confidence gate → `recoup_config.key='decision_confidence_threshold'`

```json
{ "threshold": "0.80" }
```

**Deterministic source of the confidence score (not LLM-asserted):**
`confidence = 0.40·evidenceCompleteness + 0.30·sourceAgreement + 0.30·ruleMatchStrength`, each ∈ [0,1], all computed by code:
- `evidenceCompleteness` = required evidence fields present / required for the scenario type (e.g. S1 = POD + carrier report + photos).
- `sourceAgreement` = independent sources corroborate the verdict (e.g. POD signed_qty vs invoiced qty; billed price vs contract price).
- `ruleMatchStrength` = exactness of the deterministic trigger (exact contract-price match, exact accrual-cap breach = 1.0).

Verdicts with `confidence ≥ 0.80` flow to the standard draft-stage lane (still HITL, draft-only, I-24); `< 0.80` route to enhanced human review before staging. Note: `remittance_headers.ocr_confidence` (0.965) is **input OCR quality**, a feed into `evidenceCompleteness` only — **not** the verdict confidence. Blend weights configurable.

## R2-4. OpenAI evidence vector store — APPROVED to create

**Codex: create and populate the vector store using the existing API key.** Capture the returned ID into `.env.local` as `OPENAI_EVIDENCE_VECTOR_STORE_ID=vs_...` (do not commit; do not paste in chat or this doc).
- **Upload policy:** ingest evidence dossiers (POD, carrier reports, contracts, promotions, remittances) for the seed-42 set; re-index whenever the seed is regenerated (deterministic corpus).
- **Required citation metadata per file/chunk:** `source_table`, `record_id` (`invoice_ref`/`pod_id`/`promo_id`/`contract_id`/`remittance_id`), `customer_id`, `scenario_type`, `provenance=synthetic` — so `fileSearchTool` citations resolve back to a record (I-17/I-18).

## R2-5. Production source mappings — confirmed: R1 set only

**No broader production mappings beyond the R1 SAP-primary / Supabase-fallback set.** Production expansion is deferred (out of R1 scope). Confirmed R1 contract:

| Need | SAP entity (primary) | Key field | Supabase fallback | Refresh owner | Record ID format |
|---|---|---|---|---|---|
| Invoice | `C_BillingDocumentFs` | `BillingDocument` | — (SAP live) | SAP adapter | `9000xxxx` (8-digit) |
| Sales order | `A_SalesOrder` | `SalesOrder` | — | SAP adapter | 4-digit (`6533`,`6534`) |
| Credit account / DSO | `CreditAccountSummary` | `BusinessPartner`+`CreditSegment` | — | SAP adapter | `USCU_xxx` / seg `1000` |
| Credit exposure | `CreditExposure` | `BusinessPartner` | — | SAP adapter | `USCU_xxx` |
| Dispute case | `DisputeCase` | `DisputeCaseID` | — | SAP adapter | `FIN-DISP-xxx` |
| Accrual cap | `PeriodicAmounts` | `AccrualObject` | `promotions.accrual_cap` | Supabase (authoritative) | `PM_xxxx_nn` |
| Outbound delivery | `Delivery` (501) | — | `pod_records` | Supabase | `DEL_xxx_nn` |
| Credit memo (G2) | `C_BillingDocumentFs` type=`G2` (no rows) | `BillingDocument` | dedup proof + `DisputeCase` | Supabase | `9000xxxx` |
| Carrier damage | — | — | `carrier_reports`/`damage_photos` | Supabase | UUID |
| Payment history | — | — | `payments` | Supabase | UUID |

## R2-6. Build-time verification flags

| Flag | Value | Status |
|---|---|---|
| SAP sandbox identity | `crown.sapvista.com:44300`, client `100`, user `HCLTECH` | ✅ **Confirmed** (matches `O2C_DATA_MAP.md` probe header) |
| Embeddings model ID | `text-embedding-3-large` | ⚠️ Owner confirm — recommended unless your account standard has moved; must match the model used to build the vector store |
| Codex build model ID | (current Codex CLI/cloud default) | ⚠️ Owner confirm at CLI — **build-time only, never a runtime model**; runtime models stay pinned: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-realtime-2` |

Secrets/IDs (`OPENAI_EVIDENCE_VECTOR_STORE_ID`, SAP creds, API key) → `.env.local` only.
