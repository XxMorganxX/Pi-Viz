import type { SkillEvent, ToolEvent, TraceEvent, TraceFeedEntry } from './types';

export function traceFeedEntries({
  runtimeEvents,
  toolEvents,
  skillEvents,
  toolInputSchemas,
}: {
  runtimeEvents?: TraceEvent[];
  toolEvents?: ToolEvent[];
  skillEvents?: SkillEvent[];
  toolInputSchemas?: Record<string, Record<string, unknown>>;
}): TraceFeedEntry[] {
  const entries: TraceFeedEntry[] = [];
  const inputSchemas = {
    ...toolInputSchemasFromRuntimeEvents(runtimeEvents),
    ...(toolInputSchemas ?? {}),
  };
  let currentStreamBlock:
    | {
        entry: TraceFeedEntry;
        eventType: string;
        text: string;
        scopeKey: string;
      }
    | undefined;

  for (const event of orderedRuntimeEvents(runtimeEvents)) {
    if (isStreamDeltaEvent(event)) {
      const delta = event.payload?.delta;
      const scopeKey = streamBlockScopeKey(event);
      if (
        !currentStreamBlock ||
        currentStreamBlock.eventType !== event.eventType ||
        currentStreamBlock.scopeKey !== scopeKey
      ) {
        const entry: TraceFeedEntry = {
          id: event.eventId,
          type: event.eventType === 'pi.thinking_delta' ? 'thinking' : 'runtime',
          label: streamDeltaLabel(event),
          timestamp: event.timestamp,
          text: '',
        };
        entries.push(entry);
        currentStreamBlock = { entry, eventType: event.eventType, text: '', scopeKey };
      }

      currentStreamBlock.text = appendStreamDelta(currentStreamBlock.text, typeof delta === 'string' ? delta : '');
      currentStreamBlock.entry.text = currentStreamBlock.text.trimEnd();
    } else if (event.eventType !== 'pi.tool_call_ended') {
      currentStreamBlock = undefined;
      const semanticEntry = semanticRuntimeEntry(event);
      if (semanticEntry) {
        entries.push(semanticEntry);
        continue;
      }
      entries.push({
        id: event.eventId,
        type: 'runtime',
        label: event.eventType.replace(/^pi\./, ''),
        timestamp: event.timestamp,
        text: eventPayloadText(event.payload),
        lifecycle: lifecycleForRuntimeEvent(event),
      });
    } else {
      currentStreamBlock = undefined;
    }
  }

  for (const event of toolEvents ?? []) {
    entries.push({
      id: event.id,
      type: 'tool',
      label: event.tool,
      timestamp: event.timestamp,
      status: event.status,
      text: event.output ?? event.input,
      inputSchema: event.inputSchema ?? inputSchemas[event.tool],
    });
  }

  for (const event of skillEvents ?? []) {
    entries.push({
      id: event.id,
      type: 'skill',
      label: event.skill,
      timestamp: event.timestamp,
      status: event.status,
      text: event.args,
    });
  }

  return linkLifecycleEntries(entries.sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp)));
}

function timestampMs(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

function orderedRuntimeEvents(runtimeEvents: TraceEvent[] | undefined): TraceEvent[] {
  return (runtimeEvents ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence || timestampMs(a.timestamp) - timestampMs(b.timestamp));
}

function isStreamDeltaEvent(event: TraceEvent): boolean {
  return event.eventType === 'pi.thinking_delta' || event.eventType === 'pi.text_delta';
}

function streamDeltaLabel(event: TraceEvent): string {
  if (event.eventType === 'pi.thinking_delta') return 'thinking';
  if (event.eventType === 'pi.text_delta') return 'speaking';
  return event.eventType.replace(/^pi\./, '');
}

function appendStreamDelta(text: string, delta: string): string {
  if (text === '' || delta === '') return text + delta;
  if (/\s$/.test(text) || /^\s/.test(delta)) return text + delta;
  if (/[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(delta)) return `${text} ${delta}`;
  return text + delta;
}

function streamBlockScopeKey(event: TraceEvent): string {
  return [event.sessionId, event.threadId, event.agentId].join(':');
}

function lifecycleForRuntimeEvent(event: TraceEvent): TraceFeedEntry['lifecycle'] {
  const piMatch = /^pi\.(.+)_(started|ended)$/.exec(event.eventType);
  const spanMatch = /^(span)\.(started|ended)$/.exec(event.eventType);
  const match = piMatch ?? spanMatch;
  if (!match) return undefined;

  const [, family, suffix] = match;
  const correlationId = correlationIdForRuntimeEvent(event.payload);
  return {
    pairKey: [event.sessionId, event.threadId, event.agentId, family, correlationId ?? 'default'].join(':'),
    phase: suffix === 'started' ? 'start' : 'end',
  };
}

function correlationIdForRuntimeEvent(payload: Record<string, unknown>): string | undefined {
  for (const key of ['tool_call_id', 'toolCallId', 'callId', 'runId', 'attemptId', 'id']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function linkLifecycleEntries(entries: TraceFeedEntry[]): TraceFeedEntry[] {
  const openByPairKey = new Map<string, TraceFeedEntry[]>();

  for (const entry of entries) {
    const lifecycle = entry.lifecycle;
    if (!lifecycle) continue;

    if (lifecycle.phase === 'start') {
      const openEntries = openByPairKey.get(lifecycle.pairKey) ?? [];
      openEntries.push(entry);
      openByPairKey.set(lifecycle.pairKey, openEntries);
      continue;
    }

    const openEntries = openByPairKey.get(lifecycle.pairKey);
    const start = openEntries?.shift();
    if (!start?.lifecycle) continue;

    const durationMs = timestampMs(entry.timestamp) - timestampMs(start.timestamp);
    start.lifecycle.partnerId = entry.id;
    lifecycle.partnerId = start.id;
    if (durationMs >= 0) {
      start.lifecycle.durationMs = durationMs;
      lifecycle.durationMs = durationMs;
    }
  }

  return entries;
}

function eventPayloadText(payload: Record<string, unknown>): string {
  const text = payload.delta ?? payload.summary ?? payload.final_message ?? payload.message;
  if (typeof text === 'string') return text;
  return '';
}

function semanticRuntimeEntry(event: TraceEvent): TraceFeedEntry | undefined {
  if (event.eventType === 'context.part') {
    const role = stringPayload(event.payload, 'role');
    const label = stringPayload(event.payload, 'label');
    const preview = stringPayload(event.payload, 'contentPreview') ?? stringPayload(event.payload, 'content');
    return {
      id: event.eventId,
      type: 'runtime',
      label: role ? `context: ${role}` : 'context',
      timestamp: event.timestamp,
      text: joinPreview(label, preview),
    };
  }

  if (event.eventType === 'context.snapshot') {
    const label = stringPayload(event.payload, 'label');
    const totalTokens = numberPayload(event.payload, 'totalTokens');
    return {
      id: event.eventId,
      type: 'runtime',
      label: 'context snapshot',
      timestamp: event.timestamp,
      text: joinPreview(label, totalTokens !== undefined ? `${totalTokens} tokens` : undefined),
    };
  }

  if (event.eventType === 'state.transition') {
    const from = stringPayload(event.payload, 'from');
    const to = stringPayload(event.payload, 'to');
    const reason = stringPayload(event.payload, 'reason');
    return {
      id: event.eventId,
      type: 'runtime',
      label: `state: ${from ? `${from} -> ` : ''}${to ?? 'unknown'}`,
      timestamp: event.timestamp,
      status: eventStatus(event.payload.status),
      text: reason ?? '',
    };
  }

  if (event.eventType === 'span.started' || event.eventType === 'span.ended') {
    const name = stringPayload(event.payload, 'name');
    const kind = stringPayload(event.payload, 'kind');
    const preview =
      stringPayload(event.payload, 'inputPreview') ??
      stringPayload(event.payload, 'outputPreview') ??
      stringPayload(event.payload, 'error');
    return {
      id: event.eventId,
      type: 'runtime',
      label: `span: ${name ?? kind ?? 'execution'}`,
      timestamp: event.timestamp,
      status: eventStatus(event.payload.status),
      text: preview ?? '',
      lifecycle: lifecycleForRuntimeEvent(event),
    };
  }

  if (event.eventType === 'artifact.created') {
    const kind = stringPayload(event.payload, 'kind');
    const label = stringPayload(event.payload, 'label');
    const uri = stringPayload(event.payload, 'uri');
    const preview = stringPayload(event.payload, 'contentPreview') ?? uri;
    return {
      id: event.eventId,
      type: 'runtime',
      label: `artifact: ${kind ?? 'file'}`,
      timestamp: event.timestamp,
      text: joinPreview(label, preview),
    };
  }

  return undefined;
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function numberPayload(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function eventStatus(value: unknown): TraceFeedEntry['status'] {
  return value === 'ok' || value === 'error' || value === 'pending' ? value : undefined;
}

function joinPreview(first: string | undefined, second: string | undefined): string {
  return [first, second].filter((item): item is string => Boolean(item)).join(' · ');
}

function toolInputSchemasFromRuntimeEvents(
  runtimeEvents: TraceEvent[] | undefined
): Record<string, Record<string, unknown>> {
  const schemas: Record<string, Record<string, unknown>> = {};
  for (const event of runtimeEvents ?? []) {
    if (event.eventType !== 'pi.session_started') continue;
    const payloadSchemas = event.payload.tool_schemas;
    if (!payloadSchemas || typeof payloadSchemas !== 'object' || Array.isArray(payloadSchemas)) continue;
    for (const [toolName, schema] of Object.entries(payloadSchemas)) {
      if (typeof schema === 'object' && schema !== null && !Array.isArray(schema)) {
        schemas[toolName] = schema;
      }
    }
  }
  return schemas;
}
