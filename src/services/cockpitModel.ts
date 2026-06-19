import { buildSyntheticDataset } from "../adapters/syntheticData.js";
import { runForensicsInvestigation, type ForensicsTraceEvent } from "../agents/forensics.js";
import type { Money } from "../types/money.js";

export type ApprovalAction = "approve" | "modify" | "reject";
export type ForensicsSseEvent = ForensicsTraceEvent;

export interface ForensicsCockpitModel {
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
    approvalActions: ApprovalAction[];
  };
  actionInbox: Array<{
    actionId: string;
    actionType: string;
    lineId: string;
    amount: string;
    status: "pending_human";
    basis: string;
  }>;
  recoveryTracker: {
    totalExposure: string;
    projectedRecovery: string;
    projectedBilling: string;
    recoveryLines: number;
    billingLines: number;
  };
  retrievalStatus: Array<{ source: string; status: "ready"; count: number }>;
  whatChanged: string;
  aiInsight: string;
}

export interface WorklistItem {
  lineId: string;
  customerId: string;
  scenarioId: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  routing: string;
  confidence: string;
}

export function buildForensicsCockpitModel(): ForensicsCockpitModel {
  const dataset = buildSyntheticDataset({ seed: 42 });
  const run = runForensicsInvestigation();
  const selectedDecision = run.decisions.find((decision) => decision.routing === "recovery");
  if (selectedDecision === undefined) {
    throw new Error("Forensics cockpit requires at least one recovery decision.");
  }

  const selectedAction = run.actions.find((action) => action.lineId === selectedDecision.lineId);
  if (selectedAction === undefined) {
    throw new Error(`Missing action for selected line ${selectedDecision.lineId}.`);
  }

  return {
    surface: "forensics-analyst",
    worklist: run.decisions.slice(0, 8).map((decision) => {
      const line = dataset.deductionLines.find((candidate) => candidate.lineId === decision.lineId);
      if (line === undefined) {
        throw new Error(`Missing line ${decision.lineId}.`);
      }

      return {
        lineId: decision.lineId,
        customerId: line.customerId,
        scenarioId: line.scenarioId,
        scenarioType: line.scenarioType,
        amount: formatMoney(line.amount),
        verdict: decision.verdict,
        routing: decision.routing,
        confidence: decision.confidence
      };
    }),
    selected: {
      lineId: selectedDecision.lineId,
      evidencePack: {
        recordIds: selectedDecision.recordIds,
        documents: selectedDecision.evidenceDocuments.map((document) => ({
          documentId: document.documentId,
          documentType: document.documentType,
          summary: document.summary
        }))
      },
      draft: {
        actionId: selectedAction.actionId,
        actionType: selectedAction.actionType,
        status: selectedAction.status,
        amount: formatMoney(selectedAction.proposedAmount),
        basis: selectedAction.basis
      },
      approvalActions: ["approve", "modify", "reject"]
    },
    actionInbox: run.actions.map((action) => ({
      actionId: action.actionId,
      actionType: action.actionType,
      lineId: action.lineId,
      amount: formatMoney(action.proposedAmount),
      status: action.status,
      basis: action.basis
    })),
    recoveryTracker: {
      totalExposure: formatMoney(dataset.rollup.totalAmount),
      projectedRecovery: formatMoney(dataset.rollup.recoveryAmount),
      projectedBilling: formatMoney(dataset.rollup.validAmount),
      recoveryLines: dataset.rollup.recoveryLines,
      billingLines: dataset.rollup.validLines
    },
    retrievalStatus: [
      { source: "SAP", status: "ready", count: run.trace.filter((event) => event.type === "status" && event.payload.toolName === "retrieval.sap").length },
      { source: "Docs", status: "ready", count: run.trace.filter((event) => event.type === "status" && event.payload.toolName === "retrieval.docs").length },
      { source: "TPM", status: "ready", count: run.trace.filter((event) => event.type === "status" && event.payload.toolName === "retrieval.tpm").length }
    ],
    whatChanged: "13 recovery drafts and 7 Billing prevention drafts are staged for human review.",
    aiInsight: "Every proposed amount is bound to a deterministic decision delta; live model execution remains blocked in the offline harness."
  };
}

export function buildForensicsSseEvents(): ForensicsSseEvent[] {
  const run = runForensicsInvestigation();

  return run.trace;
}

function formatMoney(value: Money): string {
  const fixed = value.toDecimalPlaces(2).toFixed(2);
  const [whole = "0", fractional = "00"] = fixed.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `$${groupedWhole}.${fractional}`;
}
