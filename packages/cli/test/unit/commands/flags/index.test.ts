import { describe, it, beforeEach, expect } from 'vitest';
import flags from '../../../../src/commands/flags';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useFlags } from '../../../mocks/flags';

describe('flags', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';

      client.setArgv(command, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('flags');
    const exitCodePromise = flags(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('unrecognized subcommand', () => {
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

    it('shows help', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('flags', ...args);
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
    });
  });
});
