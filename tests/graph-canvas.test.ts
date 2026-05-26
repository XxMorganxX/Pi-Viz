import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const graphCanvasSource = readFileSync(
  new URL('../src/components/GraphCanvas.tsx', import.meta.url),
  'utf8'
);
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('graph canvas does not render the React Flow minimap', () => {
  assert.equal(graphCanvasSource.includes('MiniMap'), false);
});

test('graph canvas does not render a custom legend overlay', () => {
  assert.equal(graphCanvasSource.includes('<Legend />'), false);
  assert.equal(graphCanvasSource.includes('function Legend'), false);
  assert.equal(stylesSource.includes('.legend'), false);
});

test('graph node titles are emphasized while metadata is subdued', () => {
  assert.match(stylesSource, /\.node \.title \{[^}]*font-size: 39px;/);
  assert.match(stylesSource, /\.node \.meta \{[^}]*font-size: 20px;/);
  assert.match(stylesSource, /\.node-mission \.title \{[^}]*font-size: 39px;/);
  assert.match(stylesSource, /\.node-mission \.meta \{[^}]*font-size: 20px;/);
});

test('graph color accents are strong enough to read without a legend', () => {
  assert.match(stylesSource, /--linear: #7cc4ff;/);
  assert.match(stylesSource, /--halo: #d18cff;/);
  assert.match(stylesSource, /--google: #ffb020;/);
  assert.match(stylesSource, /--openai: #16d6a5;/);
  assert.match(stylesSource, /--anthropic: #ff8a66;/);
  assert.match(stylesSource, /\.node-mission \{[^}]*background: rgba\(124, 196, 255, 0\.1\);[^}]*border: 2px dashed var\(--linear\);/);
  assert.match(stylesSource, /\.node-thread \{[^}]*border-left: 6px solid var\(--linear\);/);
  assert.match(stylesSource, /\.node-agent-execution \{[^}]*border-left: 6px solid var\(--other\);/);
});

test('request navigator exposes previous and next request controls', () => {
  assert.match(appSource, /aria-label="Previous request"/);
  assert.match(appSource, /aria-label="Next request"/);
  assert.match(stylesSource, /\.request-navigator/);
});

test('graph canvas focuses requested response frames with React Flow fitView', () => {
  assert.match(graphCanvasSource, /focusedNodeId/);
  assert.match(graphCanvasSource, /fitView\(\{\s*nodes: \[\{ id: focusedNodeId \}\]/s);
});

test('camera focus requests are separate from persistent response frame selection', () => {
  assert.match(appSource, /cameraFocusNodeId/);
  assert.doesNotMatch(appSource, /focusedNodeId=\{focusedResponseFrameId\}/);
  assert.match(appSource, /setCameraFocusNodeId\(nextId\)/);
  assert.match(graphCanvasSource, /onFocusedNodeSettled/);
});

test('graph canvas keeps response frame bounds synced after node changes', () => {
  assert.match(graphCanvasSource, /syncResponseFrameBounds/);
  assert.match(graphCanvasSource, /applyNodeChanges/);
});

test('response frame shell accepts drag input without blocking contained nodes layered above it', () => {
  assert.match(stylesSource, /\.react-flow__node\.response-frame-shell \{[^}]*pointer-events: auto;/);
  assert.match(stylesSource, /\.node-response-frame \{[^}]*cursor: move;/);
});
