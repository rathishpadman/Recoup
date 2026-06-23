import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { QueryEvidenceResponse } from "./types.ts";

interface CitedAnswerCardProps {
  fallbackRecordIds: string[];
  response: QueryEvidenceResponse | undefined;
}

function hasCitedAnswer(response: QueryEvidenceResponse | undefined): response is QueryEvidenceResponse & {
  answer: string;
  deterministicBasis: string;
} {
  return (
    response !== undefined &&
    response.answer !== undefined &&
    response.deterministicBasis !== undefined &&
    response.recordIds.length > 0
  );
}

export function CitedAnswerCard({ fallbackRecordIds, response }: CitedAnswerCardProps) {
  if (!hasCitedAnswer(response)) {
    return (
      <Card data-testid="maya-cited-answer">
        <CardHeader>
          <CardTitle>Cited answer</CardTitle>
          <CardDescription>Blocked unless a response includes citations and deterministic basis</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>{response?.message ?? "No cited answer returned"}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-2">
                {(response?.recordIds ?? fallbackRecordIds).map((recordId) => (
                  <Badge key={recordId} variant="outline">
                    {recordId}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="maya-cited-answer">
      <CardHeader>
        <CardTitle>Cited answer</CardTitle>
        <CardDescription>{response.deterministicBasis}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>{response.answer}</p>
        <div className="flex flex-wrap gap-2" aria-label="Cited answer record IDs">
          {response.recordIds.map((recordId) => (
            <Badge key={recordId} variant="secondary">
              {recordId}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
