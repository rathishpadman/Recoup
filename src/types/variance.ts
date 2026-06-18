import { createHash } from "node:crypto";
import { z } from "zod";

export const EventIdInputSchema = z.object({
  ruleId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  period: z.string().min(1)
});

export type EventIdInput = z.infer<typeof EventIdInputSchema>;

export function createEventId(input: EventIdInput): string {
  const parsed = EventIdInputSchema.parse(input);
  const payload = JSON.stringify({
    ruleId: parsed.ruleId,
    recordIds: [...parsed.recordIds].sort(),
    period: parsed.period
  });

  return createHash("sha256").update(payload).digest("hex");
}
