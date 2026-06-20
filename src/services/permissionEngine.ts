export interface ToolPermissionMetadata {
  riskClass: string;
  sideEffectClass: string;
  visibility: "internal" | "mcp";
}

export interface ToolPermissionContext {
  actorCapabilities?: string[];
  actorId?: string;
}

export interface PermissionDecision {
  decision: "allow" | "approval_required" | "deny";
  reason?: string;
  riskClass: string;
}

export function evaluateToolPermission(metadata: ToolPermissionMetadata, context: ToolPermissionContext = {}): PermissionDecision {
  if (
    metadata.sideEffectClass === "draft_only" &&
    context.actorCapabilities !== undefined &&
    !context.actorCapabilities.includes("draft_action")
  ) {
    return {
      decision: "deny",
      reason: "Actor is not permitted to create draft-only action artifacts.",
      riskClass: metadata.riskClass
    };
  }

  if (metadata.sideEffectClass === "draft_only" || metadata.riskClass === "approval_gate" || metadata.riskClass === "financial") {
    return {
      decision: "approval_required",
      riskClass: metadata.riskClass
    };
  }

  return {
    decision: "allow",
    riskClass: metadata.riskClass
  };
}
