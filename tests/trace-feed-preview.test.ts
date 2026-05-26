import assert from 'node:assert/strict';
import { test } from 'node:test';

import { traceEntryPreviewText } from '../src/lib/trace-entry-display.js';
import { buildTraceFeedPreviewModel, toneForTraceEntry } from '../src/lib/trace-feed-preview.js';
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
      label: 'auto_retry_started',
      timestamp: '2026-05-25T00:00:02.000Z',
      text: 'retrying',
    },
    {
      id: 'skill',
      type: 'skill',
      label: 'ui-ux-pro-max',
      timestamp: '2026-05-25T00:00:04.000Z',
      status: 'ok',
    },
  ],
};

test('trace feed preview model groups semantic lanes and marks attention state', () => {
  const model = buildTraceFeedPreviewModel(traceFeed);

  assert.equal(model.summary.total, 4);
  assert.equal(model.summary.errors, 1);
  assert.equal(model.attentionTone, 'error');
  assert.deepEqual(
    model.lanes.map((lane) => `${lane.id}:${lane.count}:${lane.tone}`),
    ['thinking:1:thinking', 'tools:1:error', 'runtime:2:runtime']
  );
  assert.deepEqual(
    model.lanes.find((lane) => lane.id === 'runtime')?.entries.map((entry) => entry.id),
    ['runtime', 'skill']
  );
});

test('trace feed preview text unwraps tool content envelopes', () => {
  const entry: TraceFeedEntry = {
    id: 'tool-read',
    type: 'tool',
    label: 'read',
    timestamp: '2026-05-25T00:00:05.000Z',
    text: JSON.stringify({
      content: [
        {
          type: 'text',
          text: '# Agentic Pi Standalone Runtime\n\nTypeScript wrapper around Pi.',
        },
      ],
    }),
  };

  assert.equal(
    traceEntryPreviewText(entry),
    'Content · Agentic Pi Standalone Runtime TypeScript wrapper around Pi.'
  );
});

test('speaking entries get a distinct standard preview tone', () => {
  const entry: TraceFeedEntry = {
    id: 'speaking',
    type: 'runtime',
    label: 'speaking',
    timestamp: '2026-05-25T00:00:05.000Z',
    text: 'hello world',
  };

  assert.equal(toneForTraceEntry(entry), 'speaking');
});
