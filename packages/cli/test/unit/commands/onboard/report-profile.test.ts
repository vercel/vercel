import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportProfileOnAbort } from '../../../../src/commands/onboard/report-profile';
import { OnboardProfile } from '../../../../src/commands/onboard/profile';

/**
 * The abort path is the one that strands processes.
 *
 * `process.exit()` runs no `finally` block, so everything the normal exit
 * path does for the harness bridge — stopping it — has to be reachable from
 * the signal handler too. These tests pin that reachability, because the
 * failure mode is invisible until someone finds an orphaned agent in `ps`.
 *
 * No profile carries a `session` span here, so `reportProfile` short-circuits
 * and nothing touches the global config directory.
 */

const release: Array<() => void> = [];

afterEach(() => {
  while (release.length) release.pop()?.();
  vi.restoreAllMocks();
});

/** Install handlers, and guarantee removal even if an expectation fails. */
function install(profile: OnboardProfile) {
  const handlers = reportProfileOnAbort(profile);
  release.push(() => handlers.release());
  return handlers;
}

/**
 * Replace `process.exit` and resolve when the handler reaches it. Awaiting
 * the call is what makes these tests deterministic: the signal handler body
 * is fire-and-forget, so there is nothing else to await.
 */
function exitSignal(): { calls: number[]; reached: Promise<number> } {
  const calls: number[] = [];
  let resolve!: (code: number) => void;
  const reached = new Promise<number>(r => {
    resolve = r;
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    calls.push(code ?? 0);
    resolve(code ?? 0);
    return undefined;
  }) as never);
  return { calls, reached };
}

describe('reportProfileOnAbort', () => {
  it('runs the registered teardown before exiting', async () => {
    const order: string[] = [];
    const exit = exitSignal();

    const handlers = install(new OnboardProfile());
    handlers.onAbort(async () => {
      order.push('teardown');
    });

    process.emit('SIGINT', 'SIGINT');
    await exit.reached;
    order.push('exit');

    expect(order).toEqual(['teardown', 'exit']);
  });

  it('waits for a slow teardown rather than exiting through it', async () => {
    let stopped = false;
    const exit = exitSignal();

    const handlers = install(new OnboardProfile());
    handlers.onAbort(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      stopped = true;
    });

    process.emit('SIGINT', 'SIGINT');
    await exit.reached;

    expect(stopped).toBe(true);
  });

  it('exits with the conventional code for the signal', async () => {
    const exit = exitSignal();
    install(new OnboardProfile());

    process.emit('SIGTERM', 'SIGTERM');
    await exit.reached;

    expect(exit.calls[0]).toBe(143);
  });

  it('still exits when the teardown throws', async () => {
    const exit = exitSignal();

    const handlers = install(new OnboardProfile());
    handlers.onAbort(async () => {
      throw new Error('bridge already gone');
    });

    process.emit('SIGINT', 'SIGINT');
    await exit.reached;

    expect(exit.calls[0]).toBe(130);
  });

  it('does not require a teardown to be registered', async () => {
    const exit = exitSignal();
    install(new OnboardProfile());

    process.emit('SIGINT', 'SIGINT');
    await exit.reached;

    expect(exit.calls[0]).toBe(130);
  });

  it('stops listening once released', () => {
    const before = process.listenerCount('SIGINT');
    const handlers = reportProfileOnAbort(new OnboardProfile());
    expect(process.listenerCount('SIGINT')).toBe(before + 1);

    handlers.release();
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
