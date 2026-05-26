import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getStoredLiveMode,
  setStoredLiveMode,
  type LivePreferenceStorage,
} from '../src/lib/live-connection-preferences.js';

function createStorage(): LivePreferenceStorage {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('live mode preference survives a page refresh until disconnected', () => {
  const storage = createStorage();

  assert.equal(getStoredLiveMode(storage), false);

  setStoredLiveMode(true, storage);
  assert.equal(getStoredLiveMode(storage), true);

  setStoredLiveMode(false, storage);
  assert.equal(getStoredLiveMode(storage), false);
});
