export type MissionKind = 'linear' | 'halo' | 'unattributed';

export interface CostBreakdown {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total: number;
}

export interface TokenUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens: number;
  cost: CostBreakdown;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  threadKeys: string[];
  threadCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tokens: TokenUsage;
  byRole?: { mainLoop?: TokenUsage; subagent?: TokenUsage };
}

export interface ToolEvent {
  id: string;
  tool: string;
  timestamp: string;
  input?: string;
  output?: string;
  inputSchema?: Record<string, unknown>;
  status?: 'ok' | 'error' | 'pending';
  durationMs?: number;
}

export interface SkillEvent {
  id: string;
  skill: string;
  timestamp: string;
  args?: string;
  status?: 'ok' | 'error' | 'pending';
  durationMs?: number;
}

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

export interface Subagent {
  runId: string;
  agent: string;
  model: string;
  parentAgentId?: string;
  task?: string;
  exitCode: number;
  durationMs: number;
  turns: number;
  tokens: TokenUsage;
  metaPath?: string | null;
  /** Live ingest fields. Optional — only present in live-mode snapshots. */
  systemPrompt?: string;
  availableTools?: string[];
  toolInputSchemas?: Record<string, Record<string, unknown>>;
  availableSkills?: string[];
  toolEvents?: ToolEvent[];
  skillEvents?: SkillEvent[];
  runtimeEvents?: TraceEvent[];
  metadata?: Record<string, unknown>;
}

export interface Turn {
  index: number;
  userTs?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  userMessagePreview?: string;
  assistantTextPreview?: string;
  assistantMessages: number;
  toolCalls: number;
  subagentCalls: number;
  toolCallsByName: Record<string, number>;
  tokens: TokenUsage;
}

export interface Thread {
  channelId: string;
  threadTs: string;
  threadUrl?: string | null;
  source?: { sessionPath?: string; logPath?: string; subagentArtifactsDir?: string | null };
  dataSource?: string;
  requestPreview?: string;
  missionId: string;
  missionKind: MissionKind;
  firstTs: string;
  lastTs: string;
  durationMs: number;
  turnCount: number;
  toolCallCount: number;
  subagentCallCount: number;
  toolCallsByName: Record<string, number>;
  tokens: TokenUsage;
  byRole?: { mainLoop?: TokenUsage; subagent?: TokenUsage };
  subagents: Subagent[];
  turns: Turn[];
  /** Live ingest fields describing the orchestrator agent. Only present in live-mode snapshots. */
  systemPrompt?: string;
  availableTools?: string[];
  toolInputSchemas?: Record<string, Record<string, unknown>>;
  availableSkills?: string[];
  toolEvents?: ToolEvent[];
  skillEvents?: SkillEvent[];
  agentType?: string;
  model?: string;
  runtimeEvents?: TraceEvent[];
}

export interface Snapshot {
  generatedAt: string;
  dataDir?: string;
  threads: Thread[];
  missions: Mission[];
  totals: {
    threadCount: number;
    missionCount: number;
    turnCount: number;
    toolCallCount: number;
    tokens: TokenUsage;
  };
}

export interface TraceFeedEntry {
  id: string;
  type: 'thinking' | 'tool' | 'skill' | 'runtime';
  label: string;
  timestamp: string;
  status?: 'ok' | 'error' | 'pending';
  text?: string;
  inputSchema?: Record<string, unknown>;
  lifecycle?: {
    pairKey: string;
    phase: 'start' | 'end';
    partnerId?: string;
    durationMs?: number;
  };
}

export type NodeCategory =
  | 'missionGroup'
  | 'sessionRoot'
  | 'responseFrame'
  | 'agentExecution'
  | 'traceDisplay';

export interface MissionNodeData {
  kind: 'mission';
  mission: Mission;
  collapsedThread?: Thread;
}
export interface ThreadNodeData {
  kind: 'thread';
  thread: Thread;
}
export interface OrchestratorNodeData {
  kind: 'orchestrator';
  thread: Thread;
}
export interface SubagentNodeData {
  kind: 'subagent';
  subagent: Subagent;
  parentThreadKey: string;
  /** Index within parent thread's subagents array (multiple records with same runId may exist). */
  indexInParent: number;
}
export interface TraceFeedNodeData {
  kind: 'traceFeed';
  title: string;
  agentLabel: string;
  ownerKind: 'orchestrator' | 'subagent';
  entries: TraceFeedEntry[];
}
export interface ResponseFrameNodeData {
  kind: 'responseFrame';
  thread: Thread;
  turn: Turn;
  promptPreview?: string;
  assistantPreview?: string;
}
export type NodeKind = 'mission' | 'thread' | 'responseFrame' | 'orchestrator' | 'subagent' | 'traceFeed';
export type NodeData =
  | MissionNodeData
  | ThreadNodeData
  | ResponseFrameNodeData
  | OrchestratorNodeData
  | SubagentNodeData
  | TraceFeedNodeData;

export interface GraphNode {
  id: string;
  type: NodeKind;
  category: NodeCategory;
  data: NodeData;
  position: { x: number; y: number };
  parentId?: string;
  containerId?: string;
  extent?: 'parent';
  style?: Record<string, unknown>;
  width?: number;
  height?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** 'containment' = parent→child, 'sequence' = response→next response, 'spawn' = orchestrator→subagent, 'trace' = agent→feed */
  kind: 'containment' | 'sequence' | 'spawn' | 'trace';
  weight?: number;
  accentColor?: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function threadKey(t: Pick<Thread, 'channelId' | 'threadTs'>): string {
  return `${t.channelId}/${t.threadTs}`;
}

export function providerOf(model: string): 'google' | 'openai' | 'anthropic' | 'other' {
  const m = model.toLowerCase();
  if (m.includes('gemini') || m.startsWith('google/')) return 'google';
  if (m.includes('gpt') || m.startsWith('openai/')) return 'openai';
  if (m.includes('claude') || m.startsWith('anthropic/')) return 'anthropic';
  return 'other';
}
