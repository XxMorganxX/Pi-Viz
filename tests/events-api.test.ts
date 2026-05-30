import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { clearStore, type TraceEvent } from '../server/store.js';

let server: Server;
let baseUrl = '';

before(async () => {
  process.env.TRACE_API_TOKEN = 'secret';
  ({ server } = await import('../server/watch-server.js'));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  clearStore();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

function traceEvent(sequence: number, eventType: string, payload: Record<string, unknown>): TraceEvent {
  return {
    eventId: `event-${sequence}`,
    sequence,
    timestamp: `2026-05-25T12:00:0${sequence}.000Z`,
    sessionId: 'session-1',
    threadId: 'thread-1',
    agentId: 'agent-1',
    eventType,
    payload,
  };
}

test('POST /events requires Bearer token when configured', async () => {
  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [] }),
  });

  assert.equal(response.status, 401);
});

test('GET /data requires token when configured', async () => {
  const response = await fetch(`${baseUrl}/data`);

  assert.equal(response.status, 401);
});

test('GET /data does not expose fallback file sessions when live store is empty', async () => {
  const response = await fetch(`${baseUrl}/data`, {
    headers: { authorization: 'Bearer secret' },
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.source, 'live');
  assert.equal(data.threads.length, 0);
  assert.equal(data.missions.length, 0);
});

test('POST /events rejects unsupported trace schema versions', async () => {
  const event = {
    ...traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: [],
    }),
    schemaVersion: 'pi-trace.v999',
  };

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events: [event] }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid trace event at index 0' });
});

test('POST /events answers oversize bodies with 413 instead of resetting the connection', async () => {
  // A single event whose payload pushes the raw body past the 2 MB cap.
  const oversizeEvent = traceEvent(1, 'pi.text_delta', { delta: 'x'.repeat(3 * 1024 * 1024) });

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events: [oversizeEvent] }),
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Request body too large' });
});

test('POST /events accepts batches and adapts known runtime events into /data', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      system_prompt: 'You orchestrate the run.',
      tool_names: ['Read'],
      tool_schemas: {
        Read: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    }),
    traceEvent(2, 'pi.text_delta', { delta: 'hello' }),
    traceEvent(3, 'pi.tool_call_ended', {
      tool_call_id: 'tool-1',
      tool_name: 'Read',
      is_error: false,
      result: { content: [{ type: 'text', text: 'ok' }] },
      duration_ms: 17,
    }),
    traceEvent(4, 'pi.session_ended', {
      final_message: 'done',
      usage_total: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15, cost: 0.02 },
      terminal_reason: 'stop',
    }),
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, accepted: 4 });

  const dataResponse = await fetch(`${baseUrl}/data`, {
    headers: { authorization: 'Bearer secret' },
  });
  const data = await dataResponse.json();
  assert.equal(data.source, 'live');
  assert.equal(data.missions.length, 1);
  assert.equal(data.threads.length, 1);
  assert.equal(data.threads[0].model, 'anthropic/claude-opus-4-7');
  assert.equal(data.threads[0].systemPrompt, 'You orchestrate the run.');
  assert.equal(data.threads[0].toolCallCount, 1);
  assert.equal(data.threads[0].toolCallsByName.Read, 1);
  assert.deepEqual(data.threads[0].toolInputSchemas.Read, {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  });
  assert.equal(data.threads[0].tokens.totalTokens, 15);
  assert.equal(data.threads[0].runtimeEvents.length, 4);
});

test('POST /events appends multiple query batches to one conversation thread timeline', async () => {
  const firstBatch: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: ['Read'],
    }),
    traceEvent(2, 'pi.text_delta', { delta: 'first answer' }),
    traceEvent(3, 'pi.turn_ended', {
      tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3, cost: 0.01 },
      terminal_reason: 'stop',
    }),
  ];
  const secondBatch: TraceEvent[] = [
    traceEvent(4, 'pi.text_delta', { delta: 'follow-up answer' }),
    traceEvent(5, 'pi.tool_call_ended', {
      tool_call_id: 'tool-1',
      tool_name: 'Read',
      is_error: false,
      result: 'ok',
      duration_ms: 12,
    }),
    traceEvent(6, 'pi.turn_ended', {
      tokens: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, total: 5, cost: 0.02 },
      terminal_reason: 'stop',
    }),
  ];

  for (const events of [firstBatch, secondBatch]) {
    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify({ events }),
    });

    assert.equal(response.status, 200);
  }

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();

  assert.equal(data.threads.length, 1);
  assert.equal(data.threads[0].threadTs, 'thread-1');
  assert.equal(data.threads[0].runtimeEvents.length, 6);
  assert.deepEqual(
    data.threads[0].runtimeEvents.map((event: TraceEvent) => event.eventId),
    ['event-1', 'event-2', 'event-3', 'event-4', 'event-5', 'event-6']
  );
  assert.equal(data.threads[0].turnCount, 2);
  assert.equal(data.threads[0].toolCallCount, 1);
});

test('live trace labels preserve short word-word session ids', async () => {
  const event = {
    ...traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: [],
    }),
    sessionId: 'blue-river',
  };

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events: [event] }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();
  assert.equal(data.missions[0].title, 'Pi trace blue-river');
  assert.equal(data.threads[0].channelId, 'trace:blue-river');
});

test('child trace events preserve parentAgentId in snapshot subagents', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: [],
    }),
    {
      ...traceEvent(2, 'pi.session_started', {
        provider: 'anthropic',
        model_id: 'claude-haiku-4-5',
        thinking_level: 'low',
        tool_names: [],
      }),
      agentId: 'agent-child',
      parentAgentId: 'agent-1',
    },
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();
  assert.equal(data.threads[0].subagents.length, 1);
  assert.equal(data.threads[0].subagents[0].runId, 'agent-child');
  assert.equal(data.threads[0].subagents[0].parentAgentId, 'agent-1');
});

test('child trace events preserve metadata agentType for UI-specific subagent nodes', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: [],
    }),
    {
      ...traceEvent(2, 'pi.session_started', {
        provider: 'openai',
        model_id: 'gpt-5-mini',
        tool_names: ['search'],
      }),
      agentId: 'agent-scout',
      parentAgentId: 'agent-1',
      metadata: {
        agentType: 'scout',
        nodeLabel: 'Scout',
        subagentSpecId: 'agent-viz/scout',
      },
    },
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();

  assert.equal(data.threads[0].subagents.length, 1);
  assert.equal(data.threads[0].subagents[0].agent, 'scout');
  assert.equal(data.threads[0].subagents[0].metadata.nodeLabel, 'Scout');
  assert.equal(data.threads[0].subagents[0].metadata.subagentSpecId, 'agent-viz/scout');
});

test('child trace events expose task, system prompt, tools, skills, and runtime feed data', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: ['subagent'],
    }),
    {
      ...traceEvent(2, 'pi.session_started', {
        provider: 'openai',
        model_id: 'gpt-5-mini',
        tool_names: ['read', 'grep'],
        system_prompt: 'You are Scout.',
      }),
      agentId: 'subagent:tool-subagent-1:0',
      parentAgentId: 'agent-1',
      metadata: {
        agentType: 'scout',
        task: 'Inspect parser flow',
        availableSkills: ['systematic-debugging'],
      },
    },
    {
      ...traceEvent(3, 'pi.thinking_delta', { delta: 'checking parse.ts' }),
      agentId: 'subagent:tool-subagent-1:0',
      parentAgentId: 'agent-1',
    },
    {
      ...traceEvent(4, 'pi.session_ended', {
        final_message: 'Parser needs child events.',
        turn_count: 1,
        usage_total: { input: 3, output: 4, cacheRead: 0, cacheWrite: 0, total: 7, cost: 0.02 },
        terminal_reason: 'stop',
      }),
      agentId: 'subagent:tool-subagent-1:0',
      parentAgentId: 'agent-1',
    },
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();
  const subagent = data.threads[0].subagents[0];
  assert.equal(subagent.runId, 'subagent:tool-subagent-1:0');
  assert.equal(subagent.parentAgentId, 'agent-1');
  assert.equal(subagent.agent, 'scout');
  assert.equal(subagent.task, 'Inspect parser flow');
  assert.equal(subagent.systemPrompt, 'You are Scout.');
  assert.deepEqual(subagent.availableTools, ['read', 'grep']);
  assert.deepEqual(subagent.availableSkills, ['systematic-debugging']);
  assert.equal(subagent.turns, 1);
  assert.equal(subagent.tokens.totalTokens, 7);
  assert.deepEqual(
    subagent.runtimeEvents.map((event: TraceEvent) => event.eventType),
    ['pi.session_started', 'pi.thinking_delta', 'pi.session_ended']
  );
});

test('failed subagent tool calls appear as failed snapshot subagents', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: ['subagent'],
    }),
    traceEvent(2, 'pi.tool_call_started', {
      tool_call_id: 'tool-subagent-1',
      tool_name: 'subagent',
      args: {},
    }),
    traceEvent(3, 'pi.tool_call_ended', {
      tool_call_id: 'tool-subagent-1',
      tool_name: 'subagent',
      is_error: true,
      result: 'Invalid parameters. Provide exactly one subagent mode.',
      duration_ms: 20,
    }),
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();

  assert.equal(data.threads[0].subagents.length, 1);
  assert.equal(data.threads[0].subagents[0].runId, 'tool:tool-subagent-1');
  assert.equal(data.threads[0].subagents[0].agent, 'subagent');
  assert.equal(data.threads[0].subagents[0].parentAgentId, 'agent-1');
  assert.equal(data.threads[0].subagents[0].exitCode, 1);
  assert.equal(data.threads[0].subagents[0].metadata.spawnToolCallId, 'tool-subagent-1');
  assert.equal(data.threads[0].subagents[0].runtimeEvents.length, 2);
});

test('live trace snapshots count Pi turns per agent within one thread', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: [],
    }),
    traceEvent(2, 'pi.turn_ended', {
      tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0.01 },
      terminal_reason: 'stop',
    }),
    traceEvent(3, 'pi.turn_ended', {
      tokens: { input: 2, output: 2, cacheRead: 0, cacheWrite: 0, total: 4, cost: 0.02 },
      terminal_reason: 'stop',
    }),
    {
      ...traceEvent(4, 'pi.session_started', {
        provider: 'anthropic',
        model_id: 'claude-haiku-4-5',
        thinking_level: 'low',
        tool_names: [],
      }),
      agentId: 'agent-child',
      parentAgentId: 'agent-1',
    },
    {
      ...traceEvent(5, 'pi.turn_ended', {
        tokens: { input: 3, output: 3, cacheRead: 0, cacheWrite: 0, total: 6, cost: 0.03 },
        terminal_reason: 'stop',
      }),
      agentId: 'agent-child',
      parentAgentId: 'agent-1',
    },
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();

  assert.equal(data.threads[0].turnCount, 2);
  assert.equal(data.threads[0].subagents[0].turns, 1);
  assert.equal(data.totals.turnCount, 2);
});

test('live trace snapshots use final Pi turn_count when individual turn events are missing', async () => {
  const events: TraceEvent[] = [
    traceEvent(1, 'pi.session_started', {
      provider: 'anthropic',
      model_id: 'claude-opus-4-7',
      thinking_level: 'high',
      tool_names: [],
    }),
    traceEvent(2, 'pi.session_ended', {
      final_message: 'done',
      turn_count: 3,
      usage_total: { input: 3, output: 4, cacheRead: 0, cacheWrite: 0, total: 7, cost: 0.02 },
      terminal_reason: 'stop',
    }),
  ];

  const response = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
    body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);

  const data = await (
    await fetch(`${baseUrl}/data`, { headers: { authorization: 'Bearer secret' } })
  ).json();

  assert.equal(data.threads[0].turnCount, 3);
  assert.equal(data.totals.turnCount, 3);
});
