import { randomUUID } from 'node:crypto';

export type MissionKind = 'linear' | 'halo' | 'unattributed';
export type AgentRole = 'orchestrator' | 'subagent';
export type EventStatus = 'ok' | 'error' | 'pending';

export interface TraceEvent {
  schemaVersion?: 'pi-trace.v1';
  eventId: string;
  sequence: number;
  timestamp: string;
  sessionId: string;
  threadId: string;
  agentId: string;
  parentAgentId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolEvent {
  id: string;
  tool: string;
  timestamp: string;
  input?: string;
  output?: string;
  inputSchema?: Record<string, unknown>;
  status?: EventStatus;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SkillEvent {
  id: string;
  skill: string;
  timestamp: string;
  args?: string;
  status?: EventStatus;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTokens {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: number;
}

export interface Agent {
  id: string;
  role: AgentRole;
  agentType: string;
  model: string;
  systemPrompt: string;
  availableTools: string[];
  toolInputSchemas: Record<string, Record<string, unknown>>;
  availableSkills: string[];
  parentAgentId?: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  tokens?: AgentTokens;
  toolEvents: ToolEvent[];
  skillEvents: SkillEvent[];
  metadata?: Record<string, unknown>;
}

export interface Thread {
  id: string;
  sessionId: string;
  channelId: string;
  threadTs: string;
  createdAt: string;
  endedAt?: string;
  requestPreview?: string;
  agents: Map<string, Agent>;
  tokens?: AgentTokens;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  createdAt: string;
  endedAt?: string;
  missionId: string;
  missionKind: MissionKind;
  missionTitle: string;
  channelId: string;
  threads: Map<string, Thread>;
  tokens?: AgentTokens;
  metadata?: Record<string, unknown>;
}

interface Snapshot {
  generatedAt: string;
  dataDir?: string;
  threads: SnapshotThread[];
  missions: SnapshotMission[];
  totals: SnapshotTotals;
  source: 'live' | 'file';
}

interface SnapshotMission {
  id: string;
  kind: MissionKind;
  title: string;
  threadKeys: string[];
  threadCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tokens: SnapshotTokenUsage;
  byRole?: { mainLoop?: SnapshotTokenUsage; subagent?: SnapshotTokenUsage };
}

interface SnapshotSubagent {
  runId: string;
  agent: string;
  model: string;
  parentAgentId?: string;
  task?: string;
  exitCode: number;
  durationMs: number;
  turns: number;
  tokens: SnapshotTokenUsage;
  metaPath?: string | null;
  systemPrompt?: string;
  availableTools?: string[];
  toolInputSchemas?: Record<string, Record<string, unknown>>;
  availableSkills?: string[];
  toolEvents?: ToolEvent[];
  skillEvents?: SkillEvent[];
  runtimeEvents?: TraceEvent[];
  metadata?: Record<string, unknown>;
}

interface SnapshotThread {
  channelId: string;
  threadTs: string;
  threadUrl?: string | null;
  source?: { sessionPath?: string; logPath?: string; subagentArtifactsDir?: string | null };
  dataSource?: string;
  missionId: string;
  missionKind: MissionKind;
  firstTs: string;
  lastTs: string;
  durationMs: number;
  turnCount: number;
  toolCallCount: number;
  subagentCallCount: number;
  toolCallsByName: Record<string, number>;
  tokens: SnapshotTokenUsage;
  byRole?: { mainLoop?: SnapshotTokenUsage; subagent?: SnapshotTokenUsage };
  subagents: SnapshotSubagent[];
  turns: unknown[];
  timeSeries?: Record<string, unknown>;
  systemPrompt?: string;
  availableTools?: string[];
  toolInputSchemas?: Record<string, Record<string, unknown>>;
  availableSkills?: string[];
  toolEvents?: ToolEvent[];
  skillEvents?: SkillEvent[];
  agentType?: string;
  model?: string;
  requestPreview?: string;
  runtimeEvents?: TraceEvent[];
}

interface SnapshotTotals {
  threadCount: number;
  missionCount: number;
  turnCount: number;
  toolCallCount: number;
  tokens: SnapshotTokenUsage;
}

interface SnapshotTokenUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens: number;
  cost: { total: number; input?: number; output?: number };
}

const sessions = new Map<string, Session>();
const traceEvents: TraceEvent[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(startedAt: string, endedAt: string | undefined): number {
  if (!endedAt) return Math.max(0, Date.now() - new Date(startedAt).getTime());
  return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
}

export function createSession(input: {
  sessionId?: string;
  missionId?: string;
  missionKind?: MissionKind;
  missionTitle?: string;
  channelId?: string;
  startedAt?: string;
  metadata?: Record<string, unknown>;
}): Session {
  const id = input.sessionId ?? randomUUID();
  const createdAt = input.startedAt ?? nowIso();
  const session: Session = {
    id,
    createdAt,
    missionId: input.missionId ?? `live:${id}`,
    missionKind: input.missionKind ?? 'unattributed',
    missionTitle: input.missionTitle ?? `Live session ${id.slice(0, 8)}`,
    channelId: input.channelId ?? `live:${id.slice(0, 12)}`,
    threads: new Map(),
    metadata: input.metadata,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(): Session[] {
  return [...sessions.values()];
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function completeSession(
  id: string,
  patch: { endedAt?: string; tokens?: AgentTokens; metadata?: Record<string, unknown> }
): Session | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  s.endedAt = patch.endedAt ?? nowIso();
  if (patch.tokens) s.tokens = { ...s.tokens, ...patch.tokens };
  if (patch.metadata) s.metadata = { ...s.metadata, ...patch.metadata };
  return s;
}

export function createThread(
  sessionId: string,
  input: {
    threadId?: string;
    channelId?: string;
    threadTs?: string;
    startedAt?: string;
    requestPreview?: string;
    metadata?: Record<string, unknown>;
  }
): Thread | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  const id = input.threadId ?? randomUUID();
  const createdAt = input.startedAt ?? nowIso();
  const thread: Thread = {
    id,
    sessionId,
    channelId: input.channelId ?? session.channelId,
    threadTs: input.threadTs ?? createdAt,
    createdAt,
    requestPreview: input.requestPreview,
    agents: new Map(),
    metadata: input.metadata,
  };
  session.threads.set(id, thread);
  return thread;
}

export function getThread(sessionId: string, threadId: string): Thread | undefined {
  return sessions.get(sessionId)?.threads.get(threadId);
}

export function completeThread(
  sessionId: string,
  threadId: string,
  patch: { endedAt?: string; tokens?: AgentTokens; metadata?: Record<string, unknown> }
): Thread | undefined {
  const t = sessions.get(sessionId)?.threads.get(threadId);
  if (!t) return undefined;
  t.endedAt = patch.endedAt ?? nowIso();
  if (patch.tokens) t.tokens = { ...t.tokens, ...patch.tokens };
  if (patch.metadata) t.metadata = { ...t.metadata, ...patch.metadata };
  return t;
}

export function upsertAgent(
  sessionId: string,
  threadId: string,
  input: {
    agentId: string;
    role: AgentRole;
    agentType: string;
    model: string;
    systemPrompt?: string;
    tools?: string[];
    toolInputSchemas?: Record<string, Record<string, unknown>>;
    skills?: string[];
    parentAgentId?: string;
    startedAt?: string;
    metadata?: Record<string, unknown>;
  }
): Agent | undefined {
  const thread = sessions.get(sessionId)?.threads.get(threadId);
  if (!thread) return undefined;
  const existing = thread.agents.get(input.agentId);
  const agent: Agent = existing ?? {
    id: input.agentId,
    role: input.role,
    agentType: input.agentType,
    model: input.model,
    systemPrompt: input.systemPrompt ?? '',
    availableTools: input.tools ?? [],
    toolInputSchemas: input.toolInputSchemas ?? {},
    availableSkills: input.skills ?? [],
    parentAgentId: input.parentAgentId,
    startedAt: input.startedAt ?? nowIso(),
    toolEvents: [],
    skillEvents: [],
    metadata: input.metadata,
  };
  if (existing) {
    existing.role = input.role;
    existing.agentType = input.agentType;
    existing.model = input.model;
    if (input.systemPrompt !== undefined) existing.systemPrompt = input.systemPrompt;
    if (input.tools !== undefined) existing.availableTools = input.tools;
    if (input.toolInputSchemas !== undefined) existing.toolInputSchemas = input.toolInputSchemas;
    if (input.skills !== undefined) existing.availableSkills = input.skills;
    if (input.parentAgentId !== undefined) existing.parentAgentId = input.parentAgentId;
    if (input.metadata) existing.metadata = { ...existing.metadata, ...input.metadata };
  }
  thread.agents.set(input.agentId, agent);
  return agent;
}

export function completeAgent(
  sessionId: string,
  threadId: string,
  agentId: string,
  patch: {
    exitCode?: number;
    tokens?: AgentTokens;
    endedAt?: string;
    metadata?: Record<string, unknown>;
  }
): Agent | undefined {
  const a = sessions.get(sessionId)?.threads.get(threadId)?.agents.get(agentId);
  if (!a) return undefined;
  a.endedAt = patch.endedAt ?? nowIso();
  if (patch.exitCode !== undefined) a.exitCode = patch.exitCode;
  if (patch.tokens) a.tokens = { ...a.tokens, ...patch.tokens };
  if (patch.metadata) a.metadata = { ...a.metadata, ...patch.metadata };
  return a;
}

export function recordToolCall(
  sessionId: string,
  threadId: string,
  agentId: string,
  input: {
    tool: string;
    timestamp?: string;
    inputText?: string;
    output?: string;
    inputSchema?: Record<string, unknown>;
    status?: EventStatus;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }
): ToolEvent | undefined {
  const a = sessions.get(sessionId)?.threads.get(threadId)?.agents.get(agentId);
  if (!a) return undefined;
  const evt: ToolEvent = {
    id: randomUUID(),
    tool: input.tool,
    timestamp: input.timestamp ?? nowIso(),
    input: input.inputText?.slice(0, 800),
    output: input.output?.slice(0, 800),
    inputSchema: input.inputSchema,
    status: input.status,
    durationMs: input.durationMs,
    metadata: input.metadata,
  };
  a.toolEvents.push(evt);
  return evt;
}

export function recordSkillInvocation(
  sessionId: string,
  threadId: string,
  agentId: string,
  input: {
    skill: string;
    timestamp?: string;
    args?: string;
    status?: EventStatus;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }
): SkillEvent | undefined {
  const a = sessions.get(sessionId)?.threads.get(threadId)?.agents.get(agentId);
  if (!a) return undefined;
  const evt: SkillEvent = {
    id: randomUUID(),
    skill: input.skill,
    timestamp: input.timestamp ?? nowIso(),
    args: input.args?.slice(0, 800),
    status: input.status,
    durationMs: input.durationMs,
    metadata: input.metadata,
  };
  a.skillEvents.push(evt);
  return evt;
}

export function isEmpty(): boolean {
  return sessions.size === 0;
}

export function clearStore(): void {
  sessions.clear();
  traceEvents.length = 0;
}

export function listTraceEvents(): TraceEvent[] {
  return [...traceEvents];
}

function eventPayloadString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function shortTraceSessionId(sessionId: string): string {
  return /^[a-z]+-[a-z]+$/.test(sessionId) ? sessionId : sessionId.slice(0, 8);
}

function turnCountsByAgent(events: TraceEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.eventType !== 'pi.turn_ended') continue;
    counts.set(event.agentId, (counts.get(event.agentId) ?? 0) + 1);
  }
  for (const event of events) {
    if (event.eventType !== 'pi.session_ended') continue;
    const turnCount = event.payload.turn_count;
    if (typeof turnCount === 'number' && Number.isFinite(turnCount)) {
      counts.set(
        event.agentId,
        Math.max(counts.get(event.agentId) ?? 0, Math.max(0, Math.floor(turnCount)))
      );
    }
  }
  return counts;
}

function toolInputSchemasFromPayload(payload: Record<string, unknown>): Record<string, Record<string, unknown>> | undefined {
  const schemas = payload.tool_schemas;
  if (!schemas || typeof schemas !== 'object' || Array.isArray(schemas)) return undefined;

  return Object.fromEntries(
    Object.entries(schemas).filter((entry): entry is [string, Record<string, unknown>] => {
      const [, schema] = entry;
      return typeof schema === 'object' && schema !== null && !Array.isArray(schema);
    })
  );
}

function systemPromptFromPayload(payload: Record<string, unknown>): string | undefined {
  const value = payload.system_prompt ?? payload.systemPrompt;
  return typeof value === 'string' ? value : undefined;
}

function stringArrayFromValue(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function availableSkillsFromEvent(event: TraceEvent): string[] | undefined {
  return stringArrayFromValue(event.payload.skill_names) ?? stringArrayFromValue(event.metadata?.availableSkills);
}

function traceToolCallId(event: TraceEvent): string | undefined {
  const value = event.payload.tool_call_id ?? event.payload.toolCallId;
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function runtimeEventsForSyntheticSubagent(
  events: TraceEvent[],
  agentId: string,
  toolCallId: string | undefined
): TraceEvent[] {
  if (!toolCallId) return [];
  return events.filter(
    (event) =>
      event.agentId === agentId &&
      (event.eventType === 'pi.tool_call_started' || event.eventType === 'pi.tool_call_ended') &&
      traceToolCallId(event) === toolCallId
  );
}

function ensureTraceEntities(event: TraceEvent): Agent {
  let session = getSession(event.sessionId);
  if (!session) {
    session = createSession({
      sessionId: event.sessionId,
      missionId:
        typeof event.metadata?.missionId === 'string'
          ? event.metadata.missionId
          : `live:${event.sessionId}`,
      missionTitle:
        typeof event.metadata?.missionTitle === 'string'
          ? event.metadata.missionTitle
          : `Pi trace ${shortTraceSessionId(event.sessionId)}`,
      channelId:
        typeof event.metadata?.channelId === 'string'
          ? event.metadata.channelId
          : `trace:${event.sessionId.slice(0, 12)}`,
      startedAt: event.timestamp,
      metadata: event.metadata,
    });
  }

  let thread = getThread(event.sessionId, event.threadId);
  if (!thread) {
    thread = createThread(event.sessionId, {
      threadId: event.threadId,
      startedAt: event.timestamp,
      threadTs: event.threadId,
      requestPreview:
        typeof event.metadata?.requestPreview === 'string'
          ? event.metadata.requestPreview
          : undefined,
      metadata: event.metadata,
    });
  }

  const existing = thread?.agents.get(event.agentId);
  if (existing) return existing;

  const provider = typeof event.payload.provider === 'string' ? event.payload.provider : undefined;
  const modelId =
    typeof event.payload.model_id === 'string'
      ? event.payload.model_id
      : typeof event.payload.modelId === 'string'
        ? event.payload.modelId
        : undefined;
  const model = provider && modelId ? `${provider}/${modelId}` : modelId ?? 'unknown';
  const role: AgentRole = event.parentAgentId ? 'subagent' : 'orchestrator';
  const agent = upsertAgent(event.sessionId, event.threadId, {
    agentId: event.agentId,
    role,
    agentType:
      typeof event.metadata?.agentType === 'string'
        ? event.metadata.agentType
        : role === 'subagent'
          ? 'pi-harness/child'
          : 'pi-harness/standalone',
    model,
    tools: Array.isArray(event.payload.tool_names) ? (event.payload.tool_names as string[]) : [],
    toolInputSchemas: toolInputSchemasFromPayload(event.payload),
    skills: availableSkillsFromEvent(event) ?? [],
    systemPrompt: systemPromptFromPayload(event.payload),
    parentAgentId: event.parentAgentId,
    startedAt: event.timestamp,
    metadata: event.metadata,
  });
  if (!agent) {
    throw new Error('Failed to create trace agent');
  }
  return agent;
}

function adaptTraceEvent(event: TraceEvent): void {
  const agent = ensureTraceEntities(event);
  switch (event.eventType) {
    case 'pi.session_started': {
      const provider = typeof event.payload.provider === 'string' ? event.payload.provider : undefined;
      const modelId =
        typeof event.payload.model_id === 'string'
          ? event.payload.model_id
          : typeof event.payload.modelId === 'string'
            ? event.payload.modelId
            : undefined;
      upsertAgent(event.sessionId, event.threadId, {
        agentId: event.agentId,
        role: event.parentAgentId ? 'subagent' : 'orchestrator',
        agentType:
          typeof event.metadata?.agentType === 'string'
            ? event.metadata.agentType
            : event.parentAgentId
              ? 'pi-harness/child'
              : 'pi-harness/standalone',
        model: provider && modelId ? `${provider}/${modelId}` : modelId ?? agent.model,
        tools: Array.isArray(event.payload.tool_names)
          ? (event.payload.tool_names as string[])
          : agent.availableTools,
        toolInputSchemas: toolInputSchemasFromPayload(event.payload) ?? agent.toolInputSchemas,
        skills: availableSkillsFromEvent(event) ?? agent.availableSkills,
        systemPrompt: systemPromptFromPayload(event.payload) ?? agent.systemPrompt,
        parentAgentId: event.parentAgentId,
        startedAt: event.timestamp,
        metadata: event.metadata,
      });
      break;
    }
    case 'pi.tool_call_ended': {
      const toolName =
        typeof event.payload.tool_name === 'string'
          ? event.payload.tool_name
          : typeof event.payload.tool === 'string'
            ? event.payload.tool
            : 'unknown';
      const toolCallId = traceToolCallId(event);
      recordToolCall(event.sessionId, event.threadId, event.agentId, {
        tool: toolName,
        timestamp: event.timestamp,
        inputText: eventPayloadString(event.payload.args),
        output: eventPayloadString(event.payload.result),
        inputSchema: agent.toolInputSchemas[toolName],
        status: event.payload.is_error ? 'error' : 'ok',
        durationMs:
          typeof event.payload.duration_ms === 'number' ? event.payload.duration_ms : undefined,
        metadata: {
          ...event.metadata,
          traceEventId: event.eventId,
          toolCallId,
        },
      });
      if (toolName === 'subagent' && event.payload.is_error && toolCallId) {
        const syntheticAgentId = `tool:${toolCallId}`;
        const startEvent = traceEvents.find(
          (candidate) =>
            candidate.sessionId === event.sessionId &&
            candidate.threadId === event.threadId &&
            candidate.agentId === event.agentId &&
            candidate.eventType === 'pi.tool_call_started' &&
            traceToolCallId(candidate) === toolCallId
        );
        upsertAgent(event.sessionId, event.threadId, {
          agentId: syntheticAgentId,
          role: 'subagent',
          agentType: 'subagent',
          model: agent.model,
          parentAgentId: event.agentId,
          startedAt: startEvent?.timestamp ?? event.timestamp,
          metadata: {
            ...event.metadata,
            spawnToolCallId: toolCallId,
            spawnStatus: 'failed',
            spawnError: event.payload.result,
          },
        });
        completeAgent(event.sessionId, event.threadId, syntheticAgentId, {
          exitCode: 1,
          endedAt: event.timestamp,
          metadata: {
            ...event.metadata,
            spawnToolCallId: toolCallId,
            spawnStatus: 'failed',
            spawnError: event.payload.result,
          },
        });
      }
      break;
    }
    case 'pi.turn_ended': {
      const tokens = event.payload.tokens as AgentTokens | undefined;
      if (tokens && typeof tokens === 'object') {
        completeAgent(event.sessionId, event.threadId, event.agentId, {
          tokens: {
            input: tokens.input,
            output: tokens.output,
            cacheRead: tokens.cacheRead,
            cacheWrite: tokens.cacheWrite,
            totalTokens: tokens.totalTokens ?? (tokens as { total?: number }).total,
            cost: tokens.cost,
          },
          metadata: event.metadata,
        });
      }
      break;
    }
    case 'pi.session_ended': {
      const usage = event.payload.usage_total as AgentTokens | undefined;
      const tokens =
        usage && typeof usage === 'object'
          ? {
              input: usage.input,
              output: usage.output,
              cacheRead: usage.cacheRead,
              cacheWrite: usage.cacheWrite,
              totalTokens: usage.totalTokens ?? (usage as { total?: number }).total,
              cost: usage.cost,
            }
          : undefined;
      const terminalReason =
        typeof event.payload.terminal_reason === 'string' ? event.payload.terminal_reason : undefined;
      completeAgent(event.sessionId, event.threadId, event.agentId, {
        exitCode: terminalReason === 'error' || terminalReason === 'aborted' ? 1 : 0,
        tokens,
        endedAt: event.timestamp,
        metadata: {
          ...event.metadata,
          terminalReason,
          finalMessage: event.payload.final_message,
        },
      });
      completeThread(event.sessionId, event.threadId, {
        tokens,
        endedAt: event.timestamp,
        metadata: event.metadata,
      });
      completeSession(event.sessionId, {
        tokens,
        endedAt: event.timestamp,
        metadata: event.metadata,
      });
      break;
    }
    default:
      break;
  }
}

export function recordTraceEvents(events: TraceEvent[]): TraceEvent[] {
  for (const event of events) {
    traceEvents.push(event);
    adaptTraceEvent(event);
  }
  return events;
}

/**
 * Build a Snapshot from the in-memory store. One mission per session, one
 * SnapshotThread per Thread (i.e. one per Pi conversation session). The existing
 * frontend already renders missions as containers grouping their threads.
 */
export function buildSnapshot(): Snapshot {
  const threadsOut: SnapshotThread[] = [];
  const missionsById = new Map<string, SnapshotMission>();
  let toolCallCount = 0;
  let turnCount = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const session of sessions.values()) {
    const threadKeys: string[] = [];
    let missionStartedAt = session.createdAt;
    let missionEndedAt = session.endedAt ?? session.createdAt;
    let missionTotalTokens = 0;
    let missionTotalCost = 0;

    for (const thread of session.threads.values()) {
      const allAgents = [...thread.agents.values()];
      const orchestrator = allAgents.find((a) => a.role === 'orchestrator');
      const subagents = allAgents.filter((a) => a.role === 'subagent');

      const toolCallsByName: Record<string, number> = {};
      let threadToolCount = 0;
      let threadTokenTotal = 0;
      let threadCost = 0;
      let firstTs = thread.createdAt;
      let lastTs = thread.endedAt ?? thread.createdAt;
      const threadRuntimeEvents = traceEvents.filter(
        (event) => event.sessionId === session.id && event.threadId === thread.id
      );
      const turnsByAgent = turnCountsByAgent(threadRuntimeEvents);
      const threadTurnCount = orchestrator ? turnsByAgent.get(orchestrator.id) ?? 0 : 0;

      if (orchestrator) {
        for (const ev of orchestrator.toolEvents) {
          toolCallsByName[ev.tool] = (toolCallsByName[ev.tool] ?? 0) + 1;
          threadToolCount++;
          if (ev.timestamp > lastTs) lastTs = ev.timestamp;
        }
        threadTokenTotal += orchestrator.tokens?.totalTokens ?? 0;
        threadCost += orchestrator.tokens?.cost ?? 0;
        if (orchestrator.startedAt < firstTs) firstTs = orchestrator.startedAt;
        if (orchestrator.endedAt && orchestrator.endedAt > lastTs) lastTs = orchestrator.endedAt;
      }

      const snapshotSubagents: SnapshotSubagent[] = subagents.map((sa) => {
        const subToolsCount = sa.toolEvents.length;
        threadToolCount += subToolsCount;
        threadTokenTotal += sa.tokens?.totalTokens ?? 0;
        threadCost += sa.tokens?.cost ?? 0;
        if (sa.endedAt && sa.endedAt > lastTs) lastTs = sa.endedAt;
        for (const ev of sa.toolEvents) {
          toolCallsByName[ev.tool] = (toolCallsByName[ev.tool] ?? 0) + 1;
          if (ev.timestamp > lastTs) lastTs = ev.timestamp;
        }
        toolCallsByName['subagent'] = (toolCallsByName['subagent'] ?? 0) + 1;

        const spawnToolCallId =
          typeof sa.metadata?.spawnToolCallId === 'string' ? sa.metadata.spawnToolCallId : undefined;

        return {
          runId: sa.id,
          agent: sa.agentType,
          model: sa.model,
          parentAgentId: sa.parentAgentId,
          task: typeof sa.metadata?.task === 'string' ? sa.metadata.task : undefined,
          exitCode: sa.exitCode ?? 0,
          durationMs: durationMs(sa.startedAt, sa.endedAt),
          turns: turnsByAgent.get(sa.id) ?? 0,
          tokens: {
            input: sa.tokens?.input,
            output: sa.tokens?.output,
            cacheRead: sa.tokens?.cacheRead,
            cacheWrite: sa.tokens?.cacheWrite,
            totalTokens: sa.tokens?.totalTokens ?? 0,
            cost: { total: sa.tokens?.cost ?? 0 },
          },
          systemPrompt: sa.systemPrompt,
          availableTools: sa.availableTools,
          toolInputSchemas: sa.toolInputSchemas,
          availableSkills: sa.availableSkills,
          toolEvents: sa.toolEvents,
          skillEvents: sa.skillEvents,
          runtimeEvents:
            spawnToolCallId !== undefined
              ? runtimeEventsForSyntheticSubagent(threadRuntimeEvents, sa.parentAgentId ?? '', spawnToolCallId)
              : threadRuntimeEvents.filter((event) => event.agentId === sa.id),
          metadata: sa.metadata,
        };
      });

      const snapshotThread: SnapshotThread = {
        channelId: thread.channelId,
        threadTs: thread.threadTs,
        missionId: session.missionId,
        missionKind: session.missionKind,
        firstTs,
        lastTs,
        durationMs: durationMs(firstTs, thread.endedAt ?? lastTs),
        turnCount: threadTurnCount,
        toolCallCount: threadToolCount,
        subagentCallCount: subagents.length,
        toolCallsByName,
        tokens: {
          input: orchestrator?.tokens?.input,
          output: orchestrator?.tokens?.output,
          totalTokens: threadTokenTotal,
          cost: { total: threadCost },
        },
        subagents: snapshotSubagents,
        turns: [],
        systemPrompt: orchestrator?.systemPrompt,
        availableTools: orchestrator?.availableTools,
        toolInputSchemas: orchestrator?.toolInputSchemas,
        availableSkills: orchestrator?.availableSkills,
        toolEvents: orchestrator?.toolEvents,
        skillEvents: orchestrator?.skillEvents,
        agentType: orchestrator?.agentType,
        model: orchestrator?.model,
        requestPreview: thread.requestPreview,
        runtimeEvents: threadRuntimeEvents,
      };
      threadsOut.push(snapshotThread);
      threadKeys.push(`${thread.channelId}/${thread.threadTs}`);

      toolCallCount += threadToolCount;
      turnCount += threadTurnCount;
      totalTokens += threadTokenTotal;
      totalCost += threadCost;
      missionTotalTokens += threadTokenTotal;
      missionTotalCost += threadCost;
      if (firstTs < missionStartedAt) missionStartedAt = firstTs;
      if (lastTs > missionEndedAt) missionEndedAt = lastTs;
    }

    missionsById.set(session.missionId, {
      id: session.missionId,
      kind: session.missionKind,
      title: session.missionTitle,
      threadKeys,
      threadCount: threadKeys.length,
      startedAt: missionStartedAt,
      endedAt: missionEndedAt,
      durationMs: durationMs(missionStartedAt, missionEndedAt),
      tokens: { totalTokens: missionTotalTokens, cost: { total: missionTotalCost } },
    });
  }

  const missions = [...missionsById.values()];
  return {
    generatedAt: nowIso(),
    threads: threadsOut,
    missions,
    totals: {
      threadCount: threadsOut.length,
      missionCount: missions.length,
      turnCount,
      toolCallCount,
      tokens: { totalTokens, cost: { total: totalCost } },
    },
    source: 'live',
  };
}
