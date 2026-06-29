"use client";

import { type CSSProperties, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileSearch, RotateCcw, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const mayaLoginHref = "/login?loginId=Maya";
const davidLoginHref = "/login?loginId=david";
const editorialDisplayStyle = {
  fontFamily: "var(--font-editorial)",
  fontVariationSettings: '"opsz" 72'
} satisfies CSSProperties;
const heroHeadlineStyle = {
  ...editorialDisplayStyle,
  fontSize: "clamp(30px, 3.2vw, 42px)",
  lineHeight: "1.1"
} satisfies CSSProperties;
const heroLeadStyle = {
  marginTop: "clamp(14px, 2vw, 24px)"
} satisfies CSSProperties;
const heroProofStyle = {
  marginTop: "clamp(8px, 1.2vw, 12px)"
} satisfies CSSProperties;

type LandingTab = "problem" | "solution" | "demo" | "tech" | "how-we-built-it" | "about";

const landingTabs = [
  ["problem", "Problem"],
  ["solution", "Solution"],
  ["demo", "Demo"],
  ["tech", "Tech"],
  ["how-we-built-it", "How We Built It"],
  ["about", "About"]
] as const satisfies readonly (readonly [LandingTab, string])[];

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<LandingTab>("problem");
  const [architectureZoom, setArchitectureZoom] = useState(1);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#fbfbfa] font-sans text-[#172032]" data-testid="recoup-landing-page">
      <main className="mx-auto flex h-dvh min-h-0 w-full max-w-[1424px] flex-col">
        <section className="flex min-h-[246px] shrink-0 flex-col items-center justify-center px-4 pb-4 pt-4 text-center md:min-h-[358px] md:pb-8 md:pt-10" data-testid="recoup-landing-hero">
          <h1
            className="max-w-[1424px] font-serif font-semibold text-[#172032]"
            style={heroHeadlineStyle}
          >
            CPG manufacturers lose 2–5% of gross revenue to retailer deductions. Most never get it back.
          </h1>
          <p className="max-w-[900px] text-[18px] font-semibold leading-7 text-[#5f6878] md:text-[22px] md:leading-9" style={heroLeadStyle}>
            Recoup is an agentic Order-to-Cash recovery cockpit, evidence-backed, governed, and auditable by design.
          </p>
          <p className="text-[13px] font-semibold text-[#71809c] md:text-[17px]" style={heroProofStyle}>
            Agents investigate. Code computes. Humans approve. Every decision cites evidence.
          </p>

        </section>

        <section className="flex min-h-0 w-full flex-1 flex-col pb-3" data-testid="recoup-landing-shell">
          <Tabs
            className="flex min-h-0 w-full flex-1 flex-col !gap-0"
            data-testid="recoup-landing-tabs"
            onValueChange={(value) => {
              setActiveTab(value as LandingTab);
            }}
            value={activeTab}
          >
            <TabsList className="mb-3 grid !h-[56px] w-full shrink-0 grid-cols-3 rounded-none border border-[#e6ebf1] bg-[#f8fafc] p-0 shadow-none md:mb-5 md:!h-[48px] md:grid-cols-6">
              {landingTabs.map(([value, label]) => (
                <TabsTrigger
                  className="!h-full rounded-none border-r border-[#e9eef4] bg-transparent py-0 text-[13px] font-semibold text-[#71809c] shadow-none last:border-r-0 data-active:bg-white data-active:text-[#2d8793] data-active:shadow-none data-[state=active]:bg-white data-[state=active]:text-[#2d8793] data-[state=active]:shadow-none md:text-[16px]"
                  key={value}
                  value={value}
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[4px] border border-[#dbe3ec] bg-white p-2 shadow-xs md:p-5">
              <TabsContent className="m-0 flex h-full flex-col gap-5" data-testid="recoup-landing-tab-problem" value="problem">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  {[
                    { val: "2–5%", label: "of gross revenue lost to deductions annually", src: "McKinsey 2026" },
                    { val: "65–80%", label: "of shortage claims may be invalid", src: "RVCF Benchmark" },
                    { val: "60%", label: "of brands recover < 50% of disputed deductions", src: "UpClear 2026" }
                  ].map((stat) => (
                    <Card className="min-h-[112px] rounded-[10px] border-[#dbe3ec] bg-white shadow-none" key={stat.label}>
                      <CardHeader className="p-5 pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="font-serif text-[36px] font-semibold leading-none text-[#172032]" style={editorialDisplayStyle}>
                            {stat.val}
                          </CardTitle>
                          <Badge className="rounded-[3px] border-[#dfe6ef] bg-white px-1.5 py-0.5 text-[11px] font-bold uppercase text-[#71809c]" variant="outline">
                            {stat.src}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 pt-1">
                        <p className="text-[16px] font-semibold leading-snug text-[#4f5968]">{stat.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="border-l-[4px] border-[#2d8793] bg-[#f2f8fa] px-6 py-5">
                  <p className="text-[18px] italic leading-relaxed text-[#3f4b5d]" style={{ fontFamily: "var(--font-editorial)" }}>
                    "O2C leakages amount to 3–5% of EBITDA. AI-backed tools can help recapture invalid credit memo value."
                  </p>
                  <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d8793]">— McKinsey & Company, 2026</p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  {[
                    {
                      icon: FileSearch,
                      title: "Deduction proof is scattered",
                      desc: "Contracts, PODs, pricing, returns, remittances, and claims sit in separate systems before teams can prove recoverability."
                    },
                    {
                      icon: ShieldCheck,
                      title: "Credit decisions lack dispute context",
                      desc: "Credit holds rarely account for open deductions, customer behavior, recovery odds, or partial-release economics."
                    },
                    {
                      icon: ClipboardCheck,
                      title: "Recovery actions need control",
                      desc: "Every dispute, rebill, outreach, hold, or terms change needs cited evidence, deterministic basis, and human approval."
                    }
                  ].map((fail) => (
                    <div className="flex min-h-[132px] gap-3 border border-[#e2e8f0] bg-white px-4 py-4" key={fail.title}>
                      <div className="mt-0.5 shrink-0">
                        <fail.icon className="size-5 text-[#71809c]" />
                      </div>
                      <div>
                        <h4 className="text-[16px] font-bold text-[#172032]">{fail.title}</h4>
                        <p className="mt-1 text-[14px] leading-5 text-[#71809c]">{fail.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent
                className="m-0 flex h-full flex-col justify-start gap-2 overflow-hidden md:justify-center md:gap-4"
                data-testid="recoup-landing-tab-solution"
                value="solution"
              >
                <div className="flex min-h-0 flex-col gap-2 md:gap-4">
                  {[
                    {
                      title: "Deduction Forensics & Recovery",
                      icon: FileSearch,
                      steps: [
                        ["Evidence packet", "SAP, TPM, 3PL, contracts, remittance"],
                        ["Agent forensics", "Investigates missing proof and claim validity"],
                        ["Deterministic recovery basis", "Code computes disputed/recoverable basis"],
                        ["Human-approved recovery", "Draft-only action with audit chain"]
                      ]
                    },
                    {
                      title: "Credit Risk Sentinel",
                      icon: ShieldCheck,
                      steps: [
                        ["Exposure signals", "AR, DSO, disputes, open deductions, behavior"],
                        ["Deterministic risk scoring", "Code computes risk basis"],
                        ["Governed credit proposal", "Partial hold, release, terms, or escalation"],
                        ["Human-approved action", "No external credit action without approval"]
                      ]
                    }
                  ].map((lane) => (
                    <div className="grid grid-cols-1 gap-2 border border-[#dbe3ec] bg-[#fbfbfa] p-2 md:grid-cols-[220px_1fr] md:gap-3 md:p-4" key={lane.title}>
                      <div className="flex items-center gap-3 md:flex-col md:items-start md:justify-center">
                        <div className="flex size-7 shrink-0 items-center justify-center border border-[#cfd9e5] bg-white md:size-9">
                          <lane.icon className="size-4 text-[#2d8793] md:size-5" />
                        </div>
                        <h3 className="text-[13px] font-bold leading-tight text-[#172032] md:text-[17px]">{lane.title}</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-[1fr_20px_1fr_20px_1fr_20px_1fr] md:items-stretch md:gap-2">
                        {lane.steps.map(([label, detail], index) => (
                          <div className="contents" key={label}>
                            <div className="min-h-[52px] border border-[#e2e8f0] bg-white px-2 py-2 md:min-h-[74px] md:px-3 md:py-3">
                              <div className="text-[11px] font-bold leading-tight text-[#172032] md:text-[13px]">{label}</div>
                              <div className="mt-0.5 text-[10px] leading-[1.15] text-[#71809c] md:mt-1 md:text-[12px] md:leading-4">{detail}</div>
                            </div>
                            {index < lane.steps.length - 1 ? (
                              <div className="hidden items-center justify-center text-[#71809c] md:flex">
                                <ArrowRight className="size-4" />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:flex md:flex-wrap md:justify-center md:gap-2">
                  {[
                    "Code computes dollars and risk math",
                    "Every decision cites records",
                    "Read-only source connectors",
                    "No ERP write-back",
                    "Human approval before action",
                    "Tamper-evident audit trail"
                  ].map((chip) => (
                    <Badge
                      className="flex h-auto min-h-5 w-full items-center justify-center gap-1 whitespace-normal rounded-sm border-border/50 bg-muted/50 px-1 py-0.5 text-center text-[9px] font-medium leading-tight text-foreground/80 md:min-h-0 md:w-fit md:justify-start md:gap-1.5 md:px-2.5 md:py-1 md:text-left md:text-xs"
                      key={chip}
                      variant="secondary"
                    >
                      <CheckCircle2 className="size-2.5 text-primary/70 md:size-3" />
                      {chip}
                    </Badge>
                  ))}
                </div>
              </TabsContent>

              <TabsContent className="m-0 h-full" data-testid="recoup-landing-tab-demo" value="demo">
                <div className="grid h-full grid-cols-1 items-center gap-6 md:grid-cols-2">
                  <Card className="border-border shadow-xs">
                    <CardHeader className="pb-4">
                      <div className="mb-2 flex items-start justify-between">
                        <Badge className="rounded-sm border-none bg-primary/10 px-2 text-xs font-bold text-primary" variant="secondary">
                          Analyst
                        </Badge>
                      </div>
                      <CardTitle className="font-serif text-xl text-foreground">Maya R.</CardTitle>
                      <CardDescription className="text-sm font-medium">Senior Deductions Analyst</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="mb-6 flex flex-col gap-3">
                        {[
                          "Reviews pre-triaged deduction lines",
                          "Opens multimodal evidence dock",
                          "Routes invalid claims to recovery drafts",
                          "Reviews chain-of-work evidence citations"
                        ].map((point) => (
                          <li className="flex items-start gap-2 text-sm text-foreground/80" key={point}>
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span className="leading-snug">{point}</span>
                          </li>
                        ))}
                      </ul>
                      <Button asChild className="h-9 w-full rounded-sm text-xs font-semibold" data-testid="recoup-landing-maya-cta">
                        <a href={mayaLoginHref}>
                          Enter as Maya
                          <ArrowRight className="ml-2 size-3.5" data-icon="inline-end" />
                        </a>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-border shadow-xs">
                    <CardHeader className="pb-4">
                      <div className="mb-2 flex items-start justify-between">
                        <Badge className="rounded-sm border-none bg-foreground/10 px-2 text-xs font-bold text-foreground" variant="secondary">
                          Director
                        </Badge>
                      </div>
                      <CardTitle className="font-serif text-xl text-foreground">David K.</CardTitle>
                      <CardDescription className="text-sm font-medium">Director of Credit & Collections</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="mb-6 flex flex-col gap-3">
                        {[
                          "Reviews account exposure and DSO drift",
                          "Uses partial-hold scoring",
                          "Reviews risk-mesh arbitration",
                          "Approves or rejects governed proposals"
                        ].map((point) => (
                          <li className="flex items-start gap-2 text-sm text-foreground/80" key={point}>
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                            <span className="leading-snug">{point}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        asChild
                        className="h-9 w-full rounded-sm border-border text-xs font-semibold hover:bg-muted/50"
                        data-testid="recoup-landing-david-cta"
                        variant="outline"
                      >
                        <a href={davidLoginHref}>
                          Enter as David
                          <ArrowRight className="ml-2 size-3.5" data-icon="inline-end" />
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent className="m-0 flex h-full flex-col gap-2" data-testid="recoup-landing-tab-tech" value="tech">
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <span aria-live="polite" className="sr-only">
                    Architecture diagram zoom {Math.round(architectureZoom * 100)} percent
                  </span>
                  <Button
                    aria-label="Zoom architecture diagram out"
                    disabled={architectureZoom <= 1}
                    onClick={() => {
                      setArchitectureZoom((zoom) => Math.max(1, Number((zoom - 0.25).toFixed(2))));
                    }}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ZoomOut data-icon="inline-start" />
                  </Button>
                  <Button
                    aria-label="Reset architecture diagram zoom"
                    disabled={architectureZoom === 1}
                    onClick={() => {
                      setArchitectureZoom(1);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw data-icon="inline-start" />
                    {Math.round(architectureZoom * 100)}%
                  </Button>
                  <Button
                    aria-label="Zoom architecture diagram in"
                    disabled={architectureZoom >= 2}
                    onClick={() => {
                      setArchitectureZoom((zoom) => Math.min(2, Number((zoom + 0.25).toFixed(2))));
                    }}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <ZoomIn data-icon="inline-start" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-white">
                  <p className="sr-only" id="architecture-diagram-summary">
                    Recoup connects read-only source evidence to deterministic services, agent investigation and drafting, HITL
                    approval, and a tamper-evident audit ledger. The architecture keeps ERP writes disabled and requires cited
                    records plus deterministic basis before any human-approved external action.
                  </p>
                  <div className="flex min-h-full min-w-full items-start justify-start p-2">
                    <img
                      alt="Recoup architecture diagram showing source evidence, deterministic services, agent investigation, approval, and audit ledger"
                      aria-describedby="architecture-diagram-summary"
                      className="block max-w-none"
                      src="/architecture-diagram.png"
                      style={{ height: "auto", width: `${String(architectureZoom * 100)}%` }}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                className="m-0 flex h-full flex-col justify-center"
                data-testid="recoup-landing-tab-build"
                value="how-we-built-it"
              >
                <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
                  <div>
                    <h3 className="mb-4 text-sm font-bold text-foreground">Product and engineering proof</h3>
                    <ul className="flex flex-col gap-3">
                      {[
                        "OpenAI Agents SDK orchestration",
                        "Typed TypeScript services",
                        "Zod-validated tools",
                        "Deterministic money and risk modules",
                        "Read-only source ports",
                        "Vitest, Playwright, invariant gates"
                      ].map((item) => (
                        <li className="flex items-center gap-2 text-sm text-foreground/80" key={item}>
                          <div className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-4 text-sm font-bold text-foreground">Architecture flow</h3>
                    <div className="relative flex flex-col gap-2 before:absolute before:inset-y-3 before:left-3 before:w-px before:bg-border">
                      {[
                        "Source evidence",
                        "Deterministic services",
                        "Agent investigation/drafting",
                        "HITL approval",
                        "Audit ledger"
                      ].map((step, index) => (
                        <div className="relative flex items-center gap-3 bg-card" key={step}>
                          <div className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-bold text-muted-foreground">
                            {String(index + 1)}
                          </div>
                          <div className="w-full rounded-sm border border-border/50 bg-muted/10 px-3 py-1.5 font-mono text-sm text-foreground/90">
                            {step}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-12 text-center text-xs font-semibold text-muted-foreground">
                  Built for the Hackathon. Designed for production.
                </div>
              </TabsContent>

              <TabsContent
                className="m-0 mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center"
                data-testid="recoup-landing-tab-about"
                value="about"
              >
                <h2 className="mb-8 font-serif text-3xl font-medium text-foreground md:text-4xl">
                  Built for the Hackathon.
                  <br />
                  Designed for production.
                </h2>

                <div className="mb-6 w-full overflow-hidden rounded-md border border-border bg-background text-left shadow-xs">
                  <div className="grid grid-cols-[120px_1fr] border-b border-border">
                    <div className="border-r border-border bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">Demo company</div>
                    <div className="p-3 text-sm font-medium text-foreground">NorthBay Brands (fictional CPG manufacturer)</div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] border-b border-border">
                    <div className="border-r border-border bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">Scope</div>
                    <div className="p-3 text-sm text-foreground/80">Deduction forensics, credit arbitration, CFO summary</div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] border-b border-border">
                    <div className="border-r border-border bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">Data</div>
                    <div className="p-3 text-sm text-foreground/80">Synthetic — governance architecture is real product behavior</div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr]">
                    <div className="border-r border-border bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">Fidelity</div>
                    <div className="p-3 text-sm text-foreground/80">Audit trail, scoring logic, and UI flows presented as production-ready</div>
                  </div>
                </div>

                <div className="max-w-2xl rounded-md border border-accent/20 bg-accent/10 px-4 py-3 text-left text-sm font-medium leading-relaxed text-primary">
                  <span className="mb-1 block text-xs font-bold">Governance Disclaimer</span>
                  Data is synthetic. The governance architecture, audit trail, scoring logic, and UI flows are presented as real product behavior.
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex shrink-0 items-center justify-center gap-3 pt-3" data-testid="recoup-landing-bottom-cta">
            <Button
              asChild
              className="h-[44px] min-w-[176px] rounded-none bg-[#2d8793] px-6 text-[16px] font-semibold text-white hover:bg-[#247784]"
              data-testid="recoup-landing-enter-cta"
              size="sm"
            >
              <a href={mayaLoginHref}>
                Enter as Maya
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
            <Button
              asChild
              className="h-[44px] min-w-[178px] rounded-none bg-[#2d8793] px-6 text-[16px] font-semibold text-white hover:bg-[#247784]"
              size="sm"
            >
              <a href={davidLoginHref}>
                Enter as David
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
