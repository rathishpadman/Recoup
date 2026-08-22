# Cash Application Agent Workspace - Implementation Specification

**Document ID:** RECOUP-SPEC-CAAW-001  
**Version:** 1.1-review  
**Date:** 2026-08-22  
**Status:** Final-review candidate; implementation remains NO-GO until the Phase 0 entry gate passes  
**Applies to:** Recoup v2 modular monolith, backend API, Supabase persistence, Cash Application/Forensics agent flow, Agent Operations cockpit and Maya workspace  
**Change type:** Additive capability with backward-compatible integration  

**Revision 1.1:** Incorporates the independent repository-validation findings for worktree-ignore preflight, D-02 contingency ownership, AC-19 browser scope, single-pass baseline verification, governed baseline credentials, implementer-facing change maps, v3.2 requirement disposition and dirty-checkout governance. It does not change the implementation NO-GO posture.

## 1. Purpose

This specification converts the approved business narration and the synchronized BRD, SDD addendum and Technical Design into an implementation-ready contract. It defines:

- the behavior required when a customer sends remittance advice by email;
- deterministic cash receipt validation, matching, allocation and short-payment identification;
- the governed handoff from Cash Application to Deduction Forensics and then to Maya;
- the live Agent Operations workspace that shows idle, queued, running, waiting, handed-off, blocked and completed agent states from durable backend events;
- the repository backup and isolated-development procedure that must precede implementation;
- backend and real-browser acceptance tests for every BRD acceptance scenario, AC-01 through AC-19;
- regression, migration, security, rollout and rollback controls required to avoid breaking the existing solution.

This document is a specification, not permission to modify code, apply schema, enable a worker, accept customer email or deploy. Implementation may begin only after Section 5 is satisfied and the approved target branch/SHA is recorded.

## 2. Governing sources and precedence

Implementation shall use the following sources in this order:

1. `INVARIANTS.md`.
2. `RECONCILIATION_LEDGER.md`.
3. `docs/Recoup_Business_Requirements_Document_v3.3.4_Cash_Application_Agent_Workspace.docx`.
4. `docs/2026-08-21-cash-application-agent-workspace-sdd-addendum.md`, version 0.9.4.
5. `docs/2026-08-21-cash-application-agent-workspace-technical-design.md`, version 0.9.4.
6. This implementation specification.
7. Engineer judgment.

If two sources conflict, the higher source wins. The implementer shall stop and obtain an owner decision for any unresolved constant, policy, state, role, provider, source mapping or schema field. No threshold, tolerance, allocation ordering, retry count, timeout, concurrency value, model setting or approval policy may be guessed.

## 3. Product outcome

### 3.1 Target customer journey

1. All specialists are visible as Idle in the Agent Operations workspace before work exists.
2. A verified customer remittance email arrives through the approved provider endpoint.
3. The service authenticates the provider request, validates the intended recipient, deduplicates the message, stages and scans attachments, and maps only the ratified UTF-8 CSV v1 contract.
4. Email and remittance advice are treated as instruction evidence only. The service obtains a fresh, settled, authoritative CashReceipt through the approved read-only source.
5. Deterministic code matches the customer, invoice and receipt, then uses `Decimal` to allocate cash and calculate any short payment.
6. Deterministic reason mapping separates the customer-claimed reason from the validated reason. Only a validated DEP short payment creates a live deduction case and a Cash Application-to-Forensics handoff.
7. The Forensics agent investigates the deduction using fresh, cited evidence. Invalid or partial outcomes may create a clamped Recovery draft; valid outcomes create a draft Billing route. Neither path writes to ERP.
8. When the durable `maya_ready` transition is committed, the case appears in Maya's queue with upstream email, receipt, allocation, reason, evidence, audit and agent-run provenance.
9. Maya reviews, modifies, approves or rejects the draft under existing role, segregation-of-duties, evidence and amount guards. Every external action remains draft-only until an eligible human approves it.
10. Throughout the journey, the Agent Operations UI renders server-backed events and projections in real time. The browser never owns workflow progress or invents state.

### 3.2 Non-goals

The change shall not add ERP write-back, autonomous correspondence, autonomous recovery, model-computed money, model-selected business outcomes, general document extraction, a new synthetic production fallback, new Risk Mesh weights, new credit policy, or changes to the locked S1-S8 gold scenarios.

Bank and lockbox receipt adapters remain outside slice one unless the D-02 contingency in Section 5.3 is activated through a separately approved BRD/SDD/TDD amendment. A receipt-arrival push signal is optional; governed due-time polling must be sufficient.

## 4. Non-negotiable system constraints

- Code computes every dollar with `Decimal`; models may narrate only verified deterministic results.
- Every finding, transition and decision cites record IDs and deterministic basis.
- Email/remittance is never settlement proof.
- No allocation or deduction exists before a fresh, settled authoritative CashReceipt is proven.
- A deduction cannot be classified invalid or partial without supporting documents.
- No external action occurs without the existing HITL and segregation-of-duties gates.
- No write-capable ERP client may be introduced.
- Intake, workflow events, outbox commands and state projections are durable and idempotent.
- A browser, SSE connection or in-memory timer never wakes or advances business processing.
- Agent state is derived from durable events; it is not decorative animation or local React state.
- Every visible business value is returned by a backend API/read model with provenance. Cockpit code formats layout and human labels only; it performs no money, score, verdict or status calculation.
- Source failures, fresh zero-result evidence and stale evidence are distinct typed outcomes.
- Missing contracts fail closed as `Contract gap`; unavailable required sources fail closed as `Source unavailable`.
- Existing Forensics, Maya, David, CFO, query, approval, audit, connector, cache and six-phase `run_control` behavior remains backward compatible when all cash feature flags are off.

## 5. Implementation entry gate

### 5.1 Current disposition

The documentation set is eligible for final design review, but implementation is currently **NO-GO**.

- **N4 / D-02 is open.** The configured SAP sandbox returned HTTP 401 during GET-only discovery/metadata probing. A cleared-item/payment entity, its keys/properties, settled-status semantics, freshness fields and one bounded approved-fixture read have not been proven. Authentication failure is not proof that a suitable entity is absent. AC-01 remains blocked.
- **D-04 is open for evidence.** The private scanner contract requires authenticated health/readiness plus approved clean and unsafe fixture proof.
- **D-05 / D-08 are open for evidence.** The UTF-8 CSV v1 fields, required machine-readable claimed-reason code, clean fixture and deterministic reason-map version/hash require joint owner ratification.
- **N5 is design-corrected but runtime proof is pending.** No worker implementation exists. Documentation does not close the finding.
- The current authoring checkout is `main` at `eeca34327b562bbc3101ac5f019d1a4ecd1f2be7` and contains pre-existing unrelated modifications/untracked files. The Release Owner must assign every dirty path to an owner and disposition (`include`, `defer`, `archive` or `abandon`) before selecting the target SHA; preservation alone is not disposition. This checkout is not an approved clean implementation target.
- The working copy of `.gitignore` currently contains `.claude/worktrees/`, but the recorded `HEAD` does not. The rule is therefore not a committed baseline guarantee. The approved target SHA must contain the rule, and the backup/worktree procedures must prove it with `git check-ignore` before continuing.

### 5.2 Phase 0 exit evidence

Before application code or schema work starts, one controlled evidence pack tied to the approved target SHA shall contain:

1. BRD v3.3.4, SDD v0.9.4, TDD v0.9.4 and this specification committed together or referenced by immutable hashes.
2. Successful secret-safe SAP GET-only metadata evidence identifying the approved service/entity, keys and required properties.
3. One bounded approved-fixture SAP read proving settled-status and freshness semantics.
4. Private scanner endpoint/readiness evidence plus approved clean and unsafe fixture outcomes.
5. Ratified CSV v1 and claimed-reason contract, approved clean fixture, and deterministic reason-map version/hash.
6. Approved allocation policy pack, including every critical branch required by the BRD; missing branches remain `Contract gap`.
7. Approved provider, signature/SDK, recipient, acknowledgement and replay contract.
8. Approved workflow states, roles, retry/cancel authority, `cash_run_control`, model/cache contract, NFR/SLO values, branch/SHA and release owner.
9. A signed dirty-checkout disposition register with path, current owner, decision, destination branch/archive and evidence reference; no unowned change is carried into or discarded from the target.
10. A committed `.gitignore` rule for `.claude/worktrees/`, verified on the approved target SHA before worktree creation.
11. A clean target worktree and baseline `npm run verify` evidence.
12. Phase 0 owner signatures and a residual-risk statement.

No later phase may mask a failed Phase 0 item with fixture data, synthetic fallback, default configuration or UI-only behavior.

### 5.3 D-02 permanent-failure contingency

The next D-02 action is still to use the configured `.env.local` loader and correct read-only SAP authorization, then repeat secret-safe GET-only metadata discovery and one bounded approved-fixture read. The local file and SAP variable names are present in the current checkout; this does not prove the credentials, authorization or entity mapping are valid.

If successful authenticated discovery proves that the approved SAP sandbox cannot supply a cleared-item/payment entity with the required settled-status and freshness semantics, Treasury and Architecture must record one of these decisions. There is no default:

1. **Promote another authoritative source.** Open and approve synchronized BRD/SDD/TDD changes that promote a bank or lockbox read-only adapter into slice one, define its security/source/freshness contract and replace the SAP-specific Phase 0 evidence. Implementation remains NO-GO until that amended contract passes review.
2. **Defer the live slice.** Approve only an explicitly labelled rehearsal/shadow capability with no claim that AC-01, production cash allocation or live email-to-Maya is complete. AC-01 remains blocked, the feature cannot meet Section 18 or Section 19, and no customer-facing effectiveness claim is allowed.

Treasury is accountable for settlement authority; Architecture is accountable for the source-port and amendment decision; Product is accountable for any scope deferral. A failed D-02 cannot be bypassed by treating email as settlement evidence or by enabling a synthetic production fallback.

## 6. Mandatory repository backup before development

The release owner shall complete and review this procedure before creating the implementation branch. The commands below are instructions; they are not executed as part of producing this document.

### 6.1 Backup objectives

The backup must preserve:

- every Git ref and committed object;
- the exact baseline branch and SHA;
- staged and unstaged tracked changes;
- all non-ignored untracked files in the current checkout;
- a status/worktree manifest and cryptographic hashes;
- a tested restoration path.

Ignored caches, dependency folders, build output and local secret files are not source backup material. `.env.local`, tokens and credentials must remain in the approved secret store and must not be copied into the backup archive.

### 6.2 PowerShell backup procedure

Run from a normal PowerShell prompt. Use an external backup directory, never the repository itself or one of its worktrees.

```powershell
$ErrorActionPreference = 'Stop'

function Assert-RecoupNativeSuccess {
    param([Parameter(Mandatory = $true)][string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

$recoupRepo = (Resolve-Path 'C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup').Path
$recoupBackupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$recoupBackupRoot = Join-Path 'C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Backups' "Recoup-$recoupBackupStamp"
$recoupSnapshotRoot = Join-Path $recoupBackupRoot 'working-tree-snapshot'
$recoupWorkingTreePatch = Join-Path $recoupBackupRoot 'working-tree.patch'
$recoupStagedPatch = Join-Path $recoupBackupRoot 'staged.patch'
$recoupUnstagedPatch = Join-Path $recoupBackupRoot 'unstaged.patch'

git -C $recoupRepo check-ignore -q -- .claude/worktrees/backup-preflight-probe
Assert-RecoupNativeSuccess 'Verify .claude/worktrees is ignored before backup'

New-Item -ItemType Directory -Path $recoupBackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $recoupSnapshotRoot -Force | Out-Null

git -C $recoupRepo status --porcelain=v1 | Set-Content (Join-Path $recoupBackupRoot 'git-status.txt')
Assert-RecoupNativeSuccess 'Capture Git status'
git -C $recoupRepo branch --show-current | Set-Content (Join-Path $recoupBackupRoot 'branch.txt')
Assert-RecoupNativeSuccess 'Capture branch'
git -C $recoupRepo rev-parse HEAD | Set-Content (Join-Path $recoupBackupRoot 'head-sha.txt')
Assert-RecoupNativeSuccess 'Capture HEAD SHA'
git -C $recoupRepo worktree list --porcelain | Set-Content (Join-Path $recoupBackupRoot 'worktrees.txt')
Assert-RecoupNativeSuccess 'Capture worktree inventory'
git -C $recoupRepo diff HEAD --binary --output=$recoupWorkingTreePatch
Assert-RecoupNativeSuccess 'Capture binary working-tree patch'
git -C $recoupRepo diff --cached --binary --output=$recoupStagedPatch
Assert-RecoupNativeSuccess 'Capture staged binary patch'
git -C $recoupRepo diff --binary --output=$recoupUnstagedPatch
Assert-RecoupNativeSuccess 'Capture unstaged binary patch'
git -C $recoupRepo bundle create (Join-Path $recoupBackupRoot 'recoup-all-refs.bundle') --all
Assert-RecoupNativeSuccess 'Create all-refs bundle'
git -C $recoupRepo bundle verify (Join-Path $recoupBackupRoot 'recoup-all-refs.bundle')
Assert-RecoupNativeSuccess 'Verify all-refs bundle'

$recoupCandidateFiles = git -C $recoupRepo -c core.quotepath=false ls-files --cached --others --exclude-standard
Assert-RecoupNativeSuccess 'Enumerate tracked and non-ignored untracked files'
$recoupFiles = @($recoupCandidateFiles | Where-Object {
    Test-Path -LiteralPath (Join-Path $recoupRepo $_) -PathType Leaf
})
$recoupFiles | Set-Content (Join-Path $recoupBackupRoot 'source-files.txt')
$recoupDeletedTrackedFiles = git -C $recoupRepo -c core.quotepath=false diff --name-only --diff-filter=D HEAD
Assert-RecoupNativeSuccess 'Enumerate deleted tracked files represented by the patch'
$recoupDeletedTrackedFiles | Set-Content (Join-Path $recoupBackupRoot 'deleted-tracked-files.txt')
$recoupUntrackedFiles = git -C $recoupRepo -c core.quotepath=false ls-files --others --exclude-standard
Assert-RecoupNativeSuccess 'Enumerate non-ignored untracked files'
$recoupUntrackedFiles | Set-Content (Join-Path $recoupBackupRoot 'untracked-files.txt')
foreach ($recoupRelativePath in $recoupFiles) {
    $recoupSource = [System.IO.Path]::GetFullPath((Join-Path $recoupRepo $recoupRelativePath))
    $recoupExpectedPrefix = $recoupRepo.TrimEnd('\') + '\'
    if (-not $recoupSource.StartsWith($recoupExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Backup path escaped repository root: $recoupRelativePath"
    }
    $recoupDestination = Join-Path $recoupSnapshotRoot $recoupRelativePath
    New-Item -ItemType Directory -Path (Split-Path $recoupDestination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $recoupSource -Destination $recoupDestination -Force
}

Get-ChildItem -LiteralPath $recoupBackupRoot -File -Recurse |
    Where-Object { $_.Name -ne 'sha256-manifest.csv' } |
    Get-FileHash -Algorithm SHA256 |
    Select-Object Path, Hash |
    Export-Csv -NoTypeInformation (Join-Path $recoupBackupRoot 'sha256-manifest.csv')
```

The owner shall inspect `git-status.txt` and the snapshot before proceeding. If `git ls-files` reports an intentional file that is absent from the snapshot, the backup is failed. The Release Owner shall also complete a dirty-checkout disposition register with one row per status entry: `path`, `Git status`, `current owner`, `include/defer/archive/abandon`, `destination`, `evidence reference` and `reviewer`. A blank owner or disposition blocks target-SHA selection.

### 6.3 Restore rehearsal

Use a new validation directory outside the repository. Do not overwrite the live checkout.

```powershell
$ErrorActionPreference = 'Stop'

function Assert-RecoupNativeSuccess {
    param([Parameter(Mandatory = $true)][string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

$recoupRestoreCheck = Join-Path $recoupBackupRoot 'restore-check'
$recoupBaselineSha = (Get-Content (Join-Path $recoupBackupRoot 'head-sha.txt') -Raw).Trim()
$recoupSavedManifest = Import-Csv (Join-Path $recoupBackupRoot 'sha256-manifest.csv')
$recoupManifestByPath = @{}
foreach ($recoupManifestEntry in $recoupSavedManifest) {
    $recoupManifestPath = [System.IO.Path]::GetFullPath($recoupManifestEntry.Path)
    if (-not (Test-Path -LiteralPath $recoupManifestPath -PathType Leaf)) {
        throw "Backup manifest file is missing: $recoupManifestPath"
    }
    $recoupManifestActualHash = (Get-FileHash -LiteralPath $recoupManifestPath -Algorithm SHA256).Hash
    if ($recoupManifestActualHash -ne $recoupManifestEntry.Hash) {
        throw "Backup manifest hash mismatch: $recoupManifestPath"
    }
    $recoupManifestByPath[$recoupManifestPath] = $recoupManifestEntry.Hash
}

git clone (Join-Path $recoupBackupRoot 'recoup-all-refs.bundle') $recoupRestoreCheck
Assert-RecoupNativeSuccess 'Clone backup bundle'
git -C $recoupRestoreCheck checkout --detach $recoupBaselineSha
Assert-RecoupNativeSuccess 'Check out recorded baseline SHA'
git -C $recoupRestoreCheck fsck --full
Assert-RecoupNativeSuccess 'Verify restored object database'
$recoupRestoredStagedPatch = Join-Path $recoupBackupRoot 'staged.patch'
$recoupRestoredUnstagedPatch = Join-Path $recoupBackupRoot 'unstaged.patch'
if ((Get-Item -LiteralPath $recoupRestoredStagedPatch).Length -gt 0) {
    git -C $recoupRestoreCheck apply --check --index $recoupRestoredStagedPatch
    Assert-RecoupNativeSuccess 'Check staged-change patch'
    git -C $recoupRestoreCheck apply --index $recoupRestoredStagedPatch
    Assert-RecoupNativeSuccess 'Restore staged changes and index state'
}
if ((Get-Item -LiteralPath $recoupRestoredUnstagedPatch).Length -gt 0) {
    git -C $recoupRestoreCheck apply --check $recoupRestoredUnstagedPatch
    Assert-RecoupNativeSuccess 'Check unstaged-change patch'
    git -C $recoupRestoreCheck apply $recoupRestoredUnstagedPatch
    Assert-RecoupNativeSuccess 'Restore unstaged changes'
}

$recoupRestoreFiles = Get-Content (Join-Path $recoupBackupRoot 'source-files.txt')
foreach ($recoupRelativePath in $recoupRestoreFiles) {
    $recoupSnapshotSource = [System.IO.Path]::GetFullPath((Join-Path $recoupSnapshotRoot $recoupRelativePath))
    $recoupRestoreDestination = [System.IO.Path]::GetFullPath((Join-Path $recoupRestoreCheck $recoupRelativePath))
    $recoupRestorePrefix = $recoupRestoreCheck.TrimEnd('\') + '\'
    if (-not $recoupRestoreDestination.StartsWith($recoupRestorePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Restore path escaped validation root: $recoupRelativePath"
    }
    if (-not $recoupManifestByPath.ContainsKey($recoupSnapshotSource)) {
        throw "Snapshot file is absent from the saved backup manifest: $recoupRelativePath"
    }
    New-Item -ItemType Directory -Path (Split-Path $recoupRestoreDestination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $recoupSnapshotSource -Destination $recoupRestoreDestination -Force
    $recoupExpectedHash = $recoupManifestByPath[$recoupSnapshotSource]
    $recoupActualHash = (Get-FileHash -LiteralPath $recoupRestoreDestination -Algorithm SHA256).Hash
    if ($recoupExpectedHash -ne $recoupActualHash) {
        throw "Restored file hash mismatch: $recoupRelativePath"
    }
}

$recoupRestoreStatus = @(git -C $recoupRestoreCheck status --porcelain=v1)
Assert-RecoupNativeSuccess 'Capture restored working-tree status'
$recoupRestoreStatus | Set-Content (Join-Path $recoupBackupRoot 'restore-status.txt')
$recoupOriginalStatus = @(Get-Content (Join-Path $recoupBackupRoot 'git-status.txt'))
$recoupStatusDifference = Compare-Object -ReferenceObject @($recoupOriginalStatus | Sort-Object) -DifferenceObject @($recoupRestoreStatus | Sort-Object)
if ($recoupStatusDifference) {
    throw 'Restored working-tree status does not match the original backup status.'
}
```

Backup acceptance requires a verified bundle, validation of every saved manifest entry before restore, successful detached checkout of the recorded SHA, successful `git fsck`, a patch that both checks and applies (including tracked deletions), exact saved-manifest SHA-256 matches for every existing tracked/non-ignored untracked snapshot file, and an automatic equality check between restored and original Git status. Keep the restore-check directory until the implementation branch has passed its first full baseline; removal is a separate, explicit cleanup action.

## 7. Independent development workspace

### 7.1 Source-of-truth selection

The release owner must name the target branch and reviewed SHA after Phase 0. The implementation must not be started from the dirty authoring checkout or from an old detached worktree.

Record:

- remote and target branch;
- approved target SHA;
- document hashes;
- backup path and manifest hash;
- branch owner, implementer and independent reviewer;
- baseline gate results.

### 7.2 Clean worktree creation

All Recoup worktrees must be under `.claude/worktrees/` inside the repository.

```powershell
$ErrorActionPreference = 'Stop'

function Assert-RecoupNativeSuccess {
    param([Parameter(Mandatory = $true)][string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

$recoupRepo = (Resolve-Path 'C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup').Path
$recoupApprovedTargetSha = '<owner-approved-target-sha>'
$recoupFeatureBranch = 'codex/cash-application-agent-workspace'
$recoupWorktree = Join-Path $recoupRepo '.claude\worktrees\cash-application-agent-workspace'

$recoupApprovedGitIgnore = @(git -C $recoupRepo show "$recoupApprovedTargetSha`:.gitignore")
Assert-RecoupNativeSuccess 'Read .gitignore from approved target SHA'
if (-not ($recoupApprovedGitIgnore | Where-Object { $_.Trim() -eq '.claude/worktrees/' })) {
    throw 'Approved target SHA does not ignore .claude/worktrees/. Commit and review the hygiene rule before worktree creation.'
}
git -C $recoupRepo check-ignore -q -- .claude/worktrees/worktree-preflight-probe
Assert-RecoupNativeSuccess 'Verify the primary checkout ignores the actual worktree root'

git -C $recoupRepo worktree prune
Assert-RecoupNativeSuccess 'Prune stale worktree registrations'
git -C $recoupRepo worktree list
Assert-RecoupNativeSuccess 'List worktrees before creation'
git -C $recoupRepo worktree add $recoupWorktree -b $recoupFeatureBranch $recoupApprovedTargetSha
Assert-RecoupNativeSuccess 'Create isolated feature worktree'
$recoupObservedBranch = git -C $recoupWorktree branch --show-current
Assert-RecoupNativeSuccess 'Verify feature branch'
$recoupObservedSha = git -C $recoupWorktree rev-parse HEAD
Assert-RecoupNativeSuccess 'Verify feature baseline SHA'
$recoupObservedStatus = git -C $recoupWorktree status --short
Assert-RecoupNativeSuccess 'Verify feature worktree status'
if ($recoupObservedBranch.Trim() -ne $recoupFeatureBranch) {
    throw "Unexpected feature branch: $recoupObservedBranch"
}
if ($recoupObservedSha.Trim() -ne $recoupApprovedTargetSha) {
    throw "Unexpected feature baseline SHA: $recoupObservedSha"
}
if ($recoupObservedStatus) {
    throw 'New feature worktree is not clean.'
}
git -C $recoupWorktree check-ignore -q -- .claude/worktrees/approved-target-probe
Assert-RecoupNativeSuccess 'Verify approved target content carries the worktree-ignore contract'
```

Acceptance requires the expected branch, the exact approved SHA and an empty status. If the branch already exists, the owner must inspect it and choose an explicit safe path; do not delete, reset or force-recreate it.

Do not copy `.env.local` from the dirty authoring checkout or include credentials in source control/backups. The Release Owner must provision the required runtime coordinates separately from the approved secret store, either as process environment or as a dedicated ignored worktree-local `.env.local` consumed by `config/localRuntimeEnv.ts`. Record only variable-name presence/absence, project/service identifier and source mode; never record values. Cash flags remain off during the baseline.

### 7.3 Independent implementer and reviewer model

1. The implementer works only in the approved feature worktree.
2. The reviewer does not author the same logical change. Review uses a clean checkout/worktree of the submitted commit.
3. Each phase is one independently reviewable logical change and one commit. Commit format is `<type>: <why-focused description>`.
4. Decision-producing behavior is developed tests-first.
5. After each logical change, run lint, typecheck and tests. Before phase acceptance, run full `npm run verify` plus the phase-specific browser suite.
6. The reviewer compares the diff with the exact BRD IDs, SDD/TDD sections and tests named in the commit evidence.
7. The reviewer independently runs the gates, identifies the likeliest failure mode, checks no unrelated file changed, and records approve/rework.
8. Before final GO for audit, an independent validation agent that did not implement the phase performs a read-only diff/spec/test review and returns `APPROVE` or `NO-GO` with file/line evidence. `NO-GO` findings must be closed and revalidated; the implementer cannot self-approve.
9. A separate security review is mandatory for provider input, attachments, authorization, SSE, object access and new APIs.
10. A separate browser review is mandatory for Agent Operations and Maya. Runtime screenshots must be compared with the approved ImageGen cues and score at least 4/5 under the cockpit UI gate.
11. Production deploy or feature enablement requires a new explicit user/release-owner instruction after all gates pass.

### 7.4 Mandatory worktree close-out

Teardown is part of the same implementation session after the branch is merged or formally abandoned. Never use `--force`, and never remove a worktree while uncommitted or untracked files are its only copy.

```powershell
$recoupBackupRoot = '<verified-backup-root>'
$recoupWorktreeRoot = (Resolve-Path -LiteralPath (Join-Path $recoupRepo '.claude\worktrees')).Path
$recoupResolvedWorktree = (Resolve-Path -LiteralPath $recoupWorktree).Path
$recoupAllowedWorktreePrefix = $recoupWorktreeRoot.TrimEnd('\') + '\'
if (-not $recoupResolvedWorktree.StartsWith($recoupAllowedWorktreePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a worktree outside the approved root: $recoupResolvedWorktree"
}

$recoupPending = git -C $recoupWorktree status --porcelain=v1
Assert-RecoupNativeSuccess 'Inspect worktree before teardown'
if ($recoupPending) {
    throw 'Worktree contains uncommitted or untracked files. Create the reviewed archival commit; copying dirty files elsewhere does not authorize teardown.'
}

$recoupCloseoutSha = (git -C $recoupWorktree rev-parse HEAD).Trim()
Assert-RecoupNativeSuccess 'Capture clean archival commit SHA'
$recoupCloseoutBranch = (git -C $recoupWorktree branch --show-current).Trim()
Assert-RecoupNativeSuccess 'Capture close-out branch'
if ($recoupCloseoutBranch -ne $recoupFeatureBranch) {
    throw "Close-out worktree is detached or on an unexpected branch: $recoupCloseoutBranch"
}
$recoupFeatureBranchSha = (git -C $recoupRepo rev-parse "refs/heads/$recoupFeatureBranch").Trim()
Assert-RecoupNativeSuccess 'Resolve feature branch archival commit'
if ($recoupFeatureBranchSha -ne $recoupCloseoutSha) {
    throw 'Feature branch ref does not point to the clean worktree HEAD.'
}
$recoupCloseoutBundle = Join-Path $recoupBackupRoot "cash-application-closeout-$recoupCloseoutSha.bundle"
git -C $recoupRepo bundle create $recoupCloseoutBundle $recoupFeatureBranch
Assert-RecoupNativeSuccess 'Create feature close-out bundle from archival commit'
git -C $recoupRepo bundle verify $recoupCloseoutBundle
Assert-RecoupNativeSuccess 'Verify feature close-out bundle'
$recoupBundleHeads = @(git -C $recoupRepo bundle list-heads $recoupCloseoutBundle)
Assert-RecoupNativeSuccess 'List feature close-out bundle heads'
$recoupExpectedBundleHeadPattern = '^' + [regex]::Escape($recoupCloseoutSha) + '\s+refs/heads/' + [regex]::Escape($recoupFeatureBranch) + '$'
if (-not ($recoupBundleHeads | Where-Object { $_ -match $recoupExpectedBundleHeadPattern })) {
    throw 'Close-out bundle does not contain the exact feature branch HEAD.'
}

git -C $recoupRepo worktree remove $recoupWorktree
Assert-RecoupNativeSuccess 'Remove clean completed or abandoned worktree'
git -C $recoupRepo worktree prune
Assert-RecoupNativeSuccess 'Prune worktree registrations after teardown'
git -C $recoupRepo worktree list
Assert-RecoupNativeSuccess 'Verify final worktree inventory'
```

The branch and its commits remain after normal worktree removal. A reviewed clean archival commit and verified close-out bundle are mandatory whether the work is merged or abandoned. The close-out record shall identify the merge/abandonment decision, last commit SHA, bundle/backup location and final worktree inventory. Investigate any worktree count greater than the branches actively being developed.

## 8. Functional specification

### SPEC-CA-001 - Secure email intake

**Current:** Recoup has inbound-related patterns but no approved remittance-email-to-cash intake authority.  
**Target:** Accept only the approved provider's authenticated request, verified against raw-body signature, timestamp/nonce/replay window, intended recipient, size and content policy. Deduplicate by stable provider/message/content identities. Stage attachments before business acceptance.  
**Acceptance:** Invalid authentication, replay, wrong recipient, unsafe attachment, fetch/storage failure or malformed mapping creates a safe cited blocker and no accepted remittance, allocation, case or agent handoff. A duplicate returns the original run receipt.

### SPEC-CA-002 - Attachment and remittance mapping boundary

**Current:** No ratified general email attachment pipeline exists for this use case.  
**Target:** Use a private authenticated scanner with typed `clean`, `unsafe` and `unavailable` outcomes. Parse only the ratified UTF-8 CSV v1 schema, including the required machine-readable claimed-reason code. Quarantine before parsing/model access when unsafe.  
**Acceptance:** Scanner health and clean/unsafe fixtures pass before intake is enabled. Unsupported, encrypted, spoofed, macro/archive-prohibited or unsafe content never becomes accepted business state. No no-op or public file-upload scanner satisfies readiness.

### SPEC-CA-003 - Authoritative CashReceipt

**Current:** `src/adapters/sapOData.ts` does not expose an approved cleared-item/payment mapping.  
**Target:** Add a canonical `CashReceiptSource` port and a read-only SAP adapter only after D-02 is ratified. The source returns typed settled, pending/reversed/stale, zero-result, ambiguous and unavailable outcomes with source-query receipts and freshness.  
**Acceptance:** Email is never settlement proof. No allocation occurs without a uniquely matched, fresh, settled receipt. The adapter exposes no mutation client, and all auth/mapping/source failures fail closed.

### SPEC-CA-004 - Deterministic match and allocation

**Current:** Existing settlement/Forensics logic must not be silently reused as email cash authority.  
**Target:** Pure core modules match customer, receipt and invoices using owner-approved policy, then allocate with `Decimal` from strict money strings. All ordering, credit, discount, rounding, tolerance, overpay, FX and residual branches are versioned owner input.  
**Acceptance:** The same canonical inputs and policy version yield the same result. Ambiguity or a missing policy branch yields Review/Blocked or `Contract gap`; no model, UI or JavaScript `number` computes or changes money.

### SPEC-CA-005 - Claimed versus validated deduction reason

**Current:** The customer-claimed email reason is not a validated Forensics outcome.  
**Target:** Preserve the claimed reason, map it deterministically under the approved version/hash, and expose a separate validated reason. Only a short payment with validated reason DEP creates a deduction case and Forensics handoff.  
**Acceptance:** Ambiguous/unclassified reasons enter `ReasonReview`; no Forensics handoff occurs. Full payment creates no deduction regardless of claimed reason.

### SPEC-CA-006 - Durable workflow and N5 worker safety

**Current:** Existing Forensics SSE is not a durable general cash workflow engine.  
**Target:** Use append-only workflow events, transactional outbox commands, database leases, deterministic command identities, projections, maximum receipt wait and visible dead letter. The in-process poller is owned by `startCockpitApiRuntime`.  
**Acceptance:** N5 is implemented in two changes. Phase 7A proves missing/false `RECOUP_CASH_WORKER_ENABLED` prevents factory construction and all claims/leases/mutations. With the flag true, a lifecycle handle may exist, but missing/invalid `cash_run_control` returns before the claim RPC and leaves attempt/dead-letter state byte-equivalent. `CLAUDE.md` is updated before merge. Phase 7B adds bounded claim/lease processing only behind both proven gates.

### SPEC-CA-007 - Cash Application agent authority boundary

**Current:** No Cash Application specialist or handoff edge exists.  
**Target:** The agent may select bounded tools, summarize verified results and explain progress. Services/core code own receipt validation, matching, allocation, reason validation, transitions and case creation.  
**Acceptance:** Agent output equals the canonical service result for all business fields. Narration/model failure emits a safe event/fallback and cannot block or alter deterministic progress. Tool input/output uses strict Zod schemas and approved allowlists.

### SPEC-CA-008 - Scoped Forensics and draft outcome

**Current:** Existing S1-S8 Forensics behavior is locked.  
**Target:** Add a live-case entry adapter and one approved Cash Application-to-Forensics edge without changing S1-S8 inputs, expected outputs or release gates. Forensics uses fresh cited evidence.  
**Acceptance:** Invalid/partial DEP can activate Recovery Drafter with deterministic amount clamp and pending-human state. Valid DEP keeps Recovery idle and creates a draft Billing route. No ERP mutation occurs.

### SPEC-CA-009 - Agent Operations workspace

**Current:** `/governance/agents` has backend roster/topology but no durable live run workspace.  
**Target:** Extend it into a dense desktop operational surface with server-backed roster, run table, activity ledger, run detail and event-backed handoff map. All specialists display Idle before work and transition only from persisted events/projections.  
**Acceptance:** Verified intake visibly activates Cash Application; receipt wait does not activate Forensics; durable handoff activates Forensics; Recovery activates only for invalid/partial outcomes; overlapping runs remain separate. Every visible business value has provenance. Raw enums, proof keys, chain-of-thought, secrets and invented values are absent.

### SPEC-CA-010 - Durable cursor SSE

**Current:** Existing Forensics SSE uses process-local invalidation.  
**Target:** Add an authenticated run-scoped cursor SSE over persisted workflow events, separate from the current Forensics SSE. Persist precedes publish; reconnect replays missing events in order.  
**Acceptance:** Disconnect changes only stream status, never workflow state. Reconnect with a cursor receives each missing event once, in order, with no fabricated progress. Cross-run access is rejected.

### SPEC-CA-011 - Maya live-case integration

**Current:** Maya worklist/detail has no upstream cash-origin dossier.  
**Target:** Add backward-compatible live-origin fields and `upstream-cash-origin.tsx`. Advance worklist cache to `maya:forensics:v2` and detail to `:v4`; new loaders reject v1/v3. `maya_ready` invalidates both affected scopes.  
**Acceptance:** Existing S1-S8 items render unchanged. A live item appears only after durable `maya_ready`, with cited email, receipt, allocation, reason, evidence, audit and agent-run provenance. Money arrives backend-formatted; cockpit business-logic invariant remains green.

### SPEC-CA-012 - Approval, modification and audit

**Current:** Existing approval and hash-chained audit services are authoritative.  
**Target:** Extend them with versioned live-case action scope and material workflow/handoff/human-decision events while preserving current semantics.  
**Acceptance:** Unauthorized or proposer-as-approver attempts are rejected and audited without state advance. Modification creates a revised candidate, reruns deterministic amount/evidence/authorization guards, and retains original and revised receipts. The audit chain verifies.

### SPEC-CA-013 - Backward-compatible configuration and schema

**Current:** `run_control` has six required phases; the current `recoup_config.key` CHECK does not admit `cash_run_control`.  
**Target:** Add a separate optional strict `cash_run_control`. Transactionally widen the existing key CHECK to include it, preserving rows, grants, RLS and the six-phase payload. Add only additive cash/workflow tables and atomic RPCs.  
**Acceptance:** Missing/invalid cash config blocks cash processing only. Existing required rows remain parseable and readiness counts remain six. Fresh and migrated schemas converge on explicit `recoup_config_key_check`; unknown preflight shape aborts safely.

### SPEC-CA-014 - Feature isolation, rollout and rollback

**Current:** The live solution must remain usable while the feature is disabled or rolled back.  
**Target:** Separate flags control inbound acceptance, worker construction/claiming, live-case creation, Agent Operations live exposure and Maya live-origin exposure. Schema deploys before disabled code; exposure progresses from rehearsal to shadow to approved canary.  
**Acceptance:** With flags off, existing routes and results are unchanged. Rollback pauses commands without deleting evidence, keeps accepted runs queryable, prevents duplicate resume, preserves the audit chain and requires no destructive down migration.

## 9. Repository change boundary

This section is the implementer's local change map. It mirrors Technical Design Section 3 so the specification remains usable when read independently. A target-branch reconciliation is mandatory immediately before coding; a different existing seam may replace a proposed filename only when the approved plan records the evidence and preserves the same responsibility and test coverage.

### 9.1 New backend and schema files

| Proposed file | Single responsibility |
|---|---|
| `src/types/cashApplication.ts` | Strict Zod contracts for inbound envelope, advice, CashReceipt, allocation, reason and live case |
| `src/types/workflow.ts` | Workflow run/event/outbox/projection/handoff contracts and enums |
| `src/core/cashApplication/match.ts` | Pure candidate matching and ambiguity result |
| `src/core/cashApplication/allocate.ts` | Pure Decimal allocation and reconciliation |
| `src/core/cashApplication/reason.ts` | Pure claimed-to-validated reason mapping using approved config |
| `src/adapters/inboundRemittance.ts` | Provider-neutral inbound port and canonical envelope |
| `src/adapters/providers/<approvedProvider>.ts` | Approved-provider signature verification and event mapping; filename is unresolved until D-01 |
| `src/adapters/cashReceipt.ts` | Canonical read-only `CashReceiptSource` port |
| `src/adapters/sapCashReceipt.ts` | Slice-one read-only SAP mapping only after D-02; no ERP mutation |
| `src/services/attachmentSecurity.ts` | Private scanner port, health, scan/quarantine policy and typed outcomes |
| `src/services/remittanceMapper.ts` | Ratified UTF-8 CSV v1 mapper with required claimed-reason code |
| `src/services/remittanceIntake.ts` | Deduplication and atomic intake command orchestration |
| `src/services/cashApplication.ts` | Preconditions, source reads, deterministic core calls and case command |
| `src/services/workflowRepository.ts` | Repository port for cash records, runs, events, outbox and projections |
| `src/services/supabaseWorkflowRepository.ts` | Supabase implementation of the workflow/cash repository port |
| `src/services/workflowWorker.ts` | Construction/config-gated leased outbox consumer and phase dispatcher |
| `src/services/agentOperations.ts` | Roster, run, activity and provenance read-model composition |
| `src/agents/cashApplication.ts` | Bounded Cash Application agent definition |
| `src/agents/prompts/cashApplication.md` | Versioned agent prompt with no business authority |
| `docs/supabase-cash-application-schema.sql` | Source-controlled additive tables, RPCs, grants and CHECK transition |

### 9.2 Existing backend/configuration integration seams

| Existing file | Permitted surgical change |
|---|---|
| `src/types/entities.ts` | Re-export/reference approved canonical types only if required; no unrelated consolidation |
| `src/agents/agentRuntime.ts` | Register Cash Application manifest and hook receipts |
| `src/agents/handoffGraph.ts` | Add exactly one Cash Application-to-Forensics edge after tests exist |
| `src/agents/forensics.ts` | Add scoped live-case entry without changing S1-S8 behavior |
| `src/services/conductor.ts` | Add cash-only budget/hook mapping; keep existing readiness counts unchanged |
| `src/services/serviceLayer.ts` | Register only approved bounded `cash.*` and `workflow.*` tools |
| `src/services/cockpitApi.ts` | Add inbound, Agent Operations and live-case routes |
| `CLAUDE.md` | Add the production-connected local-worker warning before Phase 7B |
| `src/memory/supabaseStore.ts` | Add optional config/bootstrap support and explicit `recoup_config.key` CHECK transition |
| `src/services/cockpitModel.ts` | Add live-origin and agent/run read models while preserving existing fields |
| `src/services/approvals.ts` | Add versioned live-case action scope while preserving approval semantics |
| `config/models.ts` | Bind Cash Application to an already approved pinned model |
| `config/openaiPromptCache.ts` | Add dedicated `cash_application` namespace/key; do not reuse Forensics |
| `config/releaseOwnerInputs.ts` | Add separate optional `cash_run_control`; do not alter the six required phases |
| `cockpit/app/api/read-model-cache.ts` | Advance Maya worklist to `:v2`, detail to `:v4`, and reject old shapes in new loaders |

### 9.3 Cockpit additions and permitted wiring

| Proposed file | Responsibility |
|---|---|
| `cockpit/app/api/agent-operations/roster/route.ts` | Authenticated backend roster proxy |
| `cockpit/app/api/agent-operations/runs/route.ts` | Authenticated run-list proxy |
| `cockpit/app/api/agent-operations/runs/[runId]/route.ts` | Authenticated run-detail proxy |
| `cockpit/app/api/agent-operations/events/route.ts` | Authenticated cursor-SSE proxy |
| `cockpit/app/api/agent-operations/runs/[runId]/retry/route.ts` | Authorized retry command proxy |
| `cockpit/app/api/agent-operations/runs/[runId]/cancel/route.ts` | Authorized cancel command proxy |
| `cockpit/components/agent-operations/agent-operations-workspace.tsx` | Dense, desktop-first live workspace |
| `cockpit/components/agent-operations/run-table.tsx` | Server-backed operational run table |
| `cockpit/components/agent-operations/activity-ledger.tsx` | Durable ordered event timeline |
| `cockpit/components/agent-operations/run-detail.tsx` | Email/receipt/allocation/case provenance detail |
| `cockpit/components/agent-operations/handoff-map.tsx` | Event-backed handoff edges; no decorative activation |
| `cockpit/components/agent-operations/use-agent-events.ts` | Cursor/reconnect/visibility-safe client hook |
| `cockpit/components/maya/upstream-cash-origin.tsx` | Backend-formatted email/receipt/allocation dossier |

Existing `cockpit/app/governance/agents/page.tsx`, Maya loaders and worklist/detail types receive additive wiring only. They may not acquire business calculations or static business data.

### 9.4 Seven pinned-contract extensions

Each contract is a separate review item. The failing assertion is written before implementation, the additive member is justified, and all prior members remain unchanged.

| # | Pinned contract | Required extension and preservation proof |
|---:|---|---|
| 1 | `tests/invariants/tool-whitelist.test.ts` | Preserve the prior 23 names and add only the approved cash/workflow tools |
| 2 | `tests/invariants/tool-permissions.test.ts` | Add the same tools with explicit risk and side-effect metadata |
| 3 | `tests/unit/agent-handoffs.test.ts` | Preserve five existing edges and add only Cash Application Agent to Forensics Investigator |
| 4 | `tests/invariants/pinned-models.test.ts` | Preserve prior settings and bind Cash Application to an approved pinned model/cache key |
| 5 | `tests/invariants/connector-readiness.test.ts` | Preserve six connector names; extend `sap-odata` only after D-02 and keep inbound readiness separate |
| 6 | `tests/invariants/run-control.test.ts` | Preserve strict six-phase parsing/counts; missing/invalid optional cash config blocks cash only |
| 7 | `tests/unit/openai-prompt-cache.test.ts` | Preserve the prior four capabilities and add only `cash_application` with its dedicated versioned key |

### 9.5 Protected files and prohibited expansion

`tests/invariants/cockpit-no-business-logic.test.ts` is a protection contract, not an extension target, and must remain unchanged and green. `src/audit/trail.ts`, `datagen/`, the S1-S8 gold corpus, existing release eval data and unrelated cockpit components must not be edited unless a later approved implementation brief names the exact file and reason. No repository-wide refactor, rename, formatting pass or dependency addition belongs to this change.

### 9.6 v3.2 requirement disposition register

The two v3.2 items identified by the audit are not silently deleted. Their allowed meaning is constrained by current invariants and v3.3.4 scope.

| v3.2 requirement | Original priority/text | Disposition in this specification | Implementation consequence |
|---|---|---|---|
| `FR-DEP-10` | **Should:** On approval, route the handoffs, write the credit-memo/recovery reference back onto the dispute case, and set the case status. | **Partially retained and constrained.** Internal Recoup handoff routing, execution-reference tracking and event-derived case status are retained. ERP/source-system dispute write-back is rejected by I-26. | Store only a read-model/audit reference in Recoup. No external case mutation is permitted without a separately approved authenticated execution-receipt contract and governing-document amendment. |
| `FR-DEP-14` | **Could:** Optionally straight-through a fully-valid claim below a policy dollar tolerance, still logged/reversible, subject to client policy. | **Reinterpreted, not autonomous.** AC-19 measures straight-through deterministic processing before Maya on an approved eligible reference corpus; it does not approve an external action. | No tolerance is invented. Any external recovery/Billing/correspondence action remains draft-only and HITL-gated regardless of amount. |

## 10. Test architecture and evidence standard

### 10.1 Backend testing layers

1. **Schema/type tests:** strict Zod boundaries, money strings, state/event/outbox/handoff contracts and safe errors.
2. **Pure unit tests:** matching, allocation, reconciliation, reason validation, stable IDs, projection reduction and deterministic guards.
3. **Service/agent unit tests:** intake, receipt outcomes, idempotency, narration degradation, scoped handoff, authorization and read models.
4. **Integration tests:** SAP readiness/mapping, scanner, atomic RPCs, migrations, leases, crash recovery, database no-mutation proofs and projection rebuild.
5. **Invariant tests:** no model dollars, no ERP write, receipt required, no agent authority, gold isolation, idempotency, event-derived state, live provenance and fail-closed operation.
6. **API contract tests:** raw-body authentication, bounded schemas, safe errors, run/case scoping, commands and authenticated cursor SSE.
7. **Eval tests:** locked S1-S8 parity and versioned eligible-reference straight-through effectiveness.

Every test must state fixture identity/version, source mode, expected persisted records, forbidden records/mutations and the relevant BRD/SA invariant IDs.

### 10.2 Browser testing standard

Browser acceptance uses Playwright with Chromium against running Next.js and backend processes, following the existing `tests/e2e/*` harness pattern.

- No browser release test may satisfy business behavior through mocked Next routes, static React state, intercepted fabricated API payloads or direct component rendering.
- Scenario setup may call an approved isolated test/provider harness or seed controlled test fixtures before navigation. That harness must use the same backend intake/service contracts and be unavailable in production.
- Browser assertions use accessible roles/names and stable semantic `data-testid` values only where necessary.
- Each journey records observed backend calls/statuses, visible state/provenance, browser console/page errors, screenshot on failure and Playwright trace on failure.
- Tests run at the approved dense desktop viewport and include keyboard/focus/status-text checks for applicable states.
- Authentication uses the existing demo/test identity mechanism for Maya/CFO/operator roles; no secrets are embedded in test source or artifacts.
- Browser tests verify displayed values against the backend/read-model response for the same run/case. They do not recalculate amounts in the test page.
- SSE tests prove a real disconnect/reconnect and durable cursor replay.
- Synthetic, reference-fixture, replay, shadow and governed-real-sender modes are visibly and accurately labelled.
- Browser testing is a required acceptance layer for all AC-01 through AC-19, not optional UI polish.

The primary new browser files remain those proposed by the Technical Design:

- `tests/e2e/remittance-email-to-maya-e2e.ts` for intake-to-Maya business journeys;
- `tests/e2e/agent-operations-live-e2e.ts` for roster, concurrent run, activity, handoff, block/dead-letter and reconnect behavior.

Existing suites `maya-real-backend-e2e.ts`, `maya-approval-lifecycle-e2e.ts`, `forensics-sse-live-update-e2e.ts`, `maya-stale-state-e2e.ts` and `shared-cockpit-surfaces-regression-e2e.ts` remain regression gates.

### 10.3 Test data rules

- Use versioned owner-approved reference fixtures. Do not embed customer-sensitive production email or attachment text.
- Use exact decimal strings and approved policy versions; never generate expected money through model output.
- Source-mode metadata must distinguish approved reference fixture, synthetic/replay, shadow and governed real sender.
- Negative evidence requires a fresh scoped query receipt with zero results. An outage, auth failure or stale response cannot stand in for negative evidence.
- Fault injection is permitted only in isolated test processes/databases. No production test-only failure endpoint may be added.

## 11. AC-01 through AC-19 backend and browser scenario mapping

Each row is independently pass/fail. “No record” assertions cover the relevant allocation, deduction case, handoff, draft and external mutation records.

| AC | Required outcome | Backend test specification | Browser/Playwright test specification | Required evidence |
|---|---|---|---|---|
| AC-01 Happy-path short pay | One verified email and settled fresh receipt produce one Decimal short-pay allocation, validated DEP, one case, one handoff and one Maya item pending human action. | `cash-receipt-sap-readiness`, `remittance-intake`, `cash-match`, `cash-allocation`, `cash-reason`, `live-case-forensics` and invariants SA-CA-01..08 prove the full chain, exact IDs, provenance, no ERP write and once-only effects. Test remains blocked until D-02/D-04/D-05/D-08 evidence passes. | In `remittance-email-to-maya-e2e`, log in as Agent Operations operator, assert all agents Idle, submit one approved reference email through the real isolated intake harness, observe Cash Application queued/running, durable handoff to Forensics, then log in as Maya and verify exactly one live-origin item with receipt/allocation/reason/evidence provenance and pending-human controls. Compare visible backend-formatted money with the read model. | API receipts, persisted row IDs, ordered events, audit refs, browser trace/screenshot and zero duplicate/ERP mutation evidence. |
| AC-02 Full payment | Allocation completes with no deduction, Forensics run or Maya deduction item. | Allocation/reason/service tests use a balanced receipt and assert completion plus absence of case, handoff and draft records. | Submit the full-payment fixture; Agent Operations shows Cash Application completion and Forensics/Recovery remain Idle. Search Maya worklist/detail through the real backend and prove no deduction item exists. | Completion event, allocation receipt, absence-query receipts and browser evidence. |
| AC-03 Duplicate delivery | Provider retry references the existing run and creates no duplicate state. | Intake/API/idempotency tests send the same provider event/message/content identity twice and assert one inbox/remittance/run/outbox chain and a stable original-run response. | Deliver the same verified event twice; Agent Operations shows one run and one timeline, with an audited duplicate/idempotent receipt rather than a second run. Reload and re-query to rule out delayed duplication. | Stable run ID, row counts before/after, duplicate receipt and browser timeline. |
| AC-04 Ambiguous match | Unresolved customer/invoice/receipt candidates enter Review/Blocked with no deduction/handoff. | `cash-match` and policy matrix tests create two valid candidates and assert cited ambiguity, no allocation, case, handoff or Forensics invocation. | Submit the ambiguous fixture; verify the run's blocked/review label and candidate provenance in run detail, while Forensics remains Idle and Maya has no live item for the run. | Candidate IDs, deterministic ambiguity basis, forbidden-row assertions and browser state. |
| AC-05 Unsupported document | Policy-violating attachment creates a visible safe blocker and no model-derived business record. | Mapper/attachment/API tests cover unsupported MIME/extension, encrypted or malformed input and assert rejection before parsing/model access or accepted-remittance write. | Submit the unsupported fixture through the isolated provider path; verify Agent Operations displays a safe human label and source provenance without raw content, and no Cash Application run activity beyond rejected intake. | Safe error code, scan/map receipt, no accepted business rows, no browser errors. |
| AC-06 No settled receipt | Valid email waits durably for settlement; due-time polling alone can resume; exhaustion becomes visible Review/Blocked plus dead letter. N5 split gates cause zero prohibited work. | `cash-receipt-redrive`, `workflow-worker-startup`, `workflow-worker-disabled-no-mutation`, outbox and SAP adapter tests prove: disabled flag means no construction; enabled plus invalid/missing config means zero claim call/lease/mutation; valid gates schedule exactly one deterministic resume, survive restart, and exhaust under owner config without allocation. | Submit a no-receipt fixture with valid gates in an isolated runtime. Verify `AwaitingCashReceipt`, Cash Application Waiting, Forensics Idle and one scheduled resume. Disconnect the browser and allow due processing; reconnect and observe either settled continuation or visible terminal/dead-letter state. The browser must not be kept open to progress the run. | Factory/claim spies, byte-equivalent DB snapshots for negative gates, command identity, source-query receipts, event timeline and browser reconnect proof. |
| AC-07 Ambiguous reason | Short pay with unvalidated DEP enters reason review and does not hand off. | `cash-reason` and service tests preserve claimed code, return `ReasonReview`, and assert no case/handoff/Forensics record. | Submit the ambiguous-reason fixture; verify the claimed reason and human-readable reason-review blocker are visible with provenance, while Forensics remains Idle and Maya has no deduction item. | Reason-map version/hash, claimed/validated separation and absence evidence. |
| AC-08 Source outage | Required receipt/SAP/evidence outage shows `Source unavailable`; no allocation or invalid/partial decision. | Adapter/service/fail-closed invariant tests return typed unavailable outcomes and prove no synthetic fallback, allocation, verdict or case. | Run against the isolated unavailable-source fixture/fault adapter; verify source-health and run-detail show `Source unavailable`, not “no evidence,” with no downstream agent activation. | Source-health/query receipt, safe error, no business-effect rows and browser provenance. |
| AC-09 Invalid/partial DEP | Complete fresh evidence supports invalid/partial; Recovery activates and creates an amount-clamped draft pending human approval. | Live Forensics, evidence-pack, amount-clamp, approval and no-ERP invariant tests prove documents/freshness, deterministic verdict/basis and draft-only amount. | Complete the invalid/partial reference journey; verify Cash Application-to-Forensics handoff, Recovery running only after the verdict, then Maya shows the cited evidence pack and clamped recovery draft in pending-human state. | Evidence/document IDs, formula/basis, draft/action/audit IDs, displayed provenance and no external execution. |
| AC-10 Valid DEP | Complete fresh evidence supports valid; Billing draft exists, Recovery stays Idle and ERP is untouched. | Forensics/billing-loop/no-ERP tests prove valid outcome, draft Billing route, no Recovery proposal and no write-capable ERP path. | Complete the valid fixture; Agent Operations shows Forensics complete and Recovery Idle. Maya displays a draft Billing route with no posting/execution implication and no recovery amount/action. | Verdict/evidence receipts, billing draft ID, absence of Recovery and ERP mutation evidence. |
| AC-11 Overlapping emails | Configured concurrency cap plus one yields distinct runs, correct active counts, leases and backpressure. | Load/integration tests submit `approved cap + 1` emails, assert distinct identities, bounded claims, unique leases/effects, queue order/backpressure and accurate projections. No numeric cap is hard-coded until owner approval. | In `agent-operations-live-e2e`, launch the owner-configured cap plus one through the real backend. Verify distinct rows/timelines, active count equals durable projection, the excess run is visibly queued/backpressured, and no states collapse into a global animation. | Load parameters/version, lease/row counts, event sequences, UI counts and screenshots. |
| AC-12 SSE reconnect | Cursor reconnect returns each missing persisted event once and in order with no fabricated progress. | SSE/API tests authenticate before headers, persist before publish, enforce run scope, disconnect after cursor N, append events, reconnect and assert N+1 onward exactly once. | Open a live run, capture visible cursor/state, force the browser event stream offline, let backend work continue, reconnect and verify all missing ledger entries appear once in order. Stream status may change; run state may not change merely because of disconnect. | Cursor sequence, persisted event IDs, network log and before/after screenshots. |
| AC-13 Unsafe attachment | Malware/prohibited content is quarantined before parsing or model access; no remittance state is accepted. | Scanner/staging tests use approved safe malware fixture/signature and assert quarantine, access/retention controls, cleanup and no mapper/model/accepted-intake call. | Submit the approved unsafe fixture; verify a quarantined/rejected status and safe policy message. Ensure attachment content is never rendered and no Cash Application/Forensics/Maya activity exists. | Scanner verdict/health receipt, quarantine object metadata, call spies, absence rows and browser evidence. |
| AC-14 Receipt/remittance mismatch | Amount, currency, legal entity or reference mismatch blocks with cited basis and no allocation. | Receipt/match/allocation matrix tests cover each mismatch dimension independently and assert Review/Blocked, record IDs and no allocation/case. | For each approved mismatch fixture, verify the run detail identifies the human-readable mismatch dimension and provenance without exposing secrets; downstream agents remain Idle and Maya has no live item. | Receipt/remittance IDs, deterministic comparison basis, forbidden rows and browser detail. |
| AC-15 Verified negative evidence | Only a fresh scoped zero-result receipt may support absence. | Forensics negative-evidence tests distinguish fresh zero results from unavailable, stale or unscoped results; only the first can enter the evidence pack/decision basis. | Run a fixture whose approved evidence query returns a fresh zero-result receipt; Maya evidence view displays the query scope, freshness and zero-result receipt as verified negative evidence. Repeat an outage variant and verify it displays `Source unavailable`, not negative evidence. | Query receipt/hash/scope/time, decision citation and two browser-state proofs. |
| AC-16 Unauthorized approval | Ineligible or proposer-identical identity is rejected/audited and action state does not advance. | Approval/API/SoD tests attempt unauthorized role and proposer-as-approver, assert safe rejection, immutable action version/status and audit entry. | Log in as the ineligible test identity and attempt approval through the real control. Verify the UI reports rejection, refreshes to the unchanged pending state, and an authorized audit view shows the attempt without sensitive detail. | Identity/role test fixture, before/after action receipt, HTTP result, audit ID and browser proof. |
| AC-17 Human modification | Maya modification creates a revised proposal and reruns amount, evidence and authorization guards; both versions remain auditable. | Approval/modification tests modify an allowed field/amount, assert new version, clamped deterministic amount, revalidated evidence/authorization and preserved original/revised receipts. Invalid modification fails without state advance. | As Maya, open the live item, modify through the real form, submit and verify the revised candidate/version and pending-human state. Open evidence/audit detail and verify both original and revised receipts plus revalidation status. | Versioned action IDs, guard receipts, audit chain and browser form/detail evidence. |
| AC-18 Crash and dead letter | Post-intake/receipt-wait crash resumes once; deterministic identity prevents duplicate command/case/handoff; exhaustion is operator-visible. | Atomicity/outbox/worker integration tests inject crashes at approved seams, restart against the same database, and assert one effect. Maximum attempt/wait produces one dead-letter record and visible projection. | In an isolated process, the harness injects a crash outside the browser, restarts backend/worker, then Playwright reconnects to the same run. Verify the event ledger shows retry/recovery once or a visible dead-letter operator item; no duplicate case/handoff exists. No production fault endpoint is allowed. | Fault point, restart logs, deterministic command ID, row counts, dead-letter/event IDs and browser timeline. |
| AC-19 Straight-through effectiveness | Versioned owner-approved eligible reference corpus achieves `eligible_reference_stp_rate >= 95%`; post-eligibility Review/Blocked fails the numerator; result is not labelled live effectiveness. | `tests/evals/cash-straight-through-rate.test.ts` freezes corpus version, denominator/exclusions and per-run results, calculates the metric in code, fails below 95%, and prohibits live-effectiveness labels without the separate governed-real-sender contract. | Playwright samples real Agent Operations run rows/details produced by the corpus and verifies reference-fixture labels, eligible per-run outcomes, backend provenance and the absence of a live-effectiveness claim. It does not assert an undefined aggregate reporting widget; the aggregate denominator, numerator and 95% threshold are backend-eval responsibilities. | Corpus/version/hash, denominator/numerator, per-run receipts, eval result and correctly labelled browser evidence. |

## 12. Existing-solution regression matrix

| Protected capability | Required proof before every affected phase is accepted |
|---|---|
| S1-S8 Forensics | Existing schemas, inputs, work-item IDs, outcomes, gold parity, FP/accuracy and release gates remain unchanged and green. |
| Maya current workspace | Existing worklist/detail/evidence/trace/draft/approval journeys pass; v2/v4 loaders preserve current items and reject stale v1/v3 for new live-origin contracts. |
| Approval lifecycle | Existing receipts, eligibility, SoD, approve/modify/reject and CFO demo reset behavior pass unchanged. |
| Audit chain | Genesis/tail continuity and current audit entries verify before and after new event categories; no evidence is rewritten. |
| Existing Forensics SSE | `test:e2e:forensics-sse-live-update` remains green; new durable workflow SSE is separate. |
| David, CFO and query | API contracts and `shared-cockpit-surfaces-regression-e2e.ts` remain green with all cash flags off and on. |
| Connector readiness | Existing six connector names/shapes remain; CashReceipt extends `sap-odata` only after D-02 proof. No synthetic provider/source table is added. |
| Run control | Current strict six-phase row parses and phase counts remain six. Missing/invalid optional cash config cannot fail protected routes. |
| Tool/model/cache pinned contracts | Prior whitelist, permissions, handoff edges, model settings and prompt-cache capabilities remain exactly preserved except for reviewed additive members. |
| Remittance sources | Existing `remittance_headers`, `remittance_lines` and `recoup_src_remittance` behavior remains unchanged and never becomes live write authority. |
| No ERP write / draft-only | Static and runtime tests prove no write-capable ERP client, no posting implication and no external execution without approval. |
| Cockpit business logic | `cockpit-no-business-logic` remains unchanged/green; backend-formatted money and status labels are used. |

## 13. Test execution gates

### 13.1 Baseline

From the clean approved worktree, with flags off:

```powershell
npm.cmd ci
npm.cmd run verify
```

`verify` already runs lint, typecheck, the full Vitest suite, dependency-cruiser and release readiness in sequence; running the five components first would duplicate the baseline and make a second-pass flake ambiguous. If `verify` fails, the individual component commands may be run afterward only to diagnose the failing stage.

The Git worktree must remain clean of tracked secrets, but the current `verify:release` stage loads governed owner inputs from Supabase and therefore requires approved runtime credentials. Provision only the required variable names through the controlled mechanism in Section 7.2; do not copy credentials from the authoring checkout or write values into logs/evidence. SAP, OpenAI, inbound-provider and scanner connectivity are separate explicitly authorized readiness probes unless a named release gate requires them.

If the Supabase/governed-input credentials are unavailable, run `lint`, `typecheck`, `test` and `depcruise` as an **offline partial baseline**, record `verify:release` and aggregate `verify` as **BLOCKED - governed runtime inputs unavailable**, and stop. A partial baseline cannot satisfy Section 5.2, Section 18 or a GO decision.

If the baseline fails due to a pre-existing issue, stop and record the exact command/stage and failure against the approved SHA. Do not weaken configuration, exclude files, skip hooks or relabel the baseline as green.

### 13.2 Per logical change

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
```

Run the smallest phase-specific test first, then the three repository gates. Phase 7A additionally requires database-backed no-mutation evidence. UI phases additionally require both new Playwright files and the existing browser regression suites.

### 13.3 Browser commands to add during implementation

The implementation shall add explicit package scripts for the two proposed new Playwright journeys. Final names require reviewer confirmation, but shall resolve directly to:

```text
tsx tests/e2e/remittance-email-to-maya-e2e.ts
tsx tests/e2e/agent-operations-live-e2e.ts
```

Browser release evidence must also include the existing Maya real-backend, approval lifecycle, Forensics SSE, stale-state and shared-surface suites. A passing unit/component test is not a substitute for a passing real-browser journey.

## 14. Phased implementation and commit plan

| Phase | Scope | Mandatory exit |
|---|---|---|
| 0 | Backup, approved documents/target SHA, clean worktree, baseline, D-02/D-04/D-05/D-08 evidence and all owner decisions | Signed Phase 0 evidence pack; implementation GO recorded separately |
| 1 | Cash/workflow types and pure deterministic core, tests first | Type/unit/invariant tests; no persistence, agent or UI change |
| 2 | Additive schema, repositories, RPCs and `recoup_config` CHECK transition | Empty/current/reapply migration, atomicity, grants/RLS and rollback evidence |
| 3 | Provider adapter, private scanner, CSV v1 mapper and intake | Authentication, replay, scan, health, quarantine, mapping and atomic intake tests |
| 4 | Read-only SAP CashReceipt adapter, re-drive and cash application service | Settled/fresh mapping, due-time-only resume, allocation and no-ERP tests |
| 5 | Cash Application agent/tools/conductor/handoff, prompt cache and optional run control | Agent boundary, narration degradation and all pinned-contract tests |
| 6 | Live-case Forensics and Maya read models/cache versions | S1-S8 parity, cache/invalidation, backend-formatted money and Maya regression |
| 7A | Worker lifecycle seam, construction flag, pre-claim config return, `CLAUDE.md`, negative tests | Exact N5 split proof and byte-equivalent database state |
| 7B | Bounded claims/leases, events, projections, receipt resume, dead letter and durable SSE | Restart/race/concurrency/reconnect/rebuild tests behind both gates |
| 8 | Agent Operations and Maya UI | All applicable AC browser tests, accessibility and visual score >=4/5 |
| 9 | Security, evals and complete regression | Full `npm run verify`, AC-01..19 evidence, S1-S8 and `>=95%` reference eval |
| 10 | Rehearsal, shadow, approved canary and production after explicit approval | Provider/backend/database/public-alias evidence, rollback readiness and no ERP mutation |

Do not combine Phase 7A and 7B. Do not add a claim-capable path until the two Phase 7A negative cases pass independently.

## 15. Security and privacy acceptance

The security review must cover provider signature/timestamp/nonce, wrong-recipient and replay attacks; content-type confusion and extension spoofing; archive, macro and encrypted-file policy; scanner unavailability; malware quarantine; SSRF-safe provider/attachment fetch; PII minimization; cross-run/customer authorization; object access; tool/prompt injection; safe errors; secret isolation; retention and deletion policy; and authenticated SSE before headers.

Logs, traces, test artifacts and screenshots shall contain identifiers and safe metadata only. They shall not contain provider secrets, auth headers, `.env` values, raw customer free text, attachment contents, unrestricted model reasoning or chain-of-thought.

## 16. Observability and operational evidence

Every run uses a correlation ID and stable run/case/command/event identities. Structured logs and spans shall make intake, scan, receipt query, match, allocation, reason, handoff, agent narration, Forensics, draft, Maya readiness and human decision traceable without exposing sensitive content.

Operational dashboards/read models shall distinguish queue depth, active count, waiting for receipt, retries, dead letter, source unavailable, contract gap, scanner state, processing latency and database contention. Model usage uses the existing FinOps receipt with the dedicated `cash_application` prompt-cache namespace. A cache-success claim requires non-zero cached-token evidence.

## 17. Deployment, canary and rollback

1. Deploy the additive schema and disabled backend before any intake/worker/UI exposure.
2. Prove existing configuration and protected routes after each deploy.
3. Enable rehearsal-only input first, then shadow intake/receipt lookup without case creation.
4. Enable one approved reference-fixture canary only after scanner, provider and SAP readiness are healthy.
5. Run a governed-real-sender canary only after its denominator, exclusions, window, minimum sample and authorization are separately approved.
6. Do not publish live-effectiveness claims from reference/synthetic/replay data.
7. Kill switches independently disable inbound acceptance, command claiming, live-case creation, Agent Operations live exposure and Maya live-origin exposure.
8. Rollback pauses commands without deleting accepted data, retains queryable events, preserves audit continuity and allows idempotent later resume.
9. No destructive down migration is permitted for workflow evidence.
10. Production deployment requires explicit release approval after the tested branch/worktree is reconciled with the intended deployment source.

## 18. Definition of ready for implementation

Implementation may be authorized only when all are true:

- Section 5.2 evidence is complete and signed.
- Every pre-existing dirty path has an owner and approved disposition; the selected target carries only reviewed changes.
- The approved target SHA contains `.claude/worktrees/`, and both backup/worktree preflight checks prove the path is ignored.
- The repository backup and restore rehearsal in Section 6 pass.
- The target branch/SHA is approved and the isolated worktree is clean.
- Baseline `npm run verify` passes on that SHA.
- All owner-controlled fields/constants and provider/security/source contracts are ratified.
- AC-01 is structurally reachable without synthetic fallback.
- N5 Phase 7A and 7B split is accepted as mandatory.
- The implementer, independent reviewer, security reviewer and browser reviewer are named.
- The requirement/test traceability and phase/commit plan are approved.

## 19. Definition of done

The feature is complete only when:

1. AC-01 through AC-19 each have passing backend and Playwright evidence from the same reviewed commit/environment.
2. SA-CA-01 through SA-CA-08 are release-blocking and green.
3. Full `npm run verify` and all required browser suites pass without skipped/quarantined release gates.
4. Existing S1-S8, Maya, approvals, audit, Forensics SSE, David, CFO and query regressions pass.
5. Schema migration, reapplication, compatibility, RLS/grants and rollback proofs pass.
6. Phase 7A proves both N5 negative cases and Phase 7B operates only behind both gates.
7. Security review has no unresolved critical/high finding.
8. Agent Operations and Maya runtime screenshots meet the approved design cue and visual score >=4/5.
9. Every visible business value is backend/read-model sourced with provenance; no static business data or UI calculation exists.
10. No model-derived dollar, unsupported deduction verdict, unauthorized action or ERP write path exists.
11. Reference-corpus STP is at least 95% and labelled only as pre-production/reference evidence.
12. The independent reviewer has rerun the gates, reviewed the full diff and issued final GO for audit.

## 20. Specification quality and ambiguity report

These scores measure specification clarity under the selected spec workflow; they are not implementation confidence, source-health evidence or permission to proceed. The weighted formula is `1 - (0.35 x goal + 0.25 x boundary + 0.20 x constraint + 0.20 x acceptance)`.

| Dimension | Score | Minimum | Status | Evidence basis and residual ambiguity |
|---|---:|---:|---|---|
| Goal clarity | 0.90 | 0.75 | Met | The customer journey and AC-01..19 outcomes are explicit; live completion still depends on authoritative settlement evidence. |
| Boundary clarity | 0.90 | 0.70 | Met | In/out scope, no-ERP/HITL boundaries, D-02 contingency and v3.2 dispositions are explicit. |
| Constraint clarity | 0.75 | 0.65 | Met | Deterministic money, durability, security and compatibility rules are locked; provider/source/policy/run-control values remain owner inputs. |
| Acceptance criteria | 0.92 | 0.70 | Met | All 19 scenarios have backend and browser checks, with AC-19 aggregate responsibility clarified. |
| **Weighted ambiguity** | **0.13** | **<=0.20** | **Gate met for specification review** | The document is sufficiently clear to review; Phase 0 blockers still prohibit implementation. |

The remaining ambiguity is intentional and blocking, not permission to infer values. D-02/D-04/D-05/D-08, provider selection, allocation policy constants, run controls, roles/states, SLOs and the approved target SHA must be supplied through Phase 0. Until then, this specification is ready for final review but not for implementation execution.

### 20.1 Review and refinement log

| Finding | Disposition | Revision 1.1 decision |
|---|---|---|
| S1 worktree-ignore/restore conflict | Accepted against committed `HEAD` | Require `.claude/worktrees/` in the approved target SHA and prove it before backup and worktree creation. The current uncommitted rule is not treated as baseline evidence. |
| S2 no permanent D-02 path | Accepted | Add a Treasury/Architecture/Product decision branch: amended bank/lockbox slice or explicitly incomplete rehearsal/shadow deferral; neither bypasses AC-01. |
| S3 undefined AC-19 UI surface | Accepted as a scope clarification | Browser verifies real per-run labels/outcomes/provenance; the aggregate 95% calculation remains backend-eval only. No new aggregate widget is implied. |
| S4 duplicate baseline gate | Accepted | Run `npm.cmd run verify` once; use component commands only after failure for diagnosis. |
| S5 implementation map too thin | Accepted | Carry backend, integration-seam, cockpit and pinned-contract maps directly in Section 9. |
| S6 v3.2 dispositions absent | Accepted | Record constrained dispositions for `FR-DEP-10` and `FR-DEP-14`; neither authorizes ERP write-back or autonomous action. |
| S7 minor findings | Partially accepted | Add dirty-path ownership, seven separately numbered contracts and governed baseline-credential semantics. Retain workflow-required ambiguity scoring, but make its formula/basis explicit and separate it from readiness evidence. |
| Audit note that `.env.local`/SAP names were absent | Not current | Live verification found `.env.local` and SAP variable names through the approved loader. Values were not inspected or recorded; D-02 remains open after HTTP 401. |

## 21. Final reviewer checklist

- [ ] Confirm the backup is outside the repo, complete, hashed and restoration-tested.
- [ ] Confirm every dirty authoring-checkout path has an owner and `include/defer/archive/abandon` disposition.
- [ ] Confirm the approved target SHA contains `.claude/worktrees/` and both `git check-ignore` preflights pass.
- [ ] Confirm the implementation starts from the named clean SHA/worktree.
- [ ] Confirm D-02 is supported by successful metadata and bounded-read evidence, not the earlier HTTP 401.
- [ ] If authenticated SAP discovery proves the required entity unavailable, confirm Treasury/Architecture/Product chose and documented one Section 5.3 branch; do not silently continue.
- [ ] Confirm private scanner and CSV/reason reachability evidence are co-located with D-02.
- [ ] Confirm no business constant or source field was inferred.
- [ ] Confirm Phase 7A precedes any claim-capable worker code and updates `CLAUDE.md`.
- [ ] Confirm all AC-01..AC-19 rows have both backend and real-browser tests.
- [ ] Confirm AC-19 browser evidence checks real per-run labels/provenance and does not require or fabricate an unspecified aggregate UI widget.
- [ ] Confirm browser tests use real backend/read models and no static React-only pass.
- [ ] Confirm S1-S8 and all pinned contracts retain prior members/behavior.
- [ ] Confirm no model/UI money, no autonomous action and no ERP write path.
- [ ] Confirm migration is additive, backward compatible and reversible without deleting evidence.
- [ ] Confirm flags-off behavior is unchanged and rollback keeps durable work queryable.
- [ ] Confirm final evidence is tied to the reviewed commit and environment.
