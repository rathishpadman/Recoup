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
