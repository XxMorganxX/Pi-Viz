import assert from 'node:assert/strict';
import { test } from 'node:test';

import { semanticTraceSummary } from '../src/lib/semantic-trace.js';
import type { TraceEvent } from '../src/lib/types.js';

function event(sequence: number, eventType: string, payload: Record<string, unknown>): TraceEvent {
  return {
    eventId: `evt-${sequence}`,
    sequence,
    timestamp: `2026-05-26T12:00:0${sequence}.000Z`,
    sessionId: 'session-1',
    threadId: 'thread-1',
    agentId: 'agent-1',
    eventType,
    payload,
  };
}

test('semanticTraceSummary derives optional plug-and-play context state span and artifact data', () => {
  const events: TraceEvent[] = [
    event(1, 'span.started', {
      spanId: 'span-1',
      name: 'Retrieve docs',
      kind: 'retrieval',
      inputPreview: 'runtime docs',
    }),
    event(2, 'context.part', {
      partId: 'ctx-1',
      role: 'retrieval',
      label: 'Runtime docs',
      contentPreview: 'A Pi harness can emit optional trace events.',
      tokenCount: 42,
      sourceIds: ['doc-1'],
    }),
    event(3, 'context.snapshot', {
      snapshotId: 'snap-1',
      label: 'Before model call',
      parts: ['ctx-1'],
      totalTokens: 1000,
      truncated: false,
    }),
    event(4, 'state.transition', {
      from: 'retrieve',
      to: 'validate',
      reason: 'documents found',
      status: 'ok',
    }),
    event(5, 'artifact.created', {
      artifactId: 'diff-1',
      kind: 'diff',
      label: 'Patch preview',
      uri: 'file:///tmp/patch.diff',
    }),
    event(6, 'span.ended', {
      spanId: 'span-1',
      status: 'ok',
      outputPreview: 'Found relevant docs.',
    }),
  ];

  const summary = semanticTraceSummary(events);

  assert.equal(summary.contextParts.length, 1);
  assert.equal(summary.contextParts[0].role, 'retrieval');
  assert.equal(summary.contextParts[0].tokenCount, 42);
  assert.equal(summary.contextSnapshots.length, 1);
  assert.equal(summary.contextSnapshots[0].totalTokens, 1000);
  assert.equal(summary.stateTransitions.length, 1);
  assert.equal(summary.stateTransitions[0].from, 'retrieve');
  assert.equal(summary.stateTransitions[0].to, 'validate');
  assert.equal(summary.artifacts.length, 1);
  assert.equal(summary.artifacts[0].kind, 'diff');
  assert.equal(summary.spans.length, 1);
  assert.equal(summary.spans[0].durationMs, 5000);
  assert.equal(summary.spans[0].status, 'ok');
  assert.equal(summary.spans[0].outputPreview, 'Found relevant docs.');
});
