# Agent Runtime Ingest API

The `agent-viz` sidecar (`server/watch-server.ts`) exposes a small HTTP +
Server-Sent-Events API that lets an external harness (e.g. a Pi agent runtime)
push live session, thread, agent, tool, and skill events. Events are held in
an in-memory store and synthesized into the snapshot shape rendered by the
frontend.

- Base URL (dev): `http://localhost:5284`
- Frontend dev proxy forwards `/api/*` → `http://localhost:5284`
- All endpoints below are also reachable via `/api/...` through the Vite proxy
  (e.g. `http://localhost:5283/api/sessions`).
- Content type for all POST bodies: `application/json`
- Hosted live access can require an access token when `TRACE_API_TOKEN` is
  configured. The dashboard UI accepts the trace URL and token in its toolbar,
  caches them in browser local storage, and uses them for live data/stream
  requests. Extension POSTs use
  `Authorization: Bearer <token>`.
- Max body size: 2 MB
- CORS: `*` is allowed (dev only — lock down in production)

## Mental model

```
Session (1)                ← slash-command run; renders as a mission container
   │
   ├── Thread (N)          ← one per Pi conversation session
   │      │
   │      └── Agent (1 orchestrator + M subagents)
   │             ├─ systemPrompt
   │             ├─ availableTools[]
   │             ├─ availableSkills[]
   │             ├─ ToolEvent[]      ← logged via /tool-calls
   │             └─ SkillEvent[]     ← logged via /skill-invocations
   └── tokens / metadata
```

- **Session** = one slash-command invocation. Becomes the mission node at
  the top of the graph.
- **Thread** = one Pi conversation session within that slash-command run. The
  visualizer draws one thread node per conversation; multiple user queries in
  that conversation append new entries to the same thread timeline.
- **Agents** = orchestrator + subagents inside a thread. The orchestrator is
  the conversation handler; subagents are spawned during that conversation.

The store is idempotent on `agentId` within a thread: re-POSTing
`/threads/:threadId/agents` with the same `agentId` patches the existing
agent rather than creating a duplicate. Harness retries are safe.

### Typical lifecycle for a slash-command session

1. Slash command fires → `POST /api/sessions` (creates the mission node).
2. Pi conversation starts inside the session → `POST /api/sessions/:id/threads`
   (creates a thread node edged to the mission).
3. Harness spins up the orchestrator → `POST .../threads/:tid/agents`
   with `role: "orchestrator"`.
4. Orchestrator runs tools / spawns subagents — for each:
   - `POST .../agents/:aid/tool-calls` per tool invocation.
   - `POST .../threads/:tid/agents` again with `role: "subagent"` and
     `parentAgentId` to register a spawned child.
5. User queries and agent responses append tool, skill, and runtime timeline
   entries under the same `threadId`.
6. Conversation finishes → `POST .../threads/:tid/complete`.
7. Steps 2–6 repeat only for a new Pi conversation session.
8. Slash command session ends → `POST .../sessions/:id/complete`.

---

## Endpoints

### `GET /health`

Liveness check.

```json
{ "ok": true, "clients": 1, "liveSessions": 2 }
```

### `GET /data`

Returns the current synthesized live snapshot (`source: "live"`). When no
sessions have been posted, the snapshot contains empty `threads` and `missions`
arrays.

### `GET /stream`

Server-Sent-Events stream. The server emits:

| Event              | Payload                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `hello`            | `{ liveSessions }` (sent once on connect)                        |
| `snapshot`         | `{ generatedAt, reason }` (debounced 80 ms)                      |
| `session.created`  | `{ sessionId, missionId }`                                       |
| `session.completed`| `{ sessionId }`                                                  |
| `session.deleted`  | `{ sessionId }`                                                  |
| `thread.created`   | `{ sessionId, threadId }`                                        |
| `thread.completed` | `{ sessionId, threadId }`                                        |
| `agent.upserted`   | `{ sessionId, threadId, agentId }`                               |
| `agent.completed`  | `{ sessionId, threadId, agentId }`                               |
| `tool.called`      | `{ sessionId, threadId, agentId, eventId, tool }`                |
| `skill.invoked`    | `{ sessionId, threadId, agentId, eventId, skill }`               |

The frontend listens for `snapshot` and re-fetches `/data`; the other
fine-grained events are available for harness debuggers or custom UIs.

A `: ping` comment line is sent every 30 s to keep proxies alive.

---

### `POST /events` — append runtime trace events

Accepts a batch of append-only runtime events from a Pi harness trace
extension. The packable reference connector is
`@agent-viz/pi-trace-extension`, which emits the `pi-trace.v1` protocol. This
endpoint is intended for hosted dashboard integrations and can run alongside the
older resource-shaped REST endpoints below.

When `TRACE_API_TOKEN` is set on the sidecar, extension POST requests must include:

```text
Authorization: Bearer <token>
```

Request body:

```json
{
  "events": [
    {
      "schemaVersion": "pi-trace.v1",
      "eventId": "evt-1",
      "sequence": 1,
      "timestamp": "2026-05-25T12:00:00.000Z",
      "sessionId": "session-1",
      "threadId": "thread-1",
      "agentId": "agent-1",
      "eventType": "pi.session_started",
      "payload": {
        "provider": "anthropic",
        "model_id": "claude-opus-4-7",
        "thinking_level": "high",
        "tool_names": ["Read", "Bash"],
        "tool_schemas": {
          "Read": {
            "type": "object",
            "properties": {
              "path": { "type": "string" }
            },
            "required": ["path"]
          }
        }
      },
      "metadata": {
        "summary": "Pi session started",
        "agentType": "scout",
        "nodeLabel": "Scout",
        "subagentSpecId": "agent-viz/scout"
      }
    }
  ]
}
```

Response: `200 { "ok": true, "accepted": 1 }`

Known Pi lifecycle and tool events are adapted into the current session,
thread, agent, tool-call, and token snapshot model. Unknown event types are
preserved in the thread `runtimeEvents` timeline for future UI surfaces.
`schemaVersion` may be omitted for older clients, but when present it must be
`pi-trace.v1`.

For specialized subagents, set top-level `parentAgentId` to the immediate parent
agent and include metadata such as `agentType`, `nodeLabel`, and
`subagentSpecId`. The snapshot keeps those fields so the UI can render nested
Scout, Tool Definer, or other pack-defined child nodes.

#### Portable semantic events

The `/events` endpoint is intentionally permissive: every event with the base
`pi-trace.v1` envelope is stored in `runtimeEvents`. The Agent Viz UI also
recognizes this optional extension vocabulary:

| Event type | Required payload | Optional payload | UI use |
| ---------- | ---------------- | ---------------- | ------ |
| `span.started` | `spanId`, `name` | `parentSpanId`, `kind`, `inputPreview` | Timed execution phases → **milestone** |
| `span.ended` | `spanId` | `status`, `outputPreview`, `error` | Span completion and duration → **milestone** |
| `context.part` | `role`, `label` | `partId`, `contentPreview`, `content`, `tokenCount`, `sourceIds`, `redacted` | Context inspection |
| `context.snapshot` | `label` | `snapshotId`, `parts`, `totalTokens`, `truncated` | Model-call context boundary |
| `state.transition` | `to` | `from`, `reason`, `status`, `stateMachineId` | State-machine or planner view → **milestone** |
| `artifact.created` | `kind`, `label` | `artifactId`, `uri`, `contentPreview` | Output and evidence trail |

#### Universal milestones

`span.started`/`span.ended` and `state.transition` are the universal milestone
vocabulary. The store synthesizes them into `SnapshotThread.milestones`, a
producer-agnostic progress structure rendered as a first-class milestone node.
Any system (Superpowers plans, GSD roadmaps, a Pi planner) participates by
emitting these events — no per-system adapter lives in the visualizer.

Each milestone has the shape:

```ts
{
  id: string;              // = spanId (idempotent on re-post), or state:<stateMachineId|agentId>
  source: string;          // provenance from metadata.source, default "pi" (display only)
  title: string;           // span name / state `to`
  status: 'pending' | 'active' | 'done' | 'blocked';
  kind?: string;           // span kind, or "state"
  parentId?: string;       // = parentSpanId (nesting)
  order?: number;          // emission order within a parent
  startedAt?, endedAt?, durationMs?;
  progress?: { completed, total };   // rolled up from child milestones
  detail?: string;         // error / outputPreview / transition reason
}
```

A `span.started` with no matching `span.ended` stays `active`; an end with
`status: "error"` becomes `blocked`, otherwise `done`. Re-posting `span.started`
with the same `spanId` patches in place.

Harnesses do not need to emit these directly. The recommended integration is to
use `@agent-viz/pi-trace-extension`, whose typed helper methods generate these
events while preserving the same permissive `onEvent` escape hatch.

---

### `POST /sessions` — create a session (= mission)

The session is the slash-command-launched container. **No thread is created
implicitly** — call `POST /sessions/:id/threads` once per Pi conversation
session.

Request body (all fields optional, sane defaults applied):

```json
{
  "sessionId":   "run-2026-05-22-001",
  "missionId":   "linear:ABC-123",
  "missionKind": "linear",
  "missionTitle":"/debug-flaky-test",
  "channelId":   "C0PI001",
  "startedAt":   "2026-05-22T18:00:00.000Z",
  "metadata":    { "host": "pi-edge-3", "slashCommand": "/debug-flaky-test" }
}
```

| Field          | Type                              | Default                    |
| -------------- | --------------------------------- | -------------------------- |
| `sessionId`    | string                            | random UUID                |
| `missionId`    | string                            | `live:<sessionId>`         |
| `missionKind`  | `linear`\|`halo`\|`unattributed`  | `unattributed`             |
| `missionTitle` | string                            | `Live session <id-prefix>` |
| `channelId`    | string (default channel for child threads) | `live:<id-prefix>` |
| `startedAt`    | ISO timestamp                     | `now()`                    |
| `metadata`     | object                            | —                          |

Response: `200 { "sessionId": "...", "missionId": "...", "createdAt": "..." }`

### `GET /sessions` — list sessions

```json
[
  {
    "id": "run-2026-05-22-001",
    "missionId": "linear:ABC-123",
    "missionTitle": "/debug-flaky-test",
    "createdAt": "...",
    "endedAt": null,
    "threadCount": 4
  }
]
```

### `GET /sessions/:sessionId` — fetch one session

Returns the full session with `threads` materialized as an array; each
thread has its `agents` materialized as an array.

### `DELETE /sessions/:sessionId`

Removes a session (and all its threads/agents/events) from the in-memory
store.

### `POST /sessions/:sessionId/complete`

Marks the session ended. Optional body:

```json
{
  "endedAt": "2026-05-22T18:42:01.000Z",
  "tokens": { "totalTokens": 124312, "cost": 0.81 },
  "metadata": { "result": "success" }
}
```

---

### `POST /sessions/:sessionId/threads` — create a thread (= conversation)

Call this once per Pi conversation session. Keep reusing the same `threadId`
for follow-up user queries in that conversation so new items append to the same
events timeline. The thread becomes a node edged to the session's mission.

```json
{
  "threadId":       "req-1",
  "channelId":      "C0PI001",
  "threadTs":       "1779228796.478299",
  "startedAt":      "2026-05-22T18:01:00.000Z",
  "requestPreview": "investigate the flaky test in auth/login_spec.ts",
  "metadata":       { "userId": "u-42" }
}
```

| Field            | Type          | Default                |
| ---------------- | ------------- | ---------------------- |
| `threadId`       | string        | random UUID            |
| `channelId`      | string        | session's `channelId`  |
| `threadTs`       | string        | `startedAt`            |
| `startedAt`      | ISO timestamp | `now()`                |
| `requestPreview` | string        | —                      |
| `metadata`       | object        | —                      |

Response: `200 { "threadId": "...", "channelId": "...", "threadTs": "...", "createdAt": "..." }`

### `POST /sessions/:sessionId/threads/:threadId/complete`

```json
{
  "endedAt": "2026-05-22T18:05:33.000Z",
  "tokens": { "totalTokens": 5400, "cost": 0.08 },
  "metadata": { "result": "answered" }
}
```

---

### `POST /sessions/:sessionId/threads/:threadId/agents` — register / update an agent

**Idempotent on `agentId` within the thread.** Re-posting the same `agentId`
patches the agent in place (useful when the harness streams partial info —
first registers with model + system prompt, later adds tools).

Required fields: `agentId`, `role`, `agentType`, `model`.

```json
{
  "agentId":     "orch-1",
  "role":        "orchestrator",
  "agentType":   "pi-harness/main-loop",
  "model":       "anthropic/claude-opus-4-7",
  "systemPrompt":"You are the main orchestrator…",
  "tools":       ["Read", "Bash", "Edit", "Grep"],
  "skills":      ["debug", "review"],
  "parentAgentId": null,
  "startedAt":   "2026-05-22T18:01:01.000Z",
  "metadata":    { "harnessVersion": "0.4.2" }
}
```

Use `role: "subagent"` and set `parentAgentId` to draw a spawn edge from the
parent orchestrator (or subagent) to the child within the same thread.

Response: `200 { "agentId": "...", "createdAt": "..." }`

### `POST /sessions/:sessionId/threads/:threadId/agents/:agentId/complete`

```json
{
  "exitCode": 0,
  "tokens": { "input": 12000, "output": 800, "totalTokens": 12800, "cost": 0.18 },
  "endedAt": "2026-05-22T18:05:11.000Z"
}
```

---

### `POST /sessions/:sid/threads/:tid/agents/:aid/tool-calls`

Log a single tool invocation. Inputs/outputs are truncated to 800 chars
server-side; keep payloads small.

```json
{
  "tool":       "Bash",
  "timestamp":  "2026-05-22T18:01:02.500Z",
  "input":      "ls -la /etc",
  "output":     "total 312\\ndrwxr-xr-x …",
  "status":     "ok",
  "durationMs": 84,
  "metadata":   { "exitCode": 0 }
}
```

| Field         | Type                         | Required |
| ------------- | ---------------------------- | -------- |
| `tool`        | string                       | ✅       |
| `timestamp`   | ISO string                   | default: now |
| `input`       | string (truncated to 800)    | —        |
| `output`      | string (truncated to 800)    | —        |
| `status`      | `ok` \| `error` \| `pending` | —        |
| `durationMs`  | number                       | —        |
| `metadata`    | object                       | —        |

Response: `200 { "ok": true, "eventId": "<uuid>" }`

### `POST /sessions/:sid/threads/:tid/agents/:aid/skill-invocations`

```json
{
  "skill":      "debug",
  "timestamp":  "2026-05-22T18:01:30.000Z",
  "args":       "investigate flaky test in auth/login_spec.ts",
  "status":     "ok",
  "durationMs": 1100,
  "metadata":   { "skillVersion": "1.3" }
}
```

Same shape rules as tool calls. Response: `200 { "ok": true, "eventId": "<uuid>" }`.

---

## End-to-end example

```bash
BASE=http://localhost:5284

# 1. Slash command fires → create session (mission)
SID=$(curl -s -X POST $BASE/api/sessions \
  -H 'content-type: application/json' \
  -d '{
    "sessionId": "demo-run-1",
    "missionKind": "linear",
    "missionTitle": "/debug-flaky-test",
    "channelId": "C0PI001",
    "metadata": { "slashCommand": "/debug-flaky-test" }
  }' | jq -r .sessionId)
echo "session=$SID"

# 2. Pi conversation starts → create thread #1
TID1=$(curl -s -X POST $BASE/api/sessions/$SID/threads \
  -H 'content-type: application/json' \
  -d '{
    "threadId": "conversation-1",
    "requestPreview": "investigate flaky test in auth/login_spec.ts"
  }' | jq -r .threadId)
echo "thread1=$TID1"

# 3. Orchestrator for that conversation
curl -s -X POST $BASE/api/sessions/$SID/threads/$TID1/agents \
  -H 'content-type: application/json' \
  -d '{
    "agentId": "orch-1",
    "role": "orchestrator",
    "agentType": "pi-harness/main-loop",
    "model": "anthropic/claude-opus-4-7",
    "systemPrompt": "You orchestrate the request flow.",
    "tools": ["Read","Bash","Edit","Grep"],
    "skills": ["debug","review"]
  }' | jq

# 4. Subagent spawned during the conversation
curl -s -X POST $BASE/api/sessions/$SID/threads/$TID1/agents \
  -H 'content-type: application/json' \
  -d '{
    "agentId": "explorer-1",
    "role": "subagent",
    "agentType": "Explore",
    "model": "anthropic/claude-haiku-4-5-20251001",
    "parentAgentId": "orch-1",
    "tools": ["Read","Glob","Grep"]
  }' | jq

# 5. Tool / skill events
curl -s -X POST $BASE/api/sessions/$SID/threads/$TID1/agents/orch-1/tool-calls \
  -H 'content-type: application/json' \
  -d '{"tool":"Read","input":"auth/login_spec.ts","status":"ok","durationMs":12}'

curl -s -X POST $BASE/api/sessions/$SID/threads/$TID1/agents/explorer-1/tool-calls \
  -H 'content-type: application/json' \
  -d '{"tool":"Grep","input":"pattern=flaky","status":"ok","durationMs":86}'

curl -s -X POST $BASE/api/sessions/$SID/threads/$TID1/agents/orch-1/skill-invocations \
  -H 'content-type: application/json' \
  -d '{"skill":"debug","args":"login flakiness","status":"ok","durationMs":1400}'

# 6. A follow-up user query in the same conversation appends to thread #1
curl -s -X POST $BASE/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"eventId":"evt-follow-up","sequence":42,"timestamp":"2026-05-22T18:09:00.000Z","sessionId":"demo-run-1","threadId":"conversation-1","agentId":"orch-1","eventType":"pi.text_delta","payload":{"delta":"now fix it"}}]}'

# 7. Complete conversation #1
curl -s -X POST $BASE/api/sessions/$SID/threads/$TID1/complete \
  -H 'content-type: application/json' \
  -d '{"tokens":{"totalTokens":18900,"cost":0.31}}'

# 8. A separate Pi conversation session gets a new thread
TID2=$(curl -s -X POST $BASE/api/sessions/$SID/threads \
  -H 'content-type: application/json' \
  -d '{"threadId":"conversation-2","requestPreview":"investigate a separate issue"}' | jq -r .threadId)
# … register orchestrator, log events, complete …

# 9. End the slash-command session
curl -s -X POST $BASE/api/sessions/$SID/complete \
  -H 'content-type: application/json' \
  -d '{"tokens":{"totalTokens":42000,"cost":0.74}}'

# 10. Subscribe to live updates (open in another terminal before step 1)
curl -N $BASE/api/stream
```

After step 6 the visualizer still shows one mission node (`/debug-flaky-test`)
with one thread node (`conversation-1`); the follow-up query is another runtime
event in that thread's timeline. After step 8, the mission has a second thread
only because a separate Pi conversation session was started.

---

## Error responses

All errors return JSON `{ "error": "<message>" }` with appropriate status:

- `400` — missing required fields (`agentId`, `role`, `agentType`, `model`,
  `tool`, `skill`)
- `404` — unknown `sessionId`, `threadId`, or `agentId`
- `500` — JSON parse failure or unexpected server error

The body-size limit (`2 MB`) is enforced before parsing; oversize requests
terminate the connection with a `500`.

---

## Operational notes

- The store is **in-memory only**. Restarting the sidecar wipes all live
  sessions. Long-term persistence is intentionally out of scope — the
  visualizer is a runtime view, not an archive.
- SSE `snapshot` broadcasts are debounced 80 ms so a burst of tool-call
  events produces at most one client refresh per ~80 ms window.
- `pi.tool_call_started` is rendered as a `pending` tool event and upserted by
  `toolCallId` when `pi.tool_call_ended` arrives, so tools appear live and flip
  to `ok`/`error` in place. `pi.text_delta`/`pi.thinking_delta` set the agent's
  live `activity` (`responding`/`thinking`), cleared at turn/session end.
- Tool/skill `input`/`output`/`args` are truncated to 800 chars on the way
  in. If you need full payloads, store them elsewhere and link via
  `metadata`.

---

## Environment variables

| Var    | Default | Purpose           |
| ------ | ------- | ----------------- |
| `PORT` | `5284`  | Sidecar HTTP port |
