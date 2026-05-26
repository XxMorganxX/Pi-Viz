import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTraceFeedModalModel, traceEntryDisplayBlocks } from '../src/lib/trace-feed-modal.js';
import type { TraceFeedEntry, TraceFeedNodeData } from '../src/lib/types.js';

const traceFeed: TraceFeedNodeData = {
  kind: 'traceFeed',
  title: 'Trace feed',
  agentLabel: 'orchestrator',
  ownerKind: 'orchestrator',
  entries: [
    {
      id: 'tool-error',
      type: 'tool',
      label: 'Write',
      timestamp: '2026-05-25T00:00:03.000Z',
      status: 'error',
      text: 'failed to write output',
    },
    {
      id: 'thinking',
      type: 'thinking',
      label: 'thinking',
      timestamp: '2026-05-25T00:00:01.000Z',
      text: 'checking context',
    },
    {
      id: 'runtime',
      type: 'runtime',
      label: 'session_started',
      timestamp: '2026-05-25T00:00:00.000Z',
    },
    {
      id: 'skill',
      type: 'skill',
      label: 'ui-ux-pro-max',
      timestamp: '2026-05-25T00:00:02.000Z',
      status: 'ok',
    },
  ],
};

test('trace feed modal model sorts entries and exposes tracking counts', () => {
  const model = buildTraceFeedModalModel(traceFeed);

  assert.deepEqual(model.timeline.map((entry) => entry.id), [
    'runtime',
    'thinking',
    'skill',
    'tool-error',
  ]);
  assert.equal(model.summary.total, 4);
  assert.equal(model.summary.thinking, 1);
  assert.equal(model.summary.tools, 1);
  assert.equal(model.summary.runtime, 2);
  assert.equal(model.summary.errors, 1);
  assert.equal(model.summary.ok, 1);
  assert.equal(model.summary.pending, 0);
  assert.deepEqual(model.sections.map((section) => `${section.title}:${section.entries.length}`), [
    'Thinking:1',
    'Tools:1',
    'Runtime & skills:2',
  ]);
});

test('trace feed modal display blocks unwrap tool content text', () => {
  const entry: TraceFeedEntry = {
    id: 'tool-read',
    type: 'tool',
    label: 'read',
    timestamp: '2026-05-25T00:00:04.000Z',
    status: 'ok',
    text: JSON.stringify({
      content: [
        {
          type: 'text',
          text: '# Agentic Pi Standalone Runtime\n\nTypeScript wrapper around Pi.',
        },
      ],
    }),
  };

  assert.deepEqual(traceEntryDisplayBlocks(entry), [
    {
      id: 'content-0',
      title: 'Content',
      text: '# Agentic Pi Standalone Runtime\n\nTypeScript wrapper around Pi.',
      tone: 'content',
      defaultOpen: false,
      collapsedSummary: 'Show Content',
      expandedSummary: 'Hide Content',
    },
  ]);
});

test('trace feed modal display blocks include tool input schema before output', () => {
  const entry: TraceFeedEntry = {
    id: 'tool-read',
    type: 'tool',
    label: 'read',
    timestamp: '2026-05-25T00:00:04.000Z',
    status: 'ok',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    text: 'ok',
  };

  assert.deepEqual(traceEntryDisplayBlocks(entry), [
    {
      id: 'input-schema',
      title: 'Input schema',
      text: JSON.stringify(entry.inputSchema, null, 2),
      tone: 'json',
      defaultOpen: false,
      collapsedSummary: 'Show Input schema',
      expandedSummary: 'Hide Input schema',
    },
    {
      id: 'text',
      title: 'Output',
      text: 'ok',
      tone: 'plain',
      defaultOpen: false,
      collapsedSummary: 'Show Output',
      expandedSummary: 'Hide Output',
    },
  ]);
});
