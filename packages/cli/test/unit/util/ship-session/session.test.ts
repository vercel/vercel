import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApprovalWatcher,
  APPROVALS_DIRNAME,
  requestApproval,
  type ApprovalRequest,
} from '../../../../src/util/ship-session/approval';
import {
  readLedger,
  recordSessionEvent,
} from '../../../../src/util/ship-session/ledger';
import { SHIP_SESSION_DIR_ENV } from '../../../../src/util/ship-session/session-dir';

describe('ship session', () => {
  let sessionDir: string;
  let previousEnv: string | undefined;

  beforeEach(async () => {
    sessionDir = await mkdtemp(join(tmpdir(), 'ship-session-test-'));
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

  describe('ledger', () => {
    it('does nothing outside a session', async () => {
      recordSessionEvent({ type: 'deployment', url: 'https://x.vercel.app' });
      expect(await readLedger(sessionDir)).toEqual([]);
    });

    it('round-trips events inside a session', async () => {
      process.env[SHIP_SESSION_DIR_ENV] = sessionDir;
      recordSessionEvent({
        type: 'deployment',
        url: 'https://x.vercel.app',
        target: 'preview',
      });
      recordSessionEvent({
        type: 'resource-provisioned',
        integration: 'neon',
        resource: 'todo-db',
      });

      const events = await readLedger(sessionDir);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: 'deployment',
        url: 'https://x.vercel.app',
      });
      expect(events[0].at).toBeDefined();
      expect(events[1]).toMatchObject({ type: 'resource-provisioned' });
    });

    it('skips a torn line rather than losing the record', async () => {
      process.env[SHIP_SESSION_DIR_ENV] = sessionDir;
      recordSessionEvent({ type: 'command', command: 'build' });
      const { appendFileSync } = await import('node:fs');
      appendFileSync(join(sessionDir, 'ledger.ndjson'), '{"type":"comm');

      const events = await readLedger(sessionDir);
      expect(events).toHaveLength(1);
    });
  });

  describe('approval handshake', () => {
    const operation = {
      command: 'integration',
      argv: ['integration', 'add', 'neon'],
      cwd: '/tmp/project',
      gate: 'spend' as const,
      description: 'provisions a marketplace resource, which may be billed',
    };

    it('approves when the watcher approves', async () => {
      const asked: ApprovalRequest[] = [];
      const watcher = new ApprovalWatcher(
        sessionDir,
        async request => {
          asked.push(request);
          return { approved: true };
        },
        20
      );
      watcher.start();
      try {
        const { verdict } = await requestApproval(sessionDir, operation, {
          pollMs: 20,
          timeoutMs: 5_000,
        });
        expect(verdict).toBe('approved');
        expect(asked).toHaveLength(1);
        expect(asked[0].argv).toEqual(operation.argv);
        expect(asked[0].gate).toBe('spend');
      } finally {
        watcher.stop();
      }
    });

    it('denies when the watcher denies, and carries the steering line', async () => {
      const watcher = new ApprovalWatcher(
        sessionDir,
        async () => ({ approved: false, instruction: 'use the existing db' }),
        20
      );
      watcher.start();
      try {
        const { verdict, instruction } = await requestApproval(
          sessionDir,
          operation,
          { pollMs: 20, timeoutMs: 5_000 }
        );
        expect(verdict).toBe('denied');
        expect(instruction).toBe('use the existing db');
      } finally {
        watcher.stop();
      }
    });

    it('a prompt that throws is a denial, never an open gate', async () => {
      const watcher = new ApprovalWatcher(
        sessionDir,
        async () => {
          throw new Error('prompt exploded');
        },
        20
      );
      watcher.start();
      try {
        const { verdict } = await requestApproval(sessionDir, operation, {
          pollMs: 20,
          timeoutMs: 5_000,
        });
        expect(verdict).toBe('denied');
      } finally {
        watcher.stop();
      }
    });

    it('times out to a denial when nothing answers', async () => {
      const { verdict } = await requestApproval(sessionDir, operation, {
        pollMs: 20,
        timeoutMs: 200,
      });
      expect(verdict).toBe('timeout');
    });

    it('handles requests one at a time, in order', async () => {
      const order: string[] = [];
      const watcher = new ApprovalWatcher(
        sessionDir,
        async request => {
          order.push(request.command);
          // Hold the first prompt long enough for the second request to land.
          await new Promise(resolve => setTimeout(resolve, 100));
          return { approved: true };
        },
        20
      );
      watcher.start();
      try {
        const [first, second] = await Promise.all([
          requestApproval(
            sessionDir,
            { ...operation, command: 'first' },
            { pollMs: 20, timeoutMs: 5_000 }
          ),
          (async () => {
            await new Promise(resolve => setTimeout(resolve, 40));
            return requestApproval(
              sessionDir,
              { ...operation, command: 'second' },
              { pollMs: 20, timeoutMs: 5_000 }
            );
          })(),
        ]);
        expect(first.verdict).toBe('approved');
        expect(second.verdict).toBe('approved');
        expect(order).toEqual(['first', 'second']);
      } finally {
        watcher.stop();
      }
    });

    it('retries a request file that was caught mid-write', async () => {
      const dir = join(sessionDir, APPROVALS_DIRNAME);
      await mkdir(dir, { recursive: true });
      // A torn write: invalid JSON under the request name.
      await writeFile(join(dir, 'abc.request.json'), '{"id":"abc"');

      const watcher = new ApprovalWatcher(
        sessionDir,
        async () => ({ approved: true }),
        20
      );
      await watcher.scan();
      // Not answered, not poisoned: completing the file gets it handled.
      await writeFile(
        join(dir, 'abc.request.json'),
        JSON.stringify({
          id: 'abc',
          command: 'project',
          argv: ['project', 'rm', 'x'],
          cwd: '/',
          gate: 'remote-delete',
          description: 'permanently deletes a Vercel project',
          requestedAt: new Date().toISOString(),
        })
      );
      await watcher.scan();
      const response = JSON.parse(
        await readFile(join(dir, 'abc.response.json'), 'utf-8')
      );
      expect(response.approved).toBe(true);
    });
  });
});
