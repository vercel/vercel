import type { Sandbox } from '@vercel/sandbox';
import ms from 'ms';
import createDebugger from 'debug';
import { setTimeout } from 'node:timers/promises';

const debug = createDebugger('sandbox:timeout');

const BUFFER = ms('10 seconds');

export async function extendSandboxTimeoutPeriodically(
  sandbox: Sandbox,
  signal: AbortSignal
): Promise<void> {
  const session = sandbox.currentSession();
  const timeout = session.timeout;
  if (timeout == null) return;

  const nextTick = session.createdAt.getTime() + timeout;
  debug(`next tick: ${new Date(nextTick).toISOString()}`);

  while (!signal.aborted) {
    const currentTimeout = session.timeout;
    if (currentTimeout == null) return;

    const sleepMs =
      session.createdAt.getTime() + currentTimeout - Date.now() - BUFFER;
    if (sleepMs > 2000) {
      debug(`sleeping for ${sleepMs}ms until next timeout extension`);
      await setTimeout(sleepMs, null, { signal });
    }
    await sandbox.extendTimeout(ms('5 minutes'));
    const updatedTimeout = session.timeout;
    if (updatedTimeout == null) return;
    const updatedNextTick = session.createdAt.getTime() + updatedTimeout;
    debug(
      `extended sandbox timeout by 5 minutes. next tick: ${new Date(updatedNextTick).toISOString()}`
    );
  }
}
