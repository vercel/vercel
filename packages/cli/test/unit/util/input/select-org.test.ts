import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { isActionRequiredPayload } from '../../../../src/util/agent-output';
import selectOrg from '../../../../src/util/input/select-org';
import { createTeam, useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('selectOrg', () => {
  let user: ReturnType<typeof useUser>;
  let team: ReturnType<typeof createTeam>;

  beforeEach(() => {
    team = useTeam();
  });

  describe('non-northstar', () => {
    beforeEach(() => {
      user = useUser();
    });

    it('should allow selecting user', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).toOutput(user.name);
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
    });

    it('should allow selecting team', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope');
      await expect(client.stderr).toOutput('Select the scope');
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\r'); // Return key
      await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
    });

    it('automatically selects the correct scope when autoconfirm flag is passed', async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope', true);
      await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
    });

    describe('with a selected team scope', () => {
      beforeEach(() => {
        client.config.currentTeam = team.id;
      });

      afterEach(() => {
        delete client.config.currentTeam;
      });

      it('should allow selecting user', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope');
        await expect(client.stderr).toOutput(user.name);
        client.stdin.write('\r'); // Return key
        await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
      });

      it('should allow selecting team', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope');
        await expect(client.stderr).toOutput('Select the scope');
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\r'); // Return key
        await expect(selectOrgPromise).resolves.toHaveProperty('id', user.id);
      });

      it('automatically selects the correct scope when autoconfirm flag is passed', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope', true);
        await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
      });
    });
  });

  describe('northstar', () => {
    describe('with current team', () => {
      beforeEach(() => {
        user = useUser({
          version: 'northstar',
        });
        client.config.currentTeam = team.id;
      });

      afterEach(() => {
        delete client.config.currentTeam;
      });

      it('should not allow selecting user', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope');
        await expect(client.stderr).not.toOutput(user.name);
        client.stdin.write('\r'); // Return key
        await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
      });

      it('automatically selects the correct scope when autoconfirm flag is passed', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope', true);
        await expect(selectOrgPromise).resolves.toHaveProperty('id', team.id);
      });
    });
  });

  describe('non-interactive mode', () => {
    let firstTeam: ReturnType<typeof createTeam>;

    beforeEach(() => {
      user = useUser({ version: 'northstar' });
      firstTeam = useTeam();
      createTeam(); // second team so choices.length > 1
      client.nonInteractive = true;
      delete client.config.currentTeam;
    });

    afterEach(() => {
      client.nonInteractive = false;
    });

    it('outputs action_required JSON and exits (never defaults; user must pass --scope)', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(selectOrg(client, 'Which scope?', false)).rejects.toThrow(
        'process.exit(1)'
      );

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(isActionRequiredPayload(payload)).toBe(true);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.message).toContain('--scope');
      expect(payload.message).toContain('non-interactive');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(payload.next)).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('returns org when --scope flag is present in argv (non-interactive, no currentTeam)', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.setArgv('deploy', '--scope', firstTeam.slug);

      const result = await selectOrg(client, 'Which scope?', false);
      expect(result).toEqual({
        type: 'team',
        id: firstTeam.id,
        slug: firstTeam.slug,
      });

      expect(logSpy).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('outputs action_required and exits even with single scope (no defaulting)', async () => {
      // Single team only (northstar user + one team)
      user = useUser({ version: 'northstar' });
      useTeam(); // only one team
      client.nonInteractive = true;
      delete client.config.currentTeam;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(selectOrg(client, 'Which scope?', false)).rejects.toThrow(
        'process.exit(1)'
      );

      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(isActionRequiredPayload(payload)).toBe(true);
      expect(payload.choices.length).toBe(1);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('returns org when --scope/--team was passed (currentTeam set)', async () => {
      client.config.currentTeam = firstTeam.id;
      const result = await selectOrg(client, 'Which scope?', false);
      expect(result).toEqual({
        type: 'team',
        id: firstTeam.id,
        slug: firstTeam.slug,
      });
      delete client.config.currentTeam;
    });
  });

  describe('without current team', () => {
    let team2: ReturnType<typeof createTeam>;

    beforeEach(() => {
      team2 = createTeam();
      user = useUser({
        version: 'northstar',
        defaultTeamId: team2.id,
      });
    });

    it("should show the user's default team as the first option", async () => {
      const selectOrgPromise = selectOrg(client, 'Select the scope');

      // selecting the first item
      client.stdin.write('\r'); // Return key

      const result = await selectOrgPromise;
      if (isActionRequiredPayload(result)) {
        throw new Error('Unexpected action_required in interactive test');
      }
      expect(result.id).toBe(team2.id);
      expect(user.defaultTeamId).toBe(team2.id);
    });
  });
});
