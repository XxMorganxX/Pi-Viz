import type { CSSProperties } from 'react';
import type { Node } from '@xyflow/react';
import type { GraphEdge, GraphNode } from './types';

const RESPONSE_FRAME_PAD_X = 70;
const RESPONSE_FRAME_PAD_TOP = 190;
const RESPONSE_FRAME_PAD_BOTTOM = 150;
const RESPONSE_FRAME_MIN_W = 1180;
const RESPONSE_FRAME_MIN_H = 1120;
const RESPONSE_FRAME_STACK_GAP_Y = 180;

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

export function preventResponseFrameOverlapDuringDrag(
  changedNodes: Node[],
  previousNodes: Node[],
  graphNodes: GraphNode[]
): Node[] {
  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]));
  const movedFrameIds = new Set<string>();

  for (const node of changedNodes) {
    const previousNode = previousNodeById.get(node.id);
    if (!previousNode || samePosition(node.position, previousNode.position)) continue;

    const graphNode = graphNodeById.get(node.id);
    if (graphNode?.category === 'responseFrame') {
      movedFrameIds.add(graphNode.id);
    } else if (graphNode?.containerId) {
      movedFrameIds.add(graphNode.containerId);
    }
  }

  if (movedFrameIds.size === 0) return changedNodes;

  const previousRects = responseFrameRects(previousNodes, graphNodes);
  const changedRects = responseFrameRects(changedNodes, graphNodes);
  const blockedFrameIds = new Set<string>();

  for (const frameId of movedFrameIds) {
    const movedRect = changedRects.get(frameId);
    if (!movedRect) continue;

    for (const [otherFrameId, otherRect] of previousRects) {
      if (otherFrameId === frameId) continue;
      if (!rectsOverlapWithGap(movedRect, otherRect, RESPONSE_FRAME_STACK_GAP_Y)) continue;
      blockedFrameIds.add(frameId);
      break;
    }
  }

  if (blockedFrameIds.size === 0) return changedNodes;

  return changedNodes.map((node) => {
    const graphNode = graphNodeById.get(node.id);
    const frameId = graphNode?.category === 'responseFrame' ? graphNode.id : graphNode?.containerId;
    if (!frameId || !blockedFrameIds.has(frameId)) return node;
    return previousNodeById.get(node.id) ?? node;
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

  const syncedNodes = flowNodes.map((node) => {
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

  return stackSyncedResponseFrames(syncedNodes, graphNodes);
}

function stackSyncedResponseFrames(flowNodes: Node[], graphNodes: GraphNode[]): Node[] {
  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
  const frames = graphNodes
    .filter((node) => node.category === 'responseFrame')
    .map((node) => flowNodeById.get(node.id))
    .filter((node): node is Node => node !== undefined)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id));
  if (frames.length < 2) return flowNodes;

  const shiftsByFrameId = new Map<string, number>();
  let previousBottom = Number.NEGATIVE_INFINITY;

  for (const frame of frames) {
    const frameHeight = numericDimension(frame.height, graphNodeById.get(frame.id)?.height);
    const minY = previousBottom + RESPONSE_FRAME_STACK_GAP_Y;
    const shiftY = frame.position.y < minY ? minY - frame.position.y : 0;
    const shiftedY = frame.position.y + shiftY;
    if (shiftY > 0) shiftsByFrameId.set(frame.id, shiftY);
    previousBottom = shiftedY + frameHeight;
  }

  if (shiftsByFrameId.size === 0) return flowNodes;

  return flowNodes.map((node) => {
    const graphNode = graphNodeById.get(node.id);
    const shiftY = shiftsByFrameId.get(node.id) ?? (graphNode?.containerId ? shiftsByFrameId.get(graphNode.containerId) : 0);
    if (!shiftY) return node;

    return {
      ...node,
      position: {
        x: node.position.x,
        y: node.position.y + shiftY,
      },
    };
  });
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function responseFrameRects(flowNodes: Node[], graphNodes: GraphNode[]): Map<string, Rect> {
  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
  const containedIdsByFrameId = new Map<string, string[]>();

  for (const graphNode of graphNodes) {
    if (!graphNode.containerId) continue;
    const ids = containedIdsByFrameId.get(graphNode.containerId) ?? [];
    ids.push(graphNode.id);
    containedIdsByFrameId.set(graphNode.containerId, ids);
  }

  const rects = new Map<string, Rect>();
  for (const graphNode of graphNodes) {
    if (graphNode.category !== 'responseFrame') continue;
    const frameNode = flowNodeById.get(graphNode.id);
    if (!frameNode) continue;

    const containedNodes = (containedIdsByFrameId.get(graphNode.id) ?? [])
      .map((id) => flowNodeById.get(id))
      .filter((candidate): candidate is Node => candidate !== undefined);

    if (containedNodes.length === 0) {
      rects.set(graphNode.id, {
        x: frameNode.position.x,
        y: frameNode.position.y,
        width: numericDimension(frameNode.width, graphNode.width),
        height: numericDimension(frameNode.height, graphNode.height),
      });
      continue;
    }

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

    rects.set(graphNode.id, {
      x: minX - RESPONSE_FRAME_PAD_X,
      y: minY - RESPONSE_FRAME_PAD_TOP,
      width: Math.max(RESPONSE_FRAME_MIN_W, maxX - minX + RESPONSE_FRAME_PAD_X * 2),
      height: Math.max(RESPONSE_FRAME_MIN_H, maxY - minY + RESPONSE_FRAME_PAD_TOP + RESPONSE_FRAME_PAD_BOTTOM),
    });
  }

  return rects;
}

function rectsOverlapWithGap(a: Rect, b: Rect, gapY: number): boolean {
  const xOverlaps = a.x < b.x + b.width && b.x < a.x + a.width;
  const yOverlaps = a.y < b.y + b.height + gapY && b.y < a.y + a.height + gapY;
  return xOverlaps && yOverlaps;
}

function samePosition(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function numericDimension(value: unknown, fallback?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0;
}
