"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  BellIcon,
  BotIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileTextIcon,
  FilterIcon,
  FileCheck2Icon,
  GaugeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  PieChartIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  UserRoundIcon
} from "lucide-react";
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
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import type { DemoSession } from "../../app/demo-auth.ts";

interface MayaWorkspaceShellProps {
  children: ReactNode;
  pendingActionCount: number;
  refreshedLabel: string;
  session: DemoSession;
  worklistCount: number;
}

export function MayaWorkspaceShell({
  children,
  pendingActionCount,
  refreshedLabel,
  session,
  worklistCount
}: MayaWorkspaceShellProps) {
  const firstName = session.displayName.split(" ")[0] ?? session.displayName;

  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <Sidebar className="border-sidebar-border bg-sidebar" collapsible="none">
        <SidebarHeader className="gap-5 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-lg text-sidebar-accent-foreground">
              <RotateCcwIcon aria-hidden="true" data-icon="sidebar-brand" />
            </div>
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-xl font-semibold leading-none">Recoup</strong>
              <span className="truncate text-xs text-sidebar-foreground/70">Deduction Forensics</span>
            </div>
          </div>
          <Button
            className="h-10 justify-between border-sidebar-border bg-sidebar-accent/35 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            size="lg"
            type="button"
            variant="outline"
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <BotIcon aria-hidden="true" data-icon="inline-start" />
              <span className="truncate">Maya Forensics</span>
            </span>
            <ChevronDownIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" isActive tooltip="Overview" type="button">
                    <LayoutDashboardIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Overview</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Worklist" type="button">
                    <ClipboardListIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Worklist</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="right-2 rounded-full bg-sidebar-accent px-2 text-sidebar-accent-foreground">
                    {worklistCount}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Cases" type="button">
                    <FileTextIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Cases</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Deductions" type="button">
                    <InboxIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Deductions</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Evidence" type="button">
                    <FileCheck2Icon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Evidence</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Approvals" type="button">
                    <InboxIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Approvals</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="right-2 rounded-full bg-sidebar-accent px-2 text-sidebar-accent-foreground">
                    {pendingActionCount}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Run trace" type="button">
                    <GaugeIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Run trace</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Analytics" type="button">
                    <PieChartIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Analytics</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="h-10 px-3" tooltip="Configuration" type="button">
                    <SlidersHorizontalIcon aria-hidden="true" data-icon="sidebar-menu" />
                    <span>Configuration</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter className="gap-3 p-4">
          <Button
            aria-label="Filters unavailable"
            className="h-9 justify-between border-sidebar-border bg-transparent px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            disabled
            type="button"
            variant="outline"
          >
            <span className="inline-flex items-center gap-2">
              <FilterIcon aria-hidden="true" data-icon="inline-start" />
              Filters
            </span>
            <ChevronDownIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
              <UserRoundIcon aria-hidden="true" data-icon="sidebar-user" />
            </div>
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-sm">{session.displayName}</strong>
              <span className="truncate text-xs text-sidebar-foreground/70">Forensics analyst</span>
            </div>
          </div>
          <span className="text-xs text-sidebar-foreground/60">Read-only demo access</span>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-svh bg-background text-foreground" data-testid="maya-shadcn-workbench">
        <header className="flex min-w-0 items-center justify-between gap-4 px-5 py-6">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <div className="grid min-w-0 gap-1">
              <h1 className="truncate text-2xl font-semibold leading-none">Welcome back, {firstName}</h1>
              <p className="truncate text-sm text-muted-foreground">Here's what's happening in Maya Forensics.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex h-8 items-center gap-2 text-sm text-muted-foreground">
              <CalendarIcon aria-hidden="true" data-icon="inline-start" />
              {refreshedLabel}
            </span>
            <span
              aria-label={`${pendingActionCount.toString()} pending human actions`}
              className="relative inline-flex size-8 items-center justify-center rounded-lg border bg-background text-foreground"
            >
              <BellIcon aria-hidden="true" data-icon="header-notification" />
              <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
                {pendingActionCount}
              </span>
            </span>
            <Button
              onClick={() => {
                window.location.reload();
              }}
              size="lg"
              type="button"
              variant="outline"
            >
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col px-5 pb-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
