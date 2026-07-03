import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { buildMetrics, CheckIcon, invariantSpotlights, runFlowTimeline, stackCards } from "./landing-content.ts";

export function BuildPanel() {
  return (
    <TabsContent className="m-0 pb-16 pt-2" data-testid="recoup-landing-tab-build" value="how-we-built-it">
      <div className="mb-7 max-w-[820px]">
        <p className="mb-2 font-serif text-[15px] italic text-muted-foreground">The build - engineering proof</p>
        <h2 className="m-0 font-serif text-3xl font-normal leading-tight text-foreground">Production discipline, hackathon clock.</h2>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
        {buildMetrics.map((metric) => (
          <Card className="gap-0 rounded-xl border border-border bg-card p-5 text-center shadow-sm ring-0" key={metric.label}>
            <p className="m-0 font-mono text-3xl font-medium leading-none text-primary">{metric.value}</p>
            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{metric.label}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-5 max-[1100px]:grid-cols-2 max-[760px]:grid-cols-1">
        {stackCards.map((card) => (
          <Card className="gap-0 rounded-xl border border-border bg-card p-5 shadow-sm ring-0" key={card.title}>
            <div className="mb-3 grid size-9 place-items-center rounded-lg bg-[color:var(--primary-tint)] text-primary">
              <card.Icon className="size-[18px]" />
            </div>
            <h3 className="m-0 text-[15px] font-semibold">{card.title}</h3>
            <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
              {card.items.map((item) => (
                <li className="relative pl-3 text-xs leading-5 text-muted-foreground before:absolute before:left-0 before:top-2 before:size-1.5 before:rounded-full before:border before:border-primary before:bg-[color:var(--primary-subtle)]" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] items-start gap-5 max-[900px]:grid-cols-1">
        <Card className="gap-0 rounded-xl border border-border bg-card p-6 shadow-sm ring-0">
          <p className="mb-4 font-serif text-[15px] italic text-muted-foreground">Invariants that matter - from INVARIANTS.md</p>
          <ul className="flex list-none flex-col gap-3 p-0">
            {invariantSpotlights.map((invariant) => (
              <li className="flex gap-2.5" key={invariant.id}>
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-sm leading-5 text-secondary-foreground">
                  <span className="mr-1.5 rounded-sm border border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] px-1.5 py-0.5 font-mono text-[11px] text-primary">
                    {invariant.id}
                  </span>
                  {invariant.text}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="gap-0 rounded-xl border border-border bg-card p-6 shadow-sm ring-0">
          <p className="mb-4 font-serif text-[15px] italic text-muted-foreground">How a run flows</p>
          <div className="flex flex-col">
            {runFlowTimeline.map((step, index) => (
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3" key={step.title}>
                <span className="relative flex justify-center">
                  <span className="z-10 grid size-7 place-items-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
                    {step.number}
                  </span>
                  {index < runFlowTimeline.length - 1 ? <span className="absolute bottom-0 top-7 w-px bg-border" /> : null}
                </span>
                <div className="pb-4">
                  <h3 className="m-0 text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs font-semibold text-muted-foreground">
        One `npm run verify` gates it all: lint · typecheck · tests · dependency boundaries · release-readiness evals.
      </p>
    </TabsContent>
  );
}
