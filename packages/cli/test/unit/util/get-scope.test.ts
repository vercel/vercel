import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeam } from '../../mocks/team';
import getScope, { APP_PRINCIPAL_SCOPE_ENV } from '../../../src/util/get-scope';

describe('getScope', () => {
  let mockTeam: ReturnType<typeof useTeam>;
  let mockUser: ReturnType<typeof useUser>;
  beforeEach(() => {
    mockTeam = useTeam();
  });

  afterEach(() => {
    delete process.env[APP_PRINCIPAL_SCOPE_ENV];
  });

  describe('non-northstar', () => {
    beforeEach(() => {
      mockUser = useUser();
    });

    it('should return user if team is unspecified', async () => {
      const { contextName, team, user } = await getScope(client);
      await expect(user?.id).toEqual(mockUser.id);
      await expect(team).toBeNull();
      await expect(contextName).toEqual(mockUser.username);
    });

    it('should return team if team is specified', async () => {
      client.config.currentTeam = mockTeam.id;
      const { contextName, team, user } = await getScope(client);
      await expect(user?.id).toEqual(mockUser.id);
      await expect(team?.id).toEqual(mockTeam.id);
      await expect(contextName).toEqual(mockTeam.slug);
    });

    it('should not return team if team is specified but getTeam is false', async () => {
      client.config.currentTeam = mockTeam.id;
      const { contextName, team, user } = await getScope(client, {
        getTeam: false,
      });
      await expect(user?.id).toEqual(mockUser.id);
      await expect(team).toBeNull();
      await expect(contextName).toEqual(mockUser.username);
    });
  });

  describe('northstar', () => {
    beforeEach(() => {
      mockUser = useUser({
        version: 'northstar',
        defaultTeamId: mockTeam.id,
      });
    });

    it('should return default team', async () => {
      const { contextName, team, user } = await getScope(client);
      await expect(user?.id).toEqual(mockUser.id);
      await expect(team?.id).toEqual(mockTeam.id);
      await expect(contextName).toEqual(mockTeam.slug);
    });

    it('should apply the default team as the effective request scope', async () => {
      // Regression test: without this, a Northstar user with no persisted
      // `currentTeam` resolves the default team for display but sends API
      // requests with no `teamId`, silently scoping to the resource-less
      // personal account (e.g. `vc projects ls` reporting "No projects found"
      // for a user whose default team has projects).
      expect(client.config.currentTeam).toBeUndefined();
      await getScope(client);
      expect(client.config.currentTeam).toEqual(mockTeam.id);
    });

    it('should not override an explicitly selected team with the default', async () => {
      const otherTeam = useTeam();
      client.config.currentTeam = otherTeam.id;
      await getScope(client);
      expect(client.config.currentTeam).toEqual(otherTeam.id);
    });

    it('should not return default team if getTeam is false', async () => {
      const { contextName, team, user } = await getScope(client, {
        getTeam: false,
      });
      await expect(user?.id).toEqual(mockUser.id);
      await expect(team).toBeNull();
      await expect(contextName).toEqual(mockUser.username);
    });
  });

  describe('app principal fallback', () => {
    it('should return app principal scope when user lookup fails and introspection succeeds', async () => {
      process.env[APP_PRINCIPAL_SCOPE_ENV] = '1';
      client.scenario.get('/v2/user', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Not authorized',
          },
        });
      });
      client.scenario.post('/login/oauth/token/introspect', (_req, res) => {
        res.json({
          active: true,
          client_id: 'cl_vercel_agent',
          client_name: 'Vercel Agent',
          sub: 'cl_vercel_agent',
          subject_type: 'client',
          team: {
            id: 'team_vercel',
            slug: 'vercel',
            name: 'Vercel',
          },
        });
      });

      const scope = await getScope(client, {
        resolveLocalScope: true,
      });

      expect(scope.user).toBeNull();
      expect('appPrincipal' in scope ? scope.appPrincipal : null).toEqual({
        id: 'cl_vercel_agent',
        name: 'Vercel Agent',
        team: {
          id: 'team_vercel',
          slug: 'vercel',
          name: 'Vercel',
        },
      });
      expect(scope.contextName).toEqual('vercel');
      expect(scope.team).toBeNull();
    });

    it('should raise the introspection error when user lookup and introspection fail', async () => {
      process.env[APP_PRINCIPAL_SCOPE_ENV] = '1';
      client.scenario.get('/v2/user', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Not authorized',
          },
        });
      });
      client.scenario.post('/login/oauth/token/introspect', (_req, res) => {
        res.status(500).json({
          error: {
            code: 'server_error',
            message: 'Introspection failed',
          },
        });
      });

      await expect(
        getScope(client, {
          resolveLocalScope: true,
        })
      ).rejects.toMatchObject({
        status: 500,
        serverMessage: 'Introspection failed',
      });
    });
  });
});
