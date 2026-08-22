import { deriveRunCommandKey } from "../types/workflow.js";

/**
 * Outbox commands and bounded claim/lease processing - Phase 7B.
 *
 * Phase 7A proved the two N5 gates; this module is the claim-capable half and
 * is kept in a separate file so the Phase 7A negative tests keep meaning what
 * they say.
 *
 * The durable resume contract: a run waiting on a receipt schedules exactly one
 * deterministic next command. Due-time polling alone can resume it, so no
 * browser, SSE connection or in-memory timer owns progress. Exhausting the
 * owner-approved attempt or wait budget produces a visible dead letter rather
 * than another wake-up.
 */

export type OutboxStatus = "claimable" | "leased" | "completed" | "dead_letter";

export interface OutboxCommand {
  commandId: string;
  idempotencyKey: string;
  runId: string;
  commandType: string;
  status: OutboxStatus;
  availableAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attempt: number;
  wakeReason?: string;
  deadLetterReason?: string;
}

export interface ScheduleResumeInput {
  runId: string;
  availableAt: string;
  wakeReason?: string;
}

export interface ClaimOptions {
  owner: string;
  now: Date;
  leaseSeconds: number;
  limit?: number;
}

export interface OutboxStore {
  schedule(input: ScheduleResumeInput): OutboxCommand;
  claimDue(options: ClaimOptions): OutboxCommand[];
  complete(commandId: string): void;
  reschedule(input: { commandId: string; availableAt: string; maxAttempts: number }): OutboxCommand;
  list(): OutboxCommand[];
}

export function createInMemoryOutbox(): OutboxStore {
  const commands = new Map<string, OutboxCommand>();
  const byIdempotencyKey = new Map<string, string>();

  return {
    schedule(input) {
      // One logical command per run. A verified receipt signal may make the
      // existing command immediately claimable but cannot create a second one.
      const idempotencyKey = deriveRunCommandKey(input.runId);
      const existingId = byIdempotencyKey.get(idempotencyKey);

      if (existingId !== undefined) {
        const existing = commands.get(existingId) as OutboxCommand;
        if (input.wakeReason === "verified_receipt_signal" && existing.status === "claimable") {
          const advanced: OutboxCommand = {
            ...existing,
            availableAt: input.availableAt,
            wakeReason: input.wakeReason
          };
          commands.set(existingId, advanced);
          return advanced;
        }
        return existing;
      }

      const command: OutboxCommand = {
        commandId: `CMD-${idempotencyKey.slice(0, 16)}`,
        idempotencyKey,
        runId: input.runId,
        commandType: "resume_cash_application",
        status: "claimable",
        availableAt: input.availableAt,
        attempt: 0,
        ...(input.wakeReason === undefined ? {} : { wakeReason: input.wakeReason })
      };

      commands.set(command.commandId, command);
      byIdempotencyKey.set(idempotencyKey, command.commandId);
      return command;
    },

    claimDue(options) {
      const { owner, now, leaseSeconds, limit = 10 } = options;
      const claimed: OutboxCommand[] = [];

      for (const command of commands.values()) {
        if (claimed.length >= limit) break;

        const due = new Date(command.availableAt).getTime() <= now.getTime();
        const leaseExpired =
          command.status === "leased" &&
          command.leaseExpiresAt !== undefined &&
          new Date(command.leaseExpiresAt).getTime() <= now.getTime();

        // A crashed worker's lease expires and the command becomes claimable
        // again, which is what lets a restart resume without a duplicate.
        if (!due || (command.status !== "claimable" && !leaseExpired)) continue;

        const leased: OutboxCommand = {
          ...command,
          status: "leased",
          leaseOwner: owner,
          leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
          attempt: command.attempt + 1
        };

        commands.set(command.commandId, leased);
        claimed.push(leased);
      }

      return claimed;
    },

    complete(commandId) {
      const command = commands.get(commandId);
      if (command === undefined) return;
      commands.set(commandId, { ...command, status: "completed" });
    },

    reschedule(input) {
      const command = commands.get(input.commandId);
      if (command === undefined) {
        throw new Error(`unknown command ${input.commandId}`);
      }

      // Exhaustion becomes a visible dead letter, never another wake-up.
      if (command.attempt >= input.maxAttempts) {
        const dead: OutboxCommand = {
          ...command,
          status: "dead_letter",
          deadLetterReason: "max_attempts_exhausted"
        };
        commands.set(command.commandId, dead);
        return dead;
      }

      const next: OutboxCommand = {
        ...command,
        status: "claimable",
        availableAt: input.availableAt
      };
      commands.set(command.commandId, next);
      return next;
    },

    list() {
      return [...commands.values()];
    }
  };
}
