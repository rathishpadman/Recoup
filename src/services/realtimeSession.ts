import { runtimeModels } from "../../config/models.js";
import type { RuntimeEnv } from "../../config/env.js";

const realtimeClientSecretUrl = "https://api.openai.com/v1/realtime/client_secrets";

export interface RealtimeAuditPolicy {
  allowedTools: ["audit.read", "query.answer"];
  externalActions: "none";
  forbiddenPersistence: ["raw_audio", "uncited_transcript", "uncited_model_output"];
  queryScope: string;
  retention: string;
  recordIds: string[];
}

export interface RealtimeSessionPolicy {
  auditPolicy: RealtimeAuditPolicy;
  deterministicBasis: string;
  endpoint: typeof realtimeClientSecretUrl;
  model: typeof runtimeModels.realtime;
  status: "blocked_missing_credentials" | "ready_for_client_secret_request";
  transport: "webrtc";
}

export interface RealtimeClientSecretBlocked extends RealtimeSessionPolicy {
  status: "blocked_missing_credentials";
}

export interface RealtimeClientSecretIssued {
  auditPolicy: RealtimeAuditPolicy;
  clientSecret: unknown;
  deterministicBasis: string;
  model: typeof runtimeModels.realtime;
  status: "issued";
  transport: "webrtc";
}

export type RealtimeClientSecretResult = RealtimeClientSecretBlocked | RealtimeClientSecretIssued;

export interface RealtimeClientSecretRequest {
  env?: RuntimeEnv;
  fetcher?: typeof fetch;
  question?: string;
  safetyIdentifier?: string;
}

const defaultRealtimeSafetyIdentifier = "human:cockpit-query";
const realtimeSessionInstructions =
  "You are Recoup's audit-scoped Realtime query assistant. Answer only from deterministic Recoup services, cite deterministic Recoup recordIds, and include the deterministic basis. Allowed tools: audit.read and query.answer. External actions are forbidden. Do not compute or alter dollar amounts. Do not persist raw audio, uncited transcripts, or uncited model output.";

export function buildRealtimeSessionPolicy(env: RuntimeEnv = process.env): RealtimeSessionPolicy {
  return {
    auditPolicy: {
      allowedTools: ["audit.read", "query.answer"],
      externalActions: "none",
      forbiddenPersistence: ["raw_audio", "uncited_transcript", "uncited_model_output"],
      queryScope: "Cited Recoup audit, memory, trace, connector-readiness, and cockpit read models only.",
      recordIds: ["OPENAI-REALTIME-POLICY"],
      retention: "Audit hashes and cited record ids only; no raw audio or uncited transcript is persisted by Recoup."
    },
    deterministicBasis:
      "runtime credential gate + pinned realtime model + no-external-action query policy; answers must cite deterministic Recoup records.",
    endpoint: realtimeClientSecretUrl,
    model: runtimeModels.realtime,
    status: hasOpenAiApiKey(env) ? "ready_for_client_secret_request" : "blocked_missing_credentials",
    transport: "webrtc"
  };
}

export async function requestRealtimeClientSecret({
  env = process.env,
  fetcher = fetch,
  safetyIdentifier = defaultRealtimeSafetyIdentifier
}: RealtimeClientSecretRequest): Promise<RealtimeClientSecretResult> {
  const policy = buildRealtimeSessionPolicy(env);
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (policy.status === "blocked_missing_credentials" || apiKey === undefined || apiKey.length === 0) {
    return {
      ...policy,
      status: "blocked_missing_credentials"
    };
  }

  const response = await fetcher(realtimeClientSecretUrl, {
    body: JSON.stringify({
      session: {
        instructions: realtimeSessionInstructions,
        model: runtimeModels.realtime,
        type: "realtime"
      }
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Realtime client secret request failed with status ${String(response.status)}.`);
  }

  return {
    auditPolicy: policy.auditPolicy,
    clientSecret: await response.json(),
    deterministicBasis: policy.deterministicBasis,
    model: policy.model,
    status: "issued",
    transport: policy.transport
  };
}

function hasOpenAiApiKey(env: RuntimeEnv): boolean {
  return env.OPENAI_API_KEY !== undefined && env.OPENAI_API_KEY.trim().length > 0;
}
