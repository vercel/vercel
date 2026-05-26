import async_hooks from 'node:async_hooks';
import { NowBuildError, type Span } from '@vercel/build-utils';

const TRACKED_ASYNC_TYPES = new Set(['Timeout', 'Immediate']);

async function settleEventLoop(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
}

export function createBuildResourceTracker() {
  const pending = new Map<number, string>();
  const hook = async_hooks.createHook({
    init(asyncId, type) {
      if (TRACKED_ASYNC_TYPES.has(type)) {
        pending.set(asyncId, type);
      }
    },
    destroy(asyncId) {
      pending.delete(asyncId);
    },
  });

  return {
    start() {
      pending.clear();
      hook.enable();
    },
    stop() {
      hook.disable();
    },
    getPendingTypes(): string[] {
      return [...new Set(pending.values())];
    },
  };
}

export async function assertBuildProcessIdle(
  tracker: ReturnType<typeof createBuildResourceTracker>,
  span?: Span
): Promise<void> {
  await settleEventLoop();
  tracker.stop();

  const pendingTypes = tracker.getPendingTypes();
  const leakingTimers = pendingTypes.filter(type => type === 'Timeout');

  span?.setAttributes({
    pendingAsyncResourceTypes: pendingTypes.join(',') || undefined,
    leakingTimerCount:
      leakingTimers.length > 0 ? String(leakingTimers.length) : undefined,
    hangDetected: leakingTimers.length > 0 ? 'true' : 'false',
  });

  if (leakingTimers.length > 0) {
    throw new NowBuildError({
      code: 'BUILD_PROCESS_HANG',
      message: `Build completed but left active async resources (${leakingTimers.join(', ')}) that would prevent the CLI from exiting. This usually means a builder or build plugin did not clean up resources.`,
      link: 'https://vercel.link/build-process-hang',
    });
  }
}
