"use client";

import { MessageSquareIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { AuditConfirmationPanel } from "./audit-confirmation-panel.tsx";
import { CitedAnswerCard } from "./cited-answer-card.tsx";
import { EvidenceDossier } from "./evidence-dossier.tsx";
import { RecoveryDraftReview } from "./recovery-draft-review.tsx";
import type {
  ApprovalGateResponse,
  MayaActionInboxItem,
  MayaJourneyItem,
  MayaMultimodalDock,
  MayaSelectedCase,
  MayaWorklistItem,
  QueryEvidenceResponse
} from "./types.ts";

interface DeductionCaseWorkspaceProps {
  actionInbox: MayaActionInboxItem[];
  approvalResponse?: ApprovalGateResponse;
  journey: MayaJourneyItem[];
  multimodalDock: MayaMultimodalDock;
  onOpenApproval: () => void;
  onOpenQuery: () => void;
  queryResponse?: QueryEvidenceResponse;
  selected: MayaSelectedCase;
  selectedWorklistItem: MayaWorklistItem | undefined;
}

export function DeductionCaseWorkspace({
  actionInbox,
  approvalResponse,
  journey,
  multimodalDock,
  onOpenApproval,
  onOpenQuery,
  queryResponse,
  selected,
  selectedWorklistItem
}: DeductionCaseWorkspaceProps) {
  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-case-workspace">
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{selected.lineId}</p>
          <h2 className="text-xl font-semibold">{selectedWorklistItem?.scenarioLabel ?? selected.draft.actionLabel}</h2>
          <p className="text-sm text-muted-foreground">{selectedWorklistItem?.customerLabel ?? selected.draft.basis}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenQuery} type="button" variant="outline">
            <MessageSquareIcon data-icon="inline-start" />
            Query evidence
          </Button>
          <Button onClick={onOpenApproval} type="button">
            <ShieldCheckIcon data-icon="inline-start" />
            Human approval
          </Button>
        </div>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="trace">Trace</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Selected case overview</CardTitle>
              <CardDescription>{selected.draft.basis}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Fact label="Customer" value={selectedWorklistItem?.customerLabel} />
                <Fact label="Scenario" value={selectedWorklistItem?.scenarioLabel} />
                <Fact label="Amount" value={selectedWorklistItem?.amount ?? selected.draft.amount} />
                <Fact label="Verdict" value={selectedWorklistItem?.verdictLabel} />
                <Fact label="Confidence" value={selectedWorklistItem?.confidenceLabel} />
                <Fact label="Queue" value={selectedWorklistItem?.queueLabel} />
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2" aria-label="Selected case record IDs">
                {selected.evidencePack.recordIds.map((recordId) => (
                  <Badge key={recordId} variant="secondary">
                    {recordId}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceDossier evidencePack={selected.evidencePack} />
        </TabsContent>
        <TabsContent value="trace">
          <div className="grid gap-3 xl:grid-cols-2">
            <AgentTracePanel response={queryResponse} subAgents={multimodalDock.subAgents} />
            <CitedAnswerCard fallbackRecordIds={selected.evidencePack.recordIds} response={queryResponse} />
          </div>
        </TabsContent>
        <TabsContent value="draft">
          <RecoveryDraftReview actionInbox={actionInbox} draft={selected.draft} recordIds={selected.evidencePack.recordIds} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditConfirmationPanel journey={journey} response={approvalResponse} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
