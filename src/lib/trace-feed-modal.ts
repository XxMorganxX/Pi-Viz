import type { TraceFeedEntry, TraceFeedNodeData } from './types';
export { traceEntryDisplayBlocks, traceEntrySchemaText } from './trace-entry-display';
export type { TraceEntryDisplayBlock } from './trace-entry-display';

export interface TraceFeedModalSummary {
  total: number;
  thinking: number;
  tools: number;
  runtime: number;
  errors: number;
  ok: number;
  pending: number;
}

export interface TraceFeedModalSection {
  id: 'thinking' | 'tools' | 'runtime';
  title: string;
  entries: TraceFeedEntry[];
}

export interface TraceFeedModalModel {
  title: string;
  agentLabel: string;
  ownerKind: TraceFeedNodeData['ownerKind'];
  summary: TraceFeedModalSummary;
  timeline: TraceFeedEntry[];
  sections: TraceFeedModalSection[];
}

export function buildTraceFeedModalModel(data: TraceFeedNodeData): TraceFeedModalModel {
  const timeline = data.entries.slice().sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));
  const summary = timeline.reduce<TraceFeedModalSummary>(
    (counts, entry) => {
      counts.total += 1;
      if (entry.type === 'thinking') counts.thinking += 1;
      if (entry.type === 'tool') counts.tools += 1;
      if (entry.type === 'runtime' || entry.type === 'skill') counts.runtime += 1;
      if (entry.status === 'error') counts.errors += 1;
      if (entry.status === 'ok') counts.ok += 1;
      if (entry.status === 'pending') counts.pending += 1;
      return counts;
    },
    { total: 0, thinking: 0, tools: 0, runtime: 0, errors: 0, ok: 0, pending: 0 }
  );

  const sections: TraceFeedModalSection[] = [
    {
      id: 'thinking',
      title: 'Thinking',
      entries: timeline.filter((entry) => entry.type === 'thinking'),
    },
    {
      id: 'tools',
      title: 'Tools',
      entries: timeline.filter((entry) => entry.type === 'tool'),
    },
    {
      id: 'runtime',
      title: 'Runtime & skills',
      entries: timeline.filter((entry) => entry.type === 'runtime' || entry.type === 'skill'),
    },
  ];

  return {
    title: data.title,
    agentLabel: data.agentLabel,
    ownerKind: data.ownerKind,
    summary,
    timeline,
    sections,
  };
}

function timestampMs(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}
