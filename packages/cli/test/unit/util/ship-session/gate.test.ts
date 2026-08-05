import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalWatcher } from '../../../../src/util/ship-session/approval';
import { confirmGatedOperation } from '../../../../src/util/ship-session/gate';
import { readLedger } from '../../../../src/util/ship-session/ledger';
import { SHIP_SESSION_DIR_ENV } from '../../../../src/util/ship-session/session-dir';

/**
 * The gate is called from inside command handlers, after their own argument
 * parsing — there is no shell-command classification to test. What matters
 * here: it is a no-op outside a session, it round-trips the handshake, it
 * journals the verdict, and one approval covers repeated guards in a process.
 */
describe('confirmGatedOperation', () => {
  let sessionDir: string;
  let previousEnv: string | undefined;

  beforeEach(async () => {
    sessionDir = await mkdtemp(join(tmpdir(), 'ship-gate-test-'));
    previousEnv = process.env[SHIP_SESSION_DIR_ENV];
    delete process.env[SHIP_SESSION_DIR_ENV];
  });

  afterEach(async () => {
    if (previousEnv === undefined) {
      delete process.env[SHIP_SESSION_DIR_ENV];
    } else {
      process.env[SHIP_SESSION_DIR_ENV] = previousEnv;
    }
    await rm(sessionDir, { recursive: true, force: true });
  });

  it('is a no-op outside a ship session', async () => {
    const proceed = await confirmGatedOperation({
      command: 'project rm',
      gate: 'remote-delete',
      description: 'permanently deletes the project "x"',
    });
    expect(proceed).toBe(true);
    expect(await readLedger(sessionDir)).toEqual([]);
  });

  it('proceeds on approval and journals the verdict; one approval covers the process', async () => {
    process.env[SHIP_SESSION_DIR_ENV] = sessionDir;
    let prompts = 0;
    const watcher = new ApprovalWatcher(
      sessionDir,
      async () => {
        prompts += 1;
        return { approved: true };
      },
      20
    );
    watcher.start();
    try {
      const operation = {
        command: 'deploy',
        gate: 'production' as const,
        description: 'deploys to production',
      };
      expect(await confirmGatedOperation(operation)).toBe(true);
      // The second guard on the same effect (deploy has two entry variants)
      // must not prompt again.
      expect(await confirmGatedOperation(operation)).toBe(true);
      expect(prompts).toBe(1);

      const events = await readLedger(sessionDir);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'approval',
        command: 'deploy',
        gate: 'production',
        verdict: 'approved',
      });
    } finally {
      watcher.stop();
    }
  });

  it('stops on denial and journals the steering line', async () => {
    process.env[SHIP_SESSION_DIR_ENV] = sessionDir;
    const watcher = new ApprovalWatcher(
      sessionDir,
      async () => ({ approved: false, instruction: 'reuse todo-db' }),
      20
    );
    watcher.start();
    try {
      const proceed = await confirmGatedOperation({
        command: 'integration add',
        gate: 'spend',
        description: 'provisions "x" from the neon integration — may be billed',
      });
      expect(proceed).toBe(false);

      const events = await readLedger(sessionDir);
      expect(events[0]).toMatchObject({
        type: 'approval',
        verdict: 'denied',
        instruction: 'reuse todo-db',
      });
    } finally {
      watcher.stop();
    }
  });
});
