import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { DEMO_VIDEO_URL, personaCards, PlayIcon } from "./landing-content.ts";

export function DemoPanel() {
  return (
    <TabsContent className="m-0 pb-16 pt-2" data-testid="recoup-landing-tab-demo" value="demo">
      <div className="mb-7 max-w-[820px]">
        <p className="mb-2 font-serif text-[15px] italic text-muted-foreground">The demo - pick a seat</p>
        <h2 className="m-0 font-serif text-3xl font-normal leading-tight text-foreground">Walk the cockpit as the analyst or the director.</h2>
        <p className="mt-2 text-[15px] leading-6 text-[color:var(--text-secondary)]">
          Two personas, two governed lanes. Each journey takes about five minutes and ends at a human approval gate.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
        {personaCards.map((persona) => (
          <Card className="gap-0 rounded-xl border border-border bg-card p-6 shadow-sm ring-0" key={persona.name}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <h3 className="m-0 font-serif text-2xl font-normal text-foreground">{persona.name}</h3>
              <span
                className={
                  persona.tone === "primary"
                    ? "rounded-sm border border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] px-2 py-1 text-xs font-semibold text-primary"
                    : "rounded-sm border border-border bg-card px-2 py-1 text-xs font-semibold text-muted-foreground"
                }
              >
                {persona.tone === "primary" ? "Analyst" : "Director"}
              </span>
            </div>
            <p className="m-0 text-[13px] font-medium text-muted-foreground">{persona.role}</p>
            <ol className="my-5 list-none p-0">
              {persona.journey.map((step, index) => (
                <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-3" key={step}>
                  <span className="relative flex justify-center">
                    <span className="z-10 grid size-6 place-items-center rounded-full border border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] font-mono text-[11px] text-primary">
                      {String(index + 1)}
                    </span>
                    {index < persona.journey.length - 1 ? <span className="absolute bottom-0 top-6 w-px bg-border" /> : null}
                  </span>
                  <span className="pb-3 text-[14px] leading-5 text-secondary-foreground">{step}</span>
                </li>
              ))}
            </ol>
            <Button
              asChild
              className="h-10 w-full rounded-md text-sm font-semibold"
              data-testid={persona.testId}
              variant={persona.tone === "primary" ? "default" : "outline"}
            >
              <a href={persona.href}>
                {persona.ctaLabel}
                <ArrowRight className="size-4" data-icon="inline-end" />
              </a>
            </Button>
          </Card>
        ))}
      </div>

      <Card className="mt-6 gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-0" data-testid="recoup-landing-video-card">
        <a
          className="group grid min-h-[220px] place-items-center bg-[radial-gradient(circle_at_center,var(--primary-tint),var(--card)_62%)] p-8 text-center text-foreground no-underline"
          href={DEMO_VIDEO_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="mb-4 grid size-16 place-items-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-[color:var(--primary-hover)]">
            <PlayIcon className="size-7" />
          </span>
          <span className="block font-serif text-2xl font-normal">Watch the 3-minute cockpit walkthrough</span>
          <span className="mt-2 block font-mono text-xs text-muted-foreground">youtube.com/watch?v=VIDEO_ID_HERE - placeholder</span>
        </a>
      </Card>

      <p className="mt-6 text-center font-serif text-base italic text-muted-foreground">
        Synthetic data, real governance - nothing is dispatched without a human approval.
      </p>
    </TabsContent>
  );
}
