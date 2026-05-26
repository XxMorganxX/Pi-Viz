import type { GraphModel } from './types';

export function layoutTopologyKey(model: GraphModel): string {
  const nodes = model.nodes
    .map((node) =>
      [node.id, node.type, node.category, node.parentId ?? '', node.containerId ?? ''].join('|')
    )
    .sort();
  const edges = model.edges
    .map((edge) => [edge.id, edge.source, edge.target, edge.kind].join('|'))
    .sort();

  return JSON.stringify({ nodes, edges });
}

export function applyCachedLayout(next: GraphModel, cached: GraphModel): GraphModel {
  const cachedNodes = new Map(cached.nodes.map((node) => [node.id, node]));

  return {
    nodes: next.nodes.map((node) => {
      const cachedNode = cachedNodes.get(node.id);
      if (!cachedNode) return node;

      return {
        ...node,
        position: cachedNode.position,
        width: cachedNode.width,
        height: cachedNode.height,
        style: cachedNode.style,
      };
    }),
    edges: next.edges.map((edge) => ({ ...edge })),
  };
}
