# Recoup v2 — Software Design Document (SDD)

**Technical realization of BRD v3.1 and Persona Journey v1.2 (`docs/Agentic_O2C_Persona_Journey_v1_2.md`) · TypeScript-native · four capabilities (A/B/C/D).**
Self-contained. Binds to `RECONCILIATION_LEDGER.md` (source of truth), `OPENAI_STACK_DOSSIER.md` (stack), Persona Journey v1.2 (`docs/Agentic_O2C_Persona_Journey_v1_2.md`) for cockpit UX, and `INVARIANTS.md` (contract, I-1…I-30). Where this SDD and an input doc disagree, the Ledger governs.

| Field | Value |
|---|---|
| Product | Recoup |
| Document | Software Design Document |
| Version | 3.0 (TypeScript-native, scenario/capability-aligned) |
| Date | 2026-06-18 |
| Runtime | Node 22 LTS + TypeScript · modular monolith |
| Offline | Python (synthetic data gen, design search) — never in runtime |
| Stack | OpenAI Agents SDK (TS) · Responses API · GPT-5.5 / GPT-5.4 family · gpt-realtime-2 · MCP |

---

## 1. Introduction

### 1.1 Purpose & scope
Recoup detects, investigates, and recovers revenue leakage in the back half of order-to-cash and continuously re-prices customer risk, with a human approving every external action. This SDD specifies the technical realization of the four capabilities:

- **A — Closed-Loop Risk Mesh:** supervisory agent arbitrates conflicting credit/fulfilment/billing/collections signals on P&L criteria; agent-to-agent negotiation, fully audited.
- **B — Deduction Forensics & Recovery (hero):** investigates each deduction against retrieved proof, classifies valid/invalid/partial, routes valid to Billing (draft-only), pursues recovery on invalid.
- **C — Dynamic Credit Sentinel:** continuously re-underwrites each customer from payment-behavior drift + external signals; proposes proactive term changes.
- **D — Behavioral Containment:** distinguishes gaming from genuine operational stress; recommends a graduated, value-optimizing response (incl. the multi-criteria partial hold).

In scope per BRD §4; **out of scope:** billing-reconciliation breadth, clause extraction, pre-issue invoice validation, ERP write-back, autonomous action.

### 1.2 Audience
Build team (Codex sessions), O2C process owners, Finance sponsor, Internal Audit.

### 1.3 References
BRD v3.1; Persona Journey v1.2 (`docs/Agentic_O2C_Persona_Journey_v1_2.md`); Reconciliation Ledger; OpenAI Stack Dossier; INVARIANTS.md; Architectural Blueprint; Best-Practice Patterns.

### 1.4 Load-bearing rule (non-negotiable)
> **Code computes every dollar and every decision threshold. Models classify, retrieve, narrate, and draft — they never compute the number that drives an external action. A human approves every external action.** (Enforces I-1, I-7, I-17, I-20, I-24.)

---

## 2. Design goals & principles

| Principle | Realization |
|---|---|
| Determinism over agentic ambiguity | All `$`, scores, thresholds in `src/core/`; agents never do math (I-1, I-24) |
| Evidence-first | No decision without cited `recordIds` + deterministic basis (I-2, I-17, I-18, I-19) |
| Human-in-the-loop | Every external action halts at the approval gate; proposer ≠ approver (I-7, I-8, I-20) |
| Auditable by construction | Hash-chained immutable trail; arbitration records inputs/weights/resolution (I-9, I-21) |
| Reproducible | Seed 42; idempotent event IDs; data/spec lockstep on S1–S8 (I-4, I-13, I-27) |
| Modular monolith, ports-ready | One Node process; hexagonal ports are future service boundaries (Blueprint) |
| Config not rebuild | Thresholds/weights/policies in `config/` (NFR-12; I-24, I-25) |
| Use the OpenAI stack deliberately | Agents SDK primitives + GPT-5.5/5.4 routing + Realtime + MCP (Dossier §2) |

---

## 3. System architecture

### 3.1 Layered view (modular monolith, hexagonal ports)

```
                ┌──────────────────────────────────────────────────────────┐
   Personas →   │  COCKPIT (3 surfaces): Forensics (Maya) · Credit/Arb      │
                │  (David) · CFO summary  ·  conversational query (text+voice)│
                └───────────────┬───────────────────────────┬──────────────┘
                       REST + SSE (async-first)      Realtime (gpt-realtime-2)
                                │                           │
                ┌───────────────▼───────────────────────────▼──────────────┐
                │  SERVICE LAYER  (namespaced, whitelisted tools)            │
                │  approvals · actions(draft-only) · query · audit read      │
                └───────────────┬───────────────────────────┬──────────────┘
                                │                           │
        ┌───────────────────────▼──────────┐   ┌────────────▼──────────────┐
        │  AGENT LAYER (OpenAI Agents SDK)  │   │  HITL APPROVAL GATE        │
        │  Forensics · Recovery-Drafter ·   │   │  routed analyst→lead→fin   │
        │  Risk-Mesh(super) · Sentinel ·    │   │  (built-in HITL, SoD)      │
        │  Containment/Intent · Query       │   └────────────┬──────────────┘
        │  handoffs + agents-as-tools       │                │
        │  + agent-edge + tool guardrails   │                │
        └───────────┬───────────────────────┘                │
                    │ calls (read-only)                       │ writes
        ┌───────────▼───────────────────────┐   ┌─────────────▼─────────────┐
        │  DETERMINISTIC CORE (src/core)     │   │  AUDIT (hash-chained)      │
        │  expected · rules · graph · risk · │   │  src/audit/trail.ts        │
        │  arbitration · partialHold         │   └────────────────────────────┘
        └───────────┬───────────────────────┘
                    │ canonical entities only (port purity, I-12)
        ┌───────────▼───────────────────────────────────────────────────────┐
        │  ADAPTERS / PORTS (read-only):  SAP S/4HANA OData · Doc repo ·      │
        │  TPM · Remittance/EDI · Credit bureau/news · Synthetic (seed 42)    │
        │  via MCP where a standard connector exists (+ Secure MCP Tunnel)    │
        └────────────────────────────────────────────────────────────────────┘
```

### 3.2 Repo map (TypeScript; merges Blueprint `src/` layout with Recoup layers)

```
src/
  agents/        forensics.ts recoveryDrafter.ts riskMesh.ts sentinel.ts containment.ts query.ts
  core/          expected.ts rules/ graph.ts risk.ts arbitration.ts partialHold.ts schemas.ts(reexport)
  tools/         retrieval/(sap,docs,tpm,bureau) actions/(draftRebill,draftOutreach,proposeTerms,proposeHold,routeBilling)
  adapters/      source.ts(port) sapOData.ts docRepo.ts tpm.ts remittance.ts bureau.ts synthetic.ts
  guardrails/    input/(pii) output/(explainability,noWrongfulContainment,amountClamp)
  audit/         trail.ts
  services/      serviceLayer.ts approvals.ts conductor.ts(run control) cockpitApi.ts
  mcp/           server.ts (StreamableHTTP facade)  clients/
  memory/        session.ts compaction.ts
  prompts/       *.md (per agent; not stored prompt objects — I-25)
  middleware/    errors.ts logging.ts(Winston+correlationId) budgets.ts
  types/         money.ts(Decimal) entities.ts(Zod) variance.ts decision.ts
config/          models.ts thresholds.ts(Appendix G) weights.ts
datagen/         generate.ts (seed 42)  gold/  manifests/
tests/           invariants/ evals/ adapters/ unit/
```

### 3.3 Layer responsibilities
- **Cockpit:** read models + approval actions; SSE for streamed agent progress; Realtime for voice query. No business logic.
- **Service layer:** the single API surface; exposes namespaced, whitelisted tools (I-15); brokers approvals; reads audit.
- **Agent layer:** Agents SDK agents with pinned models, agent-level input/output guardrails at workflow edges, tool/service guardrails at each decision/action function-tool boundary, and `AgentHooks`; orchestrate via handoffs + agents-as-tools. **No math.**
- **Deterministic core:** all computation (expected, deltas, R-score, drift, gaming gate, partial-hold composite + ratio, arbitration score). Pure, typed, tested.
- **Adapters/ports:** return canonical entities only (I-12); read-only; SAP client has no write path (I-26).
- **Audit:** append-only hash chain; every finding, position, weight, decision, approver.

---

## 4. Data model

### 4.1 Canonical entities (`src/types/entities.ts`, Zod)
`Customer`, `Invoice`, `DeliveryItem` (POD proxy), `Remittance`, `DeductionLine`, `PromoAccrual` (TPM), `ContractTerm`, `Finding`, `Decision`, `RecoveryCase`, `RiskScore`, `RiskDriftEvent`, `IntentSignal`, `ContainmentAction`, `ArbitrationCase`, `TermProposal`, `PartialHoldDecision`, `ApprovalItem`, `AuditEntry`, `ErrorEvent`.

All monetary fields use `Money` (Decimal, I-3). All carry `recordIds: string[]` where they reference sources.

### 4.2 Relationship spine
`Customer 1—* Invoice 1—* DeductionLine`; `DeductionLine *—* {DeliveryItem, PromoAccrual, ContractTerm}` (evidence); `DeductionLine 1—1 Finding 1—1 Decision`; `Decision 1—? {RecoveryCase | ContainmentAction | TermProposal | PartialHoldDecision}`; every state change → `AuditEntry`. `Customer 1—* RiskScore`/`RiskDriftEvent`/`IntentSignal`.

### 4.3 Volume parameters (demo scale — full run in seconds, NFR-1)
4 customers (Crestline, Harbor, ValuMart, Greenleaf); 20 deduction lines / $112,400 (S1–S8); ~60–120 invoices; ~24 months synthetic payment history per customer for drift; 1 over-limit order (Harbor $640K). Tunable in `datagen/`.

### 4.4 Synthetic generator, gold set & labels (`datagen/generate.ts`)
Deterministic (seed 42, I-13). Emits the **canonical S1–S8 gold set** (Ledger §4) as CSVs + SAP-OData-shaped JSON payloads, plus label files: per-line validity (`valid|invalid|partial`), per-customer intent (`gaming|distressed-honest|genuine`), arbitration expert labels, and a noise set (legitimate signals that must not fire — I-5, I-22). Totals asserted by `evals/gold-set-parity.test.ts` (I-27).

**Canonical gold set (binding):**

| # | Customer | Type | Lines | $ | Label / routing |
|---|---|---|---|---|---|
| S1 | Greenleaf | Damaged, evidence received | 3 | 8,200 | VALID → Billing credit memo |
| S2 | Crestline | Promo billed at list (not captured) | 2 | 14,600 | VALID → Billing credit+re-bill; **draft** prevention rec |
| S3 | Crestline | Shortage, POD shows full delivery | 4 | 21,300 | INVALID → recovery + gaming flag |
| S4 | ValuMart | OTIF fine valid per SLA | 2 | 9,800 | VALID → Billing accept |
| S5 | ValuMart | OTIF fine, POD on-time | 3 | 12,700 | INVALID → recovery (timestamp) |
| S6 | Crestline | Pricing below contract | 2 | 18,400 | INVALID → recovery (contract) |
| S7 | Harbor | Promo overclaim > accrual | 2 | 15,900 | PARTIAL (Option 1: overclaim recovered in full) |
| S8 | Harbor | Duplicate/already-credited | 2 | 11,500 | INVALID → recovery (duplicate) |

Rollup: **Valid→Billing 7 / $32,600 · Recovery 13 / $79,800 · Total 20 / $112,400.**

---

## 5. Deterministic core design (`src/core/`)

All functions pure and unit-tested; identical inputs → identical outputs.

### 5.1 Expected-value reconstruction (`expected.ts`)
For each deduction line, reconstruct the *expected* position from sources: contracted price × delivered qty (POD), approved promo accrual (TPM), contract SLA. Produces `expected`, `actual` (claimed/deducted), `delta` — all `Money`.

### 5.2 Variance/rule framework (`rules/`)
Pluggable rule registry keyed by deduction type → produces a `Finding{ruleId, recordIds, deltaAmount, basis}`. Rules in scope map to S1–S8 types: damaged-goods evidence match, promo-capture-gap, shortage-vs-POD, OTIF-vs-POD-timestamp, pricing-vs-contract, promo-overclaim-vs-accrual, duplicate-detection. `eventId = sha256(ruleId, sorted(recordIds), period)` (I-4).

### 5.3 Structural-credibility graph (`graph.ts`)
Corroboration scoring across sources (does POD + carrier + photo agree?) → a credibility weight used for worklist ranking and false-positive suppression (I-5). Not a dollar; informs ordering only.

### 5.4 Risk: R-score & R-drift (`risk.ts`) — C
- **R-score** = weighted function of payment-behavior components (DSO/ADP, dispute rate, over-limit frequency, aging concentration). Weights = **Day-1 tunable**, Appendix G.
- **R-drift** = material change vs. trailing baseline; trigger threshold = Day-1 tunable. Drift event → Sentinel proposal + (if breach) re-opens Risk Mesh (closed loop).

### 5.5 Intent & gaming-candidate gate (`risk.ts`) — D
Deterministic gaming-candidate gate over deduction history (repeat invalid-shortage/pricing pattern, correlation with promo events). Produces candidate flag + component breakdown; the **agent narrates intent**, but the gate decides candidacy (I-19). Gate params = Day-1 tunable, Appendix G.

### 5.6 Multi-criteria partial-hold (`partialHold.ts`) — D
Six weighted criteria (Ledger §6) → composite `C ∈ [0,100]` = Σ(score·weight). **Score→release-ratio is a deterministic function** (I-24):

```
band:   C < 40            → release 0%   (full hold)
        40 ≤ C ≤ 60       → partial: releaseRatio = clamp(ceil(C/5)*5, 40, 70) %
        C > 60             → release 100% (ship)
```
Worked example: C = 51.25 → `ceil(51.25/5)*5 = 55%` → $352K ship / $288K back-order. Weights, bands, and step are **Day-1 tunable** (Appendix G); any agent-proposed weight change is clamped to governance bands and routed to HITL — never self-applied (I-24).

### 5.7 Arbitration P&L score (`arbitration.ts`) — A
Collects each function's position/option (credit, fulfilment, billing, collections), computes ranked resolution options with quantified P&L trade-offs = Σ(optionValue · **expertWeights**). **Arbitration weights are expert-owned constants**: Day-1 demo values are owner-ratified in config-as-code seed rows, Codex must never invent or change them, and production calibration remains VERIFY-PROD (Appendix G). The supervisory agent explains and recommends; code computes; human approves (I-7, I-21).

### 5.8 Idempotency, determinism, replay
Pure core + fixed seed + hash-keyed events → a sweep replays byte-identical (I-4, I-13).

---

## 6. Agent layer design (`src/agents/`, OpenAI Agents SDK — TS)

### 6.1 Roster & pinned models (`config/models.ts`)

| Agent | Capability | Model | Tools (read/draft only) | Guardrails |
|---|---|---|---|---|
| **Forensics Investigator** | B | `gpt-5.5` (reasoning med/high) | retrieval.{sap,docs,tpm}; calls core via service | input: PII; output: explainability(I-17), evidence-pack(I-18) |
| **Recovery Drafter** | B | `gpt-5.4` | `draftRebill`, `draftOutreach`, `routeBilling`(draft) | output: amountClamp(I-6), explainability |
| **Risk-Mesh Supervisor** | A | `gpt-5.5` (reasoning high) | agents-as-tools: gathers function positions; `arbitration` core | output: arbitration-audit(I-21), explainability |
| **Sentinel** | C | `gpt-5.4` (+`5.4-mini` extraction) | retrieval.bureau; `risk` core; `proposeTerms`(draft) | output: explainability(I-17) |
| **Containment / Intent** | D | `gpt-5.4` (+`5.4-nano` features) | `risk` gate; `partialHold` core; `proposeHold`(draft) | output: noWrongfulContainment(I-22), intent-evidence(I-19) |
| **Conversational Query** | all | `gpt-realtime-2` (voice) + `gpt-5.4` (text) | fileSearch + audit/read; answers with cited evidence | output: explainability |

### 6.2 Orchestration — handoff-first, deterministic dispatch
- **Maya/B run:** Forensics fans out per-line via **agents-as-tools** (parallel), classifies, then **handoff** to Recovery Drafter for invalid/partial; valid lines → `routeBilling` (draft); gaming pattern → handoff to Containment (D).
- **David/A run:** Risk-Mesh Supervisor pulls credit (Sentinel/C), fulfilment, billing, collections positions via agents-as-tools; `arbitration` core computes ranked options; partial-hold (D) computes ratio; supervisor presents → HITL (David). On approval, actions stage (still draft until executed by human-confirmed tool).
- TS-stable primitives only (handoffs, agents-as-tools, HITL, guardrails). Subagents/code-mode deferred (`[VERIFY-TS]`, Dossier §4).

### 6.3 Skills (versioned `SKILL.md` bundles)
Recovery correspondence templates per claim type and evidence-pack assembly are mounted as **local skills** (Blueprint `skills({path})`); privileged code, reviewed, versioned (I-15).

### 6.4 Confidence & autonomy model
Every decision carries `confidence`; below the Appendix-G threshold → routes to a human (never auto-resolves; NFR-9). Autonomy-readiness gauge (O2C-lead view) tracks decision accuracy by capability as the basis for *future* supervised autonomy — **not** Day-1 autonomy.

### 6.5 Run control & failure semantics (`services/conductor.ts`)
Per-phase token/step budgets + retry caps (Appendix G; I-16). `AgentHooks.on_start/on_end` open/close audit spans + DB handles. A failing tool emits a compact `ErrorEvent` and yields a labelled partial result, not an outage (NFR-8). Context **compaction** for long runs (Dossier §4).

---

## 7. Interfaces & contracts

### 7.1 Service layer — namespaced, whitelisted tools (`services/serviceLayer.ts`)
`approvals.*`, `actions.*` (all draft-only), `query.*`, `audit.read`. No free-form execution (I-15). All inputs Zod-validated at the edge (Blueprint coding standard).

### 7.2 Typed canonical source port (`adapters/source.ts`)
One interface; adapters (SAP, docs, TPM, remittance, bureau, synthetic) implement it and return canonical entities only (I-12). Swap synthetic↔real by config.

### 7.3 Cockpit API (REST + SSE; async-first, streamed)
REST for reads/approvals; **SSE** streams agent progress (Blueprint: SSE over WebSockets). Realtime endpoint for voice query.

### 7.4 Action-tool signatures (whitelisted, bounded, draft-only)
`draftRebill`, `draftOutreach`, `proposeTerms`, `proposeHold`, `routeBilling` — each returns a **proposed** artifact that lands in the approval inbox; none mutates an external system (I-7, I-20, I-26). `routeBilling` for S2 also attaches the **draft prevention recommendation** (I-23) — no ERP write-back.

### 7.5 SAP S/4HANA OData adapter (`adapters/sapOData.ts`) — read-only
Retrieves billing document, delivery item (POD proxy), reference documents for a deduction case. **Read-only client; no write method constructed** (I-26). `[VERIFY-V3]` concrete sandbox/instance is an open dependency (BRD §15) — synthetic adapter is the staged fallback.

### 7.6 MCP facade + Secure Tunnel (`mcp/server.ts`)
Standard services exposed via `StreamableHTTPServerTransport` (Blueprint). For a private/on-prem SAP, the **Secure MCP Tunnel** is the scale path (Dossier §1). MCP-first where a standard connector exists (BRD §7).

---

## 8. Sequence flows

### 8.1 Maya — Deduction Forensics run (B)
1. Settlement run ingests 20 lines (4 customers). 2. Forensics retrieves dossier per line (SAP+docs+TPM) and fans out via agents-as-tools. 3. Core computes expected/actual/delta + rule findings; graph scores corroboration. 4. Verdicts (valid/invalid/partial) emitted with cited evidence (I-17/I-18). 5. Valid 7/$32,600 → `routeBilling` (draft; S2 attaches prevention rec). 6. Invalid+partial 13/$79,800 → Recovery Drafter builds packets (clamped to delta, I-6). 7. Crestline repeat-invalid → gaming candidate (D). 8. Items → HITL inbox (Maya approve/modify/reject; SoD). 9. On approval, audit entries written; nothing dispatched without the human (I-20).

### 8.2 David — Risk Mesh + partial hold + Sentinel (A·C·D)
1. Sentinel re-underwrites Harbor: R-score + R-drift (32→51 DSO, dispute spike, lien) → risk narrative + drift event (C). 2. $640K over-limit order triggers conflict (sales ship vs. credit hold). 3. Risk-Mesh gathers positions via agents-as-tools; `arbitration` computes ranked options (expert weights). 4. `partialHold` computes composite 51.25 → 55% (deterministic, I-24). 5. Supervisor presents ranked resolution + back-order plan + draft revised terms (2/10 Net-30 + deposit) → HITL (David). 6. David adjusts P&L weighting within bands, approves; arbitration inputs/weights/resolution audited (I-21). 7. Approved actions stage as drafts; human-confirmed execution only. 8. Sentinel sets re-underwrite checkpoint; further drift re-opens the Mesh (closed loop).

### 8.3 HITL approval flow (cross-cutting)
Proposed action → routed by authority (analyst→lead→finance) → approve/modify/reject (proposer ≠ approver, I-8) → audit entry → (human-confirmed) execution. Ambiguous/low-confidence → human, never auto (NFR-9).

---

## 9. Security & guardrails (bilateral, hook-based)

- **Guardrail placement:** agent-level input/output guardrails protect the workflow edges, while tool/service guardrails protect every decision-producing or action-producing function tool. This is required because agent-level guardrails do not automatically run at every handoff boundary. PII checks (I-14), explainability tripwires (I-2/I-17), amount clamp (I-6), no-wrongful-containment (I-22), evidence-pack completeness (I-18), and intent-evidence checks (I-19) must be enforced at the tool/service boundary that writes the decision or proposed action.
- **Authority, SoD, PII:** RBAC per persona; proposer ≠ approver (I-8); PII protected before model context (NFR-7).
- **Tool-execution security:** whitelisted, bounded tools only (I-15); sandboxed local skills; blast radius limited (Blueprint).
- **Immutable audit (`audit/trail.ts`):** `entryHash = sha256(payload + prevHash)`; tamper detectable (I-9).
- **Key governance (Blueprint):** per-environment keys (no flat key), no client-side keys, no `dangerouslyAllowBrowser`, cost hard-caps, IP allowlist; KMS/Vault + Secure MCP Tunnel are the scale path.

---

## 10. Evaluation & observability

### 10.1 Metrics & targets (release-blocking gates)
| Gate | Target | Invariant |
|---|---|---|
| Deduction-validity accuracy | ≥ 0.90 | I-28 |
| Intent precision | ≥ 0.90 | I-28 |
| Arbitration agreement | ≥ 0.85 | I-28 |
| Detection FP gate (noise never fires) | 0 false fires | I-5 |
| Decision FP gate (good accounts never contained; valid docs never pursued) | 0 violations | I-22 |
| Gold-set parity (20/$112,400; 7/$32,600; 13/$79,800) | exact | I-27 |

### 10.2 Method
Code-based eval harness (Dossier §1 — **not** the deprecated hosted Evals; Promptfoo optional) over the seed-42 labeled S1–S8 + noise set. `npm run verify` runs typecheck + vitest + dependency-cruiser + gates; CI red on any failure.

### 10.3 Observability
Agents SDK **tracing**; Winston JSON logs + correlation IDs across async hops (Blueprint); SSE progress to cockpit; Langfuse optional at scale.

---

## 11. Cockpit / UI surfaces

Cockpit UX is governed by Persona Journey v1.2 (`docs/Agentic_O2C_Persona_Journey_v1_2.md`), especially §§4-8; that document supersedes this SDD section for cockpit UX details.

Three surfaces (Decision 2): **Forensics cockpit (Maya)** — pre-triaged 8-card queue, evidence dossier, verdict+confidence, action inbox, recovery tracker, retrieval status. **Credit/Arbitration cockpit (David)** — portfolio risk board, watchlist, arbitration view with ranked options, partial-hold scoring view, term proposals, approval inbox. **CFO summary (read-only)** — gross-to-net, margin protected, DSO/CEI, leakage position, what-changed, AI insight. All five common capabilities (BRD §11): what-changed, AI insight, conversational query (text+voice), trend/forecast, drill-down to records (NFR-5/10/4). Design system per `O2C_Collections_Design_System_v3.md`, `tokens.json`, and `tokens.css` (IBM Plex Sans; layered semantic tokens; exhaustive component states — Blueprint §UI).

---

## 12. Deployment & runtime; scalability path

**Day-1:** single Node 22 process behind an ALB; SSE streaming; non-blocking I/O (no PM2). SIGTERM graceful shutdown; connection pooling (Blueprint).
**Scalability narrative (deferred, Dossier §5):** extract async agent/worker tier at hexagonal ports; **BullMQ+Redis** (token-bucket + backoff); **Temporal.io** (durable HITL); **A2A** interop; **Connector Registry**; **KMS/Vault**. New entity = config, not rebuild (NFR-2).

---

## Appendix A — Python→TypeScript note
Runtime and the offline deterministic generator are native TypeScript; the design-search script may use Python outside the runtime path. No Python in the runtime path (I-25 spirit).

## Appendix B — *(reserved)* clause skills descoped
Per BRD §4 and INVARIANTS I-10/I-11 (retired).

## Appendix G — Constants & Day-1 tunables (`config/`)
**Distinction:** *Day-1 tunables* may be set to sensible defaults and adjusted by config; *expert-owned constants* must never be invented by Codex.

| Item | Type | Value / source |
|---|---|---|
| Seed | fixed | `42` (I-13) |
| R-score component weights | **Day-1 tunable** | DSO/ADP, dispute-rate, over-limit-freq, aging-concentration — defaults set in `config/weights.ts`, sum = 1.0 |
| R-drift trigger | **Day-1 tunable** | material Δ vs. trailing baseline (e.g. ≥ N days DSO or tier change) |
| Gaming-candidate gate | **Day-1 tunable** | repeat-invalid count + promo-correlation thresholds |
| Partial-hold weights | **Day-1 tunable** | 20/15/20/15/15/15 % (Ledger §6), sum = 100% |
| Partial-hold bands & step | **Day-1 tunable** | hold<40; partial 40–60; ship>60; release step 5%; floor 40% / ceil 70% |
| Partial-hold score→ratio fn | **deterministic** | `clamp(ceil(C/5)*5, 40, 70)` within band (§5.6) |
| Term menu | **Day-1 tunable** | {Net-30, 2/10 Net-30, deposit %, temporary limit} |
| Decision-eval bars | **release blockers** | validity ≥0.90, intent ≥0.90, arbitration ≥0.85 (I-28) |
| **Arbitration P&L weights** | **EXPERT-OWNED / Day-1 ratified** | Owner-ratified Day-1 values live in governed config-as-code seed rows for the demo; Codex must read, cite, and preserve them, never invent or change them (§5.7). Production calibration remains VERIFY-PROD. |
| Run budgets / retry caps | **Day-1 tunable** | per-phase token/step caps; max retries (I-16) |

## Appendix C — `[VERIFY]` before lock
V1(TS subagents) · V3(SAP sandbox) · V6(embeddings model id) · V7(Codex model id). Arbitration weights have owner-ratified Day-1 demo values in governed config seed rows; production calibration remains VERIFY-PROD.

## Appendix D — Traceability (FR/NFR → capability → invariant → test)
| BRD ref | Capability | Invariant(s) | Test |
|---|---|---|---|
| FR-1,2,3 / O1 | B | I-1,I-2,I-17,I-18 | evals/accuracy-bars; invariants/deduction-evidence-pack |
| FR-4 / O1,O6 | B | I-6,I-23 | invariants/amount-clamp; billing-loop-draft-only |
| FR-5,6 / O2 | C | I-17 | evals/accuracy-bars (drift) |
| FR-7,8 / O4 | D | I-19,I-22,I-24 | intent-label-evidence; decision-fp-gate; partial-hold-determinism |
| FR-9 / O3 | A | I-21,I-28 | arbitration-audit; accuracy-bars |
| FR-10 / O1,3,4 | A,B,D | I-5 | fp-gate |
| FR-11,15 / O5 | all | I-7,I-8,I-20 | hitl-gate; sod; action-hitl-all-capabilities |
| FR-12 / O5 | all | I-9 | hash-chain-tamper |
| FR-13 / O5,6 | all | I-2,I-17 | explainability-tripwire |
| FR-14 / O7 | all | I-12,I-26 | adapters/canonical-only; no-erp-writeback |
| NFR-11 | all | I-4,I-13,I-27 | event-id-idempotent; seed-reproducible; gold-set-parity |
| NFR-12 | all | I-24,I-25 | partial-hold-determinism; pinned-models |

---

*End of SDD. Next: Phase E — System Design (Mermaid diagram set), then F — AGENTS.md, then G — Codex Setup Guide.*
