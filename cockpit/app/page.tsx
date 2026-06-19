import type { ReactNode, SVGProps } from "react";
import { ApprovalControls } from "./approval-controls.tsx";
import { RunStream } from "./run-stream.tsx";

const apiBaseUrl = process.env.RECOUP_API_URL ?? "http://127.0.0.1:4317";

interface ForensicsCockpitModel {
  surface: "forensics-analyst";
  worklist: WorklistItem[];
  selected: {
    lineId: string;
    evidencePack: {
      recordIds: string[];
      documents: Array<{ documentId: string; documentType: string; summary: string }>;
    };
    draft: {
      actionId: string;
      actionType: string;
      status: "pending_human";
      amount: string;
      basis: string;
    };
  };
  actionInbox: Array<{
    actionId: string;
    actionType: string;
    lineId: string;
    amount: string;
  }>;
  recoveryTracker: {
    totalExposure: string;
    projectedRecovery: string;
    projectedBilling: string;
    recoveryLines: number;
    billingLines: number;
  };
  retrievalStatus: Array<{ source: string; count: number }>;
  whatChanged: string;
  aiInsight: string;
}

interface WorklistItem {
  lineId: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  confidence: string;
}

export default async function Page() {
  const model = await fetchForensicsModel();

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Recoup navigation">
        <div className="brand">Recoup</div>
        <nav>
          <a aria-current="page">Forensics</a>
          <a>Credit</a>
          <a>CFO</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="micro">Maya Patel</p>
            <h1>Deduction Forensics</h1>
          </div>
          <div className="toolbar" aria-label="Forensics controls">
            <button type="button" aria-label="Refresh run">
              <Icon name="refresh" />
            </button>
            <button type="button" aria-label="Filter worklist">
              <Icon name="filter" />
            </button>
          </div>
        </header>

        <section className="summary-grid" aria-label="Recovery summary">
          <Metric label="Total exposure" value={model.recoveryTracker.totalExposure} />
          <Metric label="Projected recovery" value={model.recoveryTracker.projectedRecovery} />
          <Metric label="Billing prevention" value={model.recoveryTracker.projectedBilling} />
          <Metric
            label="Draft queues"
            value={`${String(model.recoveryTracker.recoveryLines)}/${String(model.recoveryTracker.billingLines)}`}
          />
        </section>

        <section className="content-grid">
          <section className="worklist" aria-label="Pre-triaged worklist">
            <div className="section-heading">
              <div>
                <p className="micro">8-card queue</p>
                <h2>Worklist</h2>
              </div>
              <span>{model.worklist.length} visible</span>
            </div>
            <div className="rows">
              {model.worklist.map((item: WorklistItem) => (
                <article className="work-row" key={item.lineId}>
                  <div>
                    <strong>{item.lineId}</strong>
                    <span>{item.scenarioType}</span>
                  </div>
                  <div className="amount">{item.amount}</div>
                  <span className="confidence">{item.confidence}</span>
                  <span className={`pill ${item.verdict}`}>{item.verdict}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="detail" aria-label="Evidence and draft">
            <div className="section-heading">
              <div>
                <p className="micro">Selected line</p>
                <h2>{model.selected.lineId}</h2>
              </div>
              <span className="pill invalid">recovery</span>
            </div>

            <div className="evidence">
              <h3>
                <Icon name="file" />
                Evidence pack
              </h3>
              {model.selected.evidencePack.documents.map((document) => (
                <div className="evidence-row" key={document.documentId}>
                  <span>{document.documentType}</span>
                  <strong>{document.documentId}</strong>
                  <p>{document.summary}</p>
                </div>
              ))}
              <div className="record-strip" aria-label="Evidence record IDs">
                {model.selected.evidencePack.recordIds.map((recordId) => (
                  <code key={recordId}>{recordId}</code>
                ))}
              </div>
            </div>

            <div className="draft">
              <h3>
                <Icon name="warning" />
                Draft action
              </h3>
              <p>{model.selected.draft.basis}</p>
              <div className="draft-footer">
                <span className="amount">{model.selected.draft.amount}</span>
                <span>{model.selected.draft.status.replace("_", " ")}</span>
              </div>
              <ApprovalControls actionId={model.selected.draft.actionId} />
            </div>

            <div className="inbox">
              <h3>
                <Icon name="inbox" />
                Action inbox
              </h3>
              {model.actionInbox.slice(0, 5).map((action) => (
                <div className="inbox-row" key={action.actionId}>
                  <span>{action.actionType}</span>
                  <strong>{action.lineId}</strong>
                  <span className="amount">{action.amount}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="stream" aria-label="SSE stream">
            <div className="section-heading">
              <div>
                <p className="micro">SSE stream</p>
                <h2>Run trace</h2>
              </div>
              <span>live replay</span>
            </div>
            <RunStream />
            <div className="insight">
              <strong>What changed</strong>
              <p>{model.whatChanged}</p>
            </div>
            <div className="insight">
              <strong>AI insight</strong>
              <p>{model.aiInsight}</p>
            </div>
            <div className="insight">
              <strong>Trend forecast</strong>
              <p>Recovery and Billing prevention remain projected until the approval audit trail records human decisions.</p>
            </div>
            <div className="query-box" aria-label="Conversational query">
              <label htmlFor="recoup-query">Query</label>
              <input disabled id="recoup-query" placeholder="Ask about a record" />
            </div>
            <div className="retrieval">
              {model.retrievalStatus.map((status) => (
                <span key={status.source}>
                  {status.source}: {status.count}
                </span>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

async function fetchForensicsModel(): Promise<ForensicsCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/forensics`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Forensics cockpit model failed: ${String(response.status)}`);
  }

  return (await response.json()) as ForensicsCockpitModel;
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

type IconName = "check" | "file" | "filter" | "inbox" | "refresh" | "send" | "warning" | "x";

function Icon({ name }: Readonly<{ name: IconName }>) {
  const common: SVGProps<SVGSVGElement> = {
    "aria-hidden": true,
    fill: "none",
    height: 18,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: 18
  };

  const paths: Record<IconName, ReactNode> = {
    check: <path d="M5 12.5l4.2 4.2L19 7" />,
    file: <path d="M7 3h7l4 4v14H7z M14 3v5h5 M9 13h6 M9 17h6" />,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    inbox: <path d="M4 4h16v16H4z M4 14h5l2 3h2l2-3h5" />,
    refresh: <path d="M20 12a8 8 0 1 1-2.35-5.65M20 4v5h-5" />,
    send: <path d="M4 12l16-8-5 16-3-6z" />,
    warning: <path d="M12 3l10 18H2z M12 9v5 M12 18h.01" />,
    x: <path d="M7 7l10 10M17 7L7 17" />
  };

  return <svg {...common}>{paths[name]}</svg>;
}
