import type { GraphModel } from './types';

export interface GraphDiff {
  addedNodeIds: Set<string>;
  removedNodeIds: Set<string>;
  addedEdgeIds: Set<string>;
  removedEdgeIds: Set<string>;
}

export function diffGraph(prev: GraphModel | null, next: GraphModel): GraphDiff {
  const prevNodeIds = new Set((prev?.nodes ?? []).map((n) => n.id));
  const nextNodeIds = new Set(next.nodes.map((n) => n.id));
  const prevEdgeIds = new Set((prev?.edges ?? []).map((e) => e.id));
  const nextEdgeIds = new Set(next.edges.map((e) => e.id));

  const addedNodeIds = new Set<string>();
  const removedNodeIds = new Set<string>();
  const addedEdgeIds = new Set<string>();
  const removedEdgeIds = new Set<string>();

  for (const id of nextNodeIds) if (!prevNodeIds.has(id)) addedNodeIds.add(id);
  for (const id of prevNodeIds) if (!nextNodeIds.has(id)) removedNodeIds.add(id);
  for (const id of nextEdgeIds) if (!prevEdgeIds.has(id)) addedEdgeIds.add(id);
  for (const id of prevEdgeIds) if (!nextEdgeIds.has(id)) removedEdgeIds.add(id);

  return { addedNodeIds, removedNodeIds, addedEdgeIds, removedEdgeIds };
}
