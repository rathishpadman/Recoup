# Real Evidence Local And Preview Handover - 2026-07-02

Status: ready for independent audit and user manual testing. Do not merge to `main` or deploy Production until the user signs off.

## Branch And Deployment Safety

- Current branch: `codex/real-evidence-phased-plan-execution`.
- Current pushed HEAD: `89e8cff Document final preview real evidence proof`.
- `codex/real-evidence-phased-plan-execution` is aligned with `origin/codex/real-evidence-phased-plan-execution`.
- `main` and `origin/main` are aligned; no merge to `main` was performed.
- No Vercel Production deploy or alias promotion was performed.
- Vercel Preview env was populated for Preview only with the required runtime key names; Production env was not changed.
- Final protected Preview tested: `https://recoup-hetylxq9o-hackathonopenai.vercel.app`.

## Commits Added In This Continuation

- `dd50752 Harden Maya real evidence local proof`
- `9a03843 Support protected Vercel preview proof`
- `61e9f18 Tighten protected preview proof helpers`
- `09bf31b Stabilize preview evals auth path`
- `38e44e0 Harden preview governance capture proof`
- `430565d Use server auth for connector governance reads`
- `89e8cff Document final preview real evidence proof`

## Local Verification Passed

| Gate | Result |
| --- | --- |
| `npm.cmd run verify` at `430565d` | PASS: lint, typecheck, 124 Vitest files / 1050 tests, dependency-cruiser, release readiness |
| `npm.cmd run test -- tests/unit/cockpit-data.test.ts tests/unit/evals-finops-surface-source.test.ts tests/unit/real-evidence-capture-media-proof.test.ts` | PASS: 3 files / 17 tests |
| Earlier local Maya browser suite | PASS: `test:e2e:maya-real`, `test:e2e:maya-approval-lifecycle`, `test:e2e:maya-stale-state`, `test:e2e:forensics-sse-live-update`, `test:e2e:shared-surfaces` |
| Chromium a11y | PASS: `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium`; cross-browser intentionally skipped per user instruction |

## Preview Verification Passed

| Gate | Result |
| --- | --- |
| Protected Vercel Preview deploy | PASS: `430565d`, Preview only, no Production alias |
| `npm.cmd run test:e2e:shared-surfaces` against final Preview | PASS |
| `npm.cmd run capture:real-evidence-audit` against final Preview | PASS |

Final preview capture artifact:

- Manifest: `docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json`
- Screenshots: `docs/audit/real-evidence-preview/2026-07-02-430565d/screenshots/`
- Capture summary: 19 captures, 19 HTTP 200 statuses, 19 screenshots, 0 capture errors, 0 console-error routes.
- POD proof: `selected case`, `evidence provenance drawer`, `query answer panel`, and `approval audit panel` each show `EVD-POD-S3-L1`, `RECON-S3-L1`, and a visible same-origin PDF link at `/api/forensics/evidence-documents/EVD-POD-S3-L1` with HTTP 200, `application/pdf`, and positive byte length.

## Evidence Observed

- Maya preview evidence shows real evidence IDs including `EVD-POD-S3-L1` and `EVD-REMIT-S3-L1`.
- Maya preview evidence shows receipt `RECON-S3-L1`.
- POD is not just a numeric row: the final manifest records a visible PDF evidence-document link and load proof.
- SAP source health is still degraded because SAP access is temporarily down; non-SAP proof remains available through the Preview/Supabase-backed evidence path.

## Still Pending Before Production

- User manual testing of the final Preview.
- Independent audit of the committed branch and preview artifact.
- Explicit approval to merge `codex/real-evidence-phased-plan-execution` into `main`.
- Explicit approval to deploy Vercel Production after merge.
- Post-production public-alias capture and `check:real-evidence-proof` after Production deploy. Current clean proof is Preview proof, not Production proof.

## Working Tree Notes

- Final preview artifact is committed in `89e8cff`: `docs/audit/real-evidence-preview/2026-07-02-430565d/`.
- Generated post-implementation screenshots under `docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/` remain modified from local/preview smoke runs and were not staged.
- Untracked `mockups/SaaS-Landing/` remains present and was not staged.
