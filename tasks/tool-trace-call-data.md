# Tool trace: call data as primary dropdown, schema behind an info icon

## Goal

In the trace feed modal, a tool entry's primary dropdown should show the **tool
call data itself** (the arguments the model passed), not the input schema. The
schema stays available but moves behind a small `i` info button in the row head.

## Approach

The schema and the call data were conflated: the entry only carried `text`
(`output ?? input`) plus `inputSchema`, and the schema was rendered as the first
`<details>` dropdown.

- `TraceFeedEntry` (`src/lib/types.ts`): added `inputText?` — the tool call's own
  arguments, kept distinct from `text` (the output).
- `buildTraceFeed` (`src/lib/trace-feed.ts`): tool entries now set
  `text: event.output` and `inputText: event.input` (was `output ?? input`).
  The server already populates `ToolEvent.input` from `pi.tool_call_started`'s
  `args`, so no server change was needed.
- `trace-entry-display.ts`:
  - Dropped the `input-schema` display block. Added a `tool-call` block (built
    from `inputText`, JSON-pretty-printed when parseable) as the first dropdown.
  - New `traceEntrySchemaText(entry)` returns the formatted schema for the info
    affordance — it is no longer a dropdown block.
  - `traceEntryPreviewText` now skips the `tool-call` block (instead of the old
    `input-schema`) so the one-line node preview still summarizes the result,
    falling back to the call data for a still-pending tool with no output.
- `TraceFeedModal.tsx` (`TraceRow`): added an `i` button in the row head that
  toggles a schema panel (`useState`). `aria-expanded`/`aria-label` for a11y.
- `styles.css`: `.trace-modal-schema-toggle` (round `i` button) +
  `.trace-modal-schema` panel, matching the existing block `pre` styling.

## Decisions

- Schema is gated entirely on `inputSchema` being present, so non-tool entries
  and tools without a known schema show no info button.
- Preview prefers output over call data to preserve the existing node-preview
  semantics; only pending/no-output tools preview their call args.

## Progress log

- 2026-05-30: Implemented (TDD). Rewrote the modal display-blocks test to expect
  the `tool-call` primary block + no `input-schema` block, added a
  `traceEntrySchemaText` test. agent-viz: 124 tests pass, `tsc -b` clean.

## Out of scope

- Editing/replaying tool calls from the modal.
- Surfacing the schema anywhere other than the modal row (node preview unchanged).
