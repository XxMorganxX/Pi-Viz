import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLiveRefreshScheduler } from '../src/lib/live-refresh-scheduler.js';

test('live refresh scheduler coalesces bursty snapshot events', async () => {
  const scheduled: Array<() => void> = [];
  let refreshes = 0;
  const scheduler = createLiveRefreshScheduler(
    async () => {
      refreshes += 1;
    },
    {
      delayMs: 80,
      setTimer(callback, delayMs) {
        assert.equal(delayMs, 80);
        scheduled.push(callback);
        return scheduled.length;
      },
      clearTimer() {
        throw new Error('clearTimer should not run while a refresh is pending');
      },
    }
  );

  scheduler.request();
  scheduler.request();
  scheduler.request();

  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  assert.equal(refreshes, 1);
});

test('live refresh scheduler runs one trailing refresh after an in-flight refresh', async () => {
  const scheduled: Array<() => void> = [];
  const refreshes: number[] = [];
  let scheduler: ReturnType<typeof createLiveRefreshScheduler>;
  scheduler = createLiveRefreshScheduler(
    async () => {
      refreshes.push(refreshes.length + 1);
      if (refreshes.length === 1) scheduler.request();
    },
    {
      delayMs: 25,
      setTimer(callback) {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearTimer() {},
    }
  );

  scheduler.request();
  await scheduled[0]();

  assert.equal(refreshes.length, 1);
  assert.equal(scheduled.length, 2);

  await scheduled[1]();
  assert.deepEqual(refreshes, [1, 2]);
});

test('live refresh scheduler can cancel a pending refresh', () => {
  let clearCount = 0;
  const scheduler = createLiveRefreshScheduler(async () => {}, {
    delayMs: 80,
    setTimer() {
      return 42;
    },
    clearTimer(timer) {
      assert.equal(timer, 42);
      clearCount += 1;
    },
  });

  scheduler.request();
  scheduler.cancel();

  assert.equal(clearCount, 1);
});
