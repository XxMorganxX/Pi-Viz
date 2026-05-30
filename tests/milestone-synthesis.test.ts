import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  buildSnapshot,
  clearStore,
  recordTraceEvents,
  type Milestone,
  type TraceEvent,
} from '../server/store.js';

let seq = 0;

function event(eventType: string, payload: Record<string, unknown>, overrides: Partial<TraceEvent> = {}): TraceEvent {
  seq += 1;
  return {
    eventId: `event-${seq}`,
    sequence: seq,
    timestamp: `2026-05-25T12:00:${String(seq).padStart(2, '0')}.000Z`,
    sessionId: 'session-1',
    threadId: 'thread-1',
    agentId: 'agent-1',
    eventType,
    payload,
    ...overrides,
  };
}

function milestones(): Milestone[] {
  const snapshot = buildSnapshot();
  return snapshot.threads[0]?.milestones ?? [];
}

beforeEach(() => {
  clearStore();
  seq = 0;
});

test('completed span synthesizes a done milestone with timing', () => {
  recordTraceEvents([
    event('span.started', { spanId: 'm1', name: 'Phase 1', kind: 'phase' }),
    event('span.ended', { spanId: 'm1', status: 'ok' }),
  ]);

  const list = milestones();
  assert.equal(list.length, 1);
  const milestone = list[0];
  assert.equal(milestone.id, 'm1');
  assert.equal(milestone.title, 'Phase 1');
  assert.equal(milestone.kind, 'phase');
  assert.equal(milestone.status, 'done');
  assert.ok(milestone.startedAt);
  assert.ok(milestone.endedAt);
  assert.equal(milestone.durationMs, 1000);
});

test('span started without an end stays active', () => {
  recordTraceEvents([event('span.started', { spanId: 'm1', name: 'Working' })]);

  const list = milestones();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'active');
  assert.equal(list[0].endedAt, undefined);
});

test('errored span end produces a blocked milestone with detail', () => {
  recordTraceEvents([
    event('span.started', { spanId: 'm1', name: 'Risky' }),
    event('span.ended', { spanId: 'm1', status: 'error', error: 'boom' }),
  ]);

  const list = milestones();
  assert.equal(list[0].status, 'blocked');
  assert.equal(list[0].detail, 'boom');
});

test('child spans roll progress up to their parent', () => {
  recordTraceEvents([
    event('span.started', { spanId: 'parent', name: 'Milestone' }),
    event('span.started', { spanId: 'c1', name: 'Task A', parentSpanId: 'parent' }),
    event('span.ended', { spanId: 'c1', status: 'ok' }),
    event('span.started', { spanId: 'c2', name: 'Task B', parentSpanId: 'parent' }),
  ]);

  const list = milestones();
  const parent = list.find((m) => m.id === 'parent');
  assert.ok(parent);
  assert.deepEqual(parent.progress, { completed: 1, total: 2 });
  const child = list.find((m) => m.id === 'c1');
  assert.equal(child?.parentId, 'parent');
});

test('state transition synthesizes a state milestone', () => {
  recordTraceEvents([
    event('state.transition', { to: 'planning', from: 'idle', reason: 'received task' }),
  ]);

  const list = milestones();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'planning');
  assert.equal(list[0].kind, 'state');
  assert.equal(list[0].detail, 'received task');
});

test('re-posting span.started patches in place (idempotent on spanId)', () => {
  recordTraceEvents([event('span.started', { spanId: 'm1', name: 'First' })]);
  recordTraceEvents([event('span.started', { spanId: 'm1', name: 'Renamed' })]);

  const list = milestones();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Renamed');
});
