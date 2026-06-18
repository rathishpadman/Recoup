export const runtimeModels = {
  reasoning: "gpt-5.5",
  fast: "gpt-5.4",
  fastMini: "gpt-5.4-mini",
  realtime: "gpt-realtime-2"
} as const;

export type RuntimeModelKey = keyof typeof runtimeModels;
