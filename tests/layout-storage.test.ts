import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applySavedNodeLayout,
  captureNodeLayout,
  readSavedNodeLayout,
  writeSavedNodeLayout,
} from '../src/lib/layout-storage.js';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test('saved node layout restores positions by node id after a browser refresh', () => {
  const nodes = [
    { id: 'response:1', position: { x: 0, y: 0 }, width: 1180, height: 1120 },
    { id: 'orchestrator:1', position: { x: 200, y: 200 }, width: 620, height: 210 },
  ];
  const saved = captureNodeLayout([
    { ...nodes[0], position: { x: 50, y: 60 } },
    { ...nodes[1], position: { x: 400, y: 500 } },
  ]);

  const restored = applySavedNodeLayout(nodes, saved);

  assert.deepEqual(restored[0].position, { x: 50, y: 60 });
  assert.deepEqual(restored[1].position, { x: 400, y: 500 });
});

test('layout storage round-trips saved positions and ignores malformed payloads', () => {
  const memoryStorage = storage();
  const key = 'agent-viz:layout:test';
  const saved = captureNodeLayout([{ id: 'node:1', position: { x: 12, y: 34 }, width: 100, height: 50 }]);

  writeSavedNodeLayout(memoryStorage, key, saved);

  assert.deepEqual(readSavedNodeLayout(memoryStorage, key), saved);

  memoryStorage.setItem(key, '{bad json');

  assert.equal(readSavedNodeLayout(memoryStorage, key), null);
});
