import type { CockpitDemoRole } from "./cockpitHumanPrincipals.js";

export type CockpitDemoLoginId = "Maya" | "david" | "CFO";

export interface CockpitDemoProfile {
  allowedRoutes: readonly string[];
  defaultRoute: string;
  displayName: string;
  loginId: CockpitDemoLoginId;
  persona: string;
  role: CockpitDemoRole;
  workspace: string;
}

export interface CockpitDemoLoginPersona {
  allowedRouteCount: number;
  allowedRoutes: string[];
  defaultRoute: string;
  displayName: string;
  loginId: CockpitDemoLoginId;
  persona: string;
  provenance: "deterministic_demo_profile";
  role: CockpitDemoRole;
  sourceMode: "deterministic_demo_profile";
  workspace: string;
}

export const cockpitDemoProfiles = [
  {
    allowedRoutes: ["/forensics", "/run"],
    defaultRoute: "/forensics/shadcn",
    displayName: "Maya Patel",
    loginId: "Maya",
    persona: "Forensics analyst",
    role: "maya",
    workspace: "Deduction recovery workbench"
  },
  {
    allowedRoutes: ["/credit"],
    defaultRoute: "/credit",
    displayName: "David Kim",
    loginId: "david",
    persona: "Credit lead",
    role: "david",
    workspace: "Risk Mesh arbitration queue"
  },
  {
    allowedRoutes: ["/cfo", "/governance/agents", "/governance/connectors", "/governance/memory", "/governance/trace"],
    defaultRoute: "/cfo",
    displayName: "CFO",
    loginId: "CFO",
    persona: "Executive reviewer",
    role: "cfo",
    workspace: "Board readout and audit posture"
  }
] as const satisfies readonly CockpitDemoProfile[];

export function isCockpitDemoLoginId(loginId: string): loginId is CockpitDemoLoginId {
  return cockpitDemoProfiles.some((profile) => profile.loginId === loginId);
}

export function buildCockpitDemoLoginPersonas(): CockpitDemoLoginPersona[] {
  return cockpitDemoProfiles.map((profile) => ({
    allowedRouteCount: profile.allowedRoutes.length,
    allowedRoutes: [...profile.allowedRoutes],
    defaultRoute: profile.defaultRoute,
    displayName: profile.displayName,
    loginId: profile.loginId,
    persona: profile.persona,
    provenance: "deterministic_demo_profile",
    role: profile.role,
    sourceMode: "deterministic_demo_profile",
    workspace: profile.workspace
  }));
}
