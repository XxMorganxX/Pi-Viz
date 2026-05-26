export interface LiveRefreshScheduler {
  request: () => void;
  cancel: () => void;
}

interface SchedulerOptions<TimerHandle> {
  delayMs?: number;
  setTimer?: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

const DEFAULT_DELAY_MS = 80;

export function createLiveRefreshScheduler<TimerHandle = ReturnType<typeof setTimeout>>(
  refresh: () => Promise<void>,
  options: SchedulerOptions<TimerHandle> = {}
): LiveRefreshScheduler {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const setTimer =
    options.setTimer ??
    (((callback: () => void | Promise<void>, delay: number) =>
      setTimeout(() => {
        void callback();
      }, delay)) as SchedulerOptions<TimerHandle>['setTimer']);
  const clearTimer =
    options.clearTimer ??
    (((timer: TimerHandle) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    }) as SchedulerOptions<TimerHandle>['clearTimer']);

  let timer: TimerHandle | null = null;
  let running = false;
  let requestedWhileRunning = false;

  const schedule = () => {
    if (timer !== null) return;
    timer = setTimer!(run, delayMs);
  };

  const run = async () => {
    timer = null;
    if (running) {
      requestedWhileRunning = true;
      return;
    }

    running = true;
    try {
      await refresh();
    } finally {
      running = false;
      if (requestedWhileRunning) {
        requestedWhileRunning = false;
        schedule();
      }
    }
  };

  return {
    request() {
      if (running) {
        requestedWhileRunning = true;
        return;
      }
      schedule();
    },
    cancel() {
      if (timer !== null) clearTimer!(timer);
      timer = null;
      requestedWhileRunning = false;
    },
  };
}
