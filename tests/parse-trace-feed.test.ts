import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraph } from '../src/lib/parse.js';
import type { Snapshot } from '../src/lib/types.js';

const snapshot: Snapshot = {
  generatedAt: '2026-05-25T00:00:00.000Z',
  missions: [
    {
      id: 'mission-1',
      kind: 'linear',
      title: 'Mission',
      threadKeys: ['C1/1'],
      threadCount: 1,
      startedAt: '2026-05-25T00:00:00.000Z',
      endedAt: '2026-05-25T00:00:01.000Z',
      durationMs: 1000,
      tokens: { totalTokens: 0, cost: { total: 0 } },
    },
  ],
  threads: [
    {
      channelId: 'C1',
      threadTs: '1',
      missionId: 'mission-1',
      missionKind: 'linear',
      firstTs: '2026-05-25T00:00:00.000Z',
      lastTs: '2026-05-25T00:00:01.000Z',
      durationMs: 1000,
      turnCount: 1,
      toolCallCount: 1,
      subagentCallCount: 1,
      toolCallsByName: { read: 1 },
      tokens: { totalTokens: 0, cost: { total: 0 } },
      turns: [],
      toolEvents: [
        {
          id: 'tool-1',
          tool: 'read',
          timestamp: '2026-05-25T00:00:00.100Z',
          status: 'ok',
        },
      ],
      toolInputSchemas: {
        read: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
      runtimeEvents: [
        {
          eventId: 'thinking-1',
          sequence: 1,
          timestamp: '2026-05-25T00:00:00.050Z',
          sessionId: 'session-1',
          threadId: 'thread-1',
          agentId: 'agent-main',
          eventType: 'pi.thinking_delta',
          payload: { delta: 'thinking' },
        },
      ],
      subagents: [
        {
          runId: 'agent-child',
          agent: 'worker',
          model: 'anthropic/claude',
          exitCode: 0,
          durationMs: 1000,
          turns: 1,
          tokens: { totalTokens: 0, cost: { total: 0 } },
          toolEvents: [
            {
              id: 'tool-2',
              tool: 'write',
              timestamp: '2026-05-25T00:00:00.200Z',
              status: 'error',
            },
          ],
        },
        {
          runId: 'agent-grandchild',
          agent: 'reviewer',
          model: 'anthropic/claude',
          parentAgentId: 'agent-child',
          exitCode: 0,
          durationMs: 500,
          turns: 1,
          tokens: { totalTokens: 0, cost: { total: 0 } },
          toolEvents: [],
        },
      ],
    },
  ],
  totals: {
    threadCount: 1,
    missionCount: 1,
    turnCount: 1,
    toolCallCount: 2,
    tokens: { totalTokens: 0, cost: { total: 0 } },
  },
};

test('buildGraph adds a trace feed child for each agent node', () => {
  const graph = buildGraph(snapshot);
  const feedNodes = graph.nodes.filter((node) => node.type === 'traceFeed');
  const threadNode = graph.nodes.find((node) => node.id === 'thread:C1/1');
  const orchestratorNode = graph.nodes.find((node) => node.id === 'orchestrator:C1/1');
  const subagentNode = graph.nodes.find((node) => node.id === 'sub:C1/1:agent-child:0');

  const grandchildNode = graph.nodes.find((node) => node.id === 'sub:C1/1:agent-grandchild:1');

  assert.equal(feedNodes.length, 3);
  assert.equal(threadNode?.category, 'sessionRoot');
  assert.equal(orchestratorNode?.type, 'orchestrator');
  assert.equal(orchestratorNode?.category, 'agentExecution');
  assert.equal(orchestratorNode?.parentId, 'response:C1/1:1');
  assert.equal(subagentNode?.category, 'agentExecution');
  assert.equal(subagentNode?.parentId, 'orchestrator:C1/1');
  assert.equal(grandchildNode?.category, 'agentExecution');
  assert.equal(grandchildNode?.parentId, 'sub:C1/1:agent-child:0');
  assert.ok(feedNodes.every((node) => node.category === 'traceDisplay'));
  assert.ok(feedNodes.some((node) => node.id === 'feed:orchestrator:C1/1'));
  assert.ok(feedNodes.some((node) => node.id === 'feed:sub:C1/1:agent-child:0'));
  assert.ok(feedNodes.some((node) => node.id === 'feed:sub:C1/1:agent-grandchild:1'));
  const orchestratorFeed = feedNodes.find((node) => node.id === 'feed:orchestrator:C1/1');
  assert.equal(orchestratorFeed?.data.kind, 'traceFeed');
  if (orchestratorFeed?.data.kind !== 'traceFeed') throw new Error('missing orchestrator trace feed');
  const readEntry = orchestratorFeed.data.entries.find((entry) => entry.type === 'tool' && entry.label === 'read');
  assert.deepEqual(readEntry?.inputSchema, {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  });
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'thread:C1/1' &&
        edge.target === 'response:C1/1:1' &&
        edge.kind === 'containment'
    )
  );
  assert.ok(
    graph.edges.every(
      (edge) =>
        !(
          edge.source === 'response:C1/1:1' &&
          edge.target === 'orchestrator:C1/1' &&
          edge.kind === 'containment'
        )
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'orchestrator:C1/1' &&
        edge.target === 'feed:orchestrator:C1/1' &&
        edge.kind === 'trace'
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'orchestrator:C1/1' &&
        edge.target === 'sub:C1/1:agent-child:0' &&
        edge.kind === 'spawn'
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'sub:C1/1:agent-child:0' &&
        edge.target === 'sub:C1/1:agent-grandchild:1' &&
        edge.kind === 'spawn'
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'sub:C1/1:agent-child:0' &&
        edge.target === 'feed:sub:C1/1:agent-child:0' &&
        edge.kind === 'trace'
    )
  );
});

test('buildGraph scopes subagents and their feeds to the response frame where they started', () => {
  const graph = buildGraph({
    ...snapshot,
    threads: [
      {
        ...snapshot.threads[0],
        turnCount: 2,
        turns: [
          {
            index: 1,
            startedAt: '2026-05-25T00:00:00.000Z',
            endedAt: '2026-05-25T00:00:01.000Z',
            durationMs: 1000,
            userMessagePreview: 'Investigate the issue',
            assistantTextPreview: 'I spawned a worker.',
            assistantMessages: 1,
            toolCalls: 0,
            subagentCalls: 1,
            toolCallsByName: {},
            tokens: { totalTokens: 10, cost: { total: 0.01 } },
          },
          {
            index: 2,
            startedAt: '2026-05-25T00:00:02.000Z',
            endedAt: '2026-05-25T00:00:03.000Z',
            durationMs: 1000,
            userMessagePreview: 'Continue',
            assistantTextPreview: 'Continuing.',
            assistantMessages: 1,
            toolCalls: 0,
            subagentCalls: 0,
            toolCallsByName: {},
            tokens: { totalTokens: 5, cost: { total: 0.01 } },
          },
        ],
        runtimeEvents: [
          {
            eventId: 'main-start',
            sequence: 1,
            timestamp: '2026-05-25T00:00:00.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.session_started',
            payload: {},
          },
        ],
        subagents: [
          {
            ...snapshot.threads[0].subagents[0],
            runtimeEvents: [
              {
                eventId: 'child-start',
                sequence: 2,
                timestamp: '2026-05-25T00:00:00.500Z',
                sessionId: 'session-1',
                threadId: 'thread-1',
                agentId: 'agent-child',
                parentAgentId: 'agent-main',
                eventType: 'pi.session_started',
                payload: {},
              },
            ],
          },
        ],
      },
    ],
  });

  const firstOrchestrator = graph.nodes.find((node) => node.id === 'orchestrator:C1/1:1');
  const secondOrchestrator = graph.nodes.find((node) => node.id === 'orchestrator:C1/1:2');
  const subagentNode = graph.nodes.find((node) => node.id === 'sub:C1/1:agent-child:0');
  const subagentFeed = graph.nodes.find((node) => node.id === 'feed:sub:C1/1:agent-child:0');
  const spawnEdge = graph.edges.find((edge) => edge.target === 'sub:C1/1:agent-child:0');
  const traceEdge = graph.edges.find((edge) => edge.target === 'feed:sub:C1/1:agent-child:0');

  assert.equal(firstOrchestrator?.containerId, 'response:C1/1:1');
  assert.equal(secondOrchestrator?.containerId, 'response:C1/1:2');
  assert.equal(subagentNode?.parentId, 'orchestrator:C1/1:1');
  assert.equal(subagentNode?.containerId, 'response:C1/1:1');
  assert.equal(subagentFeed?.containerId, 'response:C1/1:1');
  assert.equal(spawnEdge?.source, 'orchestrator:C1/1:1');
  assert.equal(spawnEdge?.kind, 'spawn');
  assert.match(String(spawnEdge?.accentColor), /^#[0-9a-f]{6}$/);
  assert.equal(traceEdge?.accentColor, spawnEdge?.accentColor);
  assert.equal(
    (subagentNode?.style as Record<string, unknown> | undefined)?.['--agent-accent'],
    spawnEdge?.accentColor
  );
  assert.equal(
    (subagentFeed?.style as Record<string, unknown> | undefined)?.['--agent-accent'],
    spawnEdge?.accentColor
  );
});

test('buildGraph can collapse a single session root into its mission node', () => {
  const graph = buildGraph(snapshot, { collapseSingleThreadRoots: true });
  const missionNode = graph.nodes.find((node) => node.id === 'mission:mission-1');
  const threadNode = graph.nodes.find((node) => node.id === 'thread:C1/1');
  const orchestratorNode = graph.nodes.find((node) => node.id === 'orchestrator:C1/1');

  assert.equal(threadNode, undefined);
  assert.equal(missionNode?.data.kind, 'mission');
  if (missionNode?.data.kind !== 'mission') throw new Error('missing mission node');
  assert.equal(missionNode.data.collapsedThread?.channelId, 'C1');
  assert.equal(orchestratorNode?.parentId, 'response:C1/1:1');
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'mission:mission-1' &&
        edge.target === 'response:C1/1:1' &&
        edge.kind === 'containment'
    )
  );
  assert.ok(
    graph.edges.every(
      (edge) =>
        !(
          edge.source === 'response:C1/1:1' &&
          edge.target === 'orchestrator:C1/1' &&
          edge.kind === 'containment'
        )
    )
  );
  assert.ok(
    graph.edges.every(
      (edge) => edge.source !== 'thread:C1/1' && edge.target !== 'thread:C1/1'
    )
  );
});

test('buildGraph wraps response executions in sequenced response frames', () => {
  const graph = buildGraph(
    {
      ...snapshot,
      threads: [
        {
          ...snapshot.threads[0],
          turnCount: 2,
          turns: [
            {
              index: 1,
              startedAt: '2026-05-25T00:00:00.000Z',
              endedAt: '2026-05-25T00:00:01.000Z',
              durationMs: 1000,
              userMessagePreview: 'Find the flaky test',
              assistantTextPreview: 'I found it in auth/login_spec.ts.',
              assistantMessages: 1,
              toolCalls: 1,
              subagentCalls: 1,
              toolCallsByName: { read: 1 },
              tokens: { totalTokens: 10, cost: { total: 0.01 } },
            },
            {
              index: 2,
              startedAt: '2026-05-25T00:00:02.000Z',
              endedAt: '2026-05-25T00:00:03.000Z',
              durationMs: 1000,
              userMessagePreview: 'Patch it',
              assistantTextPreview: 'Patched and verified.',
              assistantMessages: 1,
              toolCalls: 0,
              subagentCalls: 0,
              toolCallsByName: {},
              tokens: { totalTokens: 8, cost: { total: 0.01 } },
            },
          ],
        },
      ],
    },
    { collapseSingleThreadRoots: true }
  );

  const frames = graph.nodes.filter((node) => (node.type as string) === 'responseFrame');
  const firstFrame = frames.find((node) => node.id === 'response:C1/1:1');
  const secondFrame = frames.find((node) => node.id === 'response:C1/1:2');
  const firstOrchestratorNode = graph.nodes.find((node) => node.id === 'orchestrator:C1/1:1');
  const secondOrchestratorNode = graph.nodes.find((node) => node.id === 'orchestrator:C1/1:2');
  const subagentNode = graph.nodes.find((node) => node.id === 'sub:C1/1:agent-child:0');
  const feedNode = graph.nodes.find((node) => node.id === 'feed:orchestrator:C1/1:2');

  assert.equal(frames.length, 2);
  assert.equal(firstFrame?.data.kind, 'responseFrame');
  if (firstFrame?.data.kind !== 'responseFrame') throw new Error('missing response frame data');
  assert.equal(firstFrame.data.turn.index, 1);
  assert.equal(firstFrame.data.promptPreview, 'Find the flaky test');
  assert.equal(firstFrame.data.assistantPreview, 'I found it in auth/login_spec.ts.');
  assert.equal(secondFrame?.parentId, 'mission:mission-1');
  assert.equal(firstOrchestratorNode?.parentId, firstFrame?.id);
  assert.equal(firstOrchestratorNode?.containerId, firstFrame?.id);
  assert.equal(secondOrchestratorNode?.parentId, secondFrame?.id);
  assert.equal(secondOrchestratorNode?.containerId, secondFrame?.id);
  assert.equal(subagentNode?.containerId, secondFrame?.id);
  assert.equal(feedNode?.containerId, secondFrame?.id);
  assert.deepEqual(
    graph.edges.filter((edge) => edge.target.startsWith('orchestrator:C1/1')),
    []
  );
  assert.deepEqual(
    graph.edges
      .filter((edge) => edge.source === 'mission:mission-1' && edge.kind === 'containment')
      .map((edge) => edge.target),
    ['response:C1/1:1']
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'response:C1/1:1' &&
        edge.target === 'response:C1/1:2' &&
        edge.kind === 'sequence'
    )
  );
  assert.equal(
    graph.edges.some((edge) => edge.source === 'response:C1/1:2'),
    false
  );
});

test('buildGraph does not create response frames from token-only runtime turn endings', () => {
  const graph = buildGraph({
    ...snapshot,
    threads: [
      {
        ...snapshot.threads[0],
        requestPreview: undefined,
        turnCount: 2,
        turns: [],
        toolEvents: [],
        skillEvents: [],
        runtimeEvents: [
          {
            eventId: 'turn-1',
            sequence: 1,
            timestamp: '2026-05-25T00:00:00.250Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.turn_ended',
            payload: { tokens: { total: 4, cost: 0.01 } },
          },
          {
            eventId: 'turn-2',
            sequence: 2,
            timestamp: '2026-05-25T00:00:00.500Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.turn_ended',
            payload: { tokens: { total: 8, cost: 0.02 } },
          },
          {
            eventId: 'ended',
            sequence: 3,
            timestamp: '2026-05-25T00:00:01.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.session_ended',
            payload: { final_message: 'Done.' },
          },
        ],
      },
    ],
  });

  const frames = graph.nodes.filter((node) => node.type === 'responseFrame');
  const frame = frames[0];

  assert.equal(frames.length, 1);
  assert.equal(frame?.data.kind, 'responseFrame');
  if (frame?.data.kind !== 'responseFrame') throw new Error('missing response frame data');
  assert.equal(frame.data.promptPreview, undefined);
  assert.equal(frame.data.assistantPreview, 'Done.');
  assert.equal(frame.data.turn.assistantMessages, 1);
  assert.equal(frame.data.turn.toolCalls, snapshot.threads[0].toolCallCount);
});

test('buildGraph shows repeated live Pi prompt sessions as sequenced response frames', () => {
  const graph = buildGraph({
    ...snapshot,
    threads: [
      {
        ...snapshot.threads[0],
        requestPreview: undefined,
        turnCount: 2,
        turns: [],
        toolEvents: [],
        skillEvents: [],
        runtimeEvents: [
          {
            eventId: 'started-1',
            sequence: 1,
            timestamp: '2026-05-25T00:00:00.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.session_started',
            payload: { provider: 'anthropic', model_id: 'claude-opus-4-7' },
            metadata: { user_message: 'Investigate the frontend bounding boxes' },
          },
          {
            eventId: 'turn-1',
            sequence: 2,
            timestamp: '2026-05-25T00:00:01.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.turn_ended',
            payload: { tokens: { total: 4, cost: 0.01 } },
          },
          {
            eventId: 'ended-1',
            sequence: 3,
            timestamp: '2026-05-25T00:00:02.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.session_ended',
            payload: {
              final_message: 'First answer.',
              usage_total: { total: 4, cost: 0.01 },
            },
          },
          {
            eventId: 'started-2',
            sequence: 4,
            timestamp: '2026-05-25T00:00:03.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.session_started',
            payload: { provider: 'anthropic', model_id: 'claude-opus-4-7' },
            metadata: { user_message: 'Patch the response frame hitbox' },
          },
          {
            eventId: 'turn-2',
            sequence: 5,
            timestamp: '2026-05-25T00:00:04.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.turn_ended',
            payload: { tokens: { total: 8, cost: 0.02 } },
          },
          {
            eventId: 'ended-2',
            sequence: 6,
            timestamp: '2026-05-25T00:00:05.000Z',
            sessionId: 'session-1',
            threadId: 'thread-1',
            agentId: 'agent-main',
            eventType: 'pi.session_ended',
            payload: {
              final_message: 'Second answer.',
              usage_total: { total: 8, cost: 0.02 },
            },
          },
        ],
      },
    ],
  });

  const frames = graph.nodes.filter((node) => node.type === 'responseFrame');
  const orchestrators = graph.nodes.filter((node) => node.type === 'orchestrator');
  const firstFeed = graph.nodes.find((node) => node.id === 'feed:orchestrator:C1/1:1');
  const secondFeed = graph.nodes.find((node) => node.id === 'feed:orchestrator:C1/1:2');

  assert.equal(frames.length, 2);
  assert.deepEqual(
    orchestrators.map((node) => [node.id, node.parentId]),
    [
      ['orchestrator:C1/1:1', 'response:C1/1:1'],
      ['orchestrator:C1/1:2', 'response:C1/1:2'],
    ]
  );
  assert.deepEqual(
    frames.map((node) => {
      assert.equal(node.data.kind, 'responseFrame');
      return node.data.assistantPreview;
    }),
    ['First answer.', 'Second answer.']
  );
  assert.deepEqual(
    frames.map((node) => {
      assert.equal(node.data.kind, 'responseFrame');
      return node.data.promptPreview;
    }),
    ['Investigate the frontend bounding boxes', 'Patch the response frame hitbox']
  );
  assert.equal(firstFeed?.data.kind, 'traceFeed');
  assert.equal(secondFeed?.data.kind, 'traceFeed');
  if (firstFeed?.data.kind !== 'traceFeed' || secondFeed?.data.kind !== 'traceFeed') {
    throw new Error('missing trace feed data');
  }
  assert.deepEqual(
    firstFeed.data.entries.map((entry) => entry.id),
    ['started-1', 'turn-1', 'ended-1']
  );
  assert.deepEqual(
    secondFeed.data.entries.map((entry) => entry.id),
    ['started-2', 'turn-2', 'ended-2']
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'response:C1/1:1' &&
        edge.target === 'response:C1/1:2' &&
        edge.kind === 'sequence'
    )
  );
});
