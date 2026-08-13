import { describe, expect, beforeEach, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import target from '../../../../src/commands/target';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

const CUSTOM_ENVIRONMENT = {
  id: 'env_ph1tjPP20xp8VAuiFsYt4rhRYGys',
  slug: 'staging',
  type: 'preview',
  description: 'staging environment',
  branchMatcher: {
    type: 'startsWith',
    pattern: 'staging',
  },
  domains: [{ name: 'staging.example.com' }],
  createdAt: 1717176506341,
  updatedAt: 1717176506341,
};

function useCustomEnvironment() {
  client.scenario.get(
    '/projects/static/custom-environments/:idOrSlug',
    (req, res) => {
      const { idOrSlug } = req.params;
      if (
        idOrSlug === CUSTOM_ENVIRONMENT.slug ||
        idOrSlug === CUSTOM_ENVIRONMENT.id
      ) {
        res.json(CUSTOM_ENVIRONMENT);
        return;
      }
      res.status(404).send();
    }
  );
}

describe('target inspect', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      accountId: 'team_dummy',
    });
    client.cwd = setupUnitFixture('commands/deploy/static');
    client.stderr.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('target', 'inspect', '--help');
      const exitCodePromise = target(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'target:inspect',
        },
      ]);
    });
  });

  describe('missing arguments', () => {
    it('errors with exit code 2 when no arguments are passed', async () => {
      client.setArgv('target', 'inspect');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });

    it('errors with exit code 2 when too many arguments are passed', async () => {
      client.setArgv('target', 'inspect', 'staging', 'extra');
      const exitCode = await target(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('shows the custom environment in full and tracks telemetry', async () => {
    useCustomEnvironment();
    client.setArgv('target', 'inspect', 'staging');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('env_ph1tjPP20xp8VAuiFsYt4rhRYGys');
    expect(stdout).toContain('staging');
    expect(stdout).toContain('preview');
    expect(stdout).toContain('starts with staging');
    expect(stdout).toContain('staging.example.com');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
    ]);
  });

  it('resolves a custom environment by id', async () => {
    useCustomEnvironment();
    client.setArgv('target', 'inspect', 'env_ph1tjPP20xp8VAuiFsYt4rhRYGys');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);
    expect(client.stdout.getFullOutput()).toContain('staging');
  });

  it('outputs the custom environment as JSON with --json', async () => {
    useCustomEnvironment();
    client.setArgv('target', 'inspect', 'staging', '--json');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toEqual('env_ph1tjPP20xp8VAuiFsYt4rhRYGys');
    expect(parsed.slug).toEqual('staging');
    expect(parsed.type).toEqual('preview');
    expect(parsed.branchMatcher).toEqual({
      type: 'startsWith',
      pattern: 'staging',
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'flag:json',
        value: 'TRUE',
      },
    ]);
  });

  it('supports --format json', async () => {
    useCustomEnvironment();
    client.setArgv('target', 'inspect', 'staging', '--format', 'json');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.slug).toEqual('staging');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
      {
        key: 'option:format',
        value: 'json',
      },
    ]);
  });

  it('errors when the custom environment is not found', async () => {
    useCustomEnvironment();
    client.setArgv('target', 'inspect', 'does-not-exist');
    const exitCode = await target(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('was not found');
  });
});
