# OpenAI Prompt Cache Implementation Plan

## Purpose

Implement OpenAI prompt caching as a shared Recoup runtime capability, not as a Maya-only optimization.

The first consumer is Maya Deduction Forensics, but the design must support David Dynamic Credit Sentinel and later Risk Mesh / Behavioral Containment surfaces without duplicating prompt-cache logic.

## Current State

Prompt caching is not intentionally implemented in the Recoup runtime today.

Implemented today:

- Live OpenAI Agents SDK execution for Maya query trace proof.
- Pinned model routing in `config/models.ts`.
- Reasoning-effort model settings in `config/models.ts`.
- OpenAI vector-store evidence reuse.
- Total token usage capture and sanitized Supabase audit receipt persistence for Maya query runs.
- Source/read-model caching for cockpit hydration, separate from OpenAI prompt caching.

Missing today:

- No capability-scoped OpenAI `prompt_cache_key`.
- No shared prompt assembly layer that places stable static prefixes before dynamic request data.
- No cached-token usage extraction from `input_tokens_details.cached_tokens`.
- No persisted prompt-cache telemetry in usage receipts.
- No generic usage receipt shape that can cover both Maya Forensics and David Credit Risk.

## Non-Goals

- Do not change deterministic decision logic.
- Do not let a model compute dollars, verdicts, scores, routing, approvals, or external actions.
- Do not add David business rules until a David-specific brief names the relevant SDD section.
- Do not introduce prompt text, raw model text, API keys, customer secrets, or source payloads into audit receipts.
- Do not compute dollar cost unless an owner-approved pricing config exists.
- Do not add a new OpenAI client path if the existing Agents SDK provider passthrough can carry the cache key.
- Do not introduce ERP writeback or autonomous action.

## Design Principle

Prompt cache boundaries should map to Recoup capabilities, not UI personas.

Capability cache families:

- `deduction_forensics`: Maya B surface, Forensics Investigator, Recovery Drafter.
- `credit_risk`: David C surface, Sentinel / credit-risk advisory path.
- `risk_mesh`: cross-capability arbitration path.
- `containment`: Behavioral Containment / intent path.

Prompt order:

1. Shared Recoup governance prefix.
2. Capability-specific static prefix.
3. Agent-specific static instructions.
4. Dynamic request payload.

The static prefix must be stable and versioned. Dynamic data such as question, selected line, record IDs, customer context, current source facts, and case-specific evidence must be appended last.

## Proposed Files

New files:

- `config/openaiPromptCache.ts`
- `src/agents/promptAssembly.ts`
- `src/services/openAiUsageReceipt.ts`
- `tests/unit/openai-prompt-cache.test.ts`

Likely edited files:

- `config/models.ts`
- `src/agents/agentRuntime.ts`
- `src/agents/liveForensicsStream.ts`
- `src/services/forensicsQuerySession.ts`
- `src/services/cockpitApi.ts`
- `tests/unit/live-forensics-stream.test.ts`
- `tests/unit/cockpit-api.test.ts`

Optional later files for David, only when the David brief is active:

- David credit-risk service/API files.
- David cockpit query or trace files.
- David-specific unit and E2E tests.

## Cache Key Contract

Add `config/openaiPromptCache.ts`.

The module should export a narrow, typed config:

```ts
export const openAiPromptCacheCapabilities = [
  "deduction_forensics",
  "credit_risk",
  "risk_mesh",
  "containment"
] as const;

export type OpenAiPromptCacheCapability = (typeof openAiPromptCacheCapabilities)[number];

export const openAiPromptCacheConfig = {
  deduction_forensics: {
    promptCacheKey: "recoup:v2:deduction-forensics:v1",
    promptPrefixVersion: "v1"
  },
  credit_risk: {
    promptCacheKey: "recoup:v2:credit-risk:v1",
    promptPrefixVersion: "v1"
  },
  risk_mesh: {
    promptCacheKey: "recoup:v2:risk-mesh:v1",
    promptPrefixVersion: "v1"
  },
  containment: {
    promptCacheKey: "recoup:v2:containment:v1",
    promptPrefixVersion: "v1"
  }
} as const satisfies Record<
  OpenAiPromptCacheCapability,
  {
    promptCacheKey: string;
    promptPrefixVersion: string;
  }
>;
```

Rules:

- Cache keys must be static and source-controlled.
- Cache keys must not include customer IDs, record IDs, invoice IDs, principal IDs, user questions, source values, or environment names.
- Changing the shared governance prefix or capability prefix requires a version bump.
- Do not add `prompt_cache_retention` in the first implementation unless the installed SDK and current OpenAI docs confirm the exact field is supported. Start with `prompt_cache_key` only.

## Prompt Assembly Contract

Add `src/agents/promptAssembly.ts`.

Responsibilities:

- Build shared static governance prefix.
- Build capability static prefix.
- Append the existing agent prompt loaded from `src/prompts/*.md`.
- Append dynamic payload last.
- Return the assembled prompt plus cache metadata.

Suggested types:

```ts
export interface RecoupPromptAssemblyInput {
  agentPrompt: string;
  capability: OpenAiPromptCacheCapability;
  dynamicPayload?: string;
}

export interface RecoupPromptAssembly {
  cache: {
    capability: OpenAiPromptCacheCapability;
    promptCacheKey: string;
    promptPrefixVersion: string;
  };
  prompt: string;
}
```

Shared governance prefix should include only already-approved Recoup rules:

- Code computes every dollar.
- Model output must not assert business amounts or decisions.
- Every decision must cite evidence and deterministic basis.
- HITL is required for external actions.
- ERP access is read-only.
- No fake, dummy, or static business values in runtime.
- Guardrails and Zod tool contracts remain mandatory.

Capability prefixes:

- `deduction_forensics`: forensics/recovery scope only.
- `credit_risk`: reserved extension point; do not invent David-specific thresholds, weights, policy rules, or labels.
- `risk_mesh`: reserved extension point; never invent arbitration P&L weights.
- `containment`: reserved extension point; never label gaming without cited behavioral evidence and R-score components.

## Runtime Wiring

Use existing Agents SDK model settings provider passthrough.

In `config/models.ts`, add cache provider data only through a helper so cache metadata stays centralized:

```ts
providerData: {
  prompt_cache_key: openAiPromptCacheConfig.deduction_forensics.promptCacheKey
}
```

Do not create one-off cache keys inside `liveForensicsStream.ts`.

In `src/agents/agentRuntime.ts`:

- Forensics Investigator uses `deduction_forensics`.
- Recovery Drafter uses `deduction_forensics`.
- Sentinel uses `credit_risk` when David runtime execution is introduced.
- Risk-Mesh Supervisor uses `risk_mesh`.
- Containment / Intent uses `containment`.

Initial implementation should wire Forensics and Recovery only, while defining typed config entries for the other capabilities.

## Usage Parsing

Extend usage parsing in `src/agents/liveForensicsStream.ts`.

Current behavior:

- Reads cumulative total token usage.
- Emits deltas through `onTokenUsage`.

New behavior:

- Preserve total token usage behavior.
- Also read input/output/cached token fields when present.

Expected usage shape:

```ts
{
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
}
```

Add a structured callback instead of replacing the existing total-token callback abruptly:

```ts
export interface OpenAiTokenUsageSnapshot {
  cachedTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens: number;
}
```

Compatibility rule:

- Keep the existing `onTokenUsage(tokens)` behavior until callers migrate.
- Add `onTokenUsageSnapshot(snapshot)` for cache telemetry.

## Generic Usage Receipt

Add `src/services/openAiUsageReceipt.ts`.

Purpose:

- Convert usage snapshots into a sanitized audit payload.
- Support Maya now and David later.
- Keep persistence details in `cockpitApi.ts` minimal.

Receipt payload fields:

```ts
{
  agentName: string;
  cachedTokens?: number;
  cachedTokenRatio?: string;
  capability: OpenAiPromptCacheCapability;
  correlationId: string;
  costDeterministicBasis: "No owner-approved pricing config is configured; dollar cost is not computed.";
  costStatus: "pricing_not_configured_not_computed";
  deterministicBasis: string;
  inputTokens?: number;
  model?: string;
  modelExecutionMode: string;
  outputTokens?: number;
  promptCacheKey: string;
  promptPrefixVersion: string;
  rawModelTextPolicy: string;
  receiptType: "openai_agent_usage";
  recordIds: string[];
  totalTokens: number;
}
```

Rules:

- Do not store prompt text.
- Do not store raw model text.
- Do not store API keys, bearer tokens, vector-store IDs, SAP credentials, or Supabase service keys.
- Do not store unredacted questions if they can contain customer-specific free text.
- Record IDs are allowed because Recoup decisions already require cited evidence.

## Maya First Implementation

Target path:

- `POST /forensics/query`
- Forensics Investigator live trace
- Recovery Drafter handoff trace

Implementation steps:

1. Add prompt-cache config and tests.
2. Add prompt assembly and tests.
3. Wire Forensics / Recovery model settings to `prompt_cache_key`.
4. Extend live stream usage parsing for cached tokens.
5. Extend query response model execution metadata with optional cache usage.
6. Replace Maya-specific token receipt construction with the generic receipt helper.
7. Keep existing response payload backward compatible for UI tests.

Expected behavior:

- If OpenAI returns no cached-token fields, Recoup still succeeds and records total tokens only.
- If OpenAI returns `cached_tokens`, Recoup records it in the sanitized audit receipt.
- Visible Maya answer behavior remains unchanged.
- Raw model text remains suppressed.
- Deterministic answer/citation/approval behavior remains unchanged.

## David Credit Risk Readiness

Do now:

- Add `credit_risk` as a cache capability.
- Add a reserved cache key and prefix version.
- Add tests proving the cache key does not include customer/case/user data.
- Keep the credit-risk prefix minimal and explicitly reserved until David work is briefed.

Do later, under a David-specific brief:

- Add David capability prefix from named SDD sections.
- Wire Sentinel / credit risk live agent path through prompt assembly.
- Persist usage receipt with `capability: "credit_risk"`.
- Add David-focused tests and browser QA if UI/API behavior changes.

Do not do now:

- Invent credit limit thresholds.
- Invent risk weights.
- Invent policy statuses.
- Add David UI behavior.
- Add autonomous hold or term-change actions.

## Tests First

Add or update tests before implementation.

### `tests/unit/openai-prompt-cache.test.ts`

Assertions:

- Every cache key starts with `recoup:v2:`.
- Every capability has a cache key.
- Cache keys do not contain dynamic IDs.
- Prompt assembly places shared prefix before capability prefix and dynamic payload last.
- Prompt prefix version changes are explicit.

### `tests/unit/agent-runtime.test.ts`

Assertions:

- Forensics Investigator has `providerData.prompt_cache_key`.
- Recovery Drafter has `providerData.prompt_cache_key`.
- Both use the `deduction_forensics` cache key.
- Existing reasoning settings remain unchanged.

### `tests/unit/live-forensics-stream.test.ts`

Assertions:

- Existing total-token delta behavior remains green.
- Usage parsing captures `input_tokens_details.cached_tokens`.
- Cached-token telemetry is optional and fails open for missing usage fields.
- No raw model text is emitted.

### `tests/unit/cockpit-api.test.ts`

Assertions:

- Successful Maya query persists an `openai_agent_usage` receipt.
- Receipt includes total tokens and cached tokens when available.
- Receipt includes capability and prompt cache key.
- Receipt excludes raw model text, answer text, API keys, prompt text, user question, and request-body secrets.
- Blocked live-agent responses do not persist success usage receipts.

### Optional invariant test

Add only if the implementation is broad enough:

- Prompt cache keys are capability-scoped and never case-scoped.
- Dynamic payload is appended after the static prefix.

## Verification Commands

Run after implementation:

```powershell
npm run lint
npm run typecheck
npm run test
npm run verify
```

For cockpit-impacting changes, also run the relevant browser/API coverage named in the session brief. If the change is telemetry-only and no UI changes are made, document that browser coverage was not required.

## Rollout Plan

Checkpoint 1: Cache key and telemetry

- Add cache config.
- Wire `prompt_cache_key` to Forensics / Recovery.
- Capture cached-token telemetry when available.
- Persist sanitized generic usage receipt.
- No prompt expansion yet.

Checkpoint 2: Stable shared prompt prefix

- Add shared Recoup governance prefix.
- Keep dynamic data last.
- Confirm behavior with tests.
- Confirm cached-token fields appear in live smoke only if the resulting prompt reaches provider cache threshold.

Checkpoint 3: David enablement

- Under a David-specific brief, wire credit-risk agents to the shared cache framework.
- Add David tests.
- Run browser/API coverage for the David surface if user-facing behavior changes.

## Risk Assessment

Low risk:

- Adding static cache key config.
- Capturing optional cached-token fields.
- Persisting sanitized telemetry.

Medium risk:

- Prompt assembly changes, because prompt text ordering can affect live model traces.

Mitigation:

- Keep first checkpoint telemetry-only where possible.
- Preserve existing agent prompts and append them inside the assembled static prefix.
- Keep all business results deterministic and tool/source-backed.
- Re-run existing Maya query tests.

## Success Criteria

- `npm run verify` passes.
- Existing Maya query behavior is unchanged.
- Forensics / Recovery requests carry a capability-scoped prompt cache key.
- Usage telemetry records cached tokens when OpenAI returns them.
- No secrets, prompt text, raw model text, or free-form user question text are persisted.
- David can be added by assigning the `credit_risk` capability, not by copying Maya-specific cache code.
