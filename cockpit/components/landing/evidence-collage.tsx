import { ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { evidenceCitations } from "./landing-content.ts";

export function EvidenceCollage() {
  return (
    <aside
      aria-label="Product evidence preview"
      className="relative rounded-[16px] border border-border/70 bg-card p-8 shadow-sm max-[900px]:p-5"
      data-testid="recoup-landing-evidence-collage"
      style={{
        background:
          "radial-gradient(420px 260px at 80% 10%, var(--atmos-mint) 0%, transparent 72%), radial-gradient(360px 240px at 10% 90%, var(--atmos-sand) 0%, transparent 74%), var(--card)"
      }}
    >
      <div className="flex flex-col gap-3.5">
        <Card className="gap-0 rounded-xl border border-border bg-card p-4 shadow-md ring-0 [transform:rotate(-0.6deg)]">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <h3 className="m-0 text-[13px] font-semibold">Cited answer</h3>
            <Badge className="ml-auto rounded-sm border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] font-mono text-[11px] text-primary">
              3 citations
            </Badge>
          </div>
          <p className="m-0 text-[13px] leading-5 text-secondary-foreground">
            Shortage claim DED-4411 is invalid. The proof of delivery confirms full receipt at the retailer DC.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {evidenceCitations.map((citation) => (
              <span
                className="rounded-sm border border-[color:var(--primary-subtle)] bg-[color:var(--primary-tint)] px-2 py-1 font-mono text-[11px] text-primary"
                key={citation}
              >
                {citation}
              </span>
            ))}
          </div>
        </Card>

        <Card className="ml-auto w-[88%] gap-0 rounded-xl border border-border bg-card p-4 shadow-md ring-0 [transform:rotate(0.5deg)] max-[640px]:w-full">
          <div className="mb-2 flex items-center gap-2">
            <UserCheck className="size-4 shrink-0 text-primary" />
            <h3 className="m-0 text-[13px] font-semibold">Approval required</h3>
            <Badge className="ml-auto rounded-sm font-mono text-[11px]" variant="outline">
              HITL
            </Badge>
          </div>
          <p className="m-0 text-[13px] leading-5 text-secondary-foreground">
            Recovery draft is staged, not dispatched. A human approver must review the evidence packet.
          </p>
          <div className="mt-3 flex gap-2">
            <span className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Approve</span>
            <span className="rounded-md border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-secondary-foreground">Reject</span>
          </div>
        </Card>

        <Card className="w-[76%] flex-row items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 shadow-md ring-0 [transform:rotate(-0.4deg)] max-[640px]:w-full">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">audit #a41f...9c02 · chain verified</span>
        </Card>
      </div>

      <p className="mt-4 text-center font-serif text-base italic text-secondary-foreground">Every decision cites evidence.</p>
    </aside>
  );
}
