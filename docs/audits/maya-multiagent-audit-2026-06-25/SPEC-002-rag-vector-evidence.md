# SPEC-002 — Wire the Vector DB into `retrieval.docs` (RAG, ADR-002)

- **Status:** Ready to implement
- **Date:** 2026-06-26
- **Implements:** `ADR-002-rag-vector-data-source.md`
- **Effort:** ~0.5–1 day · **Risk:** low (additive; structured sources stay authoritative; decision core untouched) · **No source changed yet — this is a plan.**

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

## 7. Out of scope (future work)
- Supabase `pgvector` backend as an alternative to the OpenAI vector store (single-datastore residency).
- Re-ranking / chunk-level highlighting in the cockpit.
- Embedding-refresh pipeline when source documents change.
