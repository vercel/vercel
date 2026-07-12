import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import git from '../../../../src/commands/git';
import { client } from '../../../mocks/client';

describe('git', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'git';

      client.setArgv(command, '--help');
      const exitCode = await git(client);
      expect(exitCode, 'exit code for git').toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('displays help when invoked without subcommand', async () => {
    client.setArgv('git');
    const exitCode = await git(client);
    expect(exitCode, 'exit code for git').toBe(2);
  });

  describe('passthrough', () => {

    it('passes through unknown args to git and returns its exit code', async () => {
      // We can't easily mock the already-imported spawn without vi.mock hoisting,
      // so test the routing: unknown subcommand should not return 2 (help) anymore.
      // Instead it attempts git passthrough. Since we didn't mock spawn here (it would be real git),
      // we verify that the new behavior does NOT return help exit code 2 for a real git subcommand like `status`.
      // `git status` will either succeed (0) if inside a repo or fail (128) if not, but never 2 from CLI help.

      // Setup a temp cwd that is a git repo to get deterministic 0
      const { mkdtempSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { execSync } = await import('child_process');
      const { join } = await import('path');
      const dir = mkdtempSync(join(tmpdir(), 'vc-git-test-'));
      execSync('git init -q', { cwd: dir });
      client.cwd = dir;

      client.setArgv('git', 'status', '--short');
      const exitCode = await git(client);
      // git status --short in empty repo should be 0
      expect([0, 128]).toContain(exitCode);
      expect(exitCode).not.toEqual(2);
    });

    it('tracks passthrough telemetry', async () => {
      const { mkdtempSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { execSync } = await import('child_process');
      const { join } = await import('path');
      const dir = mkdtempSync(join(tmpdir(), 'vc-git-test-'));
      execSync('git init -q', { cwd: dir });
      client.cwd = dir;

      client.setArgv('git', 'status');
      await git(client);

      const events = client.telemetryEventStore.readonlyEvents;
      const hasPassthrough = events.some(e => e.key === 'subcommand:passthrough');
      expect(hasPassthrough).toBe(true);
    });
  });
});
