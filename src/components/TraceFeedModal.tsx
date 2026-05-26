import { useEffect, useMemo } from 'react';
import { traceEntryDisplayBlocks } from '../lib/trace-entry-display';
import { buildTraceFeedModalModel } from '../lib/trace-feed-modal';
import type { TraceFeedEntry, TraceFeedNodeData } from '../lib/types';

interface Props {
  data: TraceFeedNodeData;
  onClose: () => void;
}

export default function TraceFeedModal({ data, onClose }: Props) {
  const model = useMemo(() => buildTraceFeedModalModel(data), [data]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="trace-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="trace-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-modal-title"
      >
        <header className="trace-modal-header">
          <div>
            <div className="trace-modal-eyebrow">{model.ownerKind} trace</div>
            <h2 id="trace-modal-title">{model.title}</h2>
            <p>{model.agentLabel}</p>
          </div>
          <button className="trace-modal-close" onClick={onClose} aria-label="Close trace feed">
            ×
          </button>
        </header>

        <div className="trace-modal-stats" aria-label="Trace feed summary">
          <Stat label="Entries" value={model.summary.total} />
          <Stat label="Thinking" value={model.summary.thinking} />
          <Stat label="Tools" value={model.summary.tools} />
          <Stat label="Runtime" value={model.summary.runtime} />
          <Stat label="Errors" value={model.summary.errors} tone={model.summary.errors > 0 ? 'error' : 'muted'} />
          <Stat label="Pending" value={model.summary.pending} tone={model.summary.pending > 0 ? 'pending' : 'muted'} />
        </div>

        <div className="trace-modal-content">
          <section className="trace-modal-timeline" aria-label="Chronological trace timeline">
            <div className="trace-modal-section-title">Chronological trace</div>
            <div className="trace-modal-list">
              {model.timeline.length === 0 ? (
                <div className="trace-modal-empty">No trace entries recorded.</div>
              ) : (
                model.timeline.map((entry) => <TraceRow entry={entry} key={entry.id} />)
              )}
            </div>
          </section>

          <aside className="trace-modal-side" aria-label="Trace categories">
            {model.sections.map((section) => (
              <section className="trace-modal-category" key={section.id}>
                <div className="trace-modal-category-head">
                  <span>{section.title}</span>
                  <span>{section.entries.length}</span>
                </div>
                <div className="trace-modal-category-list">
                  {section.entries.length === 0 ? (
                    <div className="trace-modal-empty compact">None recorded.</div>
                  ) : (
                    section.entries.map((entry) => <CompactTraceRow entry={entry} key={entry.id} />)
                  )}
                </div>
              </section>
            ))}
          </aside>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'error' | 'pending' | 'muted' }) {
  return (
    <div className={`trace-modal-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TraceRow({ entry }: { entry: TraceFeedEntry }) {
  const displayBlocks = traceEntryDisplayBlocks(entry);

  return (
    <article className={traceModalRowClassName(entry)}>
      <div className="trace-modal-time">{formatTraceTime(entry.timestamp)}</div>
      <div className="trace-modal-main">
        <div className="trace-modal-row-head">
          <span className="trace-modal-type">{entry.type}</span>
          <span className="trace-modal-label">
            {entry.label}
            <TraceDuration entry={entry} />
          </span>
          {entry.status && <span className={`trace-modal-status ${entry.status}`}>{entry.status}</span>}
        </div>
        {displayBlocks.length > 0 && (
          <div className="trace-modal-blocks">
            {displayBlocks.map((block) => (
              <details className={`trace-modal-block ${block.tone}`} key={block.id} open={block.defaultOpen || undefined}>
                <summary className="trace-modal-block-title">
                  <span aria-hidden="true" className="trace-modal-block-chevron" />
                  <span className="trace-modal-summary-collapsed">{block.collapsedSummary}</span>
                  <span className="trace-modal-summary-expanded">{block.expandedSummary}</span>
                  <span className="trace-modal-block-affordance">Click to expand</span>
                </summary>
                <pre>{block.text}</pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CompactTraceRow({ entry }: { entry: TraceFeedEntry }) {
  return (
    <div className={traceModalCompactRowClassName(entry)}>
      <span>{formatTraceTime(entry.timestamp)}</span>
      <strong>
        {entry.label}
        <TraceDuration entry={entry} />
      </strong>
      {entry.status && <em>{entry.status}</em>}
    </div>
  );
}

function TraceDuration({ entry }: { entry: TraceFeedEntry }) {
  if (entry.lifecycle?.phase !== 'end' || typeof entry.lifecycle.durationMs !== 'number') return null;
  return <span className="trace-duration">{formatDuration(entry.lifecycle.durationMs)}</span>;
}

function traceModalRowClassName(entry: TraceFeedEntry): string {
  return [
    'trace-modal-row',
    entry.type,
    entry.status,
    entry.lifecycle ? 'lifecycle' : undefined,
    entry.lifecycle?.partnerId ? 'linked' : undefined,
    entry.lifecycle ? `phase-${entry.lifecycle.phase}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function traceModalCompactRowClassName(entry: TraceFeedEntry): string {
  return [
    'trace-modal-compact-row',
    entry.type,
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

function formatTraceTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString([], { hour12: false });
}
