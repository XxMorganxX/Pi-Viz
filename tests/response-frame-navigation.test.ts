import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adjacentResponseFrameId,
  defaultFocusedResponseFrameId,
  responseFrameIds,
} from '../src/lib/response-frame-navigation.js';
import type { GraphModel, GraphNode, ResponseFrameNodeData, Thread, Turn } from '../src/lib/types.js';

const thread: Thread = {
  channelId: 'C1',
  threadTs: '1',
  missionId: 'mission-1',
  missionKind: 'linear',
  firstTs: '2026-05-25T00:00:00.000Z',
  lastTs: '2026-05-25T00:00:03.000Z',
  durationMs: 3000,
  turnCount: 3,
  toolCallCount: 0,
  subagentCallCount: 0,
  toolCallsByName: {},
  tokens: { totalTokens: 0, cost: { total: 0 } },
  subagents: [],
  turns: [],
};

function turn(index: number): Turn {
  return {
    index,
    startedAt: '2026-05-25T00:00:00.000Z',
    endedAt: '2026-05-25T00:00:01.000Z',
    durationMs: 1000,
    assistantMessages: 1,
    toolCalls: 0,
    subagentCalls: 0,
    toolCallsByName: {},
    tokens: { totalTokens: 0, cost: { total: 0 } },
  };
}

function frame(id: string, index: number, y: number): GraphNode {
  const data: ResponseFrameNodeData = {
    kind: 'responseFrame',
    thread,
    turn: turn(index),
    promptPreview: `Prompt ${index}`,
    assistantPreview: `Response ${index}`,
  };
  return {
    id,
    type: 'responseFrame',
    category: 'responseFrame',
    data,
    position: { x: 0, y },
  };
}

const graph: GraphModel = {
  nodes: [
    frame('response:C1/1:2', 2, 400),
    {
      id: 'orchestrator:C1/1',
      type: 'orchestrator',
      category: 'agentExecution',
      position: { x: 0, y: 600 },
      data: { kind: 'orchestrator', thread },
    },
    frame('response:C1/1:1', 1, 100),
    frame('response:C1/1:3', 3, 900),
  ],
  edges: [],
};

test('responseFrameIds returns response frames in vertical order', () => {
  assert.deepEqual(responseFrameIds(graph), ['response:C1/1:1', 'response:C1/1:2', 'response:C1/1:3']);
});

test('responseFrameIds follows request index when expanded frame bounds alter canvas position', () => {
  const expandedGraph: GraphModel = {
    nodes: [
      frame('response:C1/1:3', 3, 900),
      frame('response:C1/1:4', 4, 850),
      frame('response:C1/1:2', 2, 400),
      frame('response:C1/1:1', 1, 100),
    ],
    edges: [],
  };

  assert.deepEqual(responseFrameIds(expandedGraph), [
    'response:C1/1:1',
    'response:C1/1:2',
    'response:C1/1:3',
    'response:C1/1:4',
  ]);
});

test('adjacentResponseFrameId moves between request frames without wrapping', () => {
  const ids = responseFrameIds(graph);

  assert.equal(adjacentResponseFrameId(ids, 'response:C1/1:1', 'next'), 'response:C1/1:2');
  assert.equal(adjacentResponseFrameId(ids, 'response:C1/1:2', 'previous'), 'response:C1/1:1');
  assert.equal(adjacentResponseFrameId(ids, 'response:C1/1:3', 'next'), 'response:C1/1:3');
  assert.equal(adjacentResponseFrameId(ids, 'response:C1/1:1', 'previous'), 'response:C1/1:1');
});

test('adjacentResponseFrameId picks an edge frame when nothing is focused', () => {
  const ids = responseFrameIds(graph);

  assert.equal(adjacentResponseFrameId(ids, null, 'next'), 'response:C1/1:1');
  assert.equal(adjacentResponseFrameId(ids, null, 'previous'), 'response:C1/1:3');
});

test('defaultFocusedResponseFrameId opens a session on the latest request frame', () => {
  const ids = responseFrameIds(graph);

  assert.equal(defaultFocusedResponseFrameId(ids, null), 'response:C1/1:3');
  assert.equal(defaultFocusedResponseFrameId(ids, 'response:C1/1:2'), 'response:C1/1:2');
  assert.equal(defaultFocusedResponseFrameId(ids, 'response:C1/1:missing'), 'response:C1/1:3');
  assert.equal(defaultFocusedResponseFrameId([], null), null);
});
