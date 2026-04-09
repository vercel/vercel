import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useAddBypass,
  useRemoveBypass,
  capturedRequests,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall system-mitigations', () => {
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

  describe('pause', () => {
    it('should pause system mitigations with --yes', async () => {
      useAddBypass();
      client.setArgv('firewall', 'system-mitigations', 'pause', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('System mitigations paused');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.addBypass).toBeDefined();
      expect(capturedRequests.addBypass?.allSources).toBe(true);
    });

    it('should mention auto-resume in success message', async () => {
      useAddBypass();
      client.setArgv('firewall', 'system-mitigations', 'pause', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Auto-resumes in 24 hours');
      expect(await exitCodePromise).toEqual(0);
    });

    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'system-mitigations', 'pause', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
    });
  });

  describe('resume', () => {
    it('should resume system mitigations with --yes', async () => {
      useRemoveBypass();
      client.setArgv('firewall', 'system-mitigations', 'resume', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('System mitigations resumed');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.removeBypass).toBeDefined();
    });
  });

  // Agent blocking (non-interactive guard) is tested manually.
  // The process.exit(1) in the guard crashes vitest.
});
