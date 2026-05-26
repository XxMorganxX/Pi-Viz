import assert from 'node:assert/strict';
import { test } from 'node:test';

import { traceFeedEntries } from '../src/lib/trace-feed.js';
import type { TraceEvent } from '../src/lib/types.js';

test('thinking trace entries omit trailing blank display lines', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'thinking-1',
      sequence: 1,
      timestamp: '2026-05-25T00:00:00.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.thinking_delta',
      payload: { delta: 'checking context\n' },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });

  assert.equal(entries[0]?.text, 'checking context');
});

test('adjacent thinking deltas render as one thinking block', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'thinking-1',
      sequence: 1,
      timestamp: '2026-05-25T00:00:00.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.thinking_delta',
      payload: { delta: 'checking ' },
    },
    {
      eventId: 'thinking-2',
      sequence: 2,
      timestamp: '2026-05-25T00:00:01.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.thinking_delta',
      payload: { delta: 'context\n' },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.id, 'thinking-1');
  assert.equal(entries[0]?.type, 'thinking');
  assert.equal(entries[0]?.text, 'checking context');
});

test('adjacent text deltas render as one text block', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'text-1',
      sequence: 1,
      timestamp: '2026-05-25T00:00:00.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: 'hello ' },
    },
    {
      eventId: 'text-2',
      sequence: 2,
      timestamp: '2026-05-25T00:00:01.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: 'world\n' },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.id, 'text-1');
  assert.equal(entries[0]?.type, 'runtime');
  assert.equal(entries[0]?.label, 'speaking');
  assert.equal(entries[0]?.text, 'hello world');
});

test('text delta blocks repair missing spaces between adjacent words', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'text-1',
      sequence: 1,
      timestamp: '2026-05-25T00:00:00.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: 'tried' },
    },
    {
      eventId: 'text-2',
      sequence: 2,
      timestamp: '2026-05-25T00:00:01.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: 'I spawning' },
    },
    {
      eventId: 'text-3',
      sequence: 3,
      timestamp: '2026-05-25T00:00:02.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: ", but weather no agent is available" },
    },
    {
      eventId: 'text-4',
      sequence: 4,
      timestamp: '2026-05-25T00:00:03.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: "." },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });

  assert.equal(entries[0]?.label, 'speaking');
  assert.equal(entries[0]?.text, 'tried I spawning, but weather no agent is available.');
});

test('text delta blocks are assembled by trace sequence rather than arrival order', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'text-2',
      sequence: 2,
      timestamp: '2026-05-25T00:00:00.001Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: 'tried spawning' },
    },
    {
      eventId: 'text-1',
      sequence: 1,
      timestamp: '2026-05-25T00:00:00.002Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: 'I ' },
    },
    {
      eventId: 'text-3',
      sequence: 3,
      timestamp: '2026-05-25T00:00:00.003Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.text_delta',
      payload: { delta: ' a weather subagent' },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.id, 'text-1');
  assert.equal(entries[0]?.text, 'I tried spawning a weather subagent');
});

test('runtime lifecycle entries link matching start and end events', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'retry-start',
      sequence: 1,
      timestamp: '2026-05-25T00:00:01.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.auto_retry_started',
      payload: { summary: 'retrying' },
    },
    {
      eventId: 'thinking-between',
      sequence: 2,
      timestamp: '2026-05-25T00:00:02.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.thinking_delta',
      payload: { delta: 'waiting' },
    },
    {
      eventId: 'retry-end',
      sequence: 3,
      timestamp: '2026-05-25T00:00:04.250Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'pi.auto_retry_ended',
      payload: { summary: 'retry complete' },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });
  const start = entries.find((entry) => entry.id === 'retry-start');
  const end = entries.find((entry) => entry.id === 'retry-end');

  assert.equal(start?.lifecycle?.phase, 'start');
  assert.equal(end?.lifecycle?.phase, 'end');
  assert.equal(start?.lifecycle?.pairKey, end?.lifecycle?.pairKey);
  assert.equal(start?.lifecycle?.partnerId, 'retry-end');
  assert.equal(end?.lifecycle?.partnerId, 'retry-start');
  assert.equal(end?.lifecycle?.durationMs, 3250);
});

test('portable semantic events render with useful trace feed labels and previews', () => {
  const runtimeEvents: TraceEvent[] = [
    {
      eventId: 'ctx-1',
      sequence: 1,
      timestamp: '2026-05-25T00:00:01.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'context.part',
      payload: {
        role: 'retrieval',
        label: 'Runtime docs',
        contentPreview: 'A Pi harness can emit optional trace events.',
      },
    },
    {
      eventId: 'state-1',
      sequence: 2,
      timestamp: '2026-05-25T00:00:02.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'state.transition',
      payload: {
        from: 'retrieve',
        to: 'validate',
        reason: 'documents found',
      },
    },
    {
      eventId: 'artifact-1',
      sequence: 3,
      timestamp: '2026-05-25T00:00:03.000Z',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'agent-main',
      eventType: 'artifact.created',
      payload: {
        kind: 'diff',
        label: 'Patch preview',
        uri: 'file:///tmp/patch.diff',
      },
    },
  ];

  const entries = traceFeedEntries({ runtimeEvents });

  assert.equal(entries[0]?.label, 'context: retrieval');
  assert.equal(entries[0]?.text, 'Runtime docs · A Pi harness can emit optional trace events.');
  assert.equal(entries[1]?.label, 'state: retrieve -> validate');
  assert.equal(entries[1]?.text, 'documents found');
  assert.equal(entries[2]?.label, 'artifact: diff');
  assert.equal(entries[2]?.text, 'Patch preview · file:///tmp/patch.diff');
});
