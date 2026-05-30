import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { buildSnapshot, clearStore, recordTraceEvents, type TraceEvent } from '../server/store.js';

beforeEach(() => {
  clearStore();
});

function traceEvent(sequence: number, eventType: string, payload: Record<string, unknown>): TraceEvent {
  return {
    eventId: `event-${sequence}`,
    sequence,
    timestamp: `2026-05-30T12:00:0${sequence}.000Z`,
    sessionId: 'session-1',
    threadId: 'thread-1',
    agentId: 'agent-1',
    eventType,
    payload,
  };
}

function orchestrator() {
  return buildSnapshot().threads[0];
}

test('a started tool call appears as pending before it completes', () => {
  recordTraceEvents([
    traceEvent(1, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: ['Read'] }),
    traceEvent(2, 'pi.tool_call_started', { tool_call_id: 'tool-1', tool_name: 'Read', args: { path: 'a.ts' } }),
  ]);

  const tools = orchestrator().toolEvents ?? [];
  assert.equal(tools.length, 1);
  assert.equal(tools[0].tool, 'Read');
  assert.equal(tools[0].status, 'pending');
  assert.equal(orchestrator().toolCallCount, 1);
});

test('an ended tool call upserts the pending event instead of duplicating it', () => {
  recordTraceEvents([
    traceEvent(1, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: ['Read'] }),
    traceEvent(2, 'pi.tool_call_started', { tool_call_id: 'tool-1', tool_name: 'Read', args: { path: 'a.ts' } }),
    traceEvent(3, 'pi.tool_call_ended', {
      tool_call_id: 'tool-1',
      tool_name: 'Read',
      is_error: false,
      result: { content: [{ type: 'text', text: 'file body' }] },
      duration_ms: 12,
    }),
  ]);

  const tools = orchestrator().toolEvents ?? [];
  assert.equal(tools.length, 1, 'start + end collapse to a single tool event');
  assert.equal(tools[0].status, 'ok');
  assert.equal(tools[0].durationMs, 12);
  assert.equal(orchestrator().toolCallCount, 1);
});

test('an ended tool call with no preceding start still records once', () => {
  recordTraceEvents([
    traceEvent(1, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: ['Read'] }),
    traceEvent(2, 'pi.tool_call_ended', { tool_call_id: 'tool-1', tool_name: 'Read', is_error: true, result: 'boom' }),
  ]);

  const tools = orchestrator().toolEvents ?? [];
  assert.equal(tools.length, 1);
  assert.equal(tools[0].status, 'error');
});

test('text and thinking deltas surface live agent activity, cleared at turn end', () => {
  recordTraceEvents([
    traceEvent(1, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: [] }),
    traceEvent(2, 'pi.thinking_delta', { delta: 'considering...' }),
  ]);
  assert.equal(orchestrator().activity?.kind, 'thinking');

  recordTraceEvents([traceEvent(3, 'pi.text_delta', { delta: 'Here is' })]);
  assert.equal(orchestrator().activity?.kind, 'responding');

  recordTraceEvents([
    traceEvent(4, 'pi.turn_ended', {
      tokens: { input: 1, output: 1, total: 2, cost: 0.01 },
      terminal_reason: 'stop',
    }),
  ]);
  assert.equal(orchestrator().activity, undefined, 'activity clears when the turn ends');
});

function childEvent(sequence: number, eventType: string, payload: Record<string, unknown>): TraceEvent {
  return { ...traceEvent(sequence, eventType, payload), agentId: 'subagent:agent-1:0', parentAgentId: 'agent-1' };
}

test('a failed subagent whose child was streamed live does not create a synthetic node', () => {
  recordTraceEvents([
    traceEvent(1, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: ['subagent'] }),
    traceEvent(2, 'pi.tool_call_started', { tool_call_id: 'tool-1', tool_name: 'subagent', args: {} }),
    childEvent(3, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: [] }),
    childEvent(4, 'pi.session_ended', { terminal_reason: 'error', usage_total: { input: 1, output: 1, total: 2, cost: 0 } }),
    traceEvent(5, 'pi.tool_call_ended', {
      tool_call_id: 'tool-1',
      tool_name: 'subagent',
      is_error: true,
      result: { details: { results: [{ tracedLive: true, agentId: 'subagent:agent-1:0', exitCode: 1 }] } },
    }),
  ]);

  const subagents = orchestrator().subagents;
  assert.equal(subagents.length, 1, 'only the live child node exists');
  assert.equal(subagents[0].runId, 'subagent:agent-1:0');
  assert.equal(subagents[0].exitCode, 1);
});

test('a failed subagent with no live child still gets the synthetic fallback node', () => {
  recordTraceEvents([
    traceEvent(1, 'pi.session_started', { provider: 'anthropic', model_id: 'claude-opus-4-8', tool_names: ['subagent'] }),
    traceEvent(2, 'pi.tool_call_started', { tool_call_id: 'tool-1', tool_name: 'subagent', args: {} }),
    traceEvent(3, 'pi.tool_call_ended', {
      tool_call_id: 'tool-1',
      tool_name: 'subagent',
      is_error: true,
      result: 'Invalid parameters. Provide exactly one subagent mode.',
    }),
  ]);

  const subagents = orchestrator().subagents;
  assert.equal(subagents.length, 1);
  assert.equal(subagents[0].runId, 'tool:tool-1');
  assert.equal(subagents[0].exitCode, 1);
});
