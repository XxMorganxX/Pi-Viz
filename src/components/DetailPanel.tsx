import { agentExecutionView } from '../lib/agent-execution';
import { semanticTraceSummary, type SemanticTraceSummary } from '../lib/semantic-trace';
import type {
  MissionNodeData,
  NodeData,
  OrchestratorNodeData,
  ResponseFrameNodeData,
  SkillEvent,
  SubagentNodeData,
  ToolEvent,
  TraceEvent,
} from '../lib/types';
import { fmtCost, fmtDuration, fmtTimestamp, fmtTokens } from '../lib/format';

interface Props {
  data: NodeData | null;
  onClose: () => void;
}

export default function DetailPanel({ data, onClose }: Props) {
  if (!data) return null;
  return (
    <aside className="detail-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="badge">{data.kind}</span>
        <button onClick={onClose} aria-label="close">×</button>
      </div>
      {data.kind === 'mission' && <MissionDetail data={data} />}
      {data.kind === 'thread' && <ThreadDetail data={data.thread} />}
      {data.kind === 'responseFrame' && <ResponseFrameDetail data={data} />}
      {data.kind === 'orchestrator' && <AgentExecutionDetail data={data} />}
      {data.kind === 'subagent' && <AgentExecutionDetail data={data} />}
      {data.kind === 'traceFeed' && <TraceFeedDetail data={data} />}
      {data.kind === 'milestone' && <MilestoneDetail data={data} />}
    </aside>
  );
}

function MilestoneDetail({ data }: { data: import('../lib/types').MilestoneNodeData }) {
  const m = data.milestone;
  return (
    <>
      <h2 style={{ marginTop: 8 }}>{m.title}</h2>
      <div className="kv">
        <Row k="status" v={m.status} />
        {m.kind && <Row k="kind" v={m.kind} />}
        <Row k="source" v={m.source} />
        {m.progress && <Row k="progress" v={`${m.progress.completed}/${m.progress.total}`} />}
        {m.startedAt && <Row k="started" v={fmtTimestamp(m.startedAt)} />}
        {m.endedAt && <Row k="ended" v={fmtTimestamp(m.endedAt)} />}
        {m.durationMs != null && <Row k="duration" v={fmtDuration(m.durationMs)} />}
      </div>
      {m.detail && (
        <>
          <h3>Detail</h3>
          <div className="prompt-box">{m.detail}</div>
        </>
      )}
    </>
  );
}

function ResponseFrameDetail({ data }: { data: ResponseFrameNodeData }) {
  const { turn, promptPreview, assistantPreview } = data;
  return (
    <>
      <h2 style={{ marginTop: 8 }}>Response {turn.index}</h2>
      <div className="kv">
        <Row k="started" v={fmtTimestamp(turn.startedAt)} />
        <Row k="ended" v={fmtTimestamp(turn.endedAt)} />
        <Row k="duration" v={fmtDuration(turn.durationMs)} />
        <Row k="tools" v={turn.toolCalls} />
        <Row k="subagents" v={turn.subagentCalls} />
        <Row k="tokens" v={fmtTokens(turn.tokens.totalTokens)} />
        <Row k="cost" v={fmtCost(turn.tokens.cost.total)} />
      </div>
      <h3>User prompt</h3>
      <div className="prompt-box">{promptPreview || 'No user prompt preview recorded.'}</div>
      <h3>Assistant response</h3>
      <div className="prompt-box">{assistantPreview || 'No final response preview recorded.'}</div>
    </>
  );
}

function TraceFeedDetail({ data }: { data: import('../lib/types').TraceFeedNodeData }) {
  const byType = data.entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    return counts;
  }, {});
  return (
    <>
      <h2 style={{ marginTop: 8 }}>{data.title}</h2>
      <div className="kv">
        <Row k="agent" v={data.agentLabel} />
        <Row k="entries" v={data.entries.length} />
        <Row k="thinking" v={byType.thinking ?? 0} />
        <Row k="tools" v={byType.tool ?? 0} />
        <Row k="runtime" v={(byType.runtime ?? 0) + (byType.skill ?? 0)} />
      </div>
    </>
  );
}

function hasSemanticTrace(summary: SemanticTraceSummary): boolean {
  return (
    summary.contextParts.length > 0 ||
    summary.contextSnapshots.length > 0 ||
    summary.stateTransitions.length > 0 ||
    summary.spans.length > 0 ||
    summary.artifacts.length > 0
  );
}

function SemanticTraceSections({ events }: { events?: TraceEvent[] }) {
  const summary = semanticTraceSummary(events);
  if (!hasSemanticTrace(summary)) return null;

  return (
    <>
      <h3>Semantic trace</h3>
      <div className="kv">
        <Row k="context" v={summary.contextParts.length} />
        <Row k="snapshots" v={summary.contextSnapshots.length} />
        <Row k="states" v={summary.stateTransitions.length} />
        <Row k="spans" v={summary.spans.length} />
        <Row k="artifacts" v={summary.artifacts.length} />
      </div>

      {summary.stateTransitions.length > 0 && (
        <>
          <h3>State transitions</h3>
          <div className="events">
            {summary.stateTransitions.slice(-8).map((transition) => (
              <div className="event" key={transition.id} title={transition.reason ?? ''}>
                <span className="ts">{shortTs(transition.timestamp)}</span>
                <span className="name">
                  {transition.from ? `${transition.from} -> ` : ''}{transition.to}
                </span>
                {transition.status && <span className={`status ${transition.status}`}>{transition.status}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {summary.contextParts.length > 0 && (
        <>
          <h3>Context parts</h3>
          <div className="events">
            {summary.contextParts.slice(-8).map((part) => (
              <div className="event" key={part.id} title={part.contentPreview ?? ''}>
                <span className="ts">{shortTs(part.timestamp)}</span>
                <span className="name">{part.role}: {part.label}</span>
                {part.tokenCount !== undefined && <span className="status ok">{fmtTokens(part.tokenCount)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {summary.spans.length > 0 && (
        <>
          <h3>Spans</h3>
          <div className="events">
            {summary.spans.slice(-8).map((span) => (
              <div className="event" key={span.id} title={span.outputPreview ?? span.inputPreview ?? span.error ?? ''}>
                <span className="ts">{shortTs(span.startedAt)}</span>
                <span className="name">{span.name}</span>
                <span className={`status ${span.status ?? 'pending'}`}>
                  {span.durationMs !== undefined ? fmtDuration(span.durationMs) : span.status ?? 'pending'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {summary.artifacts.length > 0 && (
        <>
          <h3>Artifacts</h3>
          <div className="events">
            {summary.artifacts.slice(-8).map((artifact) => (
              <div className="event" key={artifact.id} title={artifact.uri ?? artifact.contentPreview ?? ''}>
                <span className="ts">{shortTs(artifact.timestamp)}</span>
                <span className="name">{artifact.kind}: {artifact.label}</span>
                <span className="status ok">created</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </>
  );
}

function PromptBlock({ prompt }: { prompt?: string }) {
  if (!prompt) {
    return <div className="unavailable">No system prompt provided.</div>;
  }
  return <div className="prompt-box">{prompt}</div>;
}

function PillList({ items, emptyMsg, highlighted }: { items?: string[]; emptyMsg: string; highlighted?: Set<string> }) {
  if (!items || items.length === 0) {
    return <div className="unavailable">{emptyMsg}</div>;
  }
  return (
    <div className="pill-list">
      {items.map((item) => (
        <span className={`pill ${highlighted?.has(item) ? 'used' : ''}`} key={item}>{item}</span>
      ))}
    </div>
  );
}

function shortTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour12: false });
}

function ToolEventList({ events }: { events?: ToolEvent[] }) {
  if (!events || events.length === 0) {
    return <div className="unavailable">No tool calls recorded.</div>;
  }
  return (
    <div className="events">
      {events.map((e) => (
        <div className="event" key={e.id} title={e.input ?? ''}>
          <span className="ts">{shortTs(e.timestamp)}</span>
          <span className="name">{e.tool}</span>
          <span className={`status ${e.status ?? 'ok'}`}>{e.status ?? 'ok'}</span>
        </div>
      ))}
    </div>
  );
}

function SkillEventList({ events }: { events?: SkillEvent[] }) {
  if (!events || events.length === 0) {
    return <div className="unavailable">No skill invocations recorded.</div>;
  }
  return (
    <div className="events">
      {events.map((e) => (
        <div className="event" key={e.id} title={e.args ?? ''}>
          <span className="ts">{shortTs(e.timestamp)}</span>
          <span className="name">{e.skill}</span>
          <span className={`status ${e.status ?? 'ok'}`}>{e.status ?? 'ok'}</span>
        </div>
      ))}
    </div>
  );
}

function thinkingDelta(event: TraceEvent): string {
  const delta = event.payload?.delta;
  return typeof delta === 'string' ? delta : '';
}

function ThinkingTrace({ events }: { events?: TraceEvent[] }) {
  const thinkingEvents = (events ?? []).filter((event) => event.eventType === 'pi.thinking_delta');
  if (thinkingEvents.length === 0) return null;

  const text = thinkingEvents.map(thinkingDelta).join('');
  const firstTs = thinkingEvents[0]?.timestamp;
  const lastTs = thinkingEvents[thinkingEvents.length - 1]?.timestamp;

  return (
    <details className="collapsible-trace">
      <summary>
        <span>Thinking trace ({thinkingEvents.length})</span>
        <span className="summary-meta">
          {firstTs ? shortTs(firstTs) : ''}{lastTs && lastTs !== firstTs ? `-${shortTs(lastTs)}` : ''} · click to open
        </span>
      </summary>
      <pre>{text || 'No thinking text recorded.'}</pre>
    </details>
  );
}

function MissionDetail({ data }: { data: MissionNodeData }) {
  const m = data.mission;
  const collapsedThread = data.collapsedThread;
  return (
    <>
      <h2 style={{ marginTop: 8 }}>{m.title || m.id}</h2>
      <div className="kv">
        <Row k="id" v={m.id} />
        <Row k="kind" v={m.kind} />
        <Row k="threads" v={m.threadCount} />
        <Row k="started" v={fmtTimestamp(m.startedAt)} />
        <Row k="ended" v={fmtTimestamp(m.endedAt)} />
        <Row k="duration" v={fmtDuration(m.durationMs)} />
      </div>
      <h3>Tokens</h3>
      <div className="kv">
        <Row k="total" v={fmtTokens(m.tokens?.totalTokens)} />
        <Row k="cost" v={fmtCost(m.tokens?.cost?.total)} />
        <Row k="orchestr." v={fmtCost(m.byRole?.mainLoop?.cost?.total)} />
        <Row k="subagents" v={fmtCost(m.byRole?.subagent?.cost?.total)} />
      </div>
      {collapsedThread && (
        <>
          <h3>Session</h3>
          <div className="kv">
            <Row k="channel" v={collapsedThread.channelId} />
            <Row k="threadTs" v={collapsedThread.threadTs} />
            <Row k="firstTs" v={fmtTimestamp(collapsedThread.firstTs)} />
            <Row k="lastTs" v={fmtTimestamp(collapsedThread.lastTs)} />
            <Row k="turns" v={collapsedThread.turnCount} />
            <Row k="toolCalls" v={collapsedThread.toolCallCount} />
            <Row k="subagents" v={collapsedThread.subagentCallCount} />
          </div>
          {collapsedThread.source?.sessionPath && (
            <>
              <h3>Source</h3>
              <div className="kv">
                <Row k="session" v={<code style={{ fontSize: 11 }}>{collapsedThread.source.sessionPath}</code>} />
                {collapsedThread.source.logPath && (
                  <Row k="log" v={<code style={{ fontSize: 11 }}>{collapsedThread.source.logPath}</code>} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function ThreadDetail({ data: t }: { data: import('../lib/types').Thread }) {
  const tools = Object.entries(t.toolCallsByName ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h2 style={{ marginTop: 8 }}>Session root</h2>
      <div className="kv">
        <Row k="channel" v={t.channelId} />
        <Row k="threadTs" v={t.threadTs} />
        <Row k="mission" v={t.missionId} />
        <Row k="missionKind" v={t.missionKind} />
        <Row k="firstTs" v={fmtTimestamp(t.firstTs)} />
        <Row k="lastTs" v={fmtTimestamp(t.lastTs)} />
        <Row k="duration" v={fmtDuration(t.durationMs)} />
        <Row k="turns" v={t.turnCount} />
        <Row k="toolCalls" v={t.toolCallCount} />
        <Row k="subagents" v={t.subagentCallCount} />
      </div>

      <h3>Tokens</h3>
      <div className="kv">
        <Row k="total" v={fmtTokens(t.tokens?.totalTokens)} />
        <Row k="input" v={fmtTokens(t.tokens?.input)} />
        <Row k="output" v={fmtTokens(t.tokens?.output)} />
        <Row k="cacheRead" v={fmtTokens(t.tokens?.cacheRead)} />
        <Row k="cacheWrite" v={fmtTokens(t.tokens?.cacheWrite)} />
        <Row k="cost" v={fmtCost(t.tokens?.cost?.total)} />
      </div>

      <h3>Tools used ({tools.length})</h3>
      {tools.length === 0 ? (
        <div className="unavailable">None recorded.</div>
      ) : (
        <div>
          {tools.map(([name, count]) => (
            <div className="tool-row" key={name}>
              <span>{name}</span>
              <span className="v">{count}</span>
            </div>
          ))}
        </div>
      )}

      {t.source?.sessionPath && (
        <>
          <h3>Source</h3>
          <div className="kv">
            <Row k="session" v={<code style={{ fontSize: 11 }}>{t.source.sessionPath}</code>} />
            {t.source.logPath && <Row k="log" v={<code style={{ fontSize: 11 }}>{t.source.logPath}</code>} />}
          </div>
        </>
      )}

      <SemanticTraceSections events={t.runtimeEvents} />
    </>
  );
}

function AgentExecutionDetail({ data }: { data: OrchestratorNodeData | SubagentNodeData }) {
  const view = agentExecutionView(data);
  const thinkingEvents = (view.runtimeEvents ?? []).filter((event) => event.eventType === 'pi.thinking_delta');
  return (
    <>
      <h2 style={{ marginTop: 8 }}>{view.name}</h2>
      <div className="kv">
        <Row k="role" v={view.role} />
        {view.model && <Row k="model" v={<code style={{ fontSize: 11 }}>{view.model}</code>} />}
        {view.exitCode !== undefined && <Row k="exitCode" v={view.exitCode} />}
        <Row k="turns" v={view.turns} />
        <Row k="duration" v={fmtDuration(view.durationMs)} />
      </div>

      {view.role === 'subagent' && view.task && (
        <>
          <h3>Task</h3>
          <div className="prompt-box">{view.task}</div>
        </>
      )}

      <h3>System prompt</h3>
      <PromptBlock prompt={view.systemPrompt} />

      <h3>Tools available ({view.availableTools?.length ?? 0})</h3>
      <PillList items={view.availableTools} highlighted={view.usedTools} emptyMsg="No tools registered." />

      <h3>Skills available ({view.availableSkills?.length ?? 0})</h3>
      <PillList items={view.availableSkills} emptyMsg="No skills registered." />

      <h3>Runtime/Trace Summary</h3>
      <div className="kv">
        <Row k="runtime" v={view.runtimeEvents?.length ?? 0} />
        <Row k="thinking" v={thinkingEvents.length} />
        <Row k="tools" v={view.toolEvents?.length ?? 0} />
        <Row k="skills" v={view.skillEvents?.length ?? 0} />
      </div>
      {thinkingEvents.length > 0 && (
        <ThinkingTrace events={view.runtimeEvents} />
      )}

      <SemanticTraceSections events={view.runtimeEvents} />

      <h3>Tool call timeline ({view.toolEvents?.length ?? 0})</h3>
      <ToolEventList events={view.toolEvents} />

      <h3>Skill invocations ({view.skillEvents?.length ?? 0})</h3>
      <SkillEventList events={view.skillEvents} />

      <h3>Token/Cost Stats</h3>
      <div className="kv">
        <Row k="total" v={fmtTokens(view.tokens?.totalTokens)} />
        <Row k="input" v={fmtTokens(view.tokens?.input)} />
        <Row k="output" v={fmtTokens(view.tokens?.output)} />
        <Row k="cacheRead" v={fmtTokens(view.tokens?.cacheRead)} />
        <Row k="cacheWrite" v={fmtTokens(view.tokens?.cacheWrite)} />
        <Row k="cost" v={fmtCost(view.tokens?.cost?.total)} />
      </div>

      {view.sourcePath && (
        <>
          <h3>Source</h3>
          <div className="kv">
            <Row k="path" v={<code style={{ fontSize: 11 }}>{view.sourcePath}</code>} />
          </div>
        </>
      )}
    </>
  );
}
