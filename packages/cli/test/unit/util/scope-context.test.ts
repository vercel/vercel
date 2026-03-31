import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeam } from '../../mocks/team';
import { resolveScopeContext } from '../../../src/util/scope-context';

describe('resolveScopeContext', () => {
  describe('with no local links', () => {
    let mockTeam: ReturnType<typeof useTeam>;
    let mockUser: ReturnType<typeof useUser>;

    beforeEach(() => {
      mockTeam = useTeam();
      mockUser = useUser();
    });

    it('should use global scope when no local link and no --scope', async () => {
      client.config.currentTeam = mockTeam.id;
      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.org.id).toEqual(mockTeam.id);
      expect(ctx.contextName).toEqual(mockTeam.slug);
      expect(ctx.user.id).toEqual(mockUser.id);
      expect(ctx.team?.id).toEqual(mockTeam.id);
      expect(ctx.linkedProject).toBeNull();
      expect(ctx.linkedRepo).toBeNull();
      expect(ctx.isCrossTeamRepo).toBe(false);
      expect(ctx.scopeMismatch).toBe(false);
      expect(ctx.explicitScopeProvided).toBe(false);
    });

    it('should use personal account when no team set', async () => {
      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.org.type).toEqual('user');
      expect(ctx.org.id).toEqual(mockUser.id);
      expect(ctx.contextName).toEqual(mockUser.username);
      expect(ctx.team).toBeNull();
    });

    it('should detect --scope flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '--scope', mockTeam.slug];

      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect --scope=value flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', `--scope=${mockTeam.slug}`];

      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect --team flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '--team', mockTeam.slug];

      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect -T flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '-T', mockTeam.slug];

      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect localConfig scope as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.localConfig = { scope: mockTeam.slug };

      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });
  });

  describe('detectCrossTeamRepo (via isCrossTeamRepo)', () => {
    beforeEach(() => {
      useTeam();
      useUser();
    });

    it('should not flag cross-team when there is no repo link', async () => {
      const ctx = await resolveScopeContext(client);

      expect(ctx.isCrossTeamRepo).toBe(false);
    });
  });

  describe('detectExplicitScope edge cases', () => {
    beforeEach(() => {
      useTeam();
      useUser();
    });

    it('should return false when no scope indicators present', async () => {
      client.argv = ['deploy'];
      client.localConfig = {};

      const ctx = await resolveScopeContext(client);

      expect(ctx.explicitScopeProvided).toBe(false);
    });

    it('should not false-positive on unrelated flags', async () => {
      client.argv = ['deploy', '--force', '--yes'];
      client.localConfig = {};

      const ctx = await resolveScopeContext(client);

      expect(ctx.explicitScopeProvided).toBe(false);
    });
  });

  describe('northstar user', () => {
    let mockTeam: ReturnType<typeof useTeam>;
    let mockUser: ReturnType<typeof useUser>;

    beforeEach(() => {
      mockTeam = useTeam();
      mockUser = useUser({
        version: 'northstar',
        defaultTeamId: mockTeam.id,
      });
    });

    it('should use default team for northstar user', async () => {
      const ctx = await resolveScopeContext(client, { requiresTeamOnly: true });

      expect(ctx.org.id).toEqual(mockTeam.id);
      expect(ctx.user.id).toEqual(mockUser.id);
      expect(ctx.team?.id).toEqual(mockTeam.id);
    });
  });
});
