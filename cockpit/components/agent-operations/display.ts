/**
 * Turning backend values into something a reader follows.
 *
 * Presentation only. Nothing here decides anything, and no monetary value is
 * touched: money arrives already formatted by the backend and is rendered
 * exactly as given.
 *
 * Dates are assembled by hand rather than with toLocaleString. An invariant
 * forbids that call across this folder, because it is how a monetary value
 * quietly gets reformatted in the browser, and the rule is worth more than the
 * convenience.
 */

const DASH = "—";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const;

function pad(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

function parse(iso: string | undefined): Date | undefined {
  if (iso === undefined) {
    return undefined;
  }

  const parsed = new Date(iso);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** An ISO timestamp as a short local date and time: "23 Aug, 14:05:32". */
export function readableTime(iso: string | undefined): string {
  const at = parse(iso);

  if (at === undefined) {
    return iso ?? DASH;
  }

  const day = String(at.getDate());
  const month = MONTHS[at.getMonth()] ?? "";
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;

  return `${day} ${month}, ${clock}`;
}

/** Just the clock, for rows where the date is already obvious. */
export function readableClock(iso: string | undefined): string {
  const at = parse(iso);

  if (at === undefined) {
    return iso ?? DASH;
  }

  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/**
 * Internal phase names as steps a reader recognises. An unmapped phase shows
 * its own name rather than a blank: a missing label should look like a gap in
 * this list, not like a step that did not happen.
 */
const PHASE_LABEL: Record<string, string> = {
  intake: "Payment note",
  validate: "Bank check",
  allocate: "Applying cash",
  reason: "Reason check",
  case: "Case",
  handoff: "Handover"
};

export function readablePhase(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}

/** The internal specialist key as the name shown on the roster. */
const SPECIALIST_LABEL: Record<string, string> = {
  cash_application: "Cash Application",
  deduction_forensics: "Deduction Forensics",
  recovery_drafter: "Recovery Drafter",
  maya_queue: "Maya Queue"
};

export function readableSpecialist(specialist: string | undefined): string {
  if (specialist === undefined) {
    return DASH;
  }

  return SPECIALIST_LABEL[specialist] ?? specialist;
}

/** Outcome codes as words. */
const OUTCOME_LABEL: Record<string, string> = {
  started: "Started",
  ok: "Done",
  created: "Created",
  ready: "Handed over",
  balanced: "Balanced",
  imbalanced: "Does not balance",
  run_failed: "Failed",
  awaiting_receipt: "Waiting on the bank",
  // Reason codes that arrive as an outcome when a run stops. Left unmapped
  // they surface as "not found", which reads like a system error rather than
  // the ordinary situation of the money not having landed yet.
  not_found: "No payment found",
  not_settled: "Not cleared yet",
  stale: "Confirmation too old",
  reversed: "Payment reversed",
  contract_gap: "No approved rule",
  source_unavailable: "Bank source unavailable",
  wait_exhausted: "Waited too long for the money",
  run_stranded: "Stopped before it finished",
  // Why a payment note was refused at the door.
  attachment_unsupported: "File type not accepted",
  attachment_unsafe: "Failed the security check",
  attachment_quarantined: "Quarantined by the security check",
  scan_unavailable: "Security check could not run",
  mapping_failed: "Could not be read as a payment note"
};

export function readableOutcome(outcome: string): string {
  return OUTCOME_LABEL[outcome] ?? outcome.replace(/_/gu, " ");
}

/**
 * Validated reason codes with their meaning.
 *
 * The code stays on screen because it is the governed value a reviewer
 * checks against the reason map. What was missing was what it means: on its
 * own, "DEP" told a reader nothing.
 *
 * DEP is the only code the first release can validate, so this list is short
 * by design rather than by omission.
 */
const VALIDATED_REASON_LABEL: Record<string, string> = {
  DEP: "Deposit deduction (DEP)"
};

export function readableValidatedReason(code: string): string {
  return VALIDATED_REASON_LABEL[code] ?? code;
}
