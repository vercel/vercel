import { existsSync } from 'fs';
import { join } from 'path';
import stripAnsi from 'strip-ansi';
import { describe, it, expect, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

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
      [
        {
          id: 'env_development_url',
          key: 'DEVELOPMENT_URL',
          value: 'dev.example',
          type: 'encrypted',
          visibility: 'config',
          target: ['development'],
          createdAt: 1557241361455,
        },
        {
          id: 'env_production_secret',
          key: 'PRODUCTION_SECRET',
          value: 'do-not-print-this',
          type: 'sensitive',
          visibility: 'secret',
          target: ['production'],
          createdAt: 1557241361455,
        },
        {
          id: 'env_visibility_secret',
          key: 'VISIBILITY_SECRET',
          value: 'also-do-not-print-this',
          type: 'encrypted',
          visibility: 'secret',
          target: ['preview'],
          createdAt: 1557241361455,
        },
      ]
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

  it('shows non-sensitive values and identifies sensitive values', async () => {
    client.setArgv('env', 'ls');

    const exitCode = await env(client);

    expect(exitCode).toEqual(0);
    const tableOutput = stripAnsi(client.stdout.getFullOutput());
    expect(tableOutput).toMatch(/name\s+value\s+type\s+environments/);
    expect(tableOutput).toMatch(
      /DEVELOPMENT_URL\s+dev\.example\s+Non-sensitive\s+Development/
    );
    expect(tableOutput).toMatch(
      /PRODUCTION_SECRET\s+Hidden\s+Sensitive\s+Production/
    );
    expect(tableOutput).toMatch(
      /VISIBILITY_SECRET\s+Hidden\s+Sensitive\s+Preview/
    );
    expect(tableOutput).not.toContain('do-not-print-this');
    expect(tableOutput).not.toContain('also-do-not-print-this');
    expect(tableOutput).not.toContain('Encrypted');
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
    it('retains linked-project guidance and tracks telemetry', async () => {
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
      const output = client.stderr.getFullOutput();
      expect(output).toContain('vercel env add');
      expect(output).toContain('vercel env rm');
      expect(output).toContain('vercel env pull');
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
      expect(jsonOutput.envs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'DEVELOPMENT_URL',
            value: 'dev.example',
            type: 'encrypted',
            visibility: 'config',
          }),
        ])
      );
      const sensitiveVariable = jsonOutput.envs.find(
        (item: { key: string }) => item.key === 'PRODUCTION_SECRET'
      );
      expect(sensitiveVariable).toMatchObject({
        type: 'sensitive',
        visibility: 'secret',
      });
      expect(sensitiveVariable).not.toHaveProperty('value');
      const visibilitySecret = jsonOutput.envs.find(
        (item: { key: string }) => item.key === 'VISIBILITY_SECRET'
      );
      expect(visibilitySecret).toMatchObject({
        type: 'encrypted',
        visibility: 'secret',
      });
      expect(visibilitySecret).not.toHaveProperty('value');
      expect(output).not.toContain('do-not-print-this');
      expect(output).not.toContain('also-do-not-print-this');
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

  describe('--project', () => {
    it('lists variables from an unlinked directory without writing link metadata', async () => {
      const cwd = setupTmpDir('env-ls-explicit-project');
      client.cwd = cwd;
      useProject(
        {
          ...defaultProject,
          id: 'prj_explicit',
          name: 'explicit-project',
          accountId: 'team_dummy',
        },
        []
      );

      client.setArgv(
        'env',
        'ls',
        '--project',
        'explicit-project',
        '--format',
        'json'
      );
      const exitCode = await env(client);

      expect(exitCode).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({ envs: [] });
      expect(existsSync(join(cwd, '.vercel'))).toBe(false);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'option:format', value: 'json' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });

    it('preserves the explicitly selected project in guidance', async () => {
      const cwd = setupTmpDir('env-ls-project-guidance');
      client.cwd = cwd;
      useProject({
        ...defaultProject,
        id: 'prj_guidance',
        name: 'guidance-project',
        accountId: 'team_dummy',
      });

      client.setArgv(
        'env',
        'ls',
        '--project',
        'guidance-project',
        '--guidance'
      );
      const exitCode = await env(client);

      expect(exitCode).toEqual(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('vercel env add --project guidance-project');
      expect(output).toContain('vercel env rm --project guidance-project');
      expect(output).toContain('vercel env pull --project guidance-project');
    });

    it('reports an unknown explicit project instead of linking', async () => {
      const cwd = setupTmpDir('env-ls-unknown-project');
      client.cwd = cwd;
      useUnknownProject();

      client.setArgv('env', 'ls', '--project', 'does-not-exist');
      const exitCode = await env(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Project "does-not-exist" was not found'
      );
      expect(existsSync(join(cwd, '.vercel'))).toBe(false);
    });
  });
});
