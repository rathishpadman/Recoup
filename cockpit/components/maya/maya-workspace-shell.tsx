"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  BellIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  ShieldAlertIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LogoutButton } from "../../app/logout-button.tsx";
import type { DemoSession } from "../../app/demo-auth.ts";
import { mayaAccent } from "./maya-accent.ts";
import type { MayaSurfaceSection } from "./types.ts";

interface MayaWorkspaceShellProps {
  activeSection: MayaSurfaceSection;
  children: ReactNode;
  containmentCount: number;
  heading?: string;
  headerAction?: ReactNode;
  onSectionChange?: (section: MayaSurfaceSection) => void;
  onRefreshSources?: () => void;
  pendingActionCount: number;
  refreshError?: string;
  refreshStatus?: "error" | "idle" | "refreshing";
  refreshedLabel: string;
  session: DemoSession;
  support?: string;
  worklistCount: number;
}

const navItems = [
  { icon: LayoutDashboardIcon, label: "Overview", section: "overview" },
  { count: "worklist" as const, icon: ClipboardListIcon, label: "Worklist", section: "worklist" },
  { count: "containment" as const, icon: ShieldAlertIcon, label: "Containment", section: "containment" }
] as const;

function RecoupBrandMark() {
  return (
    <svg aria-hidden="true" className="size-10 shrink-0 text-[color:var(--maya-accent-light)]" viewBox="0 0 40 40">
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
  containmentCount,
  heading,
  headerAction,
  onSectionChange,
  onRefreshSources,
  pendingActionCount,
  refreshError,
  refreshStatus = "idle",
  refreshedLabel,
  session,
  support,
  worklistCount
}: MayaWorkspaceShellProps) {
  const displayHeading = heading ?? "Deduction forensics queue";
  const displaySupport = support ?? `${worklistCount.toString()} work items / ${pendingActionCount.toString()} human actions pending`;
  const isRefreshing = refreshStatus === "refreshing";
  const refreshStatusLabel =
    refreshStatus === "refreshing"
      ? "Refreshing source-backed work items"
      : refreshStatus === "error"
        ? refreshError ?? "Source refresh failed"
        : "Source refresh ready";

  return (
    <SidebarProvider
      className={cn(
        "min-h-svh items-stretch bg-background [&_[data-mobile=true]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar-container]]:!absolute [&_[data-slot=sidebar-container]]:!h-full [&_[data-slot=sidebar-container]]:!min-h-full [&_[data-slot=sidebar-gap]]:min-h-full [&_[data-slot=sidebar-gap]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar-inner]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar]]:relative [&_[data-slot=sidebar]]:min-h-full [&_[data-slot=sidebar]]:self-stretch",
        mayaAccent.appFrame
      )}
      defaultOpen
      style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4.5rem" } as CSSProperties}
    >
      <Sidebar className={cn("min-h-svh border-sidebar-border bg-sidebar", mayaAccent.sidebar)} collapsible="icon" data-testid="maya-sidebar">
        <SidebarHeader className="gap-4 p-4 pb-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-3">
          <div className="flex min-h-16 min-w-0 items-center justify-between gap-2" data-testid="maya-sidebar-brand">
            <div className="flex min-w-0 items-center gap-2.5">
              <RecoupBrandMark />
              <div className="grid min-w-0 gap-1.5 group-data-[collapsible=icon]:hidden">
                <strong className="truncate text-[22px] font-semibold leading-none">Recoup</strong>
                <span className="truncate text-xs font-medium text-[color:var(--maya-accent-sidebar-muted)]">Deduction Forensics</span>
              </div>
            </div>
            <SidebarTrigger
              aria-label="Collapse Maya navigation"
              className="hidden text-[color:var(--maya-accent-sidebar-muted)] hover:bg-[color:var(--maya-accent-sidebar-active)] hover:text-white md:inline-flex group-data-[collapsible=icon]:hidden"
            />
          </div>
          <div
            className={cn(
              "flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium group-data-[collapsible=icon]:hidden",
              mayaAccent.sidebarSurfaceLabel
            )}
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
                        : containmentCount
                      : undefined;

                  return (
                    <SidebarMenuItem data-testid="maya-sidebar-nav-item" key={item.label}>
                      <SidebarMenuButton
                        aria-current={item.section === activeSection ? "page" : undefined}
                        className={cn(
                          "h-9 border border-transparent px-3",
                          mayaAccent.sidebarActiveItem
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
                          className={cn("right-2 rounded-full px-2", mayaAccent.sidebarBadge)}
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
        <SidebarSeparator className="bg-[color:var(--maya-accent-sidebar-border)]" />
        <SidebarFooter className="mt-auto gap-3 p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3" data-testid="maya-sidebar-footer">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium", mayaAccent.iconBubble)}>
              {session.displayName.charAt(0)}
            </div>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <strong className="truncate text-sm">{session.displayName}</strong>
              <span className="truncate text-xs text-[color:var(--maya-accent-sidebar-muted)]">Forensics analyst</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--maya-accent-sidebar-muted)] group-data-[collapsible=icon]:hidden">
            <span>Read-only demo access</span>
            <Badge className={cn("h-5 px-1.5 text-[10px]", mayaAccent.sidebarBadge)} variant="outline">
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
              <Button
                aria-label="Open source-backed worklist"
                className="-ml-2 h-auto min-w-0 max-w-full justify-start px-2 py-0 text-sm font-normal text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                data-testid="maya-header-work-items-link"
                disabled={onSectionChange === undefined}
                onClick={() => {
                  if (onSectionChange !== undefined) {
                    onSectionChange("worklist");
                  }
                }}
                title={displaySupport}
                type="button"
                variant="ghost"
              >
                <span className="truncate">{displaySupport}</span>
              </Button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerAction}
            <span
              className="hidden h-8 items-center gap-1.5 px-1.5 text-xs text-muted-foreground lg:inline-flex"
              data-testid="maya-refresh-metadata"
            >
              <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
              {refreshedLabel}
            </span>
            {onRefreshSources === undefined ? null : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-busy={isRefreshing}
                    aria-label={isRefreshing ? "Source update in progress" : "Update source-backed work items"}
                    className={cn("size-8", mayaAccent.outlineButton)}
                    data-testid="maya-source-force-refresh"
                    disabled={isRefreshing}
                    onClick={() => {
                      if (!isRefreshing) {
                        onRefreshSources();
                      }
                    }}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon
                      aria-hidden="true"
                      className={cn(isRefreshing && "animate-spin")}
                      data-icon="button-icon"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>Update source-backed work items</span>
                </TooltipContent>
              </Tooltip>
            )}
            <span
              aria-live="polite"
              className={cn(
                refreshStatus === "idle" ? "sr-only" : "hidden h-8 items-center px-1 text-xs lg:inline-flex",
                refreshStatus === "error" ? "text-destructive" : "text-muted-foreground"
              )}
              data-testid="maya-source-force-refresh-status"
            >
              {refreshStatusLabel}
            </span>
            <span
              aria-label={`${pendingActionCount.toString()} pending human actions`}
              className="relative inline-flex size-8 items-center justify-center text-muted-foreground"
            >
              <BellIcon aria-hidden="true" data-icon="header-notification" />
              <span className="absolute -right-1 -top-1 rounded-full bg-[color:var(--maya-accent)] px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">
                {pendingActionCount}
              </span>
            </span>
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
