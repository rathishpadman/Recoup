"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  BellIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  FileCheck2Icon,
  FileTextIcon,
  InboxIcon,
  LayoutDashboardIcon,
  RefreshCwIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LogoutButton } from "../../app/logout-button.tsx";
import type { DemoSession } from "../../app/demo-auth.ts";
import type { MayaSurfaceSection } from "./types.ts";

interface MayaWorkspaceShellProps {
  activeSection: MayaSurfaceSection;
  children: ReactNode;
  heading?: string;
  onSectionChange?: (section: MayaSurfaceSection) => void;
  pendingActionCount: number;
  refreshedLabel: string;
  session: DemoSession;
  support?: string;
  worklistCount: number;
}

const navItems = [
  { icon: LayoutDashboardIcon, label: "Overview", section: "overview" },
  { count: "worklist" as const, icon: ClipboardListIcon, label: "Worklist", section: "worklist" },
  { icon: FileTextIcon, label: "Cases", section: "cases" },
  { icon: FileCheck2Icon, label: "Evidence", section: "evidence" },
  { count: "approvals" as const, icon: InboxIcon, label: "Approvals", section: "approvals" }
] as const;

function RecoupBrandMark() {
  return (
    <svg aria-hidden="true" className="size-10 shrink-0 text-sidebar-foreground" viewBox="0 0 40 40">
      <path
        d="M29.2 12.4A12.2 12.2 0 1 0 31 25.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3.1"
      />
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

export function MayaWorkspaceShell({
  activeSection,
  children,
  heading,
  onSectionChange,
  pendingActionCount,
  refreshedLabel,
  session,
  support,
  worklistCount
}: MayaWorkspaceShellProps) {
  const firstName = session.displayName.split(" ")[0] ?? session.displayName;
  const displayHeading = heading ?? `Welcome back, ${firstName}`;
  const displaySupport = support ?? "Here's what's happening in Maya Forensics.";

  return (
    <SidebarProvider
      className="min-h-svh items-stretch bg-background [&_[data-slot=sidebar-container]]:!absolute [&_[data-slot=sidebar-container]]:!h-full [&_[data-slot=sidebar-container]]:!min-h-full [&_[data-slot=sidebar-gap]]:min-h-full [&_[data-slot=sidebar-gap]]:bg-sidebar [&_[data-slot=sidebar]]:relative [&_[data-slot=sidebar]]:min-h-full [&_[data-slot=sidebar]]:self-stretch"
      defaultOpen
      style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4.5rem" } as CSSProperties}
    >
      <Sidebar className="min-h-svh border-sidebar-border bg-sidebar" collapsible="icon" data-testid="maya-sidebar">
        <SidebarHeader className="gap-4 p-4 pb-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-3">
          <div className="flex min-h-16 min-w-0 items-center justify-between gap-2" data-testid="maya-sidebar-brand">
            <div className="flex min-w-0 items-center gap-2.5">
              <RecoupBrandMark />
              <div className="grid min-w-0 gap-1.5 group-data-[collapsible=icon]:hidden">
                <strong className="truncate text-[22px] font-semibold leading-none">Recoup</strong>
                <span className="truncate text-xs font-medium text-sidebar-foreground/75">Deduction Forensics</span>
              </div>
            </div>
            <SidebarTrigger
              aria-label="Collapse Maya navigation"
              className="hidden text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:inline-flex group-data-[collapsible=icon]:hidden"
            />
          </div>
          <div
            className="flex h-9 items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 text-sm font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            data-testid="maya-sidebar-surface-label"
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <ClipboardListIcon aria-hidden="true" data-icon="inline-start" />
              <span className="truncate">Maya Forensics</span>
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {navItems.map((item) => {
                  const NavIcon = item.icon;
                  const count =
                    "count" in item
                      ? item.count === "worklist"
                        ? worklistCount
                        : pendingActionCount
                      : undefined;

                  return (
                    <SidebarMenuItem data-testid="maya-sidebar-nav-item" key={item.label}>
                      <SidebarMenuButton
                        aria-current={item.section === activeSection ? "page" : undefined}
                        className={cn(
                          "h-9 px-3",
                          "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-sm"
                        )}
                        disabled={onSectionChange === undefined}
                        isActive={item.section === activeSection}
                        onClick={() => {
                          onSectionChange?.(item.section);
                        }}
                        tooltip={item.label}
                        type="button"
                      >
                        <NavIcon aria-hidden="true" data-icon="sidebar-menu" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {count === undefined ? null : (
                        <SidebarMenuBadge
                          className="right-2 rounded-full bg-sidebar-accent px-2 text-sidebar-accent-foreground"
                          data-testid="maya-sidebar-badge"
                        >
                          {count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter className="mt-auto gap-3 p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3" data-testid="maya-sidebar-footer">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
              {session.displayName.charAt(0)}
            </div>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <strong className="truncate text-sm">{session.displayName}</strong>
              <span className="truncate text-xs text-sidebar-foreground/70">Forensics analyst</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-sidebar-foreground/65 group-data-[collapsible=icon]:hidden">
            <span>Read-only demo access</span>
            <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
              {pendingActionCount.toString()} HITL
            </Badge>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-svh bg-background text-foreground" data-testid="maya-shadcn-workbench">
        <header className="flex min-w-0 items-center justify-between gap-4 px-5 py-5">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <div className="grid min-w-0 gap-1">
              <h1 className="truncate text-2xl font-semibold leading-none">{displayHeading}</h1>
              <p className="truncate text-sm text-muted-foreground">{displaySupport}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="Run date not exposed by the read model"
                  className="hidden h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground 2xl:inline-flex"
                  data-testid="maya-run-date-contract-gap"
                >
                  <CalendarClockIcon aria-hidden="true" data-icon="inline-start" />
                  Run date unavailable
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span>No run date field is exposed by the read model.</span>
              </TooltipContent>
            </Tooltip>
            <span
              className="hidden h-8 items-center gap-1.5 px-1.5 text-xs text-muted-foreground lg:inline-flex"
              data-testid="maya-refresh-metadata"
            >
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
              {refreshedLabel}
            </span>
            <span
              aria-label={`${pendingActionCount.toString()} pending human actions`}
              className="relative inline-flex size-8 items-center justify-center rounded-md border bg-background text-foreground"
            >
              <BellIcon aria-hidden="true" data-icon="header-notification" />
              <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
                {pendingActionCount}
              </span>
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex" data-testid="maya-refresh-contract-gap">
                  <Button
                    aria-label="Refresh unavailable: no backend refresh action is exposed by the read model"
                    disabled
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
                    Refresh
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span>No backend refresh action is exposed by the read model.</span>
              </TooltipContent>
            </Tooltip>
            <LogoutButton className="inline-flex" size="sm" variant="outline">
              Sign out
            </LogoutButton>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col px-5 pb-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
