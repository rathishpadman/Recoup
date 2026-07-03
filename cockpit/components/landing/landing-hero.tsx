import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceCollage } from "./evidence-collage.tsx";
import { davidLoginHref, heroMantra, mayaLoginHref } from "./landing-content.ts";

const heroEyebrowStyle = {
  fontFamily: "var(--font-editorial)"
} satisfies CSSProperties;

const heroTitleStyle = {
  fontFamily: "var(--font-editorial)",
  fontOpticalSizing: "auto",
  fontSize: "clamp(32px, 3.4vw, 50px)",
  fontWeight: 400,
  lineHeight: 1.08,
  letterSpacing: 0
} satisfies CSSProperties;

export function LandingHero() {
  return (
    <section className="relative overflow-hidden py-14 max-[900px]:py-10" data-testid="recoup-landing-hero" id="recoup-landing-top">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(560px 320px at 78% 20%, var(--atmos-mint) 0%, transparent 70%), radial-gradient(480px 280px at 96% 70%, var(--atmos-sky) 0%, transparent 70%), radial-gradient(520px 300px at 8% 96%, var(--atmos-sand) 0%, transparent 72%)"
        }}
      />
      <div className="relative mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center gap-14 px-7 max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[900px]:px-4">
        <div>
          <p className="mb-2 text-[15px] italic text-muted-foreground" style={heroEyebrowStyle}>
            Agentic order-to-cash
          </p>
          <h1 className="m-0 max-w-[760px] text-foreground" style={heroTitleStyle}>
            CPG manufacturers lose <span className="italic text-primary">2–5% of gross revenue</span> to retailer deductions.
            Most never get it back.
          </h1>
          <p className="mt-4 max-w-[560px] text-[17px] leading-7 text-[color:var(--text-secondary)]">
            Recoup is an agentic Order-to-Cash recovery cockpit, evidence-backed, governed, and auditable by design.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-y-2">
            {heroMantra.map((item, index) => (
              <span className="contents" key={item.label}>
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-secondary-foreground">
                  <item.Icon className="size-4 text-primary" />
                  {item.label}
                </span>
                {index < heroMantra.length - 1 ? <span className="mx-3.5 h-4 w-px bg-border" /> : null}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-stretch gap-3.5">
            <div className="flex min-w-[210px] flex-col gap-1.5">
              <Button
                asChild
                className="h-[46px] rounded-md px-5 text-[15px] font-semibold hover:bg-[color:var(--primary-hover)]"
                data-testid="recoup-landing-hero-maya-cta"
                size="lg"
              >
                <a href={mayaLoginHref}>
                  Enter as Maya
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </a>
              </Button>
              <span className="text-center text-xs text-muted-foreground">Senior Deductions Analyst - forensics & recovery</span>
            </div>
            <div className="flex min-w-[210px] flex-col gap-1.5">
              <Button
                asChild
                className="h-[46px] rounded-md border-border bg-card px-5 text-[15px] font-semibold"
                data-testid="recoup-landing-hero-david-cta"
                size="lg"
                variant="outline"
              >
                <a href={davidLoginHref}>
                  Enter as David
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </a>
              </Button>
              <span className="text-center text-xs text-muted-foreground">Director of Credit & Collections - risk arbitration</span>
            </div>
          </div>
        </div>

        <EvidenceCollage />
      </div>
    </section>
  );
}
