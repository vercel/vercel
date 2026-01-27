import { describe, it, expect, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';

describe('env ls', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-ls',
        name: 'vercel-env-ls',
      },
      []
    );
    const cwd = setupUnitFixture('commands/env/vercel-env-ls');
    client.cwd = cwd;
  });

  describe('invalid argument', () => {
    it('errors', async () => {
      client.setArgv('target', 'ls', 'preview', 'branch-name', 'balderdash');
      const exitCode = await env(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('tracks `ls` subcommand', async () => {
    client.setArgv('env', 'ls');
    await env(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:ls',
        value: 'ls',
      },
    ]);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('--guidance', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--guidance');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        { key: 'flag:guidance', value: 'TRUE' },
      ]);
    });
  });

  describe('[environment]', () => {
    it('tracks `environment` argument', async () => {
      client.setArgv('env', 'ls', 'production');
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'argument:environment',
          value: 'production',
        },
      ]);
    });

    it('tracks redacted `environment` argument', async () => {
      client.setArgv('env', 'ls', 'custom-env');
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'argument:environment',
          value: '[REDACTED]',
        },
      ]);
    });

    describe('[git-branch]', () => {
      it('tracks `git-branch` argument', async () => {
        client.setArgv('env', 'ls', 'production', 'main');
        await env(client);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:ls',
            value: 'ls',
          },
          {
            key: 'argument:environment',
            value: 'production',
          },
          {
            key: 'argument:git-branch',
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      client.setArgv('env', 'ls', '--format', 'json');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('returns error for invalid --format value', async () => {
      client.setArgv('env', 'ls', '--format', 'xml');
      const exitCode = await env(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid output format: "xml"');
    });

    it('outputs environment variables as JSON with correct structure', async () => {
      client.setArgv('env', 'ls', '--format', 'json');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      // Verify JSON structure
      expect(jsonOutput).toHaveProperty('envs');
      expect(Array.isArray(jsonOutput.envs)).toBe(true);
    });

    it('does not output table headers when using JSON format', async () => {
      client.setArgv('env', 'ls', '--format', 'json');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      const stderrOutput = client.stderr.getFullOutput();
      // Should not contain table formatting
      expect(stderrOutput).not.toContain('environments');
      expect(stderrOutput).not.toContain('created');
    });
  });
});
