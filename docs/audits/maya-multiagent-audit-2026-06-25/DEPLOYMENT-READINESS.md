# Deployment Readiness Runbook - Vercel + Render + Supabase

**Date:** 2026-06-25  
**Targets:** Vercel cockpit, Render API, Supabase data plane, loopback Recoup MCP gateway  
**Status:** Deployable only after this runbook is followed in order.

This is the deployment instruction document for future Codex sessions. Do not treat plugin installation as provider authentication. Verify Vercel auth, Render MCP workspace access, Git push state, and production smoke tests every time.

## Current Architecture

| Layer | Host | Runtime | Notes |
|---|---|---|---|
| Cockpit UI | Vercel | Next.js from `cockpit/` via root `vercel.json` | Uses server routes and server components; validate with real deploy. |
| API | Render | Node 22, `npm run start:api` | Public API surface on `PORT=4317`; health is `/healthz`. |
| MCP data plane | Render API process | Loopback Streamable HTTP server started by Maya live query path | No separate public MCP service is required for the first production deploy. Leave `RECOUP_MCP_URL` unset unless intentionally deploying a separate MCP service. |
| Supabase | Existing project | Postgres + RPC + source tables | Must be seeded before Render health can pass. |

The live Maya query path now attaches an OpenAI Agents SDK `MCPServerStreamableHttp` client to the Forensics agent. When `RECOUP_MCP_URL` is unset, the API starts an authenticated loopback MCP gateway with request-bound selected evidence scope. Agents do not receive SAP or Supabase credentials; the gateway holds source credentials and returns governed results.

## Provider Reachability Checks

Run these before deploying:

```powershell
vercel whoami --token $env:VERCEL_TOKEN
codex mcp list
```

Expected:

- Vercel returns the account name.
- `codex mcp list` shows `render` enabled.
- Render MCP `get_selected_workspace` returns the intended workspace. In the verified setup, the workspace was `Hackathon`.

Do not paste provider tokens or application secrets into chat, docs, tests, screenshots, or logs.

## Pre-Deploy Requirements

| Requirement | Required Evidence |
|---|---|
| Exact deploy commit pushed | `git status -sb` clean after commit, `git push origin <branch>` succeeds, and Render + Vercel both deploy the same pushed branch/commit SHA. |
| Supabase release owner inputs seeded | `recoup_config` contains the active release owner-input row set required by the cockpit API: `run_control`, `release_eval_label_manifest`, `intent_eval_labels`, and `arbitration_eval_labels`, each with `config_version=1`, valid hashes, and human approval. Run `npm.cmd run verify:release`, then require deployed `/healthz -> 200`. |
| Render env complete | Render service has all variables from `render.yaml`; secrets are set as provider env, not committed. |
| Vercel env complete | Vercel deploy gets API URL, Supabase server env, demo secret, and backend auth env. |
| CORS aligned | Render `RECOUP_COCKPIT_ALLOWED_ORIGINS` includes the final Vercel deployment URL exactly. |
| MCP proof retained | Production Maya query trace includes `query.answer` tool end with `sap_odata`. |

## Render API Configuration

Use the Git-backed Render service defined by `render.yaml`.

Render service:

- Name: `recoup-api`
- Runtime: `node`
- Build: `npm run build:api`
- Start: `npm run start:api`
- Health check: `/healthz`
- Node: `22`
- Port: `4317`
- Source: same pushed branch/commit SHA used by the Vercel cockpit deploy

Nonsecret Render constants are committed in `render.yaml`:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `PORT` | `4317` |
| `RECOUP_MEMORY_BACKEND` | `supabase` |
| `RECOUP_SUPABASE_MEMORY_TABLE` | `recoup_memory_records` |
| `RECOUP_DATA_MODE` | `real-backend` |
| `RECOUP_COCKPIT_HUMAN_PRINCIPAL` | `human:maya-lead` |
| `RECOUP_MCP_CLIENT_CAPABILITIES` | `read` |
| `RECOUP_MCP_CLIENT_PRINCIPAL` | `human:maya-lead` |

Render secrets/provider-specific values must be set in Render, not committed:

| Key | Source |
|---|---|
| `OPENAI_API_KEY` | `.env.local` / owner secret |
| `OPENAI_EVIDENCE_VECTOR_STORE_ID` | `.env.local` / owner secret |
| `SUPABASE_URL` | `.env.local` / Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` / Supabase project |
| `RECOUP_COCKPIT_ALLOWED_ORIGINS` | Final Vercel URL, exact comma-separated origins |
| `RECOUP_COCKPIT_AUTH_TOKEN` | `.env.local` / owner secret |
| `RECOUP_DEMO_SESSION_SECRET` | `.env.local` / owner secret |
| `RECOUP_MCP_AUTH_TOKEN` | `.env.local` / owner secret or generated deployment secret |
| `SAP_ODATA_BASE_URL` | `.env.local` / SAP sandbox |
| `SAP_ODATA_CLIENT_ID` | `.env.local` / SAP sandbox |
| `SAP_ODATA_CLIENT` | `.env.local` / SAP sandbox |
| `SAP_ODATA_USERID` | `.env.local` / SAP sandbox |
| `SAP_ODATA_TOKEN_URL` | `.env.local` / SAP sandbox |
| `SAP_ODATA_SCOPE` | `.env.local` / SAP sandbox |
| `SAP_ODATA_TENANT` | `.env.local` / SAP sandbox |
| `SAP_ODATA_CLIENT_SECRET` | `.env.local` / SAP sandbox |

Do not set `RECOUP_MCP_URL` for the initial production deploy. That keeps the MCP server private to the Render API process.

Supabase must be prepared before Render health can pass. Apply or verify the seed block in `docs/supabase-memory-schema.sql` for the active release owner-input rows, then run `npm.cmd run verify:release`. A local fixture pass is not enough for production readiness; the deployed Render `/healthz` endpoint is the final source-health gate.

## Vercel Cockpit Configuration

Deploy from the repo root using `vercel.json`.

Vercel build contract:

- Framework: `nextjs`
- Install: `npm ci`
- Build: `npm run build:cockpit`
- Output: `cockpit/.next`

Vercel runtime/build env:

| Key | Value |
|---|---|
| `RECOUP_API_URL` | Render API URL |
| `NEXT_PUBLIC_RECOUP_API_URL` | Render API URL |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `RECOUP_DEMO_SESSION_SECRET` | demo-session signing secret |
| `RECOUP_COCKPIT_AUTH_TOKEN` | backend read/auth token |
| `RECOUP_COCKPIT_HUMAN_PRINCIPAL` | `human:maya-lead` |
| `RECOUP_SUPABASE_MEMORY_TABLE` | `recoup_memory_records` |

The Vercel monorepo packaging shape must be validated by the deployed site, because `cockpit/` has no separate `package.json`. A successful deploy is not enough; verify API route handlers and server components at the deployed URL.

## Deployment Sequence

1. Run local proof pack:

```powershell
npm.cmd run verify
npm.cmd run test:e2e:maya-real
npm.cmd run test -- tests/invariants/deployment-readiness.test.ts
```

2. Commit and push the exact branch:

```powershell
git status -sb
git add .
git commit -m "Deploy Maya MCP data-plane release"
git push origin <branch>
git rev-parse HEAD
```

3. Create or update the Render `recoup-api` service from the pushed branch and record the deployed commit SHA.

4. Set Render env vars. Use provider APIs/CLI; never print secret values.

5. Wait for Render deploy live. Verify:

```text
GET <render-url>/healthz -> 200
GET <render-url>/forensics with backend auth headers -> 200
GET <render-url>/connectors with backend auth headers -> 200
```

6. Deploy Vercel cockpit from the same pushed branch/commit with the Render API URL in `RECOUP_API_URL` and `NEXT_PUBLIC_RECOUP_API_URL`.

7. Update Render `RECOUP_COCKPIT_ALLOWED_ORIGINS` to include the exact Vercel deployment URL. Redeploy or restart Render if the environment update does not take effect immediately.

8. Run production smoke tests from the Vercel URL:

| Step | Expected Result |
|---|---|
| Open `/login` | Login page renders with no framework error. |
| Login as Maya | Session cookie created; route reaches Maya cockpit. |
| Open `/forensics/shadcn` | Worklist, source readiness, and selected case render from backend. |
| Source readiness | SAP OData and MCP show connected/ready when backend is configured. |
| Run Maya query | Response includes cited answer and deterministic basis. |
| Agent trace | `Forensics Investigator -> query.answer -> sap_odata -> Recovery Drafter`. |
| Approval gate | Human approval remains required; no external action executes automatically. |
| Logs | No 403 CORS, no 503 source/config failure, no secret values printed. |

## Rollback

- Vercel: redeploy/promote the previous successful deployment.
- Render: roll back to the previous deploy from the Render service deploy list.
- Emergency safe mode: remove live OpenAI/SAP env or set `RECOUP_COCKPIT_ALLOWED_ORIGINS` to an empty/nonmatching value to fail closed on unsafe writes.

## Known Risks

| Risk | Mitigation |
|---|---|
| Render and Vercel deploy different commits | Push a clean branch first, record `git rev-parse HEAD`, and configure both providers to deploy that branch/commit. |
| Supabase release owner-input rows absent or invalid | Render `/healthz` returns 503; seed/verify the four active `recoup_config` release owner-input rows, `config_version=1`, hashes, and human approval before treating production smoke as failed for app code. |
| Vercel route packaging mismatch | Validate `/api/*` routes and server components on the deployed URL. |
| CORS mismatch after Vercel deploy | Update `RECOUP_COCKPIT_ALLOWED_ORIGINS` with the exact Vercel URL. |
| Render free/starter cold start | Run smoke test once before the demo and keep service warm. |
| Public MCP exposure | Do not set `RECOUP_MCP_URL` and do not create a public MCP service for the initial deploy. |

## Completion Criteria

Deployment is complete only when:

- Git branch is pushed.
- Render API deploy is live and `/healthz` is 200.
- Vercel cockpit deploy is live.
- Render CORS includes the final Vercel origin.
- Production browser smoke test passes through Maya query.
- The final report includes a step-by-step table with command/deploy/test evidence and URLs.
