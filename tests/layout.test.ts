import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutGraph } from '../src/lib/layout.js';
import type { GraphModel, GraphNode } from '../src/lib/types.js';

function node(id: string, type: GraphNode['type'], parentId?: string): GraphNode {
  const category =
    type === 'mission'
      ? 'missionGroup'
      : type === 'thread'
        ? 'sessionRoot'
        : type === 'traceFeed'
          ? 'traceDisplay'
          : 'agentExecution';

  return {
    id,
    type,
    category,
    parentId,
    position: { x: 0, y: 0 },
    data:
      type === 'mission'
        ? {
            kind: 'mission',
            mission: {
              id: 'mission-1',
              kind: 'linear',
              title: 'Mission',
              threadKeys: [],
              threadCount: 1,
              startedAt: '2026-05-25T00:00:00.000Z',
              endedAt: '2026-05-25T00:00:01.000Z',
              durationMs: 1000,
              tokens: { totalTokens: 0, cost: { total: 0 } },
            },
          }
        : type === 'thread' || type === 'orchestrator'
          ? {
              kind: type,
              thread: {
                channelId: 'C1',
                threadTs: '1',
                missionId: 'mission-1',
                missionKind: 'linear',
                firstTs: '2026-05-25T00:00:00.000Z',
                lastTs: '2026-05-25T00:00:01.000Z',
                durationMs: 1000,
                turnCount: 1,
                toolCallCount: 0,
                subagentCallCount: 2,
                toolCallsByName: {},
                tokens: { totalTokens: 0, cost: { total: 0 } },
                subagents: [],
                turns: [],
              },
            }
          : type === 'traceFeed'
            ? {
                kind: 'traceFeed',
                title: 'Trace feed',
                agentLabel: 'orchestrator',
                ownerKind: 'orchestrator',
                entries: [],
              }
          : {
              kind: 'subagent',
              parentThreadKey: 'C1/1',
              indexInParent: 0,
              subagent: {
                runId: id,
                agent: id,
                model: 'anthropic/claude',
                exitCode: 0,
                durationMs: 1000,
                turns: 1,
                tokens: { totalTokens: 0, cost: { total: 0 } },
              },
            },
  };
}

test('layoutGraph positions nodes as a parent-to-children tree', () => {
  const model: GraphModel = {
    nodes: [
      node('mission:1', 'mission'),
      node('thread:1', 'thread', 'mission:1'),
      node('orchestrator:1', 'orchestrator', 'thread:1'),
      node('sub:1', 'subagent', 'orchestrator:1'),
      node('sub:2', 'subagent', 'orchestrator:1'),
      node('feed:orchestrator:1', 'traceFeed', 'orchestrator:1'),
    ],
    edges: [
      { id: 'e:mission:1->thread:1', source: 'mission:1', target: 'thread:1', kind: 'containment' },
      {
        id: 'e:thread:1->orchestrator:1',
        source: 'thread:1',
        target: 'orchestrator:1',
        kind: 'containment',
      },
      { id: 'e:orchestrator:1->sub:1', source: 'orchestrator:1', target: 'sub:1', kind: 'spawn' },
      { id: 'e:orchestrator:1->sub:2', source: 'orchestrator:1', target: 'sub:2', kind: 'spawn' },
      {
        id: 'e:orchestrator:1->feed:orchestrator:1',
        source: 'orchestrator:1',
        target: 'feed:orchestrator:1',
        kind: 'trace',
      },
    ],
  };

  const laidOut = layoutGraph(model);
  const byId = new Map(laidOut.nodes.map((n) => [n.id, n]));

  assert.equal(byId.get('mission:1')?.parentId, undefined);
  assert.equal(byId.get('thread:1')?.parentId, 'mission:1');
  assert.equal(byId.get('orchestrator:1')?.parentId, 'thread:1');
  assert.equal(byId.get('sub:1')?.parentId, 'orchestrator:1');
  assert.equal(byId.get('mission:1')?.width, 560);
  assert.equal(byId.get('mission:1')?.height, 190);
  assert.equal(byId.get('thread:1')?.width, 620);
  assert.equal(byId.get('thread:1')?.height, 190);
  assert.equal(byId.get('orchestrator:1')?.width, 620);
  assert.equal(byId.get('orchestrator:1')?.height, 210);
  assert.equal(byId.get('feed:orchestrator:1')?.width, 860);
  assert.equal(byId.get('feed:orchestrator:1')?.height, 760);
  assert.ok(byId.get('thread:1')!.position.y > byId.get('mission:1')!.position.y);
  assert.ok(byId.get('orchestrator:1')!.position.y > byId.get('thread:1')!.position.y);
  assert.ok(byId.get('sub:1')!.position.y > byId.get('orchestrator:1')!.position.y);
  assert.ok(byId.get('sub:2')!.position.y > byId.get('orchestrator:1')!.position.y);
  assert.ok(byId.get('sub:1')!.position.x !== byId.get('sub:2')!.position.x);
});

test('layoutGraph appends response frames after existing frames', () => {
  const frame = (id: string, index: number): GraphNode => ({
    id,
    type: 'responseFrame',
    category: 'responseFrame',
    position: { x: 0, y: 0 },
    data: {
      kind: 'responseFrame',
      thread: (node('orchestrator:template', 'orchestrator').data as any).thread,
      turn: {
        index,
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
  });
  const orchestrator = (id: string, frameId: string): GraphNode => ({
    ...node(id, 'orchestrator', frameId),
    containerId: frameId,
  });
  const feed = (id: string, parentId: string, frameId: string): GraphNode => ({
    ...node(id, 'traceFeed', parentId),
    containerId: frameId,
  });

  const model: GraphModel = {
    nodes: [
      node('mission:1', 'mission'),
      frame('response:1', 1),
      orchestrator('orchestrator:1', 'response:1'),
      feed('feed:1', 'orchestrator:1', 'response:1'),
      frame('response:2', 2),
      orchestrator('orchestrator:2', 'response:2'),
      feed('feed:2', 'orchestrator:2', 'response:2'),
      frame('response:3', 3),
      orchestrator('orchestrator:3', 'response:3'),
      feed('feed:3', 'orchestrator:3', 'response:3'),
    ],
    edges: [
      { id: 'e:mission:1->response:1', source: 'mission:1', target: 'response:1', kind: 'containment' },
      { id: 'e:response:1->response:2', source: 'response:1', target: 'response:2', kind: 'sequence' },
      { id: 'e:response:2->response:3', source: 'response:2', target: 'response:3', kind: 'sequence' },
      { id: 'e:orchestrator:1->feed:1', source: 'orchestrator:1', target: 'feed:1', kind: 'trace' },
      { id: 'e:orchestrator:2->feed:2', source: 'orchestrator:2', target: 'feed:2', kind: 'trace' },
      { id: 'e:orchestrator:3->feed:3', source: 'orchestrator:3', target: 'feed:3', kind: 'trace' },
    ],
  };

  const byId = new Map(layoutGraph(model).nodes.map((n) => [n.id, n]));

  assert.ok(byId.get('response:1')!.position.y > byId.get('mission:1')!.position.y);
  assert.ok(byId.get('response:2')!.position.y > byId.get('response:1')!.position.y);
  assert.ok(byId.get('response:3')!.position.y > byId.get('response:2')!.position.y);
});

test('layoutGraph formats response-frame contents into agent levels with separated trace feeds', () => {
  const frame: GraphNode = {
    id: 'response:1',
    type: 'responseFrame',
    category: 'responseFrame',
    position: { x: 0, y: 0 },
    data: {
      kind: 'responseFrame',
      thread: (node('orchestrator:template', 'orchestrator').data as any).thread,
      turn: {
        index: 1,
        startedAt: '2026-05-25T00:00:00.000Z',
        endedAt: '2026-05-25T00:00:01.000Z',
        durationMs: 1000,
        assistantMessages: 1,
        toolCalls: 0,
        subagentCalls: 1,
        toolCallsByName: {},
        tokens: { totalTokens: 0, cost: { total: 0 } },
      },
    },
    parentId: 'mission:1',
  };
  const orchestrator: GraphNode = {
    ...node('orchestrator:1', 'orchestrator', frame.id),
    containerId: frame.id,
  };
  const subagent: GraphNode = {
    ...node('sub:1', 'subagent', orchestrator.id),
    containerId: frame.id,
  };
  const orchestratorFeed: GraphNode = {
    ...node('feed:orchestrator:1', 'traceFeed', orchestrator.id),
    containerId: frame.id,
  };
  const subagentFeed: GraphNode = {
    ...node('feed:sub:1', 'traceFeed', subagent.id),
    containerId: frame.id,
  };

  const model: GraphModel = {
    nodes: [node('mission:1', 'mission'), frame, orchestrator, subagent, orchestratorFeed, subagentFeed],
    edges: [
      { id: 'e:mission:1->response:1', source: 'mission:1', target: frame.id, kind: 'containment' },
      { id: 'e:orchestrator:1->sub:1', source: orchestrator.id, target: subagent.id, kind: 'spawn' },
      { id: 'e:orchestrator:1->feed:orchestrator:1', source: orchestrator.id, target: orchestratorFeed.id, kind: 'trace' },
      { id: 'e:sub:1->feed:sub:1', source: subagent.id, target: subagentFeed.id, kind: 'trace' },
    ],
  };

  const byId = new Map(layoutGraph(model).nodes.map((n) => [n.id, n]));

  assert.ok(byId.get('orchestrator:1')!.position.y < byId.get('sub:1')!.position.y);
  assert.ok(byId.get('feed:orchestrator:1')!.position.y > byId.get('orchestrator:1')!.position.y);
  assert.ok(byId.get('feed:sub:1')!.position.y > byId.get('sub:1')!.position.y);
  assert.ok(Math.abs(byId.get('feed:orchestrator:1')!.position.x - byId.get('feed:sub:1')!.position.x) >= 980);
  assert.ok(byId.get('response:1')!.width! >= 1900);
  assert.ok(byId.get('response:1')!.height! >= 1120);
});
