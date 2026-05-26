import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const graphCanvasSource = readFileSync(
  new URL('../src/components/GraphCanvas.tsx', import.meta.url),
  'utf8'
);
const agentExecutionNodeSource = readFileSync(
  new URL('../src/components/AgentExecutionNode.tsx', import.meta.url),
  'utf8'
);
const parseSource = readFileSync(new URL('../src/lib/parse.ts', import.meta.url), 'utf8');
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

test('subagent node color classes do not depend on provider or model', () => {
  assert.match(agentExecutionNodeSource, /const providerClass = view\.role === 'orchestrator'/);
  assert.match(agentExecutionNodeSource, /role-\$\{view\.role\} \$\{providerClass\}/);
  assert.doesNotMatch(agentExecutionNodeSource, /role-\$\{view\.role\} provider-\$\{provider\}/);
  assert.match(stylesSource, /\.node-agent-execution\.role-subagent \{[^}]*var\(--agent-accent/);
});

test('subagent identity accents use the requested pastel palette with rich outlines', () => {
  const paletteMatch = parseSource.match(/const AGENT_ACCENTS = \[([\s\S]*?)\];/);
  assert.ok(paletteMatch);

  const colors = Array.from(paletteMatch[1].matchAll(/'(#(?:[0-9a-f]{6}))'/gi), (match) => match[1]);
  assert.deepEqual(colors, [
    '#fbf8cc',
    '#fde4cf',
    '#ffcfd2',
    '#f1c0e8',
    '#cfbaf0',
    '#a3c4f3',
    '#90dbf4',
    '#8eecf5',
    '#98f5e1',
    '#b9fbc0',
  ]);

  assert.match(parseSource, /--agent-accent-surface/);
  assert.match(parseSource, /const outlineRgb = richOutlineRgb\(surfaceRgb\)/);
  const surfaceTintMatch = parseSource.match(/'--agent-accent-surface': `rgba\(\$\{surfaceRgb\.r\}, \$\{surfaceRgb\.g\}, \$\{surfaceRgb\.b\}, ([0-9.]+)\)`/);
  assert.ok(surfaceTintMatch);
  const surfaceOpacity = Number(surfaceTintMatch[1]);
  assert.ok(surfaceOpacity >= 0.16, 'subagent background should keep a visible pastel tint');
  assert.ok(surfaceOpacity <= 0.2, 'subagent background should stay subtle instead of becoming a bright color block');
  assert.doesNotMatch(parseSource, /pastelizeRgb|darkenAccentRgb|softAccentSurfaceRgb/);
  assert.match(stylesSource, /\.node-agent-execution\.role-subagent \{[^}]*border: 1px solid var\(--agent-accent/);
  assert.match(stylesSource, /\.node-agent-execution\.role-subagent\.exit-nonzero \{[^}]*border: 1px solid var\(--agent-accent/);
  assert.match(stylesSource, /\.node-agent-execution\.role-subagent \{[^}]*var\(--agent-accent-surface/);
  assert.doesNotMatch(stylesSource, /\.node-agent-execution\.role-subagent \{[^}]*#11131a/);
  assert.doesNotMatch(stylesSource, /\.node-agent-execution\.role-subagent \{[^}]*linear-gradient/);
});

test('request navigator exposes previous and next request controls', () => {
  assert.match(appSource, /aria-label="Previous request"/);
  assert.match(appSource, /aria-label="Next request"/);
  assert.match(stylesSource, /\.request-navigator/);
});

function hexToRgb(color: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function hslForRgb(r: number, g: number, b: number): { lightness: number; saturation: number } {
  const channels = [r, g, b].map((channel) => channel / 255);
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return { lightness, saturation };
}

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
