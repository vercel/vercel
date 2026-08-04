import { describe, beforeEach, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import ship from '../../../../src/commands/ship';

describe('ship', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = setupTmpDir();
    client.cwd = cwd;
    useUser();
  });

  describe('--help', () => {
    it('displays help and returns 2', async () => {
      client.setArgv('ship', '--help');
      const exitCode = await ship(client);
      expect(exitCode).toBe(2);
    });

    it('tracks telemetry', async () => {
      client.setArgv('ship', '--help');
      await ship(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'ship' },
      ]);
    });
  });

  describe('--list-harnesses', () => {
    it('returns 0 and reports every known harness', async () => {
      client.setArgv('ship', '--list-harnesses', '--json');
      const exitCode = await ship(client);
      expect(exitCode).toBe(0);

      const payload = JSON.parse(await client.stdout.getFullOutput());
      const ids = payload.harnesses.map((h: { id: string }) => h.id);

      expect(ids).toEqual([
        'claude-code',
        'codex',
        'opencode',
        'pi',
        'deepagents',
      ]);
    });

    it('reports a valid status for every harness', async () => {
      client.setArgv('ship', '--list-harnesses', '--json');
      await ship(client);

      const payload = JSON.parse(await client.stdout.getFullOutput());
      for (const harness of payload.harnesses) {
        expect(['ready', 'unverified', 'missing']).toContain(harness.status);
      }
    });

    it('never leaks a credential value into the output', async () => {
      client.setArgv('ship', '--list-harnesses', '--json');
      await ship(client);

      const raw = await client.stdout.getFullOutput();
      expect(raw).not.toMatch(/api[_-]?key/i);
      expect(raw).not.toMatch(/token/i);
    });

    it('tracks telemetry', async () => {
      client.setArgv('ship', '--list-harnesses');
      await ship(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:list-harnesses', value: 'TRUE' },
      ]);
    });
  });

  describe('--print-prompt', () => {
    it('writes the instructions to stdout and returns 0', async () => {
      client.setArgv('ship', '--print-prompt');
      const exitCode = await ship(client);
      expect(exitCode).toBe(0);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt.endsWith('\n')).toBe(true);
    });

    it('substitutes the workspace path', async () => {
      client.setArgv('ship', '--print-prompt');
      await ship(client);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt).toContain(cwd);
      expect(prompt).not.toContain('{{WORKSPACE}}');
    });

    it('substitutes the preflight context', async () => {
      client.setArgv('ship', '--print-prompt');
      await ship(client);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt).not.toContain('{{VERCEL_CONTEXT}}');
      expect(prompt).toContain('Vercel CLI version:');
    });

    it('does not require a harness to be installed', async () => {
      client.setArgv('ship', '--print-prompt', '--harness', 'deepagents');
      const exitCode = await ship(client);
      // deepagents has no local CLI, so it is never detected. Printing the
      // prompt must still work.
      expect(exitCode).toBe(0);
    });

    it('appends the dry-run override when --dry-run is passed', async () => {
      client.setArgv('ship', '--print-prompt', '--dry-run');
      const exitCode = await ship(client);
      expect(exitCode).toBe(0);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt).toContain('## Override: dry run');
      expect(prompt).toContain('Do not deploy');
    });

    it('omits the dry-run override by default', async () => {
      client.setArgv('ship', '--print-prompt');
      await ship(client);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt).not.toContain('## Override: dry run');
    });
  });

  describe('--prompt', () => {
    it('uses the supplied file and still substitutes placeholders', async () => {
      const promptPath = join(cwd, 'custom.md');
      writeFileSync(promptPath, 'Custom mission for {{WORKSPACE}}.\n', 'utf-8');

      client.setArgv('ship', '--print-prompt', '--prompt', promptPath);
      const exitCode = await ship(client);
      expect(exitCode).toBe(0);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt).toContain(`Custom mission for ${cwd}.`);
      expect(prompt.trim()).toBe(`Custom mission for ${cwd}.`);
    });

    it('returns 1 when the file does not exist', async () => {
      client.setArgv(
        'ship',
        '--print-prompt',
        '--prompt',
        join(cwd, 'missing.md')
      );
      const exitCode = await ship(client);
      expect(exitCode).toBe(1);
    });
  });

  describe('workspace resolution', () => {
    it('returns 1 for a directory that does not exist', async () => {
      client.setArgv('ship', join(cwd, 'nope'), '--print-prompt');
      const exitCode = await ship(client);
      expect(exitCode).toBe(1);

      await expect(client.stderr).toOutput('Directory does not exist');
    });

    it('returns 1 when the path is a file', async () => {
      const filePath = join(cwd, 'a-file.txt');
      writeFileSync(filePath, 'x', 'utf-8');

      client.setArgv('ship', filePath, '--print-prompt');
      const exitCode = await ship(client);
      expect(exitCode).toBe(1);

      await expect(client.stderr).toOutput('Not a directory');
    });

    it('resolves a relative path against the current directory', async () => {
      const nested = join(cwd, 'apps', 'web');
      require('fs-extra').mkdirpSync(nested);

      client.setArgv('ship', 'apps/web', '--print-prompt');
      const exitCode = await ship(client);
      expect(exitCode).toBe(0);

      const prompt = await client.stdout.getFullOutput();
      expect(prompt).toContain(nested);
    });
  });

  describe('--harness', () => {
    it('returns 1 for an unknown harness id', async () => {
      client.setArgv('ship', '--harness', 'not-a-harness');
      const exitCode = await ship(client);
      expect(exitCode).toBe(1);

      await expect(client.stderr).toOutput('Unknown harness');
    });

    it('lists the supported ids when an unknown one is passed', async () => {
      client.setArgv('ship', '--harness', 'not-a-harness');
      await ship(client);

      await expect(client.stderr).toOutput('claude-code');
    });

    it('redacts the harness value in telemetry', async () => {
      client.setArgv('ship', '--harness', 'codex', '--print-prompt');
      await ship(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:harness', value: '[REDACTED]' },
        { key: 'flag:print-prompt', value: 'TRUE' },
      ]);
    });

    it('redacts a user-supplied prompt path in telemetry', async () => {
      const promptPath = join(cwd, 'custom.md');
      writeFileSync(promptPath, 'hello\n', 'utf-8');

      client.setArgv('ship', '--print-prompt', '--prompt', promptPath);
      await ship(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:prompt', value: '[REDACTED]' },
        { key: 'flag:print-prompt', value: 'TRUE' },
      ]);
    });
  });
});
