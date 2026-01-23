import { describe, expect, it, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultFlags } from '../../../mocks/flags';

describe('flags rm', () => {
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
      const subcommand = 'rm';

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

  it('tracks `rm` subcommand', async () => {
    client.setArgv('flags', 'rm', defaultFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:rm',
        value: 'rm',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('deletes a flag successfully with --yes', async () => {
    client.setArgv('flags', 'rm', defaultFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
  });

  it('errors without flag argument', async () => {
    client.setArgv('flags', 'rm');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });
});
