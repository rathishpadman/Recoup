"use client";

import type { CSSProperties, ReactNode } from "react";
import { CoinsIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { LogoutButton } from "../../app/logout-button.tsx";
import type { DemoSession } from "../../app/demo-auth.ts";
import { mayaAccent } from "../maya/maya-accent.ts";

const workspaceLabels = {
  cfo: "CFO workspace",
  david: "Credit workspace",
  maya: "Forensics workspace"
} as const;

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

export function FinopsWorkspaceShell({
  children,
  heading,
  session,
  support
}: Readonly<{
  children: ReactNode;
  heading: string;
  session: DemoSession;
  support: string;
}>) {
  return (
    <SidebarProvider
      className={cn(
        "min-h-svh items-stretch bg-background [&_[data-mobile=true]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar-container]]:!absolute [&_[data-slot=sidebar-container]]:!h-full [&_[data-slot=sidebar-container]]:!min-h-full [&_[data-slot=sidebar-gap]]:min-h-full [&_[data-slot=sidebar-gap]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar-inner]]:bg-[color:var(--maya-accent-sidebar)] [&_[data-slot=sidebar]]:relative [&_[data-slot=sidebar]]:min-h-full [&_[data-slot=sidebar]]:self-stretch",
        mayaAccent.appFrame
      )}
      defaultOpen
      style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4.5rem" } as CSSProperties}
    >
      <Sidebar className={cn("min-h-svh border-sidebar-border bg-sidebar", mayaAccent.sidebar)} collapsible="icon" data-testid="finops-sidebar">
        <SidebarHeader className="gap-4 p-4 pb-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-3">
          <div className="flex min-h-16 min-w-0 items-center justify-between gap-2" data-testid="finops-sidebar-brand">
            <div className="flex min-w-0 items-center gap-2.5">
              <RecoupBrandMark />
              <div className="grid min-w-0 gap-1.5 group-data-[collapsible=icon]:hidden">
                <strong className="truncate text-[22px] font-semibold leading-none">Recoup</strong>
                <span className="truncate text-xs font-medium text-[color:var(--maya-accent-sidebar-muted)]">Agent Cost Engineering</span>
              </div>
            </div>
            <SidebarTrigger
              aria-label="Collapse FinOps navigation"
              className="hidden text-[color:var(--maya-accent-sidebar-muted)] hover:bg-[color:var(--maya-accent-sidebar-active)] hover:text-white md:inline-flex group-data-[collapsible=icon]:hidden"
            />
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <SidebarMenuItem data-testid="finops-sidebar-nav-item">
                  <SidebarMenuButton
                    aria-current="page"
                    asChild
                    className={cn("h-9 border border-transparent px-3", mayaAccent.sidebarActiveItem)}
                    isActive
                    tooltip="Evals + FinOps"
                  >
                    <a href="/finops">
                      <CoinsIcon aria-hidden="true" data-icon="sidebar-menu" />
                      <span>Evals + FinOps</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator className="bg-[color:var(--maya-accent-sidebar-border)]" />
        <SidebarFooter className="mt-auto gap-3 p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3" data-testid="finops-sidebar-footer">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium", mayaAccent.iconBubble)}>
              {session.displayName.charAt(0)}
            </div>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <strong className="truncate text-sm">{session.displayName}</strong>
              <span className="truncate text-xs text-[color:var(--maya-accent-sidebar-muted)]">{workspaceLabels[session.role]}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--maya-accent-sidebar-muted)] group-data-[collapsible=icon]:hidden">
            <span>Read-only cost evidence</span>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-svh bg-background text-foreground" data-testid="finops-workbench">
        <header className="flex min-w-0 items-center justify-between gap-4 px-5 py-5">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger aria-label="Open FinOps navigation" className="md:hidden" />
            <div className="grid min-w-0 gap-1">
              <h1 className="truncate text-2xl font-semibold leading-none">{heading}</h1>
              <p className="truncate px-0 text-sm text-muted-foreground">{support}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
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
