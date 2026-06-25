export const recoupHandoffWirings = ["sdk-handoff", "deterministic-service", "agents-as-tools", "tool"] as const;

export type RecoupHandoffWiring = (typeof recoupHandoffWirings)[number];
export type RecoupHandoffMode = "handoff" | "agents-as-tools" | "tool";

export type RecoupHandoffEdge = {
  readonly from: string;
  readonly to: string;
  readonly mode: RecoupHandoffMode;
  readonly wiring: RecoupHandoffWiring;
};

export const recoupHandoffGraph = [
  { from: "Forensics Investigator", to: "Recovery Drafter", mode: "handoff", wiring: "sdk-handoff" },
  {
    from: "Forensics Investigator",
    to: "Containment / Intent",
    mode: "handoff",
    wiring: "deterministic-service"
  },
  { from: "Risk-Mesh Supervisor", to: "Sentinel", mode: "agents-as-tools", wiring: "agents-as-tools" },
  {
    from: "Risk-Mesh Supervisor",
    to: "Containment / Intent",
    mode: "agents-as-tools",
    wiring: "agents-as-tools"
  },
  { from: "Conversational Query", to: "Audit Read", mode: "tool", wiring: "tool" }
] as const satisfies readonly RecoupHandoffEdge[];
