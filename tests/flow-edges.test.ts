import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MarkerType } from '@xyflow/react';
import { graphEdgesToFlowEdges } from '../src/lib/flow-edges.js';
import type { GraphNode } from '../src/lib/types.js';

test('graph edges render as directed parent-to-child arrows', () => {
  const [edge] = graphEdgesToFlowEdges([
    { id: 'e:parent->child', source: 'parent', target: 'child', kind: 'containment' },
  ]);

  assert.deepEqual(edge.markerEnd, {
    type: MarkerType.ArrowClosed,
    color: '#7cc4ff',
  });
  assert.equal(edge.style?.stroke, '#7cc4ff');
  assert.equal(edge.style?.strokeWidth, 2.5);
});

test('trace edges render as quiet feed connectors', () => {
  const [edge] = graphEdgesToFlowEdges([
    { id: 'e:agent->feed', source: 'agent', target: 'feed', kind: 'trace' },
  ]);

  assert.equal(edge.animated, false);
  assert.equal(edge.style?.stroke, '#9bd0ff');
  assert.equal(edge.style?.strokeDasharray, '4 4');
  assert.deepEqual(edge.markerEnd, {
    type: MarkerType.ArrowClosed,
    color: '#9bd0ff',
  });
});

test('agent accent colors override generic spawn and trace edge colors', () => {
  const [spawn, trace] = graphEdgesToFlowEdges([
    {
      id: 'e:parent->sub',
      source: 'parent',
      target: 'sub',
      kind: 'spawn',
      accentColor: '#2dd4bf',
    },
    {
      id: 'e:sub->feed',
      source: 'sub',
      target: 'feed',
      kind: 'trace',
      accentColor: '#2dd4bf',
    },
  ]);

  assert.equal(spawn.style?.stroke, '#2dd4bf');
  assert.equal(trace.style?.stroke, '#2dd4bf');
  assert.deepEqual(spawn.markerEnd, {
    type: MarkerType.ArrowClosed,
    color: '#2dd4bf',
  });
  assert.deepEqual(trace.markerEnd, {
    type: MarkerType.ArrowClosed,
    color: '#2dd4bf',
  });
});

test('edges from the same source use different source handles', () => {
  const [first, second, third] = graphEdgesToFlowEdges([
    { id: 'e:parent->a', source: 'parent', target: 'a', kind: 'spawn' },
    { id: 'e:parent->b', source: 'parent', target: 'b', kind: 'spawn' },
    { id: 'e:other->c', source: 'other', target: 'c', kind: 'spawn' },
  ]);

  assert.equal(first.sourceHandle, 'source-0');
  assert.equal(second.sourceHandle, 'source-1');
  assert.equal(third.sourceHandle, 'source-0');
});

test('source handles follow child node positions instead of edge insertion order', () => {
  const nodes = [
    positionedNode('parent', 400),
    positionedNode('left-child', 100),
    positionedNode('right-child', 700),
  ];
  const [rightEdge, leftEdge] = graphEdgesToFlowEdges(
    [
      { id: 'e:parent->right', source: 'parent', target: 'right-child', kind: 'trace' },
      { id: 'e:parent->left', source: 'parent', target: 'left-child', kind: 'spawn' },
    ],
    nodes
  );

  assert.equal(leftEdge.sourceHandle, 'source-0');
  assert.equal(rightEdge.sourceHandle, 'source-1');
});

function positionedNode(id: string, x: number): GraphNode {
  return {
    id,
    type: 'subagent',
    category: 'agentExecution',
    position: { x, y: 0 },
    width: 100,
    height: 100,
    data: {
      kind: 'subagent',
      parentThreadKey: 'C1/1',
      indexInParent: 0,
      subagent: {
        runId: id,
        agent: id,
        model: 'openai/gpt',
        exitCode: 0,
        durationMs: 0,
        turns: 1,
        tokens: { totalTokens: 0, cost: { total: 0 } },
      },
    },
  };
}
