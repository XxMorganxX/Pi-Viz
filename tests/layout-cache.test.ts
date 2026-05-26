import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyCachedLayout, layoutTopologyKey } from '../src/lib/layout-cache.js';
import type { GraphModel, GraphNode, TraceFeedNodeData } from '../src/lib/types.js';

function graphNode(id: string, parentId?: string): GraphNode {
  return {
    id,
    type: id.startsWith('mission') ? 'mission' : id.startsWith('feed') ? 'traceFeed' : 'orchestrator',
    category: id.startsWith('mission')
      ? 'missionGroup'
      : id.startsWith('feed')
        ? 'traceDisplay'
        : 'agentExecution',
    parentId,
    position: { x: 0, y: 0 },
    data: { kind: 'traceFeed', title: id, agentLabel: id, ownerKind: 'orchestrator', entries: [] },
  } as GraphNode;
}

function model(): GraphModel {
  return {
    nodes: [
      graphNode('mission:alpha'),
      graphNode('orchestrator:alpha', 'mission:alpha'),
      graphNode('feed:alpha', 'orchestrator:alpha'),
    ],
    edges: [
      {
        id: 'e:mission:alpha->orchestrator:alpha',
        source: 'mission:alpha',
        target: 'orchestrator:alpha',
        kind: 'containment',
      },
      {
        id: 'e:orchestrator:alpha->feed:alpha',
        source: 'orchestrator:alpha',
        target: 'feed:alpha',
        kind: 'trace',
      },
    ],
  };
}

test('layout topology keys ignore data-only graph changes', () => {
  const first = model();
  const second: GraphModel = {
    nodes: first.nodes.map((node) =>
      node.id === 'feed:alpha'
        ? {
            ...node,
            data: {
              kind: 'traceFeed',
              title: 'Updated feed',
              agentLabel: 'orchestrator',
              ownerKind: 'orchestrator',
              entries: [{ id: 'entry-1', type: 'thinking', label: 'thinking', timestamp: 'now' }],
            },
          }
        : node
    ),
    edges: first.edges.map((edge) => ({ ...edge })),
  };

  assert.equal(layoutTopologyKey(second), layoutTopologyKey(first));
});

test('cached layout preserves positions while accepting fresh node data', () => {
  const previous: GraphModel = {
    nodes: model().nodes.map((node, index) => ({
      ...node,
      position: { x: index * 100, y: index * 50 },
      width: 320 + index,
      height: 160 + index,
      style: { width: 320 + index, height: 160 + index },
    })),
    edges: model().edges,
  };
  const next = model();
  const freshFeed: TraceFeedNodeData = {
    kind: 'traceFeed',
    title: 'Fresh feed',
    agentLabel: 'orchestrator',
    ownerKind: 'orchestrator',
    entries: [{ id: 'entry-2', type: 'tool', label: 'Read', timestamp: 'now' }],
  };
  next.nodes = next.nodes.map((node) => (node.id === 'feed:alpha' ? { ...node, data: freshFeed } : node));

  const reused = applyCachedLayout(next, previous);
  const reusedFeed = reused.nodes.find((node) => node.id === 'feed:alpha');

  assert.deepEqual(reusedFeed?.position, { x: 200, y: 100 });
  assert.equal(reusedFeed?.width, 322);
  assert.equal(reusedFeed?.height, 162);
  assert.deepEqual(reusedFeed?.data, freshFeed);
});
