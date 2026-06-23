import { runtimeModels } from "../../config/models.js";
import type { RuntimeEnv } from "../../config/env.js";
import { z } from "zod";
import { invokeServiceTool, serviceToolMetadata } from "./serviceLayer.js";

const realtimeClientSecretUrl = "https://api.openai.com/v1/realtime/client_secrets";
const RealtimeClientSecretResponseSchema = z
  .object({
    value: z.string().startsWith("ek_")
  })
  .passthrough();

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
  clientSecret: z.infer<typeof RealtimeClientSecretResponseSchema>;
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

type RealtimeAllowedToolName = RealtimeAuditPolicy["allowedTools"][number];

export interface RealtimeToolManifestItem {
  description: string;
  name: RealtimeAllowedToolName;
  parameters: {
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
    type: "object";
  };
  type: "function";
}

export interface RealtimeToolCallInput {
  argumentsJson: string;
  name: string;
}

type RealtimeServiceToolInvoker = (name: string, input: unknown) => unknown;

export type RealtimeToolCallResult =
  | {
      deterministicBasis: string;
      output: unknown;
      recordIds: string[];
      status: "ok";
      toolName: RealtimeAllowedToolName;
    }
  | {
      deterministicBasis: string;
      recordIds: ["OPENAI-REALTIME-POLICY"];
      status: "blocked_tool";
      toolName: string;
    };

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

export function buildRealtimeToolManifest(): RealtimeToolManifestItem[] {
  return [
    {
      description: "Read the governed Risk Mesh audit trail. Input must be a configured case id.",
      name: "audit.read",
      parameters: {
        additionalProperties: false,
        properties: {
          caseId: { minLength: 1, type: "string" }
        },
        required: ["caseId"],
        type: "object"
      },
      type: "function"
    },
    {
      description: "Answer a Recoup query through the offline deterministic query guard.",
      name: "query.answer",
      parameters: {
        additionalProperties: false,
        properties: {
          question: { maxLength: 500, minLength: 1, type: "string" }
        },
        required: ["question"],
        type: "object"
      },
      type: "function"
    }
  ];
}

export function handleRealtimeToolCall(
  input: RealtimeToolCallInput,
  serviceToolInvoker: RealtimeServiceToolInvoker = invokeServiceTool
): RealtimeToolCallResult {
  if (!isRealtimeAllowedToolName(input.name)) {
    return blockedRealtimeToolCall(input.name);
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(input.argumentsJson) as unknown;
  } catch {
    return blockedRealtimeToolCall(input.name);
  }

  const output = serviceToolInvoker(input.name, parsedArgs);
  const recordIds = readRecordIds(output);
  if (input.name === "query.answer" && !hasValidCitationParity(output)) {
    return blockedRealtimeToolCall(input.name, "Realtime query.answer blocked: citation parity must match text, voice, and output recordIds.");
  }

  return {
    deterministicBasis: "Realtime tool allowlist + service-layer Zod validation.",
    output,
    recordIds: recordIds.length > 0 ? recordIds : ["OPENAI-REALTIME-POLICY"],
    status: "ok",
    toolName: input.name
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
        tools: buildRealtimeToolManifest(),
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

  const clientSecret = RealtimeClientSecretResponseSchema.parse(await response.json());

  return {
    auditPolicy: policy.auditPolicy,
    clientSecret,
    deterministicBasis: policy.deterministicBasis,
    model: policy.model,
    status: "issued",
    transport: policy.transport
  };
}

function hasOpenAiApiKey(env: RuntimeEnv): boolean {
  return env.OPENAI_API_KEY !== undefined && env.OPENAI_API_KEY.trim().length > 0;
}

function blockedRealtimeToolCall(
  toolName: string,
  deterministicBasis = "Realtime tool allowlist blocks non-read-only, malformed, or action-producing tool calls."
): RealtimeToolCallResult {
  return {
    deterministicBasis,
    recordIds: ["OPENAI-REALTIME-POLICY"],
    status: "blocked_tool",
    toolName
  };
}

function isRealtimeAllowedToolName(name: string): name is RealtimeAllowedToolName {
  return (
    (name === "audit.read" || name === "query.answer") &&
    serviceToolMetadata[name].riskClass === "read_only" &&
    serviceToolMetadata[name].sideEffectClass === "none"
  );
}

function readRecordIds(output: unknown): string[] {
  return Array.from(new Set(collectRecordIds(output)));
}

function hasValidCitationParity(output: unknown): boolean {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return false;
  }

  const record = output as Record<string, unknown>;
  const recordIds = readStrictStringArray(record["recordIds"]);
  if (recordIds === undefined || recordIds.length === 0) {
    return false;
  }

  const citationParity = record["citationParity"];
  if (typeof citationParity !== "object" || citationParity === null || Array.isArray(citationParity)) {
    return false;
  }

  const parity = citationParity as Record<string, unknown>;
  return (
    parity["parity"] === "same_record_ids" &&
    sameStringArray(readStrictStringArray(parity["textRecordIds"]), recordIds) &&
    sameStringArray(readStrictStringArray(parity["voiceRecordIds"]), recordIds)
  );
}

function readStrictStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)
    ? value
    : undefined;
}

function sameStringArray(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (left === undefined) {
    return false;
  }

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function collectRecordIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecordIds(item));
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const directRecordIds = Array.isArray(record["recordIds"])
    ? record["recordIds"].filter((recordId): recordId is string => typeof recordId === "string" && recordId.length > 0)
    : [];

  return [...directRecordIds, ...Object.values(record).flatMap((item) => collectRecordIds(item))];
}
