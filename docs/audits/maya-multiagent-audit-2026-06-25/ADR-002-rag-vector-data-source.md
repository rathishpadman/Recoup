# ADR-002 — Vector DB as a First-Class Unstructured-Evidence Source in the Data Plane

- **Status:** Proposed (recommended)
- **Date:** 2026-06-26
- **Deciders:** Recoup team
- **Related:** `ADR-001-mcp-data-plane.md`, `SPEC-002-rag-vector-evidence.md`, `src/adapters/openAiVectorStore.ts`, `src/adapters/docRepo.ts`, `src/services/serviceLayer.ts`

---

## 1. Context

Recoup's evidence retrieval today is **structured**: tools read known rows by exact record ID from Supabase and SAP OData (`retrieval.sap/docs/tpm/bureau`). This is excellent for fields like delivery quantity, accrual cap, or dispute case — but it cannot answer *"which clause in this contract proves the deduction is invalid?"* or *"is there an email where the customer accepted this shortage?"* That evidence lives in **unstructured** documents (contracts, correspondence, POD/carrier narratives).

The repo already contains a **real but dormant** RAG capability:
- `src/adapters/openAiVectorStore.ts` — calls OpenAI `vector_stores/{id}/search` (embeddings-backed hybrid semantic+keyword search), then **deterministically filters** results by `customer_id`, `scenario_type`, and record-ID intersection (`mapSearchResults:102-132`).
- `scripts/provisionOpenAiEvidenceVectorStore.ts` — uploads synthetic evidence dossiers and creates the store; `OPENAI_EVIDENCE_VECTOR_STORE_ID` env exists.
- `src/adapters/docRepo.ts` — `DocRepoReadOnlyAdapter` already has an optional `vectorStoreEvidenceReader` slot and `retrieveVectorStoreEvidence()`.

But nothing in the runtime constructs the reader — it is **test-only**. So there is no live RAG.

**Question raised:** *Should the vector DB be part of the Data Source Layer?*

---

## 2. Decision

**Yes. The vector DB is a first-class member of the Data Source Layer — specifically the *unstructured / semantic evidence* source — sitting alongside SAP OData and Supabase, behind the same governed `retrieval.docs` tool, and therefore reachable by agents through the MCP gateway (ADR-001).**

We classify the Data Source Layer into two evidence classes:

| Source class | Members | Retrieval | Role |
|---|---|---|---|
| **Structured / authoritative** | SAP OData (read-only), Supabase rows (settlement, src_*, Tools_data) | Exact key/record-ID reads | Source of truth for every field that feeds a decision/dollar |
| **Unstructured / semantic (NEW, additive)** | Vector DB (OpenAI Vector Store now; Supabase `pgvector` optional later) | Embeddings hybrid search → deterministic grounding | Recall of relevant passages in contracts, correspondence, POD/carrier reports |

**Hard rule:** the vector DB is **additive and advisory** — it provides *candidate citations* for unstructured proof. Structured sources remain authoritative. RAG output never becomes a verdict, routing, or dollar, and cannot be cited unless it passes the deterministic grounding filter (customer + scenario + record-ID intersection) already implemented in `mapSearchResults`.

### Revised data-plane picture (extends ADR-001)

```
                ┌────────────────────── Data Plane (MCP gateway) ──────────────────────┐
 Agents ──MCP──>│  retrieval.sap     → SAP OData (structured, authoritative, read-only) │
 (credential-   │  retrieval.docs    → Supabase rows  ⊕  Vector DB (semantic recall)     │
  less)         │  retrieval.tpm     → Supabase rows                                      │
                │  retrieval.bureau  → Supabase rows                                      │
                │  query.answer / audit.read → deterministic                              │
                └──────────────────────────────────────────────────────────────────────┘
                                    │ every result deterministically
                                    ▼ grounded to record IDs + customer + scenario
                         Control Plane (deterministic core) — computes dollars/verdicts
```

The vector DB enters the system **inside `retrieval.docs`**, merged with the structured Supabase document rows via the existing `mergeEvidenceDocuments`. No new agent-facing tool, no new MCP surface — it composes with ADR-001 for free.

---

## 3. Why include it as a data source (not a bolt-on)

- **It *is* a data source.** It stores and serves evidence documents; treating it as a peer of SAP/Supabase keeps the architecture honest and the provenance model uniform.
- **Single governed choke point.** Because it lives behind `retrieval.docs` (already MCP-visible and governed), it inherits credential isolation, read-only posture, tool-visibility filtering, and audit logging — no parallel ungoverned path.
- **Uniform provenance.** Cockpit can label vector-sourced evidence with its own honest provenance tag, exactly like `sap_odata` / `supabase`, satisfying the "honest provenance, unknown fails closed" invariant (I-30).
- **Best practice.** Production RAG guidance treats the vector store as a retrieval data source in a layered "retrieve → ground → generate" pipeline, with the generative step never trusted for facts. See OpenAI's retrieval/file-search guidance and the "semantic recall + deterministic grounding" pattern.

---

## 4. Alternatives considered

| Option | Summary | Decision |
|---|---|---|
| **A. No RAG** | Keep structured-only retrieval | Rejected — leaves unstructured proof (contracts, emails) unsearchable; misses the "challenge this dispute" use case |
| **B. RAG in the decision path** | Let semantic results drive verdicts/dollars | **Rejected hard** — violates I-1 (code computes every dollar) and I-17 (cited record IDs + deterministic basis) |
| **C. Vector DB as a separate ungoverned service the agents call directly** | Agents hit the vector store outside the gateway | Rejected — bypasses governance, credential isolation, and provenance |
| **D. (Chosen) Vector DB as an additive source inside `retrieval.docs`, deterministically grounded** | Semantic recall merged with structured rows, behind the governed tool | Accepted — additive, governed, composes with ADR-001 |

### Vector store technology choice
- **OpenAI Vector Store (chosen for v1):** already scaffolded; OpenAI manages embeddings (`text-embedding-3` family) and hybrid search; zero embedding infra to maintain.
- **Supabase `pgvector` (future option):** keeps all data in one store (residency/cost), but requires managing an embedding pipeline and SQL similarity queries. Defer unless single-datastore residency becomes a requirement.

---

## 5. Consequences

### Positive
- Unlocks contract-clause and dispute-correspondence retrieval — maps directly to the existing Maya query scenario *"which cited proof can I use to challenge this dispute?"*
- "We use RAG" becomes a **true, governed** claim: semantic recall, deterministic grounding, honest provenance.
- No new attack surface — rides the existing governed `retrieval.docs` / MCP gateway.
- Structured sources stay authoritative; a vector outage degrades gracefully to structured-only.

### Negative / costs
- One more managed dependency (vector store) + provisioning step before demo.
- Per-query embedding-search latency (bounded by `max_num_results`, cacheable).
- Provenance UI must distinguish vector-sourced evidence honestly (a small cockpit-model addition).

### Honest-claims guardrail
- ✅ "Contracts and correspondence are semantically searched, then every hit is re-grounded to a structured record ID before it can be cited."
- ✅ "The vector store is a governed, read-only evidence source behind the same gateway as SAP and Supabase."
- ❌ Do not say "RAG decides the verdict" or relabel vector evidence as SAP/Supabase.

---

## 6. Use-case scenarios (Maya deduction + David credit)

These are concrete, governed RAG scenarios. In every row the pattern is identical: **semantic recall over an unstructured corpus → deterministic grounding to a structured record ID → advisory candidate citation.** RAG never emits a dollar, verdict, limit, or hold — it only surfaces the *proof passage* that the deterministic core and the human then use.

### 6.1 Maya — Deduction Forensics

| # | Scenario | Trigger query (maps to Maya query dock) | Unstructured corpus searched | Structured grounding (must match before citing) | What RAG returns | What stays deterministic |
|---|---|---|---|---|---|---|
| M1 | **Dispute rebuttal** | *"The customer says this was a valid shortage. Which cited proof can I use to challenge it?"* | `correspondence`, `POD`, `carrier-report` | `customer_id` + `scenario_type` + line `recordIds` intersection | The exact email/POD line acknowledging full delivery or the damage exception | Shortage delta = core rule over SAP/Supabase qty; verdict/routing unchanged |
| M2 | **Pricing-below-contract proof** | *"Show the contract term that sets the agreed price for this line."* | `contract` (long pricing PDFs) | `customer_id` + `scenario_type` (pricing) + invoice/contract `recordIds` | The specific pricing/rebate clause | Price variance + dollar delta computed by core rule, not the clause text |
| M3 | **Promo-not-captured proof** | *"Find the promotion terms that should have applied to this deduction."* | `trade-promo`, `contract` | `customer_id` + promo `recordIds` from the TPM line | The promo eligibility/accrual clause | Accrual cap / overclaim math stays deterministic (TPM/Supabase) |
| M4 | **OTIF-fine validity** | *"Is the OTIF penalty supported by the delivery commitment language?"* | `contract` (SLA/OTIF terms), `POD` | `customer_id` + scenario (OTIF) + delivery `recordIds` | The OTIF/late-delivery clause + the POD timestamp narrative | Timestamp mismatch + fine validity decided by core rule |

### 6.2 David — Credit Risk *(persona on `/credit`; extends the corpus)*

David's workflow (credit exposure, DSO drift, Risk-Mesh / Sentinel R-score, Containment intent, Harbor case) is unstructured-document-heavy in exactly the places RAG helps. **Note:** these require ingesting credit-side documents into the vector store (master credit agreements, bureau narratives, risk-committee memos) — the current store is seeded with deduction evidence, so this is a corpus-expansion item, not just a wiring change.

| # | Scenario | Trigger query (David credit cockpit) | Unstructured corpus searched | Structured grounding (must match before citing) | What RAG returns | What stays deterministic |
|---|---|---|---|---|---|---|
| D1 | **Covenant / limit clause** | *"What does the master agreement say about this customer's credit limit and review triggers?"* | credit agreement (`contract`) | `customer_id` + credit-segment `recordIds` | The limit / covenant / review-trigger clause | Exposure, DSO, R-score, and any hold/term proposal stay code-computed (governed config) |
| D2 | **Bureau / adverse-narrative recall** | *"Is there bureau commentary explaining the recent risk drift for this customer?"* | bureau narrative reports (free-text) | `customer_id` + bureau `recordIds` | The relevant bureau commentary passage | R-drift score + Sentinel trigger remain deterministic over structured risk observations |
| D3 | **Precedent recall (memory-RAG)** | *"How did we handle this customer's last limit breach or hold?"* | prior risk-committee memos / resolved-case notes (audit/memory corpus) | `customer_id` + prior case `recordIds` | The precedent memo passage — advisory context only | The current hold/terms proposal is still a draft-only, human-gated action |
| D4 | **Payment-promise / dunning history** | *"Find correspondence where the customer promised payment terms feeding the DSO drift."* | `correspondence`, collections/dunning letters | `customer_id` + payment `recordIds` | The promise/commitment email passage | DSO computation + containment intent stay deterministic; no auto-action |

### 6.3 Recommended demo scenario

**M1 (dispute rebuttal)** is the strongest first demo: it maps to an existing Maya query-dock scenario, uses doc types already seeded (`correspondence`, `POD`), and the "found semantically, grounded to the record ID" beat is visceral. **D1 (covenant clause)** is the best David extension once the credit corpus is ingested — it shows the same governed RAG pattern generalizing across personas, which strengthens the "data-source layer, not a Maya hack" argument in §2.

### 6.4 Cross-persona guardrail (applies to every row above)

Vector evidence for **either** persona passes the same three deterministic gates (see `SPEC-002` §3): `mapSearchResults` exact-match filter → `mergeEvidenceDocuments` record-ID relevance → downstream citation-scope guard. A semantic hit that does not deterministically tie to the selected line/customer is **dropped, not shown** — fail-closed, identical to the structured-source behavior (I-30).

### 6.5 Technical walkthrough — Maya M1 end-to-end (how a vector hit becomes a citation)

This traces the **existing** runtime path and marks the **(NEW)** insertion points from `SPEC-002`.

```
Browser query dock
  → POST /api/forensics/query                         cockpit/app/api/forensics/query/route.ts
  → POST /forensics/query                             src/services/cockpitApi.ts  (verifyHumanCockpitAuth + Zod)
  → runForensicsQuerySessionWithLiveAgents(...)       src/services/forensicsQuerySession.ts:172
     → runForensicsQuerySession(...)                  (deterministic answer; live overlay is separate)
        → runForensicsInvestigation(...)              src/agents/forensics.ts:127
           → retrieveEvidenceDocuments(line, …)       src/agents/forensics.ts:429
              → invokeTracedTool("retrieval.sap")     (structured, authoritative)
              → invokeTracedTool("retrieval.docs")    src/services/serviceLayer.ts  ← (NEW) merges vector hits
              → invokeTracedTool("retrieval.tpm")
        → buildQueryCitations(decision, recordIds)    src/services/forensicsQuerySession.ts:294
```

**The exact integration seam (`retrieval.docs`, `serviceLayer.ts`).** Today the handler returns only Supabase rows:

```ts
// CURRENT
handler: (input, context) => {
  const line = DeductionLineSchema.parse(input);
  return retrieveSyntheticEvidenceOrThrow(context, "retrieval.docs", "docs-repo", line);
}
// SPEC-002 (NEW): structured ⊕ vector, both EvidenceDocument[]
const structured = retrieveSyntheticEvidenceOrThrow(context, "retrieval.docs", "docs-repo", line);
const vector = context.vectorStoreEvidenceSource?.readEvidence(line) ?? [];
return mergeEvidenceDocuments(line, structured, [...vector]);   // src/tools/retrieval/docs.ts
```

**Why the citation then appears (no extra UI work).** `buildQueryCitations` builds the citable set from the decision's evidence documents:

```ts
// src/services/forensicsQuerySession.ts:298
const availableRecordIds = new Set([
  decision.lineId,
  ...decision.recordIds,
  ...decision.evidenceDocuments.flatMap((d) => d.recordIds)   // ← a vector-sourced EvidenceDocument lands here
]);
```

So once a vector hit is converted to an `EvidenceDocument` and merged into `retrieveEvidenceDocuments`, its `recordIds` flow into `decision.evidenceDocuments` and become citable through the **existing** citation path — the cockpit `CitedAnswerCard` / `EvidenceDossier` render it with no new fields (provenance label aside, §6.5 of `SPEC-002`).

**The deterministic grounding predicate (already implemented).** A semantic hit is only admitted if `mapSearchResults` passes it (`src/adapters/openAiVectorStore.ts:107-117`):

```ts
result.attributes.customer_id === line.customerId &&
result.attributes.scenario_type === line.scenarioType &&
dedupe([...result.attributes.recordIds, result.attributes.record_id])
  .some((rid) => new Set([line.lineId, ...line.recordIds]).has(rid))
```

`DeductionLine` already carries the keys this needs: `lineId`, `customerId`, `scenarioType`, `recordIds` (used in `buildEvidenceQuery`, `openAiVectorStore.ts:134-141`), and `ruleId` (e.g. `pricing-below-contract`, `otif-fine-valid`, `promo-not-captured` per `forensics.ts:toRuleId`). M1–M4 differ only by which `ruleId`/`scenarioType` the line carries and which `documentType` the corpus holds — **no new code per scenario**, just seeded documents.

**Ingestion contract (what each uploaded file must carry).** Every file in the vector store must have these attributes or the grounding filter drops it. This is the `EvidenceAttributes` shape the provisioner writes (`scripts/provisionOpenAiEvidenceVectorStore.ts:21-29`), validated by `searchResultSchema.attributes` (`openAiVectorStore.ts:45-59`):

```ts
{ documentType: "POD"|"carrier-report"|"contract"|"correspondence"|"credit-memo"|"invoice"|"trade-promo",
  recordIds: string[], source_table: string, record_id: string,
  customer_id: string, scenario_type: string, provenance: "synthetic" }
```

So enabling M1 = (a) ingest `correspondence`/`POD` files tagged with the line's `customer_id` + `scenario_type` + `recordIds`, (b) the `SPEC-002` wiring in `serviceLayer.ts`/`cockpitApi.ts`. Nothing else.

### 6.6 Integration touchpoints (Maya scenarios)

| Concern | File / symbol | Change |
|---|---|---|
| Merge vector into docs retrieval | `src/services/serviceLayer.ts` → `retrieval.docs` handler, `ServiceInvocationContext` | NEW `vectorStoreEvidenceSource?` + merge (SPEC-002 §2-3) |
| Pre-fetch source builder | `src/services/serviceLayer.ts` → `buildOpenAiVectorStoreEvidenceSource` (mirror `buildSupabaseServiceSyntheticEvidenceSource`) | NEW |
| Construct per request | `src/services/cockpitApi.ts` → `loadRequiredSupabaseRunContext` | NEW: build reader when `OPENAI_API_KEY` + `OPENAI_EVIDENCE_VECTOR_STORE_ID` set |
| Reader (exists) | `src/adapters/openAiVectorStore.ts`, `src/adapters/docRepo.ts` | already implemented; just instantiate |
| Citation flow (exists) | `src/services/forensicsQuerySession.ts:buildQueryCitations` | none — vector docs ride the existing path |
| Honest provenance | `src/services/cockpitModel.ts` / `mayaDataProvenance.ts` | NEW label `vector_store` (SPEC-002 §5) |

### 6.7 David scenarios require a real code extension (be explicit)

The current reader is **deduction-shaped**: `searchEvidence(line: DeductionLine)` (`openAiVectorStore.ts:79`). David's credit path has **no `DeductionLine`** — the `/credit` and Risk-Mesh flow builds its model from risk observations (`buildCreditCockpitModel`, `runRiskMeshClosedLoop`, `assessHarborSentinel`) keyed by `customerId`/case, and **does not call `retrieval.docs` at all**. So D1–D4 are not just "ingest more docs" — they need:

| Required change | Where | Notes |
|---|---|---|
| Generalize the search input | `openAiVectorStore.ts` → add `searchEvidenceForCustomer({ customerId, caseId, recordIds, scenarioTag })` (or widen `searchEvidence` to accept a query object, not just `DeductionLine`) | Keep the same deterministic grounding (`customer_id` + scope `recordIds`); swap `scenario_type` for a credit `scenarioTag` |
| New credit retrieval tool | `src/services/serviceLayer.ts` → e.g. `retrieval.creditDocs` (read-only, MCP-visible) | So David's agents reach it via the same governed gateway (ADR-001) |
| Wire into the credit context | `src/services/cockpitApi.ts` → `loadRequiredSupabaseSource` (the `riskObservationRequired` path used by `/credit`, `/cfo`, `/trace`, realtime-tool) | Attach a credit `vectorStoreEvidenceSource` keyed by `governedConfig.riskMeshCases.harbor.customerId` |
| Ingestion: credit corpus + attributes | `scripts/provisionOpenAiEvidenceVectorStore.ts` (or a sibling) | Add credit-agreement / bureau-narrative / risk-memo files tagged `customer_id` + a credit `scenarioTag` (e.g. `credit-covenant`, `risk-drift`, `precedent`) + `recordIds` from the risk observation/case |
| Provenance + cockpit | `buildCreditCockpitModel` / credit cockpit components | Surface the semantic-match tile honestly on the credit surface |

**Effort:** Maya (M1–M4) ≈ the SPEC-002 0.5–1 day. David (D1–D4) ≈ +1–2 days for the reader generalization, the new `retrieval.creditDocs` tool, credit-context wiring, and corpus ingestion. Recommend shipping Maya first (M1), then generalizing for David (D1) to prove the data-source-layer claim across personas.

---

## 7. Classic vs Agentic RAG — and the Option-2 agentic path

**What SPEC-002 specs is *classic* RAG, not agentic RAG.** This is intentional, but the difference is material for a "top-tier" claim, so it is recorded explicitly here.

| Dimension | **Option 1 — Classic RAG (SPEC-002, recommended first)** | **Option 2 — Agentic RAG (upgrade)** |
|---|---|---|
| Who retrieves | Deterministic pipeline: pre-fetched per line in `buildOpenAiVectorStoreEvidenceSource`, before agent reasoning | The **agent** decides to retrieve and calls `retrieval.docs` itself (over MCP, ADR-001) |
| Query formulation | Fixed string `buildEvidenceQuery` (`customer:… deduction:… scenario:… record:…`) | Agent **formulates and reformulates** the query from the question/case |
| Iteration | One shot | **Multi-hop**: re-query / drill down until evidence is sufficient, bounded by `maxTurns` |
| Sufficiency check | None (filter only) | A **verifier/critic agent** judges whether retrieved evidence supports the claim |
| Determinism | Full | Bounded (needs `maxTurns` + grounding gate + verifier) |
| Cost/latency | Low, fixed | Higher, variable |
| "Top-tier" signal | Solid baseline | **This is the differentiator** |

**Non-negotiable in both options:** every retrieved hit still passes the same three deterministic grounding gates (§6.4 / SPEC-002 §3), and the dollar/verdict stays code-computed. Agentic RAG improves *how evidence is found*, never *who computes the money*.

### Option-2 (agentic) integration sketch
Agentic RAG is the composition of three capabilities already in scope:

1. **MCP-exposed retrieval tool** (ADR-001 / SPEC-001) — `retrieval.docs` is attached to the Forensics agent via `MCPServerStreamableHttp`, so the agent can call it mid-loop.
2. **Bounded agent loop** — `maxTurns` is already enforced (`liveForensicsStream.ts:156-167`); the agent issues retrieval calls across turns instead of a single pre-fetch.
3. **Verifier/critic step** — a Reviewer agent (see `ROADMAP-top-tier-multi-agent.md` item #1) asserts the cited passages support the verdict before the loop ends; if not, it triggers another retrieval hop.

Integration touchpoints (beyond SPEC-002): `src/agents/agentRuntime.ts` (attach retrieval MCP server + add reviewer agent), `src/agents/liveForensicsStream.ts` / `src/services/forensicsQuerySession.ts` (let the live agent's `tool_called` events drive evidence, not just a pre-fetch), and a new sufficiency receipt in the trace. Full feature set and phasing live in `ROADMAP-top-tier-multi-agent.md`.

**Recommendation:** ship **Option 1 (classic)** for the first demo (reproducible, loop-free), then layer **Option 2 (agentic)** as the headline upgrade once the Reviewer agent and MCP-attached retrieval are in place.

---

## 8. References
- OpenAI — Retrieval & File Search / Vector Stores: https://platform.openai.com/docs/guides/retrieval
- OpenAI Agents SDK — tools & retrieval: https://openai.github.io/openai-agents-js/
- Supabase — pgvector / AI & vectors: https://supabase.com/docs/guides/ai
- Recoup — `src/adapters/openAiVectorStore.ts`, `src/adapters/docRepo.ts`, `src/tools/retrieval/docs.ts`, `src/services/serviceLayer.ts`
- Companion: `ADR-001-mcp-data-plane.md`, `SPEC-002-rag-vector-evidence.md`
