import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shortMissionTitle } from '../src/lib/format.js';

test('shortMissionTitle keeps node header titles up to 100 characters by default', () => {
  const title = 'a'.repeat(100);

  assert.equal(shortMissionTitle(title), title);
});

test('shortMissionTitle truncates default node header titles after 100 characters', () => {
  const title = 'a'.repeat(101);

  assert.equal(shortMissionTitle(title), `${'a'.repeat(99)}…`);
});
