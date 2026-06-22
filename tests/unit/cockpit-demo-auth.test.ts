import { describe, expect, it } from "vitest";
import {
  createSignedDemoSessionValue,
  demoProfiles,
  isDemoRouteAllowed,
  roleAllowedRoutes,
  roleHomeRoute,
  verifyDemoSessionValue
} from "../../cockpit/app/demo-auth.ts";

describe("cockpit demo auth helpers", () => {
  it("exports the canonical demo profiles used by login and session validation", () => {
    expect(demoProfiles.map((profile) => profile.loginId)).toEqual(["Maya", "david", "CFO"]);
    expect(demoProfiles.map((profile) => profile.defaultRoute)).toEqual(["/forensics", "/credit", "/cfo"]);
    expect(demoProfiles.map((profile) => profile.displayName)).toEqual(["Maya Patel", "David Kim", "CFO"]);
  });

  it("maps each demo role to the expected default route and route allowlist", () => {
    expect(roleHomeRoute("maya")).toBe("/forensics");
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
});
