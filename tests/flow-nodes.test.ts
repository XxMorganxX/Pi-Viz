import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  graphNodesToFlowNodes,
  moveContainedNodesWithDraggedFrames,
  mergeFlowNodePositions,
  syncResponseFrameBounds,
} from '../src/lib/flow-nodes.js';
import type { GraphNode } from '../src/lib/types.js';

const missionNode: GraphNode = {
  id: 'mission:alpha',
  type: 'mission',
  category: 'missionGroup',
  position: { x: 0, y: 0 },
  width: 256,
  height: 128,
  data: {
    kind: 'mission',
    mission: {
      id: 'alpha',
      kind: 'linear',
      title: 'Alpha',
      threadKeys: [],
      threadCount: 0,
      startedAt: '2026-05-25T00:00:00.000Z',
      endedAt: '2026-05-25T00:00:01.000Z',
      durationMs: 1000,
      tokens: { totalTokens: 0, cost: { total: 0 } },
    },
  },
};

const threadNode: GraphNode = {
  id: 'thread:alpha',
  type: 'thread',
  category: 'sessionRoot',
  parentId: missionNode.id,
  extent: 'parent',
  position: { x: 28, y: 44 },
  width: 200,
  height: 64,
  data: {
    kind: 'thread',
    thread: {
      channelId: 'C1',
      threadTs: '1.0',
      missionId: 'alpha',
      missionKind: 'linear',
      firstTs: '2026-05-25T00:00:00.000Z',
      lastTs: '2026-05-25T00:00:01.000Z',
      durationMs: 1000,
      turnCount: 1,
      toolCallCount: 0,
      subagentCallCount: 0,
      toolCallsByName: {},
      tokens: { totalTokens: 0, cost: { total: 0 } },
      subagents: [],
      turns: [],
    },
  },
};

test('graph nodes can be dragged relative to each other', () => {
  const [flowNode] = graphNodesToFlowNodes([missionNode], null, new Set());

  assert.equal(flowNode.draggable, true);
});

test('graph nodes expose outgoing source handle counts for edge fan-out', () => {
  const [flowNode] = graphNodesToFlowNodes([missionNode], null, new Set(), [
    { id: 'e:mission:alpha->thread:a', source: missionNode.id, target: 'thread:a', kind: 'containment' },
    { id: 'e:mission:alpha->thread:b', source: missionNode.id, target: 'thread:b', kind: 'containment' },
  ]);

  assert.equal((flowNode.data as any).__sourceHandleCount, 2);
});

test('mission nodes are selectable tree roots', () => {
  const [flowNode] = graphNodesToFlowNodes([missionNode], missionNode.id, new Set());

  assert.equal(flowNode.selectable, true);
  assert.equal(flowNode.selected, true);
});

test('thread nodes are independent from mission containers in React Flow', () => {
  const [, flowThread] = graphNodesToFlowNodes(
    [{ ...missionNode, position: { x: 100, y: 200 } }, threadNode],
    null,
    new Set()
  );

  assert.equal(flowThread.parentId, undefined);
  assert.equal(flowThread.extent, undefined);
  assert.deepEqual(flowThread.position, { x: 128, y: 244 });
});

test('response frame containers are draggable groups behind free-positioned draggable runtime nodes', () => {
  const responseFrame: GraphNode = {
    id: 'response:alpha:1',
    type: 'responseFrame',
    category: 'responseFrame',
    parentId: missionNode.id,
    position: { x: 100, y: 160 },
    width: 1200,
    height: 900,
    data: {
      kind: 'responseFrame',
      thread: threadNode.data.kind === 'thread' ? threadNode.data.thread : (() => {
        throw new Error('missing thread');
      })(),
      turn: {
        index: 1,
        startedAt: '2026-05-25T00:00:00.000Z',
        endedAt: '2026-05-25T00:00:01.000Z',
        durationMs: 1000,
        assistantMessages: 1,
        toolCalls: 0,
        subagentCalls: 0,
        toolCallsByName: {},
        tokens: { totalTokens: 0, cost: { total: 0 } },
      },
    },
  };
  const runtimeNode: GraphNode = {
    id: 'orchestrator:alpha',
    type: 'orchestrator',
    category: 'agentExecution',
    parentId: responseFrame.id,
    containerId: responseFrame.id,
    position: { x: 240, y: 360 },
    data: {
      kind: 'orchestrator',
      thread: threadNode.data.kind === 'thread' ? threadNode.data.thread : (() => {
        throw new Error('missing thread');
      })(),
    },
  };

  const [, flowFrame, flowRuntime] = graphNodesToFlowNodes(
    [missionNode, responseFrame, runtimeNode],
    null,
    new Set()
  );

  assert.equal(flowFrame.parentId, undefined);
  assert.equal(flowFrame.draggable, true);
  assert.equal(flowFrame.selectable, true);
  assert.equal(flowFrame.className, 'response-frame-shell');
  assert.deepEqual(flowFrame.position, { x: 100, y: 160 });
  assert.equal(flowRuntime.parentId, undefined);
  assert.equal(flowRuntime.extent, undefined);
  assert.equal(flowRuntime.draggable, true);
  assert.equal(flowRuntime.selectable, true);
  assert.deepEqual(flowRuntime.position, { x: 240, y: 360 });
});

test('user moved runtime node positions are preserved inside response frames', () => {
  const refreshed = graphNodesToFlowNodes(
    [
      {
        ...threadNode,
        id: 'response:alpha:1',
        type: 'responseFrame',
        category: 'responseFrame',
      } as GraphNode,
      {
        ...threadNode,
        id: 'orchestrator:alpha',
        type: 'orchestrator',
        category: 'agentExecution',
        containerId: 'response:alpha:1',
      } as GraphNode,
    ],
    null,
    new Set()
  );
  const existing = [
    refreshed[0],
    {
      ...refreshed[1],
      position: { x: 444, y: 555 },
    },
  ];

  const [, mergedRuntime] = mergeFlowNodePositions(refreshed, existing);

  assert.deepEqual(mergedRuntime.position, { x: 444, y: 555 });
});

test('response frame bounds are recomputed from current associated node positions', () => {
  const responseFrame: GraphNode = {
    ...threadNode,
    id: 'response:alpha:1',
    type: 'responseFrame',
    category: 'responseFrame',
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
  } as GraphNode;
  const firstRuntime: GraphNode = {
    ...threadNode,
    id: 'orchestrator:alpha',
    type: 'orchestrator',
    category: 'agentExecution',
    containerId: responseFrame.id,
    position: { x: 320, y: 240 },
    width: 200,
    height: 120,
  } as GraphNode;
  const secondRuntime: GraphNode = {
    ...firstRuntime,
    id: 'feed:alpha',
    type: 'traceFeed',
    category: 'traceDisplay',
    position: { x: 900, y: 680 },
    width: 300,
    height: 180,
  } as GraphNode;
  const graphNodes = [responseFrame, firstRuntime, secondRuntime];
  const currentFlowNodes = graphNodesToFlowNodes(graphNodes, null, new Set()).map((node) =>
    node.id === 'feed:alpha' ? { ...node, position: { x: 1100, y: 800 } } : node
  );

  const [syncedFrame] = syncResponseFrameBounds(currentFlowNodes, graphNodes);

  assert.deepEqual(syncedFrame.position, { x: 250, y: 50 });
  assert.equal(syncedFrame.style?.width, 1220);
  assert.equal(syncedFrame.style?.height, 1120);
  assert.equal(syncedFrame.width, 1220);
  assert.equal(syncedFrame.height, 1120);
});

test('response frame bounds keep the default frame size after live sync', () => {
  const responseFrame: GraphNode = {
    ...threadNode,
    id: 'response:alpha:1',
    type: 'responseFrame',
    category: 'responseFrame',
    position: { x: 0, y: 0 },
    width: 1180,
    height: 1120,
  } as GraphNode;
  const runtimeNode: GraphNode = {
    ...threadNode,
    id: 'orchestrator:alpha',
    type: 'orchestrator',
    category: 'agentExecution',
    containerId: responseFrame.id,
    position: { x: 320, y: 240 },
    width: 200,
    height: 120,
  } as GraphNode;

  const [syncedFrame] = syncResponseFrameBounds(
    graphNodesToFlowNodes([responseFrame, runtimeNode], null, new Set()),
    [responseFrame, runtimeNode]
  );

  assert.equal(syncedFrame.style?.width, 1180);
  assert.equal(syncedFrame.style?.height, 1120);
  assert.equal(syncedFrame.width, 1180);
  assert.equal(syncedFrame.height, 1120);
});

test('dragging a response frame moves all contained nodes by the same delta', () => {
  const responseFrame: GraphNode = {
    ...threadNode,
    id: 'response:alpha:1',
    type: 'responseFrame',
    category: 'responseFrame',
    position: { x: 250, y: 50 },
    width: 100,
    height: 100,
  } as GraphNode;
  const firstRuntime: GraphNode = {
    ...threadNode,
    id: 'orchestrator:alpha',
    type: 'orchestrator',
    category: 'agentExecution',
    containerId: responseFrame.id,
    position: { x: 320, y: 240 },
    width: 200,
    height: 120,
  } as GraphNode;
  const secondRuntime: GraphNode = {
    ...firstRuntime,
    id: 'feed:alpha',
    type: 'traceFeed',
    category: 'traceDisplay',
    position: { x: 900, y: 680 },
    width: 300,
    height: 180,
  } as GraphNode;
  const currentFlowNodes = graphNodesToFlowNodes([responseFrame, firstRuntime, secondRuntime], null, new Set());
  const changedFlowNodes = currentFlowNodes.map((node) =>
    node.id === responseFrame.id ? { ...node, position: { x: 310, y: 90 } } : node
  );

  const movedNodes = moveContainedNodesWithDraggedFrames(changedFlowNodes, currentFlowNodes, [
    responseFrame,
    firstRuntime,
    secondRuntime,
  ]);

  assert.deepEqual(movedNodes.find((node) => node.id === firstRuntime.id)?.position, { x: 380, y: 280 });
  assert.deepEqual(movedNodes.find((node) => node.id === secondRuntime.id)?.position, { x: 960, y: 720 });
});

test('user moved node positions are preserved when graph nodes refresh', () => {
  const refreshed = graphNodesToFlowNodes([missionNode], null, new Set());
  const existing = [
    {
      ...refreshed[0],
      position: { x: 84, y: 42 },
    },
  ];

  const [merged] = mergeFlowNodePositions(refreshed, existing);

  assert.deepEqual(merged.position, { x: 84, y: 42 });
});
