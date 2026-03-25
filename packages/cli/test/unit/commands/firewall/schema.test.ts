import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall schema', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    const cwd = setupUnitFixture('commands/firewall');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'schema', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:schema',
        },
      ]);
    });
  });

  it('should show no schemas available when registry is empty', async () => {
    client.setArgv('firewall', 'schema');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No schemas available yet');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error on unknown action', async () => {
    client.setArgv('firewall', 'schema', 'nonexistent.action');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Unknown action');
    expect(await exitCodePromise).toEqual(1);
  });
});
