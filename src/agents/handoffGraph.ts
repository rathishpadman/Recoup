export const recoupHandoffGraph = [
  { from: "Forensics Investigator", to: "Recovery Drafter", mode: "handoff" },
  { from: "Forensics Investigator", to: "Containment / Intent", mode: "handoff" },
  { from: "Risk-Mesh Supervisor", to: "Sentinel", mode: "agents-as-tools" },
  { from: "Risk-Mesh Supervisor", to: "Containment / Intent", mode: "agents-as-tools" },
  { from: "Conversational Query", to: "Audit Read", mode: "tool" }
] as const;
