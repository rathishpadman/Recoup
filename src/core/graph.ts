import { Decimal } from "decimal.js";

export interface CorroborationGraphInput {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string; weight: string }>;
  iterations: number;
}

export interface CorroborationScore {
  nodeId: string;
  score: Decimal;
}

export function scoreCorroborationGraph(input: CorroborationGraphInput): CorroborationScore[] {
  validateInput(input);

  const nodeIds = input.nodes.map((node) => node.id);
  const adjacency = buildUndirectedAdjacency(nodeIds, input.edges);
  let scores = new Map(nodeIds.map((nodeId) => [nodeId, new Decimal(1).div(nodeIds.length)]));

  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    const nextScores = new Map(nodeIds.map((nodeId) => [nodeId, new Decimal(0)]));

    for (const nodeId of nodeIds) {
      const neighbors = adjacency.get(nodeId) ?? [];
      const totalWeight = neighbors.reduce((sum, edge) => sum.plus(edge.weight), new Decimal(0));

      if (totalWeight.isZero()) {
        continue;
      }

      const currentScore = scores.get(nodeId) ?? new Decimal(0);
      for (const edge of neighbors) {
        nextScores.set(edge.to, (nextScores.get(edge.to) ?? new Decimal(0)).plus(currentScore.times(edge.weight).div(totalWeight)));
      }
    }

    const totalScore = Array.from(nextScores.values()).reduce((sum, score) => sum.plus(score), new Decimal(0));
    scores = totalScore.isZero()
      ? nextScores
      : new Map(nodeIds.map((nodeId) => [nodeId, (nextScores.get(nodeId) ?? new Decimal(0)).div(totalScore)]));
  }

  return nodeIds
    .map((nodeId) => ({
      nodeId,
      score: scores.get(nodeId) ?? new Decimal(0)
    }))
    .sort((left, right) => {
      const scoreOrder = right.score.comparedTo(left.score);
      return scoreOrder === 0 ? left.nodeId.localeCompare(right.nodeId) : scoreOrder;
    });
}

function validateInput(input: CorroborationGraphInput): void {
  if (input.nodes.length === 0) {
    throw new Error("Corroboration graph requires at least one node.");
  }

  if (!Number.isInteger(input.iterations) || input.iterations < 1) {
    throw new Error("Corroboration graph iterations must be at least 1.");
  }

  const nodeIds = new Set(input.nodes.map((node) => node.id));
  for (const edge of input.edges) {
    const weight = new Decimal(edge.weight);

    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error("Corroboration graph edge references an unknown node.");
    }

    if (weight.isNegative()) {
      throw new Error("Corroboration graph edge weights cannot be negative.");
    }

    if (weight.isZero()) {
      throw new Error("Corroboration graph edge weights must be greater than 0.");
    }
  }
}

function buildUndirectedAdjacency(
  nodeIds: string[],
  edges: Array<{ from: string; to: string; weight: string }>
): Map<string, Array<{ to: string; weight: Decimal }>> {
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, [] as Array<{ to: string; weight: Decimal }>]));

  for (const edge of edges) {
    const weight = new Decimal(edge.weight);
    adjacency.get(edge.from)?.push({ to: edge.to, weight });
    adjacency.get(edge.to)?.push({ to: edge.from, weight });
  }

  return adjacency;
}
