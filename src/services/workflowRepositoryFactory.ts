import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import { createInMemoryWorkflowRepository } from "./workflowRepository.js";
import { createSupabaseWorkflowRepository } from "./supabaseWorkflowRepository.js";
import type { WorkflowRepository } from "./workflowRepository.js";

/**
 * Chooses where workflow state is persisted.
 *
 * Supabase is used when both coordinates are configured. Otherwise the
 * in-memory implementation is returned, and the caller is told which one it
 * got: a run that silently lost its history on restart because a variable was
 * missing would be the worst possible failure here, so `durable` is reported
 * rather than inferred.
 *
 * The rollout stage is deliberately not consulted. Where state is written is a
 * deployment concern; whether the feature is exposed is a separate decision
 * owned by the kill switches.
 */

export type WorkflowRepositoryKind = "supabase" | "in_memory";

export interface ResolvedWorkflowRepository {
  repository: WorkflowRepository;
  kind: WorkflowRepositoryKind;
  /** False for in-memory: state does not survive a process restart. */
  durable: boolean;
  /** Present when Supabase was expected but could not be selected. */
  reason?: string;
}

function isConfigured(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

export function resolveWorkflowRepository(env: RuntimeEnv): ResolvedWorkflowRepository {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (isConfigured(url) && isConfigured(serviceRoleKey)) {
    return {
      repository: createSupabaseWorkflowRepository({ url, serviceRoleKey }),
      kind: "supabase",
      durable: true
    };
  }

  const missing = [
    isConfigured(url) ? undefined : "SUPABASE_URL",
    isConfigured(serviceRoleKey) ? undefined : "SUPABASE_SERVICE_ROLE_KEY"
  ].filter((name): name is string => name !== undefined);

  return {
    repository: createInMemoryWorkflowRepository(),
    kind: "in_memory",
    durable: false,
    reason: `not durable: ${missing.join(" and ")} not configured`
  };
}
