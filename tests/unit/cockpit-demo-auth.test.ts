import { describe, expect, it } from "vitest";
import {
  createDemoSessionCookie,
  createSignedDemoSessionValue,
  demoSessionFromSupabaseRecord,
  demoProfiles,
  isDemoRouteAllowed,
  roleAllowedRoutes,
  roleHomeRoute,
  verifyDemoSessionValue
} from "../../cockpit/app/demo-auth.ts";

describe("cockpit demo auth helpers", () => {
  it("exports the canonical demo profiles used by login and session validation", () => {
    expect(demoProfiles.map((profile) => profile.loginId)).toEqual(["Maya", "david", "CFO"]);
    expect(demoProfiles.map((profile) => profile.defaultRoute)).toEqual(["/forensics/shadcn", "/credit", "/cfo"]);
    expect(demoProfiles.map((profile) => profile.displayName)).toEqual(["Maya Patel", "David Kim", "CFO"]);
  });

  it("maps each demo role to the expected default route and route allowlist", () => {
    expect(roleHomeRoute("maya")).toBe("/forensics/shadcn");
    expect(roleHomeRoute("david")).toBe("/credit");
    expect(roleHomeRoute("cfo")).toBe("/cfo");

    expect(roleAllowedRoutes("maya")).toEqual(["/forensics", "/run"]);
    expect(roleAllowedRoutes("david")).toEqual(["/credit"]);
    expect(roleAllowedRoutes("cfo")).toEqual([
      "/cfo",
      "/governance/agents",
      "/governance/connectors",
      "/governance/memory",
      "/governance/trace"
    ]);
  });

  it("allows nested route access only under the role-scoped allowlist", () => {
    const mayaRoutes = roleAllowedRoutes("maya");
    const cfoRoutes = roleAllowedRoutes("cfo");

    expect(isDemoRouteAllowed("/forensics", mayaRoutes)).toBe(true);
    expect(isDemoRouteAllowed("/forensics/shadcn", mayaRoutes)).toBe(true);
    expect(isDemoRouteAllowed("/forensics/line/S2", mayaRoutes)).toBe(true);
    expect(isDemoRouteAllowed("/run/replay", mayaRoutes)).toBe(true);
    expect(isDemoRouteAllowed("/credit", mayaRoutes)).toBe(false);
    expect(isDemoRouteAllowed("/governance/connectors", cfoRoutes)).toBe(true);
    expect(isDemoRouteAllowed("/governance/connectors/detail", cfoRoutes)).toBe(true);
    expect(isDemoRouteAllowed("/forensics", cfoRoutes)).toBe(false);
  });

  it("round-trips signed demo sessions and rejects tampering or wrong secrets", () => {
    const session = {
      allowedRoutes: roleAllowedRoutes("maya"),
      defaultRoute: roleHomeRoute("maya"),
      displayName: "Maya Patel",
      loginId: "Maya",
      role: "maya"
    } as const;
    const signedValue = createSignedDemoSessionValue(session, "test-secret");
    const [payload, signature] = signedValue.split(".");
    const replacement = payload?.endsWith("A") === true ? "B" : "A";
    const tamperedPayload =
      payload === undefined || signature === undefined ? signedValue : `${payload.slice(0, -1)}${replacement}.${signature}`;

    expect(verifyDemoSessionValue(signedValue, "test-secret")).toEqual(session);
    expect(verifyDemoSessionValue(tamperedPayload, "test-secret")).toBeUndefined();
    expect(verifyDemoSessionValue(signedValue, "different-secret")).toBeUndefined();
  });

  it("does not sign demo route sessions with the human bearer token fallback", () => {
    const session = {
      allowedRoutes: roleAllowedRoutes("maya"),
      defaultRoute: roleHomeRoute("maya"),
      displayName: "Maya Patel",
      loginId: "Maya",
      role: "maya"
    } as const;

    expect(() =>
      createDemoSessionCookie(session, {
        NODE_ENV: "development",
        RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
        RECOUP_DEMO_SESSION_SECRET: ""
      })
    ).toThrow("Demo session signing secret is not configured.");
  });

  it("rejects malformed sessions even when the signature envelope exists", () => {
    const malformed = createSignedDemoSessionValue(
      {
        allowedRoutes: ["/credit"],
        defaultRoute: "/credit",
        displayName: "David Kim",
        loginId: "david",
        role: "maya"
      },
      "test-secret"
    );

    expect(verifyDemoSessionValue(malformed, "test-secret")).toBeUndefined();
    expect(verifyDemoSessionValue("not-json.not-a-signature", "test-secret")).toBeUndefined();
  });

  it("normalizes verified Supabase demo records to the canonical local route contract", () => {
    expect(
      demoSessionFromSupabaseRecord({
        allowed_routes: ["/forensics", "/run"],
        default_route: "/forensics",
        display_name: "Maya Patel",
        login_id: "Maya",
        role: "maya"
      })
    ).toEqual({
      allowedRoutes: ["/forensics", "/run"],
      defaultRoute: "/forensics/shadcn",
      displayName: "Maya Patel",
      loginId: "Maya",
      role: "maya"
    });
  });
});
