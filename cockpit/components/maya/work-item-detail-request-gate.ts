export interface WorkItemDetailRequestGate {
  current: number;
}

export function beginWorkItemDetailRequest(gate: WorkItemDetailRequestGate): number {
  gate.current += 1;
  return gate.current;
}

export function cancelWorkItemDetailRequest(gate: WorkItemDetailRequestGate): number {
  gate.current += 1;
  return gate.current;
}

export function isCurrentWorkItemDetailRequest(gate: WorkItemDetailRequestGate, requestId: number): boolean {
  return gate.current === requestId;
}
