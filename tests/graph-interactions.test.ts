import assert from 'node:assert/strict';
import { test } from 'node:test';

import { graphInteractionProps } from '../src/lib/graph-interactions.js';

test('selected response frame hitboxes do not rise above runtime nodes', () => {
  assert.equal(graphInteractionProps.elevateNodesOnSelect, false);
});
