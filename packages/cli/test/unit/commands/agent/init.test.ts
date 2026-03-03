import { describe, beforeEach, expect, it } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import agent from '../../../../src/commands/agent';

describe('agent init', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = setupTmpDir();
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('should display help and return 2', async () => {
      client.setArgv('agent', '--help');
      const exitCode = await agent(client);
      expect(exitCode).toBe(2);
    });

    it('tracks telemetry', async () => {
      client.setArgv('agent', '--help');
      const exitCode = await agent(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'agent',
        },
      ]);
    });
  });

  describe('when no AGENTS.md exists', () => {
    it('should create AGENTS.md with best practices in TTY mode', async () => {
      client.setArgv('agent', 'init');
      const exitCodePromise = agent(client);

      await expect(client.stderr).toOutput(
        'add Vercel best practices to your AGENTS.md'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Created AGENTS.md');

      const exitCode = await exitCodePromise;
      expect(exitCode).toBe(0);

      const content = await fs.readFile(join(cwd, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('## Best practices for developing on Vercel');
    });

    it('should create AGENTS.md without prompt in non-TTY mode with --yes', async () => {
      client.setArgv('agent', 'init', '--yes');
      client.stdin.isTTY = false;

      const exitCode = await agent(client);
      expect(exitCode).toBe(0);

      await expect(client.stderr).toOutput('Created AGENTS.md');

      const content = await fs.readFile(join(cwd, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('## Best practices for developing on Vercel');
    });

    it('should error in non-TTY mode without --yes', async () => {
      client.setArgv('agent', 'init');
      client.stdin.isTTY = false;

      const exitCodePromise = agent(client);

      await expect(client.stderr).toOutput('Missing required flag --yes');

      const exitCode = await exitCodePromise;
      expect(exitCode).toBe(1);
    });
  });

  describe('when AGENTS.md exists without best practices', () => {
    it('should append best practices to existing AGENTS.md', async () => {
      const existingContent = '# My Project Agents\n\nSome existing content.\n';
      await fs.writeFile(join(cwd, 'AGENTS.md'), existingContent);

      client.setArgv('agent', 'init');
      const exitCodePromise = agent(client);

      await expect(client.stderr).toOutput(
        'add Vercel best practices to your AGENTS.md'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Appended Vercel best practices');

      const exitCode = await exitCodePromise;
      expect(exitCode).toBe(0);

      const content = await fs.readFile(join(cwd, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('# My Project Agents');
      expect(content).toContain('## Best practices for developing on Vercel');
    });
  });

  describe('when AGENTS.md already has best practices', () => {
    it('should skip and return 0', async () => {
      const existingContent =
        '# Agents\n\n## Best practices for developing on Vercel\n\nAlready here.\n';
      await fs.writeFile(join(cwd, 'AGENTS.md'), existingContent);

      client.setArgv('agent', 'init');
      const exitCode = await agent(client);
      expect(exitCode).toBe(0);

      await expect(client.stderr).toOutput(
        'Vercel best practices already present in AGENTS.md'
      );

      const content = await fs.readFile(join(cwd, 'AGENTS.md'), 'utf-8');
      expect(content).toBe(existingContent);
    });
  });

  describe('TTY confirmation prompt', () => {
    it('should return 0 with Canceled when user declines', async () => {
      client.setArgv('agent', 'init');
      const exitCodePromise = agent(client);

      await expect(client.stderr).toOutput(
        'add Vercel best practices to your AGENTS.md'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Canceled');

      const exitCode = await exitCodePromise;
      expect(exitCode).toBe(0);

      expect(fs.existsSync(join(cwd, 'AGENTS.md'))).toBe(false);
    });
  });

  describe('implicit init subcommand', () => {
    it('should run init when no subcommand is provided', async () => {
      client.setArgv('agent', '--yes');
      client.stdin.isTTY = false;

      const exitCode = await agent(client);
      expect(exitCode).toBe(0);

      await expect(client.stderr).toOutput('Created AGENTS.md');

      const content = await fs.readFile(join(cwd, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('## Best practices for developing on Vercel');
    });
  });

  describe('unknown subcommand', () => {
    it('should return 1 for unknown subcommand', async () => {
      client.setArgv('agent', 'unknown');
      const exitCode = await agent(client);
      expect(exitCode).toBe(1);
    });
  });
});
