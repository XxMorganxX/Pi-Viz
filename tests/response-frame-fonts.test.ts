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

test('response frame prompt preview scales with the prompt label', () => {
  assert.match(ruleFor('.response-frame-header .response-frame-preview strong'), /font-size:\s*44px;/);
  assert.match(ruleFor('.response-frame-header .response-frame-preview strong'), /font-weight:\s*700;/);
});

test('response frame output preview is 175 percent font size', () => {
  assert.match(ruleFor('.response-frame-footer .response-frame-preview strong'), /font-size:\s*175%;/);
});

test('response frame prompt label is styled as a compact pill', () => {
  assert.match(responseFrameSource, /className="response-frame-label"/);
  assert.match(ruleFor('.response-frame-label'), /border-radius:\s*5px;/);
  assert.match(ruleFor('.response-frame-label'), /letter-spacing:\s*0;/);
  assert.match(ruleFor('.response-frame-label'), /text-transform:\s*uppercase;/);
  assert.match(ruleFor('.response-frame-header .response-frame-label'), /font-size:\s*30px;/);
});

test('response frame header has a refined surface', () => {
  assert.match(ruleFor('.response-frame-header'), /padding:\s*10px 12px;/);
  assert.match(ruleFor('.response-frame-header'), /border-radius:\s*7px;/);
  assert.match(ruleFor('.response-frame-header'), /box-shadow:/);
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
