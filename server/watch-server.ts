import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { tryServeStatic } from './static-server.js';
import {
  buildSnapshot,
  completeAgent,
  completeSession,
  completeThread,
  createSession,
  createThread,
  deleteSession,
  getSession,
  listSessions,
  recordSkillInvocation,
  recordToolCall,
  recordTraceEvents,
  upsertAgent,
  type AgentRole,
  type MissionKind,
  type TraceEvent,
} from './store';

const PORT = Number(process.env.PORT ?? 5284);
const TRACE_API_TOKEN = process.env.TRACE_API_TOKEN;
const STATIC_DIR = process.env.AGENT_VIZ_STATIC_DIR;
const SUPPORTED_TRACE_SCHEMA_VERSION = 'pi-trace.v1';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface SseClient {
  id: number;
  write: (line: string) => void;
}
const clients = new Set<SseClient>();
let nextClientId = 1;

function broadcast(eventName: string, payload: unknown) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(data);
}

let snapshotDebounce: NodeJS.Timeout | null = null;
function notifySnapshot(reason: string) {
  if (snapshotDebounce) clearTimeout(snapshotDebounce);
  snapshotDebounce = setTimeout(() => {
    broadcast('snapshot', { generatedAt: new Date().toISOString(), reason });
  }, 80);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolveBody({});
      try {
        resolveBody(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function requireString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method ?? 'GET';

  try {
    // --- SSE / data ---
    if (path === '/data' && method === 'GET') {
      if (!hasValidTraceAuth(req, url)) {
        return sendJson(res, 401, { error: 'Missing or invalid trace access token' });
      }
      return await handleGetData(res);
    }
    if (path === '/stream' && method === 'GET') {
      if (!hasValidTraceAuth(req, url)) {
        return sendJson(res, 401, { error: 'Missing or invalid trace access token' });
      }
      return handleStream(req, res);
    }
    if (path === '/health' && method === 'GET') return handleHealth(res);
    if (path === '/events' && method === 'POST') return await handleTraceEvents(req, res);

    // --- Session routes ---
    if (path === '/sessions' && method === 'POST') return await handleCreateSession(req, res);
    if (path === '/sessions' && method === 'GET') return handleListSessions(res);

    const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') return handleGetSession(res, sessionMatch[1]);
    if (sessionMatch && method === 'DELETE') return handleDeleteSession(res, sessionMatch[1]);

    const completeSessionMatch = path.match(/^\/sessions\/([^/]+)\/complete$/);
    if (completeSessionMatch && method === 'POST')
      return await handleCompleteSession(req, res, completeSessionMatch[1]);

    // --- Thread routes ---
    const threadsMatch = path.match(/^\/sessions\/([^/]+)\/threads$/);
    if (threadsMatch && method === 'POST') return await handleCreateThread(req, res, threadsMatch[1]);

    const threadCompleteMatch = path.match(/^\/sessions\/([^/]+)\/threads\/([^/]+)\/complete$/);
    if (threadCompleteMatch && method === 'POST')
      return await handleCompleteThread(req, res, threadCompleteMatch[1], threadCompleteMatch[2]);

    // --- Agent routes ---
    const agentsMatch = path.match(/^\/sessions\/([^/]+)\/threads\/([^/]+)\/agents$/);
    if (agentsMatch && method === 'POST')
      return await handleUpsertAgent(req, res, agentsMatch[1], agentsMatch[2]);

    const agentCompleteMatch = path.match(
      /^\/sessions\/([^/]+)\/threads\/([^/]+)\/agents\/([^/]+)\/complete$/
    );
    if (agentCompleteMatch && method === 'POST')
      return await handleCompleteAgent(
        req,
        res,
        agentCompleteMatch[1],
        agentCompleteMatch[2],
        agentCompleteMatch[3]
      );

    const toolCallMatch = path.match(
      /^\/sessions\/([^/]+)\/threads\/([^/]+)\/agents\/([^/]+)\/tool-calls$/
    );
    if (toolCallMatch && method === 'POST')
      return await handleToolCall(
        req,
        res,
        toolCallMatch[1],
        toolCallMatch[2],
        toolCallMatch[3]
      );

    const skillMatch = path.match(
      /^\/sessions\/([^/]+)\/threads\/([^/]+)\/agents\/([^/]+)\/skill-invocations$/
    );
    if (skillMatch && method === 'POST')
      return await handleSkillInvocation(req, res, skillMatch[1], skillMatch[2], skillMatch[3]);

    if (STATIC_DIR && !url.pathname.startsWith('/api') && (await tryServeStatic(req, res, STATIC_DIR))) {
      return;
    }

    sendJson(res, 404, { error: 'Not found', path, method });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { error: msg });
  }
});

// --- handlers ---

async function handleGetData(res: ServerResponse) {
  return sendJson(res, 200, buildSnapshot());
}

function handleStream(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const id = nextClientId++;
  const client: SseClient = { id, write: (line) => res.write(line) };
  clients.add(client);
  res.write(
    `event: hello\ndata: ${JSON.stringify({ liveSessions: listSessions().length })}\n\n`
  );
  const ping = setInterval(() => res.write(`: ping\n\n`), 30_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

function handleHealth(res: ServerResponse) {
  sendJson(res, 200, {
    ok: true,
    clients: clients.size,
    liveSessions: listSessions().length,
  });
}

function hasValidTraceAuth(req: IncomingMessage, url?: URL): boolean {
  if (!TRACE_API_TOKEN) return true;
  return (
    req.headers.authorization === `Bearer ${TRACE_API_TOKEN}` ||
    url?.searchParams.get('access_token') === TRACE_API_TOKEN
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTraceEvent(value: unknown): value is TraceEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.eventId === 'string' &&
    typeof value.sequence === 'number' &&
    typeof value.timestamp === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.threadId === 'string' &&
    typeof value.agentId === 'string' &&
    (value.schemaVersion === undefined || value.schemaVersion === SUPPORTED_TRACE_SCHEMA_VERSION) &&
    (value.parentAgentId === undefined || typeof value.parentAgentId === 'string') &&
    typeof value.eventType === 'string' &&
    isRecord(value.payload) &&
    (value.metadata === undefined || isRecord(value.metadata))
  );
}

async function handleTraceEvents(req: IncomingMessage, res: ServerResponse) {
  if (!hasValidTraceAuth(req)) {
    return sendJson(res, 401, { error: 'Missing or invalid trace access token' });
  }
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  if (!Array.isArray(body.events)) {
    return sendJson(res, 400, { error: 'Missing required field: events[]' });
  }
  const invalidIndex = body.events.findIndex((event) => !isTraceEvent(event));
  if (invalidIndex >= 0) {
    return sendJson(res, 400, { error: `Invalid trace event at index ${invalidIndex}` });
  }
  const events = recordTraceEvents(body.events as TraceEvent[]);
  notifySnapshot('trace.events');
  broadcast('trace.events', { count: events.length });
  sendJson(res, 200, { ok: true, accepted: events.length });
}

async function handleCreateSession(req: IncomingMessage, res: ServerResponse) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const session = createSession({
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    missionId: typeof body.missionId === 'string' ? body.missionId : undefined,
    missionKind: (body.missionKind as MissionKind | undefined) ?? undefined,
    missionTitle: typeof body.missionTitle === 'string' ? body.missionTitle : undefined,
    channelId: typeof body.channelId === 'string' ? body.channelId : undefined,
    startedAt: typeof body.startedAt === 'string' ? body.startedAt : undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  notifySnapshot('session.created');
  broadcast('session.created', { sessionId: session.id, missionId: session.missionId });
  sendJson(res, 200, {
    sessionId: session.id,
    missionId: session.missionId,
    createdAt: session.createdAt,
  });
}

function handleListSessions(res: ServerResponse) {
  const summary = listSessions().map((s) => ({
    id: s.id,
    missionId: s.missionId,
    missionTitle: s.missionTitle,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    threadCount: s.threads.size,
  }));
  sendJson(res, 200, summary);
}

function handleGetSession(res: ServerResponse, id: string) {
  const s = getSession(id);
  if (!s) return sendJson(res, 404, { error: 'Session not found' });
  sendJson(res, 200, {
    ...s,
    threads: [...s.threads.values()].map((t) => ({
      ...t,
      agents: [...t.agents.values()],
    })),
  });
}

function handleDeleteSession(res: ServerResponse, id: string) {
  const ok = deleteSession(id);
  if (!ok) return sendJson(res, 404, { error: 'Session not found' });
  notifySnapshot('session.deleted');
  broadcast('session.deleted', { sessionId: id });
  sendJson(res, 200, { ok: true });
}

async function handleCompleteSession(req: IncomingMessage, res: ServerResponse, id: string) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const s = completeSession(id, {
    endedAt: typeof body.endedAt === 'string' ? body.endedAt : undefined,
    tokens: (body.tokens as Record<string, number> | undefined) ?? undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!s) return sendJson(res, 404, { error: 'Session not found' });
  notifySnapshot('session.completed');
  broadcast('session.completed', { sessionId: id });
  sendJson(res, 200, { ok: true });
}

async function handleCreateThread(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const thread = createThread(sessionId, {
    threadId: typeof body.threadId === 'string' ? body.threadId : undefined,
    channelId: typeof body.channelId === 'string' ? body.channelId : undefined,
    threadTs: typeof body.threadTs === 'string' ? body.threadTs : undefined,
    startedAt: typeof body.startedAt === 'string' ? body.startedAt : undefined,
    requestPreview: typeof body.requestPreview === 'string' ? body.requestPreview : undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!thread) return sendJson(res, 404, { error: 'Session not found' });
  notifySnapshot('thread.created');
  broadcast('thread.created', { sessionId, threadId: thread.id });
  sendJson(res, 200, {
    threadId: thread.id,
    channelId: thread.channelId,
    threadTs: thread.threadTs,
    createdAt: thread.createdAt,
  });
}

async function handleCompleteThread(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  threadId: string
) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const t = completeThread(sessionId, threadId, {
    endedAt: typeof body.endedAt === 'string' ? body.endedAt : undefined,
    tokens: (body.tokens as Record<string, number> | undefined) ?? undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!t) return sendJson(res, 404, { error: 'Session or thread not found' });
  notifySnapshot('thread.completed');
  broadcast('thread.completed', { sessionId, threadId });
  sendJson(res, 200, { ok: true });
}

async function handleUpsertAgent(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  threadId: string
) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const agentId = requireString(body, 'agentId');
  const role = body.role as AgentRole | undefined;
  const agentType = requireString(body, 'agentType');
  const model = requireString(body, 'model');
  if (!agentId || !agentType || !model || (role !== 'orchestrator' && role !== 'subagent')) {
    return sendJson(res, 400, {
      error: 'Missing required fields: agentId, role ("orchestrator"|"subagent"), agentType, model',
    });
  }
  const agent = upsertAgent(sessionId, threadId, {
    agentId,
    role,
    agentType,
    model,
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
    tools: Array.isArray(body.tools) ? (body.tools as string[]) : undefined,
    skills: Array.isArray(body.skills) ? (body.skills as string[]) : undefined,
    parentAgentId: typeof body.parentAgentId === 'string' ? body.parentAgentId : undefined,
    startedAt: typeof body.startedAt === 'string' ? body.startedAt : undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!agent) return sendJson(res, 404, { error: 'Session or thread not found' });
  notifySnapshot('agent.upserted');
  broadcast('agent.upserted', { sessionId, threadId, agentId });
  sendJson(res, 200, { agentId: agent.id, createdAt: agent.startedAt });
}

async function handleCompleteAgent(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  threadId: string,
  agentId: string
) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const a = completeAgent(sessionId, threadId, agentId, {
    exitCode: typeof body.exitCode === 'number' ? body.exitCode : undefined,
    tokens: (body.tokens as Record<string, number> | undefined) ?? undefined,
    endedAt: typeof body.endedAt === 'string' ? body.endedAt : undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!a) return sendJson(res, 404, { error: 'Session, thread or agent not found' });
  notifySnapshot('agent.completed');
  broadcast('agent.completed', { sessionId, threadId, agentId });
  sendJson(res, 200, { ok: true });
}

async function handleToolCall(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  threadId: string,
  agentId: string
) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const tool = requireString(body, 'tool');
  if (!tool) return sendJson(res, 400, { error: 'Missing required field: tool' });
  const evt = recordToolCall(sessionId, threadId, agentId, {
    tool,
    timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
    inputText: typeof body.input === 'string' ? body.input : undefined,
    output: typeof body.output === 'string' ? body.output : undefined,
    status: body.status as 'ok' | 'error' | 'pending' | undefined,
    durationMs: typeof body.durationMs === 'number' ? body.durationMs : undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!evt) return sendJson(res, 404, { error: 'Session, thread or agent not found' });
  notifySnapshot('tool.called');
  broadcast('tool.called', { sessionId, threadId, agentId, eventId: evt.id, tool: evt.tool });
  sendJson(res, 200, { ok: true, eventId: evt.id });
}

async function handleSkillInvocation(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  threadId: string,
  agentId: string
) {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const skill = requireString(body, 'skill');
  if (!skill) return sendJson(res, 400, { error: 'Missing required field: skill' });
  const evt = recordSkillInvocation(sessionId, threadId, agentId, {
    skill,
    timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
    args: typeof body.args === 'string' ? body.args : undefined,
    status: body.status as 'ok' | 'error' | 'pending' | undefined,
    durationMs: typeof body.durationMs === 'number' ? body.durationMs : undefined,
    metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
  });
  if (!evt) return sendJson(res, 404, { error: 'Session, thread or agent not found' });
  notifySnapshot('skill.invoked');
  broadcast('skill.invoked', { sessionId, threadId, agentId, eventId: evt.id, skill: evt.skill });
  sendJson(res, 200, { ok: true, eventId: evt.id });
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  server.listen(PORT, () => {
    const staticLabel = STATIC_DIR ? ` serving ${STATIC_DIR}` : '';
    console.log(`[watch-server] http://localhost:${PORT}${staticLabel}`);
  });
}

export { server };
