import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { davidLoginHref, mayaLoginHref, UsersIcon } from "./landing-content.ts";

export function CtaBand() {
  return (
    <section
      className="border-y border-border/70 bg-card py-8"
      data-testid="recoup-landing-bottom-cta"
      style={{
        background:
          "radial-gradient(600px 200px at 12% 50%, rgba(242, 228, 208, 0.55) 0%, transparent 75%), radial-gradient(600px 200px at 88% 50%, rgba(191, 227, 222, 0.45) 0%, transparent 75%), var(--card)"
      }}
    >
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-7 px-7 max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:px-4">
        <div className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-full bg-[color:var(--primary-tint)] text-primary">
            <UsersIcon className="size-5" />
          </div>
          <h2 className="m-0 font-serif text-2xl font-normal">Enter the cockpit experience</h2>
        </div>
        <div className="flex flex-wrap gap-3.5 max-[900px]:flex-col">
          <div className="flex min-w-[230px] flex-col gap-1.5">
            <Button
              asChild
              className="h-10 rounded-md text-sm font-semibold hover:bg-[color:var(--primary-hover)]"
              data-testid="recoup-landing-enter-cta"
            >
              <a href={mayaLoginHref}>
                Enter as Maya
                <ArrowRight className="size-4" data-icon="inline-end" />
              </a>
            </Button>
            <span className="text-center text-xs text-muted-foreground">Deductions & Recovery Cockpit</span>
          </div>
          <div className="flex min-w-[230px] flex-col gap-1.5">
            <Button asChild className="h-10 rounded-md border-border bg-card text-sm font-semibold" variant="outline">
              <a href={davidLoginHref}>
                Enter as David
                <ArrowRight className="size-4" data-icon="inline-end" />
              </a>
            </Button>
            <span className="text-center text-xs text-muted-foreground">Weekly Credit Risk Review</span>
          </div>
        </div>
      </div>
    </section>
  );
}
