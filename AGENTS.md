# AGENTS.md — Recoup v2 build protocol

> **Load-bearing rule:** the model *decides what to compute and what to do*; **code computes every dollar**, every **decision cites its evidence + deterministic basis**, and **a human approves every external action**. No model ever asserts a dollar figure that reaches a finding or a decision.

This file is permanent context for every Codex session. It is a **table of contents, not an encyclopedia**. Deep design lives in `Recoup_v2_SDD.md`; the contract lives in `INVARIANTS.md`; facts are locked in `RECONCILIATION_LEDGER.md`; per-session scope is given at session start.

**Scope (locked).** Four capabilities on a deterministic spine: **A. Closed-Loop Risk Mesh · B. Deduction Forensics & Recovery (hero) · C. Dynamic Credit Sentinel · D. Behavioral Containment.** Runtime: **Node 22 + TypeScript** (modular monolith). Offline deterministic dataset generation: TypeScript `datagen/` (seed 42). Descoped: billing-reconciliation breadth, clause skills, pre-issue invoice validation, ERP write-back, autonomous action.

---

## 1. Precedence (conflict resolution)

`INVARIANTS.md` > `RECONCILIATION_LEDGER.md` > referenced SDD section > this file > model judgment.

Higher source wins. If a conflict seems wrong, **stop and ask** — do not resolve it by guessing.

## 2. The four rules

1. **Ask, never invent.** If the SDD, Appendix G, INVARIANTS, or the Ledger leave a decision open — a threshold, weight, schema field, file location, status value — stop and ask. **Never guess a constant. The Risk-Mesh arbitration P&L weights are EXPERT-OWNED: never invent them** (SDD §5.7, Appendix G).
2. **Exactly the spec.** Implement what the referenced SDD section specifies. No extra features, abstractions, or generality. Specced structure (Source port, hash chain, Zod schemas, agent-boundary guardrails, tool/service guardrails, decision-layer guards) is a requirement, not gold-plating — never remove it. Tool guardrails are required around every decision-producing function tool because agent-level input/output guardrails do not run at every handoff or agents-as-tools boundary.
3. **Surgical diffs.** Touch only the files named for the session; within them, only task-relevant lines. No renames, reformatting, or refactor-in-passing — formatting belongs to the pre-commit hook. The diff reads as one intentional change.
4. **Done = check passes.** Every session states its success check up front (failing test → green; invariant holds; eval metric met). Prose claims of completion do not count.

## 3. Session protocol

1. **Context load:** this file + `INVARIANTS.md` + the SDD sections named in the brief + the locked interfaces (`src/types/entities.ts`, `config/`). **Do not** load the full SDD/BRD/Ledger.
2. **PLAN:** propose a stepwise plan (files, functions, tests). Wait for approval. *(plan-then-execute)*
3. **EXECUTE — tests first:** for any rule, guard, score, or decision-producing code, write the failing test before the implementation. *(TDD as primary guardrail)*
4. **Gates after every change:** `npm run lint && npm run typecheck && npm run test`. Full guard: `npm run verify` (adds `dependency-cruiser` port-purity check + eval gates).
5. **Self-verification + senior-critique pass:** explain the change, name the likeliest bug, rate confidence (low/med/high); then run a second "senior engineer" critique pass over your own diff before declaring done.
6. **Validate vs spec:** re-read the referenced SDD section and list every inconsistency between it and the diff. Resolve or surface — never leave silent.
7. **Git-based safety:** work on a session branch; the human reviewer runs `git diff` and `npm run verify` independently and resets if the diff looks unsafe.
8. **Close:** summarize the change, flag risks, state which invariants the diff touches.

## 4. Repo map (TypeScript — see SDD §3.2)

```
src/
  agents/      forensics.ts recoveryDrafter.ts riskMesh.ts sentinel.ts containment.ts query.ts  prompts/*.md
  core/        expected.ts rules/ graph.ts risk.ts arbitration.ts partialHold.ts
  tools/       retrieval/{sap,docs,tpm,bureau}  actions/{draftRebill,draftOutreach,proposeTerms,proposeHold,routeBilling}
  adapters/    source.ts(port) sapOData.ts(read-only) docRepo.ts tpm.ts remittance.ts bureau.ts synthetic.ts
  guardrails/  input/pii.ts  tool/{explainability,noWrongfulContainment,amountClamp,evidencePack,intentEvidence}.ts  output/final.ts
  audit/       trail.ts (hash chain; findings + decisions + arbitration)
  services/    serviceLayer.ts approvals.ts conductor.ts cockpitApi.ts
  mcp/         server.ts (StreamableHTTP)  clients/
  memory/      session.ts compaction.ts
  middleware/  errors.ts logging.ts(Winston+correlationId) budgets.ts
  types/       money.ts(Decimal) entities.ts(Zod) variance.ts decision.ts
config/        models.ts thresholds.ts(Appendix G) weights.ts
datagen/       generate.ts (seed 42) gold/ manifests/      # offline deterministic generator
evals/         harness + graders (code-based; NOT hosted Evals)
tests/         invariants/ evals/ adapters/ unit/           # *.test.ts (vitest)
cockpit/       Next.js App Router + React + TS + Tailwind (3 surfaces; SDD §11)
AGENTS.md · INVARIANTS.md · RECONCILIATION_LEDGER.md · Recoup_v2_SDD.md · O2C_Collections_Design_System_v3.md · tokens.json · tokens.css · README.md
```

Detection, ranking, and routing are **services, not agents**. One rule = one module under `src/core/rules/`; one capability = one traceable specialist — so every claim greps to a named function/agent and its test (claim→code→test).

## 5. Never do

- `number` for money — `Decimal` (`decimal.js`) only.
- An LLM-computed or LLM-edited dollar amount anywhere in `src/core/` or agent outputs (I-1).
- An agent decision (deduction verdict, intent label, arbitration outcome, term/hold proposal) without cited `recordIds` + deterministic basis (I-17).
- Classify a deduction `invalid`/`partial` without referenced supporting documents (I-18); label a customer `gaming` without cited behavioral evidence + R-score components (I-19).
- Dispatch any external action (recovery, term/limit, hold/freeze, Billing routing, correspondence) without the HITL gate (I-7, I-20).
- **Write back to the ERP** or construct a write-capable ERP client (I-26). The S2 billing loop is **draft-only** (I-23).
- Invent the arbitration weights or any Appendix G constant; instantiate non-pinned/fine-tuned models (I-24, I-25).
- Edit `datagen/`, `evals/`, `tests/`, or `audit/trail.ts` unless the brief names them — and never break S1–S8 gold-set parity (I-27).
- New dependencies without approval; free-form (non-Zod) tool calls; interpolate user content into tool instructions.
- Re-introduce descoped scope without an explicit brief; load the full SDD/BRD into a session.

## 5.1 Cockpit UI anti-slop standard

For `cockpit/` UI work, treat this as a standing review gate. Recoup must look like a premium B2B SaaS command surface, not a generic AI-generated dashboard. Subagents and reviewers must receive these constraints when working on Maya, David credit, David D5, or CFO views.

Avoid these high-signal generated-UI tells:

- Typography: all-caps tracked micro-labels, repeated eyebrow labels, gradient-clipped text, flat size hierarchy, crushed display tracking, single-font monotony, and oversized italic serif headlines.
- Color: default Tailwind indigo/violet/purple, blue-to-purple gradients, dark navy plus cyan glow, warm cream as a reflex, gray text on colored panels, and raw ad-hoc component hex values.
- Surface: card-everything layouts, nested cards, thick one-sided accent borders, hairline border plus wide diffuse shadow on the same surface, glassmorphism as decoration, over-rounded blob cards, and amateur hand-coded SVG illustration.
- Layout: centered generic max-width dashboards, identical three-up card grids, hero-metric blocks, numbered section markers, monotonous `gap-4` / `gap-6` rhythm, huge whitespace, and symmetric filler composition.
- Iconography: emoji icons, icon tiles stacked above headings, oversized rounded icon containers, mixed stroke/fill styles, and generated decorative icons where a proven vector icon system is available.
- Motion: `transition-all` everywhere, hover scale/rotate as default polish, bounce/elastic overshoot, floating blobs, and decorative animation that does not explain state.
- Copy: em-dash-heavy prose, manufactured contrast aphorisms, buzzword stacks, fake stats, "AI/powered by" badges without product value, and redundant label + sublabel + helper text.
- Data presentation: raw backend enum names as primary UI copy, unformatted action IDs, proof keys such as `verify-*` shown as business language, or placeholder values not backed by read models.

Do this instead:

- Use ImageGen mockups in `mockups/imagegen/` as visual north stars, then implement with real React components, backend/read-model data, tokenized CSS, and one consistent vector icon family.
- Build desktop-first, dense operational screens: persistent sidebar navigation, compact source health, table-led work areas, evidence/provenance panes, and persona-specific command surfaces.
- Keep every cockpit view wired to backend/API/read-model data. Static React-only persona UI is not acceptable; UI may format labels and statuses for humans, but it must not invent dollars, thresholds, scores, claims, or decision outcomes.
- Prefer hierarchy through alignment, density, typography, dividers, and state chips over decorative gradients, large cards, or explanatory filler.
- Before declaring a cockpit UI pass done, compare the runtime screenshot against the matching ImageGen cue for Maya, David credit, David D5, and CFO, and explicitly call out remaining visual deltas.
- Visual audit scores below `4/5` are not passable: `1/5`, `2/5`, and `3/5` remain failed/pending and cannot be marked complete.
- Persona work uses implementer subagent -> reviewer gate(s) -> verification -> handoff update. Stale or slow subagents must be terminated or replaced rather than waited on indefinitely.

## 6. Definition of done (per session)

Stated success check passes · `npm run verify` green · no unrelated lines in the diff · spec-validation produced no unresolved inconsistencies · `tests/invariants/` and the release-blocking eval gates (I-5, I-22, I-27, I-28) still green · senior-critique pass done.

## 7. Symphony build-time harness (optional, OpenAI-aligned)

This repo is built **agent-friendly** so Codex can run as a teammate. Optionally drive the build with **OpenAI Symphony** (a Codex orchestration spec — issue tracker as control plane): each build session below becomes an issue; Symphony assigns a per-issue Codex workspace governed by a repo `WORKFLOW.md` that encodes *these rules* (PLAN→tests-first→gates→self-critique→validate), and a human reviews each result. **Symphony is build-time only — it never appears in the Recoup runtime** (Dossier §6). If not using Symphony, run the same sessions interactively via Codex CLI (see the Setup Guide).

`WORKFLOW.md` front matter starts conservative: `approval_policy: on-request`; agents run only inside their issue workspace; terminal states stop the session; this `AGENTS.md` is the harness map. Build sessions (detail in the Setup Guide §8): S1 data+labels → S2 core rules+graph → S3 eval harness + FP/accuracy gates → S4 B hero (Forensics→Recovery) → S5 cockpit B surface → S6 one closed-loop (A/C/D) + audit + autonomy gauge.

## 8. Judge-experience / README contract

Judge/reviewer audit evidence belongs in `docs/independent-audit-log.md` and is summarized from `README.md`; chat-only audit notes are not release evidence unless captured there with code/test references.

Maintain a narrative `README.md` that wins the rubric (Best-Practice playbook): quantified problem + NorthBay user story (Relevance) · "How it works" with the System Design diagrams (Technical Excellence) · explicit **"How OpenAI is used"** section mapping each capability to Agents SDK primitives, GPT-5.5/5.4 routing, Realtime, MCP (Use of OpenAI Capabilities) · the claim→code→test traceability table (SDD Appendix D) · setup + live deployed link + recorded demo (Impact) · the scalability path (Scalability). Keep it re-runnable: one `npm run verify`, one deploy.
