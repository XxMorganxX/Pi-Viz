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

test('layoutGraph centers minimum response-frame bounds around the prompt flow', () => {
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
        subagentCalls: 0,
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

  const byId = new Map(
    layoutGraph({
      nodes: [node('mission:1', 'mission'), frame, orchestrator],
      edges: [
        { id: 'e:mission:1->response:1', source: 'mission:1', target: frame.id, kind: 'containment' },
      ],
    }).nodes.map((n) => [n.id, n])
  );
  const laidOutFrame = byId.get(frame.id)!;
  const laidOutOrchestrator = byId.get(orchestrator.id)!;

  assert.equal(laidOutFrame.width, 1180);
  assert.equal(
    laidOutFrame.position.x + laidOutFrame.width! / 2,
    laidOutOrchestrator.position.x + laidOutOrchestrator.width! / 2
  );
});

test('layoutGraph stacks response frame centers on one vertical centerline', () => {
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
    parentId: 'mission:1',
  });
  const firstFrame = frame('response:1', 1);
  const secondFrame = frame('response:2', 2);
  const firstOrchestrator = { ...node('orchestrator:1', 'orchestrator', firstFrame.id), containerId: firstFrame.id };
  const firstFeed = { ...node('feed:1', 'traceFeed', firstOrchestrator.id), containerId: firstFrame.id };
  const secondOrchestrator = { ...node('orchestrator:2', 'orchestrator', secondFrame.id), containerId: secondFrame.id };

  const byId = new Map(
    layoutGraph({
      nodes: [node('mission:1', 'mission'), firstFrame, firstOrchestrator, firstFeed, secondFrame, secondOrchestrator],
      edges: [
        { id: 'e:mission:1->response:1', source: 'mission:1', target: firstFrame.id, kind: 'containment' },
        { id: 'e:response:1->response:2', source: firstFrame.id, target: secondFrame.id, kind: 'sequence' },
        { id: 'e:orchestrator:1->feed:1', source: firstOrchestrator.id, target: firstFeed.id, kind: 'trace' },
      ],
    }).nodes.map((n) => [n.id, n])
  );
  const laidOutFirstFrame = byId.get(firstFrame.id)!;
  const laidOutSecondFrame = byId.get(secondFrame.id)!;
  const laidOutSecondOrchestrator = byId.get(secondOrchestrator.id)!;
  const firstCenterX = laidOutFirstFrame.position.x + laidOutFirstFrame.width! / 2;

  assert.equal(laidOutSecondFrame.position.x + laidOutSecondFrame.width! / 2, firstCenterX);
  assert.equal(laidOutSecondOrchestrator.position.x + laidOutSecondOrchestrator.width! / 2, firstCenterX);
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
  assert.equal(
    byId.get('feed:sub:1')!.position.x + byId.get('feed:sub:1')!.width! / 2,
    byId.get('sub:1')!.position.x + byId.get('sub:1')!.width! / 2
  );
  assert.ok(byId.get('feed:orchestrator:1')!.position.x > byId.get('sub:1')!.position.x + byId.get('sub:1')!.width!);
  assert.ok(Math.abs(byId.get('feed:orchestrator:1')!.position.x - byId.get('feed:sub:1')!.position.x) >= 980);
  assert.ok(byId.get('response:1')!.width! >= 1900);
  assert.ok(byId.get('response:1')!.height! >= 1120);
});

test('layoutGraph prevents expanded response-frame boxes from overlapping', () => {
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
        subagentCalls: 1,
        toolCallsByName: {},
        tokens: { totalTokens: 0, cost: { total: 0 } },
      },
    },
    parentId: 'mission:1',
  });
  const agent = (id: string, parentId: string, frameId: string): GraphNode => ({
    ...node(id, id.startsWith('orchestrator') ? 'orchestrator' : 'subagent', parentId),
    containerId: frameId,
  });
  const feed = (id: string, parentId: string, frameId: string): GraphNode => ({
    ...node(id, 'traceFeed', parentId),
    containerId: frameId,
  });

  const response1 = frame('response:1', 1);
  const response2 = frame('response:2', 2);
  const orchestrator1 = agent('orchestrator:1', response1.id, response1.id);
  const subagent1 = agent('sub:1', orchestrator1.id, response1.id);
  const nestedSubagent = agent('sub:1:nested', subagent1.id, response1.id);
  const orchestrator2 = agent('orchestrator:2', response2.id, response2.id);

  const model: GraphModel = {
    nodes: [
      node('mission:1', 'mission'),
      response1,
      orchestrator1,
      subagent1,
      nestedSubagent,
      feed('feed:orchestrator:1', orchestrator1.id, response1.id),
      response2,
      orchestrator2,
      feed('feed:orchestrator:2', orchestrator2.id, response2.id),
    ],
    edges: [
      { id: 'e:mission:1->response:1', source: 'mission:1', target: response1.id, kind: 'containment' },
      { id: 'e:response:1->response:2', source: response1.id, target: response2.id, kind: 'sequence' },
      { id: 'e:orchestrator:1->sub:1', source: orchestrator1.id, target: subagent1.id, kind: 'spawn' },
      { id: 'e:orchestrator:1->feed:orchestrator:1', source: orchestrator1.id, target: 'feed:orchestrator:1', kind: 'trace' },
      { id: 'e:orchestrator:2->feed:orchestrator:2', source: orchestrator2.id, target: 'feed:orchestrator:2', kind: 'trace' },
    ],
  };

  const byId = new Map(layoutGraph(model).nodes.map((n) => [n.id, n]));
  const firstFrame = byId.get(response1.id)!;
  const secondFrame = byId.get(response2.id)!;

  assert.ok(secondFrame.position.y >= firstFrame.position.y + firstFrame.height! + 180);
  assert.ok(byId.get(orchestrator2.id)!.position.y > secondFrame.position.y);
  assert.ok(byId.get('feed:orchestrator:2')!.position.y > secondFrame.position.y);
});

test('layoutGraph spaces each parent child row evenly without overlapping nodes', () => {
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
        subagentCalls: 6,
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
  const children = ['sub:1', 'sub:2'].map((id) => ({
    ...node(id, 'subagent', orchestrator.id),
    containerId: frame.id,
  }));
  const grandchildren = children.flatMap((parent, parentIndex) =>
    [1, 2].map((childIndex) => ({
      ...node(`sub:${parentIndex + 1}:${childIndex}`, 'subagent', parent.id),
      containerId: frame.id,
    }))
  );

  const model: GraphModel = {
    nodes: [node('mission:1', 'mission'), frame, orchestrator, ...children, ...grandchildren],
    edges: [
      { id: 'e:mission:1->response:1', source: 'mission:1', target: frame.id, kind: 'containment' },
      ...[...children, ...grandchildren].map((child) => ({
        id: `e:orchestrator:1->${child.id}`,
        source: child.parentId!,
        target: child.id,
        kind: 'spawn' as const,
      })),
    ],
  };

  const byId = new Map(layoutGraph(model).nodes.map((n) => [n.id, n]));
  const laidOutChildren = children.map((child) => byId.get(child.id)!);
  const centers = laidOutChildren.map((child) => child.position.x + child.width! / 2);
  const firstGap = centers[1] - centers[0];
  const childrenWidthSum = laidOutChildren.reduce((sum, child) => sum + child.width!, 0);
  const childrenRowWidth =
    Math.max(...laidOutChildren.map((child) => child.position.x + child.width!)) -
    Math.min(...laidOutChildren.map((child) => child.position.x));

  assert.equal(laidOutChildren[0].position.y, laidOutChildren[1].position.y);
  assert.equal(childrenRowWidth, childrenWidthSum * 1.6);
  assert.equal(firstGap, laidOutChildren[0].width! + childrenWidthSum * 0.6);
  assert.equal(
    centers.reduce((sum, center) => sum + center, 0) / centers.length,
    byId.get(orchestrator.id)!.position.x + byId.get(orchestrator.id)!.width! / 2
  );

  for (const parent of children) {
    const laidOutParent = byId.get(parent.id)!;
    const parentCenter = laidOutParent.position.x + laidOutParent.width! / 2;
    const laidOutGrandchildren = grandchildren
      .filter((child) => child.parentId === parent.id)
      .map((child) => byId.get(child.id)!);
    const grandchildCenters = laidOutGrandchildren.map((child) => child.position.x + child.width! / 2);
    const childRowCenter = grandchildCenters.reduce((sum, center) => sum + center, 0) / grandchildCenters.length;
    const grandchildGap = grandchildCenters[1] - grandchildCenters[0];
    const grandchildWidthSum = laidOutGrandchildren.reduce((sum, child) => sum + child.width!, 0);
    const grandchildRowWidth =
      Math.max(...laidOutGrandchildren.map((child) => child.position.x + child.width!)) -
      Math.min(...laidOutGrandchildren.map((child) => child.position.x));

    assert.equal(laidOutGrandchildren[0].position.y, laidOutGrandchildren[1].position.y);
    assert.equal(childRowCenter, parentCenter);
    assert.equal(grandchildRowWidth, grandchildWidthSum * 1.6);
    assert.equal(grandchildGap, laidOutGrandchildren[0].width! + grandchildWidthSum * 0.6);
  }
});
