import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GraphCanvas from './components/GraphCanvas';
import DetailPanel from './components/DetailPanel';
import TraceFeedModal from './components/TraceFeedModal';
import Toolbar from './components/Toolbar';
import { buildGraph } from './lib/parse';
import { layoutGraph } from './lib/layout';
import { applyCachedLayout, layoutTopologyKey } from './lib/layout-cache';
import { diffGraph } from './lib/diff';
import {
  adjacentResponseFrameId,
  defaultFocusedResponseFrameId,
  responseFrameIds,
  type ResponseFrameDirection,
} from './lib/response-frame-navigation';
import type { GraphModel, NodeData, Snapshot, TraceFeedNodeData } from './lib/types';
import { threadKey } from './lib/types';
import { useDataSource } from './hooks/useDataSource';

export default function App() {
  const ds = useDataSource();
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<NodeData | null>(null);
  const [focusedResponseFrameId, setFocusedResponseFrameId] = useState<string | null>(null);
  const [cameraFocusNodeId, setCameraFocusNodeId] = useState<string | null>(null);
  const [expandedTraceFeed, setExpandedTraceFeed] = useState<TraceFeedNodeData | null>(null);
  const [enteredIds, setEnteredIds] = useState<Set<string>>(new Set());
  const prevGraphRef = useRef<GraphModel | null>(null);
  const layoutCacheRef = useRef<{ key: string; graph: GraphModel } | null>(null);

  // Auto-select the most recent thread on first snapshot load (or when the current
  // thread disappears from the data — e.g. after switching files).
  useEffect(() => {
    if (!ds.snapshot) return;
    const threads = ds.snapshot.threads;
    if (threads.length === 0) {
      if (selectedThreadKey !== null) setSelectedThreadKey(null);
      return;
    }
    const present = selectedThreadKey && threads.some((t) => threadKey(t) === selectedThreadKey);
    if (!present) {
      const newest = threads
        .slice()
        .sort((a, b) => new Date(b.firstTs).getTime() - new Date(a.firstTs).getTime())[0];
      setSelectedThreadKey(threadKey(newest));
    }
  }, [ds.snapshot, selectedThreadKey]);

  useEffect(() => {
    setFocusedResponseFrameId(null);
    setCameraFocusNodeId(null);
  }, [selectedThreadKey]);

  const graph: GraphModel = useMemo(() => {
    if (!ds.snapshot) {
      layoutCacheRef.current = null;
      return { nodes: [], edges: [] };
    }

    let built: GraphModel;
    // When there are missions but no threads yet (e.g. a live session has been
    // created but no requests/threads have been registered), still render the
    // mission nodes so the user can see what's being tracked.
    if (ds.snapshot.threads.length === 0) {
      if (ds.snapshot.missions.length === 0) {
        layoutCacheRef.current = null;
        return { nodes: [], edges: [] };
      }
      built = buildGraph(ds.snapshot as Snapshot);
    } else {
      if (!selectedThreadKey) {
        layoutCacheRef.current = null;
        return { nodes: [], edges: [] };
      }
      built = buildGraph(ds.snapshot as Snapshot, {
        threadKey: selectedThreadKey,
        collapseSingleThreadRoots: true,
      });
    }

    const topologyKey = layoutTopologyKey(built);
    if (layoutCacheRef.current?.key === topologyKey) {
      const reused = applyCachedLayout(built, layoutCacheRef.current.graph);
      layoutCacheRef.current = { key: topologyKey, graph: reused };
      return reused;
    }

    const laidOut = layoutGraph(built);
    layoutCacheRef.current = { key: topologyKey, graph: laidOut };
    return laidOut;
  }, [ds.snapshot, selectedThreadKey]);

  const requestFrameIds = useMemo(() => responseFrameIds(graph), [graph]);
  const focusedRequestIndex = focusedResponseFrameId
    ? requestFrameIds.indexOf(focusedResponseFrameId)
    : -1;

  useEffect(() => {
    const nextFocusedFrameId = defaultFocusedResponseFrameId(requestFrameIds, focusedResponseFrameId);
    if (nextFocusedFrameId !== focusedResponseFrameId) {
      setFocusedResponseFrameId(nextFocusedFrameId);
    }
  }, [focusedResponseFrameId, requestFrameIds]);

  // diff for enter animations
  useEffect(() => {
    const d = diffGraph(prevGraphRef.current, graph);
    if (prevGraphRef.current && d.addedNodeIds.size > 0) {
      setEnteredIds(d.addedNodeIds);
      const t = setTimeout(() => setEnteredIds(new Set()), 1200);
      return () => clearTimeout(t);
    }
    prevGraphRef.current = graph;
    return undefined;
  }, [graph]);

  // refresh selectedData if the snapshot changed (preserve panel on live update)
  useEffect(() => {
    if (!selectedId) return;
    const n = graph.nodes.find((x) => x.id === selectedId);
    if (n) {
      const nextData = n.data as NodeData;
      setSelectedData(nextData);
      if (nextData.kind === 'traceFeed') {
        setExpandedTraceFeed((current) => (current ? nextData : current));
      }
    }
    else {
      setSelectedId(null);
      setSelectedData(null);
      setExpandedTraceFeed(null);
    }
  }, [graph, selectedId]);

  const handleSelect = useCallback((id: string | null, data: NodeData | null) => {
    setSelectedId(id);
    setSelectedData(data);
    if (id && data?.kind === 'responseFrame') {
      setFocusedResponseFrameId(id);
    }
    if (data?.kind === 'traceFeed') {
      setExpandedTraceFeed(data);
    }
  }, []);

  const handleRequestNavigate = useCallback(
    (direction: ResponseFrameDirection) => {
      const currentId =
        focusedResponseFrameId ??
        (selectedId && requestFrameIds.includes(selectedId) ? selectedId : null);
      const nextId = adjacentResponseFrameId(requestFrameIds, currentId, direction);
      if (!nextId) return;

      const node = graph.nodes.find((candidate) => candidate.id === nextId);
      setFocusedResponseFrameId(nextId);
      setCameraFocusNodeId(nextId);
      setSelectedId(nextId);
      setSelectedData((node?.data as NodeData) ?? null);
    },
    [focusedResponseFrameId, graph.nodes, requestFrameIds, selectedId]
  );

  return (
    <div className="app">
      <Toolbar
        snapshot={ds.snapshot}
        liveMode={ds.liveMode}
        liveStatus={ds.liveStatus}
        accessToken={ds.accessToken}
        traceUrl={ds.traceUrl}
        lastUpdatedAt={ds.lastUpdatedAt}
        selectedThreadKey={selectedThreadKey}
        onSelectThread={setSelectedThreadKey}
        onAccessTokenChange={ds.setAccessToken}
        onTraceUrlChange={ds.setTraceUrl}
        onConnectLive={ds.connectLive}
        onDisconnectLive={ds.disconnectLive}
        onReload={ds.reload}
      />
      <div className={`canvas-wrap ${selectedData ? '' : 'no-panel'}`}>
        {ds.snapshot ? (
          <GraphCanvas
            graph={graph}
            enteredIds={enteredIds}
            selectedId={selectedId}
            focusedNodeId={cameraFocusNodeId}
            onFocusedNodeSettled={() => setCameraFocusNodeId(null)}
            onSelect={handleSelect}
          />
        ) : (
          <EmptyState />
        )}
        {requestFrameIds.length > 0 && (
          <div className="request-navigator" aria-label="Request navigator">
            <button
              aria-label="Previous request"
              title="Previous request"
              onClick={() => handleRequestNavigate('previous')}
              disabled={focusedRequestIndex === 0}
            >
              ↑
            </button>
            <span>
              {focusedRequestIndex >= 0 ? focusedRequestIndex + 1 : '—'} / {requestFrameIds.length}
            </span>
            <button
              aria-label="Next request"
              title="Next request"
              onClick={() => handleRequestNavigate('next')}
              disabled={focusedRequestIndex === requestFrameIds.length - 1}
            >
              ↓
            </button>
          </div>
        )}
        <DetailPanel data={selectedData} onClose={() => handleSelect(null, null)} />
      </div>
      {expandedTraceFeed && (
        <TraceFeedModal data={expandedTraceFeed} onClose={() => setExpandedTraceFeed(null)} />
      )}
      {ds.error && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            right: 12,
            background: 'var(--danger)',
            padding: '8px 12px',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
          }}
        >
          {ds.error}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-dim)',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 16, color: 'var(--text)' }}>No data loaded</div>
      <div>Connect live to load sessions from the trace API.</div>
    </div>
  );
}
