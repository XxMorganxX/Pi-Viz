import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { traceEntryPreviewText } from '../lib/trace-entry-display';
import { buildTraceFeedPreviewModel, toneForTraceEntry } from '../lib/trace-feed-preview';
import type { TraceFeedEntry, TraceFeedNodeData } from '../lib/types';

function TraceFeedNodeImpl(props: NodeProps) {
  const data = props.data as unknown as TraceFeedNodeData;
  const model = buildTraceFeedPreviewModel(data);

  return (
    <div className={`node node-trace-feed tone-${model.attentionTone} ${props.selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="trace-feed-header">
        <div>
          <div className="title">{model.title}</div>
          <div className="meta">{model.ownerKind} · {model.agentLabel}</div>
        </div>
        <div className={`trace-feed-status tone-${model.attentionTone}`}>
          <span>{model.summary.total}</span>
          <strong>{model.attentionTone === 'quiet' ? 'idle' : model.attentionTone}</strong>
        </div>
      </div>
      <div className="trace-feed-lanes">
        {model.lanes.map((lane) => (
          <FeedBox
            count={lane.count}
            empty={lane.empty}
            entries={lane.entries}
            key={lane.id}
            title={lane.title}
            tone={lane.tone}
          />
        ))}
      </div>
      <div className="trace-feed-expand-hint">
        <span>Open timeline</span>
        <strong>
          {model.summary.errors > 0
            ? `${model.summary.errors} error${model.summary.errors === 1 ? '' : 's'}`
            : `${model.summary.tools} tools · ${model.summary.runtime} runtime`}
        </strong>
      </div>
    </div>
  );
}

function FeedBox({
  title,
  count,
  tone,
  entries,
  empty,
}: {
  title: string;
  count: number;
  tone: string;
  entries: TraceFeedEntry[];
  empty: string;
}) {
  return (
    <div className={`trace-feed-box tone-${tone}`}>
      <div className="trace-feed-box-title">
        <span>{title}</span>
        <strong>{count}</strong>
      </div>
      <div className="trace-feed-scroll">
        {entries.length === 0 ? (
          <div className="trace-feed-empty">{empty}</div>
        ) : (
          entries.map((entry) => (
            <FeedEntry entry={entry} key={entry.id} />
          ))
        )}
      </div>
    </div>
  );
}

function FeedEntry({ entry }: { entry: TraceFeedEntry }) {
  const previewText = traceEntryPreviewText(entry);

  return (
    <div className={traceFeedEntryClassName(entry)}>
      <span className="trace-feed-time">{shortTime(entry.timestamp)}</span>
      <span className="trace-feed-kind">{entry.type}</span>
      <span className="trace-feed-label">
        {entry.label}
        {entry.lifecycle?.phase === 'end' && typeof entry.lifecycle.durationMs === 'number' && (
          <span className="trace-feed-duration">{formatDuration(entry.lifecycle.durationMs)}</span>
        )}
      </span>
      {previewText && <span className="trace-feed-text">{previewText}</span>}
    </div>
  );
}

function traceFeedEntryClassName(entry: TraceFeedEntry): string {
  return [
    'trace-feed-entry',
    entry.type,
    `tone-${toneForTraceEntry(entry)}`,
    entry.status,
    entry.lifecycle ? 'lifecycle' : undefined,
    entry.lifecycle?.partnerId ? 'linked' : undefined,
    entry.lifecycle ? `phase-${entry.lifecycle.phase}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function shortTime(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour12: false });
}

export default memo(TraceFeedNodeImpl);
