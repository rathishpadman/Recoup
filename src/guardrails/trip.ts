export type GuardrailName =
  | "action-proposal-explainability"
  | "billing-action-boundary"
  | "decision-explainability"
  | "deduction-evidence-pack"
  | "intent-evidence"
  | "no-wrongful-containment"
  | "recovery-action-boundary";

export type GuardrailTripRecordIdStatus = "missing" | "present";

export interface GuardrailTripEvent {
  eventType: "GuardrailTripEvent";
  guardrailName: GuardrailName;
  reason: string;
  recordIds?: readonly string[];
  recordIdStatus: GuardrailTripRecordIdStatus;
}

export class GuardrailTripError extends Error {
  readonly event: GuardrailTripEvent;

  constructor(event: GuardrailTripEvent) {
    super(event.reason);
    this.name = "GuardrailTripError";
    this.event = event;
  }
}

export function isGuardrailTripError(error: unknown): error is GuardrailTripError {
  return error instanceof GuardrailTripError;
}

export function throwGuardrailTrip(input: {
  guardrailName: GuardrailName;
  reason: string;
  recordIds?: string[];
}): never {
  throw new GuardrailTripError(createGuardrailTripEvent(input));
}

function createGuardrailTripEvent(input: {
  guardrailName: GuardrailName;
  reason: string;
  recordIds?: string[];
}): GuardrailTripEvent {
  const recordIds = [...(input.recordIds ?? [])];

  if (recordIds.length === 0) {
    return Object.freeze({
      eventType: "GuardrailTripEvent",
      guardrailName: input.guardrailName,
      reason: input.reason,
      recordIdStatus: "missing"
    });
  }

  return Object.freeze({
    eventType: "GuardrailTripEvent",
    guardrailName: input.guardrailName,
    reason: input.reason,
    recordIds: Object.freeze(recordIds),
    recordIdStatus: "present"
  });
}
