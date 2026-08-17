/**
 * Verification for model-composed answers.
 *
 * The model is allowed to write the sentence; it is not allowed to supply a business value. Every
 * amount, case, record, customer and count in the prose must already exist in the fact set that
 * code computed from the read model. Anything else is a fabrication and the answer is rejected in
 * favour of the deterministic sentence.
 *
 * This is what makes I-1 mechanical rather than a matter of trusting the model: an amount the code
 * never computed cannot reach a reader, whatever the model wrote.
 */

export interface GroundedAnswerFactsInput {
  amounts: readonly string[];
  caseIds: readonly string[];
  counts: readonly number[];
  customerNames: readonly string[];
  recordIds: readonly string[];
  routings: readonly string[];
  ruleIds: readonly string[];
  verdicts: readonly string[];
}

export interface GroundedAnswerFacts {
  amounts: Set<string>;
  caseIds: Set<string>;
  counts: Set<string>;
  customerNames: readonly string[];
  recordIds: Set<string>;
  routings: readonly string[];
  ruleIds: readonly string[];
  verdicts: readonly string[];
}

export type GroundedAnswerVerification =
  | { status: "verified" }
  | { reason: string; status: "rejected" };

/** Known customer names, so a name outside the run can be recognised as invented. */
const knownCustomerNamePattern = /\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/gu;
const amountPattern = /\$\s?[\d,]+(?:\.\d{2})?/gu;
const caseIdPattern = /\bS\d+\b/gu;
const recordIdPattern = /\b(?:EVD|RECON|INV|POD|TPM|CLAIM|DOC|SAP|VECTOR)-[A-Z0-9-]+\b/gu;
const countClaimPattern = /\b(\d+)\s+(?:deduction |open |invalid |valid |partial |cited |case|record|line|customer)/giu;

export function buildGroundedAnswerFacts(input: GroundedAnswerFactsInput): GroundedAnswerFacts {
  return {
    amounts: new Set(input.amounts.map(normalizeAmount)),
    caseIds: new Set(input.caseIds),
    counts: new Set(input.counts.map((count) => count.toString())),
    customerNames: [...input.customerNames],
    recordIds: new Set(input.recordIds),
    routings: [...input.routings],
    ruleIds: [...input.ruleIds],
    verdicts: [...input.verdicts]
  };
}

export function verifyGroundedAnswer(answer: string, facts: GroundedAnswerFacts): GroundedAnswerVerification {
  const text = answer.trim();
  if (text.length === 0) {
    return { reason: "Answer was empty.", status: "rejected" };
  }

  for (const amount of text.match(amountPattern) ?? []) {
    if (!facts.amounts.has(normalizeAmount(amount))) {
      return { reason: `Answer used an amount that code did not compute: ${amount}`, status: "rejected" };
    }
  }

  for (const recordId of text.match(recordIdPattern) ?? []) {
    if (!facts.recordIds.has(recordId)) {
      return { reason: `Answer cited a record that is not in scope: ${recordId}`, status: "rejected" };
    }
  }

  // Case ids are checked after record ids so S3-L1 is consumed as a record, not as case S3.
  const textWithoutRecordIds = text.replace(recordIdPattern, " ").replace(/\bS\d+-L\d+\b/gu, " ");
  for (const caseId of textWithoutRecordIds.match(caseIdPattern) ?? []) {
    if (!facts.caseIds.has(caseId)) {
      return { reason: `Answer named a case that is not in this run: ${caseId}`, status: "rejected" };
    }
  }

  for (const match of text.matchAll(countClaimPattern)) {
    const count = match[1];
    if (count !== undefined && !facts.counts.has(count)) {
      return { reason: `Answer stated a count that code did not compute: ${count}`, status: "rejected" };
    }
  }

  for (const name of textWithoutRecordIds.match(knownCustomerNamePattern) ?? []) {
    if (isLikelyCustomerName(name) && !facts.customerNames.includes(name)) {
      return { reason: `Answer named a customer that is not in this run: ${name}`, status: "rejected" };
    }
  }

  // Inventing nothing is not the same as saying something. Prose that references no case, record,
  // verdict, routing, rule or amount answers nothing, and must not displace the deterministic
  // sentence just because it is harmless.
  if (!referencesAnyFact(text, facts)) {
    return { reason: "Answer did not reference anything from this run.", status: "rejected" };
  }

  return { status: "verified" };
}

function referencesAnyFact(text: string, facts: GroundedAnswerFacts): boolean {
  const lowered = text.toLowerCase();
  const statedAmounts = (text.match(amountPattern) ?? []).map(normalizeAmount);

  return (
    [...facts.caseIds].some((caseId) => new RegExp(`\\b${caseId}\\b`, "u").test(text)) ||
    [...facts.recordIds].some((recordId) => text.includes(recordId)) ||
    statedAmounts.some((amount) => facts.amounts.has(amount)) ||
    facts.verdicts.some((verdict) => lowered.includes(verdict.toLowerCase())) ||
    facts.routings.some((routing) => lowered.includes(routing.toLowerCase())) ||
    facts.ruleIds.some((ruleId) => lowered.includes(ruleId.toLowerCase())) ||
    facts.customerNames.some((name) => text.includes(name))
  );
}

/** Trailing zeros and spacing differ between code output and prose; that is formatting, not a claim. */
function normalizeAmount(amount: string): string {
  const digits = amount.replace(/[$\s,]/gu, "");
  const numeric = Number(digits);

  return Number.isFinite(numeric) ? numeric.toFixed(2) : digits;
}

/**
 * Only treat a capitalised phrase as a customer claim when it looks like a trading name. Sentence
 * openers and role phrases would otherwise trip the guard on ordinary prose.
 */
function isLikelyCustomerName(candidate: string): boolean {
  return /\b(?:Grocery|Foods|Markets|Club|Retail|Distribution|Holdings|Group|Stores|Company|Corp|Inc|Ltd)\b/u.test(
    candidate
  );
}

export type GroundedAnswerPolicy = "rejected_ungrounded" | "suppressed" | "verified_grounded";

export interface GroundedAnswerSelection {
  answer: string;
  policy: GroundedAnswerPolicy;
  rejectionReason?: string;
}

/**
 * Chooses what a reader sees. Model prose is used only when every business value in it was
 * computed by code; otherwise the deterministic sentence stands. The reader is never shown
 * nothing, and never shown a figure the run did not produce.
 */
export function selectGroundedAnswer(input: {
  deterministicAnswer: string;
  facts: GroundedAnswerFacts;
  modelAnswer?: string | undefined;
}): GroundedAnswerSelection {
  const modelAnswer = input.modelAnswer?.trim();
  if (modelAnswer === undefined || modelAnswer.length === 0) {
    return { answer: input.deterministicAnswer, policy: "suppressed" };
  }

  const verification = verifyGroundedAnswer(modelAnswer, input.facts);
  if (verification.status === "rejected") {
    return {
      answer: input.deterministicAnswer,
      policy: "rejected_ungrounded",
      rejectionReason: verification.reason
    };
  }

  return { answer: modelAnswer, policy: "verified_grounded" };
}
