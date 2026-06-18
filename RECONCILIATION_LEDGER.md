# Recoup v2 — Reconciliation Ledger (Phase A)

**Status:** Source-of-truth for the SDD, System Design, INVARIANTS, AGENTS.md, and Codex Setup Guide.
**Inputs reconciled:** `Recoup_Business_Requirements_Document.docx` (BRD v3.0, 2026-06-14) · `Agentic_O2C_Persona_Journey_v1.docx` (Persona Journey v1.0, 2026-06-17).
**Rule:** where the two inputs conflict, this ledger states the binding resolution. Downstream artifacts cite this file; they do not re-litigate it.

---

## 0. Ingestion verification (per sentence-ID coverage methodology)

| Document | Units (sentences + atomic structural lines) | Chunks (size 40) | Missing IDs | Status |
|---|---|---|---|---|
| BRD (`BRD-0001`…`BRD-0350`) | 350 | 9 | none | **PASSED** |
| Persona Journey (`PJ-0001`…`PJ-0205`) | 205 | 6 | none | **PASSED** |

Full ID→text map persisted as `ingestion_sentence_map.md` (audit artifact). No content was summarized, rewritten, or omitted during extraction.

---

## 1. Locked decisions (decision register)

| # | Decision | Resolution |
|---|---|---|
| 1 | Billing feedback loop | **Draft-only.** Forensics agent emits a structured prevention recommendation routed to Billing for human application. No autonomous ERP write-back. Prevented-leakage is a **projected / roadmap KPI**, not a live autonomous metric. Honors BRD §4 out-of-scope + HITL. |
| 2 | Dashboards built | **2 deep cockpits** (Maya forensics cockpit; David credit/arbitration cockpit) **+ a read-only CFO summary.** O2C-lead and Audit views are lighter/deferred. |
| 3 | Capability naming | **A/B/C/D with full names** from the Persona Journey (see §2). Old S1–S4 retained only as a crosswalk. |
| 4 | Symphony | **Build-time only.** Optional Codex orchestration harness (issue board → per-task agents, `WORKFLOW.md`-governed). Not in the product runtime SDD. Also a Use-of-OpenAI / Scalability narrative point. |
| 5 | SDD language | **Native TypeScript** module paths (`core/*.ts`). Python is offline-only (synthetic data generator, design-search script). |
| 6 | System Design | **Standalone document** with Mermaid diagrams. |
| 7 | Output format | `.md` files, matching existing repo convention. |
| 8 | Conversational query | **Text + voice.** Chat agent uses `gpt-realtime-2` for live spoken queries and text for typed queries; both answer with cited evidence. |

---

## 2. Canonical capability + persona naming (verbatim from Persona Journey)

**Capabilities (Release 1):**

| Label | Canonical name | One-line scope | Old crosswalk |
|---|---|---|---|
| **A** | **Closed-Loop Risk Mesh** | Supervisory agent arbitrates conflicting credit / fulfilment / billing / collections signals with a P&L-weighted decision + audit trail. Agent-to-agent negotiation, not workflow. | old S1 |
| **B** | **Deduction Forensics & Recovery** *(hero)* | Investigates each deduction (POD, contract, trade-promo), classifies valid/invalid/partial, routes valid claims to Billing, pursues recovery on invalid. | old S2 |
| **C** | **Dynamic Credit Sentinel** | Continuously re-underwrites every customer from payment-behavior drift, dispute patterns, external signals; proposes proactive term changes. | old S3 |
| **D** | **Behavioral Containment** | Intent-pattern detection (gaming vs. genuine operational issue); graduated response: soft warning → multi-criteria partial hold → full freeze → human escalation. | old S4 |

**Personas (2 deep + CFO summary):**

| Persona | Name / role | Primary / touched capabilities | Cockpit |
|---|---|---|---|
| P1 | **Maya R.** — Senior Deductions & Disputes Analyst, AR Operations | **B** (primary), D, A, billing loop | Forensics cockpit (built deep) |
| P2 | **David K.** — Director of Credit & Collections (O2C owner) | **C** (primary), A, D (partial hold) | Credit / arbitration cockpit (built deep) |
| — | **CFO / Finance leadership** | consumes A–D outputs | Read-only summary (built light) |

---

## 3. Canonical business context (treat as reference facts — Persona §2)

- **Manufacturer:** NorthBay Brands — mid-to-large CPG selling into grocery, club, wholesale, distributor, foodservice (+ growing DTC).
- **Core systems:** SAP S/4HANA (OTC, billing, AR) · TPM · 3PL/WMS for POD · credit-bureau feed · AR sub-ledger deduction backlog.
- **Customers in scope (4):**

| Customer | Profile | Behavioral signature |
|---|---|---|
| **Crestline Grocery** | Strategic retailer, ~$48M/yr, healthy payer | **Gaming** — repeated invalid shortage + pricing claims |
| **Harbor Foods** | Foodservice distributor, ~$9M/yr, Net-30 | **Distressed-but-honest** — DSO drift 32→51 days |
| **ValuMart Club** | Club channel, ~$22M/yr, strong margin | High OTIF/compliance-fine activity |
| **Greenleaf Naturals** | Regional wholesaler, ~$3.5M/yr | Frequent small, mostly-valid damage/pricing claims |

---

## 4. Canonical deduction test set — S1–S8 (corrected)

**Monday settlement run: 20 deduction lines across 4 customers, total $112,400.** This is the canonical gold set for the synthetic data generator and the eval harness.

| # | Customer | Scenario type | Lines | $ | Verdict & routing |
|---|---|---|---|---|---|
| S1 | Greenleaf | Damaged product, evidence received (photos + carrier report) | 3 | 8,200 | **VALID** → Billing: credit memo |
| S2 | Crestline | Valid promo, but invoice billed at list (promo not captured at invoicing) | 2 | 14,600 | **VALID** → Billing: credit + re-bill; root-cause to billing loop |
| S3 | Crestline | Shortage claim — POD shows full signed delivery | 4 | 21,300 | **INVALID** → recovery + gaming flag [D] |
| S4 | ValuMart | OTIF/compliance fine — fine valid per contract SLA | 2 | 9,800 | **VALID** → Billing: accept; feed carrier-performance signal |
| S5 | ValuMart | OTIF fine — delivery on time per 3PL POD timestamp | 3 | 12,700 | **INVALID** → recovery with timestamp evidence |
| S6 | Crestline | Pricing chargeback — deducted below contracted price | 2 | 18,400 | **INVALID** → recovery citing contract clause |
| S7 | Harbor | Promo overclaim — claimed allowance exceeds approved TPM accrual | 2 | 15,900 | **PARTIAL** → see §4.1 |
| S8 | Harbor | Duplicate / already-credited deduction | 2 | 11,500 | **INVALID** → recovery; duplicate-detection evidence |

**Reconciled rollup (verified arithmetic):**

| Bucket | Scenarios | Lines | $ |
|---|---|---|---|
| Valid → Billing | S1, S2, S4 | 7 | 32,600 |
| Recovery pursued | S3, S5, S6, S7, S8 | 13 | 79,800 |
| **Total** | all | **20** | **112,400** |

**Corrected vs. source.** The Persona Journey prose states "5 valid / 13 invalid ($66.6K) / 2 partial ($13.2K)" and "$32,600 incl. S7 valid portion." These are **internally inconsistent** — only the rollup above reconciles all three headline figures ($32,600 valid, $79,800 recovery, $112,400 total). The figures **discarded as erroneous:** "5 valid" (→ 7), "$66.6K invalid", "$13.2K partial", "$2,700 S7 valid portion."

### 4.1 S7 treatment — LOCKED (Option 1 applied)

S7 is labelled PARTIAL ("valid portion to Billing, overclaim recovered"), but the only line-and-dollar treatment that preserves the headline totals is:

> **Locked Option 1:** S7's $15,900 is the **overclaim above the approved TPM accrual** — pursued for recovery in full. The within-accrual portion was *already correctly deducted* by Harbor and requires **no NorthBay credit** (no Billing routing). S7 stays semantically "partial" (the broader claim was partly legitimate) but contributes $15,900 entirely to the recovery bucket.

Alternative Option 2 (split S7 into a Billing portion + a recovered portion) is explicitly rejected for Release 1 because it breaks the $32,600 / $79,800 / $112,400 figures and would require a new gold set. Downstream work **must** use Option 1.

---

## 5. Conflict resolutions (binding)

| Conflict | BRD position | Persona position | Binding resolution |
|---|---|---|---|
| ERP write-back / pre-invoice validation | **Out of scope** (BRD §4) | Billing loop "requires write-back into SAP pricing/condition layer (or pre-invoice validation service)"; prevented-leakage "a primary R1 KPI" (PJ §3.4, §5.2) | **Draft-only recommendation to Billing; no autonomous write-back. Prevented-leakage = projected/roadmap KPI.** (Decision 1) |
| Persona count | 5 dashboards (CFO, O2C lead, Credit, Analyst, Audit) | 2 deep personas (Maya, David) | **Build 2 deep cockpits + read-only CFO summary; O2C-lead & Audit deferred/light.** (Decision 2) |
| Determinism vs. "non-deterministic" partial-hold / Sentinel | "Code computes every dollar; deterministic basis" (load-bearing rule) | Partial-hold & Sentinel framed "non-deterministic" (agent adjusts weights) | **Composite score is deterministic given config weights.** Agent may *propose* weight changes within governance bands → **human approves**. The "non-determinism" is bounded, audited config proposal — never an un-reproducible calculation. |
| Partial-hold score → release-ratio mapping | n/a | 51.25 composite → "55% release" (mapping unexplained) | **Define the mapping as an explicit, deterministic function in SDD Appendix G.** Band 40–60 = partial; the exact ratio function (e.g., linear interpolation across the band) is specified there, not inferred at runtime. Worked example otherwise verified (weights = 100%, Σ = 51.25, 55% × $640K = $352K, back-order $288K). |

---

## 6. Partial-hold model — verified worked example (Harbor, David's journey)

| Criterion | Weight | Harbor input | Score (0–100) | Weighted |
|---|---|---|---|---|
| Order value vs. exposure headroom | 20% | $640K order vs. $500K limit ($140K over) | 35 | 7.00 |
| Customer segmentation / strategic value | 15% | Mid-tier distributor, growth channel | 60 | 9.00 |
| DSO / payment drift | 20% | 32 → 51 days (deteriorating) | 30 | 6.00 |
| Margin on order | 15% | High-margin holiday mix (~34%) | 80 | 12.00 |
| Revenue forecast for customer | 15% | Stable 12-mo forecast | 65 | 9.75 |
| Last 6 months payment pattern | 15% | On-time until last 2 months | 50 | 7.50 |
| **Composite** | **100%** | | | **51.25** |

→ Band 40–60 = partial release → **55% release = $352K ships now; $288K back-order** on revised terms (2/10 Net-30) + deposit/clearance condition; auto-release in tranches as Sentinel confirms improvement; continued drift re-opens the Risk Mesh. *(Weights configurable within governance bands; score→ratio function specified in SDD Appendix G.)*

---

## 7. OpenAI stack pre-commitments (full cited dossier = Phase B)

- **Agents SDK (TypeScript), code-first** on TS-stable primitives: Agents, handoffs / agents-as-tools, built-in HITL, Sessions, Tracing, agent-level guardrails at workflow edges, and tool/service guardrails around every decision/action function tool. Responses API as default.
- **Runtime models pinned to current lineup:** `gpt-5.5` (hero reasoning — arbitration, forensics classification, recovery drafting) · `gpt-5.4` / `gpt-5.4-mini` (extraction, routing, sub-classification) · `gpt-5.4-nano` (cheap routing) · `gpt-realtime-2` (conversational-query voice). **Codex build model is not a runtime dependency and must be verified at setup time.**
- **Retrieval:** embeddings + File Search / vector store for POD/contract/promo dossiers.
- **Evals:** **code-based deterministic harness** (seed 42, labelled S1–S8) — **not** the hosted Evals product (winding down Nov 30 2026).
- **No fine-tuning / RFT** (GPT-5.x family not fine-tunable; platform winding down).
- **MCP** for SAP S/4HANA connector + standard services (MCP-first policy retained).
- **Symphony** = build-time Codex orchestration option only.

---

## 8. Open `[VERIFY]` items carried into later phases

| ID | Item | Resolve in |
|---|---|---|
| V1 | TS availability of Agents SDK subagents / code-mode / long-horizon harness (Python-first as of Apr 2026) | Phase B / D |
| V2 | Whether ChatKit and the Evals **API** survive the AgentKit winddown (only Agent Builder + Evals *products* named) | Phase B |
| V3 | Concrete SAP S/4HANA sandbox/instance for the retrieval path (open dependency from BRD §15) | before Phase D §9 lock |
| V4 | S7 treatment | **Resolved: Option 1 locked in §4.1** |
| V5 | Fold `Architectural_Blueprint` + `Best-Practice_Patterns` project files into Phases B/D/F | Phase B start |

---

*End of Phase A. Next: Phase B — OpenAI Stack Dossier (cited capability→component mapping), incorporating V5.*
