# SPEC-002 — RAG for ADR-002 (complete): Vector DB data source, Maya + David, classic + agentic

- **Status:** Ready to implement
- **Date:** 2026-06-26 (rev. 2 — now covers the entire ADR-002)
- **Implements:** `ADR-002-rag-vector-data-source.md` in full
- **No source changed yet — this is a plan.**

### Scope map (this spec covers all of ADR-002, in three parts)

| Part | Covers | ADR-002 ref | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| **A** (§0–§6 below) | Maya classic RAG inside `retrieval.docs` | §2, §6.1, §6.5, §7 Option 1 | ~0.5–1d | Low | — |
| **B** (PART B) | David credit classic RAG (`retrieval.creditDocs`) | §6.2, §6.7 | ~1–2d | Med | Part A patterns |
| **C** (PART C) | Agentic RAG (agent-driven, multi-hop, verifier-gated) | §7 Option 2 | ~1–2d | Med | SPEC-001 (MCP), ROADMAP #1 (Reviewer) |

**Invariant across all parts:** every retrieved hit passes the deterministic grounding gate (customer + scope record-IDs); dollars/verdicts/limits/holds stay code-computed and human-gated. RAG improves *evidence recall*, never *who decides*.

---

# PART A — Maya classic RAG (ADR-002 Option 1)

---

## 0. Goal & acceptance criteria

**Goal:** Make the dormant OpenAI Vector Store a live, governed, **additive** evidence source inside `retrieval.docs`, so contract/correspondence/POD passages are semantically recalled, deterministically grounded to record IDs, and citable — without changing how any dollar or verdict is computed.

**Acceptance criteria:**
1. When `OPENAI_API_KEY` + `OPENAI_EVIDENCE_VECTOR_STORE_ID` are set, `retrieval.docs` returns Supabase rows **⊕** vector-store hits, merged + deduped + relevance-filtered.
2. Every vector hit passes the deterministic filter (`customer_id`, `scenario_type`, record-ID intersection) before it can be cited.
3. Structured Supabase remains authoritative; if the vector store is unset or errors, `retrieval.docs` returns **exactly today's** structured result (no regression, fail-safe).
4. Cockpit shows vector-sourced evidence with an **honest, distinct provenance** label (not relabeled as SAP/Supabase).
5. The vector path is reachable by agents only through the governed `retrieval.docs` tool / MCP gateway (ADR-001) — no new agent-facing surface.
6. `npm run verify` green; new tests cover merge, grounding, and fail-safe.

---

## 1. Design constraint that shapes the approach

`retrieval.docs`' handler is **synchronous** (`serviceLayer.ts`), and the deterministic forensics path calls it synchronously (`forensics.ts:invokeTracedTool`). The vector search is **async**. To avoid making the tool (and the whole forensics path) async, we **pre-fetch** vector evidence per deduction line into an in-memory map during request context construction — exactly the pattern already used for Supabase evidence (`buildSupabaseServiceSyntheticEvidenceSource` in `serviceLayer.ts`, awaited in `cockpitApi.ts`). The tool then reads synchronously from the prepared source.

This keeps the change isolated and idiomatic.

---

## 2. Implementation steps

### Step 1 — Evidence-source interface + builder (in `serviceLayer.ts`)

Mirror `ServiceSyntheticEvidenceSource` / `buildSupabaseServiceSyntheticEvidenceSource`:

```ts
export interface ServiceVectorStoreEvidenceSource {
  readEvidence(line: DeductionLine): readonly EvidenceDocument[]; // sync read of pre-fetched results
}

export async function buildOpenAiVectorStoreEvidenceSource(input: {
  reader: OpenAiVectorStoreEvidenceReader;     // createOpenAiVectorStoreEvidenceReader(...)
  settlementRun: SyntheticDatasetCore;
}): Promise<ServiceVectorStoreEvidenceSource> {
  const byLineId = new Map<string, EvidenceDocument[]>();
  await Promise.all(
    input.settlementRun.deductionLines.map(async (line) => {
      try {
        const hits = await input.reader.searchEvidence(line);     // already deterministically filtered in mapSearchResults
        byLineId.set(line.lineId, dedupeEvidenceDocuments(hits.map(toVectorEvidenceDocument)));
      } catch {
        byLineId.set(line.lineId, []);                            // fail-safe: vector outage => structured-only
      }
    })
  );
  return { readEvidence: (line) => [...(byLineId.get(line.lineId) ?? [])] };
}

function toVectorEvidenceDocument(e: OpenAiVectorStoreEvidence): EvidenceDocument {
  return {
    documentId: e.documentId,
    source: "docs",            // it is document-repo evidence; see Step 5 for honest provenance labeling
    documentType: e.documentType,
    recordIds: [...e.recordIds],
    summary: e.summary
    // NOTE: e.score is intentionally dropped from the citable doc — never a business threshold (log-only)
  };
}
```

> Bound the fan-out: if a settlement run is large, wrap the `Promise.all` in a small concurrency limit (same note as SPEC mcp / Phase 2.7).

### Step 2 — Add the source to the invocation context (`serviceLayer.ts`)

```ts
export interface ServiceInvocationContext {
  // ...existing...
  vectorStoreEvidenceSource?: ServiceVectorStoreEvidenceSource;
}
```

### Step 3 — Merge in the `retrieval.docs` handler (`serviceLayer.ts`)

Keep it synchronous; structured first (authoritative), vector additive:

```ts
"retrieval.docs": {
  schema: DeductionLineSchema,
  handler: (input, context) => {
    const line = DeductionLineSchema.parse(input);
    const structured = retrieveSyntheticEvidenceOrThrow(context, "retrieval.docs", "docs-repo", line);
    const vector = context.vectorStoreEvidenceSource?.readEvidence(line) ?? [];
    // mergeEvidenceDocuments already dedupes by documentId and re-applies record-ID relevance:
    return mergeEvidenceDocuments(line, structured, [...vector]);
  }
}
```

`mergeEvidenceDocuments` (`tools/retrieval/docs.ts:38-56`) already enforces `isEvidenceDocumentRelevant` (record-ID intersection) + dedupe — so grounding is applied a second time at merge. The structured `retrieveSyntheticEvidenceOrThrow` still throws if Supabase docs are unavailable, so docs retrieval remains fail-closed on the authoritative source; vector is purely additive.

### Step 4 — Build the source in request context (`cockpitApi.ts`)

Where `buildSupabaseServiceSyntheticEvidenceSource` is constructed in `loadRequiredSupabaseRunContext`, also build the vector source when configured:

```ts
const openAiKey = runtimeEnv.OPENAI_API_KEY?.trim();
const vectorStoreId = runtimeEnv.OPENAI_EVIDENCE_VECTOR_STORE_ID?.trim();
const vectorStoreEvidenceSource =
  openAiKey && vectorStoreId
    ? await buildOpenAiVectorStoreEvidenceSource({
        reader: createOpenAiVectorStoreEvidenceReader({ apiKey: openAiKey, vectorStoreId }),
        settlementRun
      })
    : undefined;

// add to serviceContext:
serviceContext: {
  // ...existing...
  ...(vectorStoreEvidenceSource ? { vectorStoreEvidenceSource } : {})
}
```

Fixture mode (`buildFixtureForensicsRunContext`) leaves it unset → structured-only, unchanged.

### Step 5 — Honest provenance in the cockpit (`cockpitModel.ts` / `mayaDataProvenance.ts`)

Vector-sourced docs currently map to `source: "docs"`. For honest provenance (I-30), surface them distinctly:
- **Option A (minimal):** keep `source: "docs"` but tag the evidence document's cockpit `sourceLabel` as "Document repository (semantic match)" and a `retrievalSource: "vector_store"` annotation in the read model.
- **Option B (cleaner):** add a `provenance.retrievalMode: "structured" | "semantic"` field carried from the adapter (`OpenAiVectorStoreEvidence.provenance = "openai-vector-store"`) through to the cockpit tile.

Either way: never show vector evidence as `sap_odata`. Pick one and lock it with a test.

### Step 6 — Make it visible in the trace (optional, demo polish)

Emit a `retrieval` trace event tagged `vector_store` when a vector hit contributes to the cited set, so the Agent Trace panel shows "semantic recall → grounded citation."

---

## 3. Governance proof (why this stays inside the rails)

Vector evidence passes **three** independent gates before it can appear in a finding:
1. `mapSearchResults` — exact `customer_id` + `scenario_type` + record-ID intersection (`openAiVectorStore.ts:107-117`).
2. `mergeEvidenceDocuments` — `isEvidenceDocumentRelevant` record-ID intersection + dedupe (`docs.ts:44-53`).
3. Downstream evidence-pack / citation guards — cited records must be within the selected scope (existing `forensicsQuerySession` + `cited-answer-card` checks).

The dollar/verdict still comes only from `decisions.deductionVerdict` / `core.evaluateRule` over structured fields. RAG never touches the control plane.

---

## 4. Test plan

| Test | Asserts |
|---|---|
| **NEW** `tests/unit/vector-evidence-source.test.ts` | `buildOpenAiVectorStoreEvidenceSource` pre-fetches per line; `toVectorEvidenceDocument` drops `score`; reader error ⇒ empty (fail-safe) |
| **NEW** `retrieval.docs` merge test | structured ⊕ vector merged + deduped; a vector hit with non-matching customer/scenario is excluded; with no `vectorStoreEvidenceSource` the result equals today's structured-only output (no regression) |
| **NEW** provenance test | vector-sourced tile is labeled semantic/vector, never `sap_odata` |
| Existing invariants | `mcp-visibility`, `maya-shadcn-boundary`, `cockpit-no-business-logic` still pass (RAG adds no UI business literals, no new MCP-exposed decision tools) |
| `npm run verify` + `test:e2e:maya-real` | green |

---

## 5. Risks & rollback

| Risk | Mitigation |
|---|---|
| Vector store unavailable / not provisioned | `vectorStoreEvidenceSource` unset or per-line `catch` ⇒ structured-only; zero regression |
| Semantic hit not truly relevant | Triple deterministic grounding (Section 3) drops it before citation |
| Provenance dishonesty | Distinct label + test (Step 5) |
| Latency / cost from embedding search | Bound `max_num_results`; pre-fetch once per request; consider caching by `(lineId, vectorStoreId)` |
| Fan-out on large runs | Concurrency-limit the pre-fetch `Promise.all` |

**Rollback:** gated on env (`OPENAI_EVIDENCE_VECTOR_STORE_ID`). Unset it → vector source never constructed → behaves exactly as today.

---

## 6. Demo runbook delta

1. `npm run provision:openai-evidence-vector-store` (uploads synthetic contract/correspondence/POD dossiers, sets `OPENAI_EVIDENCE_VECTOR_STORE_ID`).
2. Deploy with the env set (already listed in the deployment runbook).
3. In the Maya dispute scenario, the evidence dossier now includes a **semantically matched contract clause / email**, tagged as a vector-store match, grounded to the same record IDs.
4. Talk track: *"The contract clause that refutes this dispute wasn't fetched by ID — it was semantically found across the contract corpus, then re-grounded to this customer, scenario, and record ID before Maya could cite it. The model found the proof; the code still computes the dollar."*

---

# PART B — David credit classic RAG (`retrieval.creditDocs`)

Implements ADR-002 §6.2 and §6.7. David's `/credit` path has **no `DeductionLine`** and never calls `retrieval.docs`, so this part adds a credit-shaped retrieval surface that reuses the same governed grounding pattern.

## B0. Goal & acceptance criteria
- A new read-only, MCP-visible `retrieval.creditDocs` tool returns semantically-recalled credit documents (credit agreement clauses, bureau narratives, risk memos), each deterministically grounded to `customer_id` + case `recordIds`.
- Credit decisions (exposure, DSO, R-score, hold/terms) remain code-computed and human-gated; RAG output is advisory citation only.
- Fail-safe: unset/unavailable vector store ⇒ credit path behaves exactly as today.
- `npm run verify` green; new tests cover the credit reader, grounding, and fail-safe.

## B1. Generalize the reader (`src/adapters/openAiVectorStore.ts`)
Today: `searchEvidence(line: DeductionLine)` with an internal `buildEvidenceQuery(line)`. Add a customer/case-shaped entry point that keeps the same deterministic post-filter:

```ts
export interface VectorEvidenceQuery {
  customerId: string;
  recordIds: string[];        // case/risk-observation record IDs that anchor grounding
  scenarioTag: string;        // credit scenario, e.g. "credit-covenant" | "risk-drift" | "precedent"
  lineId?: string;            // optional; deduction path keeps passing the line id
  freeTextQuery?: string;     // used by agentic RAG (Part C); defaults to a structured query string
}

// Refactor searchEvidence to accept either a DeductionLine (back-compat) or a VectorEvidenceQuery.
export function buildVectorEvidenceQuery(q: VectorEvidenceQuery): string {
  return q.freeTextQuery ?? [
    `customer:${q.customerId}`, `scenario:${q.scenarioTag}`,
    ...q.recordIds.map((r) => `record:${r}`)
  ].join(" ");
}
```

`mapSearchResults` stays the grounding authority — generalize its filter to compare `attributes.customer_id === q.customerId`, `attributes.scenario_type === q.scenarioTag`, and record-ID intersection with `q.recordIds` (and `q.lineId` when present). The deterministic gate is unchanged in spirit; only the key source widens from `DeductionLine` to `VectorEvidenceQuery`.

## B2. New service tool `retrieval.creditDocs` (`src/services/serviceLayer.ts`)
```ts
const creditDocsToolSchema = z.object({
  customerId: z.string().min(1),
  caseId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  scenarioTag: z.enum(["credit-covenant", "risk-drift", "precedent", "payment-promise"])
}).strict();

// serviceToolMetadata: read_only / none / visibility: "mcp"
"retrieval.creditDocs": {
  schema: creditDocsToolSchema,
  handler: (input, context) => {
    const q = creditDocsToolSchema.parse(input);
    return context.creditVectorStoreEvidenceSource?.readEvidence(q) ?? []; // pre-fetched, sync read
  }
}
```
Add `creditVectorStoreEvidenceSource?: ServiceCreditEvidenceSource` to `ServiceInvocationContext`. Keep it **MCP-visible read-only** so David's agents reach it through the same gateway (ADR-001); internal decision tools stay hidden (mcp-visibility invariant unaffected).

## B3. Credit evidence source builder (`src/services/serviceLayer.ts`)
Mirror `buildOpenAiVectorStoreEvidenceSource` but keyed by customer/case and scenarioTag; pre-fetch the small fixed set of credit scenarioTags for the governed Harbor case, `catch`→`[]` per tag (fail-safe).

## B4. Wire into the credit request context (`src/services/cockpitApi.ts`)
The credit/risk surfaces (`/credit`, `/cfo`, `/trace`, `/query/realtime-tool`) load source via `loadRequiredSupabaseSource(..., { riskObservationRequired: true })`. There, when `OPENAI_API_KEY` + `OPENAI_EVIDENCE_VECTOR_STORE_ID` are set, build `creditVectorStoreEvidenceSource` keyed by `governedConfig.riskMeshCases.harbor.customerId` and the case's risk-observation `recordIds`, and add it to the service context passed to `invokeServiceTool`.

## B5. Consumer surface (new, honest)
David's cockpit has no Maya-style citation flow today, so define where credit RAG renders:
- **Read model:** extend `buildCreditCockpitModel` (`src/services/cockpitModel.ts`) with a `creditEvidence` block (cited credit-doc passages + provenance `vector_store`), built only from `retrieval.creditDocs` results.
- **UI:** a credit evidence panel (mirrors `evidence-dossier.tsx`) on the `/credit` surface, prop-driven, provenance-honest. No business values computed client-side (UI-hardcoded-values invariant holds).

## B6. Ingestion (corpus expansion)
Extend `scripts/provisionOpenAiEvidenceVectorStore.ts` (or a `provisionCreditEvidenceVectorStore` sibling) to upload credit documents with attributes:
```ts
{ documentType: "contract" | "credit-memo" | "correspondence" /* + bureau-narrative if added to the enum */,
  recordIds, source_table, record_id, customer_id, scenario_type: <credit scenarioTag>, provenance: "synthetic" }
```
If bureau narratives need a distinct type, extend `OpenAiVectorStoreEvidenceType` + the Zod enum in lockstep.

## B7. Governance proof (David)
Identical to Part A §3: `mapSearchResults` (customer + scenarioTag + recordIds) → `mergeEvidenceDocuments` (or a credit-side relevance filter) → credit read-model only renders cited records. Exposure/DSO/R-score and any hold/term proposal remain deterministic (`runRiskMeshClosedLoop`, governed config) and human-gated (`actions.proposeHold` / `actions.proposeTerms` stay `draft_only`).

## B8. Tests
| Test | Asserts |
|---|---|
| `tests/unit/credit-vector-evidence.test.ts` | `retrieval.creditDocs` schema; grounding drops non-matching customer/scenarioTag; reader error ⇒ `[]` |
| `tests/invariants/mcp-visibility.test.ts` (extend) | `retrieval.creditDocs` is `visibility:"mcp"` read-only; decision tools still hidden |
| credit cockpit model test | `creditEvidence` only contains cited records; provenance `vector_store`, never `sap_odata` |

---

# PART C — Agentic RAG (ADR-002 Option 2)

Implements ADR-002 §7 Option 2. Converts retrieval from a deterministic pre-fetch (Parts A/B) into **agent-driven, multi-hop, verifier-gated** recall. The agent controls the *query* (recall); the deterministic filter still owns *grounding*; the core still owns the *decision*.

## C0. Goal & acceptance criteria
- The live Forensics agent calls `retrieval.docs` (and `retrieval.creditDocs`) **itself**, over MCP, formulating its own query, across up to `maxTurns` hops.
- A Reviewer/verifier step decides sufficiency; insufficient evidence triggers another bounded retrieval hop.
- Every hit still passes the deterministic grounding gate; dollars/verdicts stay deterministic.
- The loop is bounded (`maxTurns` + `retryCap`); no infinite retrieval.
- `npm run verify` green; tests cover multi-hop, sufficiency gating, and bound enforcement.

## C1. Expose retrieval to the agent over MCP (depends on SPEC-001)
Attach the MCP gateway to the Forensics agent (`agentRuntime.ts`, per SPEC-001) so `retrieval.docs` / `retrieval.creditDocs` are agent-callable tools. The agent now issues `tool_called` events instead of relying solely on the pre-fetch.

## C2. Agent-formulated query (governance-bounded)
Allow the agent to pass `freeTextQuery` into the retrieval tool (B1). **The agent controls recall, not grounding:** `mapSearchResults` still enforces `customer_id` + scenario + record-ID intersection on results, so a creative query cannot pull cross-customer or out-of-scope evidence. Add a guard that the agent's query is scoped to the selected `customerId`/case (reject/annotate otherwise).

## C3. Multi-hop loop + sufficiency verifier
- In `src/services/forensicsQuerySession.ts`, drive evidence from the live agent's `tool_called(retrieval.*)` outputs across turns rather than a single pre-fetch.
- Add the **Reviewer agent** (ROADMAP #1, `src/agents/agentRuntime.ts` + `src/prompts/reviewer.md`) as the sufficiency gate: it asserts the retrieved, grounded passages support the verdict/routing; if not, the loop performs another retrieval hop (bounded by `retryCap`/`maxTurns`).
- Reuse `assertFinalAgentOutput` for the deterministic sufficiency check (cited records present, within scope, deterministic basis).

## C4. Trace & observability
Emit per-hop receipts: `retrieval_hop` (query + result count), `sufficiency_check` (pass/fail + reason), final `grounded_citation`. Surface hop count in `agent-trace-panel.tsx`. Pairs with ROADMAP #6 (trace export).

## C5. Determinism guardrails (hard requirements)
- Bound: `maxTurns` (`liveForensicsStream.ts:156-167`) + `retryCap`; on exhaustion, fall back to the Part A/B classic pre-fetch result (never fail open).
- Grounding: unchanged triple gate (Part A §3) applies to every hop's hits.
- Decision: dollar/verdict/limit/hold still only from deterministic tools; the agent loop produces *evidence + a challenge*, not a number.

## C6. Tests
| Test | Asserts |
|---|---|
| `tests/unit/agentic-rag-loop.test.ts` (stub MCP runner) | multi-hop: hop 1 insufficient ⇒ verifier requests hop 2 ⇒ sufficient ⇒ grounded citation |
| sufficiency-gate test | if no grounded evidence after `maxTurns`, falls back to classic pre-fetch; never returns an ungrounded answer |
| bound test | retrieval hops never exceed `maxTurns`/`retryCap` |
| cross-scope guard | agent `freeTextQuery` cannot surface evidence outside the selected `customerId`/scope |

---

# Combined phasing & acceptance (all parts)

1. **Part A** — Maya classic RAG (independent; ship first).
2. **Part B** — David credit classic RAG (reuses A patterns; needs corpus + credit consumer surface).
3. **Part C** — Agentic RAG (requires SPEC-001 MCP attach + ROADMAP #1 Reviewer; upgrades A and B from pre-fetch to agent-driven).

**Global acceptance (every part):** no model-computed money/verdict/limit/hold (I-1); external actions human-gated (I-7/I-20/I-23); every step a trace receipt with record IDs + deterministic basis (I-17); unknown/insufficient fails closed (I-30); `npm run verify` + `test:e2e:maya-real` green; new behavior covered by unit tests and a gold-case eval (ROADMAP #4).

---

## Out of scope (future work, all parts)
- Supabase `pgvector` backend as an alternative to the OpenAI vector store (single-datastore residency).
- Re-ranking / chunk-level highlighting in the cockpit.
- Embedding-refresh pipeline when source documents change.
- Cross-persona shared retrieval cache.
