"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  BellIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileCheck2Icon,
  FileTextIcon,
  GaugeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  PieChartIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  UserRoundIcon
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
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { DemoSession } from "../../app/demo-auth.ts";

interface MayaWorkspaceShellProps {
  children: ReactNode;
  pendingActionCount: number;
  refreshedLabel: string;
  session: DemoSession;
  worklistCount: number;
}

const navItems = [
  { icon: LayoutDashboardIcon, isActive: true, label: "Overview" },
  { count: "worklist" as const, icon: ClipboardListIcon, label: "Worklist" },
  { icon: FileTextIcon, label: "Cases" },
  { icon: InboxIcon, label: "Deductions" },
  { icon: FileCheck2Icon, label: "Evidence" },
  { count: "approvals" as const, icon: InboxIcon, label: "Approvals" },
  { icon: GaugeIcon, label: "Run trace" },
  { icon: PieChartIcon, label: "Analytics" },
  { icon: SlidersHorizontalIcon, label: "Configuration" }
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
  children,
  pendingActionCount,
  refreshedLabel,
  session,
  worklistCount
}: MayaWorkspaceShellProps) {
  const firstName = session.displayName.split(" ")[0] ?? session.displayName;

  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <Sidebar className="min-h-svh border-sidebar-border bg-sidebar" collapsible="none" data-testid="maya-sidebar">
        <SidebarHeader className="gap-4 p-4 pb-4">
          <div className="flex min-h-16 min-w-0 items-center justify-between gap-2" data-testid="maya-sidebar-brand">
            <div className="flex min-w-0 items-center gap-2.5">
              <RecoupBrandMark />
              <div className="grid min-w-0 gap-1.5">
                <strong className="truncate text-[22px] font-semibold leading-none">Recoup</strong>
                <span className="truncate text-xs font-medium text-sidebar-foreground/75">Deduction Forensics</span>
              </div>
            </div>
          </div>
          <Button
            className="h-9 justify-between border-sidebar-border bg-sidebar-accent/30 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            size="sm"
            type="button"
            variant="outline"
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <ClipboardListIcon aria-hidden="true" data-icon="inline-start" />
              <span className="truncate">Maya Forensics</span>
            </span>
            <ChevronDownIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
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
                        className={cn(
                          "h-9 px-3",
                          "data-[active=true]:bg-sidebar-primary/25 data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm"
                        )}
                        isActive={"isActive" in item}
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
        <SidebarFooter className="mt-auto gap-3 p-4" data-testid="maya-sidebar-footer">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
              <UserRoundIcon aria-hidden="true" data-icon="sidebar-user" />
            </div>
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-sm">{session.displayName}</strong>
              <span className="truncate text-xs text-sidebar-foreground/70">Forensics analyst</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-sidebar-foreground/65">
            <span>Read-only demo access</span>
            <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
              Active
            </Badge>
          </div>
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
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
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
