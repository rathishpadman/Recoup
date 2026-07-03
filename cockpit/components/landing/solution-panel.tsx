import { ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { CheckIcon, cockpitCards, governanceChips, pipelineStages } from "./landing-content.ts";

export function SolutionPanel() {
  return (
    <TabsContent className="m-0 pb-16 pt-2" data-testid="recoup-landing-tab-solution" value="solution">
      <div className="mb-7 max-w-[820px]">
        <p className="mb-2 font-serif text-[15px] italic text-muted-foreground">The solution - one governed pipeline</p>
        <h2 className="m-0 font-serif text-3xl font-normal leading-tight text-foreground">
          Agents investigate, code computes the dollars, and a human signs off.
        </h2>
      </div>

      <h3 className="m-0 text-center font-serif text-[27px] font-normal leading-tight">How Recoup works</h3>
      <p className="mb-6 mt-1 text-center font-serif text-[15px] italic text-muted-foreground">
        Five stages, one direction - with everything auditable on the way through
      </p>

      <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr_24px_1fr_24px_1fr] items-stretch gap-2.5 max-[1180px]:grid-cols-1">
        {pipelineStages.map((stage, index) => (
          <div className="contents" key={stage.title}>
            <Card className="gap-0 rounded-xl border border-border bg-card p-4 shadow-sm ring-0">
              <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-primary py-1 pl-1.5 pr-3 text-xs font-semibold text-primary-foreground">
                <span className="grid size-[18px] place-items-center rounded-full bg-white/20 font-mono text-[11px]">{stage.number}</span>
                {stage.title}
              </span>
              <div className="mb-2.5 grid size-9 place-items-center rounded-lg bg-[color:var(--primary-tint)] text-primary">
                <stage.Icon className="size-[18px]" />
              </div>
              <p className="m-0 mb-2.5 text-[13px] font-semibold leading-5">{stage.summary}</p>
              <ul className="mt-auto flex list-none flex-col gap-1.5 p-0">
                {stage.items.map((item) => (
                  <li className="relative pl-3 text-xs leading-5 text-muted-foreground before:absolute before:left-0 before:top-2 before:size-1.5 before:rounded-full before:border before:border-primary before:bg-[color:var(--primary-subtle)]" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
            {index < pipelineStages.length - 1 ? (
              <div className="grid place-items-center text-muted-foreground max-[1180px]:rotate-90">
                <ArrowRight className="size-4" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="my-6 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] px-4 py-2 text-center text-xs font-semibold text-primary">
          <ShieldCheck className="size-4" />
          Governed end to end - 28 machine-verifiable invariants enforced in CI
        </span>
      </div>

      <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
        {cockpitCards.map((card) => (
          <Card className="grid grid-cols-[52px_minmax(0,1fr)] gap-4 rounded-xl border border-border bg-card p-5 shadow-sm ring-0" key={card.title}>
            <div className="grid size-[52px] place-items-center rounded-full bg-secondary text-primary">
              <card.Icon className="size-5" />
            </div>
            <div>
              <h3 className="m-0 text-[15px] font-semibold">{card.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{card.description}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {governanceChips.map((chip) => (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-secondary-foreground shadow-sm"
            key={chip}
          >
            <CheckIcon className="size-3.5 text-primary" />
            {chip}
          </span>
        ))}
      </div>
    </TabsContent>
  );
}
