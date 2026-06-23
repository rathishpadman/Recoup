# SDD Owner Inputs Status

This tracks the non-secret owner inputs for Recoup's release-readiness gate. Do not paste secrets, credentials, service-role keys, SAP passwords, OpenAI keys, or private certificates here. Do not include ERP write-back instructions. Do not invent budgets, thresholds, labels, or policy values.

## Release Gate Inputs - Closed

| Input ID | Owner Source | Requested Input | Required For |
|---|---|---|---|
| `run-control-token-budget` | Appendix G | Owner-approved token budget per runtime phase or agent. | I-16, `verify:release` |
| `run-control-step-budget` | Appendix G | Owner-approved step budget per runtime phase or agent. | I-16, `verify:release` |
| `run-control-retry-cap` | Appendix G | Owner-approved retry cap per runtime phase or tool. | I-16, `verify:release` |
| `eval-label-manifest` | Expert eval labels | Owner-approved manifest of required intent and arbitration eval case IDs/counts. | I-28, `verify:release` |
| `complete-intent-labels` | Expert eval labels | Complete customer intent labels for the manifest-defined demo evaluation set. Use only `gaming`, `distressed-honest`, or `genuine`. | I-19, I-28, `verify:release` |
| `complete-arbitration-labels` | Expert eval labels | Complete expert arbitration labels for the manifest-defined Risk Mesh demo evaluation set. | I-21, I-28, `verify:release` |
| `risk_mesh_option_values` | Round 2 owner input | Source-owned numeric option values for the default Harbor Risk Mesh ranking path. | I-17, I-21 |
| `r-score-component-scores` | Round 2 owner input | Source-owned `0-100` R-score component scores for the seed/source SQL path. | I-19 |
| `decision-confidence-threshold` | Round 2 owner input | Appendix-G decision-confidence threshold value for the present-threshold config path. | I-17 |
| `openai-evidence-vector-store-seed-lifecycle` | Round 2 owner input R2-4 | Owner-approved seed-42 evidence dossier provision/re-index operation, exposed as `npm run provision:openai-evidence-vector-store`. | OpenAI vector-store evidence adapter |

Status: the initial release gate inputs were supplied in `docs/Tools_data/CODEX_OWNER_INPUTS_RESPONSE.md`, migrated into live Supabase `recoup_config`, and previously validated by `npm.cmd run verify`. Runtime release readiness reads those rows through the Supabase repository and validates row hashes; it does not pass from hardcoded TypeScript values. Active governed config rows in Supabase are also runtime authority: `config/governed.ts` validates their schema, ranges, and sum-to-one invariants, while checked-in Day-1 values are setup/test seed fixtures rather than exact runtime locks.

Round 2 implementation reconciliation note: the owner has now supplied Risk Mesh option values, R-score component scores, and the decision-confidence threshold. Local tests cover default ranked Risk Mesh, source-owned R-score seed SQL, and decision confidence when the threshold is present. Live Supabase read-back on 2026-06-23 confirmed active `risk_mesh_cases`, `arbitration_eval_labels`, `decision_confidence_threshold`, and the four Tools_data customer R-score rows. The OpenAI evidence vector store was provisioned from `.env.local`, four synthetic dossiers were uploaded, and only `OPENAI_EVIDENCE_VECTOR_STORE_ID` was written back locally; `package.json` now exposes the manual owner-approved `npm run provision:openai-evidence-vector-store` command for first provisioning or deterministic seed regeneration. Production `/run` and MCP SAP/docs/TPM/bureau retrieval now uses Supabase `recoup_src_sap`, `recoup_src_docs`, `recoup_src_tpm`, and `recoup_src_bureau` evidence rows and fails closed when required source context is unavailable; Forensics rule facts now require `recoup_deduction_lines.rule_input_json`; static source/rule data is only a test/setup fixture. The owner-locked R1 SAP-primary/Supabase-fallback source needs are also callable through the read-only `sources.r1Read` service tool and `GET /sources/r1/:need`, with SAP metadata-validated read plans or Supabase authoritative fallback plans only for the bounded R1 set. Do not edit the owner response artifact without owner confirmation.

## Still Bound After Release Gate

These are not secrets either. The R1 source-contract decisions are now locked in
`docs/Tools_data/CODEX_OWNER_INPUTS_RESPONSE.md` and the Round 2 owner-input thread; remaining items are either
production policy/source contracts or deterministic confidence/source policies that Codex must not invent.

## Exact Remaining Inputs To Close Full Production SDD

The backend codebase has no confirmed owner-free implementation gap after the latest full `npm.cmd run verify` gate. These are the only remaining items that prevent claiming full production SDD completion.

| Pending item | Exact owner/source input required | Where it should land once supplied | Current code status |
|---|---|---|---|
| Decision-confidence production contract | Per scenario/rule fields for `evidenceCompleteness`; exact source-vs-source comparisons for `sourceAgreement`; exactness/tolerance rules for `ruleMatchStrength`; source table/API paths, field names, join keys, freshness, fail-closed behavior; governance choice for `0.40/0.30/0.30` blend weights. | `recoup_config` or source-contract tables plus tests that assert field-level scoring and fail-closed behavior. | Threshold/formula path is implemented; field-level production contract is intentionally blocked. |
| Broader live O2C source mappings beyond R1 | SAP/non-SAP service or table names, entity sets, key fields, sample payloads, deterministic record IDs, reconciliation keys, and refresh/data-owner policy for entities beyond the locked R1 source-read set. | Connector/source mapping config, Supabase source tables, and adapter tests per approved source. | Locked R1 SAP-primary/Supabase-fallback reads are implemented; broader source expansion is intentionally deferred. |
| Production evidence corpus beyond seed-42 | Which real documents/files are in scope, required citation metadata, corpus owner, refresh/re-index cadence, retention, and validation policy. | Vector-store ingestion/provisioning policy and metadata-backed corpus rows; no secrets in docs. | Seed-42 vector-store lifecycle is implemented and provisioned; production corpus policy is intentionally deferred. |
| Production verification flags | Final owner-confirmed embeddings model ID, Codex build-model ID, and SAP sandbox instance identity for published/production claims. | Deployment/release notes or governed config rows, depending on how the owner wants them controlled. | Runtime does not assert unverified identities. |
| Optional Winston production logging | Approval to add Winston plus required log format, sinks, retention, redaction, and correlation fields. | Dependency approval plus logging middleware/config update. | Current no-new-dependency JSON error/correlation middleware is implemented. |
| Crestline beyond review-only | Explicit policy/order data if Crestline should support hold, freeze, or partial-hold instead of R1 review-only. | Governed scenario/config rows and gold-set preserving tests. | R1 is owner-locked to review-only; no external action is staged. |

## Owner Response Template

Paste non-secret answers under these headings when production closure is required. Use `not in scope for production close` for any item the owner intentionally defers.

```md
### Decision-confidence production contract
- evidenceCompleteness required fields by scenario/rule:
- sourceAgreement comparisons by scenario/rule:
- ruleMatchStrength exactness/tolerance rules:
- source table/API paths and canonical field names:
- record-ID join keys:
- freshness and fail-closed behavior:
- confidence blend weights governance (`0.40/0.30/0.30` fixed or configurable):

### Broader live O2C source mappings beyond R1
- approved SAP services/entity sets/key fields/sample payloads:
- approved non-SAP source tables/API paths/key fields/sample payloads:
- deterministic record IDs and reconciliation keys:
- source refresh cadence and data owner:
- entities explicitly out of scope:

### Production evidence corpus beyond seed-42
- approved corpus sources:
- required citation metadata:
- corpus owner:
- refresh/re-index cadence:
- retention/deletion policy:
- validation and fail-closed behavior:

### Production verification flags
- embeddings model ID:
- Codex build-model ID:
- SAP sandbox/production instance identity:
- where these values should be recorded:

### Optional Winston production logging
- add Winston dependency? yes/no:
- required log format/sinks/retention:
- redaction rules:
- required correlation fields:

### Crestline beyond review-only
- keep R1 review-only? yes/no:
- if no, approved hold/freeze/partial-hold policy:
- source/order data:
- gold-set parity constraints:
```

- Round 2 numeric arbitration `optionValue` inputs are supplied; live Supabase read-back confirmed the active `risk_mesh_cases` row has 16 option-value positions and the expected hash.
- The Appendix-G decision-confidence threshold and formula are supplied; live Supabase read-back confirmed the active threshold row and expected hash. Production confidence gating still needs a deterministic field-level confidence evidence contract. HITL/draft-only protections remain enforced. Required source/owner inputs before this can be marked complete:
  - Per scenario/rule required evidence fields for `evidenceCompleteness`, not only document types.
  - Per rule source-corroboration comparisons for `sourceAgreement`, for example exact field joins such as POD quantity versus SAP invoice quantity or contract price versus billed price.
  - Per rule exactness criteria for `ruleMatchStrength`, including whether missing fields fail closed, score `0`, or use owner-defined partial/tolerance bands.
  - Production source mappings for those fields: table/API path, canonical field names, record-ID join keys, freshness expectations, and fail-closed behavior.
  - Config schema and governance path for the R2-3 configurable confidence blend weights `0.40/0.30/0.30`.
- SAP delivery, G2 credit memo/reference, and aging grids are R1-locked to Supabase fallback when SAP probes fail; do not chase SAP-side G2/delivery seeding for R1. The bounded R1 source reads are implemented as service/API read-plan calls; broader live O2C entity mappings remain production source contracts.
- SAP/docs/TPM/bureau source retrieval for production `/run` and MCP is DB-backed through Supabase `recoup_src_sap`, `recoup_src_docs`, `recoup_src_tpm`, and `recoup_src_bureau`, and the generated setup SQL now creates the broader connector/readiness table set. Broader production data contracts, row ownership, and source refresh policies remain source/owner contracts.
- Live Supabase was updated on 2026-06-23 so active `recoup_config.risk_mesh_cases` owns containment and risk observation criteria, and `recoup_deduction_lines.rule_input_json` is populated for S1-S8. Fresh setup SQL in `docs/supabase-memory-schema.sql` carries the same shape.
- R-score source field names are supplied for R1, and Harbor DSO R-drift now computes from Supabase Tools_data `payments.days_to_pay` rows cited through DB-backed `risk_mesh_cases` source refs. Supabase Tools_data `customers.r_score_component_scores_json` exists as a nullable checked `jsonb` source column and the reader computes weighted R-score only when all four components are strict JSON numbers in the `0-100` range. Round 2 source-owned component scores are supplied, local tests cover the seed SQL path, and live Supabase read-back confirmed all four customer rows. The unresolved bureau tax-lien row is cited as a Sentinel drift/narrative signal, not a weighted R-score component. Codex must not invent raw-to-0-100 transforms or seed defaults beyond the supplied source values.
- Crestline is owner-locked to review-only in R1; do not add hold, freeze, partial-hold, or a second arbitration scenario because that would break gold-set parity.
- Broader production evidence-corpus expansion beyond the owner-approved seed-42 vector-store provision/re-index command remains a source/owner contract. The R1 seed operation is no longer a pending owner input: `scripts/provisionOpenAiEvidenceVectorStore.ts` creates/reuses the store, uploads synthetic evidence dossiers, writes only `OPENAI_EVIDENCE_VECTOR_STORE_ID` locally, and is exposed through `npm run provision:openai-evidence-vector-store`. Run it manually only on first provisioning or deterministic seed regeneration unless the script is later made cleanup-idempotent. The metadata attribute schema remains enforced in `src/adapters/openAiVectorStore.ts` (`source_table`, `record_id`, `customer_id`, `scenario_type`, `provenance=synthetic`).
- Owner-confirmed embeddings model ID, Codex build-model ID, and SAP sandbox instance identity.
