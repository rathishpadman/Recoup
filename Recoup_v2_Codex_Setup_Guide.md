# Recoup v2 — Codex Build Setup & Step-by-Step Guide

### OpenAI stack · Node.js/TypeScript monolith · two-track Codex (ChatGPT-auth → API-based run)

| | |
|---|---|
| **Audience** | 2-person team · single Codex operator |
| **Companions** | `Recoup_v2_SDD.md` · `AGENTS.md` · `INVARIANTS.md` (I-1…I-28) · `RECONCILIATION_LEDGER.md` · `OPENAI_STACK_DOSSIER.md` · BRD v3.1 · Architectural Blueprint |
| **Timebox** | 1-week HCLTech OpenAI hackathon |
| **Status** | Setup guide — no product code is written in Phases 0–5; the build begins Phase 6 |

> **Two tracks, in order.** **Track 1 (interactive, ChatGPT auth)** — set up and *steer* the build interactively, signed in with ChatGPT. **Track 2 (API-based run)** — the same build run headless/unattended via an API key (CI and optional Symphony orchestration). Track 1 gets the slice working and reviewed; Track 2 makes runs reproducible and automatable.

---

## 0. How to read this guide
- **`[VERIFY]`** = version/command may drift; confirm against the linked doc before relying on it.
- **`[A]` / `[B]`** = teammate owner (A = Codex operator/backend, B = reviewer/cockpit+data). Adjust to your split.
- **`PROMPT`** blocks are copy-paste ready into a Codex session.
- **Rule:** nothing in Phases 0–5 writes Recoup product logic. Phase 6 is the first build slice. Do not skip Phase 4 — `AGENTS.md` is *also* Codex's live project-config file and steers every session.

---

## 1. Decision record (lock first)

| Concern | Decision | Why |
|---|---|---|
| Runtime | **Node.js 22 LTS + TypeScript**, modular monolith | mandatory stack; in-process agent↔core (SDD §3) |
| Money | **`decimal.js`** — `number` never touches an amount | I-3 |
| Schemas | **Zod** (requests *and* LLM structured outputs) | validate the model's output |
| Agent harness | **`@openai/agents` (TS)** — handoffs, agents-as-tools, guardrails, HITL, hooks, tracing | Dossier §4 (TS-stable) |
| API + streaming | **Express (async) + SSE** | `run_streamed` → SSE envelope |
| Cockpit | **Next.js + React + TS + Tailwind + Vercel AI SDK**; optional **ChatKit** for chat | 3 surfaces (SDD §11) |
| Tests/gates | **Vitest + ESLint + tsc + dependency-cruiser** | `npm run verify` |
| Eval gates | **Code-based harness** (Promptfoo optional) | hosted Evals deprecated (Dossier §1) |
| Models — build | **gpt-5.5** (default) · **gpt-5.4-mini** (lighter/subagent) | `gpt-5.3-codex`/`gpt-5.2` deprecated for ChatGPT auth `[VERIFY]` |
| Models — runtime | reasoning **gpt-5.5** · fast **gpt-5.4 / 5.4-mini** · voice **gpt-realtime-2** · embeddings `[VERIFY-V6]` | Dossier §3 |
| Python | offline only (`datagen/` seed 42; design search) | no runtime polyglot seam |
| Dev governance | **Superpowers** (brainstorm→plan→TDD→review) + **AGENTS.md** | how-to-build + repo-truth |
| Design intelligence | Supplied `O2C_Collections_Design_System_v3.md` + `tokens.json`/`tokens.css`; UI/UX Pro Max optional | one system, per-surface overrides |
| **Deferred to vision** | BullMQ/Redis · Temporal.io · A2A · Connector Registry · KMS | scalability narrative (Dossier §5) |

---

## 2. Phase 0 — Mandatory software & accounts `[A][B]`
**Mandatory:** Git Bash (Windows only); **Node.js 22 LTS** (`[VERIFY]` Codex needs Node 18+).
**Optional:** Python 3.12 (UI/UX search script + offline `datagen/`). Skip .NET/Go/JDK/Jenkins/Terraform unless needed.

```bash
node --version   # v22.x
npm --version    # 10.x+
git --version
python3 --version  # 3.12.x (optional)
```
**Accounts/keys:** an eligible **ChatGPT plan** for Track 1 (Plus/Pro/Business/Edu/Enterprise — HCLTech may provision; `[VERIFY]`); an **`OPENAI_API_KEY`** for Track 2 and for the Recoup runtime (keep out of source — §Appendix D).

---

## 3. Phase 1 — Codex toolchain & the two auth tracks `[A]`

### 3.1 Install Codex CLI
```bash
npm i -g @openai/codex
# OR official installer:
#   macOS/Linux: curl -fsSL https://chatgpt.com/codex/install.sh | sh
#   Windows:     powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
#   unattended:  set CODEX_NON_INTERACTIVE=1 on the install shell
codex --version
```
> Package is **`@openai/codex`**. On Windows, run natively in PowerShell (Windows sandbox) or use WSL2.

### 3.2 Track 1 — interactive setup with **ChatGPT** (do this first)
```bash
codex                         # launch → "Sign in with ChatGPT" (OAuth browser)
# headless box: codex login --device-code     # device-code flow, no browser
codex login status            # exits 0 when authenticated
```
- **Model:** start with **`gpt-5.5`** (recommended for complex coding); use **`gpt-5.4-mini`** for lighter tasks/subagents. Switch mid-thread with `/model`. **Do not pin `gpt-5.3-codex` or `gpt-5.2`** — they are deprecated for ChatGPT sign-in and will error. `[VERIFY]`
- **Cost:** Codex is included in eligible ChatGPT plans; interactive build usually incurs no extra API cost on Track 1.
- This is the track for **building and steering** the slice (Phase 6 sessions, Superpowers loop).

### 3.3 Track 2 — **API-key-based** automated run (after the slice works)
```bash
printenv OPENAI_API_KEY | codex login --with-api-key     # API-key auth
# ~/.codex/config.toml  (or a named --profile)
#   model = "gpt-5.5"            # API-key auth may use any Responses-API model
#   approval_policy = "on-request"
#   sandbox_mode = "workspace-write"
codex exec --full-auto "Run npm run verify and fix any failing invariant test"
```
- **Unattended/CI** (isolated env only): `codex exec --dangerously-bypass-approvals-and-sandbox "..."`.
- **Network in sandbox is blocked during command execution** — install deps *before* a sandboxed run, or `-c 'sandbox_workspace_write.network_access=true'` / `-s danger-full-access` for setup-only steps.
- API-key workflows are **not** affected by the ChatGPT-auth model deprecations, but prefer **gpt-5.5 / gpt-5.4** anyway (Chat Completions support in Codex is deprecated — Responses API only). `[VERIFY]`
- CI example:
```yaml
# .github/workflows/codex.yml
- run: |
    npm i -g @openai/codex
    codex exec --full-auto "npm run verify"
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### 3.4 Approval modes, profiles, MCP
- Modes: **Auto** (default), **Read-only**, **Full Access**; `/permissions` to switch. `--profile` is the primary profile selector. `[VERIFY]`
- Codex can run as an MCP server (`codex mcp`) and manage MCP servers (`codex mcp add …`) — relevant to the SAP/standard-service connectors.
- Project conventions live in **`AGENTS.md`** at repo root (read natively) — why Phase 4 matters.

---

## 4. Phase 2 — Governance + design skills `[A]`

### 4.1 Superpowers
```
PROMPT (in a Codex session):
Fetch and follow https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/.codex/INSTALL.md
```
Alternatives `[VERIFY]`: `/plugins` → search `superpowers`; or `git clone` + symlink `skills/` into the discovery root. **Confirm:** ask for a task; if Codex *interviews* you instead of coding, `brainstorming` is live. Commands: `/superpowers:brainstorm`, `:write-plan`, `:execute-plan`. Superpowers = *how to build*; AGENTS.md = *what's true about this repo* — they stack.

### 4.2 UI/UX Pro Max
```bash
npm i -g uipro-cli
cd /path/to/recoup       # after Phase 3 scaffold
uipro init --ai codex
# Python 3.x must be present (design-system search script is Python)
```

---

## 5. Phase 3 — Scaffold the monolith `[A]`
> Run `npm install` **outside** a sandboxed Codex run (§3.3 network note).

Scaffold the TypeScript layout from **AGENTS.md §4 / SDD §3.2** (`src/{agents,core,tools,adapters,guardrails,audit,services,mcp,memory,middleware,types}`, `config/`, `datagen/`, `evals/`, `tests/`, `cockpit/`). Toolchain: `typescript`, `tsx`, `vitest`, `eslint`, `prettier`, `dependency-cruiser`, `zod`, `decimal.js`, `@openai/agents`, `express`. Wire `npm run verify` = `eslint . && tsc --noEmit && vitest run && depcruise src`.

---

## 6. Phase 4 — Update SDD / AGENTS.md / INVARIANTS `[A][B]` ← do before building
These are already updated in this Codex-ready doc set. Confirm they're at repo root and current: `INVARIANTS.md` (I-1…I-28), `AGENTS.md` (A/B/C/D, TS gates, Symphony §7), `Recoup_v2_SDD.md` (Appendix G constants), `RECONCILIATION_LEDGER.md`. **Codex reads AGENTS.md every session** — it must be correct *before* Phase 6.

---

## 7. Phase 5 — Stage the supplied design system `[B]`
Do **not** regenerate the design system unless the team intentionally refreshes the visual direction. Use the supplied Recoup/O2C design assets as the source of truth.

```bash
mkdir -p design-system
cp O2C_Collections_Design_System_v3.md design-system/MASTER.md
cp tokens.json design-system/tokens.json
cp tokens.css design-system/tokens.css
# Optional showcase artifact for visual QA:
cp "O2C Design System v3.1.dc.html" design-system/showcase.html
```

For the main cockpit, map `tokens.json` into Tailwind and import `tokens.css` once at the Next.js root. Built surfaces are exactly three: `forensics-analyst`, `credit-arbitration`, and `cfo-summary`. O2C-lead and Audit views are light/deferred. Design guardrails: editorial-enterprise finance style, data-dense work surfaces, no AI purple/pink gradients, contrast ≥4.5:1, visible focus, `prefers-reduced-motion`, responsive 375/768/1024/1440, SVG icons, never emoji.

---

## 8. Phase 6 — First build slice `[A][B]`
Critical path: **data+labels → core rules + graph → eval harness + gates → B hero (Forensics→Recovery) → cockpit B surface → one closed-loop (A/C/D) + audit + autonomy gauge.** Each session runs the Superpowers loop and ends on a stated success check. Use Track 1 (interactive) to build; Track 2 (or Symphony) to re-run headless.

### 8.0 Master build prompt (demo-critical vertical slice)
```
PROMPT (master build — Recoup demo-critical slice):

Build "Recoup — Revenue-Integrity Cockpit", a production-oriented revenue-integrity
product, using the current OpenAI Agents SDK (TypeScript). Deliver a deployable web
app — a cockpit UI plus an API/agent backend — architected to scale, not a CLI or
throwaway demo. It turns receivables + remittance data into investigated,
evidence-backed deduction-recovery cases that a human approves. Users open the
cockpit, see a ranked deduction worklist, drill into an evidence pack, and
approve / modify / reject a drafted recovery action.

CONTEXT TO READ FIRST (load named sections, do not inject whole):
- AGENTS.md (whole — repo protocol AND Codex project config)
- INVARIANTS.md I-1..I-28
- Recoup_v2_SDD.md §3 (architecture), §4 (data model), §5 (deterministic core),
  §6 (agents — capability B), §7 (interfaces/contracts), §9 (guardrails), §11 (cockpit), Appendix G (constants)
- RECONCILIATION_LEDGER.md §4 (canonical S1–S8 gold set)
- O2C_Collections_Design_System_v3.md, tokens.json, tokens.css, and O2C Design System v3.1.dc.html

SCOPE (this slice only):
- Synthetic source (seed=42) producing the canonical S1–S8 gold set + labels +
  a noise set (legitimate signals that must not fire); totals must equal
  20 lines/$112,400, valid 7/$32,600, recovery 13/$79,800 (I-27).
- Deterministic detection + variance rules for S1–S8 types; credibility-graph
  ranking + false-positive suppression. All $ in core/ (decimal.js).
- Capability B hero chain: Forensics Investigator (gpt-5.5) -> HANDOFF ->
  Recovery Drafter (gpt-5.4); valid lines -> routeBilling (DRAFT only, I-23).
- Forensics-analyst cockpit surface + hash-chained audit + code-based eval
  harness with BOTH FP gates and the accuracy bars.
Out of this slice: A/C/D, live SAP, MCP — stub their seams only.

PROJECT STRUCTURE: cockpit (Next.js+TS+Tailwind+Vercel AI SDK) · server (Express
async + SSE) · agents/ (@openai/agents) · services/serviceLayer.ts (namespaced,
Zod-typed, whitelisted tools) · core/ (all $ math, decimal.js) · adapters (Source
port, read-only) · audit · evals · tests (Vitest).

TOOL PATTERNS (typed, Zod-bounded):
- core.runDetection / rankQueue ; core.runSubchecks (corroborating evidence)
- retrieval.fetchProofDocuments (POD/contract/trade-promo)
- evidence.getFinding / getRecords / getDocuments / getTrace
- action.draftRebill / draftOutreach / routeBilling  (DRAFTS ONLY; amount clamps
  to computed delta; HITL-gated; cannot send; no ERP write-back)

NON-NEGOTIABLE INVARIANTS (enforce in code, prove with tests):
- No LLM authors/edits a dollar; all $ in core/ (I-1); decimal.js only (I-3).
- Every finding cites recordIds + code delta + ruleId (I-2); every decision cites
  recordIds + deterministic basis (I-17); "invalid"/"partial" only with referenced
  documents (I-18).
- HITL on every external action; nothing dispatches autonomously (I-7/I-20);
  no ERP write-back path exists (I-26); billing loop is draft-only (I-23).
- Append-only hash-chained audit (I-9); seed=42 reproducible (I-4/I-13);
  pinned models only (I-25).
- Release-blocking gates: detection FP (I-5), decision FP — good accounts never
  contained, valid fully-documented never pursued (I-22), gold-set parity (I-27),
  accuracy bars validity≥0.90 / intent≥0.90 / arbitration≥0.85 (I-28).

STREAMING: run via run_streamed; map SDK stream events to an SSE envelope
{type, payload} (finding|verdict|status|error|eval); cockpit renders progressively.

OBSERVABILITY: AgentHooks (on_start/on_tool_start/on_handoff/on_end) -> structured
Winston logs + audit traceId + correlationId; use SDK tracing in dev.

ENV: OPENAI_API_KEY (env, never committed, never in the browser), RECOUP_SOURCE=
synthetic, SEED=42, MODEL_REASONING=gpt-5.5, MODEL_FAST=gpt-5.4-mini. Install deps
BEFORE any sandboxed run.

END-TO-END VERIFICATION (do not skip): start backend + cockpit so the SERVER can
reach the OpenAI API. A real streamed POST to /run must yield AT LEAST ONE
tool/agent SSE event AND ONE model text delta from the Forensics Investigator.
Do NOT finish after only /health, Next startup, tsc, or unit tests. Final
verification MUST include an end-to-end agent run plus passing FP gates + accuracy bars.

DOCUMENTATION: verify the latest Agents SDK + Responses API guidance (OpenAI Docs
skill if available, else developers.openai.com/api). Use current model ids from
developers.openai.com/api/docs/models. Do NOT use the Assistants API or legacy
Chat Completions scaffolding.

FRONTEND: apply O2C_Collections_Design_System_v3.md plus tokens.json/tokens.css; finance
style (Editorial Enterprise/data-dense); no AI purple/pink gradients.

DELIVERABLES: a narrative README (problem, "How OpenAI is used", architecture
diagrams, run/test/extend, deploy, live link); a validation checklist covering
verdicts on labeled cases, cockpit flow, tool outputs, every invariant, both FP
gates, accuracy bars, and the end-to-end streamed run. Make it trivial to extend
with new rules/tools/handoffs (the path to A/C/D).
```

### 8.1–8.6 Session ladder
- **S1 — Data + labels:** `datagen/` seeded gold set S1–S8 + labels (validity, intent, arbitration) + noise; canonical entities validated by Zod. *Check:* gold + parity assertions green; byte-identical event IDs (I-4/I-13/I-27).
- **S2 — Core rules + graph (tests-first):** S1–S8 variance rules + sub-checks as pure functions; `expected.ts`; `graph.ts` (power iteration). decimal.js only; tests before each rule. *Check:* rule tests green; detection FP gate clean (I-5).
- **S3 — Eval harness + gates:** `evals/harness.ts`: validity accuracy, intent precision, arbitration agreement, BOTH FP gates, gold-set parity — code-based graders. *Check:* accuracy bars (I-28) + FP gates (I-5/I-22) + parity (I-27) pass.
- **S4 — B hero:** Forensics Investigator (gpt-5.5) → retrieval → sub-checks → verdict (cites recordIds + basis + docs, I-17/I-18) → HANDOFF → Recovery Drafter (gpt-5.4); valid → routeBilling draft (I-23); amount clamp (I-6); HITL (I-20). *Check:* validity ≥0.90; tripwire + trace assertions; no LLM dollar (I-1).
- **S5 — Cockpit B surface:** forensics-analyst dashboard (worklist → evidence pack → draft → approve/modify/reject), streamed over SSE, design-system-driven.
- **S6 — One closed-loop + audit + autonomy gauge:** add **A (Risk Mesh)** or **D (Behavioral Containment)** per the David journey (partial-hold composite + score→ratio, I-24; arbitration audit, I-21), hash-chained audit, AgentHooks, autonomy-readiness gauge. **C (Sentinel)** stays thin (drift → term-menu proposal) per the cut-line. Optional: wire the conversational-query agent (gpt-realtime-2 voice + text) for the demo.

> `npm run verify` after every change. B reviews every `git diff`. Superpowers verification-before-completion + AGENTS.md §3.6 spec-conformance pass before each session closes.

### 8.7 Optional — drive Phase 6 with Symphony (Track 2)
Turn S1–S6 into issues on a board; a repo `WORKFLOW.md` encodes the AGENTS.md loop (PLAN→tests-first→`npm run verify`→self-critique→validate) with `approval_policy: on-request`; Symphony assigns a per-issue Codex workspace via the Codex app-server (API-key auth) and a human reviews each result. Build Symphony from its spec: `https://github.com/openai/symphony/blob/main/SPEC.md`. **Symphony is build-time only — never in the Recoup runtime.**

---

## Appendix A — Python → TypeScript mapping
`Decimal`→`decimal.js` (I-3) · Pydantic→Zod · NetworkX PageRank→hand-rolled power iteration · FastAPI→Express+SSE · pytest→Vitest · ruff/mypy→ESLint+Prettier/tsc · import-linter→dependency-cruiser (I-12) · Agents SDK (Py)→`@openai/agents` (TS) · hosted Evals→code-based harness (Promptfoo optional).

## Appendix B — Deferred to vision (do NOT build)
BullMQ+Redis · Temporal.io · A2A · Connector Registry · enterprise KMS — Dossier §5 scalability narrative.

## Appendix C — `[VERIFY]` before lock
- Node 22; `@openai/codex` install path · Codex model availability (gpt-5.5 default; `gpt-5.3-codex`/`gpt-5.2` deprecated for ChatGPT auth) **V7**
- Superpowers install path; `uipro` search.py path
- `@openai/agents` TS primitive names (handoffs, agents-as-tools, guardrails, HITL, hooks, tracing) and **subagents/code-mode TS availability V1**
- Runtime model ids MODEL_REASONING/MODEL_FAST; **embeddings model V6**
- HCLTech-provisioned ChatGPT access vs personal key
- **SAP S/4HANA sandbox/instance V3** — confirm before the §7.5 SAP slice
- Arbitration P&L weights — **EXPERT-OWNED, pending input** (SDD §5.7 / Appendix G)

## Appendix D — Secrets hygiene (hackathon-sized)
`OPENAI_API_KEY` in `.env`; `.env` in `.gitignore`; never commit, never ship to the browser; never set `dangerouslyAllowBrowser: true`. Per-environment keys if time permits; hard cost-cap on the OpenAI dashboard against runaway loops. KMS/Vault + Secure MCP Tunnel are the scale-up answer (Dossier §5), not build items.
