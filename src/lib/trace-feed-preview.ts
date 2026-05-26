import type { TraceFeedEntry, TraceFeedNodeData } from './types';

export type TraceFeedPreviewTone =
  | 'quiet'
  | 'thinking'
  | 'speaking'
  | 'tool'
  | 'runtime'
  | 'ok'
  | 'pending'
  | 'error';

export interface TraceFeedPreviewSummary {
  total: number;
  thinking: number;
  tools: number;
  runtime: number;
  errors: number;
  pending: number;
}

export interface TraceFeedPreviewLane {
  id: 'thinking' | 'tools' | 'runtime';
  title: string;
  count: number;
  tone: TraceFeedPreviewTone;
  empty: string;
  entries: TraceFeedEntry[];
}

export interface TraceFeedPreviewModel {
  title: string;
  agentLabel: string;
  ownerKind: TraceFeedNodeData['ownerKind'];
  attentionTone: TraceFeedPreviewTone;
  summary: TraceFeedPreviewSummary;
  lanes: TraceFeedPreviewLane[];
}

export function buildTraceFeedPreviewModel(data: TraceFeedNodeData): TraceFeedPreviewModel {
  const timeline = data.entries.slice().sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));
  const thinking = timeline.filter((entry) => entry.type === 'thinking');
  const tools = timeline.filter((entry) => entry.type === 'tool');
  const runtime = timeline.filter((entry) => entry.type === 'runtime' || entry.type === 'skill');
  const errors = timeline.filter((entry) => entry.status === 'error').length;
  const pending = timeline.filter((entry) => entry.status === 'pending').length;
  const summary: TraceFeedPreviewSummary = {
    total: timeline.length,
    thinking: thinking.length,
    tools: tools.length,
    runtime: runtime.length,
    errors,
    pending,
  };

  return {
    title: data.title,
    agentLabel: data.agentLabel,
    ownerKind: data.ownerKind,
    attentionTone: errors > 0 ? 'error' : pending > 0 ? 'pending' : timeline.length > 0 ? 'ok' : 'quiet',
    summary,
    lanes: [
      {
        id: 'thinking',
        title: 'Thinking',
        count: thinking.length,
        tone: 'thinking',
        empty: 'No thinking trace.',
        entries: thinking.slice(0, 3),
      },
      {
        id: 'tools',
        title: 'Tools',
        count: tools.length,
        tone: toneForEntries(tools, 'tool'),
        empty: 'No tool calls.',
        entries: tools.slice(0, 3),
      },
      {
        id: 'runtime',
        title: 'Runtime',
        count: runtime.length,
        tone: toneForEntries(runtime, 'runtime'),
        empty: 'No runtime events.',
        entries: runtime.slice(0, 3),
      },
    ],
  };
}

export function toneForTraceEntry(entry: TraceFeedEntry): TraceFeedPreviewTone {
  if (entry.status === 'error') return 'error';
  if (entry.status === 'pending') return 'pending';
  if (entry.status === 'ok') return 'ok';
  if (entry.type === 'thinking') return 'thinking';
  if (entry.label === 'speaking') return 'speaking';
  if (entry.type === 'tool') return 'tool';
  return 'runtime';
}

function toneForEntries(entries: TraceFeedEntry[], fallback: TraceFeedPreviewTone): TraceFeedPreviewTone {
  if (entries.some((entry) => entry.status === 'error')) return 'error';
  if (entries.some((entry) => entry.status === 'pending')) return 'pending';
  return fallback;
}

function timestampMs(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}
