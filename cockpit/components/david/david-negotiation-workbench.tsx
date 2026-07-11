"use client";

import * as React from "react";
import { useRouter } from "next/navigation.js";
import { AlertCircleIcon, BellRingIcon, CheckCircle2Icon, Loader2Icon, RefreshCwIcon, RotateCcwIcon, SendIcon, SparklesIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CreditRiskAccountModel, DealOptimizerCandidateModel, DealOptimizerModel } from "../../app/cockpit-data.ts";
import { DavidApprovalGateDialog } from "./david-approval-gate-dialog.tsx";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import { refreshDavidCreditReadModel } from "./refresh-credit-read-model.ts";

type NegotiationOrder = CreditRiskAccountModel["negotiationOrders"][number];
type NegotiationCommunicationStatus = { hasInboundReply?: boolean; round: number; status: string };
type NegotiationCommunicationCheckState = "checking" | "ready" | "unavailable";
interface NegotiationCommunicationStatusResponse {
  checkedAtIso: string;
  latestRound?: NegotiationCommunicationStatus;
  orderId: string;
}
type NegotiationFlowState = "complete" | "current" | "waiting";

export interface NegotiationCommunicationFlowStep {
  detail: string;
  state: NegotiationFlowState;
  title: "Order received" | "Outbound sent" | "Customer reply" | "Governed draft";
}
export const communicationPollIntervalMs = 30_000;

interface NegotiationApprovalPacket {
  actionId: string;
  packetDetail: string;
  packetTitle: string;
  recordIds: string[];
  routeLabel: "Negotiation email";
  round: number;
}

export const davidNegotiationWorkbenchSheetClassName = "overflow-y-auto px-4 pb-4 sm:max-w-3xl";

export function DavidNegotiationWorkbench({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  const router = useRouter();
  const order = account.negotiationOrders[0];
  const orderId = order?.orderId;
  const hydratedApprovalActionId = order === undefined ? undefined : readHydratedNegotiationApprovalActionId(order);
  const [open, setOpen] = React.useState(false);
  const [model, setModel] = React.useState<DealOptimizerModel | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [resetting, setResetting] = React.useState(false);
  const [resetMessage, setResetMessage] = React.useState<string | undefined>();
  const [manualCounterText, setManualCounterText] = React.useState("");
  const [manualCounterRound, setManualCounterRound] = React.useState(order === undefined ? "1" : defaultManualCounterRound(order));
  const [manualCountering, setManualCountering] = React.useState(false);
  const [manualCounterMessage, setManualCounterMessage] = React.useState<string | undefined>();
  const [approvalDialogOpen, setApprovalDialogOpen] = React.useState(false);
  const [approvalRecordedActionId, setApprovalRecordedActionId] = React.useState<string | undefined>(() => hydratedApprovalActionId);
  const [sendingEmail, setSendingEmail] = React.useState(false);
  const [sendMessage, setSendMessage] = React.useState<string | undefined>();
  const [checkingCommunication, setCheckingCommunication] = React.useState(false);
  const [communicationMessage, setCommunicationMessage] = React.useState<string | undefined>();
  const [lastCommunicationCheckIso, setLastCommunicationCheckIso] = React.useState<string | undefined>();
  const [latestCommunicationStatus, setLatestCommunicationStatus] = React.useState<NegotiationCommunicationStatus | undefined>();
  const [communicationCheckState, setCommunicationCheckState] = React.useState<NegotiationCommunicationCheckState>("checking");
  const communicationAbortControllerRef = React.useRef<AbortController | null>(null);
  const communicationRequestSequenceRef = React.useRef(0);

  React.useEffect(() => {
    communicationRequestSequenceRef.current += 1;
    communicationAbortControllerRef.current?.abort();
    communicationAbortControllerRef.current = null;
    setModel(undefined);
    setLoading(false);
    setError(undefined);
    setResetMessage(undefined);
    setResetting(false);
    setManualCounterText("");
    setManualCounterRound(order === undefined ? "1" : defaultManualCounterRound(order));
    setManualCountering(false);
    setManualCounterMessage(undefined);
    setApprovalDialogOpen(false);
    setApprovalRecordedActionId(hydratedApprovalActionId);
    setSendingEmail(false);
    setSendMessage(undefined);
    setCheckingCommunication(false);
    setCommunicationMessage(undefined);
    setLastCommunicationCheckIso(undefined);
    setLatestCommunicationStatus(undefined);
    setCommunicationCheckState("checking");
  }, [hydratedApprovalActionId, order, orderId]);

  const checkCommunication = React.useCallback(async (manual: boolean): Promise<void> => {
    if (orderId === undefined || order === undefined) {
      return;
    }
    const requestSequence = communicationRequestSequenceRef.current + 1;
    communicationRequestSequenceRef.current = requestSequence;
    communicationAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    communicationAbortControllerRef.current = abortController;
    setCheckingCommunication(true);
    setCommunicationCheckState("checking");
    try {
      const response = await fetch(`/api/credit/negotiation/status?orderId=${encodeURIComponent(orderId)}`, {
        cache: "no-store",
        signal: abortController.signal
      });
      const body = readNegotiationCommunicationStatusResponse(
        await response.json().catch(() => undefined),
        orderId
      );
      if (abortController.signal.aborted || communicationRequestSequenceRef.current !== requestSequence) {
        return;
      }
      if (!response.ok || body === undefined) {
        setCommunicationCheckState("unavailable");
        if (manual) {
          setCommunicationMessage("Communication status is unavailable.");
        }
        return;
      }
      setLastCommunicationCheckIso(body.checkedAtIso);
      setLatestCommunicationStatus(body.latestRound);
      setCommunicationCheckState("ready");
      if (body.latestRound !== undefined && hasNegotiationCommunicationChanged(order, body.latestRound)) {
        setCommunicationMessage(negotiationCommunicationMessage(order, body.latestRound));
      } else if (manual) {
        setCommunicationMessage("No new customer reply was found.");
      }
    } catch {
      if (abortController.signal.aborted || communicationRequestSequenceRef.current !== requestSequence) {
        return;
      }
      setCommunicationCheckState("unavailable");
      if (manual) {
        setCommunicationMessage("Communication status is unavailable.");
      }
    } finally {
      if (communicationRequestSequenceRef.current === requestSequence) {
        communicationAbortControllerRef.current = null;
        setCheckingCommunication(false);
      }
    }
  }, [order, orderId]);

  React.useEffect(() => {
    if (!open || orderId === undefined) {
      return;
    }
    void checkCommunication(false);
    const intervalId = window.setInterval(() => {
      void checkCommunication(false);
    }, communicationPollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      communicationRequestSequenceRef.current += 1;
      communicationAbortControllerRef.current?.abort();
      communicationAbortControllerRef.current = null;
    };
  }, [checkCommunication, open, orderId]);

  React.useEffect(() => {
    if (!canUseNegotiationActions(communicationCheckState, latestCommunicationStatus)) {
      setApprovalDialogOpen(false);
    }
  }, [communicationCheckState, latestCommunicationStatus]);

  React.useEffect(() => {
    if (!open || orderId === undefined || model !== undefined) {
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setError(undefined);

    void fetch(`/api/credit/orders/${encodeURIComponent(orderId)}/deals`, {
      cache: "no-store",
      signal: abortController.signal
    })
      .then(async (response) => {
        const body = (await response.json()) as unknown;
        if (!response.ok) {
          const message = readErrorMessage(body) ?? "Credit deal optimizer service unavailable.";
          throw new Error(message);
        }
        setModel(body as DealOptimizerModel);
      })
      .catch((fetchError: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Credit deal optimizer service unavailable.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [model, open, orderId]);

  if (order === undefined || orderId === undefined) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button disabled type="button" variant="outline">
                <SparklesIcon aria-hidden="true" data-icon="inline-start" />
                Simulate alternatives
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>No governed order source for this account.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const activeOrder = order;
  const communicationFlow = buildNegotiationCommunicationFlow(activeOrder, latestCommunicationStatus);

  async function refreshCommunication(): Promise<void> {
    setCheckingCommunication(true);
    try {
      if (!(await refreshDavidCreditReadModel())) {
        setCommunicationMessage("The customer reply is stored, but the updated credit view is not available yet.");
        return;
      }
      setCommunicationMessage("Communication refreshed.");
      router.refresh();
    } finally {
      setCheckingCommunication(false);
    }
  }

  async function resetCommunication(): Promise<void> {
    if (orderId === undefined) {
      return;
    }

    setResetting(true);
    setResetMessage(undefined);
    try {
      const response = await fetch("/api/credit/negotiation/reset", {
        body: JSON.stringify({
          orderId,
          reason: "David negotiation workbench fresh-test reset"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (!response.ok) {
        setResetMessage("Communication reset unavailable.");
        return;
      }

      setResetMessage("Communication reset recorded.");
      if (!(await refreshDavidCreditReadModel())) {
        setResetMessage("Communication reset recorded, but the updated credit view is not available yet.");
        return;
      }
      router.refresh();
    } catch {
      setResetMessage("Communication reset service unavailable.");
    } finally {
      setResetting(false);
    }
  }

  async function recordManualCounter(): Promise<void> {
    if (orderId === undefined) {
      return;
    }
    const pastedText = manualCounterText.trim();
    const round = Number.parseInt(manualCounterRound, 10);
    if (pastedText.length === 0) {
      setManualCounterMessage("Manual counter text is required.");
      return;
    }
    if (!Number.isInteger(round) || round < 1) {
      setManualCounterMessage("Manual counter round is required.");
      return;
    }

    setManualCountering(true);
    setManualCounterMessage(undefined);
    try {
      const response = await fetch("/api/credit/negotiation/inbound/manual", {
        body: JSON.stringify({
          orderId,
          pastedText,
          round
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setManualCounterMessage(readErrorMessage(body) ?? "Manual counter service unavailable.");
        return;
      }

      const status = readStatus(body);
      setManualCounterMessage(status === "countered" ? "Manual counter recorded." : "Manual counter needs human review.");
      if (status === "countered") {
        setManualCounterText("");
        if (!(await refreshDavidCreditReadModel())) {
          setManualCounterMessage("Manual counter recorded, but the updated credit view is not available yet.");
          return;
        }
        router.refresh();
      }
    } catch {
      setManualCounterMessage("Manual counter service unavailable.");
    } finally {
      setManualCountering(false);
    }
  }

  async function sendApprovedNegotiationEmail(packet: NegotiationApprovalPacket): Promise<void> {
    if (orderId === undefined) {
      return;
    }

    setSendingEmail(true);
    setSendMessage(undefined);
    try {
      const response = await fetch("/api/credit/negotiation/email", {
        body: JSON.stringify({
          accountId: account.accountId,
          actionId: packet.actionId,
          orderId,
          round: packet.round
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        setSendMessage(readErrorMessage(body) ?? "Negotiation email send unavailable.");
        return;
      }

      const status = readStatus(body);
      setSendMessage(status === "already_sent" ? "Approved email was already sent." : "Approved email send recorded.");
      if (!(await refreshDavidCreditReadModel())) {
        setSendMessage("Approved email send recorded, but the updated credit view is not available yet.");
        return;
      }
      router.refresh();
    } catch {
      setSendMessage("Negotiation email send service unavailable.");
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button data-testid="david-simulate-alternatives" type="button" variant="outline">
          <SparklesIcon aria-hidden="true" data-icon="inline-start" />
          Simulate alternatives
        </Button>
      </SheetTrigger>
      <SheetContent className={davidNegotiationWorkbenchSheetClassName} data-testid="david-negotiation-workbench">
        <SheetHeader className="gap-2 px-0">
          <SheetTitle>Fulfilment & Terms Negotiation</SheetTitle>
          <SheetDescription>Read-only expected-value ranking for {account.customer}. Approvals and sends stay gated.</SheetDescription>
        </SheetHeader>

        <div className="mt-2 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="grid gap-1 text-sm">
              <span className="font-medium">Customer communication</span>
              <span className="text-muted-foreground">
                {lastCommunicationCheckIso === undefined
                  ? "Checking for replies..."
                  : `Last checked ${new Date(lastCommunicationCheckIso).toLocaleTimeString()}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={checkingCommunication} onClick={() => { void checkCommunication(true); }} size="sm" type="button" variant="outline">
                {checkingCommunication ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : <BellRingIcon aria-hidden="true" />}
                Check replies
              </Button>
              <Button disabled={checkingCommunication} onClick={() => { void refreshCommunication(); }} size="sm" type="button">
                <RefreshCwIcon aria-hidden="true" />
                Refresh communication
              </Button>
            </div>
          </div>
          {communicationMessage === undefined ? null : (
            <Alert data-testid="david-negotiation-communication-status">
              <BellRingIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Communication status</AlertTitle>
              <AlertDescription>{communicationMessage}</AlertDescription>
            </Alert>
          )}
          <ol
            aria-label="Negotiation transaction progress"
            className="grid gap-2 border-b pb-4 sm:grid-cols-4 sm:gap-0"
            data-testid="david-negotiation-communication-flow"
          >
            {communicationFlow.map((step, index) => {
              const Icon = negotiationFlowIcon(step.title);
              return (
                <li
                  aria-current={step.state === "current" ? "step" : undefined}
                  className="relative flex min-w-0 items-start gap-2 sm:block sm:pr-3"
                  data-state={step.state}
                  key={step.title}
                >
                  {index === 0 ? null : (
                    <span
                      aria-hidden="true"
                      className={`absolute right-full top-3 hidden h-px w-[calc(100%-2rem)] sm:block ${step.state === "waiting" ? "bg-border" : "bg-emerald-600"}`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border ${negotiationFlowMarkerClassName(step.state)}`}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="min-w-0 sm:mt-2 sm:block">
                    <span className="block text-xs font-medium">{step.title}</span>
                    <span className="block truncate text-xs text-muted-foreground" title={step.detail}>{step.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Order {orderId}</Badge>
              <Badge variant="outline">Synthetic 3PL</Badge>
              <Badge variant="outline">POS sell-through</Badge>
              <Badge variant="outline">Cost of capital</Badge>
            </div>
            <Button
              data-testid="david-negotiation-reset"
              disabled={resetting}
              onClick={() => {
                void resetCommunication();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {resetting ? (
                <Loader2Icon aria-hidden="true" className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              )}
              Reset communication
            </Button>
          </div>

          {resetMessage === undefined ? null : (
            <Alert data-testid="david-negotiation-reset-status">
              <AlertTitle>{resetMessage}</AlertTitle>
              <AlertDescription>Order {orderId} is ready for another email-negotiation test.</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground" data-testid="david-negotiation-round-summary">
            {negotiationRoundSummary(activeOrder)}
          </div>

          <div className="grid gap-2 rounded-lg border bg-background/80 p-3">
            <Label htmlFor="david-manual-counter">Manual counter</Label>
            <Textarea
              data-testid="david-negotiation-manual-counter-text"
              id="david-manual-counter"
              onChange={(event) => {
                setManualCounterText(event.target.value);
              }}
              placeholder="Harbor can pay 20% deposit and accept 2 tranches."
              rows={3}
              value={manualCounterText}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Source: manual operator paste</span>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground" htmlFor="david-manual-counter-round">
                  Reply to round
                </Label>
                <Input
                  aria-label={manualCounterRoundLabel(activeOrder)}
                  className="h-8 w-20"
                  data-testid="david-negotiation-manual-counter-round"
                  id="david-manual-counter-round"
                  min={1}
                  onChange={(event) => {
                    setManualCounterRound(event.target.value);
                  }}
                  type="number"
                  value={manualCounterRound}
                />
                <Button
                  data-testid="david-negotiation-manual-counter-submit"
                  disabled={
                    manualCountering ||
                    manualCounterText.trim().length === 0 ||
                    !Number.isInteger(Number.parseInt(manualCounterRound, 10)) ||
                    Number.parseInt(manualCounterRound, 10) < 1
                  }
                  onClick={() => {
                    void recordManualCounter();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {manualCountering ? (
                    <Loader2Icon aria-hidden="true" className="size-4 animate-spin" data-icon="inline-start" />
                  ) : (
                    <SendIcon aria-hidden="true" data-icon="inline-start" />
                  )}
                  Record counter
                </Button>
              </div>
            </div>
          </div>

          {manualCounterMessage === undefined ? null : (
            <Alert data-testid="david-negotiation-manual-counter-status">
              <AlertTitle>{manualCounterMessage}</AlertTitle>
              <AlertDescription>Order {orderId} communication remains approval-gated.</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
              Loading deterministic deal ranking...
            </div>
          ) : error !== undefined ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Deal optimizer unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : model === undefined ? null : (
            <DealOptimizerView
              account={account}
              approvalDialogOpen={approvalDialogOpen}
              approvalRecordedActionId={approvalRecordedActionId}
              communicationCheckState={communicationCheckState}
              communicationStatus={latestCommunicationStatus}
              model={model}
              onApprovalDialogOpenChange={setApprovalDialogOpen}
              onApprovalRecorded={(actionId) => {
                setApprovalRecordedActionId(actionId);
                setApprovalDialogOpen(false);
                setSendMessage("Human approval recorded. Email send remains separately gated.");
              }}
              onSendApproved={(packet) => {
                void sendApprovedNegotiationEmail(packet);
              }}
              order={activeOrder}
              sendMessage={sendMessage}
              sendingEmail={sendingEmail}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function buildNegotiationApprovalPacket(
  account: Pick<CreditRiskAccountModel, "accountId" | "customer">,
  order: NegotiationOrder,
  candidate: DealOptimizerCandidateModel | undefined
): NegotiationApprovalPacket {
  const draftedRound = readDraftedNegotiationRound(order);
  const round = draftedRound?.round ?? order.nextRound;
  const actionId = draftedRound?.actionId ?? `credit-v2:negotiation:${order.orderId}:r${round.toString()}`;
  const candidateLabel = candidate?.candidateId ?? "top deterministic option";
  const terms =
    candidate === undefined
      ? "the backend-ranked governed terms"
      : [
          candidate.terms.releasePctLabel,
          candidate.terms.depositPctLabel,
          candidate.terms.trancheCountLabel,
          candidate.terms.collateralRatioLabel,
          candidate.terms.financingSpreadLabel
        ].join(", ");

  return {
    actionId,
    packetDetail:
      candidate === undefined
        ? `Round ${round.toString()} drafts ${candidateLabel} for ${account.customer}. Email send stays separately gated.`
        : `Round ${round.toString()} drafts ${candidateLabel} for ${account.customer}: ${terms}. Objective value ${candidate.objectiveValueLabel}. Email send stays separately gated.`,
    packetTitle: `Draft ${account.customer} counter`,
    recordIds: dedupeStrings([actionId, account.accountId, order.orderId, ...order.sourceRecordIds, ...(candidate?.sourceRecordIds ?? [])]),
    routeLabel: "Negotiation email",
    round
  };
}

export function defaultManualCounterRound(order: NegotiationOrder): string {
  return (order.latestSentRound?.round ?? (order.currentRound?.status === "countered" ? order.currentRound.round : 1)).toString();
}

export function hasNegotiationCommunicationChanged(
  order: NegotiationOrder,
  latestRound: NegotiationCommunicationStatus
): boolean {
  const isInboundReply = latestRound.hasInboundReply === true || latestRound.status === "countered" || latestRound.status === "human_review";
  if (!isInboundReply) {
    return false;
  }

  return order.currentRound === undefined || latestRound.round !== order.currentRound.round || latestRound.status !== order.currentRound.status;
}

export function negotiationCommunicationMessage(
  order: NegotiationOrder,
  latestRound: NegotiationCommunicationStatus
): string {
  if (latestRound.status === "human_review") {
    return `Customer reply received for round ${latestRound.round.toString()}. Human review is required before a governed draft can be prepared.`;
  }

  return `New customer reply detected for round ${latestRound.round.toString()}. Refresh communication to load it.`;
}

export function canUseNegotiationActions(
  checkState: NegotiationCommunicationCheckState,
  latestRound: NegotiationCommunicationStatus | undefined
): boolean {
  return checkState === "ready" && latestRound?.status !== "human_review";
}

export function readNegotiationCommunicationStatusResponse(
  value: unknown,
  expectedOrderId: string
): NegotiationCommunicationStatusResponse | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    record.orderId !== expectedOrderId ||
    typeof record.checkedAtIso !== "string" ||
    Number.isNaN(Date.parse(record.checkedAtIso))
  ) {
    return undefined;
  }
  if (record.latestRound === undefined) {
    return { checkedAtIso: record.checkedAtIso, orderId: expectedOrderId };
  }
  if (typeof record.latestRound !== "object" || record.latestRound === null || Array.isArray(record.latestRound)) {
    return undefined;
  }
  const latestRound = record.latestRound as Record<string, unknown>;
  if (
    !Number.isInteger(latestRound.round) ||
    (latestRound.round as number) < 1 ||
    typeof latestRound.status !== "string" ||
    latestRound.status.length === 0 ||
    (latestRound.hasInboundReply !== undefined && typeof latestRound.hasInboundReply !== "boolean")
  ) {
    return undefined;
  }
  return {
    checkedAtIso: record.checkedAtIso,
    latestRound: {
      ...(typeof latestRound.hasInboundReply === "boolean" ? { hasInboundReply: latestRound.hasInboundReply } : {}),
      round: latestRound.round as number,
      status: latestRound.status
    },
    orderId: expectedOrderId
  };
}

export function buildNegotiationCommunicationFlow(
  order: NegotiationOrder,
  latestRound?: NegotiationCommunicationStatus
): NegotiationCommunicationFlowStep[] {
  const effectiveRound = latestRound?.round ?? order.currentRound?.round ?? order.latestSentRound?.round;
  const effectiveStatus = latestRound?.status ?? order.currentRound?.status ?? order.latestSentRound?.status;
  const sentRound = order.latestSentRound?.round ?? (
    effectiveStatus !== undefined && effectiveStatus !== "drafted" ? effectiveRound : undefined
  );
  const replyReceived = latestRound?.hasInboundReply === true || effectiveStatus === "countered" || effectiveStatus === "human_review";

  return [
    {
      detail: order.orderAmountLabel,
      state: "complete",
      title: "Order received"
    },
    {
      detail: sentRound === undefined ? `Round ${order.nextRound.toString()} not sent` : `Round ${sentRound.toString()} sent`,
      state: sentRound === undefined ? "current" : "complete",
      title: "Outbound sent"
    },
    {
      detail: replyReceived && effectiveRound !== undefined ? `Round ${effectiveRound.toString()} received` : "Awaiting customer",
      state: replyReceived ? "complete" : sentRound === undefined ? "waiting" : "current",
      title: "Customer reply"
    },
    {
      detail: effectiveStatus === "human_review"
        ? "Human review required"
        : replyReceived
          ? `Round ${order.nextRound.toString()} ready to evaluate`
        : `Round ${order.nextRound.toString()} after reply`,
      state: replyReceived ? "current" : "waiting",
      title: "Governed draft"
    }
  ];
}

export function manualCounterRoundLabel(order: NegotiationOrder): string {
  return `Reply to outbound round ${defaultManualCounterRound(order)}`;
}

export function negotiationDraftRoundLabel(order: NegotiationOrder): string {
  const draftedRound = readDraftedNegotiationRound(order);
  return `Next outbound round ${(draftedRound?.round ?? order.nextRound).toString()}`;
}

export function negotiationRoundSummary(order: NegotiationOrder): string {
  const latestSent =
    order.latestSentRound === undefined
      ? currentNegotiationRoundLabel(order) ?? "No sent round yet"
      : `Latest sent round ${order.latestSentRound.round.toString()}`;

  return `${latestSent} / Next outbound round ${order.nextRound.toString()}`;
}

export function negotiationOrderReceivedLabel(order: NegotiationOrder): string {
  return `Order received ${order.orderAmountLabel}`;
}

function negotiationFlowIcon(title: NegotiationCommunicationFlowStep["title"]): typeof CheckCircle2Icon {
  if (title === "Outbound sent") {
    return SendIcon;
  }
  if (title === "Customer reply") {
    return BellRingIcon;
  }
  if (title === "Governed draft") {
    return SparklesIcon;
  }
  return CheckCircle2Icon;
}

function negotiationFlowMarkerClassName(state: NegotiationFlowState): string {
  if (state === "complete") {
    return "border-emerald-600 bg-emerald-50 text-emerald-700";
  }
  if (state === "current") {
    return "border-primary bg-primary text-primary-foreground";
  }
  return "border-border bg-background text-muted-foreground";
}

function currentNegotiationRoundLabel(order: NegotiationOrder): string | undefined {
  if (order.currentRound?.status === "countered") {
    return `Round ${order.currentRound.round.toString()} countered`;
  }

  return undefined;
}

export function canSendNegotiationEmailForAction(
  order: NegotiationOrder,
  actionId: string,
  locallyApprovedActionId: string | undefined
): boolean {
  return locallyApprovedActionId === actionId || readHydratedNegotiationApprovalActionId(order) === actionId;
}

export function selectNegotiationDraftCandidate(
  order: NegotiationOrder,
  model: Pick<DealOptimizerModel, "rankedCandidates">
): DealOptimizerCandidateModel | undefined {
  if (order.currentRound?.status === "countered") {
    return (
      model.rankedCandidates.find(
        (candidate) => candidate.candidateId.startsWith("counter-offer:") && candidate.sourceRoundId === order.currentRound?.actionId
      ) ?? model.rankedCandidates[0]
    );
  }

  return model.rankedCandidates[0];
}

export function negotiationHydratedSendMessage(order: NegotiationOrder): string | undefined {
  const sentRounds = [order.currentRound, order.latestSentRound].filter(
    (round): round is NonNullable<typeof round> => round?.status === "sent"
  );

  return sentRounds.length > 0 ? "Approved email send recorded." : undefined;
}

function DealOptimizerView({
  account,
  approvalDialogOpen,
  approvalRecordedActionId,
  communicationCheckState,
  communicationStatus,
  model,
  onApprovalDialogOpenChange,
  onApprovalRecorded,
  onSendApproved,
  order,
  sendMessage,
  sendingEmail
}: Readonly<{
  account: CreditRiskAccountModel;
  approvalDialogOpen: boolean;
  approvalRecordedActionId: string | undefined;
  communicationCheckState: NegotiationCommunicationCheckState;
  communicationStatus: NegotiationCommunicationStatus | undefined;
  model: DealOptimizerModel;
  onApprovalDialogOpenChange: (open: boolean) => void;
  onApprovalRecorded: (actionId: string) => void;
  onSendApproved: (packet: NegotiationApprovalPacket) => void;
  order: NegotiationOrder;
  sendMessage?: string | undefined;
  sendingEmail: boolean;
}>) {
  const topCandidate = model.rankedCandidates[0];
  const draftCandidate = selectNegotiationDraftCandidate(order, model);
  const approvalPacket = buildNegotiationApprovalPacket(account, order, draftCandidate);
  const approvalRecorded = canSendNegotiationEmailForAction(order, approvalPacket.actionId, approvalRecordedActionId);
  const actionsBlocked = !canUseNegotiationActions(communicationCheckState, communicationStatus);
  const humanReviewBlocked = communicationStatus?.status === "human_review";
  const displayedSendMessage = sendMessage ?? negotiationHydratedSendMessage(order);
  return (
    <div className="grid gap-4">
      {topCandidate === undefined ? (
        <Alert variant="destructive">
          <AlertTitle>No ranked deal</AlertTitle>
          <AlertDescription>The deterministic optimizer returned no valid candidates.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-2 rounded-lg border bg-muted/15 p-3">
          <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Why this ranks first</span>
          <p className="text-sm">
            {topCandidate.candidateId} ranks first at {topCandidate.objectiveValueLabel} across{" "}
            {topCandidate.scenarioCount.toString()} deterministic scenarios.
          </p>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>Source hash {model.sourceHash.slice(0, 12)}</span>
            <span>Policy hash {model.policyHash.slice(0, 12)}</span>
          </div>
        </div>
      )}

      <div className="grid gap-3 rounded-lg border bg-background/80 p-3" data-testid="david-negotiation-approval-send-path">
        {actionsBlocked ? (
          <Alert data-testid="david-negotiation-human-review-gate">
            <AlertCircleIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>
              {humanReviewBlocked
                ? "Customer reply requires human review"
                : communicationCheckState === "checking"
                  ? "Checking customer replies"
                  : "Communication status unavailable"}
            </AlertTitle>
            <AlertDescription>
              {humanReviewBlocked
                ? "Draft and send actions remain blocked until the out-of-policy terms are resolved."
                : "Draft and send actions remain blocked until communication status is verified."}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <span className="text-sm font-medium">Draft and send governed counter</span>
            <span className="text-xs font-medium text-foreground">{negotiationDraftRoundLabel(order)}</span>
            <span className="text-xs text-muted-foreground">
              {approvalPacket.actionId} / {approvalPacket.recordIds.length.toString()} cited records
            </span>
          </div>
          {approvalRecorded ? <Badge variant="secondary">Approved</Badge> : <Badge variant="outline">Approval required</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{approvalPacket.packetDetail}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="david-negotiation-draft-counter"
            disabled={topCandidate === undefined || actionsBlocked}
            onClick={() => {
              onApprovalDialogOpenChange(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
            Draft counter
          </Button>
          <Button
            data-testid="david-negotiation-send-approved-email"
            disabled={!approvalRecorded || sendingEmail || actionsBlocked}
            onClick={() => {
              onSendApproved(approvalPacket);
            }}
            size="sm"
            type="button"
          >
            {sendingEmail ? (
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <SendIcon aria-hidden="true" data-icon="inline-start" />
            )}
            Send approved email
          </Button>
        </div>
        {displayedSendMessage === undefined ? null : (
          <Alert data-testid="david-negotiation-send-status">
            <AlertTitle>{displayedSendMessage}</AlertTitle>
            <AlertDescription>Order {order.orderId} remains governed by the durable send ledger.</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-3">
        {model.rankedCandidates.map((candidate) => (
          <div className="grid gap-3 rounded-lg border bg-background/80 p-3" key={candidate.candidateId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={candidate.rank === 1 ? "default" : "outline"}>Rank {candidate.rank.toString()}</Badge>
                  <span className="font-medium">{candidate.candidateId}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{candidate.terms.releasePctLabel}</span>
                  <span>{candidate.terms.depositPctLabel}</span>
                  <span>{candidate.terms.trancheCountLabel}</span>
                  <span>{candidate.terms.collateralRatioLabel}</span>
                  <span>{candidate.terms.financingSpreadLabel}</span>
                </div>
              </div>
              <strong className="text-base">{candidate.objectiveValueLabel}</strong>
            </div>
            <DavidRecordDisclosure items={candidate.sourceRecordIds} label={`${candidate.sourceRecordIds.length.toString()} cited source records`} />
          </div>
        ))}
      </div>

      {model.rejectedCandidates.length === 0 ? null : (
        <div className="grid gap-2 rounded-lg border bg-muted/15 p-3">
          <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Rejected structures</span>
          {model.rejectedCandidates.map((candidate) => (
            <div className="text-sm text-muted-foreground" key={candidate.candidateId}>
              {candidate.candidateId}: {candidate.reason}
            </div>
          ))}
        </div>
      )}

      <DavidApprovalGateDialog
        actionId={approvalPacket.actionId}
        approvalDescription="This records the human decision for this negotiation draft only. Email send remains separately gated."
        governedApprovalDescription="The approval route records the backend receipt before the send step unlocks."
        onApproved={() => {
          onApprovalRecorded(approvalPacket.actionId);
        }}
        onOpenChange={onApprovalDialogOpenChange}
        open={approvalDialogOpen}
        packetDetail={approvalPacket.packetDetail}
        packetTitle={approvalPacket.packetTitle}
        recordIds={approvalPacket.recordIds}
        routeLabel={approvalPacket.routeLabel}
        submitLabel="Approve draft"
        submittingLabel="Recording approval..."
        titleOverride="Approve draft counter?"
      />
    </div>
  );
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : undefined;
}

function readStatus(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record.status === "string" ? record.status : undefined;
}

function readHydratedNegotiationApprovalActionId(order: NegotiationOrder): string | undefined {
  return readDraftedNegotiationRound(order)?.actionId;
}

function readDraftedNegotiationRound(order: NegotiationOrder): { actionId: string; round: number } | undefined {
  return order.currentRound?.status === "drafted"
    ? {
        actionId: order.currentRound.actionId,
        round: order.currentRound.round
      }
    : undefined;
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
