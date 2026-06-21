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
