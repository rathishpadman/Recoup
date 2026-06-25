import {
  Agent,
  createMCPToolStaticFilter,
  getGlobalTraceProvider,
  MCPServerStreamableHttp,
  OpenAIProvider,
  Runner,
  setTraceProcessors,
  withTrace,
  type MCPServer,
  type ModelSettings,
  type RunStreamEvent
} from "@openai/agents";

setTraceProcessors([]);

export {
  Agent,
  createMCPToolStaticFilter,
  getGlobalTraceProvider,
  MCPServerStreamableHttp,
  OpenAIProvider,
  Runner,
  withTrace
};
export type MCPServerStreamableHttpOptions = ConstructorParameters<typeof MCPServerStreamableHttp>[0];
export type { MCPServer, ModelSettings, RunStreamEvent };
