import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cockpitHumanPrincipalByDemoRole } from "../../config/cockpitHumanPrincipals.js";

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

  it("keeps demo login verification callable only from the server-side Supabase role", () => {
    const sql = readFileSync("docs/supabase-demo-login-schema.sql", "utf8");

    expect(sql).toContain("revoke all on function verify_recoup_demo_login(text, text) from public");
    expect(sql).toContain("grant execute on function verify_recoup_demo_login(text, text) to service_role");
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+verify_recoup_demo_login\(text,\s*text\)\s+to\s+anon/iu);
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+verify_recoup_demo_login\(text,\s*text\)\s+to\s+authenticated/iu
    );
  });

  it("keeps Supabase service role and password hashes out of client code", () => {
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");
    const loginRoute = readFileSync("cockpit/app/api/demo-login/route.ts", "utf8");
    const demoAuth = readFileSync("cockpit/app/demo-auth.ts", "utf8");
    const demoProfiles = readFileSync("config/cockpitDemoProfiles.ts", "utf8");

    expect(loginForm).toContain('"use client"');
    expect(loginForm).toContain("/api/demo-login");
    expect(loginForm).toContain('action="/api/demo-login"');
    expect(loginForm).toContain('method="post"');
    expect(loginForm).toContain("personas.map");
    expect(loginRoute).toContain("request.formData()");
    expect(loginRoute).toContain("NextResponse.redirect");
    expect(demoProfiles).toContain('loginId: "Maya"');
    expect(demoProfiles).toContain('loginId: "david"');
    expect(demoProfiles).toContain('loginId: "CFO"');
    expect(loginForm).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(loginForm).not.toContain("password_hash");
    expect(loginRoute).toContain("verify_recoup_demo_login");
    expect(demoAuth).toContain("httpOnly");
    expect(demoAuth).toContain("sameSite");
  });

  it("defines role-scoped route access", () => {
    const auth = readFileSync("cockpit/app/demo-auth.ts", "utf8");
    const demoProfiles = readFileSync("config/cockpitDemoProfiles.ts", "utf8");

    expect(auth).toContain("cockpitDemoProfiles");
    expect(auth).toContain("profilesByRole");
    expect(demoProfiles).toContain('loginId: "Maya"');
    expect(demoProfiles).toContain('loginId: "david"');
    expect(demoProfiles).toContain('loginId: "CFO"');
    expect(demoProfiles).toContain('defaultRoute: "/forensics/shadcn"');
    expect(demoProfiles).toContain('defaultRoute: "/credit"');
    expect(demoProfiles).toContain('defaultRoute: "/cfo"');
    expect(demoProfiles).toContain('"/governance/connectors"');
  });

  it("prefills landing persona login IDs without bypassing credential auth", () => {
    const landing = readFileSync("cockpit/app/page.tsx", "utf8");
    const loginPage = readFileSync("cockpit/app/login/page.tsx", "utf8");
    const loginForm = readFileSync("cockpit/app/login/login-form.tsx", "utf8");

    expect(landing).toContain('const mayaLoginHref = "/login?loginId=Maya"');
    expect(landing).toContain('const davidLoginHref = "/login?loginId=david"');
    expect(landing).toContain("href={mayaLoginHref}");
    expect(landing).toContain("href={davidLoginHref}");
    expect(loginPage).toContain("loginId?: string | string[]");
    expect(loginPage).toContain("const requestedLoginId = readFirstSearchParam(params?.loginId)");
    expect(loginPage).toContain("personas.find((persona) => persona.loginId === requestedLoginId)");
    expect(loginPage).toContain("initialLoginId={initialLoginId}");
    expect(loginForm).toContain("initialLoginId: string | undefined");
    expect(loginForm).toContain("const initialPersonaLoginId");
    expect(loginForm).toContain("setLoginId(initialPersonaLoginId)");
    expect(loginForm).toContain('body: JSON.stringify({ loginId, password })');
    expect(landing).not.toContain("password=");
    expect(loginPage).not.toContain("password=");
  });

  it("defines deterministic role-derived human principals for demo sessions", () => {
    expect(cockpitHumanPrincipalByDemoRole).toEqual({
      cfo: "human:cfo-lead",
      david: "human:david-lead",
      maya: "human:maya-lead"
    });
  });

  it("exposes demo lifecycle reset only from the CFO governance memory surface", () => {
    const memoryPage = readFileSync("cockpit/app/governance/memory/page.tsx", "utf8");
    const resetControl = readFileSync("cockpit/app/governance/memory/demo-lifecycle-reset-controls.tsx", "utf8");
    const mayaSurface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");

    expect(memoryPage).toContain("DemoLifecycleResetControls");
    expect(memoryPage).toContain("model.approvalAuditReceipts");
    expect(resetControl).toContain('"use client"');
    expect(resetControl).toContain('fetch("/api/admin/demo-reset"');
    expect(resetControl).toContain("approvalAuditReceipts.map");
    expect(resetControl).toContain("router.refresh()");
    expect(resetControl).toContain("No resettable approval decisions");
    expect(mayaSurface).not.toContain("/api/admin/demo-reset");
    expect(mayaSurface).not.toContain("DemoLifecycleResetControls");
  });
});
