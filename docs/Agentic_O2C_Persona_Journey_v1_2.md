# Agentic Order-to-Cash Platform — Recoup v2
## Persona-Mapped Journey, Cockpit UX & Demo Storyboard

**Classification:** Internal
**Foundational input for BRD & SDD — now carrying the premium agentic UX layer**
**Industry:** Consumer Packaged Goods (CPG) | **Illustrative manufacturer:** NorthBay Brands
**Release scope (R1):** Closed-Loop Risk Mesh · Deduction Forensics & Recovery · Dynamic Credit Sentinel · Behavioral Containment
**Version 1.2 (UX-elevated, Codex-ready)** — Supersedes v1.1 — Date: 20 June 2026

> **Codex note:** This markdown file is the authoritative persona-journey + cockpit-UX source of truth. It **supersedes Persona Journey v1.1 and the one-paragraph cockpit spec in `Recoup_v2_SDD.md §11`.** Where this file and SDD §11 disagree on the cockpit, **this file governs.**
> All business facts, the gold set, and `INVARIANTS.md` remain authoritative and unchanged by this document.

---

## 1. Purpose & what changed in v1.2

This document keeps every locked fact from v1.1 — the NorthBay business context, the four customers, the two personas, and the canonical 20-line deduction set — and adds the layer v1.1 was missing: a screen-by-screen cockpit UX, a premium agentic component catalog, and a beat-by-beat demo storyboard that makes the multi-agent reasoning, multimodal evidence review, and live system health visible to a judging panel. Nothing here changes the gold set; it changes how the gold set is experienced and demonstrated.

Three premium surfaces are introduced and threaded through both journeys:

- **Multimodal Conversational Evidence Dock** — Maya can interrogate any verdict by typing or speaking, in Spanish or English; the dock spins off named retrieval sub-agents and answers strictly from cited evidence, in voice or text.
- **Multi-Agent Trace & Negotiation Visualizer** — the supervisor→specialist handoffs and the Risk-Mesh agent-to-agent negotiation render as an inspectable chain-of-work with each agent's position, P&L weight, confidence band, and a link to the immutable audit chain.
- **Live Tool-Status Rail** — a real-time health strip for every data source (SAP OData, TPM, 3PL POD, bureau, remittance/EDI, contract repo, MCP servers) with honest live / stale / synthetic provenance badges.

**Design discipline (anti-"AI-slop").** The cockpit reads as governed finance software, not a chatbot beside a dashboard. The operational core stays dense, sober, and chromatically quiet (IBM Plex Sans, tabular numerals, petrol-teal accent, status = colour + icon + text). The editorial calm (Newsreader serif, the one atmospheric colour moment) appears only at the margins — login, exec summary, empty states. Dark mode is scoped to the live command centre only. Per `O2C_Collections_Design_System_v3.md`, `tokens.json`, and `tokens.css`.

---

## 2. Canonical context (locked from v1.1)

NorthBay Brands — mid-to-large CPG selling to grocery, club, wholesale and foodservice. The pain: retailer deductions erode 2–5% of gross sales; <30% of invalid deductions are recovered; credit is static; order holds are blunt. The four customers and two personas are reference facts the SDD treats as canonical.

| Customer | Profile relevant to the journeys |
|---|---|
| **Crestline Grocery** | Large strategic retailer, ~$48M/yr. Aggressive deductor; history of gaming promo and shortage claims. Healthy payer. |
| **Harbor Foods** | Mid-tier foodservice distributor, ~$9M/yr, Net-30. Financially deteriorating; DSO drifting; honest but stressed. |
| **ValuMart Club** | Club channel, ~$22M/yr. High OTIF/compliance fine activity; large order volumes; strong margin contribution. |
| **Greenleaf Naturals** | Regional wholesaler, ~$3.5M/yr. Low-volume, frequent small damaged-goods and pricing claims; mostly valid. |

| Persona | Role, goals, capabilities touched |
|---|---|
| **Maya R.** | Senior Deductions & Disputes Analyst. Clear the backlog, recover invalid deductions, route valid ones correctly, stop repeat leakage. Capabilities: B (primary), D, A, billing feedback loop. |
| **David K.** | Director, Credit & Collections (O2C owner). Protect DSO and bad-debt, keep good customers shipping, arbitrate fairly, maximise the financial value of every hold/release. Capabilities: C (primary), A, D (multi-criteria partial hold). |

---

## 3. The canonical 20-line deduction set (S1–S8) — unchanged

Carried verbatim to stay lockstep with the gold set and invariant **I-27** (20 lines / $112,400; valid 7 / $32,600; recovery 13 / $79,800). S7 is semantically partial but its full $15,900 overclaim is pursued under Ledger Option 1.

| # | Customer | Scenario type | Lines | $ | Verdict & routing |
|---|---|---|---|---|---|
| S1 | Greenleaf | Damaged product, evidence received (photos + carrier report) | 3 | 8,200 | VALID → Billing: credit memo |
| S2 | Crestline | Valid promo applied, invoice billed at list (promo not captured at invoicing) | 2 | 14,600 | VALID → credit + re-bill; draft root-cause to Billing loop |
| S3 | Crestline | Shortage claim — POD shows full signed delivery | 4 | 21,300 | INVALID → recovery + gaming flag [D] |
| S4 | ValuMart | OTIF / compliance fine — valid per contract SLA | 2 | 9,800 | VALID → accept; feed carrier-performance signal |
| S5 | ValuMart | OTIF fine — delivery on time per 3PL POD timestamp | 3 | 12,700 | INVALID → recovery with timestamp evidence |
| S6 | Crestline | Pricing chargeback — deducted below contracted price | 2 | 18,400 | INVALID → recovery citing contract clause |
| S7 | Harbor | Promo overclaim — claim exceeds approved TPM accrual | 2 | 15,900 | PARTIAL → $15,900 recovered in full (Option 1) |
| S8 | Harbor | Duplicate / already-credited deduction | 2 | 11,500 | INVALID → recovery; duplicate-detection evidence |

---

## 4. Persona 1 — Maya R. : Cockpit Journey Map

Monday settlement run. 20 deduction lines across four customers totalling $112,400, pre-triaged overnight into eight scenario cards. Each row below names the screen, the state Maya sees, the agentic surface and premium component in play, and the HITL gate plus what writes to the immutable audit chain.

| Screen | What Maya sees | Agentic surface + premium component | HITL gate → audit write |
|---|---|---|---|
| **M1 · Settlement Worklist ("The Run")** | 20 lines collapsed into 8 scenario cards, ranked by recovery probability × value; valid (7) and recovery (13) pre-separated; per-card confidence shown as a labelled band (High / Likely / Uncertain), never a bare %. | Forensics service pre-triage (overnight). Tool-Status Rail across the top shows all sources live/synthetic. **Premium:** Scenario Cards + confidence bands. | None yet (read). Worklist load logged with run correlation-id. |
| **M2 · Scenario Detail + Evidence Dossier** | Three-pane: line items · a citation-backed case file · the Agent Dock. The verdict prose carries inline numbered citations to POD, contract, TPM, remittance; each citation chip shows source + retrieval timestamp + live/synthetic badge. | Forensics Investigator (B, gpt-5.5) retrieval via service tools. **Premium:** Evidence Dossier with inline citations; click-through artifact viewer with cited region highlighted. | Classify gate arms only after Maya opens ≥ 1 primary evidence chip (anti-rubber-stamp). Which evidence she viewed is logged. |
| **M3 · Multimodal Evidence Dock (hero)** | Maya asks "¿Por qué es válida esta deducción?". Type/Talk toggle; auto-detected "Detected: Español" chip; two-column live transcript (native + English); audible preamble while sub-agents work; barge-in supported. | Conversational Query agent (gpt-realtime-2 voice / gpt-5.4 text) spins off POD-Retriever, Contract-Reader, TPM-Matcher. Answer is spoken + written, grounded only in returned snippets. **Premium:** Multimodal Dock (subordinate side panel, no avatar, AI-voice disclosure). | Read-only Q&A. Every spoken claim carries the same recordIds as the text answer (**I-29**). Q&A turn appended to audit. |
| **M4 · Chain-of-Work Inspector** | Optional drawer: the run as a collapsible span tree (LLM gen, each tool call, each handoff, guardrail) + a timeline lane showing order and duration; each decision leaf links back to its dossier citation. | Renders OpenAI Agents SDK trace spans. **Premium:** Trace Visualizer (span tree + timeline replay). | Footer audit chip: mono hash + "tamper-evident" + verify affordance (**I-9**). |
| **M5 · Decision & Routing** | Per line: Route to Billing (valid) or Pursue Recovery (invalid/partial), each summarised in plain language with the code-computed delta and clamp shown. | Recovery Drafter (B, gpt-5.4) drafts correspondence/packets; routeBilling is draft-only with the S2 prevention recommendation attached. | HITL gate on every external action (**I-7/I-20**). Proposer ≠ approver (**I-8**). Verdict + evidence + approver + timestamp hash-chained. |
| **M6 · Containment hand-off** | Crestline's repeated invalid shortage + pricing pattern surfaces as a gaming flag with cited R-score components; staged graduated response (Soft → Hard → Hold) for Risk-Mesh review. | Behavioral Containment (D). **Premium:** pattern panel feeding the Negotiation Visualizer. | Intent label requires cited evidence + R-score breakdown (**I-19**). Flag written to audit; routed to David / Risk Mesh. |

---

## 5. Persona 2 — David K. : Cockpit Journey Map

Same week. Harbor Foods submits a $640,000 pre-holiday order that breaches its $500,000 limit; payment behaviour has drifted 32→51 days; a bureau alert shows a new tax lien. Sales wants to ship, Collections wants to hold. David arbitrates for maximum financial value — not a binary ship/freeze.

| Screen | What David sees | Agentic surface + premium component | HITL gate → audit write |
|---|---|---|---|
| **D1 · Sentinel Alert / Account-360** | Harbor at the top of a live portfolio risk board; account-360 header ($500K limit, $640K order, exposure); DSO sparkline 32→51 (tabular, labelled); bureau lien banner as a danger token (colour + icon + text). | Dynamic Credit Sentinel (C, gpt-5.4) continuous re-underwriting. **Premium:** portfolio risk board + behavioural drift sparkline. | None yet (read). Risk-drift event logged when raised. |
| **D2 · Partial-Hold Scoring Visualizer (hero)** | Six criteria rows, each with a locked weight, a 0–100 score, and a weighted-contribution bar; a live composite (51.25) maps through the deterministic band to a 55% release / 45% back-order split, plus a back-order plan (deposit + 2/10 Net-30). | `core/partialHold.ts` computes score and ratio (no LLM math). **Premium:** Scoring Visualizer with a sensitivity readout ("bureau-risk weight would need to fall from 0.25 to 0.10 before full release wins"). | Composite + ratio are deterministic and replayable (**I-24**). Score breakdown written to audit. |
| **D3 · Risk-Mesh Arbitration (hero)** | A negotiation graph: Supervisor node + Credit / Fulfilment / Billing / Collections specialist nodes, each showing its position, P&L weight, and confidence band; an A2A message timeline shows the trade-off being resolved. David can adjust a weight and watch the split recompute. | Risk-Mesh Supervisor (A, gpt-5.5) gathers positions via agents-as-tools; `core/arbitration.ts` applies expert-owned P&L weights. **Premium:** Negotiation Visualizer wired to live spans. | Every position, the weights used, and the resolution are hash-chained (**I-21**). David approves; proposer ≠ approver (**I-8**). |
| **D4 · Proactive Terms + Execute** | Drafted revised-terms proposal (Net-30 → 2/10 Net-30, temporary limit, deposit on the back-ordered balance); a staged action packet (credit-master change request, 55% release, back-order with conditions, Sales notification). | Sentinel (C) proposeTerms (draft); action-staging layer. All draft-only. | HITL on all external actions (**I-20**). No production ERP write-back (**I-26**). Approved packet + rationale hash-chained. |
| **D5 · Command Centre (dark mode)** | The only dark-mode surface: portfolio exposure, live bureau/behavioural signals, the full Tool-Status Rail, active arbitrations; the signature atmospheric moment lives here. | Live monitoring; Sentinel re-underwrites Harbor against new terms; threshold breach re-opens the Mesh. | Auto re-review scheduled; breach auto-triggers next arbitration, logged. |

---

## 6. Premium Agentic Component Catalog

Five components carry the "credible and crafted" differentiation. Each is named so the storyboard, the SDD, the design system, and the build agree on one vocabulary.

| Component | Purpose & key states | Design-system + anti-LLM rule | Persona / screen |
|---|---|---|---|
| **MultimodalDock** | Type/Talk toggle; push-to-talk default + optional open-mic/barge-in; language auto-detect + override; live two-column transcript; visible preambles; visible sub-agent spawn; voice answers mirror text + citations. **States:** idle, listening, transcribing, retrieving, answering, interrupted, error. | Subordinate right-side panel, never a centred bubble. No anthropomorphic avatar. "AI-generated voice" disclosure. Plex Sans body, Plex Mono for cited IDs. | Maya M3 (primary); available to David. |
| **AgentTraceVisualizer** | Collapsible span tree (LLM gen, tool calls, handoffs, guardrails) + timeline replay with durations; click any node for inputs/outputs; decision leaves link to evidence. **States:** streaming, complete, partial/error span. | Reads real Agents SDK spans — never a faked animation when shown as "live". Mono for IDs/hashes. Quiet, dense. | Maya M4; David D3. |
| **NegotiationGraph** | Supervisor + specialist nodes; per-node position, P&L weight, confidence band; A2A message timeline; active-agent highlight; weight-adjust re-runs deterministic split. **States:** negotiating, converged, escalated. | Graph is data-shaped from real positions/weights; if pre-computed for the demo it is labelled as such (provenance honesty). Petrol accent for active node only. | David D3 (primary); Maya M6 feed. |
| **ToolStatusRail** | One pill per source (SAP OData, TPM, 3PL POD, bureau, remittance/EDI, contract repo, MCP servers). **States:** live, degraded, stale (with as-of), synthetic (demo-data badge). Group rolls up to highest-attention state. | Carbon status pattern: colour + icon + shape + text, never colour alone. Synthetic can never render as live (**I-30**). | Global shell (both). |
| **AuditVerifyChip** | Mono hash + "tamper-evident" badge + append-only ledger reference + verify affordance (chain re-hash). **States:** verified, unverified, broken-chain. | Plex Mono. Present on every committed decision. No decorative colour; status semantics only. | Both — every approval. |

---

## 7. Demo Storyboard — "The Value-Retail Squeeze" (over NorthBay)

**Dramatic arc:** a value-retail margin squeeze is pressuring NorthBay's customers in a single week. Crestline games deductions to claw back margin; Harbor is genuinely distressed and over-orders pre-holiday. The same week produces a wave of deductions (Maya's run) and a credit breach (David's arbitration) — and the Risk Mesh is the backbone that ties Crestline's gaming flag and Harbor's distress into one auditable decision fabric.

**Target:** 5 minutes. Compress to 3 min with beats 1, 2, 4, 8, 9, 10. Expand to 8 min by adding 5b (live trace deep-dive) and 6b (billing feedback loop). Each beat names the rubric axis it scores and a build tag (see §8).

| Beat | On-screen state + agentic action | Narrator line | Rubric / build |
|---|---|---|---|
| **1 · Cold open** | Login (editorial moment, Newsreader, atmospheric bloom). Cut to the cockpit shell; Tool-Status Rail all green; two pills show a "synthetic" badge. | "One squeezed week at NorthBay. Six data sources live — and we tell you which two are demo data." | Innovation · LIVE |
| **2 · The Run** | Maya's M1: 20 lines → 8 scenario cards; valid 7 / recovery 13; confidence bands. | "Monday. $112,400 in deductions, pre-triaged overnight into eight cases — not twenty raw rows." | Impact · LIVE |
| **3 · The evidence** | Open S3 (Crestline shortage). Evidence Dossier: verdict prose with inline citations to the signed POD vs the shortage claim; click a citation → highlighted POD. | "Every verdict is grounded. Here's the signed POD for the full delivery the claim says was short." | Tech Excellence · LIVE |
| **4 · Ask it (Spanish)** | M3 dock: Maya taps Talk, says "¿Por qué es válida — perdón, inválida — esta deducción?". "Detected: Español" chip; sub-agents POD-Retriever / Contract-Reader / TPM-Matcher spawn visibly; spoken + cited answer; she barges in to interrupt. | "She asks in her own language. It spins up retrieval agents and answers — only from the documents, with the citations on screen." | Innovation · THIN-REAL |
| **5 · Approve** | Routing gate; Maya must have opened evidence first; one action routes valid to Billing / pursues recovery; AuditVerifyChip shows the hash. | "She approves — a human, never the agent. It's hash-chained the moment she does." | Tech Excellence · LIVE |
| **6 · The pattern** | M6: Crestline's repeat invalid shortage + pricing surfaces as a gaming flag with cited R-score components; hands to the Risk Mesh. | "This isn't one bad claim — it's a pattern. That insight leaves AR and reaches the decision backbone." | Innovation · THIN-REAL |
| **7 · The breach** | Switch to David D1: Harbor $640K over a $500K limit; DSO 32→51 sparkline; new-lien banner. | "Same week, same squeeze — now on the credit side. Harbor wants to over-order, and it's slipping." | Impact · LIVE |
| **8 · The math** | D2 Scoring Visualizer: six weighted criteria → composite 51.25 → 55% release / 45% back-order; sensitivity readout; back-order plan with deposit + 2/10 Net-30. | "Not ship-or-freeze. Code scores six factors, captures the high-margin holiday revenue, and risk-prices the rest — and shows what would change the call." | Impact · LIVE |
| **9 · The negotiation** | D3 Negotiation Graph: Credit / Fulfilment / Billing / Collections positions with P&L weights + confidence; David nudges a weight; the split recomputes deterministically; he approves. | "The agents negotiate; the P&L weights are expert-owned; the split is deterministic. David adjusts one weight and watches it resolve — then signs." | Innovation · NARRATE |
| **10 · Close** | AuditVerifyChip re-verifies the chain; CFO summary: recovered / in-flight / projected-prevented leakage, DSO/CEI; one scalability line. | "Every dollar code-computed, every decision cited, every action human-approved and tamper-evident — and the ports are already the scale path." | All four · LIVE |

---

## 8. Buildability ribbon (1 week, 2 people)

Each storyboard beat is tagged so the demo script and the build plan never diverge. Build the LIVE and THIN-REAL slices; narrate the rest over a recorded fallback.

| Tag | Beats | What it means for the build |
|---|---|---|
| **LIVE** | 1, 2, 3, 5, 7, 8, 10 | Fully real in the demo: worklist + scenario cards, evidence dossier with citations, partial-hold scoring + sensitivity, tool-status rail, append-only SHA-256 audit, CFO summary. Lowest risk, highest judge impact. |
| **THIN-REAL** | 4, 6 | One real path each: a single Spanish voice flow on S3 via WebRTC + gpt-realtime-2 (fallback: push-to-talk + chained pipeline); the gaming-pattern flag computed from real R-score components on real lines. |
| **NARRATE** | 9 (live A2A) | Risk-Mesh negotiation rendered from real positions/weights but as a scripted, animated reveal; the full live multi-agent negotiation and the production cryptographic ledger are described, not run live. Record a fallback video. |

---

## 9. Propagation — what Codex must accept

This v1.2 is the upstream narrative source of truth. The UX elevation propagates into the Codex-facing spec set, applied in precedence order so Codex never reads a stale spec. No business fact changes; `RECONCILIATION_LEDGER.md` is untouched and gold-set parity (**I-27**) is preserved.

- **SDD §11 is superseded for cockpit** — treat this v1.2 markdown as the cockpit UX source of truth; SDD §11 remains technical/background context for the screen-by-screen maps + the five-component catalog, with light touches to §10.3 (trace visualizer) and §6.4 (confidence as calibrated bands).
- **System Design** — update the Maya (§4) and David (§5) sequences and HITL (§6); add one diagram for the trace/negotiation data flow; extend the §10 rubric map.
- **INVARIANTS.md** — add two (**I-29** voice/text citation parity; **I-30** provenance honesty). Additions only, never weakened.
- **codex-handoff.md + O2C design system** — add MultimodalDock, AgentTraceVisualizer, NegotiationGraph, ToolStatusRail, AuditVerifyChip to the component primitives, UI build order, and component states.
- **CODEX_BUILD_ANSWERS.md** — short addendum tying the provenance badge to the B.0 source-swap boundary; AGENTS.md gets a one-line pointer to the updated §11.

*End of v1.2 — persona journey, cockpit UX, and demo storyboard.*
