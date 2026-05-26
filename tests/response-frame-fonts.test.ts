import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const responseFrameSource = readFileSync(
  new URL('../src/components/ResponseFrameNode.tsx', import.meta.url),
  'utf8'
);

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  assert.ok(matches.length > 0, `Missing CSS rule for ${selector}`);
  return matches.at(-1)![1];
}

test('response frame prompt preview is 250 percent font size', () => {
  assert.match(ruleFor('.response-frame-header .response-frame-preview strong'), /font-size:\s*250%;/);
});

test('response frame output preview is 175 percent font size', () => {
  assert.match(ruleFor('.response-frame-footer .response-frame-preview strong'), /font-size:\s*175%;/);
});

test('response frame labels are prominent at 180 percent', () => {
  assert.match(ruleFor('.response-frame-header span,\n.response-frame-footer span'), /font-size:\s*180%;/);
});

test('response frame previews expose click-to-expand controls', () => {
  assert.match(responseFrameSource, /useState/);
  assert.match(responseFrameSource, /aria-expanded=\{expandedPrompt\}/);
  assert.match(responseFrameSource, /aria-expanded=\{expandedAssistant\}/);
  assert.match(responseFrameSource, /response-frame-preview nodrag \$\{expandedPrompt \? 'expanded' : ''\}/);
  assert.match(responseFrameSource, /response-frame-preview nodrag \$\{expandedAssistant \? 'expanded' : ''\}/);
  assert.match(ruleFor('.response-frame-preview'), /pointer-events:\s*auto;/);
  assert.match(ruleFor('.response-frame-preview.expanded strong'), /white-space:\s*normal;/);
});

test('expanded assistant response grows the visible response frame downward', () => {
  assert.match(responseFrameSource, /assistant-expanded/);
  assert.match(ruleFor('.node-response-frame.assistant-expanded'), /height:\s*calc\(100% \+ 420px\);/);
  assert.match(ruleFor('.node-response-frame.assistant-expanded'), /overflow:\s*visible;/);
  assert.match(ruleFor('.response-frame-footer.assistant-expanded'), /align-items:\s*flex-start;/);
  assert.match(ruleFor('.response-frame-footer.assistant-expanded'), /max-height:\s*390px;/);
});

test('expanded assistant response preserves prose structure', () => {
  assert.match(
    ruleFor('.response-frame-footer.assistant-expanded .response-frame-preview.expanded strong'),
    /white-space:\s*pre-wrap;/
  );
  assert.match(
    ruleFor('.response-frame-footer.assistant-expanded .response-frame-preview.expanded strong'),
    /overflow-wrap:\s*anywhere;/
  );
});
