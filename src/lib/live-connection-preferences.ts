export interface LivePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LIVE_MODE_STORAGE_KEY = 'agent-viz.liveMode';

function browserStorage(): LivePreferenceStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getStoredLiveMode(storage: LivePreferenceStorage | null = browserStorage()): boolean {
  return storage?.getItem(LIVE_MODE_STORAGE_KEY) === 'true';
}

export function setStoredLiveMode(
  enabled: boolean,
  storage: LivePreferenceStorage | null = browserStorage()
): void {
  if (!storage) return;
  if (enabled) {
    storage.setItem(LIVE_MODE_STORAGE_KEY, 'true');
  } else {
    storage.removeItem(LIVE_MODE_STORAGE_KEY);
  }
}
