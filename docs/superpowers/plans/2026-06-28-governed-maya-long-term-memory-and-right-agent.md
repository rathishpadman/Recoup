# Governed Maya Long-Term Memory and Right Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add env-gated governed Maya long-term recall and move the floating Recoup Agent launcher to the right-side rail without changing deterministic decision behavior.

**Architecture:** Long-term recall is explicit, cited, scoped, trusted, and advisory-only. It may be supplied to Maya query orchestration only when `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled`, and it never replaces source evidence, deterministic basis, HITL gates, or code-computed dollars. The launcher change is presentation-only and must be verified in browser E2E on desktop and mobile widths.

**Tech Stack:** Node 22, TypeScript, Express, Next.js App Router, React, Vitest, Playwright.

---

## Scope

- Implement long-term Maya case recall helpers and query recall context.
- Keep memory writes and reads additive, env-gated, and fail-closed.
- Move the Recoup Agent launcher from bottom-left to the right-side rail.
- Add focused unit, invariant, and browser coverage.
- Run local verification before commit; push; run production browser E2E after deployment.

## Non-Negotiables

- Code computes every dollar; memory must not contain or compute dollar values.
- Humans gate external actions; memory must not approve, reject, dispatch, or route actions.
- Every recall record must cite record IDs and deterministic basis.
- Unknown or unsafe memory fails closed and is omitted.
- Memory recall is advisory-only and must not replace source-backed evidence or deterministic query basis.
- Existing behavior is unchanged when `RECOUP_MAYA_QUERY_MEMORY_RECALL` is unset or disabled.

## Tasks

- [ ] **Task 1: Long-term Maya recall helpers**
  - Modify `src/memory/session.ts`.
  - Add `writeMayaCaseRecallMemory`, `readMayaCaseRecallMemories`, and `buildMayaQueryMemoryRecallContext`.
  - Add tests in `tests/unit/memory.test.ts`.
  - Add invariant coverage in `tests/invariants/memory-contract.test.ts`.

- [ ] **Task 2: Env-gated query recall wiring**
  - Modify `config/env.ts`, `src/services/cockpitApi.ts`, and `src/services/forensicsQuerySession.ts`.
  - Add `RECOUP_MAYA_QUERY_MEMORY_RECALL` as an optional gate.
  - Load trusted recall records only for the selected line/session/case.
  - Pass a compact advisory recall block into the live query prompt only when enabled.
  - Add tests in `tests/unit/cockpit-api.test.ts`.

- [ ] **Task 3: Move Recoup Agent launcher to the right-side rail**
  - Modify `cockpit/app/styles.css`.
  - Keep `RecoupAgentLauncher` semantics unchanged in `cockpit/components/maya/maya-forensics-surface.tsx` unless a test requires a data attribute or accessible label.
  - Update `tests/e2e/cockpit-premium-e2e.ts` to assert right-edge placement.
  - Update `tests/invariants/maya-shadcn-qa-contract.test.ts` to prevent left-position regression.

- [ ] **Task 4: Local verification**
  - Run focused memory/API/invariant tests.
  - Run `npm.cmd run typecheck`.
  - Run `npm.cmd run verify`.
  - Run `npm.cmd run test:e2e -- --maya-shadcn-only`.

- [ ] **Task 5: Review and fix**
  - Run governance/spec review.
  - Run code-quality review.
  - Run UI/browser review.
  - Resolve all Critical/Important findings before commit.

- [ ] **Task 6: Commit, push, and production browser E2E**
  - Stage only intentional source/docs/test files.
  - Commit after local gates are green.
  - Push to the deploy branch/main as appropriate.
  - Verify Vercel deployment readiness and Render health.
  - Run production Maya browser E2E/query journey after push.

## Test Commands

```powershell
npm.cmd run test -- tests/unit/memory.test.ts tests/unit/cockpit-api.test.ts tests/invariants/memory-contract.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run typecheck
npm.cmd run verify
npm.cmd run test:e2e -- --maya-shadcn-only
```

## Production Test Commands

```powershell
$env:RECOUP_QA_COMMIT=(git rev-parse HEAD).Trim()
$env:RECOUP_PROD_APP_URL='https://recoup-self-eta.vercel.app'
$env:RECOUP_PROD_API_URL='https://recoup-api.onrender.com'
npm.cmd exec tsx scripts/runMayaProdQa.ts
```
