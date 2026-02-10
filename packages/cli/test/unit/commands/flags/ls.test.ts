import { describe, it, expect, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';

describe('flags ls', () => {
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

  it('tracks `ls` subcommand', async () => {
    client.setArgv('flags', 'ls');
    await flags(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:ls',
        value: 'ls',
      },
      {
        key: 'option:state',
        value: 'active',
      },
    ]);
  });

  it('lists flags successfully', async () => {
    client.setArgv('flags', 'ls');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'ls';

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

  describe('--state', () => {
    it('tracks `state` option', async () => {
      client.setArgv('flags', 'ls', '--state', 'archived');
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'option:state',
          value: 'archived',
        },
      ]);
    });
  });

  describe('--json', () => {
    it('outputs valid JSON with flag data', async () => {
      client.setArgv('flags', 'ls', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('flags');
      expect(parsed.flags).toHaveLength(2);
      expect(parsed.flags[0]).toHaveProperty('slug');
      expect(parsed.flags[0]).toHaveProperty('kind');
      expect(parsed.flags[0]).toHaveProperty('state');
      expect(parsed.flags[0]).toHaveProperty('variants');
    });

    it('tracks telemetry for --json', async () => {
      client.setArgv('flags', 'ls', '--json');
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'option:state',
          value: 'active',
        },
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });
  });
});
