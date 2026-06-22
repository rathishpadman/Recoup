import type { CSSProperties, ReactNode } from "react";
import { BankIcon as Bank } from "@phosphor-icons/react/dist/ssr/Bank";
import { BriefcaseIcon as Briefcase } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CircuitryIcon as Circuitry } from "@phosphor-icons/react/dist/ssr/Circuitry";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { ScalesIcon as Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { ApprovalControls } from "../../approval-controls.tsx";
import type { CreditCockpitModel } from "../../cockpit-data.ts";
import { fetchCreditModel } from "../../cockpit-data.ts";
import { RecordStrip } from "../../cockpit-shell.tsx";
import { requireRouteAccess } from "../../demo-auth.ts";
import styles from "./command.module.css";

type Tone = CreditCockpitModel["commandCenter"]["statusRail"][number]["tone"];

interface NavItem {
  icon: ReactNode;
  label: string;
  state: "alert" | "idle" | "selected";
}

const navItems: NavItem[] = [
  { icon: <Stack size={15} />, label: "Command Centre", state: "selected" },
  { icon: <Briefcase size={15} />, label: "Portfolio", state: "idle" },
  { icon: <Scales size={15} />, label: "Exposure Board", state: "idle" },
  { icon: <Bank size={15} />, label: "Live Bureau", state: "alert" },
  { icon: <Circuitry size={15} />, label: "Risk Mesh", state: "idle" },
  { icon: <GitBranch size={15} />, label: "Arbitrations", state: "idle" },
  { icon: <UsersThree size={15} />, label: "Harbor", state: "idle" },
  { icon: <Database size={15} />, label: "Audit & Compliance", state: "idle" },
  { icon: <ClockCounterClockwise size={15} />, label: "Reports", state: "idle" }
];

export default async function DavidCommandCentrePage() {
  const session = await requireRouteAccess("/credit/command");
  const model = await fetchCreditModel();
  const commandCenter = model.commandCenter;
  const statusRail = commandCenter.statusRail;
  const stats = commandCenter.stats;
  const exposureRows = commandCenter.exposureRows;
  const feedRows = commandCenter.feedRows;
  const signalRows = commandCenter.signalRows;
  const auditRows = commandCenter.auditRows;
  const marketTape = commandCenter.marketTape;
  const queueRows = model.actionQueue;

  return (
    <main className={styles.commandShell} data-theme="dark">
      <aside className={styles.sideNav} aria-label="David credit navigation">
        <div className={styles.brandBlock}>
          <strong>Recoup</strong>
          <span>Credit Sentinel</span>
        </div>

        <nav className={styles.navList} aria-label="Credit command areas">
          {navItems.map((item) => (
            <div className={classNames(styleClass("navRow"), navStateClass(item.state))} key={item.label}>
              {item.icon}
              <span>{item.label}</span>
              {item.state === "alert" ? <strong aria-label="attention required">!</strong> : null}
            </div>
          ))}
        </nav>

        <div className={styles.operatorPanel}>
          <span className={styles.operatorDot} aria-hidden="true" />
          <strong>{session.displayName} online</strong>
          <span>{model.account.posture}</span>
        </div>
      </aside>

      <section className={styles.mainStage} aria-label="David D5 Command Centre">
        <header className={styles.commandHeader}>
          <div className={styles.titleBlock}>
            <h1>David D5 Command Centre</h1>
            <p>Portfolio Monitoring Cockpit</p>
          </div>
          <div className={styles.toolRail} aria-label="Tool status">
            <strong>Tool status</strong>
            {statusRail.map((item) => (
              <span className={styles.toolCell} key={item.label} title={item.detail}>
                {item.label}
                <code className={toneClass(item.tone)}>{item.value}</code>
              </span>
            ))}
          </div>
          <div className={styles.readModelStamp}>
            <strong>Provenance</strong>
            <span>{provenanceLabel(model.negotiation.provenance)}</span>
          </div>
        </header>

        <section className={styles.marketTape} aria-label="Command monitor tape">
          {marketTape.map((item) => (
            <span className={toneClass(item.tone)} key={item.label}>
              {item.label}
              <strong>{item.value}</strong>
            </span>
          ))}
        </section>

        <section className={styles.statStrip} aria-label="Credit command metrics">
          {stats.map((stat) => (
            <article className={styles.statPanel} key={stat.label}>
              <div className={styles.statTopline}>
                <span>{stat.label}</span>
                {stat.unit === undefined ? null : <code>{stat.unit}</code>}
              </div>
              <strong className={styles.statValue}>{stat.value}</strong>
              <span className={toneClass(stat.tone)}>{stat.note}</span>
              <i className={classNames(styleClass("statTrace"), toneClass(stat.tone))} aria-hidden="true" />
            </article>
          ))}
        </section>

        <section className={styles.commandGrid} aria-label="Monitoring workbench">
          <section className={paneClass("exposurePane")} aria-label="Exposure board">
            <PaneHeading title="Exposure board" action="View all" />
            <div className={styles.exposureTable}>
              <div className={styles.tableHead}>
                <span>Portfolio</span>
                <span>Exposure input</span>
                <span>Actionable amount</span>
                <span>Signal</span>
                <span>State</span>
              </div>
              {exposureRows.map((row) => (
                <div className={styles.tableRow} key={`${row.portfolio}-${row.action}`}>
                  <strong>{row.portfolio}</strong>
                  <span>{row.exposure}</span>
                  <span>{row.action}</span>
                  <code className={toneClass(row.tone)}>{row.signal}</code>
                  <span>{row.state}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={paneClass("feedPane")} aria-label="Live bureau">
            <PaneHeading title="Live bureau" action="View all" />
            <div className={styles.feedList}>
              {feedRows.map((row) => (
                <div className={styles.feedRow} key={`${row.time}-${row.event}`}>
                  <span>{row.time}</span>
                  <div>
                    <strong>{row.event}</strong>
                    <small>{row.detail}</small>
                  </div>
                  <code className={toneClass(row.tone)}>{row.state}</code>
                </div>
              ))}
            </div>
            <RecordStrip label="Live bureau cited records" recordIds={model.sentinel.recordIds} />
          </section>

          <section className={paneClass("signalPane")} aria-label="Behavioral signal rails">
            <PaneHeading title="Behavioral signal rails" action="View all" />
            <div className={styles.signalList}>
              {signalRows.map((row) => (
                <div className={styles.signalRow} key={row.label}>
                  <span>{row.label}</span>
                  <span className={styles.signalTrack} aria-hidden="true">
                    <i style={barStyle(row.score)} />
                  </span>
                  <strong className={toneClass(row.tone)}>{row.score}</strong>
                  <small>{row.detail}</small>
                </div>
              ))}
            </div>
          </section>

          <section className={paneClass("arbitrationPane")} aria-label="Active arbitrations">
            <PaneHeading title="Active arbitrations" action="View all" />
            <div className={styles.arbitrationTable}>
              <div className={styles.tableHead}>
                <span>Lane</span>
                <span>Action</span>
                <span>Status</span>
                <span>Control</span>
              </div>
              {model.approvalInbox.map((item, index) => (
                <div className={styles.approvalRow} key={item.actionId}>
                  <code>{`Lane ${String(index + 1).padStart(2, "0")}`}</code>
                  <span>{item.actionLabel}</span>
                  <strong>{item.statusLabel}</strong>
                  <div className={styles.approvalDock}>
                    <ApprovalControls actionId={item.actionId} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={paneClass("underwritingPane")} aria-label="Harbor re-underwriting">
            <PaneHeading title="Harbor re-underwriting" action="Re-run" />
            <div className={styles.accountReadout}>
              <span>
                Portfolio
                <strong>{model.account.customerLabel}</strong>
              </span>
              <span>
                Last run
                <strong>{model.arbitration.displayReason}</strong>
              </span>
            </div>
            <div className={styles.scoreSplit}>
              <div className={styles.scoreDial} aria-label="Composite score">
                <strong>{model.partialHold.compositeScore}</strong>
                <span>composite basis</span>
              </div>
              <div className={styles.driverList}>
                {model.partialHold.criteria.slice(0, 4).map((criterion) => (
                  <span key={criterion.label}>
                    {criterion.label}
                    <strong>{criterion.contribution}</strong>
                  </span>
                ))}
              </div>
            </div>
            <p>{model.partialHold.basis}</p>
          </section>

          <section className={paneClass("queuePane")} aria-label="Risk Mesh queue">
            <PaneHeading title="Risk Mesh queue" action="View all" />
            <div className={styles.queueTable}>
              <div className={styles.tableHead}>
                <span>Alert</span>
                <span>Account</span>
                <span>Severity</span>
                <span>Age</span>
              </div>
              {queueRows.map((item) => (
                <div className={styles.queueRow} key={`${item.priority}-${item.item}`}>
                  <span>{item.item}</span>
                  <span>{item.account}</span>
                  <strong className={priorityClass(item.priority)}>{item.priority}</strong>
                  <code>{item.age}</code>
                </div>
              ))}
            </div>
          </section>

          <section className={paneClass("auditPane")} aria-label="Audit status">
            <PaneHeading title="Audit status" action="Open workspace" />
            <div className={styles.auditSummary}>
              <div className={styles.auditScore}>
                {model.audit.valid ? <CheckCircle size={30} /> : <Warning size={30} />}
                <strong>{model.audit.valid ? "Valid" : "Blocked"}</strong>
                <span>{String(model.audit.entries)} audit entries</span>
              </div>
              <div className={styles.auditRows}>
                {auditRows.map((row) => (
                  <span key={row.label}>
                    {row.label}
                    <strong>{row.value}</strong>
                    <code>{row.state}</code>
                  </span>
                ))}
              </div>
            </div>
            <RecordStrip label="Risk Mesh arbitration record IDs" recordIds={model.arbitration.recordIds} />
          </section>
        </section>

        <footer className={styles.systemFeed} aria-label="System feed">
          <strong>System feed</strong>
          {feedRows.slice(0, 3).map((row) => (
            <span key={`${row.event}-${row.state}`}>{`${row.time} ${row.event}: ${row.state}`}</span>
          ))}
          <a href="/credit">Open arbitration workstation</a>
        </footer>
      </section>
    </main>
  );
}

function PaneHeading({ action, title }: Readonly<{ action: string; title: string }>) {
  return (
    <div className={styles.paneHeading}>
      <h2>{title}</h2>
      <button type="button">{action}</button>
    </div>
  );
}

function barStyle(score: string): CSSProperties {
  return { "--bar-value": `${score}%` } as CSSProperties;
}

function toneClass(tone: Tone): string {
  switch (tone) {
    case "blocked":
      return styleClass("blocked");
    case "healthy":
      return styleClass("healthy");
    case "pending":
      return styleClass("pending");
    case "warning":
      return styleClass("warning");
  }
}

function navStateClass(state: NavItem["state"]): string {
  if (state === "selected") {
    return styleClass("selectedNav");
  }

  if (state === "alert") {
    return styleClass("alertNav");
  }

  return "";
}

function priorityClass(priority: string): string {
  if (priority === "P1") {
    return styleClass("blocked");
  }

  if (priority === "P2") {
    return styleClass("warning");
  }

  return styleClass("pending");
}

function paneClass(name: string): string {
  return classNames(styleClass("dataPane"), styleClass(name));
}

function classNames(...names: string[]): string {
  return names.filter((name) => name.length > 0).join(" ");
}

function provenanceLabel(provenance: CreditCockpitModel["negotiation"]["provenance"]): string {
  return provenance
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function styleClass(name: string): string {
  const className = styles[name];
  if (className === undefined) {
    throw new Error(`Missing David command centre style: ${name}`);
  }

  return className;
}
