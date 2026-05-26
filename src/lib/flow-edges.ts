import { MarkerType, type Edge } from '@xyflow/react';
import type { GraphEdge, GraphNode } from './types';

const EDGE_COLOR = '#7cc4ff';
const TRACE_EDGE_COLOR = '#9bd0ff';

export function graphEdgesToFlowEdges(graphEdges: GraphEdge[], graphNodes: GraphNode[] = []): Edge[] {
  const sourceIndexes = sourceHandleIndexes(graphEdges, graphNodes);
  return graphEdges.map((e) => {
    const color = e.accentColor ?? (e.kind === 'trace' ? TRACE_EDGE_COLOR : EDGE_COLOR);
    return {
      id: e.id,
      source: e.source,
      sourceHandle: sourceHandleId(sourceIndexes.get(e.id) ?? 0),
      target: e.target,
      type: 'smoothstep',
      animated: e.kind === 'spawn',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: edgeWidthForWeight(e.weight),
        strokeDasharray: e.kind === 'trace' ? '4 4' : undefined,
      },
    };
  });
}

export function sourceHandleId(index: number): string {
  return `source-${index}`;
}

function sourceHandleIndexes(graphEdges: GraphEdge[], graphNodes: GraphNode[]): Map<string, number> {
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const edgesBySource = new Map<string, Array<{ edge: GraphEdge; originalIndex: number }>>();
  const indexesByEdgeId = new Map<string, number>();

  graphEdges.forEach((edge, originalIndex) => {
    const siblings = edgesBySource.get(edge.source) ?? [];
    siblings.push({ edge, originalIndex });
    edgesBySource.set(edge.source, siblings);
  });

  for (const siblings of edgesBySource.values()) {
    siblings
      .slice()
      .sort((a, b) => compareByTargetPosition(a, b, nodeById))
      .forEach(({ edge }, index) => indexesByEdgeId.set(edge.id, index));
  }

  return indexesByEdgeId;
}

function compareByTargetPosition(
  a: { edge: GraphEdge; originalIndex: number },
  b: { edge: GraphEdge; originalIndex: number },
  nodeById: Map<string, GraphNode>
): number {
  const aCenter = nodeCenterX(nodeById.get(a.edge.target));
  const bCenter = nodeCenterX(nodeById.get(b.edge.target));
  if (aCenter !== undefined && bCenter !== undefined && aCenter !== bCenter) return aCenter - bCenter;
  return a.originalIndex - b.originalIndex;
}

function nodeCenterX(node: GraphNode | undefined): number | undefined {
  if (!node) return undefined;
  return node.position.x + (node.width ?? 0) / 2;
}

function edgeWidthForWeight(weight: number | undefined): number {
  if (!weight) return 2.5;
  if (weight > 500_000) return 4.5;
  if (weight > 100_000) return 3.75;
  if (weight > 10_000) return 3;
  return 2.5;
}
