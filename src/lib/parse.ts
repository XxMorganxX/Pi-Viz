import type { GraphEdge, GraphModel, GraphNode, Snapshot, Thread, Turn } from './types';
import { threadKey } from './types';
import { traceFeedEntries } from './trace-feed';

const AGENT_ACCENTS = [
  '#fbf8cc',
  '#fde4cf',
  '#ffcfd2',
  '#f1c0e8',
  '#cfbaf0',
  '#a3c4f3',
  '#90dbf4',
  '#8eecf5',
  '#98f5e1',
  '#b9fbc0',
];

function parentSubagentWouldCycle(
  childRunId: string,
  parentRunId: string,
  subagentByRunId: Map<string, Thread['subagents'][number]>
): boolean {
  const seen = new Set<string>();
  let current: string | undefined = parentRunId;

  while (current) {
    if (current === childRunId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = subagentByRunId.get(current)?.parentAgentId;
  }

  return false;
}

/**
 * Pure transform from a snapshot to a graph model.
 * Positions are set to (0,0); call layout.ts to fill them in.
 */
export function buildGraph(
  snapshot: Snapshot,
  opts: { threadKey?: string | null; collapseSingleThreadRoots?: boolean } = {}
): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const wantThread = opts.threadKey ?? null;
  const threadsByMission = new Map<string, Thread[]>();
  const includedMissionIds = new Set<string>();

  for (const thread of snapshot.threads) {
    if (wantThread && threadKey(thread) !== wantThread) continue;
    const list = threadsByMission.get(thread.missionId) ?? [];
    list.push(thread);
    threadsByMission.set(thread.missionId, list);
    includedMissionIds.add(thread.missionId);
  }

  for (const mission of snapshot.missions) {
    if (wantThread && !includedMissionIds.has(mission.id)) continue;
    const missionId = `mission:${mission.id}`;
    nodes.push({
      id: missionId,
      type: 'mission',
      category: 'missionGroup',
      data: { kind: 'mission', mission },
      position: { x: 0, y: 0 },
    });

    const threads = threadsByMission.get(mission.id) ?? [];
    const collapseSessionRoot = opts.collapseSingleThreadRoots === true && threads.length === 1;
    if (collapseSessionRoot) {
      const node = nodes.find((n) => n.id === missionId);
      if (node?.data.kind === 'mission') {
        node.data = { ...node.data, collapsedThread: threads[0] };
      }
    }

    for (const thread of threads) {
      const tid = `thread:${threadKey(thread)}`;
      if (!collapseSessionRoot) {
        nodes.push({
          id: tid,
          type: 'thread',
          category: 'sessionRoot',
          data: { kind: 'thread', thread },
          position: { x: 0, y: 0 },
          parentId: missionId,
          extent: 'parent',
        });
        edges.push({
          id: `e:${missionId}->${tid}`,
          source: missionId,
          target: tid,
          kind: 'containment',
        });
      }

      const responseFrames = responseFramesForThread(thread);
      const responseParentId = collapseSessionRoot ? missionId : tid;
      responseFrames.forEach((frame, idx) => {
        nodes.push({
          id: frame.id,
          type: 'responseFrame',
          category: 'responseFrame',
          data: {
            kind: 'responseFrame',
            thread,
            turn: frame.turn,
            promptPreview: frame.promptPreview,
            assistantPreview: frame.assistantPreview,
          },
          position: { x: 0, y: 0 },
          parentId: responseParentId,
        });
        if (idx === 0) {
          edges.push({
            id: `e:${responseParentId}->${frame.id}`,
            source: responseParentId,
            target: frame.id,
            kind: 'containment',
          });
        }

        const nextFrame = responseFrames[idx + 1];
        if (nextFrame) {
          edges.push({
            id: `e:${frame.id}->${nextFrame.id}`,
            source: frame.id,
            target: nextFrame.id,
            kind: 'sequence',
          });
        }
      });

      const orchestratorFrames = responseFrames.length > 1 ? responseFrames : [responseFrames[0]];
      const orchestratorIds = orchestratorFrames.map((frame) =>
        responseFrames.length > 1 ? `orchestrator:${threadKey(thread)}:${frame.turn.index}` : `orchestrator:${threadKey(thread)}`
      );

      orchestratorFrames.forEach((frame, idx) => {
        const orchestratorId = orchestratorIds[idx];
        const orchestratorAccent = agentAccentColor(orchestratorId);
        const orchestratorParentId = frame?.id ?? responseParentId;
        const runtimeFrameId = frame?.id;
        const scopedToFrame = responseFrames.length > 1 && frame;
        const frameStart = frame?.turn.startedAt;
        const frameEnd = frame?.turn.endedAt;
        const includeFrameStart =
          idx === 0 || frame?.turn.startedAt !== responseFrames[idx - 1]?.turn.endedAt;
        const runtimeEvents = scopedToFrame
          ? thread.runtimeEvents?.filter(
              (event) =>
                !event.parentAgentId && timestampInFrame(event.timestamp, frameStart, frameEnd, includeFrameStart)
            )
          : thread.runtimeEvents?.filter((event) => !event.parentAgentId);
        const toolEvents = scopedToFrame
          ? thread.toolEvents?.filter((event) => timestampInFrame(event.timestamp, frameStart, frameEnd, includeFrameStart))
          : thread.toolEvents;
        const skillEvents = scopedToFrame
          ? thread.skillEvents?.filter((event) => timestampInFrame(event.timestamp, frameStart, frameEnd, includeFrameStart))
          : thread.skillEvents;
        nodes.push({
          id: orchestratorId,
          type: 'orchestrator',
          category: 'agentExecution',
          data: { kind: 'orchestrator', thread },
          position: { x: 0, y: 0 },
          parentId: orchestratorParentId,
          containerId: runtimeFrameId,
          style: agentAccentStyle(orchestratorAccent),
        });
        if (!runtimeFrameId) {
          edges.push({
            id: `e:${orchestratorParentId}->${orchestratorId}`,
            source: orchestratorParentId,
            target: orchestratorId,
            kind: 'containment',
          });
        }

        const threadFeedId = `feed:${orchestratorId}`;
        nodes.push({
          id: threadFeedId,
          type: 'traceFeed',
          category: 'traceDisplay',
          data: {
            kind: 'traceFeed',
            title: 'Trace feed',
            agentLabel: 'orchestrator',
            ownerKind: 'orchestrator',
            entries: traceFeedEntries({
              runtimeEvents,
              toolEvents,
              skillEvents,
              toolInputSchemas: thread.toolInputSchemas,
            }),
          },
          position: { x: 0, y: 0 },
          parentId: orchestratorId,
          containerId: runtimeFrameId,
          style: agentAccentStyle(orchestratorAccent),
        });
        edges.push({
          id: `e:${orchestratorId}->${threadFeedId}`,
          source: orchestratorId,
          target: threadFeedId,
          kind: 'trace',
          accentColor: richOutlineColor(orchestratorAccent),
        });
      });

      const primaryOrchestratorId = orchestratorIds[orchestratorIds.length - 1];
      const runtimeFrameId = responseFrames[responseFrames.length - 1]?.id;

      const subagentNodeIdByRunId = new Map<string, string>();
      const subagentByRunId = new Map<string, Thread['subagents'][number]>();
      thread.subagents.forEach((sub, idx) => {
        subagentNodeIdByRunId.set(sub.runId, `sub:${threadKey(thread)}:${sub.runId}:${idx}`);
        subagentByRunId.set(sub.runId, sub);
      });

      thread.subagents.forEach((sub, idx) => {
        const sid = `sub:${threadKey(thread)}:${sub.runId}:${idx}`;
        const subagentAccent = agentAccentColor(sid);
        const subagentFrameIndex = responseFrameIndexForTimestamp(responseFrames, subagentStartedAt(sub));
        const subagentFrame = responseFrames[subagentFrameIndex] ?? responseFrames[responseFrames.length - 1];
        const subagentContainerId = subagentFrame?.id ?? runtimeFrameId;
        const parentSubagentId =
          sub.parentAgentId && !parentSubagentWouldCycle(sub.runId, sub.parentAgentId, subagentByRunId)
            ? subagentNodeIdByRunId.get(sub.parentAgentId)
            : undefined;
        const parentAgentNodeId = parentSubagentId ?? orchestratorIds[subagentFrameIndex] ?? primaryOrchestratorId;
        nodes.push({
          id: sid,
          type: 'subagent',
          category: 'agentExecution',
          data: { kind: 'subagent', subagent: sub, parentThreadKey: threadKey(thread), indexInParent: idx },
          position: { x: 0, y: 0 },
          parentId: parentAgentNodeId,
          containerId: subagentContainerId,
          style: agentAccentStyle(subagentAccent),
        });
        edges.push({
          id: `e:${parentAgentNodeId}->${sid}`,
          source: parentAgentNodeId,
          target: sid,
          kind: 'spawn',
          weight: sub.tokens?.totalTokens ?? 0,
          accentColor: richOutlineColor(subagentAccent),
        });

        const subFeedId = `feed:${sid}`;
        nodes.push({
          id: subFeedId,
          type: 'traceFeed',
          category: 'traceDisplay',
          data: {
            kind: 'traceFeed',
            title: 'Trace feed',
            agentLabel: sub.agent,
            ownerKind: 'subagent',
            entries: traceFeedEntries({
              runtimeEvents: sub.runtimeEvents,
              toolEvents: sub.toolEvents,
              skillEvents: sub.skillEvents,
              toolInputSchemas: sub.toolInputSchemas,
            }),
          },
          position: { x: 0, y: 0 },
          parentId: sid,
          containerId: subagentContainerId,
          style: agentAccentStyle(subagentAccent),
        });
        edges.push({
          id: `e:${sid}->${subFeedId}`,
          source: sid,
          target: subFeedId,
          kind: 'trace',
          accentColor: richOutlineColor(subagentAccent),
        });
      });
    }
  }

  return { nodes, edges };
}

interface ResponseFrame {
  id: string;
  turn: Turn;
  promptPreview?: string;
  assistantPreview?: string;
}

function responseFramesForThread(thread: Thread): ResponseFrame[] {
  if (thread.turns.length > 0) {
    return thread.turns.map((turn, idx) => ({
      id: `response:${threadKey(thread)}:${idx + 1}`,
      turn: { ...turn, index: idx + 1 },
      promptPreview: turn.userMessagePreview,
      assistantPreview: turn.assistantTextPreview,
    }));
  }

  const runtimeEvents = (thread.runtimeEvents ?? [])
    .filter((event) => !event.parentAgentId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence || timestampMs(a.timestamp) - timestampMs(b.timestamp));
  const turnEndedEvents = runtimeEvents.filter((event) => event.eventType === 'pi.turn_ended');
  const finalMessage = finalAssistantMessage(runtimeEvents);

  const frameTurnEvents = turnEndedEvents.filter(hasResponseFramePreview);

  if (frameTurnEvents.length > 0) {
    let previousBoundary = thread.firstTs;
    return frameTurnEvents.map((event, idx) => {
      const index = idx + 1;
      const endedAt = event.timestamp;
      const promptStartEvent = promptStartEventForFrame(runtimeEvents, previousBoundary, endedAt, idx === 0);
      const startedAt = promptStartEvent?.timestamp ?? previousBoundary;
      const promptPreview =
        (index === 1 ? thread.requestPreview : undefined) ??
        previewFromEvent(event, 'user_message') ??
        (promptStartEvent ? promptPreviewFromEvent(promptStartEvent) : undefined);
      const turn: Turn = {
        index,
        startedAt,
        endedAt,
        durationMs: Math.max(0, timestampMs(endedAt) - timestampMs(startedAt)),
        userMessagePreview: promptPreview,
        assistantTextPreview:
          previewFromEvent(event, 'assistant_message') ??
          previewFromEvent(event, 'final_message') ??
          (idx === frameTurnEvents.length - 1 ? finalMessage : undefined),
        assistantMessages: 1,
        toolCalls: thread.toolCallCount,
        subagentCalls: thread.subagentCallCount,
        toolCallsByName: thread.toolCallsByName,
        tokens: eventTokens(event.payload.tokens) ?? { totalTokens: 0, cost: { total: 0 } },
      };
      previousBoundary = endedAt;
      return {
        id: `response:${threadKey(thread)}:${index}`,
        turn,
        promptPreview: turn.userMessagePreview,
        assistantPreview: turn.assistantTextPreview,
      };
    });
  }

  const sessionEndedEvents = runtimeEvents.filter(
    (event) => event.eventType === 'pi.session_ended' && previewFromEvent(event, 'final_message') !== undefined
  );

  if (sessionEndedEvents.length > 1) {
    let previousBoundary = thread.firstTs;
    return sessionEndedEvents.map((event, idx) => {
      const index = idx + 1;
      const endedAt = event.timestamp;
      const promptStartEvent = promptStartEventForFrame(runtimeEvents, previousBoundary, endedAt, idx === 0);
      const startedAt = promptStartEvent?.timestamp ?? previousBoundary;
      const promptPreview =
        (index === 1 ? thread.requestPreview : undefined) ??
        (promptStartEvent ? promptPreviewFromEvent(promptStartEvent) : undefined);
      const turn: Turn = {
        index,
        startedAt,
        endedAt,
        durationMs: Math.max(0, timestampMs(endedAt) - timestampMs(startedAt)),
        userMessagePreview: promptPreview,
        assistantTextPreview: previewFromEvent(event, 'final_message'),
        assistantMessages: 1,
        toolCalls: thread.toolCallCount,
        subagentCalls: thread.subagentCallCount,
        toolCallsByName: thread.toolCallsByName,
        tokens: eventTokens(event.payload.usage_total) ?? { totalTokens: 0, cost: { total: 0 } },
      };
      previousBoundary = endedAt;
      return {
        id: `response:${threadKey(thread)}:${index}`,
        turn,
        promptPreview: turn.userMessagePreview,
        assistantPreview: turn.assistantTextPreview,
      };
    });
  }

  const finalEvent = finalAssistantEvent(runtimeEvents);
  const endedAt = finalEvent?.timestamp ?? thread.lastTs;
  const promptStartEvent = promptStartEventForFrame(runtimeEvents, thread.firstTs, endedAt, true);
  const startedAt = promptStartEvent?.timestamp ?? thread.firstTs;
  const turn: Turn = {
    index: 1,
    startedAt,
    endedAt,
    durationMs: Math.max(0, timestampMs(endedAt) - timestampMs(startedAt)),
    userMessagePreview: thread.requestPreview ?? (promptStartEvent ? promptPreviewFromEvent(promptStartEvent) : undefined),
    assistantTextPreview: finalMessage,
    assistantMessages: finalMessage ? 1 : 0,
    toolCalls: thread.toolCallCount,
    subagentCalls: thread.subagentCallCount,
    toolCallsByName: thread.toolCallsByName,
    tokens: thread.tokens,
  };

  return [
    {
      id: `response:${threadKey(thread)}:1`,
      turn,
      promptPreview: turn.userMessagePreview,
      assistantPreview: turn.assistantTextPreview,
    },
  ];
}

function finalAssistantEvent(events: Thread['runtimeEvents']): NonNullable<Thread['runtimeEvents']>[number] | undefined {
  return (events ?? [])
    .slice()
    .reverse()
    .find((event) => event.eventType === 'pi.session_ended');
}

function finalAssistantMessage(events: Thread['runtimeEvents']): string | undefined {
  const finalEvent = finalAssistantEvent(events);
  return finalEvent ? previewFromEvent(finalEvent, 'final_message') : undefined;
}

function hasResponseFramePreview(event: NonNullable<Thread['runtimeEvents']>[number]): boolean {
  return (
    previewFromEvent(event, 'user_message') !== undefined ||
    previewFromEvent(event, 'assistant_message') !== undefined ||
    previewFromEvent(event, 'final_message') !== undefined
  );
}

function previewFromEvent(event: NonNullable<Thread['runtimeEvents']>[number], key: string): string | undefined {
  const value = event.payload[key] ?? event.metadata?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function promptStartEventForFrame(
  events: NonNullable<Thread['runtimeEvents']>,
  startedAt: string,
  endedAt: string,
  includeStart: boolean
): NonNullable<Thread['runtimeEvents']>[number] | undefined {
  return events
    .filter(
      (event) =>
        event.eventType === 'pi.session_started' &&
        timestampInFrame(event.timestamp, startedAt, endedAt, includeStart)
    )
    .slice()
    .reverse()
    .find((event) => promptPreviewFromEvent(event) !== undefined);
}

function promptPreviewFromEvent(event: NonNullable<Thread['runtimeEvents']>[number]): string | undefined {
  return (
    previewFromEvent(event, 'user_message') ??
    previewFromEvent(event, 'requestPreview') ??
    previewFromEvent(event, 'prompt')
  );
}

function eventTokens(value: unknown): Turn['tokens'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const tokens = value as Record<string, unknown>;
  const total = numberValue(tokens.totalTokens) ?? numberValue(tokens.total);
  const costValue = tokens.cost;
  const cost =
    typeof costValue === 'number'
      ? costValue
      : costValue && typeof costValue === 'object' && !Array.isArray(costValue)
        ? numberValue((costValue as Record<string, unknown>).total)
        : undefined;
  return {
    input: numberValue(tokens.input),
    output: numberValue(tokens.output),
    cacheRead: numberValue(tokens.cacheRead),
    cacheWrite: numberValue(tokens.cacheWrite),
    totalTokens: total ?? 0,
    cost: { total: cost ?? 0 },
  };
}

function subagentStartedAt(subagent: Thread['subagents'][number]): string | undefined {
  const events = (subagent.runtimeEvents ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence || timestampMs(a.timestamp) - timestampMs(b.timestamp));
  return (
    events.find((event) => event.eventType === 'pi.session_started')?.timestamp ??
    events[0]?.timestamp
  );
}

function responseFrameIndexForTimestamp(frames: ResponseFrame[], timestamp: string | undefined): number {
  if (!timestamp) return Math.max(0, frames.length - 1);
  const index = frames.findIndex((frame, idx) =>
    timestampInFrame(timestamp, frame.turn.startedAt, frame.turn.endedAt, idx === 0)
  );
  return index >= 0 ? index : Math.max(0, frames.length - 1);
}

function agentAccentStyle(color: string): Record<string, string> {
  const surfaceRgb = hexToRgb(color);
  const outlineRgb = richOutlineRgb(surfaceRgb);
  return {
    '--agent-accent': richOutlineColor(color),
    '--agent-accent-strong': `rgba(${outlineRgb.r}, ${outlineRgb.g}, ${outlineRgb.b}, 0.38)`,
    '--agent-accent-faint': `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 1)`,
    '--agent-accent-surface': `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.18)`,
  };
}

function richOutlineColor(color: string): string {
  const outlineRgb = richOutlineRgb(hexToRgb(color));
  return rgbToHex(outlineRgb);
}

function agentAccentColor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return AGENT_ACCENTS[hash % AGENT_ACCENTS.length];
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${hexChannel(rgb.r)}${hexChannel(rgb.g)}${hexChannel(rgb.b)}`;
}

function hexChannel(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function richOutlineRgb(rgb: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return {
    r: Math.max(0, Math.round(rgb.r * 0.62 - 28)),
    g: Math.max(0, Math.round(rgb.g * 0.62 - 28)),
    b: Math.max(0, Math.round(rgb.b * 0.62 - 28)),
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timestampMs(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

function timestampInFrame(
  timestamp: string,
  startedAt: string | undefined,
  endedAt: string | undefined,
  includeStart: boolean
): boolean {
  if (!startedAt || !endedAt) return true;
  const value = timestampMs(timestamp);
  const start = timestampMs(startedAt);
  const end = timestampMs(endedAt);
  return (includeStart ? value >= start : value > start) && value <= end;
}
