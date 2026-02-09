import { describe, it, expect, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams, createTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import target from '../../../../src/commands/target';

describe('target list', () => {
  describe('--non-interactive', () => {
    it('outputs action_required JSON and exits when not linked and multiple teams (no --scope)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      client.cwd = cwd;
      client.setArgv('target', 'list', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(target(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.message).toContain('Multiple teams');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });
});
