# Maya Reference Workspace Rollout - Execution Status

Date: 2026-07-06
Branch: `codex/maya-reference-workspace-plan`
Production gate: blocked until explicit production merge/deploy approval.

## Scope

This checklist covers the Maya workspace reference rework, the V2 case-detail feedback in `docs/audits/2026-07-04-case-detail-blueprint.html`, `docs/audits/2026-07-04-case-detail-mockup.html`, and `docs/audits/2026-07-05-claude-consolidated-feedback-round4.md`.

## Phase Status

| Phase | Status | Evidence |
| --- | --- | --- |
| Overview hero and four summary cards | DONE | Cards derive from `model.worklist`; invariant/unit/E2E coverage in `tests/unit/maya-workspace-derived.test.ts`, `tests/e2e/maya-real-backend-e2e.ts`. |
| Ready sources pill | DONE | `buildSourcePillState` unit coverage; red/green state derives from `connectors.sourceTiles.statusTone`. |
| Deduction cases list and sort header | DONE | Rows render real customer, segment, amount, line count, verdict, routing, and reason; E2E compares rendered rows to backend. |
| Recoup Copilot rename and dock treatment | DONE | User-visible `Recoup Agent` copy removed from Maya components; dock idle/running/complete state covered in unit and E2E assertions. |
| Worklist reason lines | DONE | Worklist and detail consume `workItem.reason`/receipt-derived reason; no lorem/static reason text. |
| Case detail V2 layout | DONE | Single page sections, collapsed investigation drawer, one audit/provenance drawer, evidence fact cards, verdict basis, and gated outcome surface implemented. |
| Evidence and raw-ID cleanup | DONE | Primary evidence rows are business labels; raw IDs/hashes move behind details disclosures. |
| Approval dialog CDX-23/24 | DONE | Duplicate decisions become terminal/informational; simplified dialog retains one basis string and details disclosure. |
| Email send and readback | DONE | `/api/email` posts through Resend, requires committed human approval, stores signed status token, and supports delivery-status readback. |
| Realtime voice transcript proof | DONE | Realtime snapshot includes speech and assistant transcript fields; state sequence is covered by realtime browser tests. |
| Cases/Evidence nav removal | DONE | `MayaSurfaceSection` is `overview | worklist | approvals`; old render branches removed. |
| Backend changes before testing | DONE | New backend surface is limited to `/api/email`; related MCP/service-layer tools are gated and tested. |
| Subagent/reviewer gate | DONE | Reviewer subagent checked the reconciliation strategy and warned against broad temp-to-root mirroring; changes were integrated with an explicit allowlist approach. |
| Visual/browser verification | DONE | Current browser run writes 12 Maya beat screenshots under `output/playwright/e2e/maya-beat-*.png`; raw output is ignored by Git. |
| Production movement | NOT_STARTED | No merge, push to main, Vercel production deploy, provider env update, or public alias smoke has been run. |

## Verification Commands

The following commands are the required closeout gate:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:maya-approval-lifecycle
```

## Notes

- Automated approval lifecycle E2E leaves live email disabled unless `RECOUP_E2E_LIVE_EMAIL=enabled`; this prevents accidental sends while still testing the real `/api/email` wiring and draft-body validation.
- Real email send remains available in the app after human approval when Resend and recipient env vars are configured.
- Raw Playwright screenshots are stored under `output/playwright/e2e/`; the current 12 Maya beat files are local evidence, not source-controlled release artifacts.
- Production approval remains gated even though local implementation and tests are ready.
