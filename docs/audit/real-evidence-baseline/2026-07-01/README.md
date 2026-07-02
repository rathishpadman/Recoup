# 2026-07-01 Real Evidence Baseline

Purpose: preserve the production frontend and repo baseline before implementing the real-evidence reconciliation pipeline from `docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md`.

## Capture Scope

| Item | Value |
|---|---|
| Repo | `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup` |
| Branch | `codex/real-evidence-phased-plan-execution` |
| Source commit | `e3e4a55d751cbcb3ea2df4e282c3d4cb6011ac02` |
| Runtime diff at Phase 0 start | Empty for `src`, `cockpit`, `config`, `scripts`, `tests`, `render.yaml`, `package.json`, and `docs/supabase-memory-schema.sql` |
| Public alias | `https://recoup-self-eta.vercel.app` |
| Vercel deployment | `dpl_GmRnve57izaS1GndBn2N1WBjTxRv` |
| Deployment target/status | `production` / `Ready` |
| Browser | Playwright Chromium |
| Viewport | `1440x1100` |
| Supabase DML | None |
| Render/Vercel deploy | None |
| Secret handling | No token, cookie, auth header, API key, service-role key, or env value stored |

## Artifacts

| Artifact | Path |
|---|---|
| Manifest | `docs/audit/real-evidence-baseline/2026-07-01/manifest.json` |
| Screenshots | `docs/audit/real-evidence-baseline/2026-07-01/screenshots/` |
| Plan | `docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md` |

## Screenshot Inventory

| Screenshot | Route / state | Persona | Baseline finding |
|---|---|---:|---|
| `00-public-landing.png` | `/` | public | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `01-login-entry.png` | `/login?loginId=Maya` | public | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `02-maya-workspace.png` | `/forensics/shadcn` | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `03-forensics-worklist.png` | Worklist state | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `04-forensics-selected-case.png` | Selected case state | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `05-evidence-provenance-drawer.png` | Evidence tab state | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `06-query-answer-panel.png` | Query dock state | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `07-approval-audit-panel.png` | Audit tab state | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `08-cfo-view-if-live.png` | `/cfo` | CFO | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `09-david-credit-risk-if-live.png` | `/credit` | David | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `10-trace-view-if-live.png` | `/governance/trace` | CFO | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `11-evals-finops-if-live.png` | `/governance/evals-finops` | CFO | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `12-forensics-classic-if-live.png` | `/forensics` | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `13-run-workspace-if-live.png` | `/run` | Maya | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media; console recorded `ERR_CONNECTION_REFUSED` |
| `14-david-command-if-live.png` | `/credit/command` | David | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `15-governance-overview-if-live.png` | `/governance` -> `/governance/agents` | CFO | HTTP 200 redirect; no `EVD-*`; no `RECON-*`; no POD media |
| `16-governance-agents-if-live.png` | `/governance/agents` | CFO | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media |
| `17-governance-connectors-if-live.png` | `/governance/connectors` | CFO | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media; production Server Components error baseline |
| `18-governance-memory-if-live.png` | `/governance/memory` | CFO | HTTP 200; no `EVD-*`; no `RECON-*`; no POD media; production Server Components error baseline |

## Baseline Verdict

The production frontend is live enough to render the public, Maya, David, CFO, governance trace, and governance evals-finops routes, but the Forensics evidence experience is not yet document-backed in the way the new plan requires.

The selected-case and evidence-tab screenshots show source row labels and record IDs such as SAP/POD/proxy labels, but the manifest records zero canonical `EVD-*` evidence IDs, zero `RECON-*` reconciliation receipt IDs, and no loaded POD PDF/image/media artifact. This is the baseline gap the implementation must move: post-implementation screenshots must show real canonical evidence IDs, reconciliation receipt IDs, provenance, and a loaded or safely linked document/media artifact when a cited decision depends on a document.

## Route Correction

The shared route inventory uses the actual production routes:

- `/cfo`
- `/credit`
- `/credit/command`
- `/forensics`
- `/run`
- `/governance`
- `/governance/agents`
- `/governance/connectors`
- `/governance/memory`
- `/governance/trace`
- `/governance/evals-finops`

There is no top-level `/trace` or `/evals-finops` route in the current Next.js app.

## Pre-Existing Route Health Notes

The expanded Phase 0 inventory records current production route issues instead of treating them as new implementation regressions:

- `/run` logged `Failed to load resource: net::ERR_CONNECTION_REFUSED`.
- `/governance/connectors` rendered a production Server Components error message.
- `/governance/memory` logged the same production Server Components error while still rendering the memory page.

Future shared-route regression checks must not make these worse, and any route that becomes part of the real-evidence acceptance path must either render cleanly or carry an explicit release blocker.
