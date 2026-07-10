# David live email negotiation operator runbook

Status: pre-prod/live-email handoff artifact for `codex/david-dynamic-negotiation`.

This runbook is intentionally no-secret. It may list variable names, endpoints, expected statuses, and table names. Do not paste API keys, webhook secrets, service-role keys, raw customer email bodies, or provider auth headers into chat, docs, screenshots, or logs.

## 1. Current readiness boundary

Run from:

```powershell
cd "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-forensics-cache-coldstart"
npm run check:credit-negotiation-policy
npm run check:credit-negotiation-policy-vector
npm run check:credit-negotiation-live-email
```

Expected before live email work:

- `check:credit-negotiation-policy` returns `ready_for_policy_seed`.
- `check:credit-negotiation-policy-vector` returns `ready_for_policy_vector_search`.
- `check:credit-negotiation-live-email` must return `ready_for_live_email_test`.

Current known blockers as of the latest local run:

- Missing David-specific live email env: `CREDIT_NEGOTIATION_FROM_EMAIL`, `HARBOR_AP_CONTACT_EMAIL`, `RESEND_INBOUND_SIGNING_SECRET`, `RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS`, `RESEND_INBOUND_RATE_LIMIT_WINDOW_MS`, `CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET`, `CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT`, `RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED`.
- Current local shared-auth config is present but not David-send-ready: `RECOUP_EMAIL_SEND_PRINCIPALS` must include the actual David principal used by the route before live David send testing. The global `RECOUP_COCKPIT_HUMAN_PRINCIPAL` may remain Maya if David demo-session auth is configured.
- Maya email data must not be reused as David Harbor recipient data. Maya's setup is only the infrastructure pattern for shared gateway/auth behavior; David live negotiation requires its own `HARBOR_AP_CONTACT_EMAIL` and David-specific negotiation sender/webhook env.
- Owner approved `north-bay.dev` root catch-all safety in chat on 2026-07-10; target local/Vercel env still needs `RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED=approved` encoded before live-email testing.
- Resend has an `email.received` webhook, but it is not registered to the Recoup David inbound route.
- The public Recoup inbound route currently returns `404` at `https://recoup-self-eta.vercel.app/api/credit/negotiation/inbound`; expose/deploy that route before registering live Resend traffic.

## 2. Owner gates before live traffic

Owner gates now recorded:

- P0.0: owner accepted the researched `credit_negotiation_policy` candidate values in chat on 2026-07-10.
- P3.0a: owner confirmed `north-bay.dev` root catch-all can be dedicated to Resend receiving in chat on 2026-07-10.

Do not send live David negotiation email until the approval is encoded in the target environment with `RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED=approved` and `check:credit-negotiation-live-email` returns `ready_for_live_email_test`.

## 3. Required configuration

Configure these without printing values:

```text
CREDIT_NEGOTIATION_FROM_EMAIL
HARBOR_AP_CONTACT_EMAIL
RESEND_INBOUND_SIGNING_SECRET
RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS
RESEND_INBOUND_RATE_LIMIT_WINDOW_MS
CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET
CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT
RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED
RECOUP_COCKPIT_HUMAN_PRINCIPAL
RECOUP_COCKPIT_AUTH_TOKEN
RECOUP_DEMO_SESSION_SECRET
RECOUP_EMAIL_SEND_PRINCIPALS
```

Already required by existing runtime:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
OPENAI_API_KEY
```

Structural expectations enforced by `check:credit-negotiation-live-email`:

- `CREDIT_NEGOTIATION_FROM_EMAIL` and `HARBOR_AP_CONTACT_EMAIL` are valid email-shaped values.
- `RESEND_INBOUND_SIGNING_SECRET` is a `whsec_` base64-style signing secret.
- `RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS`, `RESEND_INBOUND_RATE_LIMIT_WINDOW_MS`, and `CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT` are positive integers.
- `RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED` is exactly `approved`.
- `RECOUP_COCKPIT_AUTH_TOKEN` is present.
- Auth is David-capable through either direct David human principal auth or David demo-session auth.
- `RECOUP_EMAIL_SEND_PRINCIPALS` includes the actual David principal emitted by that path, for example `human:david-lead` for demo David.
- `OPENAI_API_KEY` is present for live inbound counter extraction.

## 4. Resend webhook

Register a Resend webhook for:

```text
email.received
```

Endpoint:

```text
https://<deployed-recoup-app>/api/credit/negotiation/inbound
```

The readiness checker only passes when the webhook event includes `email.received` and the endpoint path is exactly:

```text
/api/credit/negotiation/inbound
```

The same checker also probes the configured public endpoint with redirects disabled. A deployed POST-only route may return `405` to this probe and still pass, but `404` or Vercel/SSO redirect is a blocker because Resend must reach the endpoint directly.

After registering, store the webhook signing secret as `RESEND_INBOUND_SIGNING_SECRET` in the same environment that receives the webhook.

## 5. Contact seed

After env is configured, seed Harbor AP contact:

```powershell
npm run seed:credit-negotiation-contacts
```

Expected:

- It upserts only `credit_account_contacts(account_id='ACC-HAR', role='ap')`.
- It reads the row back from Supabase.
- It returns hash/read-back proof, not the raw email.

If `HARBOR_AP_CONTACT_EMAIL` is missing or malformed, the script must fail closed and no write should be attempted.

## 6. Pre-live verification

Run:

```powershell
npm run check:credit-negotiation-live-email
npm run check:credit-negotiation-policy-vector
npm run test:e2e:david-negotiation
npm run test:e2e:david-v2
npm run verify
```

Required local outcomes:

- Live email readiness returns `ready_for_live_email_test`.
- David negotiation e2e passes with no workbench-open side effects.
- Send-approved-email remains disabled before approval.
- David v2 e2e passes all 4 live LLM account queries with `live_openai_agents`, handoffs, citations, and token usage.
- `npm run verify` is green.

## 7. Live smoke sequence

Use David persona only.

1. Open `/credit`.
2. Select Harbor Foods.
3. Open `Simulate alternatives`.
4. Confirm the top deterministic candidate is visible and cited.
5. Click `Draft counter`.
6. Approve the `credit-v2:negotiation:<orderId>:r<round>` action.
7. Confirm approval receipt is written and UI enables `Send approved email`.
8. Click `Send approved email` once.
9. Confirm `credit_negotiation_sends` has one row for the action with `status='sent'`.
10. Send a test counter email from the configured Harbor AP sender to the plus-address for that round.
11. Confirm `credit_negotiation_inbound_emails` records metadata, `credit_counter_offers` stores parsed cited spans/terms, and the round advances to `countered` or routes to human review.
12. Re-open the workbench and confirm the optimizer re-ranks any grammar-valid complete counter as a cited `counter-offer:<counterOfferId>` candidate.

Abort if:

- Any external send occurs before a David approval receipt.
- Duplicate approval creates a second send row.
- Inbound citations are not exact spans from the received message.
- Any model-emitted dollar amount reaches pricing or decision code.
- Resend webhook signature verification, sender-auth, rate-limit, or retry guard fails open.

## 8. Reset for fresh QA

Reset is local/human QA only and explicitly gated by `RECOUP_CREDIT_NEGOTIATION_RESET_ENABLED=enabled`.

When enabled, use the David workbench reset control or:

```text
POST /api/credit/negotiation/reset
```

It may remove only:

- selected order `credit_counter_offers`
- selected order `credit_negotiation_inbound_emails`
- selected order `credit_negotiation_sends`
- selected order `credit_negotiation_rounds`
- matching `approval_records` with action IDs starting `credit-v2:negotiation:<orderId>:`

It must not delete source rows, policy rows, generic David credit approvals, or ERP-facing state.

## 9. Post-deploy public smoke

After approved prod movement, run:

```powershell
npm run smoke:post-prod
```

It must cover:

- Landing tabs/buttons.
- Maya 8 scenarios, cache behavior, live query, and voice bridge unless explicitly skipped.
- David 4 account live query scenarios.
- David backend-vs-Supabase proof.
- David Signals In expanded by default.
- Public `/credit` warmed load under `RECOUP_POST_PROD_CREDIT_WARM_LOAD_BUDGET_MS` default `5000`.

If public `/credit` exceeds the warmed-load budget, stop the release path and troubleshoot using the Maya cache/slow-load pattern before continuing.
