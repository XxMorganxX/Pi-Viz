import type { CSSProperties } from 'react';
import type { Node } from '@xyflow/react';
import type { GraphEdge, GraphNode } from './types';

const RESPONSE_FRAME_PAD_X = 70;
const RESPONSE_FRAME_PAD_TOP = 190;
const RESPONSE_FRAME_PAD_BOTTOM = 150;
const RESPONSE_FRAME_MIN_W = 1180;
const RESPONSE_FRAME_MIN_H = 1120;

export function graphNodesToFlowNodes(
  graphNodes: GraphNode[],
  selectedId: string | null,
  enteredIds: Set<string>,
  graphEdges: GraphEdge[] = []
): Node[] {
  const graphNodesById = new Map(graphNodes.map((n) => [n.id, n]));
  const outgoingCounts = outgoingEdgeCounts(graphEdges);

  return graphNodes.map((n) => {
    const isEntered = enteredIds.has(n.id);
    const isResponseFrame = n.category === 'responseFrame';
    const position = n.containerId || isResponseFrame ? n.position : absolutePosition(n, graphNodesById);
    const baseStyle: CSSProperties = {
      ...(n.width !== undefined ? { width: n.width } : {}),
      ...(n.height !== undefined ? { height: n.height } : {}),
      ...(n.style as CSSProperties),
    };

    return {
      id: n.id,
      type: n.type,
      position,
      data: {
        ...(n.data as unknown as Record<string, unknown>),
        __sourceHandleCount: outgoingCounts.get(n.id) ?? 1,
      },
      selected: n.id === selectedId,
      draggable: true,
      parentId: undefined,
      extent: undefined,
      className: [isResponseFrame ? 'response-frame-shell' : undefined, isEntered ? 'enter-pulse' : undefined]
        .filter(Boolean)
        .join(' ') || undefined,
      style: baseStyle,
      selectable: true,
      zIndex: n.category === 'responseFrame' ? 0 : 1,
    };
  });
}

function outgoingEdgeCounts(graphEdges: GraphEdge[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of graphEdges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
  }
  return counts;
}

function absolutePosition(node: GraphNode, graphNodesById: Map<string, GraphNode>): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;

  while (parentId) {
    const parent = graphNodesById.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }

  return { x, y };
}

export function mergeFlowNodePositions(nextNodes: Node[], currentNodes: Node[]): Node[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return nextNodes.map((node) => {
    const current = currentById.get(node.id);
    return current ? { ...node, position: current.position } : node;
  });
}

export function moveContainedNodesWithDraggedFrames(
  changedNodes: Node[],
  previousNodes: Node[],
  graphNodes: GraphNode[]
): Node[] {
  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]));
  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const deltasByFrameId = new Map<string, { x: number; y: number }>();

  for (const node of changedNodes) {
    const graphNode = graphNodeById.get(node.id);
    if (graphNode?.category !== 'responseFrame') continue;

    const previousNode = previousNodeById.get(node.id);
    if (!previousNode) continue;

    const delta = {
      x: node.position.x - previousNode.position.x,
      y: node.position.y - previousNode.position.y,
    };
    if (delta.x === 0 && delta.y === 0) continue;

    deltasByFrameId.set(node.id, delta);
  }

  if (deltasByFrameId.size === 0) return changedNodes;

  return changedNodes.map((node) => {
    const graphNode = graphNodeById.get(node.id);
    if (!graphNode?.containerId) return node;

    const delta = deltasByFrameId.get(graphNode.containerId);
    if (!delta) return node;

    return {
      ...node,
      position: {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y,
      },
    };
  });
}

export function syncResponseFrameBounds(flowNodes: Node[], graphNodes: GraphNode[]): Node[] {
  const flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const containedIdsByFrameId = new Map<string, string[]>();

  for (const graphNode of graphNodes) {
    if (!graphNode.containerId) continue;
    const ids = containedIdsByFrameId.get(graphNode.containerId) ?? [];
    ids.push(graphNode.id);
    containedIdsByFrameId.set(graphNode.containerId, ids);
  }

  return flowNodes.map((node) => {
    const graphNode = graphNodeById.get(node.id);
    if (graphNode?.category !== 'responseFrame') return node;

    const containedNodes = (containedIdsByFrameId.get(node.id) ?? [])
      .map((id) => flowNodeById.get(id))
      .filter((candidate): candidate is Node => candidate !== undefined);
    if (containedNodes.length === 0) return node;

    const minX = Math.min(...containedNodes.map((candidate) => candidate.position.x));
    const minY = Math.min(...containedNodes.map((candidate) => candidate.position.y));
    const maxX = Math.max(
      ...containedNodes.map((candidate) => {
        const candidateGraphNode = graphNodeById.get(candidate.id);
        return candidate.position.x + numericDimension(candidate.width, candidateGraphNode?.width);
      })
    );
    const maxY = Math.max(
      ...containedNodes.map((candidate) => {
        const candidateGraphNode = graphNodeById.get(candidate.id);
        return candidate.position.y + numericDimension(candidate.height, candidateGraphNode?.height);
      })
    );

    const width = Math.max(RESPONSE_FRAME_MIN_W, maxX - minX + RESPONSE_FRAME_PAD_X * 2);
    const height = Math.max(RESPONSE_FRAME_MIN_H, maxY - minY + RESPONSE_FRAME_PAD_TOP + RESPONSE_FRAME_PAD_BOTTOM);
    return {
      ...node,
      position: {
        x: minX - RESPONSE_FRAME_PAD_X,
        y: minY - RESPONSE_FRAME_PAD_TOP,
      },
      width,
      height,
      style: {
        ...node.style,
        width,
        height,
      },
    };
  });
}

function numericDimension(value: unknown, fallback?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0;
}
