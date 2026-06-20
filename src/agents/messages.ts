import { z } from "zod";
import { recoupHandoffGraph } from "./handoffGraph.js";

export const AgentHandoffPacketSchema = z.object({
  packetId: z.string().min(1),
  fromAgent: z.string().min(1),
  toAgent: z.string().min(1),
  capability: z.enum(["A", "B", "C", "D", "all"]),
  caseId: z.string().min(1),
  recordIds: z.array(z.string().min(1)).min(1),
  deterministicBasis: z.string().min(1),
  intent: z.string().min(1),
  status: z.enum(["created", "accepted", "completed", "blocked"])
});

export type AgentHandoffPacket = z.infer<typeof AgentHandoffPacketSchema>;

export function createAgentHandoffPacket(input: AgentHandoffPacket): AgentHandoffPacket {
  const packet = AgentHandoffPacketSchema.parse(input);
  const edgeAllowed = recoupHandoffGraph.some((edge) => edge.from === packet.fromAgent && edge.to === packet.toAgent);
  if (!edgeAllowed) {
    throw new Error("Agent handoff edge is not declared.");
  }

  return packet;
}
