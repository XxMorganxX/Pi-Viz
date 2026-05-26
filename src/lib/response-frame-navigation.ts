import type { GraphModel } from './types';

export type ResponseFrameDirection = 'next' | 'previous';

export function responseFrameIds(graph: GraphModel): string[] {
  return graph.nodes
    .filter((node) => node.type === 'responseFrame')
    .slice()
    .sort((a, b) => responseFrameIndex(a) - responseFrameIndex(b) || a.position.y - b.position.y || a.position.x - b.position.x)
    .map((node) => node.id);
}

function responseFrameIndex(node: GraphModel['nodes'][number]): number {
  return node.data.kind === 'responseFrame' ? node.data.turn.index : Number.POSITIVE_INFINITY;
}

export function adjacentResponseFrameId(
  ids: string[],
  currentId: string | null,
  direction: ResponseFrameDirection
): string | null {
  if (ids.length === 0) return null;
  if (!currentId) return direction === 'next' ? ids[0] : ids[ids.length - 1];

  const currentIndex = ids.indexOf(currentId);
  if (currentIndex === -1) return direction === 'next' ? ids[0] : ids[ids.length - 1];

  const offset = direction === 'next' ? 1 : -1;
  const nextIndex = Math.min(ids.length - 1, Math.max(0, currentIndex + offset));
  return ids[nextIndex];
}

export function defaultFocusedResponseFrameId(ids: string[], currentId: string | null): string | null {
  if (ids.length === 0) return null;
  if (currentId && ids.includes(currentId)) return currentId;
  return ids[ids.length - 1];
}
