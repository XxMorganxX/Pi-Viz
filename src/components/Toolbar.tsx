import { useMemo } from 'react';
import type { Snapshot } from '../lib/types';
import { threadKey } from '../lib/types';
import { fmtTimestamp, shortMissionTitle } from '../lib/format';

interface Props {
  snapshot: Snapshot | null;
  liveMode: boolean;
  liveStatus: 'connecting' | 'connected' | 'error' | 'idle';
  accessToken: string;
  traceUrl: string;
  lastUpdatedAt: string | null;
  selectedThreadKey: string | null;
  onSelectThread: (key: string | null) => void;
  onAccessTokenChange: (value: string) => void;
  onTraceUrlChange: (value: string) => void;
  onConnectLive: () => void;
  onDisconnectLive: () => void;
  onReload: () => void;
  onFormat: () => void;
}

export default function Toolbar({
  snapshot,
  liveMode,
  liveStatus,
  accessToken,
  traceUrl,
  lastUpdatedAt,
  selectedThreadKey,
  onSelectThread,
  onAccessTokenChange,
  onTraceUrlChange,
  onConnectLive,
  onDisconnectLive,
  onReload,
  onFormat,
}: Props) {
  const orderedThreads = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.threads
      .slice()
      .sort((a, b) => new Date(b.firstTs).getTime() - new Date(a.firstTs).getTime());
  }, [snapshot]);

  const currentIdx = selectedThreadKey
    ? orderedThreads.findIndex((t) => threadKey(t) === selectedThreadKey)
    : -1;

  const goPrev = () => {
    if (orderedThreads.length === 0) return;
    const next = currentIdx <= 0 ? orderedThreads.length - 1 : currentIdx - 1;
    onSelectThread(threadKey(orderedThreads[next]));
  };
  const goNext = () => {
    if (orderedThreads.length === 0) return;
    const next = currentIdx === -1 || currentIdx === orderedThreads.length - 1 ? 0 : currentIdx + 1;
    onSelectThread(threadKey(orderedThreads[next]));
  };

  return (
    <div className="toolbar">
      <strong>Agent Runtime Visualizer</strong>

      <input
        className="trace-url-input"
        type="url"
        value={traceUrl}
        placeholder="Trace URL"
        autoComplete="off"
        onChange={(e) => onTraceUrlChange(e.target.value)}
        title="Trace API URL"
      />

      <input
        className="token-input"
        type="password"
        value={accessToken}
        placeholder="Access token"
        autoComplete="off"
        onChange={(e) => onAccessTokenChange(e.target.value)}
        title="Trace API access token"
      />

      {liveMode ? (
        <button onClick={onDisconnectLive}>
          <span className={`live-dot ${liveStatus === 'connected' ? 'on' : liveStatus === 'error' ? 'err' : ''}`} />
          Live {liveStatus}
        </button>
      ) : (
        <button onClick={onConnectLive}>Connect live…</button>
      )}

      <button onClick={onReload} disabled={!snapshot && !liveMode}>Reload</button>
      <button onClick={onFormat} disabled={!snapshot}>Format</button>

      <span className="spacer" />

      {snapshot && orderedThreads.length > 0 && (
        <>
          <button onClick={goPrev} title="Previous thread" disabled={orderedThreads.length < 2}>‹</button>
          <select
            value={selectedThreadKey ?? ''}
            onChange={(e) => onSelectThread(e.target.value || null)}
            title="Select thread"
            style={{ minWidth: 320 }}
          >
            {orderedThreads.map((t) => {
              const key = threadKey(t);
              const mission = snapshot.missions.find((m) => m.id === t.missionId);
              const missionLabel = mission ? shortMissionTitle(mission.title || mission.id, 40) : t.missionId;
              return (
                <option key={key} value={key}>
                  {fmtTimestamp(t.firstTs)} · {missionLabel} · {t.subagentCallCount} sub
                </option>
              );
            })}
          </select>
          <button onClick={goNext} title="Next thread" disabled={orderedThreads.length < 2}>›</button>
          <span className="meta">
            {currentIdx >= 0 ? currentIdx + 1 : '—'} / {orderedThreads.length}
          </span>
        </>
      )}

      {lastUpdatedAt && <span className="meta">updated {new Date(lastUpdatedAt).toLocaleTimeString()}</span>}
    </div>
  );
}
