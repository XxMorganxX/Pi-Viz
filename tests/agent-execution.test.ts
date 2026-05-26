import assert from 'node:assert/strict';
import { test } from 'node:test';

import { agentExecutionView } from '../src/lib/agent-execution.js';
import type { OrchestratorNodeData, SubagentNodeData, Thread } from '../src/lib/types.js';

const thread: Thread = {
  channelId: 'C1',
  threadTs: '1',
  missionId: 'mission-1',
  missionKind: 'linear',
  firstTs: '2026-05-25T00:00:00.000Z',
  lastTs: '2026-05-25T00:00:01.000Z',
  durationMs: 1000,
  turnCount: 2,
  toolCallCount: 1,
  subagentCallCount: 1,
  toolCallsByName: { Read: 1 },
  tokens: { totalTokens: 1234, cost: { total: 0.12 } },
  subagents: [],
  turns: [],
  model: 'anthropic/claude',
  systemPrompt: 'You orchestrate.',
  availableTools: ['Read', 'Write'],
  toolEvents: [
    {
      id: 'tool-1',
      tool: 'Read',
      timestamp: '2026-05-25T00:00:00.500Z',
      status: 'ok',
    },
  ],
};

test('orchestrator agent execution view omits task', () => {
  const view = agentExecutionView({ kind: 'orchestrator', thread } satisfies OrchestratorNodeData);

  assert.equal(view.role, 'orchestrator');
  assert.equal(view.name, 'orchestrator');
  assert.equal(view.task, undefined);
  assert.equal(view.model, 'anthropic/claude');
  assert.equal(view.turns, 2);
  assert.deepEqual(view.usedTools, new Set(['Read']));
});

test('subagent agent execution view includes optional task', () => {
  const view = agentExecutionView({
    kind: 'subagent',
    parentThreadKey: 'C1/1',
    indexInParent: 0,
    subagent: {
      runId: 'worker-1',
      agent: 'worker',
      model: 'openai/gpt-5',
      task: 'Inspect trace events',
      exitCode: 0,
      durationMs: 2000,
      turns: 1,
      tokens: { totalTokens: 456, cost: { total: 0.04 } },
    },
  } satisfies SubagentNodeData);

  assert.equal(view.role, 'subagent');
  assert.equal(view.name, 'worker');
  assert.equal(view.task, 'Inspect trace events');
  assert.equal(view.model, 'openai/gpt-5');
  assert.equal(view.turns, 1);
});
