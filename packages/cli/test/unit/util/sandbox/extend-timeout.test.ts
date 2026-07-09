import { describe, expect, it, vi } from 'vitest';
import { extendSandboxTimeoutPeriodically } from '../../../../src/util/sandbox/extend-timeout';

function fakeSandbox(session: { timeout: number | null; createdAt: Date }) {
  return {
    currentSession: vi.fn(() => session),
    extendTimeout: vi.fn(async (duration: number) => {
      if (session.timeout != null) {
        session.timeout += duration;
      }
    }),
  };
}

describe('extendSandboxTimeoutPeriodically', () => {
  it('extends the timeout and stops once the signal aborts', async () => {
    const controller = new AbortController();
    const session = { timeout: 5000, createdAt: new Date(Date.now() - 1000) };
    const sandbox = fakeSandbox(session);
    sandbox.extendTimeout.mockImplementation(async (duration: number) => {
      session.timeout! += duration;
      controller.abort();
    });

    await extendSandboxTimeoutPeriodically(sandbox as never, controller.signal);

    expect(sandbox.extendTimeout).toHaveBeenCalledTimes(1);
    expect(sandbox.extendTimeout).toHaveBeenCalledWith(5 * 60 * 1000);
  });

  it('does nothing when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const session = { timeout: 5000, createdAt: new Date() };
    const sandbox = fakeSandbox(session);

    await extendSandboxTimeoutPeriodically(sandbox as never, controller.signal);

    expect(sandbox.extendTimeout).not.toHaveBeenCalled();
  });

  it('returns without extending when the session has no timeout', async () => {
    const controller = new AbortController();
    const session = { timeout: null, createdAt: new Date() };
    const sandbox = fakeSandbox(session);

    await extendSandboxTimeoutPeriodically(sandbox as never, controller.signal);

    expect(sandbox.extendTimeout).not.toHaveBeenCalled();
  });

  it('rejects promptly if the signal aborts mid-sleep', async () => {
    const controller = new AbortController();
    const session = { timeout: 60_000, createdAt: new Date() };
    const sandbox = fakeSandbox(session);

    const promise = extendSandboxTimeoutPeriodically(
      sandbox as never,
      controller.signal
    );
    queueMicrotask(() => controller.abort());

    await expect(promise).rejects.toThrow();
    expect(sandbox.extendTimeout).not.toHaveBeenCalled();
  });
});
