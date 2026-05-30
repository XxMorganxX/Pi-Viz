import type {
  AgentActivity,
  OrchestratorNodeData,
  SkillEvent,
  SubagentNodeData,
  TokenUsage,
  ToolEvent,
  TraceEvent,
} from './types';

export interface AgentExecutionView {
  role: 'orchestrator' | 'subagent';
  name: string;
  task?: string;
  model?: string;
  exitCode?: number;
  durationMs: number;
  turns: number;
  tokens: TokenUsage;
  systemPrompt?: string;
  availableTools?: string[];
  usedTools?: Set<string>;
  availableSkills?: string[];
  toolEvents?: ToolEvent[];
  skillEvents?: SkillEvent[];
  runtimeEvents?: TraceEvent[];
  activity?: AgentActivity;
  sourcePath?: string | null;
}

export function agentExecutionView(data: OrchestratorNodeData | SubagentNodeData): AgentExecutionView {
  if (data.kind === 'orchestrator') {
    const { thread } = data;
    return {
      role: 'orchestrator',
      name: thread.agentType ? `${thread.agentType} orchestrator` : 'orchestrator',
      model: thread.model,
      durationMs: thread.durationMs,
      turns: thread.turnCount,
      tokens: thread.tokens,
      systemPrompt: thread.systemPrompt,
      availableTools: thread.availableTools,
      usedTools: usedToolNames(thread.toolEvents),
      availableSkills: thread.availableSkills,
      toolEvents: thread.toolEvents,
      skillEvents: thread.skillEvents,
      runtimeEvents: thread.runtimeEvents,
      activity: thread.activity,
      sourcePath: thread.source?.sessionPath,
    };
  }

  const { subagent } = data;
  return {
    role: 'subagent',
    name: subagent.agent,
    task: subagent.task,
    model: subagent.model,
    exitCode: subagent.exitCode,
    durationMs: subagent.durationMs,
    turns: subagent.turns,
    tokens: subagent.tokens,
    systemPrompt: subagent.systemPrompt,
    availableTools: subagent.availableTools,
    usedTools: usedToolNames(subagent.toolEvents),
    availableSkills: subagent.availableSkills,
    toolEvents: subagent.toolEvents,
    skillEvents: subagent.skillEvents,
    runtimeEvents: subagent.runtimeEvents,
    activity: subagent.activity,
    sourcePath: subagent.metaPath,
  };
}

function usedToolNames(events: ToolEvent[] | undefined): Set<string> {
  return new Set((events ?? []).map((event) => event.tool));
}
