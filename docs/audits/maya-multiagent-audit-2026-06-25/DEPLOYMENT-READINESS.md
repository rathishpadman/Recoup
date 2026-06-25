# Deployment Readiness — Vercel + Supabase + Render

**Date:** 2026-06-25 · **Mode:** static review, no changes
**Targets:** Vercel (Next 16 cockpit) · Render (Express API, port 4317) · Supabase (Postgres + RPC)

## Verdict

**🟡 Not yet one-click deployable — ~70% there.** Both `render.yaml` and `vercel.json` exist and the app is fully env-driven and fail-closed, which is a strong base. But there are **4 hard blockers** and several config gaps that will cause a first deploy to fail or come up non-functional. None are deep code problems; they're deployment-wiring and ordering issues. Budget ~half a day plus a test deploy.

---

## 🔴 Blockers (deploy will fail / app non-functional)

### B1 — Render health check depends on Supabase being seeded first
`GET /healthz` returns **503 until** Supabase has the release-owner `recoup_config` run-control rows (`cockpitApi.ts` `/healthz` → `loadRunControlConfig` → Supabase `loadActive()`). `render.yaml` sets `healthCheckPath: /healthz`, so **Render will mark the service unhealthy and the deploy will never go live** until Supabase is fully provisioned *and* the API has the Supabase env at first boot.
→ **Order of operations matters:** provision + seed Supabase → set Render env → then deploy. Document this; consider a `/healthz` that reports "degraded" vs hard-503 for boot.

### B2 — CORS allowlist defaults to localhost only
`defaultAllowedCockpitOrigins = ["http://127.0.0.1:3000","http://localhost:3000"]`. Unsafe-method requests from a cross-origin are rejected with **403** (`cockpitApi.ts:252-255`). The Vercel cockpit calls the Render API for `/approval`, `/forensics/query`, realtime — all **POST**. Without `RECOUP_COCKPIT_ALLOWED_ORIGINS` set to the Vercel production URL **and** preview URLs, every write call 403s.
→ Set `RECOUP_COCKPIT_ALLOWED_ORIGINS=https://<your-vercel-domain>` (comma-list incl. preview domains).

### B3 — Vercel monorepo packaging risk (no `cockpit/package.json`)
The Next app lives in `cockpit/` but there is **no `cockpit/package.json`** — the whole repo is one npm package. `vercel.json` uses `buildCommand: npm run build:cockpit` + `outputDirectory: cockpit/.next`. Vercel's Next.js builder expects the app at the project root (or a Root Directory that contains its own `package.json`). With only `outputDirectory` set, **route handlers (`app/api/*`), server components, and middleware may not be packaged as functions** — you can get a static-only or broken deploy.
→ Must be validated with a real test deploy. Likely fixes: set Vercel **Root Directory** appropriately, or add a `cockpit/package.json`, or restructure. This is the single most uncertain item.

### B4 — Required env missing from `render.yaml`
Notably **`RECOUP_MEMORY_BACKEND`** is absent. If it isn't `supabase`, `POST /approval` fails closed with 503 "Durable audit trail is unavailable" (`cockpitApi.ts:941-956`) — the HITL approval beat breaks. Also missing: `RECOUP_COCKPIT_HUMAN_PRINCIPAL`, `RECOUP_DATA_MODE`, `MCP_PORT`, `RECOUP_MCP_CLIENT_PRINCIPAL/CAPABILITIES`, `OPENAI_EVIDENCE_VECTOR_STORE_ID`.
→ Add `RECOUP_MEMORY_BACKEND=supabase` (+ the others as needed).

---

## 🟠 Vercel env (set in dashboard — none are in `vercel.json`)

The cockpit fail-closes without these; set all before first use:

| Var | Why |
|---|---|
| `RECOUP_API_URL` | Server components + `/api/*` proxy → Render API (`cockpit-data.ts:1`, all proxy routes) |
| `NEXT_PUBLIC_RECOUP_API_URL` | Browser `EventSource('/run')` in `run-stream.tsx:5` (client-side, must be public) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `/api/demo-login` calls Supabase RPC directly; cockpit reads |
| `RECOUP_DEMO_SESSION_SECRET` | Signs the demo session cookie (`demo-auth.ts`) |
| `RECOUP_COCKPIT_AUTH_TOKEN`, `RECOUP_COCKPIT_HUMAN_PRINCIPAL` | Backend-read auth headers forwarded from the Maya page |
| `RECOUP_SUPABASE_MEMORY_TABLE` | Memory table name |

⚠️ `SUPABASE_SERVICE_ROLE_KEY` on Vercel is a **service-role secret in the frontend project** — acceptable because it's only used in server-side route handlers, but scope it to server env (not `NEXT_PUBLIC_`) and never log it.

---

## 🟡 Supabase provisioning (manual — no migrations/CI)

Four SQL files must be applied in order; there is **no `supabase/migrations` dir or CLI config**, so this is manual:

1. `create extension pgcrypto` (in `supabase-demo-login-schema.sql`)
2. `docs/supabase-memory-schema.sql` — `recoup_memory_records` (RLS forced, service-role only)
3. `docs/supabase-demo-login-schema.sql` — `recoup_demo_users` + `verify_recoup_demo_login` RPC + seed
4. `docs/Tools_data/supabase_schema.sql` + `docs/Tools_data/seed_data.sql` — source/evidence + **release-owner `recoup_config`** (required for B1 healthz)

Notes:
- Demo password `Welcome#123` is committed (bcrypt-seeded) in `supabase-demo-login-schema.sql` — fine for a demo, but it's a public credential; rotate if the repo is shared.
- Seed `default_route` for Maya is `/forensics` (legacy); audited route is `/forensics/shadcn`. Confirm the prod landing route matches the demo you show.

---

## 🟡 Render specifics

- **Runtime is `tsx` (TypeScript, not compiled):** `start:api = tsx src/services/cockpitApi.ts`; `build:api = typecheck only` (no emit). `tsx` is a **devDependency**. Render keeps `node_modules` from build and default install includes devDeps, so it works — but it's fragile. Safer: move `tsx` to `dependencies` or add a real compile step.
- **API binds all interfaces** (`listen(port, cb)` — no host) ✅ Render-compatible.
- **MCP server is NOT in `render.yaml`** and binds `127.0.0.1` (`server.ts:389`). Current demo doesn't need it deployed (MCP is off the runtime path). **If you adopt ADR-001/SPEC-001 (agents via MCP), you must add the MCP service and bind `0.0.0.0`.**
- `NODE_VERSION=22` ✅ matches `engines: >=22 <26`.

---

## 🟢 What's already good

- Fully **env-driven**, **fail-closed**, **no secrets in source** (only the demo bcrypt seed in SQL).
- `render.yaml` health check, Node version, and `sync:false` secret placeholders are set up correctly.
- `vercel.json` declares framework/install/build cleanly.
- API binds `0.0.0.0`; CORS, correlation IDs, constant-time auth all production-shaped.
- The app **degrades safely**: missing sources produce explicit 503 `missingSource` states rather than crashes.

---

## Pre-deploy checklist (in order)

1. [ ] Provision Supabase; apply all 4 SQL files; seed `recoup_config` (release-owner run-control) — **required or healthz 503s (B1)**.
2. [ ] Verify lockfile committed and in sync (`vercel.json` uses `npm ci`).
3. [ ] Render: set **all** env incl. `RECOUP_MEMORY_BACKEND=supabase`, `RECOUP_DATA_MODE` (omit→real-backend), Supabase creds, auth token, demo secret (B4).
4. [ ] Render: confirm `tsx` resolves at runtime (or move to deps).
5. [ ] Deploy Render API; confirm `GET /healthz` → 200.
6. [ ] Vercel: set `RECOUP_API_URL` + `NEXT_PUBLIC_RECOUP_API_URL` → Render URL; Supabase creds; demo secret; auth token/principal.
7. [ ] **Render: set `RECOUP_COCKPIT_ALLOWED_ORIGINS` to the Vercel prod (and preview) domains (B2).**
8. [ ] Vercel: **test deploy** and confirm `app/api/*` route handlers and server components run as functions (not static) — validates B3.
9. [ ] Smoke test: login as Maya → `/forensics/shadcn` loads → click row → run a query → approval gate → confirm no 403/503.
10. [ ] (If using MCP narrative) add MCP to Render, bind `0.0.0.0`, set MCP env.

## Bottom line

The solution is **architecturally deploy-ready** (env-driven, fail-closed, configs present) but **not yet wired for a clean first deploy**. The four blockers — healthz/Supabase ordering, CORS origins, Vercel monorepo packaging, and the missing `RECOUP_MEMORY_BACKEND` — will each break the demo if not handled. Do a **dry-run deploy to staging** before relying on it for judging; B3 (Vercel packaging) is the one I'd validate first because it's the least certain.
