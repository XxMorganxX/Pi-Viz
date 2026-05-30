import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraph } from '../src/lib/parse.js';
import type { Milestone, Snapshot, Thread } from '../src/lib/types.js';

function thread(milestones: Milestone[]): Thread {
  return {
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
    milestones,
    turns: [],
  };
}

function snapshot(milestones: Milestone[]): Snapshot {
  return {
    generatedAt: '2026-05-25T00:00:02.000Z',
    threads: [thread(milestones)],
    missions: [
      {
        id: 'alpha',
        kind: 'linear',
        title: 'Alpha',
        threadKeys: ['C1/1.0'],
        threadCount: 1,
        startedAt: '2026-05-25T00:00:00.000Z',
        endedAt: '2026-05-25T00:00:01.000Z',
        durationMs: 1000,
        tokens: { totalTokens: 0, cost: { total: 0 } },
      },
    ],
    totals: {
      threadCount: 1,
      missionCount: 1,
      turnCount: 1,
      toolCallCount: 0,
      tokens: { totalTokens: 0, cost: { total: 0 } },
    },
  };
}

const milestones: Milestone[] = [
  { id: 'parent', source: 'pi', title: 'Milestone', status: 'active', order: 0 },
  { id: 'c1', source: 'pi', title: 'Task A', status: 'done', parentId: 'parent', order: 0 },
  { id: 'c2', source: 'pi', title: 'Task B', status: 'active', parentId: 'parent', order: 1 },
];

test('buildGraph emits a milestone node per milestone', () => {
  const { nodes } = buildGraph(snapshot(milestones), { threadKey: 'C1/1.0' });
  const milestoneNodes = nodes.filter((node) => node.type === 'milestone');

  assert.equal(milestoneNodes.length, 3);
  const parent = milestoneNodes.find((node) => node.id === 'milestone:C1/1.0:parent');
  assert.ok(parent);
  assert.equal(parent.category, 'milestone');
  assert.equal(parent.data.kind, 'milestone');
  if (parent.data.kind === 'milestone') assert.equal(parent.data.milestone.title, 'Milestone');
});

test('child milestones are edged to their parent milestone via containment', () => {
  const { edges } = buildGraph(snapshot(milestones), { threadKey: 'C1/1.0' });
  const containment = edges.find(
    (edge) => edge.source === 'milestone:C1/1.0:parent' && edge.target === 'milestone:C1/1.0:c1'
  );

  assert.ok(containment);
  assert.equal(containment.kind, 'containment');
});

test('root milestones are edged from the thread node', () => {
  const { edges } = buildGraph(snapshot(milestones), { threadKey: 'C1/1.0' });
  const rootEdge = edges.find((edge) => edge.target === 'milestone:C1/1.0:parent');

  assert.ok(rootEdge);
  assert.equal(rootEdge.kind, 'containment');
  assert.equal(rootEdge.source, 'thread:C1/1.0');
});

test('sibling milestones are linked in order with sequence edges', () => {
  const { edges } = buildGraph(snapshot(milestones), { threadKey: 'C1/1.0' });
  const sequence = edges.find(
    (edge) => edge.source === 'milestone:C1/1.0:c1' && edge.target === 'milestone:C1/1.0:c2'
  );

  assert.ok(sequence);
  assert.equal(sequence.kind, 'sequence');
});
