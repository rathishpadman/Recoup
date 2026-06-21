# Cockpit UI Route Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Recoup cockpit from a compressed one-page anchor dashboard into route-scoped, design-system-faithful operational workspaces with real navigation, correct typography, and browser-verified UX.

**Architecture:** Add a Supabase-backed demo login boundary, then split the cockpit into a shared role-aware shell, a typed REST/SSE data boundary, and route-specific workbench pages. Top-level navigation becomes real Next App Router navigation; governance tabs become route links instead of local-only state. Styling stays token-driven through `tokens.css` and the O2C v3.1 "Editorial Enterprise" system.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Postgres RPC, `pgcrypto` password hashing, Phosphor icons, CSS custom-property tokens, Vitest, Playwright CLI/browser QA.

---

## Current Checkpoint

- Earlier governed runtime, connector readiness, realtime, docs, and tests are committed locally as `8fe6afe` (`Harden governed runtime readiness`).
- Services were stopped before this plan.
- Browser smoke was performed before this plan:
  - `http://127.0.0.1:3000` rendered the cockpit but showed Next dev HMR websocket resets in console.
  - `http://localhost:3000` rendered the cockpit cleanly in Playwright snapshot.
  - The connector readiness tab was clicked and showed `sap-odata` plus non-SAP `blocked schema required` states.
- That was functional browser smoke, not a senior visual/fidelity audit. The compact one-page UX problem remains real.

## Skills And Plugins To Use

- `ui-ux-pro-max`: design-system and UX rules. The local query selected a data-dense dashboard pattern, but final visual direction must reconcile with the repo's O2C v3.1 tokens: light-first, petrol teal, warm-cool neutrals, Newsreader only at editorial edges, IBM Plex Sans for interface text, IBM Plex Mono only for numbers and IDs.
- `build-web-apps:frontend-app-builder`: redesign workflow and agency-grade visual bar. If Image Gen is available at execution time, create concept mockups for the route shell and primary route screens before coding.
- `imagegen`: concept mockups only, not production UI text. If the built-in image generation tool is unavailable in this runtime, stop and ask whether to proceed with code-native wireframes from the O2C design system.
- `build-web-apps:frontend-testing-debugging`: rendered frontend QA loop, console checks, interaction proof, desktop plus mobile checks.
- `playwright`: terminal browser fallback when the in-app Browser runtime is unavailable.
- Supabase docs/MCP: use Supabase-backed credential storage safely. The plan uses server-side Supabase Postgres/RPC with hashed demo passwords, not plaintext password storage or client-side service-role keys.
- `superpowers:subagent-driven-development`: after approval, use subagents task-by-task with spec review and code-quality review.
- `multi_agent_v1` plugin tools: spawn worker/reviewer agents after approval; do not spawn implementation agents before this plan is approved.

## Product Direction

The cockpit is an operational tool, not a landing page. The first screen should be usable work, not a long stacked demo.

Role entry flow:

| Login user ID | Demo password | Persona | Default route | Allowed routes |
| --- | --- | --- | --- | --- |
| `Maya` | `Welcome#123` | Maya Patel, deduction recovery lead | `/forensics` | `/forensics`, `/run` |
| `david` | `Welcome#123` | David Kim, credit lead | `/credit` | `/credit` |
| `CFO` | `Welcome#123` | CFO / executive reviewer | `/cfo` | `/cfo`, `/governance/agents`, `/governance/connectors`, `/governance/memory`, `/governance/trace` |

Credential storage rule:

- The login form accepts the exact user IDs above, not email addresses.
- Supabase stores the demo credential records in a `recoup_demo_users` table with `login_id`, role metadata, default route, allowed routes, and a `pgcrypto` hash of `Welcome#123`.
- The database must never store `Welcome#123` as plaintext after seeding.
- The browser must never receive `SUPABASE_SERVICE_ROLE_KEY`, password hashes, or raw login verification details.
- The Next API verifies credentials server-side through a Supabase RPC and then sets a signed, HTTP-only demo session cookie.

Route map:

- `/` redirects unauthenticated users to `/login`; authenticated users go to their role default route.
- `/login`: role login screen with user ID and password fields plus persona hints for Maya, david, and CFO.
- `/forensics`: Maya's deduction recovery workbench. Summary strip, worklist table, selected line evidence, next-best-action, approval controls.
- `/run`: live run trace, SSE replay, retrieval status, realtime query controls.
- `/credit`: David's credit arbitration cockpit. Composite score, partial hold decision, sentinel/arbitration blockers, approval queue.
- `/cfo`: executive readout. Compact board metrics, open dependencies, audit posture.
- `/governance/agents`: agent graph and execution boundaries.
- `/governance/connectors`: SAP/Supabase connector readiness.
- `/governance/memory`: scoped memory state.
- `/governance/trace`: audit trace events.

Design rules:

- No cockpit route renders without a valid demo role session, except `/login`.
- Sidebar navigation is role-scoped; users should not see routes outside their persona.
- No top-level hash navigation for major surfaces.
- No single page containing all major surfaces.
- No card-in-card nesting.
- No marketing hero layout.
- No raw hex in cockpit CSS; use `tokens.css`.
- Use Phosphor icons consistently.
- Use Newsreader only for micro/editorial edge labels and CFO/executive moments.
- Use IBM Plex Sans for work surfaces, nav, tables, buttons, labels.
- Use IBM Plex Mono for amounts, IDs, timestamps, scores.
- Keep top-level route content within one meaningful viewport where possible; below-fold content should be supporting detail, not every other product surface.

## File Structure

Create:

- `docs/supabase-demo-login-schema.sql`: Supabase DDL for `recoup_demo_users` and `verify_recoup_demo_login`.
- `cockpit/app/login/page.tsx`: login route.
- `cockpit/app/login/login-form.tsx`: client login form.
- `cockpit/app/api/demo-login/route.ts`: server-side credential verification and session cookie creation.
- `cockpit/app/api/demo-logout/route.ts`: clears the demo session cookie.
- `cockpit/app/demo-auth.ts`: server-only role session, cookie signing, and route authorization helpers.
- `cockpit/app/cockpit-data.ts`: typed API fetch helpers and cockpit read-model interfaces.
- `cockpit/app/cockpit-shell.tsx`: shared role-aware shell, sidebar, route title, topbar action slot.
- `cockpit/app/forensics/page.tsx`: forensics route.
- `cockpit/app/run/page.tsx`: run trace route.
- `cockpit/app/credit/page.tsx`: credit route.
- `cockpit/app/cfo/page.tsx`: CFO route.
- `cockpit/app/governance/page.tsx`: redirect to `/governance/agents`.
- `cockpit/app/governance/layout.tsx`: governance route frame.
- `cockpit/app/governance/governance-nav.tsx`: route-aware governance tab links.
- `cockpit/app/governance/agents/page.tsx`: agents route.
- `cockpit/app/governance/connectors/page.tsx`: connectors route.
- `cockpit/app/governance/memory/page.tsx`: memory route.
- `cockpit/app/governance/trace/page.tsx`: trace route.
- `tests/invariants/cockpit-role-auth.test.ts`: role login, cookie, and route-scope tripwires.
- `tests/invariants/cockpit-route-architecture.test.ts`: route and nav architecture tripwires.
- `tests/unit/cockpit-demo-auth.test.ts`: demo auth helper tests.

Modify:

- `.env.example`: add optional `RECOUP_DEMO_SESSION_SECRET=` for cookie signing; fallback to existing server-only cockpit auth token is allowed only in local demo.
- `config/env.ts`: validate `RECOUP_DEMO_SESSION_SECRET` as optional server-only config.
- `cockpit/app/page.tsx`: replace the current all-in-one page with a role-aware redirect.
- `cockpit/app/governance-tabs.tsx`: remove or shrink after governance routes replace local tab state.
- `cockpit/app/styles.css`: rework shell, typography, route layouts, tables, responsive behavior.
- `tests/invariants/cockpit-no-business-logic.test.ts`: update from anchor/single-page expectations to route-scoped expectations.
- `tests/unit/cockpit.test.ts`: preserve read-model expectations; update only route/display assumptions.

Do not modify:

- `src/core/**`, `src/agents/**`, money logic, arbitration constants, connector business logic, or approval semantics.
- Runtime model IDs or governed config values.
- Supabase service-role exposure rules: service role stays server-only; never add `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

## Task 0: Add Supabase-Backed Role Login First

**Files:**
- Create: `docs/supabase-demo-login-schema.sql`
- Create: `cockpit/app/login/page.tsx`
- Create: `cockpit/app/login/login-form.tsx`
- Create: `cockpit/app/api/demo-login/route.ts`
- Create: `cockpit/app/api/demo-logout/route.ts`
- Create: `cockpit/app/demo-auth.ts`
- Create: `tests/invariants/cockpit-role-auth.test.ts`
- Create: `tests/unit/cockpit-demo-auth.test.ts`
- Modify: `.env.example`
- Modify: `config/env.ts`

- [ ] **Step 1: Write failing role-auth invariant tests**

Create `tests/invariants/cockpit-role-auth.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cockpit role-based demo auth", () => {
  it("adds a login route and server-only demo auth boundary", () => {
    expect(existsSync("cockpit/app/login/page.tsx")).toBe(true);
    expect(existsSync("cockpit/app/login/login-form.tsx")).toBe(true);
    expect(existsSync("cockpit/app/api/demo-login/route.ts")).toBe(true);
    expect(existsSync("cockpit/app/api/demo-logout/route.ts")).toBe(true);
    expect(existsSync("cockpit/app/demo-auth.ts")).toBe(true);
  });

  it("stores demo credentials in Supabase with hashed passwords only", () => {
    const sql = readFileSync("docs/supabase-demo-login-schema.sql", "utf8");

    expect(sql).toContain("create table if not exists recoup_demo_users");
    expect(sql).toContain("password_hash");
    expect(sql).toContain("crypt(");
    expect(sql).toContain("verify_recoup_demo_login");
    expect(sql).toContain("'Maya'");
    expect(sql).toContain("'david'");
    expect(sql).toContain("'CFO'");
    expect(sql).toContain("Welcome#123");
    expect(sql).not.toContain("plaintext_password");
    expect(sql).not.toContain("password_plain");
  });

  it("keeps Supabase service role and password hashes out of client code", () => {
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");
    const loginRoute = readFileSync("cockpit/app/api/demo-login/route.ts", "utf8");
    const demoAuth = readFileSync("cockpit/app/demo-auth.ts", "utf8");

    expect(loginForm).toContain('"use client"');
    expect(loginForm).toContain("/api/demo-login");
    expect(loginForm).toContain("Maya");
    expect(loginForm).toContain("david");
    expect(loginForm).toContain("CFO");
    expect(loginForm).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(loginForm).not.toContain("password_hash");
    expect(loginRoute).toContain("verify_recoup_demo_login");
    expect(demoAuth).toContain("httpOnly");
    expect(demoAuth).toContain("sameSite");
  });

  it("defines role-scoped route access", () => {
    const auth = readFileSync("cockpit/app/demo-auth.ts", "utf8");

    expect(auth).toContain('loginId: "Maya"');
    expect(auth).toContain('loginId: "david"');
    expect(auth).toContain('loginId: "CFO"');
    expect(auth).toContain('defaultRoute: "/forensics"');
    expect(auth).toContain('defaultRoute: "/credit"');
    expect(auth).toContain('defaultRoute: "/cfo"');
    expect(auth).toContain('"/governance/connectors"');
  });
});
```

- [ ] **Step 2: Run the failing auth tests**

```powershell
npm.cmd run test -- tests\invariants\cockpit-role-auth.test.ts
```

Expected: FAIL because the login route, demo auth helper, API routes, and Supabase SQL do not exist yet.

- [ ] **Step 3: Add Supabase demo login schema**

Create `docs/supabase-demo-login-schema.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists recoup_demo_users (
  login_id text primary key,
  display_name text not null,
  role text not null check (role in ('maya', 'david', 'cfo')),
  default_route text not null,
  allowed_routes text[] not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into recoup_demo_users (
  login_id,
  display_name,
  role,
  default_route,
  allowed_routes,
  password_hash
) values
  ('Maya', 'Maya Patel', 'maya', '/forensics', array['/forensics', '/run'], crypt('Welcome#123', gen_salt('bf'))),
  ('david', 'David Kim', 'david', '/credit', array['/credit'], crypt('Welcome#123', gen_salt('bf'))),
  ('CFO', 'CFO', 'cfo', '/cfo', array['/cfo', '/governance/agents', '/governance/connectors', '/governance/memory', '/governance/trace'], crypt('Welcome#123', gen_salt('bf')))
on conflict (login_id) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  default_route = excluded.default_route,
  allowed_routes = excluded.allowed_routes,
  password_hash = excluded.password_hash,
  updated_at = now();

create or replace function verify_recoup_demo_login(p_login_id text, p_password text)
returns table (
  login_id text,
  display_name text,
  role text,
  default_route text,
  allowed_routes text[]
)
language sql
security definer
set search_path = public
as $$
  select
    u.login_id,
    u.display_name,
    u.role,
    u.default_route,
    u.allowed_routes
  from recoup_demo_users u
  where u.login_id = p_login_id
    and u.password_hash = crypt(p_password, u.password_hash);
$$;

revoke all on function verify_recoup_demo_login(text, text) from public;
```

Note: the seed SQL contains the shared demo password only so Supabase can hash it during seed. The table stores `password_hash`, not plaintext.

- [ ] **Step 4: Add server-only demo auth helper**

Create `cockpit/app/demo-auth.ts` with:

- `type DemoRole = "maya" | "david" | "cfo"`
- `type DemoSession`
- `roleHomeRoute`
- `roleAllowedRoutes`
- `signDemoSession`
- `verifyDemoSession`
- `requireDemoSession`
- `requireRouteAccess`
- `createDemoSessionCookie`
- `clearDemoSessionCookie`

Implementation rules:

- Use Node `crypto.createHmac("sha256", secret)` for session signing.
- Use `cookies()` from `next/headers`.
- Cookie name: `recoup_demo_session`.
- Cookie flags: `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `path: "/"`.
- Signing secret: `RECOUP_DEMO_SESSION_SECRET`, falling back to `RECOUP_COCKPIT_AUTH_TOKEN` for local demo only.
- If no valid session exists, redirect to `/login`.
- If a role opens a route outside `allowedRoutes`, redirect to their `defaultRoute`.

- [ ] **Step 5: Add login and logout API routes**

`cockpit/app/api/demo-login/route.ts` must:

- Parse `{ loginId, password }`.
- Reject unknown login IDs before hitting Supabase.
- Call Supabase REST RPC:
  - URL: `${SUPABASE_URL}/rest/v1/rpc/verify_recoup_demo_login`
  - Method: `POST`
  - Headers: `apikey` and `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  - Body: `{ p_login_id: loginId, p_password: password }`
- Return `401` for no match.
- Set the signed demo session cookie for a match.
- Return `{ defaultRoute, displayName, role }`.
- Never return password, password hash, service role key, or raw Supabase response.

`cockpit/app/api/demo-logout/route.ts` must clear the cookie and return `{ ok: true }`.

- [ ] **Step 6: Add login UI**

`cockpit/app/login/page.tsx` renders an editorial but restrained login screen:

- Brand: `Recoup`
- Heading: `Choose your recovery workspace`
- User ID field
- Password field
- Submit button
- Persona helper rows:
  - `Maya` -> Deduction Forensics
  - `david` -> Credit Arbitration
  - `CFO` -> Executive Readout

`cockpit/app/login/login-form.tsx` posts to `/api/demo-login`, shows inline errors, and routes to `defaultRoute` on success. It can include persona buttons that prefill user ID only; it must not prefill or expose the password.

- [ ] **Step 7: Update env validation**

`.env.example`:

```env
RECOUP_DEMO_SESSION_SECRET=
```

`config/env.ts`:

```ts
RECOUP_DEMO_SESSION_SECRET: z.string().min(1).optional(),
```

- [ ] **Step 8: Run focused auth tests**

```powershell
npm.cmd run test -- tests\invariants\cockpit-role-auth.test.ts tests\unit\cockpit-demo-auth.test.ts tests\invariants\runtime-config.test.ts
```

Expected after implementation: PASS.

## Task 1: Add Route Architecture Tests First

**Files:**
- Create: `tests/invariants/cockpit-route-architecture.test.ts`
- Modify: `tests/invariants/cockpit-no-business-logic.test.ts`

- [ ] **Step 1: Write failing route architecture tests**

Add a test file that asserts real routes exist, the root redirects, and the shell nav no longer uses hash anchors for top-level workspaces.

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "cockpit/app/login/page.tsx",
  "cockpit/app/forensics/page.tsx",
  "cockpit/app/run/page.tsx",
  "cockpit/app/credit/page.tsx",
  "cockpit/app/cfo/page.tsx",
  "cockpit/app/governance/page.tsx",
  "cockpit/app/governance/agents/page.tsx",
  "cockpit/app/governance/connectors/page.tsx",
  "cockpit/app/governance/memory/page.tsx",
  "cockpit/app/governance/trace/page.tsx"
];

describe("cockpit route architecture", () => {
  it("splits major cockpit surfaces into real App Router pages", () => {
    for (const routeFile of routeFiles) {
      expect(existsSync(routeFile), `${routeFile} should exist`).toBe(true);
    }
  });

  it("does not keep top-level product surfaces as hash anchors on one page", () => {
    const root = readFileSync("cockpit/app/page.tsx", "utf8");
    const shell = readFileSync("cockpit/app/cockpit-shell.tsx", "utf8");

    expect(root).toContain("requireDemoSession");
    expect(root).toContain("defaultRoute");
    expect(shell).toContain('href="/forensics"');
    expect(shell).toContain('href="/run"');
    expect(shell).toContain('href="/credit"');
    expect(shell).toContain('href="/cfo"');
    expect(shell).toContain('href="/governance/agents"');
    expect(shell).toContain('href="/governance/connectors"');
    expect(shell).not.toContain('href="#credit"');
    expect(shell).not.toContain('href="#cfo"');
    expect(shell).not.toContain('href="#connectors"');
  });
});
```

- [ ] **Step 2: Update existing cockpit boundary tests**

Change assertions that currently require hash anchors:

```ts
expect(page).toContain("requireDemoSession");
expect(page).toContain("defaultRoute");
expect(shell).toContain('href="/forensics"');
expect(shell).toContain('href="/credit"');
expect(shell).toContain('href="/cfo"');
expect(page).not.toContain('href="#credit"');
expect(page).not.toContain('href="#cfo"');
```

Keep the existing negative checks for `decimal.js`, `src/core`, and `runRiskMeshClosedLoop`.

- [ ] **Step 3: Run the failing tests**

```powershell
npm.cmd run test -- tests\invariants\cockpit-route-architecture.test.ts tests\invariants\cockpit-no-business-logic.test.ts
```

Expected: FAIL because the route files and `cockpit-shell.tsx` do not exist yet.

## Task 2: Extract Typed Data Boundary

**Files:**
- Create: `cockpit/app/cockpit-data.ts`
- Modify: `cockpit/app/page.tsx`
- Modify: route pages created in later tasks

- [ ] **Step 1: Move interfaces and fetch helpers into `cockpit-data.ts`**

The data module owns REST read-model types and `fetchJson`. It must not import `src/core`, `decimal.js`, or agent runtime code.

```ts
const apiBaseUrl = process.env.RECOUP_API_URL ?? "http://127.0.0.1:4317";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Cockpit model failed for ${path}: ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

export async function fetchForensicsModel(): Promise<ForensicsCockpitModel> {
  return fetchJson<ForensicsCockpitModel>("/forensics");
}

export async function fetchCreditModel(): Promise<CreditCockpitModel> {
  return fetchJson<CreditCockpitModel>("/credit");
}

export async function fetchCfoModel(): Promise<CfoSummaryCockpitModel> {
  return fetchJson<CfoSummaryCockpitModel>("/cfo");
}

export async function fetchTraceModel(): Promise<TraceCockpitModel> {
  return fetchJson<TraceCockpitModel>("/trace");
}

export async function fetchMemoryModel(): Promise<MemorySummaryCockpitModel> {
  return fetchJson<MemorySummaryCockpitModel>("/memory");
}

export async function fetchAgentGraphModel(): Promise<AgentGraphCockpitModel> {
  return fetchJson<AgentGraphCockpitModel>("/agents");
}

export async function fetchConnectorReadinessModel(): Promise<ConnectorReadinessCockpitModel> {
  return fetchJson<ConnectorReadinessCockpitModel>("/connectors");
}
```

- [ ] **Step 2: Run boundary tests**

```powershell
npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts
```

Expected after implementation: PASS.

## Task 3: Build Shared Route Shell

**Files:**
- Create: `cockpit/app/cockpit-shell.tsx`
- Modify: `cockpit/app/page.tsx`
- Modify: `cockpit/app/styles.css`

- [ ] **Step 1: Replace root page with route handoff**

```ts
import { redirect } from "next/navigation";
import { getDemoSessionOrNull } from "./demo-auth.ts";

export default async function Page() {
  const session = await getDemoSessionOrNull();

  redirect(session?.defaultRoute ?? "/login");
}
```

Root behavior:

- unauthenticated -> `/login`
- Maya -> `/forensics`
- david -> `/credit`
- CFO -> `/cfo`

- [ ] **Step 2: Create `CockpitShell` with role-scoped real route links**

Every protected route must call `requireRouteAccess(routePath)` and pass the returned session into `CockpitShell`. The shell filters navigation by `session.allowedRoutes`, so Maya does not see Credit/CFO/Governance routes, david does not see Maya/CFO routes, and CFO sees CFO plus Governance routes.

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import type { DemoSession } from "./demo-auth.ts";

type ActiveRoute = "forensics" | "run" | "credit" | "cfo" | "agents" | "connectors" | "memory" | "trace";

const navGroups = [
  {
    label: "Operate",
    items: [
      { key: "forensics", href: "/forensics", label: "Forensics" },
      { key: "run", href: "/run", label: "Run trace" }
    ]
  },
  {
    label: "Resolve",
    items: [
      { key: "credit", href: "/credit", label: "Credit" },
      { key: "cfo", href: "/cfo", label: "CFO" }
    ]
  },
  {
    label: "Govern",
    items: [
      { key: "agents", href: "/governance/agents", label: "Agents" },
      { key: "connectors", href: "/governance/connectors", label: "Connectors" },
      { key: "memory", href: "/governance/memory", label: "Memory" },
      { key: "trace", href: "/governance/trace", label: "Trace" }
    ]
  }
] satisfies Array<{ label: string; items: Array<{ href: string; key: ActiveRoute; label: string }> }>;

export function CockpitShell({
  active,
  children,
  kicker,
  session,
  title,
  subtitle,
  toolbar
}: Readonly<{
  active: ActiveRoute;
  children: ReactNode;
  kicker: string;
  session: DemoSession;
  title: string;
  subtitle: string;
  toolbar?: ReactNode;
}>) {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Recoup navigation">
        <div className="brand-block">
          <div className="brand">Recoup</div>
          <span>Deduction recovery mesh</span>
        </div>
        <nav>
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => session.allowedRoutes.includes(item.href));

            return visibleItems.length === 0 ? null : (
              <NavGroup active={active} items={visibleItems} key={group.label} label={group.label} />
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span>Signed in</span>
          <strong>{session.displayName}</strong>
          <small>External actions require human approval.</small>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="micro">{kicker}</p>
            <h1>{title}</h1>
            <p className="topbar-copy">{subtitle}</p>
          </div>
          {toolbar}
        </header>
        {children}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Run route architecture tests**

```powershell
npm.cmd run test -- tests\invariants\cockpit-route-architecture.test.ts
```

Expected after implementation: PASS.

## Task 4: Split Operate Routes

**Files:**
- Create: `cockpit/app/forensics/page.tsx`
- Create: `cockpit/app/run/page.tsx`
- Modify: `cockpit/app/styles.css`
- Keep: `cockpit/app/approval-controls.tsx`, `cockpit/app/run-stream.tsx`, `cockpit/app/realtime-query-controls.tsx`

- [ ] **Step 1: Implement `/forensics` as the primary workbench**

The route calls `requireRouteAccess("/forensics")`, passes the returned Maya session into `CockpitShell`, and fetches only `/forensics`. It renders:

- summary KPI strip
- worklist table
- selected line next-best-action
- draft action and approval controls
- evidence pack
- action inbox

It does not render credit, CFO, governance, or trace surfaces. A david or CFO session must be redirected to that role's default route before this page renders.

- [ ] **Step 2: Implement `/run` as the trace and realtime workspace**

The route calls `requireRouteAccess("/run")`, passes the returned Maya session into `CockpitShell`, and fetches `/forensics` for retrieval copy only if needed plus `/trace` for trace context. It renders:

- `RunStream`
- trace summary
- `RealtimeQueryControls`
- retrieval status

It does not render the worklist table unless the design concept explicitly calls for a compact trace context rail. A david or CFO session must be redirected to that role's default route before this page renders.

- [ ] **Step 3: Run focused tests**

```powershell
npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-route-architecture.test.ts
```

Expected after implementation: PASS.

## Task 5: Split Resolve Routes

**Files:**
- Create: `cockpit/app/credit/page.tsx`
- Create: `cockpit/app/cfo/page.tsx`
- Modify: `cockpit/app/styles.css`

- [ ] **Step 1: Implement `/credit`**

The route calls `requireRouteAccess("/credit")`, passes the returned David session into `CockpitShell`, and renders only David's credit arbitration surface:

- customer context
- composite score and release ratio
- proposed release/back-order amounts
- sentinel/arbitration blockers
- terms proposal
- approval inbox
- cited record IDs

- [ ] **Step 2: Implement `/cfo`**

The route calls `requireRouteAccess("/cfo")`, passes the returned CFO session into `CockpitShell`, and renders only the executive readout:

- board metric strip
- audit posture
- open dependencies
- what changed
- AI insight

Use Newsreader only for the executive/editorial edge, not for dense metric labels.

- [ ] **Step 3: Run focused tests**

```powershell
npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-route-architecture.test.ts
```

Expected after implementation: PASS.

## Task 6: Replace Governance Local Tabs With Routes

**Files:**
- Create: `cockpit/app/governance/page.tsx`
- Create: `cockpit/app/governance/layout.tsx`
- Create: `cockpit/app/governance/governance-nav.tsx`
- Create: `cockpit/app/governance/agents/page.tsx`
- Create: `cockpit/app/governance/connectors/page.tsx`
- Create: `cockpit/app/governance/memory/page.tsx`
- Create: `cockpit/app/governance/trace/page.tsx`
- Modify or delete if unused: `cockpit/app/governance-tabs.tsx`

- [ ] **Step 1: Redirect `/governance`**

```ts
import { redirect } from "next/navigation";

export default function GovernancePage() {
  redirect("/governance/agents");
}
```

- [ ] **Step 2: Create route-aware governance nav**

Use links, not local-only `useState`, so each tab has its own URL.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const governanceTabs = [
  { href: "/governance/agents", label: "Agent operations" },
  { href: "/governance/connectors", label: "Connector readiness" },
  { href: "/governance/memory", label: "Memory" },
  { href: "/governance/trace", label: "Trace" }
];

export function GovernanceNav() {
  const pathname = usePathname();

  return (
    <div className="governance-tabs" role="tablist" aria-label="Governance views">
      {governanceTabs.map((tab) => (
        <Link aria-selected={pathname === tab.href} href={tab.href} key={tab.href} role="tab">
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Render one governance domain per page**

Each page fetches only its matching endpoint:

- agents -> `/agents`
- connectors -> `/connectors`
- memory -> `/memory`
- trace -> `/trace`

Each governance page calls `requireRouteAccess()` with its own route. Only the CFO role can enter governance routes in this demo plan.

- [ ] **Step 4: Run route tests**

```powershell
npm.cmd run test -- tests\invariants\cockpit-route-architecture.test.ts tests\invariants\cockpit-no-business-logic.test.ts
```

Expected after implementation: PASS.

## Task 7: Rework Visual System And Responsive Layout

**Files:**
- Modify: `cockpit/app/styles.css`
- Modify: route page markup as needed

- [ ] **Step 1: Convert CSS from page-stack styling to route workspace styling**

Keep these concepts:

```css
.shell {
  background: var(--bg-canvas);
  display: grid;
  grid-template-columns: var(--sidebar-expanded) minmax(0, 1fr);
  min-height: 100vh;
}

.workspace {
  margin-inline: auto;
  max-width: 1480px;
  min-width: 0;
  padding: var(--space-5);
  width: 100%;
}

.route-grid {
  display: grid;
  gap: var(--space-4);
}

.route-grid.forensics {
  grid-template-columns: minmax(560px, 1.05fr) minmax(420px, 0.95fr);
}
```

- [ ] **Step 2: Correct typography discipline**

Use:

- `var(--font-ui)` for work surfaces, nav, table cells, labels, buttons.
- `var(--font-editorial)` only for `.micro`, brand, and executive edges.
- `var(--font-mono)` only for `.amount`, `code`, IDs, and scores.
- `font-variant-numeric: tabular-nums` for amounts and metrics.
- no `text-transform: uppercase`.
- no negative viewport-scaled font sizing.

- [ ] **Step 3: Remove compact one-page visual stacking**

Delete or stop using the old root-level patterns:

- `.surface-grid` as a below-fold dump of Credit/CFO.
- `.governance-surface` attached under all other routes.
- anchor scroll assumptions on `.topbar` and `#selected-line` for top-level navigation.

- [ ] **Step 4: Responsive checks baked into CSS**

Support:

- 1440px desktop: full route workspace.
- 1024px tablet/low desktop: sidebar remains, content stacks cleanly.
- 768px tablet: sidebar collapses to top navigation or compact rail.
- 375px mobile: no horizontal page overflow; tables get internal scroll only.

## Task 8: Browser QA And Verification

**Files:**
- No committed QA artifacts by default.

- [ ] **Step 1: Run repo gates**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run depcruise
```

Expected: all pass.

- [ ] **Step 2: Start services**

```powershell
npm.cmd run dev:api
npm.cmd run dev:cockpit
```

- [ ] **Step 3: Browser verification**

Use Browser/IAB first if the runtime is exposed. If it is not available, use Playwright CLI and record the fallback reason.

Minimum route checks:

- `http://localhost:3000/login`
- `http://localhost:3000/forensics`
- `http://localhost:3000/run`
- `http://localhost:3000/credit`
- `http://localhost:3000/cfo`
- `http://localhost:3000/governance/connectors`

Required checks per `frontend-testing-debugging`:

- page identity: URL and title
- not blank: meaningful DOM snapshot
- no framework overlay
- console health: no relevant app errors
- screenshot evidence
- interaction proof: login as `Maya` routes to `/forensics`; logout returns to `/login`; login as `david` routes to `/credit`; login as `CFO` routes to `/cfo`; sidebar nav click changes URL; governance tab link changes URL for CFO; approval controls still show reason-gated states

- [ ] **Step 3A: Role access browser checks**

Use the shared password `Welcome#123` for all three demo users.

Required checks:

- Unauthenticated `/forensics`, `/credit`, `/cfo`, and `/governance/connectors` redirect to `/login`.
- `Maya` login lands on `/forensics`, shows Forensics/Run nav only, and direct `/credit` redirects back to `/forensics`.
- `david` login lands on `/credit`, shows Credit nav only, and direct `/forensics` redirects back to `/credit`.
- `CFO` login lands on `/cfo`, shows CFO/Governance nav, and `/governance/connectors` renders connector readiness.

- [ ] **Step 4: Responsive browser pass**

Verify at:

- desktop: 1440 x 900
- low desktop: 1024 x 768
- mobile: 375 x 812

Failure conditions:

- major route still renders all other major surfaces
- role login is bypassable or unauthenticated routes render protected content
- role sidebar shows routes outside the current persona
- nav links only scroll within the same page
- text overlaps, clips, or looks browser-default
- table creates full-page horizontal scroll
- console app errors
- missing focus states or inaccessible icon buttons

- [ ] **Step 5: Final full gate**

```powershell
npm.cmd run verify
```

Expected: lint, typecheck, all tests, depcruise pass.

## Task 9: Commit The UI Rework

**Files:**
- All modified cockpit route/layout/test files.

- [ ] **Step 1: Confirm status and verify output**

```powershell
git status --short
npm.cmd run verify
```

- [ ] **Step 2: Commit locally**

```powershell
git add .env.example config cockpit tests docs/supabase-demo-login-schema.sql docs/superpowers/plans/2026-06-21-cockpit-ui-route-rework.md
git commit -m "Rework cockpit route UX"
```

No push unless explicitly requested.

## Subagent Execution Plan

After approval, use subagents sequentially to avoid `styles.css` and route-file conflicts:

1. **Design auditor subagent**: read `docs/O2C_Collections_Design_System_v3.md`, `tokens.css`, current cockpit files, and this plan. Return a concrete route-by-route visual checklist. No code edits.
2. **Auth worker subagent**: implement Task 0. Owned files: Supabase demo login SQL, login route, demo auth helper, login/logout API routes, auth tests, `.env.example`, `config/env.ts`.
3. **Route worker subagent**: implement Tasks 1-6 except final CSS polish. Owned files: route files, shell, data boundary, route tests.
4. **Visual polish worker subagent**: implement Task 7. Owned files: `cockpit/app/styles.css` plus markup tweaks needed for class names.
5. **QA verifier subagent**: run Task 8 in browser/Playwright and report screenshots, console, role-login checks, and responsive findings. No source edits unless explicitly assigned a narrow fix.
6. **Spec reviewer subagent** after each worker: confirm the result matches this plan and the O2C design system.
7. **Code-quality reviewer subagent** after spec approval: check for route regressions, auth/session leakage, accessibility issues, CSS fragility, and accidental business-logic leakage.

## Acceptance Criteria

- `http://localhost:3000` sends unauthenticated users to `/login`.
- Demo users are stored in Supabase with hashed passwords: `Maya`, `david`, and `CFO`, all using `Welcome#123`.
- `Maya` login lands on `/forensics` and only exposes Maya routes.
- `david` login lands on `/credit` and only exposes David routes.
- `CFO` login lands on `/cfo` and exposes CFO plus Governance routes.
- Each sidebar item changes route, not just scroll position.
- Governance tabs are URL-backed routes.
- Forensics, Run trace, Credit, CFO, and Governance no longer appear as one continuous page.
- Typography matches O2C v3.1 token intent.
- Browser QA covers desktop and mobile, with console checks.
- `npm.cmd run verify` passes.
- UI rework is committed locally and not pushed unless requested.
