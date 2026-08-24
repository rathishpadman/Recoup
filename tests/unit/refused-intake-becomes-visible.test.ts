import { describe, expect, it } from "vitest";

import {
  recordRefusedIntake,
  refusalNeedsAPerson
} from "../../src/services/cashApplicationRun.ts";
import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";

/**
 * BRD AC-05 and FR-CA-11: a refused attachment leaves a visible safe blocker
 * and enters Cash Application Review. No model-derived business record is
 * created.
 *
 * Only the second half was true. Send a PDF instead of a CSV and intake
 * correctly refuses it — and then nothing appears anywhere. The sender gets a
 * 422 and the operations screen shows no trace, so a customer's payment note
 * can be turned away with nobody aware it arrived. The refusal was safe and
 * invisible, and invisible is the part that fails the requirement.
 *
 * A refusal now opens a run that stops at Review, carrying the safe reason and
 * nothing from the file itself. No allocation, no case, no handoff: the
 * attachment was never parsed, so there is nothing to say about its contents
 * beyond the fact that it was refused.
 */

const env = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function refuse(reason: string, detail = "declared application/pdf") {
  const repository = createInMemoryWorkflowRepository();
  const outcome = await recordRefusedIntake({
    repository,
    messageId: "MSG-PDF-1",
    reason,
    detail,
    provenanceMode: "live"
  });

  return { repository, outcome };
}

describe("a refused payment note is visible (AC-05)", () => {
  it("opens a run so the refusal is on the screen at all", async () => {
    const { repository, outcome } = await refuse("attachment_unsupported");
    const runs = await repository.listRuns();

    expect(runs.map((run) => run.runId)).toContain(outcome.runId);
  });

  it("stops at Review rather than looking finished", async () => {
    const { outcome } = await refuse("attachment_unsupported");

    expect(outcome.state).toBe("Review");
  });

  it("reads as needing a person on the operations screen", async () => {
    const { repository } = await refuse("attachment_unsupported");
    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    expect(snapshot.runs[0]?.status).toBe("Blocked");
    expect(snapshot.counts.needsAttention).toBe(1);
  });

  it("says why in words, not in an enum", async () => {
    const { repository } = await refuse("attachment_unsupported");
    const snapshot = await loadAgentOperationsSnapshot({ repository, env });
    const summaries = snapshot.events.map((event) => event.event).join(" ");

    expect(summaries).not.toContain("attachment_unsupported");
    expect(summaries.toLowerCase()).toContain("format");
  });

  it("creates no case and no allocation, because nothing was read", async () => {
    const { repository, outcome } = await refuse("attachment_unsupported");
    const events = await repository.listEvents(outcome.runId);

    expect(outcome.caseId).toBeUndefined();
    expect(events.map((event) => event.eventType)).not.toContain("case_created");
    expect(events.map((event) => event.eventType)).not.toContain("maya_ready");
  });

  it("repeats to the same run rather than stacking rows for one message", async () => {
    const repository = createInMemoryWorkflowRepository();
    const input = {
      repository,
      messageId: "MSG-PDF-1",
      reason: "attachment_unsupported",
      detail: "declared application/pdf",
      provenanceMode: "live" as const
    };

    const first = await recordRefusedIntake(input);
    const second = await recordRefusedIntake(input);

    expect(second.runId).toBe(first.runId);
    expect((await repository.listRuns()).length).toBe(1);
  });

  it("carries nothing from inside the file", async () => {
    const { repository, outcome } = await refuse(
      "attachment_unsafe",
      "eicar signature in remittance-secret-customer.pdf"
    );
    const events = await repository.listEvents(outcome.runId);

    // Every field the ledger renders, not just the summary. Production put
    // the diagnostic detail in the event status, and the ledger renders the
    // status as its Outcome column — so a filename would have gone straight
    // onto the screen.
    const rendered = events
      .flatMap((event) => [event.safeSummary, event.status, ...event.recordIds])
      .join(" ");

    expect(rendered).not.toContain("secret-customer");
    expect(rendered).not.toContain("eicar");
    expect(rendered).not.toContain(".pdf");
  });

  it("puts a safe code in the outcome column, not free text", async () => {
    const { repository, outcome } = await refuse("attachment_unsupported", "declared application/x-msdownload");
    const events = await repository.listEvents(outcome.runId);

    expect(events[0]?.status).toBe("attachment_unsupported");
  });
});

describe("each refusal explains itself differently", () => {
  it.each([
    ["attachment_unsupported", /format/iu],
    ["attachment_unsafe", /security|safe/iu],
    ["attachment_quarantined", /quarantine/iu],
    ["scan_unavailable", /security check/iu],
    ["mapping_failed", /read|understand/iu]
  ])("%s reads as something a person can act on", async (reason, expected) => {
    const { repository, outcome } = await refuse(reason);
    const events = await repository.listEvents(outcome.runId);

    expect(events[events.length - 1]?.safeSummary ?? "").toMatch(expected);
  });
});

/**
 * Not every refusal is work for a person, and the difference matters more
 * than it first looks.
 *
 * A customer email whose attachment could not be processed is a real payment
 * note that needs someone to look at it. A request with a bad signature or
 * addressed to the wrong mailbox is not: it may not be from a customer at
 * all. Opening a run for those would let anyone who can reach the endpoint
 * fill the operations board with rows, which turns a safety feature into a
 * way to bury real work.
 */
describe("which refusals are somebody’s problem", () => {
  it.each(["attachment_unsupported", "attachment_unsafe", "attachment_quarantined", "scan_unavailable", "mapping_failed"])(
    "%s needs a person",
    (reason) => {
      expect(refusalNeedsAPerson(reason)).toBe(true);
    }
  );

  it.each(["signature_invalid", "replay_detected", "wrong_recipient", "attachment_missing", "intake_disabled"])(
    "%s does not",
    (reason) => {
      expect(refusalNeedsAPerson(reason)).toBe(false);
    }
  );
});
