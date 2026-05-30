# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite frontend only on port 5283.
- `npm run serve` — sidecar (`server/watch-server.ts`) only on port 5284. Runs via `tsx` (no build step).
- `npm run dev:live` — both processes concurrently. This is the normal dev entry point; the frontend's `/api/*` proxy targets the sidecar.
- `npm run build` — `tsc -b && vite build`. TypeScript is `noEmit`; `tsc -b` is the type-check gate.
- `npm test` — runs `tsx --test tests/**/*.test.ts` (Node's built-in test runner, not Jest/Vitest).
- Run a single test file: `tsx --test tests/<file>.test.ts`. Run a single test by name: `tsx --test --test-name-pattern='<regex>' tests/<file>.test.ts`.

The sidecar reads `PORT` (default `5284`). Set `TRACE_API_TOKEN` to require `Authorization: Bearer …` (or `?access_token=`) on `/data`, `/stream`, and `/events`.

## Architecture

The app is a graph visualizer for agent runs. Live API data is synthesized into a single `Snapshot` shape; the rest of the pipeline renders that snapshot.

### Two-process layout

- **Frontend** (`src/`, Vite + React + `@xyflow/react`) runs on 5283. `vite.config.ts` proxies `/api/*` → `http://localhost:5284`.
- **Sidecar** (`server/watch-server.ts`) runs on 5284. It owns the live ingest API documented in `INGEST_API.md` and an SSE stream at `/stream`.

### Snapshot is the contract

Everything downstream of data loading speaks `Snapshot` (defined in `src/lib/types.ts`).

The live store in `server/store.ts` holds an in-memory tree of `Session → Thread → Agent → ToolEvent/SkillEvent`. `buildSnapshot()` synthesizes it into a `Snapshot` with `source: "live"`. When no sessions have been posted, `/data` returns an empty live snapshot.

This is the load-bearing design choice: the website only exposes API-backed sessions.

### Render pipeline

`Snapshot → buildGraph (src/lib/parse.ts) → layoutGraph (src/lib/layout.ts, dagre) → GraphCanvas (React Flow)`.

- `buildGraph` is a pure transform; it sets positions to (0,0). It filters by selected `threadKey` so the canvas only shows one request at a time (or all missions if no threads exist yet).
- `layoutGraph` runs dagre top-to-bottom and rewrites positions. Mission, thread, and subagent nodes are all top-level (no React Flow parent/extent — that gets stripped in layout).
- `useDataSource` (`src/hooks/useDataSource.ts`) owns fetching, SSE subscription, and credential storage in localStorage.

### SSE refresh model

The sidecar emits fine-grained events (`session.created`, `tool.called`, etc.) but the frontend only listens for a debounced `snapshot` event and re-fetches `/data`. Bursts of tool calls collapse to one client refresh per ~80 ms. Don't try to apply individual events client-side — the fine-grained events exist for harness debuggers, not the UI.

`adaptTraceEvent` (`server/store.ts`) builds the renderable tree incrementally so the run unfolds live: `pi.tool_call_started` creates a `pending` `ToolEvent` keyed by `toolCallId`, and `pi.tool_call_ended` *upserts* that same event (match on `metadata.toolCallId`) to `ok`/`error` — no duplicate. `pi.text_delta`/`pi.thinking_delta` set `agent.activity` (`responding`/`thinking`), cleared on `turn_ended`/`session_ended`; the snapshot surfaces it as a pulsing badge on the agent node.

### Live ingest invariants

- `/sessions/:id/threads/:tid/agents` is **idempotent on `agentId`** — re-POSTing patches in place. Harness retries are safe; the harness can register an agent with partial info first and add tools/prompt later.
- Tool/skill `input`/`output`/`args` are **truncated to 800 chars server-side**. Don't rely on full payloads being available downstream; if needed, store elsewhere and link via `metadata`.
- Body size is capped at 2 MB; oversize requests are terminated before parsing.

`INGEST_API.md` is the authoritative spec for the ingest surface. When changing endpoints, request shapes, or event names, update it.

## Conventions

- TypeScript is strict; module is ESNext; imports use the `.js` extension when importing TS files via `tsx` (see test files importing `../server/store.js`).
- No CSS framework — styles live in `src/styles.css`.
- Tests use `node:test` + `node:assert/strict`. They `import` the actual `server.ts` and listen on port 0 (`tests/events-api.test.ts` is the pattern). `clearStore()` between tests.
