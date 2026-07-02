# Real Evidence Local Testing Handover - 2026-07-02

Status: local verification paused for independent audit.

## Branch And Deployment Safety

- Current branch: `codex/real-evidence-phased-plan-execution`.
- `main` and `origin/main` are aligned at `e3e4a55 Fix Vercel connector cache freshness`.
- Current branch is 16 commits ahead of `origin/main`.
- Today's local fixes are uncommitted working-tree changes.
- No merge to `main` was performed.
- No Vercel production deploy or alias promotion was performed.
- Vercel read-only check showed latest Production deployment `dpl_GmRnve57izaS1GndBn2N1WBjTxRv`, created 2026-07-01 07:16:10 IST. The 2026-07-02 deployment observed was Preview, not Production.

## Local Runtime For Manual Test

- API: `http://127.0.0.1:4317`
- Cockpit: `http://127.0.0.1:3000`
- Health check at pause: API `/healthz` returned `200`; cockpit `/login` returned `200`.
- Runtime mode: `RECOUP_RECONCILIATION_MODE=canary`, `RECOUP_RECONCILIATION_CANARY_LINES=S3-L1`.
- Logs: `tmp/local-test-logs/`.

## Fixes Completed In This Pass

- Fixed stale work-item detail cache after human approval changes by validating cached approval receipts against current approval memory before using the Next route cache.
- Included approval receipt memory in Forensics source/freshness fingerprints so `/api/forensics/refresh` and SSE-visible page hashes change after real approval writes.
- Updated SSE live-update E2E to perform a real approval reset/write and verify visible receipt-hash/model-version update in the open Maya page.
- Scoped POD preview locators to the Maya evidence dossier where duplicate POD links are valid.
- Rebalanced Maya Worklist table widths so real work item/customer labels stay compact at 1280px.
- Removed the `Local focus` badge from the Overview Case Concentration row only. The selected row remains stateful; Audit-return local-focus copy remains for the return-worklist flow.
- Hardened the Chromium evidence UI accessibility script for duplicate POD links and TSX helper leakage in Playwright browser evaluation.

## Local Verification Passed

| Gate | Result |
| --- | --- |
| `npm.cmd run verify` | PASS: lint, typecheck, 124 Vitest files / 1041 tests, dependency-cruiser, release readiness |
| `npm.cmd run test -- tests/unit/realtime-next-routes.test.ts tests/unit/source-freshness.test.ts tests/unit/cockpit-api.test.ts` | PASS: 3 files / 170 tests |
| `npm.cmd run test:reconciliation:matrix` | PASS: 5 files / 18 tests |
| `npm.cmd run test:e2e -- --maya-shadcn-only` | PASS: Maya Beat 1-12 screenshots regenerated |
| `npm.cmd run test:e2e:maya-real` | PASS: 20 line items, 8 work items, 5 query work items, 50 backend trace rows |
| `npm.cmd run test:e2e:maya-approval-lifecycle` | PASS: approve, modify, reject, duplicate 409, relogin persistence, admin reset |
| `npm.cmd run test:e2e:maya-stale-state` | PASS |
| `npm.cmd run test:e2e:forensics-sse-live-update` | PASS |
| `npm.cmd run test:e2e:shared-surfaces` | PASS |
| `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium` | PASS; cross-browser intentionally skipped per user instruction |

## Evidence Observed

- Maya real-backend query cited `EVD-POD-S3-L1`, `EVD-REMIT-S3-L1`, `DOC-S3-L1`, `RECON-S3-L1`, `POD-S3-L1`, and `REMIT-S3-L1`.
- SAP source health is currently degraded as expected from the temporary SAP outage: `SAP OData` showed `Probe failed`.
- Non-SAP sources in the Maya real-backend run were ready: TPM, 3PL POD, Bureau, Remittance / EDI, Contract Repo, and MCP.
- The Overview row for S3-L1 no longer shows `Local focus` in local browser verification.

## Still Blocked Or Pending

- `npm.cmd run verify:real-evidence-visual` is still blocked/failing because the post-implementation manifest and approved full visual capture are not complete; the generated report is `docs/audit/real-evidence-comparison/2026-07-01-visual-diff.json`.
- `npm.cmd run check:real-evidence-proof` is still blocked by missing `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED`, missing `RECOUP_PREVIEW_URL`, missing post-implementation manifest, and failed visual-diff/POD-media release proof routes.
- Full cross-browser a11y was skipped per user instruction; only Chromium was verified.
- Production/preview proof is still pending. Do not promote to Vercel Production until user manual testing and explicit approval are complete.

## Working Tree Notes

- Modified screenshots were regenerated under `docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/`.
- Untracked `mockups/SaaS-Landing/` remains present and should be reviewed before staging.
- Current changes should be audited before commit/push.
