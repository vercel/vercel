import { describe, expect, it, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';

describe('flags add', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'add';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks `add` subcommand', async () => {
    client.setArgv('flags', 'add', 'new-feature');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:add',
        value: 'add',
      },
      {
        key: 'argument:slug',
        value: '[REDACTED]',
      },
      {
        key: 'option:kind',
        value: 'boolean',
      },
    ]);
  });

  it('creates a flag successfully', async () => {
    client.setArgv('flags', 'add', 'new-feature');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
  });

  describe('--kind', () => {
    it('tracks `kind` option', async () => {
      client.setArgv('flags', 'add', 'new-feature', '--kind', 'string');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'argument:slug',
          value: '[REDACTED]',
        },
        {
          key: 'option:kind',
          value: 'string',
        },
      ]);
    });
  });

  describe('--description', () => {
    it('tracks `description` option', async () => {
      client.setArgv(
        'flags',
        'add',
        'new-feature',
        '--description',
        'My feature'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'argument:slug',
          value: '[REDACTED]',
        },
        {
          key: 'option:kind',
          value: 'boolean',
        },
        {
          key: 'option:description',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  it('errors without slug argument', async () => {
    client.setArgv('flags', 'add');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });
});
