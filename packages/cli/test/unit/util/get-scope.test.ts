import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeam } from '../../mocks/team';
import getScope from '../../../src/util/get-scope';

describe('getScope', () => {
  let mockTeam: ReturnType<typeof useTeam>;
  let mockUser: ReturnType<typeof useUser>;
  beforeEach(() => {
    mockTeam = useTeam();
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

  describe('app principal', () => {
    beforeEach(() => {
      vi.stubEnv('APP_PRINCIPAL_ENABLED', '1');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    function useAppToken({ active = true }: { active?: boolean } = {}) {
      client.scenario.get('/v2/user', (_req, res) => {
        res.status(403).json({ error: { message: 'forbidden' } });
      });
      client.scenario.post('/login/oauth/token/introspect', (_req, res) => {
        res.json({
          active,
          client_id: 'app_dummy',
          client_name: 'Dummy App',
          team: { id: mockTeam.id, slug: mockTeam.slug },
        });
      });
    }

    it('should resolve the app and token team for an app token', async () => {
      useAppToken();
      const { contextName, team, user, app } = await getScope(client);
      expect(user).toBeNull();
      expect(app).toEqual({ id: 'app_dummy', name: 'Dummy App' });
      expect(team?.id).toEqual(mockTeam.id);
      expect(contextName).toEqual(mockTeam.slug);
    });

    it('should resolve local scope to the token team for an app token', async () => {
      useAppToken();
      const ctx = await getScope(client, { resolveLocalScope: true });
      expect(ctx.user).toBeNull();
      expect(ctx.app?.id).toEqual('app_dummy');
      expect(ctx.org).toEqual({
        type: 'team',
        id: mockTeam.id,
        slug: mockTeam.slug,
      });
      expect(ctx.contextName).toEqual(mockTeam.slug);
    });

    it('should throw the original auth error when the token is inactive', async () => {
      useAppToken({ active: false });
      await expect(getScope(client)).rejects.toMatchObject({
        code: 'NOT_AUTHORIZED',
      });
    });

    it('should resolve the user when introspection fails', async () => {
      const mockUser = useUser();
      client.scenario.post('/login/oauth/token/introspect', (_req, res) => {
        res.status(400).json({ error: { message: 'bad request' } });
      });
      const { contextName, user, app } = await getScope(client);
      expect(user?.id).toEqual(mockUser.id);
      expect(app).toBeNull();
      expect(contextName).toEqual(mockUser.username);
    });

    it('should include the app alongside the user for a user token', async () => {
      const mockUser = useUser();
      client.scenario.post('/login/oauth/token/introspect', (_req, res) => {
        res.json({
          active: true,
          client_id: 'app_dummy',
          client_name: 'Dummy App',
        });
      });
      const { contextName, user, app } = await getScope(client);
      expect(user?.id).toEqual(mockUser.id);
      expect(app?.id).toEqual('app_dummy');
      expect(contextName).toEqual(mockUser.username);
    });
  });
});
