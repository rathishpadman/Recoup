import type { ReactNode } from "react";
import { BriefcaseIcon as Briefcase } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { CircuitryIcon as Circuitry } from "@phosphor-icons/react/dist/ssr/Circuitry";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { ScalesIcon as Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import type { DemoSession } from "./demo-auth.ts";
import { LogoutButton } from "./logout-button.tsx";

export type ActiveRoute =
  | "forensics"
  | "run"
  | "credit"
  | "cfo"
  | "agents"
  | "connectors"
  | "evals-finops"
  | "memory"
  | "trace";

interface SidebarModule {
  depth?: 1;
  expandable?: boolean;
  href?: string;
  icon: ReactNode;
  label: string;
  state: "active" | "hot" | "quiet";
}

interface PersonaSidebarMap {
  modules: SidebarModule[];
  tenant: string;
  workspace: string;
}

const personaMaps: Record<DemoSession["role"], PersonaSidebarMap> = {
  cfo: {
    modules: [
      { expandable: true, href: "/cfo", icon: <Briefcase size={15} />, label: "Executive Readout", state: "active" },
      { icon: <ChartLineIcon />, label: "Gross-to-Net", state: "quiet" },
      { icon: <Stack size={15} />, label: "Recoveries", state: "quiet" },
      { icon: <ClockCounterClockwise size={15} />, label: "DSO / CEI", state: "quiet" },
      { icon: <ShieldCheckIcon />, label: "Audit & Controls", state: "quiet" },
      { icon: <GitBranch size={15} />, label: "Dependencies", state: "quiet" },
      { icon: <Database size={15} />, label: "Data lineage", state: "quiet" },
      { href: "/governance/agents", icon: <UsersThree size={15} />, label: "Agents", state: "quiet" },
      { href: "/governance/connectors", icon: <Circuitry size={15} />, label: "Connectors", state: "quiet" },
      { href: "/governance/evals-finops", icon: <Scales size={15} />, label: "Evals + FinOps", state: "quiet" },
      { href: "/governance/memory", icon: <Database size={15} />, label: "Memory", state: "quiet" },
      { href: "/governance/trace", icon: <GitBranch size={15} />, label: "Trace", state: "quiet" },
      { icon: <Stack size={15} />, label: "What Changed", state: "quiet" },
      { icon: <ChartLineIcon />, label: "AI Insight", state: "quiet" },
      { icon: <Briefcase size={15} />, label: "Reports", state: "quiet" }
    ],
    tenant: "North America",
    workspace: "CFO Read-Only"
  },
  david: {
    modules: [
      { icon: <Stack size={15} />, label: "Cockpit", state: "quiet" },
      { icon: <Circuitry size={15} />, label: "Alerts", state: "hot" },
      { icon: <UsersThree size={15} />, label: "Accounts", state: "quiet" },
      { icon: <Briefcase size={15} />, label: "Orders", state: "quiet" },
      { icon: <ChartLineIcon />, label: "Exposure", state: "quiet" },
      { href: "/credit", icon: <Scales size={15} />, label: "Arbitrations", state: "active" },
      { icon: <ClockCounterClockwise size={15} />, label: "Collections", state: "quiet" },
      { icon: <Stack size={15} />, label: "Risk-Mesh", state: "quiet" },
      { icon: <GitBranch size={15} />, label: "Audit Trail", state: "quiet" },
      { icon: <ChartLineIcon />, label: "Analytics", state: "quiet" },
      { icon: <Briefcase size={15} />, label: "Reports", state: "quiet" },
      { icon: <Database size={15} />, label: "Settings", state: "quiet" }
    ],
    tenant: "North America",
    workspace: "Sentinel Alert"
  },
  maya: {
    modules: [
      { icon: <Stack size={15} />, label: "Cockpit", state: "quiet" },
      { expandable: true, icon: <Briefcase size={15} />, label: "Deductions", state: "quiet" },
      { depth: 1, icon: <Stack size={15} />, label: "Workbench", state: "quiet" },
      { depth: 1, icon: <Circuitry size={15} />, label: "Alerts", state: "hot" },
      { depth: 1, href: "/forensics", icon: <Stack size={15} />, label: "Forensics", state: "active" },
      { depth: 1, icon: <ClockCounterClockwise size={15} />, label: "Overpayments", state: "quiet" },
      { depth: 1, icon: <ChartLineIcon />, label: "Recoveries", state: "quiet" },
      { href: "/run", icon: <ClockCounterClockwise size={15} />, label: "Run trace", state: "quiet" },
      { icon: <Database size={15} />, label: "Contracts", state: "quiet" },
      { icon: <UsersThree size={15} />, label: "Trade Partners", state: "quiet" },
      { icon: <Circuitry size={15} />, label: "Data & Tools", state: "quiet" },
      { icon: <GitBranch size={15} />, label: "Automation", state: "quiet" },
      { icon: <ChartLineIcon />, label: "Analytics", state: "quiet" },
      { icon: <Briefcase size={15} />, label: "Reports", state: "quiet" },
      { icon: <GitBranch size={15} />, label: "Audit & Governance", state: "quiet" },
      { icon: <Database size={15} />, label: "Settings", state: "quiet" }
    ],
    tenant: "Acme Corp",
    workspace: "Maya journey"
  }
};

export function CockpitShell({
  active,
  children,
  kicker,
  prelude,
  session,
  subtitle,
  title,
  titleAccessory,
  toolbar
}: Readonly<{
  active: ActiveRoute;
  children: ReactNode;
  kicker: string;
  prelude?: ReactNode;
  session: DemoSession;
  subtitle: string;
  title: string;
  titleAccessory?: ReactNode;
  toolbar?: ReactNode;
}>) {
  const personaMap = personaMaps[session.role];
  const visibleModules = personaMap.modules.filter(
    (module) => module.href === undefined || session.allowedRoutes.includes(module.href)
  );

  return (
    <main className="shell" data-active-route={active}>
      <aside className="sidebar" aria-label="Recoup navigation">
        <div className="brand-block">
          <div className="brand">Recoup</div>
          <span>Deduction recovery mesh</span>
        </div>
        <div className="sidebar-module-map" aria-label={`${roleLabel(session.role)} workspace map`}>
          {visibleModules.map((module) => (
            <ModuleMapRow
              key={module.label}
              active={active}
              module={module}
            />
          ))}
        </div>
        <div className="sidebar-note">
          <div className="sidebar-avatar" aria-hidden="true">{initials(session.displayName)}</div>
          <strong>{session.displayName}</strong>
          <small>{roleLabel(session.role)} workspace</small>
          <div className="sidebar-tenant-row">
            <span>{personaMap.tenant}</span>
            <strong>USD</strong>
          </div>
          <div className="sidebar-collapse-row" aria-hidden="true">
            <span />
            <strong>Collapse</strong>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <section className="workspace">
        {prelude}
        <header className="topbar">
          <div>
            <p className="micro">{kicker}</p>
            <div className="title-line">
              <h1>{title}</h1>
              {titleAccessory}
            </div>
            <p className="topbar-copy">{subtitle}</p>
          </div>
          {toolbar}
        </header>
        {children}
      </section>
    </main>
  );
}

function ModuleMapRow({ active, module }: Readonly<{ active: ActiveRoute; module: SidebarModule }>) {
  const isActive = module.href !== undefined && routeForHref(module.href) === active;
  const state = isActive ? "active" : module.state === "active" ? "quiet" : module.state;
  const className = `module-map-row ${state}${module.depth === 1 ? " nested" : ""}`;
  const content = (
    <>
      {module.icon}
      <span>{module.label}</span>
      {module.expandable === true ? <i aria-hidden="true" className="module-caret" /> : null}
      {state === "hot" ? <strong>!</strong> : null}
    </>
  );

  if (module.href !== undefined) {
    return (
      <a aria-current={isActive ? "page" : undefined} className={className} href={module.href}>
        {content}
      </a>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

function routeForHref(href: string): ActiveRoute | undefined {
  if (href === "/forensics") {
    return "forensics";
  }

  if (href === "/run") {
    return "run";
  }

  if (href === "/credit") {
    return "credit";
  }

  if (href === "/cfo") {
    return "cfo";
  }

  if (href === "/governance/agents") {
    return "agents";
  }

  if (href === "/governance/connectors") {
    return "connectors";
  }

  if (href === "/governance/evals-finops") {
    return "evals-finops";
  }

  if (href === "/governance/memory") {
    return "memory";
  }

  if (href === "/governance/trace") {
    return "trace";
  }

  return undefined;
}

function ChartLineIcon() {
  return <GitBranch size={15} />;
}

function ShieldCheckIcon() {
  return <Database size={15} />;
}

export function Metric({
  delta,
  drillDown,
  icon,
  label,
  value,
  variant
}: Readonly<{ delta?: string; drillDown?: string; icon?: ReactNode; label: string; value: string; variant?: "primary" }>) {
  return (
    <article className={variant === undefined ? "metric" : `metric ${variant}`}>
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {delta === undefined ? null : <small>{delta}</small>}
      {drillDown === undefined ? null : <em>{drillDown}</em>}
    </article>
  );
}

export function StatusRow({ label, status, value }: Readonly<{ label: string; status: string; value: string }>) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusPill status={status} />
    </div>
  );
}

export function StatusPill({ status, tone }: Readonly<{ status: string; tone?: string }>) {
  const normalized = statusCopy(status);
  const icon =
    status === "valid" || status === "ready" || status === "ready_synthetic" || status === "human_decided" ? (
      <CheckCircle size={14} />
    ) : (
      <Warning size={14} />
    );

  return (
    <span className={`pill ${tone ?? status}`}>
      {icon}
      <span>{normalized}</span>
    </span>
  );
}

function statusCopy(status: string): string {
  if (status === "pending_human") {
    return "Human approval";
  }

  if (status === "filtered") {
    return "Write actions blocked";
  }

  if (status === "blocked") {
    return "Human hold";
  }

  return status.replaceAll("_", " ").replaceAll("-", " ");
}

export function GovernanceBadge({ value }: Readonly<{ value: string }>) {
  const blocked = value.toLowerCase().includes("blocked");

  return (
    <span className={`governance-badge ${blocked ? "blocked" : "ready"}`} role="cell">
      {blocked ? "needs review" : value}
    </span>
  );
}

export function RecordStrip({ label, recordIds }: Readonly<{ label: string; recordIds: string[] }>) {
  return (
    <div className="record-strip" aria-label={label}>
      {recordIds.map((recordId, index) => (
        <code key={`${recordId}-${String(index)}`}>{recordId}</code>
      ))}
    </div>
  );
}

function roleLabel(role: DemoSession["role"]): string {
  if (role === "maya") {
    return "Forensics";
  }

  if (role === "david") {
    return "Credit";
  }

  return "Executive";
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/u);
  if (parts.length === 0 || parts[0] === "") {
    return "R";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
