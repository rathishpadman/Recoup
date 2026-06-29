"use client";

import { type CSSProperties, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, EyeOff, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const mayaLoginHref = "/login?loginId=Maya";
const davidLoginHref = "/login?loginId=david";
const editorialDisplayStyle = {
  fontFamily: "var(--font-editorial)",
  fontVariationSettings: '"opsz" 72'
} satisfies CSSProperties;
const heroHeadlineStyle = {
  ...editorialDisplayStyle,
  fontSize: "40px",
  lineHeight: "1.12"
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#fbfbfa] font-sans text-[#172032]" data-testid="recoup-landing-page">
      <main className="mx-auto flex h-dvh min-h-0 w-full max-w-[1424px] flex-col">
        <section className="flex min-h-[358px] shrink-0 flex-col items-center px-4 pb-10 pt-10 text-center" data-testid="recoup-landing-hero">
          <h1
            className="max-w-[1424px] font-serif text-[40px] font-semibold leading-[1.12] text-[#172032]"
            style={heroHeadlineStyle}
          >
            CPG manufacturers lose 2–5% of gross revenue to retailer deductions. Most never get it back.
          </h1>
          <p className="mt-8 max-w-[900px] text-[22px] font-semibold leading-9 text-[#5f6878]">
            Recoup is an agentic Order-to-Cash recovery cockpit, evidence-backed, governed, and auditable by design.
          </p>
          <p className="mt-4 text-[17px] font-semibold text-[#71809c]">
            Agents investigate. Code computes. Humans approve. Every decision cites evidence.
          </p>

          <div className="mt-auto flex items-center gap-3 pt-10">
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

        <section className="flex min-h-0 w-full flex-1 flex-col pb-7" data-testid="recoup-landing-shell">
          <Tabs
            className="flex w-full flex-1 flex-col"
            data-testid="recoup-landing-tabs"
            onValueChange={(value) => {
              setActiveTab(value as LandingTab);
            }}
            value={activeTab}
          >
            <TabsList className="mb-7 grid h-[48px] w-full shrink-0 grid-cols-3 rounded-none border border-[#e6ebf1] bg-[#f8fafc] p-0 shadow-none md:grid-cols-6">
              {landingTabs.map(([value, label]) => (
                <TabsTrigger
                  className="h-full rounded-none border-r border-[#e9eef4] bg-transparent py-0 text-[16px] font-semibold text-[#71809c] shadow-none last:border-r-0 data-active:bg-white data-active:text-[#2d8793] data-active:shadow-none data-[state=active]:bg-white data-[state=active]:text-[#2d8793] data-[state=active]:shadow-none"
                  key={value}
                  value={value}
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[4px] border border-[#dbe3ec] bg-white p-7 shadow-xs">
              <TabsContent className="m-0 flex h-full flex-col gap-7" data-testid="recoup-landing-tab-problem" value="problem">
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

                <div className="border-l-[4px] border-[#2d8793] bg-[#f2f8fa] px-7 py-7">
                  <p className="text-[18px] italic leading-relaxed text-[#3f4b5d]" style={{ fontFamily: "var(--font-editorial)" }}>
                    "O2C leakages amount to 3–5% of EBITDA. AI-backed tools can help recapture invalid credit memo value."
                  </p>
                  <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d8793]">— McKinsey & Company, 2026</p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  {[
                    { icon: Zap, title: "Blunt instruments", desc: "Credit holds are binary — no partial release based on dispute strength" },
                    { icon: EyeOff, title: "Black-box decisions", desc: "Finance cannot verify uncited AI reasoning in audit" },
                    { icon: AlertTriangle, title: "Manual economics", desc: "Teams drown in deduction volume before they can dispute" }
                  ].map((fail) => (
                    <div className="flex min-h-[104px] gap-4 border border-[#e2e8f0] bg-white px-5 py-5" key={fail.title}>
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
                className="m-0 flex h-full flex-col justify-center gap-12"
                data-testid="recoup-landing-tab-solution"
                value="solution"
              >
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row md:gap-2">
                  {[
                    { step: "1", title: "Evidence Ingestion", sub: "SAP / TPM / 3PL / Bureau" },
                    { step: "2", title: "Agent Forensics", sub: "GPT-5.5 · Zod-validated tools" },
                    { step: "3", title: "Human Approval Gate", sub: "HITL sign-off · Proposer ≠ Approver" },
                    { step: "4", title: "Immutable Audit Ledger", sub: "SHA-256 hash chain · Supabase" }
                  ].map((node, index, arr) => (
                    <div className="flex w-full flex-1 items-center md:w-auto" key={node.step}>
                      <div className="relative flex-1 rounded-md border border-border bg-background p-4 text-center shadow-xs">
                        <div className="absolute -top-2.5 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-muted-foreground">
                          {node.step}
                        </div>
                        <h3 className="mt-1 text-sm font-semibold text-foreground">{node.title}</h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{node.sub}</p>
                      </div>
                      {index < arr.length - 1 ? (
                        <div className="hidden w-8 shrink-0 justify-center text-muted-foreground md:flex">
                          <ArrowRight className="size-4" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "Deterministic math",
                    "Every decision cites a record ID",
                    "Proposer ≠ Approver",
                    "Read-only source connectors",
                    "No ERP write-back",
                    "Immutable audit trail"
                  ].map((chip) => (
                    <Badge
                      className="flex items-center gap-1.5 rounded-sm border-border/50 bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/80"
                      key={chip}
                      variant="secondary"
                    >
                      <CheckCircle2 className="size-3 text-primary/70" />
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
                      <ul className="mb-6 space-y-3">
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
                      <ul className="mb-6 space-y-3">
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

              <TabsContent className="m-0 flex h-full items-center justify-center" data-testid="recoup-landing-tab-tech" value="tech">
                <div className="w-full max-w-3xl overflow-hidden rounded-md border border-border bg-background/50">
                  <Table>
                    <TableBody>
                      {[
                        ["Frontend", "Next.js, React, TypeScript"],
                        ["Styling", "Tailwind CSS, shadcn/ui, Carbon-inspired patterns"],
                        ["Fonts", "IBM Plex Sans, Newsreader"],
                        ["Agent SDK", "OpenAI Agents SDK (TypeScript)"],
                        ["Models", "GPT-5.5, GPT-4.1, GPT Realtime"],
                        ["Money math", "decimal.js — no LLM arithmetic"],
                        ["Validation", "Zod"],
                        ["Database", "Supabase / PostgreSQL"],
                        ["Audit ledger", "SHA-256 hash chain"],
                        ["Testing", "Vitest, Playwright"]
                      ].map(([layer, tech]) => (
                        <TableRow className="border-border even:bg-muted/20 hover:bg-transparent" key={layer}>
                          <TableCell className="w-1/3 px-4 py-2.5 text-xs font-semibold text-foreground/70">{layer}</TableCell>
                          <TableCell className="px-4 py-2.5 font-mono text-xs text-foreground/90">{tech}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent
                className="m-0 flex h-full flex-col justify-center"
                data-testid="recoup-landing-tab-build"
                value="how-we-built-it"
              >
                <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
                  <div>
                    <h3 className="mb-4 text-sm font-bold text-foreground">Build toolchain</h3>
                    <ul className="space-y-3">
                      {[
                        "Claude Code + Codex — agentic coding",
                        "Superpowers Skills — TDD, debugging, code review, planning, worktrees",
                        "shadcn/ui — component system",
                        "Carbon-inspired design patterns",
                        "Typed tool registry",
                        "Zod validation",
                        "E2E testing + verification gates"
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
                        "OpenAI Agents SDK",
                        "Zod-validated tool registry",
                        "Read-only source connectors",
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
        </section>
      </main>
    </div>
  );
}
