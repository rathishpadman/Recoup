"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreditRecommendationAcknowledgeProps {
  acknowledgedAt?: string | undefined;
  actionId: string;
}

/**
 * Confirms the credit lead has received an approved recommendation. This is the step the flow
 * strip describes and the product previously could not accept: the surface said "waiting for the
 * credit lead to acknowledge" with nothing anywhere to click.
 */
export function CreditRecommendationAcknowledge({ acknowledgedAt, actionId }: CreditRecommendationAcknowledgeProps) {
  const [acknowledged, setAcknowledged] = React.useState(acknowledgedAt !== undefined);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  if (acknowledged) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="credit-recommendation-acknowledged">
        Acknowledged by the credit lead.
      </p>
    );
  }

  async function acknowledge(): Promise<void> {
    setError(undefined);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/credit/recommendations/${encodeURIComponent(actionId)}/acknowledge`, {
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as { acknowledgedAt?: string; error?: string };

      if (!response.ok || typeof result.acknowledgedAt !== "string") {
        setError(result.error ?? "Acknowledgement was not recorded.");
        return;
      }

      setAcknowledged(true);
    } catch {
      setError("Acknowledgement service is unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-1">
      <Button
        className="w-fit"
        data-testid="credit-recommendation-acknowledge"
        disabled={submitting}
        onClick={() => void acknowledge()}
        size="sm"
        type="button"
        variant="outline"
      >
        <CheckIcon aria-hidden="true" data-icon="inline-start" />
        {submitting ? "Recording" : "Acknowledge"}
      </Button>
      {error === undefined ? null : <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
