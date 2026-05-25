import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useUpdateAttackMode, capturedRequests } from '../../../mocks/firewall';
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

  describe('enable', () => {
    it('should enable attack mode with --yes (default 1h)', async () => {
      useUpdateAttackMode();
      client.setArgv('firewall', 'attack-mode', 'enable', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attack mode enabled for 1h');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.updateAttackMode?.attackModeEnabled).toBe(true);
    });

    it('should enable attack mode with custom duration', async () => {
      useUpdateAttackMode();
      client.setArgv(
        'firewall',
        'attack-mode',
        'enable',
        '--duration',
        '24h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attack mode enabled for 24h');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.updateAttackMode?.attackModeEnabled).toBe(true);
    });

    it('should reject invalid duration', async () => {
      client.setArgv(
        'firewall',
        'attack-mode',
        'enable',
        '--duration',
        '2h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid duration');
      expect(await exitCodePromise).toEqual(1);
    });

    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'attack-mode', 'enable', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
    });
  });

  describe('disable', () => {
    it('should disable attack mode with --yes', async () => {
      useUpdateAttackMode();
      client.setArgv('firewall', 'attack-mode', 'disable', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Attack mode disabled');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.updateAttackMode?.attackModeEnabled).toBe(false);
    });
  });

  // Agent blocking (non-interactive guard) is tested manually.
  // The process.exit(1) in the guard crashes vitest, following the same
  // pattern as other CLI commands (microfrontends create-group, etc.).
});
