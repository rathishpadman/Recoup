# Phase 2 — Tooling, Schemas & Security

**Status:** Complete · **Mode:** static
**Scope:** `src/services/serviceLayer.ts`, `src/mcp/server.ts`, `src/guardrails/**`, `src/services/permissionEngine.ts`, `src/services/approvals.ts`, `src/services/decisionStore.ts`.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 2.1 | Strict typed tool schemas (Zod) | C | ✅ Pass | Every tool has a Zod schema (`serviceTools`, `serviceLayer.ts:186-355`). Schemas use `.strict()` (`:128,:141`), regex (`:138-155`), `z.discriminatedUnion` (`:140`), and `superRefine` cross-field checks (`:93-121,:129-137`). `invokeServiceTool` parses before dispatch (`:365`). |
| 2.2 | Input & output guardrails | C | ✅ Pass (with SDK caveat) | Layered guards: input PII redaction (`guardrails/input/pii.ts`); output final guard (`guardrails/output/final.ts` → explainability + evidence pack + intent + no-wrongful-containment); tool guards (`amountClamp`, `actionBoundary`, `intentEvidence`, `evidencePack`, `explainability`, `noWrongfulContainment`). |
| 2.3 | No-mutation sandboxing / no ERP write | C | ✅ Pass | `approvals.decide` handler **throws** `"Supabase approval persistence required"` (`serviceLayer.ts:280`) — it never mutates. All `actions.*` tools are `sideEffectClass: "draft_only"`. `retrieval.sap` is read-only. No ERP write client anywhere. |
| 2.4 | MCP exposes only read/draft tools | H | ✅ Pass | `isMcpVisible` filters on `visibility === "mcp"` (`mcp/server.ts:120-126`). Internal tools (`core.evaluateRule`, `decisions.deductionVerdict`, `approvals.decide`, `core.riskMeshClosedLoop`) are `visibility: "internal"` and excluded. Draft-only tools additionally require `draft_action` capability (`:96`). |
| 2.5 | Secrets hygiene | H | ✅ Pass | Bearer token compared with `timingSafeEqual` (`:484-488`); no hardcoded secrets; PII redacted before model context; env-driven config. |
| 2.6 | Auth fail-closed | H | ✅ Pass | MCP auth middleware returns 401 + `www-authenticate` when token missing/mismatched (`:296-307, :420-446`); permission engine `deny` throws (`:101-103`). `approvals` require `human:`-scoped principal (`:484-491`). |
| 2.7 | Bounded concurrency on parallel calls | M | ⚠️ Partial | `buildSupabaseServiceSyntheticEvidenceSource` fans out `deductionLines × connectorNames` into a single `Promise.all` (`:397-407`); `buildSupabaseServiceSapEvidenceSource` likewise (`:422-427`). Fine for the demo dataset, but unbounded against Supabase at scale. |
| 2.8 | Guardrail trips emit trace/audit events | M | ⚠️ Partial | Guards `throw` on violation; failures surface as stream "failed closed" status, but individual guardrail trips are not emitted as discrete trace spans/metrics. |
| 2.9 | SDK-native guardrail wiring | H | ⚠️ Partial | Guards are **custom functions in the deterministic layer**, not attached to the live `Agent` via `defineInputGuardrail`/`defineOutputGuardrail`. The live overlay relies on raw-text *suppression* (`liveForensicsStream.ts:276-279`) rather than SDK guardrails. Low real risk (text is suppressed), but not the SDK-idiomatic pattern. |

## Detailed notes

### Standout strengths
- **Schema discipline is exceptional.** `.strict()` + regex + discriminated unions + `superRefine` is exactly the "strict tool contracts" production guidance ([TrueFoundry — define strict tool contracts](https://www.truefoundry.com/blog/multi-agent-architecture)). The `query.answer` schema even enforces that `selectedLineId ∈ recordIds` (`:129-137`) — evidence-scope integrity at the schema level.
- **Defense-in-depth guardrails.** Input (PII) + tool (amount clamp, evidence pack, intent, no-wrongful-containment) + output (final assertion) is precisely the layered model OpenAI and Arthur recommend: *"using multiple, specialized guardrails together creates more resilient agents"* ([OpenAI Agents SDK — Guardrails](https://openai.github.io/openai-agents-js/)); *"pre-LLM checks protect what goes into the model, post-LLM checks control what comes out"* ([Arthur AI — guardrails best practices](https://www.arthur.ai/blog/best-practices-for-building-agents-guardrails)).
- **`approvals.decide` that refuses to execute** is a beautiful demonstration of human-gated design: the tool exists, validates, and then *hard-stops* on persistence — there is no code path where a model approves an action (`:276-281`).
- **MCP boundary is enforced in code, not docs.** Internal decision/compute tools are structurally excluded from the MCP tool list, and `callTool` re-checks visibility before invoking (`:90-106`).

### Gaps & proposed actions

**2.7 — Unbounded fan-out [M].**
> **Proposed action:** Wrap the `Promise.all` evidence reads in a bounded concurrency pool (e.g. `p-limit` with a small cap, or chunked batches) so a large settlement run cannot open hundreds of simultaneous Supabase requests.
> **Expert citation:** Production multi-agent guidance lists "runaway cost, latency … database or external API starvation under high loads" as a primary failure mode and prescribes bounded connection pools ([TrueFoundry — production reality](https://www.truefoundry.com/blog/multi-agent-architecture)). The source checklist itself calls for "bounded connection pools."

**2.8 — Guardrail trips not individually observable [M].**
> **Proposed action:** Emit a structured trace event/metric on each guardrail rejection (guard name, reason, recordIds) instead of only a generic "failed closed" status. This makes guardrail efficacy measurable.
> **Expert citation:** *"Every guardrail trigger should produce a trace event, just like any other span in your agent, letting you see how often each guardrail fires, what it catches"* ([Arthur AI — guardrails best practices](https://www.arthur.ai/blog/best-practices-for-building-agents-guardrails)).

**2.9 — Wire SDK-native guardrails on the live agent [H for legibility].**
> **Proposed action:** Add a thin `defineOutputGuardrail` to `forensicsInvestigatorAgent`/`recoveryDrafterAgent` that asserts no dollar/verdict tokens leak in model text (delegating to the existing `assertFinalAgentOutput` logic). This makes the existing protection *visible to the SDK tracer and to judges* and converts an implicit suppression into an explicit, named guardrail.
> **Expert citation:** OpenAI positions input/output guardrails as first-class agent configuration; *"guardrails run input validation and safety checks in parallel with agent execution, and fail fast"* ([OpenAI Agents SDK — Guardrails](https://openai.github.io/openai-agents-js/)). Using the SDK primitive (not just custom functions) is the idiomatic, demonstrable approach.

## Phase 2 score

- Pass: 6/9 (all 4 critical items pass).
- Partial: 3 (concurrency bound, guardrail observability, SDK-native guardrail wiring) — none critical.
- Gaps: 0.

**Verdict:** Security and tooling posture is **production-grade and a genuine differentiator** for a hackathon. The three partials are polish/observability improvements, not vulnerabilities.
