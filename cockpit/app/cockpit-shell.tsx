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

export type ActiveRoute = "forensics" | "run" | "credit" | "cfo" | "agents" | "connectors" | "memory" | "trace";

const navGroups = [
  {
    label: "Operate",
    items: [
      { href: "/forensics", icon: <Stack size={17} />, key: "forensics", label: "Forensics" },
      { href: "/run", icon: <ClockCounterClockwise size={17} />, key: "run", label: "Run trace" }
    ]
  },
  {
    label: "Resolve",
    items: [
      { href: "/credit", icon: <Scales size={17} />, key: "credit", label: "Credit" },
      { href: "/cfo", icon: <Briefcase size={17} />, key: "cfo", label: "CFO" }
    ]
  },
  {
    label: "Govern",
    items: [
      { href: "/governance/agents", icon: <UsersThree size={17} />, key: "agents", label: "Agents" },
      { href: "/governance/connectors", icon: <Circuitry size={17} />, key: "connectors", label: "Connectors" },
      { href: "/governance/memory", icon: <Database size={17} />, key: "memory", label: "Memory" },
      { href: "/governance/trace", icon: <GitBranch size={17} />, key: "trace", label: "Trace" }
    ]
  }
] satisfies Array<{ label: string; items: Array<{ href: string; icon: ReactNode; key: ActiveRoute; label: string }> }>;

export function CockpitShell({
  active,
  children,
  kicker,
  session,
  subtitle,
  title,
  toolbar
}: Readonly<{
  active: ActiveRoute;
  children: ReactNode;
  kicker: string;
  session: DemoSession;
  subtitle: string;
  title: string;
  toolbar?: ReactNode;
}>) {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Recoup navigation">
        <div className="brand-block">
          <div className="brand">Recoup</div>
          <span>Deduction recovery mesh</span>
        </div>
        <nav>
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => session.allowedRoutes.includes(item.href));

            return visibleItems.length === 0 ? null : (
              <NavGroup active={active} items={visibleItems} key={group.label} label={group.label} />
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span>Signed in</span>
          <strong>{session.displayName}</strong>
          <small>{roleLabel(session.role)} workspace. External actions require human approval.</small>
          <LogoutButton />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="micro">{kicker}</p>
            <h1>{title}</h1>
            <p className="topbar-copy">{subtitle}</p>
          </div>
          {toolbar}
        </header>
        {children}
      </section>
    </main>
  );
}

function NavGroup({
  active,
  items,
  label
}: Readonly<{
  active: ActiveRoute;
  items: Array<{ href: string; icon: ReactNode; key: ActiveRoute; label: string }>;
  label: string;
}>) {
  return (
    <div className="nav-group">
      <span>{label}</span>
      {items.map((item) => (
        <a aria-current={active === item.key ? "page" : undefined} href={item.href} key={item.href}>
          {item.icon}
          {item.label}
        </a>
      ))}
    </div>
  );
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
  const normalized = status.replace("_", " ");
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

export function GovernanceBadge({ value }: Readonly<{ value: string }>) {
  const blocked = value.toLowerCase().includes("blocked");

  return (
    <span className={`governance-badge ${blocked ? "blocked" : "ready"}`} role="cell">
      {blocked ? "threshold unset" : value}
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
