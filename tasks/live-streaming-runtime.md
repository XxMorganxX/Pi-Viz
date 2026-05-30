# Live streaming runtime view

## Goal

Make the dashboard show a Pi run unfolding in real time instead of appearing to
"post at the end." Tools should appear the instant they start (pending) and flip
to ok/error on completion; the model's thinking/responding activity should be
visible while it streams.

## Root cause (investigated 2026-05-30)

Transport already streams: the harness POSTs incrementally (async queue,
flush on batch size or interval), the sidecar broadcasts + fires a debounced
`snapshot` SSE event on every ingest, and the frontend refetches `/data` on each.

The gap is in `server/store.ts` → `adaptTraceEvent`: only *completed* events
mutate the renderable tree.

| Event | Before |
|-------|--------|
| `pi.session_started` | ✓ orchestrator node appears |
| `pi.tool_call_started` | ✗ no case → tool invisible until it finishes |
| `pi.tool_call_ended` | ✓ appends completed tool |
| `pi.text_delta` / `pi.thinking_delta` | ✗ no case → streaming invisible |
| `pi.turn_ended` / `pi.session_ended` | ✓ totals / completion |

The frontend already supports `ToolEvent.status: 'pending'` (types, snapshot
pass-through, `.status.pending` CSS), so the fix is mostly server-side.

## Approach (scope: full live + snappier transport)

1. **Pending tool calls** — handle `pi.tool_call_started`: create a `pending`
   `ToolEvent` keyed by `toolCallId`. Make `pi.tool_call_ended` *upsert* the
   existing event (match on `metadata.toolCallId`) instead of appending, so a
   tool shows pending → ok/error live with no duplicate. Falls back to create
   if no start was seen (harnesses that only emit ended stay correct).
2. **Live thinking/text** — add `activity` to the agent; set it on
   `pi.text_delta` (`responding`) / `pi.thinking_delta` (`thinking`), clear it
   on `pi.turn_ended` / `pi.session_ended`. Surface through the snapshot to a
   small pulsing badge on the agent node.
3. **Snappier transport** — lower harness flush latency
   (`batchSize` 25→8, `flushIntervalMs` 1000→250) and the sidecar snapshot
   debounce (150→80 ms) so updates feel near-instant.

## Decisions

- `activity` reflects the *last model delta* and is cleared at turn/session end.
  Pending tool badges carry tool state separately; the two can coexist.
- Upsert keys on `metadata.toolCallId`, which both start and end events already
  carry via `traceToolCallId`.

## Progress log

- 2026-05-30: Investigated; root cause confirmed in `adaptTraceEvent`. Task started.
- 2026-05-30: Implemented (TDD). `server/store.ts`: `AgentActivity` type + `Agent.activity`;
  `upsertToolCall` (find-or-create by `toolCallId`); `adaptTraceEvent` handles
  `pi.tool_call_started` (pending), upserts on `pi.tool_call_ended`, sets/clears
  `activity` on deltas and turn/session end; snapshot surfaces `activity` on thread
  + subagent. Frontend: `AgentActivity`/`activity` on `Thread`/`Subagent` types,
  `AgentExecutionView`, pulsing badge in `AgentExecutionNode`, CSS. Transport:
  extension `batchSize` 25→8, `flushIntervalMs` 1000→250; sidecar debounce 150→80 ms.
  Docs updated (CLAUDE.md, INGEST_API.md, SYSTEM_RELATIONSHIP.md). New tests in
  `tests/live-streaming.test.ts`. agent-viz: 120 tests pass, `tsc -b` clean.
  pi-trace-extension: 6 tests pass, `tsc` clean. Task complete.

## Subagent live streaming (added 2026-05-30)

Follow-up: subagent spawns rendered only at completion because the harness
synthesized the child's trace triple post-hoc from the tool result, and the
live-streaming sink (`SubagentRunRequest.onEvent` + `emitLiveAssistant`/
`emitLiveToolResult`) was never wired to the `runAgent` call sites.

Wiring (harness-side only — the server already nests children via
`session_started` + `parentAgentId`):

- `Agentic-Pi/src/subagent-tool.ts`: `SubagentToolOptions` gains `parentAgentId`
  + `onChildEvent`. `createSubagentTool` wraps `runAgent` so that, when both are
  present, each child run emits `subagentStartedEvent` at spawn, streams its
  text/tool events tagged with a stable `subagent:<parent>:<n>` agent id, and
  emits `subagentEndedEvents` at close. Results carry `agentId` + `tracedLive`.
- `Agentic-Pi/src/standalone-agent.ts`: passes `parentAgentId: options.agentId`
  and an `onChildEvent` sink into `createSubagentTool`;
  `childTraceEventsFromSubagentToolResult` now skips `tracedLive` results (so the
  live lifecycle isn't duplicated) and honors `result.agentId`.

Result: a subagent node appears at spawn and unfolds live (pending tools,
thinking/responding activity) instead of popping in fully-formed at completion.
Tests: `subagent-tool.test.ts` (live stream + no-sink fallback),
`standalone-agent.test.ts` (skip live-traced / honor agentId). Agentic-Pi: 58
tests pass, `tsc` clean.

Failed-spawn dedup (resolved): the server's synthetic `tool:<toolCallId>` node
is now only created when the failed `subagent` result has no live-traced child.
`resultHasLiveTracedChild` (server/store.ts) checks
`result.details.results[].tracedLive`. A failed live child renders as one node;
a spawn that failed before running a child (invalid params) still gets the
fallback node. Tests in `tests/live-streaming.test.ts`.

## Out of scope

- Accumulating full streamed text into the tree (high churn; activity indicator
  is enough for v1).
- Client-side incremental delta application (frontend keeps full `/data` refetch).
