"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ClipboardListIcon,
  LayoutDashboardIcon,
  SearchIcon,
  SendIcon,
  ShieldAlertIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { LogoutButton } from "../../app/logout-button.tsx";
import type { CreditRiskReviewModel } from "../../app/cockpit-data.ts";
import { davidAccent } from "./david-accent.ts";
import { DavidSourcesDrawer } from "./david-sources-drawer.tsx";

export type DavidSurfaceSection = "action-packets" | "risk-review" | "watchlist";

interface DavidWorkspaceShellProps {
  activeSection: DavidSurfaceSection;
  children: ReactNode;
  displayName: string;
  navCounts: CreditRiskReviewModel["navCounts"];
  onSearchChange: (value: string) => void;
  onSectionChange: (section: DavidSurfaceSection) => void;
  readySections?: readonly DavidSurfaceSection[];
  runSummary: string;
  searchValue: string;
  sources: CreditRiskReviewModel["sources"];
  walkthroughStrip?: ReactNode;
}

const navItems: ReadonlyArray<{
  countKey: keyof CreditRiskReviewModel["navCounts"];
  icon: typeof ClipboardListIcon;
  label: string;
  section: DavidSurfaceSection;
}> = [
  { countKey: "riskReview", icon: LayoutDashboardIcon, label: "Risk review", section: "risk-review" },
  { countKey: "actionPackets", icon: SendIcon, label: "Action packets", section: "action-packets" },
  { countKey: "watchlist", icon: ShieldAlertIcon, label: "Behavioural watchlist", section: "watchlist" }
];

function RecoupBrandMark() {
  return (
    <svg aria-hidden="true" className="size-10 shrink-0 text-[color:var(--maya-accent-light)]" viewBox="0 0 40 40">
      <path d="M29.2 12.4A12.2 12.2 0 1 0 31 25.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3.1" />
      <path
        d="M29.6 5.8v8.3h-8.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.1"
      />
    </svg>
  );
}

export function DavidWorkspaceShell({
  activeSection,
  children,
  displayName,
  navCounts,
  onSearchChange,
  onSectionChange,
  readySections = ["risk-review"],
  runSummary,
  searchValue,
  sources,
  walkthroughStrip
}: Readonly<DavidWorkspaceShellProps>) {
  const readySectionSet = new Set(readySections);

  return (
    <SidebarProvider
      className={cn(
        "min-h-svh items-stretch bg-background [&_[data-mobile=true]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar-container]]:!absolute [&_[data-slot=sidebar-container]]:!h-full [&_[data-slot=sidebar-container]]:!min-h-full [&_[data-slot=sidebar-gap]]:min-h-full [&_[data-slot=sidebar-gap]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar-inner]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar]]:relative [&_[data-slot=sidebar]]:min-h-full [&_[data-slot=sidebar]]:self-stretch",
        davidAccent.appFrame
      )}
      defaultOpen
      style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4.5rem" } as CSSProperties}
    >
      <Sidebar className={cn("min-h-svh border-sidebar-border bg-sidebar", davidAccent.sidebar)} collapsible="icon" data-testid="david-sidebar">
        <SidebarHeader className="gap-4 p-4 pb-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-3">
          <div className="flex min-h-16 min-w-0 items-center justify-between gap-2" data-testid="david-sidebar-brand">
            <div className="flex min-w-0 items-center gap-2.5">
              <RecoupBrandMark />
              <div className="grid min-w-0 gap-1.5 group-data-[collapsible=icon]:hidden">
                <strong className="truncate text-[22px] font-semibold leading-none">Recoup</strong>
                <span className="truncate text-xs font-medium text-[color:var(--maya-accent-sidebar-muted)]">Credit risk review</span>
              </div>
            </div>
            <SidebarTrigger
              aria-label="Collapse David navigation"
              className="hidden text-[color:var(--maya-accent-sidebar-muted)] hover:bg-[color:var(--maya-accent-sidebar-active)] hover:text-white md:inline-flex group-data-[collapsible=icon]:hidden"
            />
          </div>
          <div
            className="flex h-9 items-center gap-2 rounded-md border border-transparent bg-[color:var(--maya-accent-sidebar-active)] px-3 text-sm font-medium text-white shadow-none group-data-[collapsible=icon]:hidden"
            data-testid="david-sidebar-surface-label"
          >
            <ClipboardListIcon aria-hidden="true" data-icon="inline-start" />
            <span className="truncate">Weekly credit review</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {navItems.map((item) => {
                  const NavIcon = item.icon;
                  const isReady = readySectionSet.has(item.section);

                  return (
                    <SidebarMenuItem data-testid="david-sidebar-nav-item" key={item.label}>
                      <SidebarMenuButton
                        aria-current={item.section === activeSection ? "page" : undefined}
                        className="h-9 border border-transparent px-3 hover:bg-[color:var(--maya-accent-sidebar-active)] hover:text-white data-[active=true]:border-transparent data-[active=true]:bg-[color:var(--maya-accent-sidebar-active)] data-[active=true]:text-white data-[active=true]:shadow-none"
                        disabled={!isReady}
                        isActive={item.section === activeSection}
                        onClick={() => {
                          if (isReady) {
                            onSectionChange(item.section);
                          }
                        }}
                        tooltip={item.label}
                        type="button"
                      >
                        <NavIcon aria-hidden="true" data-icon="sidebar-menu" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge
                        className="right-2 rounded-full border border-[color:var(--maya-accent-sidebar-border)] bg-[color:var(--maya-accent-sidebar-active)] px-2 text-white"
                        data-testid="david-sidebar-badge"
                      >
                        {navCounts[item.countKey].toString()}
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator className="bg-[color:var(--maya-accent-sidebar-border)]" />
        <SidebarFooter className="mt-auto gap-3 p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3" data-testid="david-sidebar-footer">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--maya-accent-border)] bg-[color:var(--maya-accent-surface)] text-sm font-medium text-[color:var(--maya-accent-strong)]">
              {displayName.charAt(0)}
            </div>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <strong className="truncate text-sm">{displayName}</strong>
              <span className="truncate text-xs text-[color:var(--maya-accent-sidebar-muted)]">Director, Credit & Collections</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--maya-accent-sidebar-muted)] group-data-[collapsible=icon]:hidden">
            <span>Read-only demo access</span>
            <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
              Current persona
            </Badge>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-svh bg-background text-foreground" data-testid="david-shadcn-workbench">
        <div className="flex min-w-0 flex-1 flex-col px-5 py-5">
          <div className="grid gap-4">
            {walkthroughStrip}
            <header className="grid gap-4 rounded-lg border bg-background/95 px-4 py-4 shadow-[var(--shadow-xs)]">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <SidebarTrigger className="md:hidden" />
                  <Badge variant="outline">{displayName}</Badge>
                  <div className="inline-flex min-w-0 items-center rounded-md border bg-muted/35 px-3 py-2 text-sm font-medium">
                    <span className="truncate">{runSummary}</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 sm:flex-row xl:max-w-4xl xl:justify-end">
                  <div className="min-w-0 sm:flex-1 xl:min-w-[24rem] xl:max-w-[30rem]">
                    <InputGroup className="h-9">
                      <InputGroupAddon>
                        <SearchIcon aria-hidden="true" data-icon="search" />
                      </InputGroupAddon>
                      <InputGroupInput
                        aria-label="Search accounts in review"
                        onChange={(event) => {
                          onSearchChange(event.target.value);
                        }}
                        placeholder="Search customer, channel, or account"
                        value={searchValue}
                      />
                    </InputGroup>
                  </div>
                  <Badge className="h-9 px-3 text-xs" variant="outline">
                    {sources.topbarLabel}
                  </Badge>
                  <DavidSourcesDrawer sources={sources} />
                  <LogoutButton className="inline-flex" size="sm" variant="outline">
                    Sign out
                  </LogoutButton>
                </div>
              </div>
            </header>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
