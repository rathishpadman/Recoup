# CLAUDE.md

**Read `AGENTS.md` first.** It is the build protocol for this repo and it governs. This file
adds only Claude Code operational knowledge that `AGENTS.md` does not cover.

Precedence is unchanged: `INVARIANTS.md` > `RECONCILIATION_LEDGER.md` > referenced SDD section >
`AGENTS.md` > this file > model judgment.

## The rules that get broken most often

From `AGENTS.md`, repeated because these are the ones that slip:

- **Plan first, then execute.** Propose the stepwise plan and wait before writing code.
- **Failing test before implementation** for any rule, guard, score, or decision-producing code.
  Prove red before green — stash the implementation and confirm the test actually fails.
- **Surgical diffs.** Only the files named for the session; within them, only task-relevant
  lines. No refactor-in-passing.
- **Done = the check passes.** `npm run lint && npm run typecheck && npm run test`.
  Full guard: `npm run verify`.

## Contract and invariant tests

`tests/invariants/` asserts on component source text and structure — helper names, testids, JSX
shape. Changing a component often breaks them.

**Never bulk-edit these to make a change pass.** Each assertion encodes a deliberate decision.
Change them one at a time, and say in the PR why that specific guarantee no longer applies. If
you find yourself rewriting three or more to land one change, the change is probably wrong.

The heaviest are `maya-shadcn-qa-contract.test.ts`, `maya-shadcn-boundary.test.ts`,
`cockpit-no-business-logic.test.ts`, and `maya-reference-workspace-contract.test.ts`.

## Running the cockpit locally

`.env.local` at the repo root points at **production Supabase** with a service-role key. Two
consequences:

- **Never start the API with `startCockpitApiRuntime`** (that is what `npm run dev:api` uses). It
  starts the source-health poller, which polls immediately and writes production
  `recoup_source_health_snapshots`. Use `createCockpitApi` instead, as `tests/e2e/*` do.
- **Redirect the read-model cache** before any local run: set
  `RECOUP_SUPABASE_READ_MODEL_TABLE` to a table name that does not exist. Every load and upsert
  then fails closed and nothing is written.

For a browser session, mint the Maya demo cookie in-process with `signDemoSession` from
`cockpit/app/demo-auth.ts`, the way `tests/e2e/maya-real-backend-e2e.ts` does. Do not type into
the login form.

Route note: the shadcn workbench is `/forensics/shadcn`. The landing route is Overview, so click
`maya-header-work-items-link` before opening a case.

## After deploying a read-model or evidence-pack shape change

The Maya work-item cache is TTL-only and will **not** self-invalidate on a shape change. Once the
deploy is live:

```sql
delete from recoup_cockpit_read_models
where model_key like 'maya:forensics:work-item:%:v3' or model_key = 'maya:forensics:v1';
```

**PostgREST returns 403 on DELETE for this table** — use the Supabase MCP `execute_sql`, not the
REST API. Skipping this purge once left line grouping broken on cached cases while the tests were
all green, so verify afterwards rather than assuming.

Presentation-only changes (client components) do not need the purge.

## Cash Application worker (N5 split) — do not skip

The workflow worker is deliberately split across two phases, and Phase 7B must
not be started until both Phase 7A negative cases pass independently.

`src/services/workflowWorker.ts` is **Phase 7A only**. It contains no
claim-capable path, and `workflow-worker-disabled-no-mutation.test.ts` asserts
that by reading its source. Adding claiming, leasing, a timer or an UPDATE to
that file breaks the test on purpose — the split is the safety property, not
an ordering preference.

Two gates must both hold before any command is claimed:

1. `RECOUP_CASH_WORKER_ENABLED` exactly `true`, or the factory constructs
   nothing at all. Configuration is not even read when the flag is absent.
2. A valid `cash_run_control`, checked **before** the claim RPC, never after.

Both refusal paths must leave persisted state byte-equivalent; the tests prove
it with a sha256 snapshot taken either side of the refused start.

Cash flags stay off during any baseline run. The demo path additionally needs
`RECOUP_CASH_REHEARSAL_ENABLED` and `RECOUP_CASH_DEMO_POLICY_ENABLED`, both of
which gate assumed, non-ratified values and must never be set in production.

## Open work

`docs/handoff/maya-workstream-b-and-followups.md` carries the Workstream B plan and two open UI
findings, each with its own failing-test-first plan and the contract assertions that constrain
the area.
