"use client";

import { useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AboutPanel } from "./about-panel.tsx";
import { BuildPanel } from "./build-panel.tsx";
import { CtaBand } from "./cta-band.tsx";
import { DemoPanel } from "./demo-panel.tsx";
import { LandingHeader } from "./landing-header.tsx";
import { LandingHero } from "./landing-hero.tsx";
import { isLandingTab, landingTabs, landingThemeVariables, type LandingTab } from "./landing-content.ts";
import { ProblemPanel } from "./problem-panel.tsx";
import { SolutionPanel } from "./solution-panel.tsx";
import { TechPanel } from "./tech-panel.tsx";

export function LandingShell() {
  const [activeTab, setActiveTab] = useState<LandingTab>("problem");
  const tabsAnchorRef = useRef<HTMLDivElement>(null);

  function handleHeaderTabSelect(tab: LandingTab): void {
    setActiveTab(tab);
    tabsAnchorRef.current?.scrollIntoView({ block: "start" });
  }

  function handleTabValueChange(value: string): void {
    if (isLandingTab(value)) {
      setActiveTab(value);
    }
  }

  return (
    <div
      className="min-h-dvh bg-background font-sans text-foreground selection:bg-primary/20"
      data-testid="recoup-landing-page"
      style={landingThemeVariables}
    >
      <LandingHeader activeTab={activeTab} onTabSelect={handleHeaderTabSelect} />
      <main>
        <LandingHero />

        <section
          className="mx-auto w-full max-w-[1680px] px-7 pb-2 max-[900px]:px-4"
          data-testid="recoup-landing-shell"
          ref={tabsAnchorRef}
        >
          <Tabs
            className="w-full gap-0"
            data-testid="recoup-landing-tabs"
            onValueChange={handleTabValueChange}
            value={activeTab}
          >
            <div className="sticky top-[60px] z-30 bg-gradient-to-b from-background from-80% to-transparent py-3.5">
              <TabsList
                aria-label="Recoup overview sections"
                className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-[10px] border border-border/70 bg-muted p-1"
              >
                {landingTabs.map((tab) => (
                  <TabsTrigger
                    className="min-h-9 flex-1 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-primary data-active:shadow-sm max-[640px]:flex-none"
                    key={tab.value}
                    value={tab.value}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <ProblemPanel />
            <SolutionPanel />
            <DemoPanel />
            <TechPanel />
            <BuildPanel />
            <AboutPanel />
          </Tabs>
        </section>
      </main>

      <CtaBand />

      <footer className="px-4 py-8 text-center text-xs text-muted-foreground">
        Recoup - agentic Order-to-Cash recovery cockpit · Hackathon demo · Synthetic data, real governance
      </footer>
    </div>
  );
}
