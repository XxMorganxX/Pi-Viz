import type { TraceEvent } from './types';

export interface SemanticContextPart {
  id: string;
  role: string;
  label: string;
  timestamp: string;
  contentPreview?: string;
  tokenCount?: number;
  sourceIds: string[];
  redacted: boolean;
}

export interface SemanticContextSnapshot {
  id: string;
  label: string;
  timestamp: string;
  partIds: string[];
  totalTokens?: number;
  truncated: boolean;
}

export interface SemanticStateTransition {
  id: string;
  timestamp: string;
  from?: string;
  to: string;
  reason?: string;
  status?: string;
}

export interface SemanticSpan {
  id: string;
  name: string;
  kind?: string;
  parentSpanId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status?: string;
  inputPreview?: string;
  outputPreview?: string;
  error?: string;
}

export interface SemanticArtifact {
  id: string;
  kind: string;
  label: string;
  timestamp: string;
  uri?: string;
  contentPreview?: string;
}

export interface SemanticTraceSummary {
  contextParts: SemanticContextPart[];
  contextSnapshots: SemanticContextSnapshot[];
  stateTransitions: SemanticStateTransition[];
  spans: SemanticSpan[];
  artifacts: SemanticArtifact[];
}

export function semanticTraceSummary(events: TraceEvent[] | undefined): SemanticTraceSummary {
  const summary: SemanticTraceSummary = {
    contextParts: [],
    contextSnapshots: [],
    stateTransitions: [],
    spans: [],
    artifacts: [],
  };
  const spansById = new Map<string, SemanticSpan>();

  for (const event of orderedEvents(events)) {
    if (event.eventType === 'context.part') {
      const role = stringValue(event.payload.role);
      const label = stringValue(event.payload.label);
      if (!role || !label) continue;
      summary.contextParts.push({
        id: stringValue(event.payload.partId) ?? event.eventId,
        role,
        label,
        timestamp: event.timestamp,
        contentPreview: stringValue(event.payload.contentPreview) ?? stringValue(event.payload.content),
        tokenCount: numberValue(event.payload.tokenCount),
        sourceIds: stringArrayValue(event.payload.sourceIds),
        redacted: booleanValue(event.payload.redacted) ?? false,
      });
      continue;
    }

    if (event.eventType === 'context.snapshot') {
      const label = stringValue(event.payload.label);
      if (!label) continue;
      summary.contextSnapshots.push({
        id: stringValue(event.payload.snapshotId) ?? event.eventId,
        label,
        timestamp: event.timestamp,
        partIds: stringArrayValue(event.payload.parts),
        totalTokens: numberValue(event.payload.totalTokens),
        truncated: booleanValue(event.payload.truncated) ?? false,
      });
      continue;
    }

    if (event.eventType === 'state.transition') {
      const to = stringValue(event.payload.to);
      if (!to) continue;
      summary.stateTransitions.push({
        id: event.eventId,
        timestamp: event.timestamp,
        from: stringValue(event.payload.from),
        to,
        reason: stringValue(event.payload.reason),
        status: stringValue(event.payload.status),
      });
      continue;
    }

    if (event.eventType === 'span.started') {
      const spanId = stringValue(event.payload.spanId);
      const name = stringValue(event.payload.name);
      if (!spanId || !name) continue;
      const span: SemanticSpan = {
        id: spanId,
        name,
        kind: stringValue(event.payload.kind),
        parentSpanId: stringValue(event.payload.parentSpanId),
        startedAt: event.timestamp,
        inputPreview: stringValue(event.payload.inputPreview),
      };
      spansById.set(spanId, span);
      summary.spans.push(span);
      continue;
    }

    if (event.eventType === 'span.ended') {
      const spanId = stringValue(event.payload.spanId);
      if (!spanId) continue;
      const existing = spansById.get(spanId);
      if (existing) {
        existing.endedAt = event.timestamp;
        existing.durationMs = durationMs(existing.startedAt, event.timestamp);
        existing.status = stringValue(event.payload.status);
        existing.outputPreview = stringValue(event.payload.outputPreview);
        existing.error = stringValue(event.payload.error);
      }
      continue;
    }

    if (event.eventType === 'artifact.created') {
      const kind = stringValue(event.payload.kind);
      const label = stringValue(event.payload.label);
      if (!kind || !label) continue;
      summary.artifacts.push({
        id: stringValue(event.payload.artifactId) ?? event.eventId,
        kind,
        label,
        timestamp: event.timestamp,
        uri: stringValue(event.payload.uri),
        contentPreview: stringValue(event.payload.contentPreview),
      });
    }
  }

  return summary;
}

function orderedEvents(events: TraceEvent[] | undefined): TraceEvent[] {
  return (events ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence || timestampMs(a.timestamp) - timestampMs(b.timestamp));
}

function timestampMs(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

function durationMs(startedAt: string, endedAt: string): number | undefined {
  const duration = timestampMs(endedAt) - timestampMs(startedAt);
  return duration >= 0 ? duration : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
