import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { painPoints, problemStats } from "./landing-content.ts";

export function ProblemPanel() {
  return (
    <TabsContent className="m-0 pb-16 pt-2" data-testid="recoup-landing-tab-problem" value="problem">
      <div className="mb-7 max-w-[820px]">
        <p className="mb-2 font-serif text-[15px] italic text-muted-foreground">The problem - measured</p>
        <h2 className="m-0 font-serif text-3xl font-normal leading-tight text-foreground">Deductions quietly drain revenue, and the proof is scattered.</h2>
      </div>

      <div className="grid grid-cols-3 gap-5 max-[900px]:grid-cols-1">
        {problemStats.map((stat) => (
          <Card className="gap-0 rounded-xl border border-border bg-card p-6 shadow-sm ring-0" key={stat.label}>
            <div className="flex items-center gap-4">
              <div className="grid size-[46px] shrink-0 place-items-center rounded-full bg-[color:var(--primary-tint)] text-primary">
                <stat.Icon className="size-5" />
              </div>
              <p className="m-0 font-serif text-4xl font-normal leading-none text-foreground">{stat.value}</p>
            </div>
            <p className="mt-3 text-[14px] leading-5 text-[color:var(--text-secondary)]">{stat.label}</p>
            <Badge className="mt-3 w-fit rounded-sm border-border bg-card text-[11px] font-medium text-muted-foreground" variant="outline">
              {stat.source}
            </Badge>
          </Card>
        ))}
      </div>

      <blockquote className="my-6 flex items-center gap-5 rounded-r-lg border-l-[3px] border-primary bg-[color:var(--primary-tint)] px-7 py-5 max-[900px]:items-start max-[900px]:gap-3">
        <span aria-hidden="true" className="font-serif text-6xl leading-none text-primary max-[900px]:hidden">
          &ldquo;
        </span>
        <p className="m-0 flex-1 font-serif text-[19px] italic leading-7 text-secondary-foreground">
          "O2C leakages amount to 3–5% of EBITDA. AI-backed tools can help recapture invalid credit memo value."
        </p>
        <cite className="shrink-0 text-[13px] font-semibold not-italic text-primary max-[900px]:hidden">- McKinsey & Company, 2026</cite>
      </blockquote>

      <div className="grid grid-cols-3 gap-7 max-[900px]:grid-cols-1">
        {painPoints.map((point) => (
          <div className="flex items-start gap-4" key={point.title}>
            <div className="grid size-[52px] shrink-0 place-items-center rounded-full bg-secondary text-primary">
              <point.Icon className="size-5" />
            </div>
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-foreground">{point.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{point.description}</p>
            </div>
          </div>
        ))}
      </div>
    </TabsContent>
  );
}
