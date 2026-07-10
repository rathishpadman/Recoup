import type { CSSProperties } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Code,
  Cpu,
  Database,
  DollarSign,
  FileSearch,
  FileText,
  Lock,
  PenLine,
  Scale,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type LandingTab = "problem" | "solution" | "demo" | "tech" | "how-we-built-it" | "about";

export interface LandingTabItem {
  label: string;
  testId: string;
  value: LandingTab;
}

export interface LandingStat {
  Icon: LucideIcon;
  label: string;
  source: string;
  value: string;
}

export interface LandingPainPoint {
  Icon: LucideIcon;
  description: string;
  title: string;
}

export interface PipelineStage {
  Icon: LucideIcon;
  items: string[];
  number: string;
  summary: string;
  title: string;
}

export interface PersonaCard {
  ctaLabel: string;
  href: string;
  journey: string[];
  name: string;
  role: string;
  testId: string;
  tone: "primary" | "neutral";
}

export interface GuardrailCard {
  Icon: LucideIcon;
  description: string;
  title: string;
}

export interface CapabilityRow {
  capability: string;
  layer: string;
}

export interface MetricCard {
  label: string;
  value: string;
}

export interface StackCard {
  Icon: LucideIcon;
  items: string[];
  title: string;
}

export interface InvariantSpotlight {
  id: string;
  text: string;
}

export interface TimelineStep {
  description: string;
  number: string;
  title: string;
}

export interface AboutRow {
  label: string;
  value: string;
}

export const mayaLoginHref = "/login?loginId=Maya";
export const davidLoginHref = "/login?loginId=david";

export const landingThemeVariables = {
  "--accent": "#c2410c",
  "--atmos-mint": "#bfe3de",
  "--atmos-sand": "#f2e4d0",
  "--atmos-sky": "#cfe0ec",
  "--background": "#f7f8f8",
  "--border": "#d6dcdb",
  "--card": "#ffffff",
  "--card-foreground": "#131a19",
  "--foreground": "#131a19",
  "--input": "#d6dcdb",
  "--muted": "#eef1f1",
  "--muted-foreground": "#6b7a78",
  "--popover": "#ffffff",
  "--popover-foreground": "#131a19",
  "--primary": "#0c6e6b",
  "--primary-foreground": "#ffffff",
  "--primary-hover": "#0a5755",
  "--primary-subtle": "#dceeed",
  "--primary-tint": "#eaf5f4",
  "--ring": "#0c6e6b",
  "--secondary": "#eef1f1",
  "--secondary-foreground": "#324341",
  "--text-secondary": "#4b5c5a"
} satisfies CSSProperties & Record<`--${string}`, string>;

export const landingTabs = [
  { label: "Problem", testId: "recoup-landing-tab-problem", value: "problem" },
  { label: "Solution", testId: "recoup-landing-tab-solution", value: "solution" },
  { label: "Demo", testId: "recoup-landing-tab-demo", value: "demo" },
  { label: "Tech", testId: "recoup-landing-tab-tech", value: "tech" },
  { label: "How We Built It", testId: "recoup-landing-tab-build", value: "how-we-built-it" },
  { label: "About", testId: "recoup-landing-tab-about", value: "about" }
] as const satisfies readonly LandingTabItem[];

export function isLandingTab(value: string): value is LandingTab {
  return landingTabs.some((tab) => tab.value === value);
}

export const heroMantra = [
  { Icon: FileText, label: "Every decision cites evidence" },
  { Icon: Code, label: "Code computes every dollar" },
  { Icon: UserCheck, label: "Humans approve" }
] as const;

export const problemStats = [
  {
    Icon: TrendingDown,
    label: "of gross revenue lost to deductions annually",
    source: "Industry estimate",
    value: "2–5%"
  },
  {
    Icon: AlertTriangle,
    label: "of shortage claims may be invalid",
    source: "Retail claims benchmark",
    value: "65–80%"
  },
  {
    Icon: DollarSign,
    label: "of brands recover less than half of disputed deductions",
    source: "Industry recovery estimate",
    value: "60%"
  }
] as const satisfies readonly LandingStat[];

export const painPoints = [
  {
    Icon: Search,
    description:
      "Contracts, PODs, pricing, returns, remittances, and claims sit in separate systems before teams can prove recoverability.",
    title: "Deduction proof is scattered"
  },
  {
    Icon: ShieldCheck,
    description:
      "Credit holds rarely account for open deductions, customer behavior, recovery odds, or partial-release economics.",
    title: "Credit decisions lack dispute context"
  },
  {
    Icon: ClipboardCheck,
    description:
      "Every dispute, rebill, outreach, hold, or terms change needs cited evidence, deterministic basis, and human approval.",
    title: "Recovery actions need control"
  }
] as const satisfies readonly LandingPainPoint[];

export const pipelineStages = [
  {
    Icon: Database,
    items: ["ERP / SAP OData", "TPM & agreements", "3PL / POD", "Remittance / EDI", "Documents"],
    number: "1",
    summary: "Structured + unstructured data from across O2C systems",
    title: "Ingest"
  },
  {
    Icon: Search,
    items: ["POD match", "Contract & promo check", "Pricing & accruals", "Duplicate detection", "Shortage validation"],
    number: "2",
    summary: "Agents retrieve evidence and investigate each deduction",
    title: "Investigate"
  },
  {
    Icon: Scale,
    items: ["Valid / Invalid / Partial", "Recovery amount (code)", "R-score & risk change", "Partial-hold proposal", "Term change proposal"],
    number: "3",
    summary: "Code computes. Agents explain. Humans approve.",
    title: "Decide"
  },
  {
    Icon: PenLine,
    items: ["Credit memo / rebill", "Recovery case", "Terms / limit change", "Partial hold / release", "Customer outreach"],
    number: "4",
    summary: "Drafts & proposals routed for human approval",
    title: "Act (draft-only)"
  },
  {
    Icon: BookOpen,
    items: ["Hash-chained trail", "Replayable event IDs", "Proposer != approver", "Eval gates block releases"],
    number: "5",
    summary: "Append-only, hash-chained audit of every decision",
    title: "Audit & Govern"
  }
] as const satisfies readonly PipelineStage[];

export const governanceChips = [
  "Code computes dollars and risk math",
  "Every decision cites records",
  "Read-only source connectors",
  "No ERP write-back",
  "Human approval before action",
  "Tamper-evident audit trail"
] as const;

export const cockpitCards = [
  {
    Icon: Search,
    description:
      "Worklist -> evidence dossier -> deterministic recovery basis -> human-approved recovery packet.",
    title: "Maya - Deductions & Recovery Cockpit"
  },
  {
    Icon: ShieldCheck,
    description:
      "Weekly queue -> exposure and DSO drift -> Risk Mesh basis -> David negotiation workbench -> governed action packet.",
    title: "David - Weekly Credit Risk Review"
  }
] as const satisfies readonly GuardrailCard[];

export const personaCards = [
  {
    ctaLabel: "Enter as Maya",
    href: mayaLoginHref,
    journey: [
      "Review pre-triaged deduction lines in the worklist",
      "Open the multimodal evidence dock on a claim",
      "Route invalid claims to recovery drafts",
      "Review chain-of-work evidence citations"
    ],
    name: "Maya Patel",
    role: "Senior Deductions Analyst",
    testId: "recoup-landing-maya-cta",
    tone: "primary"
  },
  {
    ctaLabel: "Enter as David",
    href: davidLoginHref,
    journey: [
      "Review the 4-account weekly risk queue",
      "Open account dossiers with exposure, DSO, and cited signals",
      "Inspect Risk Mesh verdicts and deterministic basis",
      "Negotiate live email terms through a human-approved send gate",
      "Approve governed packets while external send stays gated"
    ],
    name: "David K.",
    role: "Director of Credit & Collections",
    testId: "recoup-landing-david-cta",
    tone: "neutral"
  }
] as const satisfies readonly PersonaCard[];

export const guardrailCards = [
  {
    Icon: Lock,
    description: "Source systems stay read-only. Recovery packets are drafts until a human dispatches them.",
    title: "No ERP write-back"
  },
  {
    Icon: Scale,
    description: "Dollar amounts and risk scores come from code paths, never from model free-text.",
    title: "Deterministic basis"
  },
  {
    Icon: FileSearch,
    description: "Every agent conclusion links back to the specific records that support it.",
    title: "Citations required"
  }
] as const satisfies readonly GuardrailCard[];

export const capabilityRows = [
  { capability: "gpt-5.4 family, gpt-realtime-2, gpt-4o-mini-transcribe", layer: "Runtime models" },
  { capability: "Agents SDK tools with typed evidence gates", layer: "Governance" }
] as const satisfies readonly CapabilityRow[];

export const buildMetrics = [
  { label: "invariant controls tracked in INVARIANTS.md", value: "30" },
  { label: "automated test files across unit, invariant, eval, and browser suites", value: "171" },
  { label: "browser E2E journey files across cockpit routes", value: "9" },
  { label: "typed TypeScript modules in the runtime monolith", value: "125" }
] as const satisfies readonly MetricCard[];

export const stackCards = [
  {
    Icon: Sparkles,
    items: [
      "OpenAI Agents SDK orchestration",
      "4 governed capabilities: Risk Mesh, Forensics, Credit Sentinel, Containment",
      "Pinned models only - config-driven, never ad-hoc",
      "David live investigation traces agents, handoffs, and token usage"
    ],
    title: "Agent runtime"
  },
  {
    Icon: Scale,
    items: [
      "All money is fixed-precision Decimal - never a JS float",
      "No model ever asserts a dollar amount",
      "Seeded (42) reproducible runs, byte-identical event IDs"
    ],
    title: "Deterministic core"
  },
  {
    Icon: Code,
    items: ["Next.js App Router + React 19", "shadcn/ui + Radix + Tailwind 4", "Recharts KPIs, Lucide icons"],
    title: "Cockpit"
  },
  {
    Icon: Cpu,
    items: ["Express 5 backend with SSE live updates", "GPT Realtime voice with text/voice citation parity", "MCP server for tool access"],
    title: "API & realtime"
  },
  {
    Icon: Server,
    items: [
      "Supabase + SQLite agent memory stores",
      "OpenAI vector store for policy-grounded negotiation retrieval",
      "Read-only SAP OData adapter - no write client exists",
      "Zod-typed ports; core has zero source imports"
    ],
    title: "Data & memory"
  },
  {
    Icon: ShieldCheck,
    items: ["Vitest + Playwright + dependency-cruiser boundaries", "Eval false-positive gates fail the build", "Accuracy bars: validity >= 0.90, arbitration >= 0.85"],
    title: "Quality gates"
  }
] as const satisfies readonly StackCard[];

export const invariantSpotlights = [
  { id: "I-1", text: "No model ever asserts a dollar amount - all math in code" },
  { id: "I-7", text: "No action is sent autonomously - every draft halts at HITL" },
  { id: "I-8", text: "Proposer != approver - segregation of duties enforced" },
  { id: "I-9", text: "Audit trail is append-only and hash-chained" },
  { id: "I-14", text: "PII passes a guard before entering any model context" },
  { id: "I-26", text: "No production-ERP mutation path exists in the codebase" }
] as const satisfies readonly InvariantSpotlight[];

export const runFlowTimeline = [
  { description: "Read-only connectors assemble the packet", number: "1", title: "Source evidence" },
  { description: "Code computes dollars and risk basis", number: "2", title: "Deterministic services" },
  { description: "Cited findings and draft-only proposals", number: "3", title: "Agent investigation & drafting" },
  { description: "A human approves, rejects, or defers", number: "4", title: "HITL approval" },
  { description: "Tamper-evident record of the whole chain", number: "5", title: "Audit ledger" }
] as const satisfies readonly TimelineStep[];

export const aboutRows = [
  { label: "Demo company", value: "NorthBay Brands (fictional CPG manufacturer)" },
  { label: "Scope", value: "Deduction forensics, weekly credit risk review, terms negotiation, CFO summary" },
  { label: "Data", value: "Synthetic, seeded (42) - reproducible run to run" },
  { label: "Runtime", value: "Node 22 + TypeScript modular monolith" },
  { label: "Fidelity", value: "Audit trail, scoring logic, and UI flows presented as production-ready" }
] as const satisfies readonly AboutRow[];

export const aboutCapabilities = [
  "Closed-Loop Risk Mesh - arbitration across competing risk positions",
  "Deduction Forensics & Recovery - the hero flow (Maya's cockpit)",
  "Dynamic Credit Sentinel - 4-account weekly risk review and terms negotiation (David's cockpit)",
  "Behavioral Containment - evidence-gated intent labels and partial holds"
] as const;

export const CheckIcon = CheckCircle2;
export const UsersIcon = Users;
