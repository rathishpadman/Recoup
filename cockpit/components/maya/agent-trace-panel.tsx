import { ActivityIcon, CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MayaEvidencePack, QueryEvidenceResponse } from "./types.ts";

type QueryTraceEvent = QueryEvidenceResponse["trace"][number];
type QueryCitation = QueryEvidenceResponse["citations"][number];
type TraceSourceKind = NonNullable<QueryTraceEvent["sourceKind"]>;
type TraceRetrievalSource = NonNullable<QueryTraceEvent["retrievalSource"]>;

interface AgentTracePanelProps {
  evidencePack?: MayaEvidencePack | undefined;
  recordIds?: readonly string[];
  response?: QueryEvidenceResponse | undefined;
  selectedLine?: string | undefined;
}

interface AgentProcessNodeBase {
  citations: string[];
  deterministicBasis: string;
  detailMessage?: string | undefined;
  key: string;
  label: string;
  message: string;
  nodeKind: "basis" | "citation-guard" | "handoff" | "retrieval-source" | "selected-evidence" | "trace-event";
  recordIds: string[];
  sourceLabel: string;
  uiSourceTrustLabel?: string | undefined;
}

interface BackendTraceProcessNode extends AgentProcessNodeBase {
  agentName: string;
  backendTraceEvent: QueryTraceEvent;
  hook: QueryTraceEvent["hook"];
  nextAgentName?: string | undefined;
  phase: QueryTraceEvent["phase"];
  retrievalSource?: QueryTraceEvent["retrievalSource"] | undefined;
  sourceFreshness?: QueryTraceEvent["sourceFreshness"] | undefined;
  sourceKind?: QueryTraceEvent["sourceKind"] | undefined;
  transportLabel?: QueryTraceEvent["transportLabel"] | undefined;
  transportLayer?: QueryTraceEvent["transportLayer"] | undefined;
  toolName?: string | undefined;
}

type AgentProcessNode = AgentProcessNodeBase | BackendTraceProcessNode;

export function AgentTracePanel({ evidencePack, recordIds = [], response, selectedLine }: AgentTracePanelProps) {
  const isTraceRunning = response?.status === "connecting";
  const isAnswered = response?.status === "answered";
  const isBlocked = response?.status === "blocked";
  const isError = response?.status === "error";
  const processNodes = buildAgentProcessNodes({ evidencePack, recordIds, response, selectedLine });

  return (
    <Card data-testid="maya-agent-trace" size="sm">
      <CardHeader>
        <CardTitle>Trace rail</CardTitle>
        <CardDescription>Process map with trace details on demand.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2.5">
        {response === undefined ? (
          <Alert data-testid="maya-trace-selected-evidence-session">
            <ActivityIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Selected evidence process map</AlertTitle>
            <AlertDescription>Evidence process is ready.</AlertDescription>
          </Alert>
        ) : isTraceRunning ? (
          <Alert data-run-status={response.status} data-testid="maya-trace-running-session">
            <ActivityIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Maya is checking the evidence</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2.5">
                <span>{response.message}</span>
                <div className="flex flex-wrap gap-1.5" aria-label="Running trace record IDs">
                  <Badge variant="secondary">{`${response.recordIds.length.toString()} records`}</Badge>
                </div>
                <span>Step receipts will appear as the run completes.</span>
                <div className="grid gap-2 sm:grid-cols-2" aria-label="Running query stages">
                  <div className="h-8 animate-pulse rounded-md bg-muted" data-testid="maya-trace-running-skeleton" />
                  <div className="h-8 animate-pulse rounded-md bg-muted" data-testid="maya-trace-running-skeleton" />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        ) : isBlocked ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>{response.message}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{`${response.recordIds.length.toString()} records`}</Badge>
              </div>
            </AlertDescription>
          </Alert>
        ) : isError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Query error</AlertTitle>
            <AlertDescription>{response.message}</AlertDescription>
          </Alert>
        ) : isAnswered ? (
          <Alert data-testid="maya-trace-answered-session">
            <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>{response.message}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{`${response.recordIds.length.toString()} records`}</Badge>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>{response.message}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{`${response.recordIds.length.toString()} records`}</Badge>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {isTraceRunning && evidencePack !== undefined ? (
          <section className="grid min-w-0 gap-2" aria-label="Selected evidence context">
            {evidencePack.documents.map((document) => (
              <div
                className="grid min-w-0 gap-1 rounded-md border bg-muted/20 p-3"
                data-testid="maya-static-context-row"
                key={`static-context-${document.documentId}`}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="font-medium">Selected source context</span>
                  <Badge variant="outline">{document.citationId}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{document.summary}</p>
              </div>
            ))}
          </section>
        ) : null}
        <ol
          aria-label="Evidence-backed agent process map"
          className="relative flex min-w-0 flex-col gap-2 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-border"
          data-testid="maya-agent-process-map"
        >
          {processNodes.map((node, index) => {
            const isBackendTrace = isBackendTraceProcessNode(node);
            const sourceTrustLabel = formatTraceRetrievalSourceLabel(node);
            const sourceTransportLabel = isBackendTrace ? formatTraceTransportLabel(node) : undefined;

            return (
              <li
                className="relative grid min-w-0 gap-2 rounded-md border bg-background p-3 pl-10 shadow-none"
                data-agent-node={isBackendTrace ? node.agentName : undefined}
                data-citation-count={node.citations.length}
                data-deterministic-basis={isBackendTrace ? node.deterministicBasis : undefined}
                data-hook={isBackendTrace ? node.hook : undefined}
                data-next-agent={isBackendTrace ? node.nextAgentName : undefined}
                data-process-node-kind={isBackendTrace ? node.nodeKind : undefined}
                data-record-ids={node.recordIds.join(" ")}
                data-retrieval-source={isBackendTrace ? resolveTraceRetrievalSource(node) : undefined}
                data-selected-line={node.nodeKind === "selected-evidence" ? node.label : undefined}
                data-source-kind={isBackendTrace ? resolveTraceSourceKind(node) : undefined}
                data-testid="maya-agent-process-node"
                data-trace-label={isBackendTrace ? node.label : undefined}
                data-ui-process-kind={!isBackendTrace ? node.nodeKind : undefined}
                data-ui-process-label={!isBackendTrace ? node.label : undefined}
                key={node.key}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-[0.55rem] top-3 flex size-6 items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground"
                >
                  {index + 1}
                </span>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-1">
                    <span className="truncate text-sm font-medium" title={node.label}>
                      {node.label}
                    </span>
                      <span className="text-xs text-muted-foreground">{formatProcessNodeKind(node.nodeKind)}</span>
                    </div>
                  <Badge variant="secondary">{isBackendTrace ? node.phase : "UI summary"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{node.message}</p>
                <div className="flex flex-wrap gap-1.5" aria-label={`${node.label} trace summary`}>
                  <Badge variant="outline">{formatProcessNodeKind(node.nodeKind)}</Badge>
                  {sourceTrustLabel === undefined ? null : <Badge variant="outline">{sourceTrustLabel}</Badge>}
                  {sourceTransportLabel === undefined ? null : <Badge variant="outline">{sourceTransportLabel}</Badge>}
                  <Badge variant="outline">{`${node.recordIds.length.toString()} records`}</Badge>
                  <Badge variant="outline">{`${node.citations.length.toString()} citations`}</Badge>
                </div>
              </li>
            );
          })}
        </ol>
        <Accordion collapsible type="single">
          <AccordionItem data-testid="maya-agent-trace-details" value="trace-details">
            <AccordionTrigger>Trace details</AccordionTrigger>
            <AccordionContent>
              <div className="flex min-w-0 flex-col gap-3">
                <section className="grid min-w-0 gap-2" aria-label="Process node record and basis details">
                  {processNodes.map((node) => {
                    const isBackendTrace = isBackendTraceProcessNode(node);

                    return (
                      <div className="grid min-w-0 gap-2 rounded-md border bg-muted/20 p-3" key={`detail-${node.key}`}>
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="grid min-w-0 gap-1">
                            <span className="truncate font-medium" title={node.label}>
                              {node.label}
                            </span>
                            <span className="text-sm text-muted-foreground">{node.sourceLabel}</span>
                          </div>
                          <Badge variant="secondary">{isBackendTrace ? node.hook : formatProcessNodeKind(node.nodeKind)}</Badge>
                        </div>
                        {node.detailMessage === undefined ? null : (
                          <p className="text-sm leading-5 text-muted-foreground">{node.detailMessage}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5" aria-label={`${node.label} process record IDs`}>
                          {node.recordIds.length === 0 ? (
                            <Badge variant="outline">No record IDs</Badge>
                          ) : (
                            node.recordIds.map((recordId) => (
                              <Badge className="max-w-full truncate" key={`${node.key}-${recordId}`} title={recordId} variant="outline">
                                {recordId}
                              </Badge>
                            ))
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5" aria-label={`${node.label} citation details`}>
                          {node.citations.length === 0 ? (
                            <Badge variant="outline">cited records pending</Badge>
                          ) : (
                            node.citations.map((citation) => (
                              <Badge className="max-w-full truncate" key={`${node.key}-citation-${citation}`} title={citation} variant="outline">
                                {citation}
                              </Badge>
                            ))
                          )}
                        </div>
                        <p className="text-sm leading-5 text-muted-foreground">{node.deterministicBasis}</p>
                      </div>
                    );
                  })}
                </section>
                {response !== undefined && response.trace.length > 0 ? (
                  <Table data-testid="maya-backend-trace-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phase</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Basis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.trace.map((event) => (
                        <TableRow data-testid="maya-backend-trace-row" key={`${event.phase}-${event.label}`}>
                          <TableCell className="w-[18%] align-top">
                            <Badge variant="secondary">{event.phase}</Badge>
                          </TableCell>
                          <TableCell className="w-[45%] whitespace-normal align-top">
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="font-medium">{event.label}</span>
                              <span className="text-sm text-muted-foreground">{event.message}</span>
                              <div className="flex flex-wrap gap-1.5" aria-label={`${event.phase} trace receipt`}>
                                <Badge variant="secondary">{event.hook}</Badge>
                                <Badge variant="outline">{event.agentName}</Badge>
                                {event.nextAgentName === undefined ? null : <Badge variant="outline">{event.nextAgentName}</Badge>}
                                {event.toolName === undefined ? null : <Badge variant="outline">{event.toolName}</Badge>}
                                {event.sourceKind === undefined ? null : (
                                  <Badge variant="outline">{formatTraceSourceKindLabel(event.sourceKind)}</Badge>
                                )}
                                {event.retrievalSource === undefined ? null : (
                                  <Badge variant="outline">{formatTraceRetrievalSourceValueLabel(event.retrievalSource)}</Badge>
                                )}
                                {formatTraceTransportLabel(event) === undefined ? null : (
                                  <Badge variant="outline">{formatTraceTransportLabel(event)}</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {event.recordIds.map((recordId) => (
                                  <Badge className="max-w-full truncate" key={`${event.phase}-${recordId}`} title={recordId} variant="outline">
                                    {recordId}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-normal align-top text-sm text-muted-foreground">
                            {event.deterministicBasis}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Alert>
                    <AlertTitle>Unavailable</AlertTitle>
                    <AlertDescription>Query trace rows are not available for this state.</AlertDescription>
                  </Alert>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function buildAgentProcessNodes(input: {
  evidencePack: MayaEvidencePack | undefined;
  recordIds: readonly string[];
  response: QueryEvidenceResponse | undefined;
  selectedLine: string | undefined;
}): AgentProcessNode[] {
  const selectedRecordIds = dedupeRecordIds([
    input.selectedLine,
    ...input.recordIds,
    ...(input.evidencePack?.recordIds ?? []),
    ...(input.response?.recordIds ?? [])
  ]);
  const selectedBasis =
    input.evidencePack?.provenance.deterministicBasis ??
    input.response?.deterministicBasis ??
    "Selected evidence record IDs from backend read model.";
  const selectedNode: AgentProcessNode = {
    citations: selectedRecordIds,
    deterministicBasis: selectedBasis,
    key: `selected-${input.selectedLine ?? selectedRecordIds.join("-")}`,
    label: input.selectedLine === undefined ? "Selected evidence" : `Selected line ${input.selectedLine}`,
    message: "Selected evidence records seed the Maya query process map.",
    nodeKind: "selected-evidence",
    recordIds: selectedRecordIds,
    sourceLabel: input.evidencePack?.provenance.sourceName ?? "Selected evidence source",
    uiSourceTrustLabel: "Source-backed"
  };
  const traceNodes = (input.response?.trace ?? []).map((event, index) =>
    traceEventToProcessNode(event, input.response?.citations ?? [], index)
  );
  const sourceNodes = [
    ...sourceNodesFromEvidencePack(input.evidencePack),
    ...sourceNodesFromCitations(input.response?.citations ?? [])
  ];
  const citationGuardNode = citationGuardProcessNode(input.response, selectedRecordIds);
  const basisNode = deterministicBasisProcessNode(input.response, selectedNode);

  return dedupeProcessNodes([
    selectedNode,
    ...traceNodes,
    ...sourceNodes,
    ...(citationGuardNode === undefined ? [] : [citationGuardNode]),
    basisNode
  ]);
}

function traceEventToProcessNode(
  event: QueryTraceEvent,
  citations: readonly QueryCitation[],
  index: number
): AgentProcessNode {
  return {
    agentName: event.agentName,
    backendTraceEvent: event,
    citations: citations.map((citation) => citation.recordId),
    deterministicBasis: event.deterministicBasis,
    hook: event.hook,
    key: `trace-${index.toString()}-${event.phase}-${event.label}`,
    label: event.label,
    message: event.message,
    ...(event.nextAgentName === undefined ? {} : { nextAgentName: event.nextAgentName }),
    nodeKind: event.hook === "agent_handoff" ? "handoff" : event.phase === "retrieval" ? "retrieval-source" : "trace-event",
    phase: event.phase,
    recordIds: event.recordIds,
    ...(event.retrievalSource === undefined ? {} : { retrievalSource: event.retrievalSource }),
    ...(event.sourceFreshness === undefined ? {} : { sourceFreshness: event.sourceFreshness }),
    ...(event.sourceKind === undefined ? {} : { sourceKind: event.sourceKind }),
    ...(event.transportLabel === undefined ? {} : { transportLabel: event.transportLabel }),
    ...(event.transportLayer === undefined ? {} : { transportLayer: event.transportLayer }),
    sourceLabel: resolveTraceSourceLabel(event),
    ...(event.toolName === undefined ? {} : { toolName: event.toolName })
  };
}

function sourceNodesFromEvidencePack(evidencePack: MayaEvidencePack | undefined): AgentProcessNode[] {
  if (evidencePack === undefined) {
    return [];
  }

  return evidencePack.documents.map((document, index) => {
    const sourceKind = sourceKindForEvidenceDocument(document);
    const sourceLabel = sourceLabelForEvidenceDocument(document, sourceKind);
    return {
      citations: [document.citationId, document.documentId],
      deterministicBasis: document.provenance.deterministicBasis,
      detailMessage: document.summary,
      key: `source-${index.toString()}-${document.documentId}`,
      label: `${document.sourceLabel} retrieval`,
      message: compactEvidenceDocumentProcessMessage(document, sourceLabel),
      nodeKind: "retrieval-source",
      recordIds: document.provenance.recordIds,
      sourceLabel,
      uiSourceTrustLabel: sourceTrustLabelForKind(sourceKind)
    };
  });
}

function sourceNodesFromCitations(citations: readonly QueryCitation[]): AgentProcessNode[] {
  return citations
    .filter((citation) => citation.source !== undefined)
    .map((citation) => {
      const sourceKind = sourceKindForCitation(citation);
      const sourceLabel = sourceLabelForCitation(citation);
      return {
        citations: [citation.recordId],
        deterministicBasis: citation.deterministicBasis,
        detailMessage: citation.summary ?? "Citation metadata supplied this process node.",
        key: `citation-source-${citation.recordId}`,
        label: `${sourceLabel} citation`,
        message: compactCitationProcessMessage(sourceLabel),
        nodeKind: "retrieval-source",
        recordIds: [citation.recordId],
        sourceLabel,
        uiSourceTrustLabel: sourceTrustLabelForKind(sourceKind)
      };
    });
}

function compactEvidenceDocumentProcessMessage(
  document: MayaEvidencePack["documents"][number],
  sourceLabel: string
): string {
  return `${sourceLabel}; ${formatEvidenceDocumentType(document.documentType)} evidence with ${formatRecordCount(
    document.provenance.recordIds.length
  )} held in Trace details.`;
}

function compactCitationProcessMessage(sourceLabel: string): string {
  return `${sourceLabel}; cited source with ${formatRecordCount(1)} held in Trace details.`;
}

function formatEvidenceDocumentType(documentType: string): string {
  return documentType.replace(/-/gu, " ");
}

function formatRecordCount(count: number): string {
  return `${count.toString()} ${count === 1 ? "record" : "records"}`;
}

function citationGuardProcessNode(
  response: QueryEvidenceResponse | undefined,
  fallbackRecordIds: readonly string[]
): AgentProcessNode | undefined {
  if (response === undefined || response.citations.length === 0) {
    return undefined;
  }

  return {
    citations: response.citations.map((citation) => citation.recordId),
    deterministicBasis: response.deterministicBasis ?? response.citations[0]?.deterministicBasis ?? "Backend citation guard.",
    key: "citation-guard",
    label: "Citation guard",
    message: "Cited records are checked before Maya renders the answer.",
    nodeKind: "citation-guard",
    recordIds: response.recordIds.length > 0 ? response.recordIds : [...fallbackRecordIds],
    sourceLabel: "Cited answer guard",
    uiSourceTrustLabel: "Source-backed"
  };
}

function deterministicBasisProcessNode(
  response: QueryEvidenceResponse | undefined,
  selectedNode: AgentProcessNode
): AgentProcessNode {
  return {
    citations: response?.citations.map((citation) => citation.recordId) ?? selectedNode.citations,
    deterministicBasis: response?.deterministicBasis ?? selectedNode.deterministicBasis,
    key: "deterministic-basis",
    label: "Deterministic basis",
    message: "Decision and answer display require deterministic basis text with cited record IDs.",
    nodeKind: "basis",
    recordIds: response?.recordIds.length === 0 || response?.recordIds === undefined ? selectedNode.recordIds : response.recordIds,
    sourceLabel: "Deterministic basis guard",
    uiSourceTrustLabel: "Source-backed"
  };
}

function isBackendTraceProcessNode(node: AgentProcessNode): node is BackendTraceProcessNode {
  return "backendTraceEvent" in node;
}

function resolveTraceSourceKind(node: Pick<BackendTraceProcessNode, "retrievalSource" | "sourceKind" | "toolName">): TraceSourceKind {
  const toolName = node.toolName?.toLowerCase() ?? "";
  if (node.sourceKind === "sap_odata" || node.retrievalSource === "sap_odata" || toolName.includes("sap")) {
    return "sap_odata";
  }
  if (node.sourceKind === "supabase" || node.retrievalSource === "supabase" || toolName.includes("supabase")) {
    return "supabase";
  }
  if (node.sourceKind !== undefined) {
    return node.sourceKind;
  }
  if (node.retrievalSource === "source_backed" || toolName.startsWith("retrieval.")) {
    return "derived_backend";
  }

  return "agent_trace";
}

function resolveTraceRetrievalSource(
  node: Pick<BackendTraceProcessNode, "retrievalSource" | "sourceKind" | "toolName">
): TraceRetrievalSource {
  if (node.retrievalSource !== undefined) {
    return node.retrievalSource;
  }

  const sourceKind = resolveTraceSourceKind(node);
  if (sourceKind === "sap_odata") {
    return "sap_odata";
  }
  if (sourceKind === "supabase") {
    return "supabase";
  }
  if (sourceKind === "derived_backend") {
    return "source_backed";
  }

  return "agent_trace";
}

function formatTraceRetrievalSourceLabel(node: AgentProcessNode): string | undefined {
  if (!isBackendTraceProcessNode(node)) {
    return node.uiSourceTrustLabel;
  }

  const retrievalSource = resolveTraceRetrievalSource(node);
  if (retrievalSource === "source_backed") {
    return "Source-backed";
  }
  if (retrievalSource === "sap_odata") {
    return "SAP OData";
  }
  if (retrievalSource === "supabase") {
    return "Supabase";
  }

  return undefined;
}

function formatTraceTransportLabel(
  event: Pick<BackendTraceProcessNode, "sourceFreshness" | "transportLabel" | "transportLayer">
): string | undefined {
  if (event.transportLayer === "supabase_canonical_snapshot") {
    return "via governed snapshot";
  }
  if (event.sourceFreshness === "snapshot") {
    return "via snapshot";
  }

  return undefined;
}

function formatTraceSourceKindLabel(sourceKind: TraceSourceKind): string {
  if (sourceKind === "sap_odata") {
    return "SAP OData";
  }
  if (sourceKind === "supabase") {
    return "Supabase";
  }
  if (sourceKind === "derived_backend") {
    return "Deterministic backend";
  }
  if (sourceKind === "operator_session") {
    return "Operator session";
  }

  return "OpenAI Agents SDK trace";
}

function formatTraceRetrievalSourceValueLabel(retrievalSource: TraceRetrievalSource): string {
  if (retrievalSource === "sap_odata") {
    return "SAP OData";
  }
  if (retrievalSource === "supabase") {
    return "Supabase";
  }
  if (retrievalSource === "source_backed") {
    return "Source-backed";
  }

  return "Agent trace";
}

function resolveTraceSourceLabel(event: QueryTraceEvent): string {
  const retrievalSource = resolveTraceRetrievalSource(event);
  if (retrievalSource === "sap_odata") {
    return "SAP OData retrieval";
  }
  if (retrievalSource === "supabase") {
    return "Supabase retrieval";
  }
  if (retrievalSource === "source_backed") {
    return event.sourceKind === "derived_backend" ? "Source-backed deterministic backend" : "Source-backed retrieval";
  }

  const sourceKind = resolveTraceSourceKind(event);
  if (sourceKind === "sap_odata") {
    return "SAP OData retrieval";
  }
  if (sourceKind === "supabase") {
    return "Supabase retrieval";
  }
  if (sourceKind === "derived_backend") {
    return "Deterministic backend guard";
  }

  return "OpenAI Agents SDK trace";
}

function sourceKindForEvidenceDocument(document: MayaEvidencePack["documents"][number]): TraceSourceKind {
  const sourceKind = document.provenance.sourceKind;
  if (sourceKind !== "supabase") {
    return sourceKind;
  }

  return document.sourceLabel.toLowerCase().includes("supabase") ? "supabase" : "derived_backend";
}

function sourceLabelForEvidenceDocument(
  document: MayaEvidencePack["documents"][number],
  sourceKind: TraceSourceKind
): string {
  if (sourceKind === "sap_odata") {
    return "SAP OData retrieval";
  }
  if (sourceKind === "supabase") {
    return "Supabase retrieval";
  }

  return `${document.sourceLabel} source-backed retrieval`;
}

function sourceKindForCitation(citation: QueryCitation): TraceSourceKind {
  if (citation.source === "sap") {
    return "sap_odata";
  }
  if (citation.source === "supabase") {
    return "supabase";
  }

  return "derived_backend";
}

function sourceLabelForCitation(citation: QueryCitation): string {
  if (citation.source === "sap") {
    return "SAP OData retrieval";
  }
  if (citation.source === "supabase") {
    return "Supabase retrieval";
  }
  if (citation.source === undefined) {
    return "Source-backed backend citation";
  }

  return `${sourceLabelForSource(citation.source)} source-backed retrieval`;
}

function retrievalSourceForKind(sourceKind: TraceSourceKind): TraceRetrievalSource {
  if (sourceKind === "sap_odata") {
    return "sap_odata";
  }
  if (sourceKind === "supabase") {
    return "supabase";
  }
  if (sourceKind === "derived_backend") {
    return "source_backed";
  }

  return "agent_trace";
}

function sourceTrustLabelForKind(sourceKind: TraceSourceKind): string | undefined {
  const retrievalSource = retrievalSourceForKind(sourceKind);
  if (retrievalSource === "source_backed") {
    return "Source-backed";
  }
  if (retrievalSource === "sap_odata") {
    return "SAP OData";
  }
  if (retrievalSource === "supabase") {
    return "Supabase";
  }

  return undefined;
}

function formatProcessNodeKind(kind: AgentProcessNode["nodeKind"]): string {
  const labels: Record<AgentProcessNode["nodeKind"], string> = {
    basis: "Basis",
    "citation-guard": "Citation guard",
    handoff: "Handoff",
    "retrieval-source": "Retrieval",
    "selected-evidence": "Selected",
    "trace-event": "Trace"
  };

  return labels[kind];
}

function sourceLabelForSource(source: string): string {
  const labels: Record<string, string> = {
    bureau: "Bureau",
    docs: "Contract Repo",
    remittance: "Remittance",
    tpm: "TPM"
  };

  return labels[source] ?? source;
}

function dedupeProcessNodes(nodes: readonly AgentProcessNode[]): AgentProcessNode[] {
  const seen = new Set<string>();
  const deduped: AgentProcessNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.key)) {
      continue;
    }
    seen.add(node.key);
    deduped.push(node);
  }

  return deduped;
}

function dedupeRecordIds(recordIds: ReadonlyArray<string | undefined>): string[] {
  return [...new Set(recordIds.filter((recordId): recordId is string => recordId !== undefined && recordId.trim().length > 0))];
}
