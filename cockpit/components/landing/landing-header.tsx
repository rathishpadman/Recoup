import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { davidLoginHref, landingTabs, mayaLoginHref, type LandingTab } from "./landing-content.ts";

interface LandingHeaderProps {
  activeTab: LandingTab;
  onTabSelect: (tab: LandingTab) => void;
}

export function LandingHeader({ activeTab, onTabSelect }: LandingHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 h-[60px] border-b border-border/70 bg-background/90 backdrop-blur-md"
      data-testid="recoup-landing-header"
    >
      <div className="mx-auto flex h-full w-full max-w-[1680px] items-center justify-between gap-5 px-7 max-[900px]:px-4 max-[520px]:gap-3 max-[520px]:px-3">
        <a className="flex shrink-0 items-center gap-2.5 text-foreground no-underline" href="#recoup-landing-top">
          <span className="grid size-7 place-items-center rounded-md bg-primary font-serif text-[17px] font-medium text-primary-foreground">
            R
          </span>
          <span className="text-base font-semibold max-[520px]:sr-only">Recoup</span>
        </a>

        <nav aria-label="Sections" className="flex items-center gap-0.5 max-[1180px]:hidden">
          {landingTabs.map((tab) => (
            <button
              aria-current={activeTab === tab.value ? "page" : undefined}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring data-[active=true]:font-semibold data-[active=true]:text-primary"
              data-active={activeTab === tab.value}
              key={tab.value}
              onClick={() => {
                onTabSelect(tab.value);
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            className="h-8 rounded-md px-3 text-[13px] font-semibold max-[520px]:px-2 max-[520px]:text-[12px]"
            data-testid="recoup-landing-header-maya-cta"
            size="sm"
          >
            <a href={mayaLoginHref}>
              Enter as Maya
              <ArrowRight className="size-3.5" data-icon="inline-end" />
            </a>
          </Button>
          <Button
            asChild
            className="h-8 rounded-md border-border bg-card px-3 text-[13px] font-semibold max-[520px]:px-2 max-[520px]:text-[12px]"
            data-testid="recoup-landing-header-david-cta"
            size="sm"
            variant="outline"
          >
            <a href={davidLoginHref}>Enter as David</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
