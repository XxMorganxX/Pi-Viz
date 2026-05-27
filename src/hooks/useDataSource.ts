import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredLiveMode, setStoredLiveMode } from '../lib/live-connection-preferences';
import { createLiveRefreshScheduler, type LiveRefreshScheduler } from '../lib/live-refresh-scheduler';
import type { Snapshot } from '../lib/types';

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface State {
  snapshot: Snapshot | null;
  lastUpdatedAt: string | null;
  liveMode: boolean;
  liveStatus: LiveStatus;
  accessToken: string;
  traceUrl: string;
  error: string | null;
}

const TOKEN_STORAGE_KEY = 'agent-viz.traceAccessToken';
const TRACE_URL_STORAGE_KEY = 'agent-viz.traceUrl';
const DEFAULT_TRACE_URL = '/api';

function storedToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function storedTraceUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_TRACE_URL;
  return window.localStorage.getItem(TRACE_URL_STORAGE_KEY) ?? DEFAULT_TRACE_URL;
}

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.trim();
  if (!base || base === '/api') return `/api${path}`;
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function useDataSource() {
  const shouldReconnectLive = getStoredLiveMode();
  const [state, setState] = useState<State>({
    snapshot: null,
    lastUpdatedAt: null,
    liveMode: shouldReconnectLive,
    liveStatus: shouldReconnectLive ? 'connecting' : 'idle',
    accessToken: storedToken(),
    traceUrl: storedTraceUrl(),
    error: null,
  });
  const sseRef = useRef<EventSource | null>(null);
  const refreshSchedulerRef = useRef<LiveRefreshScheduler | null>(null);
  const autoConnectAttemptedRef = useRef(false);

  const loadFromUrl = useCallback(async (url: string, accessToken = state.accessToken) => {
    const headers: HeadersInit = accessToken ? { authorization: `Bearer ${accessToken}` } : {};
    const resp = await fetch(url, { cache: 'no-store', headers });
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const json = (await resp.json()) as Snapshot;
    setState((s) => ({ ...s, snapshot: json, lastUpdatedAt: new Date().toISOString(), error: null }));
  }, [state.accessToken]);

  const setAccessToken = useCallback((accessToken: string) => {
    if (accessToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    setState((s) => ({ ...s, accessToken }));
  }, []);

  const setTraceUrl = useCallback((traceUrl: string) => {
    const trimmed = traceUrl.trim();
    if (trimmed) {
      window.localStorage.setItem(TRACE_URL_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(TRACE_URL_STORAGE_KEY);
    }
    setState((s) => ({ ...s, traceUrl: trimmed || DEFAULT_TRACE_URL }));
  }, []);

  const connectLive = useCallback(async () => {
    setState((s) => ({ ...s, liveMode: true, liveStatus: 'connecting', error: null }));
    const dataUrl = endpoint(state.traceUrl, '/data');
    try {
      await loadFromUrl(dataUrl, state.accessToken);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, liveStatus: 'error', error: msg }));
      return;
    }
    setStoredLiveMode(true);
    refreshSchedulerRef.current?.cancel();
    refreshSchedulerRef.current = null;
    sseRef.current?.close();
    const baseStreamUrl = endpoint(state.traceUrl, '/stream');
    const streamUrl = state.accessToken
      ? `${baseStreamUrl}?access_token=${encodeURIComponent(state.accessToken)}`
      : baseStreamUrl;
    const es = new EventSource(streamUrl);
    sseRef.current = es;
    es.onopen = () => setState((s) => ({ ...s, liveStatus: 'connected' }));
    es.onerror = () => setState((s) => ({ ...s, liveStatus: 'error' }));
    const refreshScheduler = createLiveRefreshScheduler(async () => {
      try {
        await loadFromUrl(dataUrl, state.accessToken);
      } catch {
        /* ignore individual refresh errors; next event will retry */
      }
    });
    refreshSchedulerRef.current = refreshScheduler;
    es.addEventListener('snapshot', refreshScheduler.request);
    es.addEventListener('hello', () => setState((s) => ({ ...s, liveStatus: 'connected' })));
  }, [loadFromUrl, state.accessToken, state.traceUrl]);

  const disconnectLive = useCallback(() => {
    refreshSchedulerRef.current?.cancel();
    refreshSchedulerRef.current = null;
    sseRef.current?.close();
    sseRef.current = null;
    autoConnectAttemptedRef.current = false;
    setStoredLiveMode(false);
    setState((s) => ({ ...s, liveMode: false, liveStatus: 'idle' }));
  }, []);

  const reload = useCallback(async () => {
    if (state.liveMode) {
      try {
        await loadFromUrl(endpoint(state.traceUrl, '/data'), state.accessToken);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, error: msg }));
      }
    }
  }, [state.liveMode, state.accessToken, state.traceUrl, loadFromUrl]);

  useEffect(
    () => () => {
      refreshSchedulerRef.current?.cancel();
      sseRef.current?.close();
    },
    []
  );

  useEffect(() => {
    if (!state.liveMode || autoConnectAttemptedRef.current || sseRef.current) return;
    autoConnectAttemptedRef.current = true;
    void connectLive();
  }, [connectLive, state.liveMode]);

  return {
    snapshot: state.snapshot,
    lastUpdatedAt: state.lastUpdatedAt,
    liveMode: state.liveMode,
    liveStatus: state.liveStatus,
    accessToken: state.accessToken,
    traceUrl: state.traceUrl,
    error: state.error,
    setAccessToken,
    setTraceUrl,
    loadFromUrl,
    connectLive,
    disconnectLive,
    reload,
  };
}
