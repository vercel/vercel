import { afterEach, describe, expect, it } from 'vitest';
import {
  getOrgIdFromEnv,
  getTeamEnv,
  getTeamEnvVar,
  TeamEnvNotFound,
} from '../../../../src/util/teams/team-env';
import { client } from '../../../mocks/client';
import { createTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

function useTeamsEndpoint(teams: ReturnType<typeof createTeam>[]) {
  let fetchCount = 0;
  client.scenario.get('/v1/teams', (_req, res) => {
    fetchCount++;
    res.json({ teams });
  });
  return () => fetchCount;
}

describe('team-env', () => {
  afterEach(() => {
    delete process.env.VERCEL_TEAM;
    delete process.env.VERCEL_ORG_ID;
  });

  describe('getTeamEnv', () => {
    it('returns `undefined` when unset or empty', async () => {
      expect(getTeamEnv()).toBeUndefined();
      process.env.VERCEL_TEAM = '';
      expect(getTeamEnv()).toBeUndefined();
    });
  });

  describe('getTeamEnvVar', () => {
    it('reports which env var supplied the value', async () => {
      expect(getTeamEnvVar()).toBeUndefined();

      process.env.VERCEL_ORG_ID = 'team_legacy';
      expect(getTeamEnvVar()).toEqual({
        name: 'VERCEL_ORG_ID',
        value: 'team_legacy',
      });

      process.env.VERCEL_TEAM = 'my-team';
      expect(getTeamEnvVar()).toEqual({
        name: 'VERCEL_TEAM',
        value: 'my-team',
      });
    });
  });

  describe('getOrgIdFromEnv', () => {
    it('returns `undefined` when neither env var is set', async () => {
      await expect(getOrgIdFromEnv(client)).resolves.toBeUndefined();
    });

    it('uses a `VERCEL_TEAM` team ID as-is, without an API lookup', async () => {
      const getFetchCount = useTeamsEndpoint([
        createTeam('team_dummy', 'dummy', 'Dummy'),
      ]);
      process.env.VERCEL_TEAM = 'team_dummy';

      await expect(getOrgIdFromEnv(client)).resolves.toEqual('team_dummy');
      expect(getFetchCount()).toBe(0);
    });

    it('resolves a `VERCEL_TEAM` slug to the matching team ID', async () => {
      useTeamsEndpoint([
        createTeam('team_other', 'other', 'Other'),
        createTeam('team_dummy', 'dummy', 'Dummy'),
      ]);
      process.env.VERCEL_TEAM = 'dummy';

      await expect(getOrgIdFromEnv(client)).resolves.toEqual('team_dummy');
    });

    it('resolves a `VERCEL_TEAM` naming the personal account to the user ID', async () => {
      const user = useUser();
      useTeamsEndpoint([createTeam('team_dummy', 'dummy', 'Dummy')]);
      process.env.VERCEL_TEAM = user.username;

      await expect(getOrgIdFromEnv(client)).resolves.toEqual(user.id);
    });

    it('uses `VERCEL_ORG_ID` verbatim, without an API lookup (back-compat)', async () => {
      const getFetchCount = useTeamsEndpoint([
        createTeam('team_dummy', 'dummy', 'Dummy'),
      ]);
      process.env.VERCEL_ORG_ID = 'team_dummy';

      await expect(getOrgIdFromEnv(client)).resolves.toEqual('team_dummy');
      expect(getFetchCount()).toBe(0);
    });

    it('never looks up a `VERCEL_ORG_ID` that is not a team ID', async () => {
      const getFetchCount = useTeamsEndpoint([
        createTeam('team_dummy', 'dummy', 'Dummy'),
      ]);
      // A personal-account `VERCEL_ORG_ID` is a user ID, not a `team_` ID, and
      // has always been passed through untouched.
      process.env.VERCEL_ORG_ID = 'user_id_not_a_team';

      await expect(getOrgIdFromEnv(client)).resolves.toEqual(
        'user_id_not_a_team'
      );
      expect(getFetchCount()).toBe(0);
    });

    it('prefers `VERCEL_TEAM` when both env vars are set', async () => {
      useTeamsEndpoint([
        createTeam('team_from_slug', 'preferred', 'Preferred'),
      ]);
      process.env.VERCEL_TEAM = 'preferred';
      process.env.VERCEL_ORG_ID = 'team_legacy';

      await expect(getOrgIdFromEnv(client)).resolves.toEqual('team_from_slug');
    });

    it('throws a clear error when `VERCEL_TEAM` matches no team', async () => {
      useUser();
      useTeamsEndpoint([createTeam('team_dummy', 'dummy', 'Dummy')]);
      process.env.VERCEL_TEAM = 'does-not-exist';

      await expect(getOrgIdFromEnv(client)).rejects.toThrow(TeamEnvNotFound);
      await expect(getOrgIdFromEnv(client)).rejects.toThrow(
        /`VERCEL_TEAM` \("does-not-exist"\) was not found/
      );
    });
  });
});
