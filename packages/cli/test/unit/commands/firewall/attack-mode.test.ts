import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useUpdateAttackMode } from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall attack-mode', () => {
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

  describe('on', () => {
    it('should enable attack mode with --yes (default 1h)', async () => {
      useUpdateAttackMode();
      client.setArgv('firewall', 'attack-mode', 'on', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attack mode enabled for 1h');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should enable attack mode with custom duration', async () => {
      useUpdateAttackMode();
      client.setArgv(
        'firewall',
        'attack-mode',
        'on',
        '--duration',
        '24h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attack mode enabled for 24h');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should reject invalid duration', async () => {
      client.setArgv(
        'firewall',
        'attack-mode',
        'on',
        '--duration',
        '2h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid duration');
      expect(await exitCodePromise).toEqual(1);
    });

    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'attack-mode', 'on', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
    });
  });

  describe('off', () => {
    it('should disable attack mode with --yes', async () => {
      useUpdateAttackMode();
      client.setArgv('firewall', 'attack-mode', 'off', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attack mode disabled');
      expect(await exitCodePromise).toEqual(0);
    });
  });
});
