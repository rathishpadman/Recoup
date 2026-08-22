# Phase 0 Evidence Record — Cash Application Agent Workspace

**Record ID:** RECOUP-EVR-CAAW-P0-001
**Compiled (UTC):** 2026-08-22T09:47:23Z
**Environment label:** `recoup-remote-container` (ephemeral cloud checkout, Linux, Node 22.22.2)
**Approved target SHA:** `fbfeac025d521e59eb1206932204c69949eccd72`
**Branch:** `claude/project-instructions-check-g7cuvg`
**Reviewed baseline:** `origin/main` at `0dfcaa7edcb7c3b6f1d8952fd0f100fa5e018c97`, as named by SDD addendum v0.9.4 and TDD v0.9.4; direct ancestor of the target SHA
**Contract:** implementation specification §5.2 (twelve exit items) and SDD addendum §20.1 (per-entry fields)
**Disposition:** **NO-GO.** 8 of 12 exit items open.

Per §20.1, no credentials, authorization headers, customer free text or attachment
contents appear in this record. SAP and Supabase variables are recorded by name and
presence only.

---

## Item 1 — Document set — **PASS**

Four governing documents committed together on the target SHA (commit `fbfeac0`,
amended by the commit carrying this record).

| Document | Version | sha256 |
|---|---|---|
| `docs/Recoup_Business_Requirements_Document_v3.3.4_Cash_Application_Agent_Workspace.md` | 3.3.4 | `c7f83c414763459ab115aab021aba5c5a01cd098fb0bec777ec0a9c531c2f09e` |
| `docs/2026-08-21-cash-application-agent-workspace-sdd-addendum.md` | 0.9.4 | `50b58a51443ba65f1d792432b7e5d59fd78c4194011408703c2e1f2bff703deb` |
| `docs/2026-08-21-cash-application-agent-workspace-technical-design.md` | 0.9.4 | `9d36d535afb8a5d547c2cfc4ceade6cc83557cebb53d41f6f5831263918670e6` |
| `docs/2026-08-22-cash-application-agent-workspace-implementation-spec.md` | 1.1-review | `a9f62f9623ebb29ed9428b1fee223acf094de2ad5ed029a5f7317d537f61547d` |

**Cross-reference finding (closed).** The three design documents originally cited the
BRD with a `.docx` extension. Only the semantic Markdown edition was supplied. On
owner instruction the four pointer references were amended to `.md`
(SDD addendum lines 26 and 37, TDD line 8, specification line 32). The BRD's own
header provenance note is unchanged and still records the source DOCX as the
formatting authority with sha256
`526137ED0C29A373D459EE40179B735B76A0CB755E409696370BFF883FFCCBD9`.

**Residual.** `docs/plans/2026-08-19-remittance-email-cash-application-agent-workspace-plan.docx`
and `docs/specs/Recoup_Software_Design_Document_v3.0.docx` remain uncommitted and
unresolvable. `docs/adr` is absent by design per AD-CA-10 and is not a defect.

**Reviewer:** pending. **Owner decision:** pending.

---

## Item 2 — SAP GET-only metadata evidence — **FAIL-CLOSED / OPEN** (D-02)

| Field | Value |
|---|---|
| Timestamp (UTC) | 2026-08-22T09:47:23Z |
| Environment | `recoup-remote-container` |
| Provider / service | SAP S/4HANA OData v2 |
| Request path | none issued |
| Response status | n/a — no request attempted |
| Result | **FAIL** |

No probe was possible. `.env.local` is absent from this checkout (matched by the
`.env.*` ignore rule, therefore never present in a fresh clone) and no `SAP_ODATA_*`
name is set in the process environment. The loader `config/localRuntimeEnv.ts` is
present and its fail-closed guard `isConfiguredRuntimeValue` is holding.

Variable names expected by `.env.example`, recorded by name only:
`SAP_ODATA_BASE_URL`, `SAP_ODATA_CLIENT`, `SAP_ODATA_CLIENT_ID`,
`SAP_ODATA_CLIENT_SECRET`, `SAP_ODATA_SCOPE`, `SAP_ODATA_TENANT`,
`SAP_ODATA_TOKEN_URL`, `SAP_ODATA_USERID`.

Per AGENTS.md §3.1 the loader was inspected before any conclusion was drawn. Base
URL, scheme and port could not be checked because no configuration was reachable;
the prior owner record of HTTP 401 (spec §5.1) therefore stands unchanged and
unrefuted. **Authentication failure is not proof that a suitable entity is absent.**

**Residual blocker:** corrected read-only SAP authorization, then service/entity/key/
property metadata evidence. Only Treasury and Architecture may sign D-02.

---

## Item 3 — Bounded approved-fixture read (settled status + freshness) — **FAIL-CLOSED / OPEN** (D-02)

Not permissible while Item 2 is unproven.

### Supplementary probe — Supabase proxy substitute (owner-directed)

| Field | Value |
|---|---|
| Timestamp (UTC) | 2026-08-22T09:47Z |
| Environment | Supabase project `nmwfftudympcvcjtyjbf`, region ap-south-1, ACTIVE_HEALTHY |
| Service / path | `public.recoup_src_sap`, read-only; schema and coverage aggregate only |
| Response status | success |
| Result | **FAIL** — required entity absent |

Coverage observed:

| service_name | entity_set | document_type | rows | newest `retrieved_at` |
|---|---|---|---|---|
| `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentFs` | invoice | 6 | 2026-06-24 |
| `ZUI_BILLINGDOCUMENTFS_0001` | `C_BillingDocumentItemFs` | invoice | 6 | 2026-06-24 |

The proxy table carries billing/invoice entities only. There is **no cleared-item,
payment or cash-receipt entity, no settled-status property**, and the newest row is
59 days old against a compile date of 2026-08-22.

**Governance note.** Substituting a Supabase proxy for the authoritative settlement
source is not one of the two decisions §5.3 permits, and SA-CA-01 forbids allocation
without a cited authoritative settled `CashReceipt`. This probe is recorded as
evidence only. It does not advance D-02 and must not be read as doing so.

---

## Item 4 — Private scanner endpoint, readiness and fixtures — **OPEN** (D-04)

No scanner adapter, health contract or approved clean/unsafe fixture exists in the
target SHA. AC-01 remains unreachable.

---

## Item 5 — CSV v1 and claimed-reason contract — **OPEN** (D-05 / D-08)

UTF-8 CSV v1 field set, the required machine-readable claimed reason code, the
approved clean fixture and the deterministic reason-map version/hash all await joint
owner ratification.

---

## Item 6 — Allocation policy pack — **OPEN** (D-07)

Cardinality, order, discount, credit, rounding, tolerance, overpayment, FX, residual
and ambiguity branches are unratified. Missing branches remain `Contract gap` and
later phases do not start.

---

## Item 7 — Provider, signature, recipient, acknowledgement and replay contract — **OPEN** (D-03)

---

## Item 8 — Workflow states, roles, `cash_run_control`, model/cache, NFR/SLO — **OPEN** (D-11 … D-16, D-19)

---

## Item 9 — Dirty-checkout disposition register — **NOT APPLICABLE TO THIS CHECKOUT**

This checkout was clean at session start and at every commit boundary. Verified four
ways: `git status --porcelain` empty, `--ignored=matching` empty, `git stash list`
empty, `HEAD` equal to `origin/main` at session start.

The dirty checkout described in spec §5.1 is `main` at
`eeca34327b562bbc3101ac5f019d1a4ecd1f2be7`. That commit is present in this repository
and is 13 commits behind `origin/main`; its `.gitignore` does not carry the
`.claude/worktrees/` rule, exactly as §5.1 records. The disposition register remains
owed for the authoring workstation and is not discharged by this record.

---

## Item 10 — Committed `.claude/worktrees/` ignore rule — **PASS**

Committed in `604a5fc`. Verified on the target SHA using the specification's own
acceptance checks:

| Check | Source | Result |
|---|---|---|
| `git show HEAD:.gitignore` contains a line whose trimmed value equals `.claude/worktrees/` | §7.2 | PASS (line 20) |
| `git check-ignore -q -- .claude/worktrees/backup-preflight-probe` | §6.2 | exit 0 |
| `git check-ignore -q -- .claude/worktrees/worktree-preflight-probe` | §7.2 | exit 0 |
| `git check-ignore -q -- .claude/worktrees/approved-target-probe` | §7.2 | exit 0 |

Scope is `.claude/worktrees/` and deliberately not `.claude/`. A bare `.claude/`
fails the §7.2 trimmed-equality test and would additionally conceal a future tracked
`.claude/settings.json`. Both behaviours were confirmed in a throwaway repository
before the rule was committed.

Mechanism this closes: a linked worktree's directory is untracked content in the
parent repository, so without the rule `git status --porcelain=v1` reports
`?? .claude/`. The §6.3 rehearsal compares original and restored status with
`Compare-Object` and throws on any difference, so the rehearsal tooling would have
failed the restore on a difference it created itself.

---

## Item 11 — Clean target worktree and baseline verify — **PARTIAL**

Gates executed on the target SHA. Per §13.1 this is an **offline partial baseline**,
because the governed runtime inputs `verify:release` requires are unavailable in this
environment.

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test` | exit 0 — 181 files, 1680 tests passed |
| `npm run depcruise` | exit 0 — no violations, 161 modules / 558 dependencies cruised |
| `npm run verify:release` | **BLOCKED** — exit 1, `governed accuracy bars unavailable` |
| `npm run verify` (aggregate) | **BLOCKED — governed runtime inputs unavailable** |

`verify:release` loads governed owner inputs from Supabase. No `SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY` is set in this environment and no `.env.local` is
present, so the release-readiness gates return `governed accuracy bars unavailable`
rather than a pass or a substantive failure. Configuration was not weakened, no file
was excluded and no hook was skipped.

§13.1 is explicit that a partial baseline cannot satisfy §5.2, §18 or a GO decision.
Item 11 therefore remains **PARTIAL** and blocks the §18 baseline condition.

The feature worktree at `.claude/worktrees/cash-application-agent-workspace` has
**not** been created. §7.1 requires the release owner to name the target branch and
reviewed SHA first, and §7.2 requires the ignore rule to be present on that SHA —
now satisfied by Item 10.

---

## Item 12 — Owner signatures and residual-risk statement — **OPEN**

---

## D-02 contingency election (§5.3)

**Election superseded 2026-08-22.** The owner first elected option 1, then confirmed
that no real bank or treasury source is available and directed that a proxy be built
so work can proceed. With no bank or lockbox source in existence, option 1 is not
reachable: it requires a named external authority to promote. The operative election
is therefore **option 2 — defer the live slice**, under which a proxy is permitted
only as an explicitly labelled rehearsal/shadow capability.

Consequences of option 2, recorded so they are not later mistaken:

- AC-01 remains **blocked**. Production cash allocation and live email-to-Maya are
  not claimed complete.
- The feature cannot meet §18 or §19 while this election stands.
- No customer-facing effectiveness claim is permitted from proxy, reference,
  synthetic or replay data (§17.6).
- The proxy must never be presented as an authoritative settled `CashReceipt`
  source; SA-CA-01 continues to forbid allocation without one.

### Superseded: option 1 assessment (retained for audit)

The owner had elected **option 1 — promote another authoritative source**.

§5.3 option 1 requires a **bank or lockbox** read-only adapter promoted into slice
one, with its security, source and freshness contract defined through synchronized
BRD/SDD/TDD amendments, replacing the SAP-specific Phase 0 evidence. Implementation
remains NO-GO until that amended contract passes review.

**Blocking finding: no bank or lockbox adapter exists to promote or reuse.**
`src/adapters/` was inventoried in full at the target SHA:

| Adapter | Domain | Eligible as settlement authority |
|---|---|---|
| `sapOData.ts` | SAP S/4HANA OData v2, read-only | No — this is the failed D-02 source |
| `legacySupabaseSettlementRunReader.ts` | reads a synthetic dataset settlement run from Supabase (`seed: 42`) | No — synthetic; §5.3 forbids a synthetic production fallback |
| `supabaseSyntheticSource.ts`, `synthetic.ts`, `syntheticData.ts` | synthetic datasets | No — same reason |
| `ediRemittance.ts`, `remittance.ts` | remittance advice | No — remittance is a claim of payment, not settlement proof |
| `enterpriseReadOnly.ts`, `connectorRegistry.ts` | port shape and connector registration | Structural only, not a source |
| `bureau.ts`, `tpm.ts`, `docRepo.ts`, `openAi*VectorStore.ts` | credit bureau, trade promotion, documents, vectors | No |

A repository-wide search for `lockbox`, `BAI2`, `CAMT` and `MT940` returns no match.
`SourcePort.loadSettlementRun()` returns `SyntheticDatasetCore`, confirming the
existing settlement path is the synthetic one.

Reuse remains the correct instinct for the eventual build — `SourcePort`,
`EnterpriseSourceContract`, `connectorRegistry` and the read-only GET discipline in
`sapOData.ts` are the patterns to follow. But **no existing adapter can be promoted
to satisfy option 1**, because none reads a bank or lockbox. Option 1 therefore
requires a named bank or lockbox source, credentials in the approved secret store,
and the BRD/SDD/TDD amendment cycle before any adapter work begins.

**Owner input still required:** which bank or lockbox source, and its
security/source/freshness contract. Treasury is accountable for settlement
authority; Architecture for the source-port and amendment decision.

---

## Phase 4 and Phase 10 — what is complete and what is structurally not

Both phases are complete to the boundary of the elected §5.3 option 2
contingency. Neither can go further from inside this environment, and the reason
in each case is a missing external system rather than a pending approval.

### Phase 4 — complete for the deferred live slice

| Element | State |
|---|---|
| `CashReceiptSource` port | complete |
| Rehearsal proxy source | complete, flag-gated |
| Read-only SAP adapter | complete; returns `contract_gap` until D-02 supplies the mapping |
| Durable re-drive and due-time resume | complete, proven with no browser open |
| Source selection by rollout stage | complete |

The stage gate is the load-bearing part. The rehearsal proxy is available at
`rehearsal` and `shadow` only. From `reference_canary` onward the factory
returns **no source at all** rather than the proxy, so a one-line stage bump
cannot silently promote demo fixtures into something that reads as live cash.
An approved SAP mapping, when it exists, takes precedence at every stage.

**Structurally incomplete:** a live settled-cash read. The configured SAP
sandbox has no cleared-item entity (`recoup_src_sap` carries billing documents
only) and no SAP credentials exist in this environment. AC-01 stays blocked.
This is D-02, and only Treasury and Architecture may sign it.

### Phase 10 — stage 1 satisfied, later stages not entered

§17.1 requires the additive schema and a disabled backend to deploy before any
intake, worker or UI exposure. That is now true:

| §17.1 requirement | State |
|---|---|
| Additive schema deployed | **done** — 12 tables live, RLS forced |
| Backend disabled | **done** — stage resolves to `disabled`, every capability off |
| Existing routes unaffected | **done** — regression suite green, S1-S8 unchanged |

Stages 2 onward (rehearsal input, shadow intake, reference canary, governed
canary, production) each require a running deployment. The machinery exists and
is tested: seven ordered stages, five independent kill switches that beat the
stage, no purge path, and an effectiveness claim permitted only at `production`.

**Structurally incomplete:** nothing is deployed. §17.10 requires explicit
release approval after the tested branch is reconciled with the deployment
source, and no deployment target is reachable from this container.

## Phase 2 schema APPLIED to production Supabase

Applied on owner instruction to proceed without further approvals. Three
migrations, in the order Technical Design 7.1 prescribes.

| Migration | Result |
|---|---|
| `cash_application_additive_tables` | 12 tables, 6 indexes |
| `cash_application_rls_and_grants` | RLS enabled and forced, revoke-then-grant |
| `recoup_config_key_check_widen_cash_run_control` | CHECK widened, constraint renamed |

Post-application verification against the live database:

| Check | Observed |
|---|---|
| Cash tables in `public` | 12 |
| RLS enabled **and forced** | 12 of 12 |
| `anon` / `authenticated` / `PUBLIC` grants | **0** |
| `service_role` DELETE grants | **0** |
| `service_role` UPDATE or DELETE on `recoup_workflow_events` | **0** — append-only holds |
| `scenario%` columns on the live-case table | **0** |
| `recoup_config` constraint name | `recoup_config_key_check` |
| `cash_run_control` permitted | true |
| `recoup_config` rows preserved | 13 |
| `recoup_deduction_lines` (S1-S8) | 20, unchanged |
| `recoup_src_remittance` (legacy) | 5, unchanged |

`service_role` holds UPDATE on exactly five tables — workflow runs, outbox,
agent run state, attachment scan status and live-case status — and INSERT+SELECT
elsewhere. The event log is INSERT+SELECT only, so the runtime role cannot
rewrite history.

**One honest correction.** A first verification query counted UPDATE and DELETE
grants across *all* grantees and reported 2 and 10, which read as an append-only
violation. It was a measurement error: those grants belong to `postgres`, the
table owner. Owner privileges are implicit in Postgres, cannot be revoked, and
apply identically to every existing table in this database. The runtime role
holds none of them.

**`cash_run_control` row not inserted.** D-13 owns whether it exists and with
what values. The constraint now permits the key; nothing populates it.

## Cross-phase end-to-end run against the applied schema

A full chain was written to the live tables in the order the pipeline produces
it — inbox, remittance, remittance line, receipt, allocation, allocation line,
live case, run, four events, outbox command — then verified and removed.

| Assertion | Result |
|---|---|
| Receipt identity: `receipt = applied + deduction + unapplied` | **holds in Postgres** |
| Line identity: `balance before = applied + deduction + balance after` | **holds in Postgres** |
| `reconciliation_status` | `balanced` |
| Short payment / validated reason | `250.00` / `DEP` |
| Case origin / provenance | `live_cash_application` / `replay` |
| Events, cursor span, distinct sequences | 4 / 4 / 4 — no gaps, no duplicates |
| Receipt source system | `rehearsal-proxy` |
| Allocation policy flagged assumed | true |

The two reconciliation identities were previously proven only in TypeScript. They
now hold on stored `numeric` columns, which rules out a rounding or type
conversion at the persistence boundary changing a figure the core computed.

### Negative constraints proven by rejection

Seven writes the design forbids were attempted inside a transaction that was
then deliberately rolled back. Every one was refused by the database:

| Attempt | Outcome |
|---|---|
| Case with `origin = 'gold_set'` | rejected |
| Case with `validated_reason = 'PRC'` | rejected |
| Receipt with a negative amount | rejected |
| Duplicate `(run_id, run_sequence)` event | rejected |
| Duplicate outbox idempotency key | rejected |
| Replayed `(provider, provider_event_id)` | rejected |
| Lowercase currency code | rejected |

These are the guarantees the code also enforces. Proving them at the database
means a future caller that bypasses the repository still cannot write them.

### Cleanup

All fixture rows were removed. Verified afterwards: every cash table at zero
rows, `recoup_deduction_lines` still at 20. The tables are live and empty, which
matches the `disabled` rollout stage.

## Schema DDL previously validated in an isolated schema

| Field | Value |
|---|---|
| Timestamp (UTC) | 2026-08-22 |
| Environment | Supabase project `nmwfftudympcvcjtyjbf`, Postgres 17.6 |
| Method | Table and index DDL applied to a throwaway schema `cash_ddl_validation`, verified, then dropped |
| Result | **PASS** |

This closes the caveat that the schema tests read SQL text rather than exercising
Postgres. The table DDL is now known to apply, not merely to look correct.

| Check | Observed |
|---|---|
| Tables created | 12 |
| Foreign keys | 15 |
| Unique constraints | 6 |
| Check constraints | 173 |
| Indexes | 24 |
| `numeric` money columns | 13 |
| `float`/`real` columns | **0** |
| `scenario%` columns on the live-case table | **0** |

**Scope and safety.** Only `CREATE TABLE` and `CREATE INDEX` ran, inside a schema
created for the purpose and dropped afterwards with `CASCADE`. The RLS/grant block
and the `recoup_config` CHECK widening were deliberately excluded, because both act
on real objects and belong to the D-10 migration. Verified after cleanup: zero
`recoup_cash*` or `recoup_workflow*` tables in `public`, the validation schema gone,
and the `recoup_config` key CHECK unchanged (still without `cash_run_control`).

**Still outstanding for Phase 2.** Applying the schema to `public` as live authority,
enabling RLS and grants, and widening the `recoup_config` CHECK all require D-10.

## Persistence path verified against live Postgres

The repository and receipt source were previously exercised only against mocks.
Both have now been driven against the real database.

### Write shapes accepted

The exact row shapes `createSupabaseWorkflowRepository` writes were inserted into
`recoup_workflow_runs` and `recoup_workflow_events`. Both accepted; the event
`cursor_id` advanced monotonically and `run_sequence` was contiguous from 1. Rows
were deleted afterwards, and runs, events and cases are all back to zero.

### Constraints reject what the design forbids

Six negative cases were attempted against the live tables. **All six were
rejected by the database**, so these are database guarantees rather than code
conventions:

| Attempted | Outcome |
|---|---|
| Duplicate `run_sequence` for one run | rejected |
| `safe_summary` longer than 1000 characters | rejected |
| `provenance_mode` of `production` | rejected |
| Negative `amount_received` | rejected |
| Lowercase `usd` currency | rejected |
| `validated_reason` of `PRC` rather than `DEP` | rejected |

### Settlement source now reads durable rows

`src/adapters/supabaseCashReceipt.ts` reads settled receipts from
`recoup_cash_receipts` rather than from in-memory fixtures, so a run resolves
against durable state and survives a restart. Four rehearsal receipts are seeded,
chosen to exercise each branch:

| Receipt | Settlement | Age | Expected outcome |
|---|---|---|---|
| `REHEARSAL-PAY-1001` | settled | 2h | allocates |
| `REHEARSAL-PAY-1002` | settled | 3h | allocates |
| `REHEARSAL-PAY-1003` | pending | 1h | `pending`, no allocation |
| `REHEARSAL-PAY-1004` | settled | 60d | `stale`, no allocation |

Freshness is evaluated at read time rather than trusted from the stored
`freshness_status`, because a stored flag ages the moment it is written. The
`REHEARSAL-PAY-1004` row is the case that proves it: it claims `fresh` and is
still reported `stale`.

**This does not close D-02.** Every seeded row carries
`source_system = 'rehearsal-proxy'`, and `isAuthoritativeSourceSystem` returns
false for it. The table records what an upstream source claimed; it is not
evidence that cash arrived. AC-01 remains blocked.

### Not run here

`scripts/verifyCashApplicationLivePath.ts` drives the whole path through
PostgREST end to end. It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`,
which are not present in this container, and it exits with code 2 rather than
degrading to a no-op — a skipped verification must not read as a pass.

## Assumed values register (D-07) — NOT OWNER-RATIFIED

The owner instructed that values may be invented for demo and MVP purposes and
that each be called out here. Every value below is an **assumption authored by
the implementer**. None has been reviewed by Treasury or Architecture, and D-07
remains open.

The object lives in `config/cashAllocationPolicy.ts` as `DEMO_ALLOCATION_POLICY`
and is reachable only when `RECOUP_CASH_DEMO_POLICY_ENABLED` is explicitly
`true`. Without that flag `loadApprovedAllocationPolicy` returns `undefined`,
`match.ts` reports `policy_missing` and `allocate.ts` returns `Contract gap`, so
the fail-closed path stays intact for anything that is not the demo.

The bias throughout is conservative: where a choice could either resolve a case
automatically or send it to a human, this policy sends it to a human. The demo
therefore under-claims rather than over-claims, which is the safe direction to be
wrong in when the numbers are invented.

| Field | Assumed value | Basis | Cost if wrong |
|---|---|---|---|
| `policyVersion` | `demo-allocation-policy-v1-ASSUMED` | Names itself in every allocation receipt that cites it | None; the label is the safeguard |
| `calculationVersion` | `demo-calc-v1` | Distinguishes arithmetic revisions from policy revisions | Version confusion across receipts |
| `paymentReferenceMatchRule` | `normalized` | Demo fixtures and hand-typed references vary in case and whitespace | Looser than `exact`; could match an unrelated payment sharing a reference |
| `cardinality` | `one_to_many` | One remittance commonly settles several invoices | Permits multi-invoice cases a stricter policy would send to review |
| `invoiceOrdering` | `remittance_line_order` | Deterministic, and needs no field the canonical invoice lacks | Not value-optimal; `oldest_due_date_first` needs a due date that is not modelled |
| `currencyScale` | `2` | Suits the USD demo fixtures | Exactly the assumption the design warns against generalising; wrong for zero-decimal and three-decimal currencies |
| `rounding` | `half_up` | Matches the `ROUND_HALF_UP` already configured in `src/types/money.ts`, so the formatter cannot disagree with the arithmetic | Sub-unit drift against a house convention that rounds differently |
| `amountTolerance` | `"0"` | No tolerance; a penny of drift becomes a human decision | More review volume than a real operation would accept |
| `discountsAllowed` | `false` | Not modelled in the canonical remittance line | Legitimate early-payment discounts land in review |
| `creditsAllowed` | `false` | Same | Legitimate credit applications land in review |
| `overpayment` | `review` | Surplus cash is a question for a human, not something to park automatically | Higher review volume; no silent credit creation |
| `residual` | `review` | Same reasoning | No automatic write-off |
| `ambiguity` | `review` | Same reasoning | No automatic resolution |
| `fx` | `reject_cross_currency` | No approved rate source exists | Cross-currency cases cannot complete at all |

Two related assumed values sit outside this object and are recorded for the same
reason:

| Value | Location | Note |
|---|---|---|
| `REHEARSAL_SOURCE_SYSTEM = "rehearsal-proxy"` | `src/adapters/rehearsalCashReceipt.ts` | Stamped on every proxy receipt so an audit trail cannot read as live |
| `freshnessPolicyVersion = "rehearsal-freshness-v1"` | same | Placeholder; D-15 owns real source-freshness targets |
| Rehearsal fixtures (`PAY-1001`, `PAY-1002`) | same | Illustrative demo data, **not** an approved D-06 fixture set |

**Promotion rule.** None of the above may reach production. Ratifying D-07 means
replacing `DEMO_ALLOCATION_POLICY` with a reviewed object, recording the new
`policyVersion` here, and removing the demo flag path.

## Open specification gap found during implementation

The Technical Design 4.6 `CashMatchResult` reason enum has no arm for a payment
reference that fails to match. `match.ts` reports `cash_receipt_missing`, on the
grounds that a receipt whose payment reference does not match was not a receipt
for this remittance; `amount_mismatch` would assert something about amounts that
was never compared. Raised here rather than resolved by picking a convenient
label; an owner may prefer a new enum arm.

## Scenario enum — no S09/S10

Cash Application cases are `LiveDeductionCase` records and are **not** added to
the scenario enum. The SDD addendum names "adding live cases to the scenario
enum" as a non-goal, keeps `LiveDeductionCase` separate from `ScenarioId`, the
S1-S8 manifests, seed-42 generation and gold eval storage, and enforces this
through SA-CA-03 ("Live cases never alter S1-S8 storage, enums or gold totals").
S1-S8 totals, labels and release gates are unchanged by this work.

## Implementation progress against the Section 14 phase plan

Built under the deferred-live-slice election. Every phase below was developed
tests-first, and the four repository gates pass on each commit.

| Phase | Scope | Status |
|---|---|---|
| 1 | Cash/workflow types and pure deterministic core | **Complete** — types, source port, `match`, `allocate`, `reason`, workflow envelopes, stable idempotency keys |
| 2 | Additive schema and repositories | **Schema contract complete**, `docs/supabase-cash-application-schema.sql` with 29 contract tests; **not applied** (D-10). Repository port implemented in memory |
| 3 | Provider adapter, scanner, CSV mapper, intake | **Complete** — signature/replay/recipient/scan/map ordering proven; assumed CSV and scan policy behind a flag |
| 4 | CashReceipt adapter, re-drive, cash application service | **Code complete, unproven live** — rehearsal proxy, durable re-drive, and a read-only SAP adapter that returns `contract_gap` until D-02 supplies the entity and property mapping |
| 5 | Cash Application agent, tools, conductor, handoff | **Complete** — narration cannot introduce a figure the core did not produce; three read-only tools; `cash_application` cache namespace |
| 6 | Live-case Forensics and Maya read models | **Complete** — projection performs no arithmetic; gold-set isolation asserted |
| 7A | Worker lifecycle seam, construction flag, pre-claim config return, negative tests | **Complete** — both N5 negative cases proven with byte-equivalent state snapshots; `CLAUDE.md` updated |
| 7B | Bounded claims/leases, events, resume, dead letter | **Core complete** — outbox with idempotent scheduling, leases, crash reclaim, dead letter; durable SSE not started |
| 8 | Agent Operations and Maya UI | **Functionally complete** — components, contract tests and 13/13 Chromium checks. **Visual gate not scored**: no approved ImageGen cues supplied |
| 9 | Security, evals, complete regression | **Complete** — AC-01..19 walk, Section 12 regression matrix, Section 15 security acceptance. `verify:release` remains BLOCKED per Section 13.1 |
| 10 | Rehearsal, shadow, canary, production | **Machinery complete, not deployed** — ordered stages, five independent kill switches, no purge path. Deployment requires explicit release approval |

Test files added: 22, covering unit, integration, invariant and browser layers. Suite total 2045 tests across 206 files, from a 1680-test baseline.

### AC coverage proven so far

| AC | Status |
|---|---|
| AC-01 live email to Maya | **Blocked** — no authoritative settlement source (D-02) |
| AC-06 no settled receipt waits durably and resumes | **Proven for the rehearsal source** — `cash-receipt-redrive.test.ts` drives wait, due-time resume, crash reclaim and dead-letter exhaustion with no browser open |

### What the phase work does not prove

- No live cash has moved. Every allocation cites a `rehearsal-proxy` receipt.
- The schema has never been applied to a database; the contract tests read SQL
  text, they do not exercise Postgres.
- The repository is in memory. Restart durability is proven only against that
  implementation, not against Supabase.
- No browser, agent, SSE stream or UI exists yet, so Phases 5, 6 and 8 have no
  runtime evidence of any kind.

## Residual risk

AC-01 is structurally unreachable while D-02, D-04, D-05 and D-08 remain open. No
later phase may mask a failed Phase 0 item with fixture data, synthetic fallback,
default configuration or UI-only behaviour (§5.2). A failed D-02 cannot be bypassed
by treating email as settlement evidence.

**Unrelated open security finding.** Ten tables in the Supabase project have Row
Level Security disabled: `credit_snapshot`, `credit_accounts`, `credit_ar_open_items`,
`credit_sales_monthly`, `credit_payment_history`, `credit_deductions`,
`credit_deduction_lines`, `credit_contract_tpm`, `credit_risk_mesh_positions`,
`credit_policy`. Any holder of the anon key can read or modify every row. No
remediation has been applied; enabling RLS without policies would block all access.

---

## Signatures

| Role | Name | Date | Decision |
|---|---|---|---|
| Release Owner | | | |
| Treasury (D-02 settlement authority) | | | |
| Architecture (source port / amendment) | | | |
| Independent reviewer | | | |
