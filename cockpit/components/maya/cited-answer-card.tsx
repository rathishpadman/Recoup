import { CheckCircle2Icon, FileTextIcon, ShieldCheckIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MayaEvidenceDocument, MayaEvidencePack, QueryEvidenceResponse } from "./types.ts";

interface CitedAnswerCardProps {
  evidencePack: MayaEvidencePack;
  response: QueryEvidenceResponse | undefined;
}

function hasCitedAnswer(response: QueryEvidenceResponse | undefined): response is QueryEvidenceResponse & {
  answer: string;
  deterministicBasis: string;
} {
  return (
    response !== undefined &&
    response.status === "answered" &&
    response.answer !== undefined &&
    response.answer.trim().length > 0 &&
    response.deterministicBasis !== undefined &&
    response.deterministicBasis.trim().length > 0 &&
    response.citations.length > 0 &&
    response.recordIds.length > 0
  );
}

type BackendCitation = QueryEvidenceResponse["citations"][number];

function findEvidenceDocumentForCitation(
  citation: BackendCitation,
  documents: MayaEvidenceDocument[]
): MayaEvidenceDocument | undefined {
  return documents.find(
    (document) =>
      document.documentId === citation.documentId ||
      document.documentId === citation.recordId ||
      document.citationId === citation.documentId ||
      document.citationId === citation.recordId
  );
}

function hasBackendCitationMetadata(citation: BackendCitation): boolean {
  return (
    citation.documentId !== undefined ||
    citation.source !== undefined ||
    citation.summary !== undefined
  );
}

export function CitedAnswerCard({ evidencePack, response }: CitedAnswerCardProps) {
  if (!hasCitedAnswer(response)) {
    return (
      <Card data-testid="maya-cited-answer" size="sm">
        <CardHeader>
          <CardTitle>Cited answer</CardTitle>
          <CardDescription>Blocked unless a response includes citations and deterministic basis</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Alert data-testid="maya-cited-answer-blocked">
            <AlertTitle>{response?.message ?? "No cited answer returned"}</AlertTitle>
            <AlertDescription>
              {(response?.recordIds ?? []).length === 0
                ? "No cited record IDs were returned with this response."
                : "Cited record IDs are available in source details."}
            </AlertDescription>
          </Alert>
          <Accordion collapsible type="single">
            <AccordionItem data-testid="maya-cited-blocked-source-details" value="blocked-source-details">
              <AccordionTrigger>Source details</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-2" aria-label="Blocked cited answer record IDs">
                  {(response?.recordIds ?? []).length === 0 ? (
                    <Badge variant="outline">No record IDs</Badge>
                  ) : (
                    (response?.recordIds ?? []).map((recordId) => (
                      <Badge key={recordId} variant="outline">
                        {recordId}
                      </Badge>
                    ))
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    );
  }

  const citationRows = response.citations.map((citation) => ({
    citation,
    metadata: findEvidenceDocumentForCitation(citation, evidencePack.documents)
  }));

  return (
    <Card data-testid="maya-cited-answer" size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
          <span>Sources and basis</span>
        </CardTitle>
        <CardDescription>Citations and deterministic basis for the current answer.</CardDescription>
        <CardAction>
          <Badge variant="secondary">Answered</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Answer summary</Badge>
              <Badge variant="outline">{`${response.recordIds.length.toString()} cited records`}</Badge>
              <Badge variant="outline">{`${evidencePack.documents.length.toString()} loaded documents`}</Badge>
            </div>
            <p className="text-sm leading-6" data-testid="maya-cited-answer-text">
              {displayAnswerWithoutInlineRecordIds(response.answer, response.recordIds)}
            </p>
          </div>
          <Separator />
          <Accordion collapsible type="single">
            <AccordionItem data-testid="maya-cited-answer-basis" value="basis">
              <AccordionTrigger>Basis</AccordionTrigger>
              <AccordionContent>
                <Alert>
                  <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
                  <AlertTitle>Basis available in trace details</AlertTitle>
                  <AlertDescription>{response.deterministicBasis}</AlertDescription>
                </Alert>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <Accordion collapsible type="single">
          <AccordionItem data-testid="maya-cited-source-details" value="source-details">
            <AccordionTrigger>Sources</AccordionTrigger>
            <AccordionContent>
              <div className="flex min-w-0 flex-col gap-2" aria-label="Cited answer record IDs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Citations</span>
                  <Badge variant="outline">Record IDs from query response</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record ID</TableHead>
                      <TableHead>Evidence metadata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {citationRows.map(({ citation, metadata }, index) => {
                      const hasBackendMetadata = hasBackendCitationMetadata(citation);
                      return (
                        <TableRow
                          data-citation-index={index}
                          data-metadata-gap={metadata === undefined && !hasBackendMetadata ? "true" : undefined}
                          data-metadata-join={metadata === undefined ? (hasBackendMetadata ? "backend-citation" : undefined) : "exact"}
                          data-record-id={citation.recordId}
                          data-testid="maya-cited-record-row"
                          key={`${citation.recordId}-${index.toString()}`}
                        >
                          <TableCell className="w-[34%] whitespace-normal align-top">
                            <Badge className="max-w-full truncate" title={citation.recordId} variant="secondary">
                              {citation.recordId}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <div className="flex min-w-0 flex-col gap-1" data-testid="maya-cited-record-metadata">
                              {metadata !== undefined ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                                    <span className="font-medium">{metadata.description}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <Badge variant="secondary">{metadata.citationId}</Badge>
                                    <Badge variant="outline">{metadata.documentId}</Badge>
                                    <Badge variant="outline">{metadata.documentType}</Badge>
                                    <Badge variant="outline">{metadata.relevance}</Badge>
                                    {citation.source === undefined ? null : <Badge variant="outline">{citation.source}</Badge>}
                                  </div>
                                  <span className="text-sm text-muted-foreground">
                                    {metadata.sourceLabel} / {metadata.verifiedLabel}
                                  </span>
                                  <span className="text-sm text-muted-foreground">{citation.summary ?? metadata.summary}</span>
                                </>
                              ) : hasBackendMetadata ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                                    <span className="font-medium">{citation.documentId ?? citation.recordId}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {citation.documentId === undefined ? null : <Badge variant="secondary">{citation.documentId}</Badge>}
                                    {citation.source === undefined ? null : <Badge variant="outline">{citation.source}</Badge>}
                                  </div>
                                  {citation.summary === undefined ? null : (
                                    <span className="text-sm text-muted-foreground">{citation.summary}</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                                    <span>Metadata unavailable</span>
                                  </div>
                                  <span className="text-sm text-muted-foreground">
                                    No exact document ID, source, or summary was returned for this cited record.
                                  </span>
                                </>
                              )}
                              <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/25 p-2">
                                <span className="text-xs font-medium">Citation basis</span>
                                <span className="text-sm text-muted-foreground" data-testid="maya-cited-record-basis">
                                  {citation.deterministicBasis}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function displayAnswerWithoutInlineRecordIds(answer: string, recordIds: readonly string[]): string {
  const trimmedAnswer = answer.trim();
  const withoutTrailingRecordList = trimmedAnswer
    .replace(/\s*(?:The answer is limited to cited record IDs|Cited record IDs|Record IDs)\s*:\s*[^.]+\.?\s*$/iu, "")
    .trim();
  const redacted = [...recordIds]
    .sort((left, right) => right.length - left.length)
    .reduce((current, recordId) => {
      const escapedRecordId = escapeRegExp(recordId);
      return current
        .replace(new RegExp(`\\bLine\\s+${escapedRecordId}\\b`, "gu"), "The selected line")
        .replace(new RegExp(escapedRecordId, "gu"), "a cited record");
    }, withoutTrailingRecordList)
    .replace(/\s+/gu, " ")
    .trim();

  return redacted.length === 0 ? "Answer details are available with citations in source details." : redacted;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
