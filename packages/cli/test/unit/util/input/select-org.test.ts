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

      // Anti-regression: spinner copy was renamed from "Loading scopes…" to
      // "Loading teams…". A regression to the old copy would break the rename.
      const fullOutput = client.stderr.getFullOutput();
      expect(fullOutput).not.toContain('Loading scopes');
      expect(fullOutput).toContain('Loading teams');
    });

    it('resolves an explicit scope without prompting when autoconfirm is passed', async () => {
      client.setArgv('deploy', '--scope', user.username);
      const result = await selectOrg(client, 'Select the scope', true);
      expect(result).toHaveProperty('id', user.id);
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

      it('asks with the current team as the default when autoconfirm is passed', async () => {
        const selectOrgPromise = selectOrg(client, 'Select the scope', true);
        await expect(client.stderr).toOutput('Select the scope');
        client.stdin.write('\r'); // Return key selects the default (current team)
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

    it('returns the only team when a single choice exists (unambiguous)', async () => {
      // Single team only (northstar user + one team)
      user = useUser({ version: 'northstar' });
      const onlyTeam = useTeam(); // only one team
      client.nonInteractive = true;
      delete client.config.currentTeam;

      const result = await selectOrg(client, 'Which scope?', false);
      expect(result).toEqual({
        type: 'team',
        id: onlyTeam.id,
        slug: onlyTeam.slug,
      });
    });

    it('outputs action_required and exits when only the global team is set (currentTeam is not a signal)', async () => {
      client.config.currentTeam = firstTeam.id;

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
      expect(payload.reason).toBe('missing_scope');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      delete client.config.currentTeam;
    });

    it('returns org when VERCEL_ORG_ID matches a team', async () => {
      process.env.VERCEL_ORG_ID = firstTeam.id;
      try {
        const result = await selectOrg(client, 'Which scope?', false);
        expect(result).toEqual({
          type: 'team',
          id: firstTeam.id,
          slug: firstTeam.slug,
        });
      } finally {
        delete process.env.VERCEL_ORG_ID;
      }
    });

    it('returns org when vercel.json scope matches a team', async () => {
      client.localConfig = { ...client.localConfig, scope: firstTeam.slug };
      const result = await selectOrg(client, 'Which scope?', false);
      expect(result).toEqual({
        type: 'team',
        id: firstTeam.id,
        slug: firstTeam.slug,
      });
    });
  });

  describe('non-TTY mode (not non-interactive)', () => {
    let firstTeam: ReturnType<typeof createTeam>;

    beforeEach(() => {
      user = useUser({ version: 'northstar' });
      firstTeam = useTeam();
      createTeam(); // second team so choices.length > 1
      client.stdin.isTTY = false;
      delete client.config.currentTeam;
    });

    it('errors instead of guessing the global team under --yes', async () => {
      client.config.currentTeam = firstTeam.id;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(selectOrg(client, 'Which scope?', true)).rejects.toThrow(
        'process.exit(1)'
      );

      // Human error on stderr, no JSON payload without --non-interactive.
      expect(logSpy).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).toContain('Multiple teams found');
      expect(client.stderr.getFullOutput()).toContain('--team <slug>');
      expect(client.stderr.getFullOutput()).toContain('teams ls');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      delete client.config.currentTeam;
    });

    it('returns org when --scope is present in argv under --yes', async () => {
      client.setArgv('deploy', '--scope', firstTeam.slug);
      const result = await selectOrg(client, 'Which scope?', true);
      expect(result).toEqual({
        type: 'team',
        id: firstTeam.id,
        slug: firstTeam.slug,
      });
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
