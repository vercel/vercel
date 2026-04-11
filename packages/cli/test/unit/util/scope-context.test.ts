import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeam } from '../../mocks/team';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import getScope, { applyScopeFromLink } from '../../../src/util/get-scope';

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
      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.org.id).toEqual(mockTeam.id);
      expect(ctx.contextName).toEqual(mockTeam.slug);
      expect(ctx.user.id).toEqual(mockUser.id);
      expect(ctx.team?.id).toEqual(mockTeam.id);
      expect(ctx.linkedRepo).toBeNull();
      expect(ctx.isCrossTeamRepo).toBe(false);
      expect(ctx.scopeMismatch).toBe(false);
      expect(ctx.explicitScopeProvided).toBe(false);
    });

    it('should use personal account when no team set', async () => {
      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.org.type).toEqual('user');
      expect(ctx.org.id).toEqual(mockUser.id);
      expect(ctx.contextName).toEqual(mockUser.username);
      expect(ctx.team).toBeNull();
    });

    it('should detect --scope flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '--scope', mockTeam.slug];

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect --scope=value flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', `--scope=${mockTeam.slug}`];

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect --team flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '--team', mockTeam.slug];

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect -T flag as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '-T', mockTeam.slug];

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });

    it('should detect localConfig scope as explicit scope', async () => {
      client.config.currentTeam = mockTeam.id;
      client.localConfig = { scope: mockTeam.slug };

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.explicitScopeProvided).toBe(true);
    });
  });

  describe('detectCrossTeamRepo (via isCrossTeamRepo)', () => {
    beforeEach(() => {
      useTeam();
      useUser();
    });

    it('should not flag cross-team when there is no repo link', async () => {
      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.isCrossTeamRepo).toBe(false);
    });
  });

  describe('cross-team repo awareness', () => {
    let mockTeam: ReturnType<typeof useTeam>;

    beforeEach(() => {
      mockTeam = useTeam('team_dummy');
      useUser();
    });

    it('should warn about cross-team repo without prompting for a project', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      client.config.currentTeam = mockTeam.id;
      const selectSpy = vi.spyOn(client.input, 'select');

      await outputFile(
        join(cwd, '.vercel', 'repo.json'),
        JSON.stringify({
          remoteName: 'origin',
          projects: [
            {
              id: 'prj_aaa',
              name: 'proj-a',
              directory: 'apps/a',
              orgId: 'team_aaa',
            },
            {
              id: 'prj_bbb',
              name: 'proj-b',
              directory: 'apps/b',
              orgId: 'team_bbb',
            },
          ],
        })
      );

      const exitCodePromise = getScope(client, {
        resolveLocalScope: true,
      });
      await expect(client.stderr).toOutput(
        'This repository has projects across multiple teams'
      );
      const ctx = await exitCodePromise;

      expect(selectSpy).not.toHaveBeenCalled();
      expect(ctx.isCrossTeamRepo).toBe(true);
      expect(ctx.org.id).toEqual(mockTeam.id);
    });

    it('should not warn about cross-team repo when explicit --scope is provided', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      client.config.currentTeam = mockTeam.id;
      client.argv = ['projects', 'ls', '--scope', mockTeam.slug];

      await outputFile(
        join(cwd, '.vercel', 'repo.json'),
        JSON.stringify({
          remoteName: 'origin',
          projects: [
            {
              id: 'prj_aaa',
              name: 'proj-a',
              directory: 'apps/a',
              orgId: 'team_aaa',
            },
            {
              id: 'prj_bbb',
              name: 'proj-b',
              directory: 'apps/b',
              orgId: 'team_bbb',
            },
          ],
        })
      );

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.isCrossTeamRepo).toBe(true);
      expect(ctx.explicitScopeProvided).toBe(true);
      expect(ctx.org.id).toEqual(mockTeam.id);
    });

    it('should resolve localOrgId when multiple matched projects share the same orgId', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      client.config.currentTeam = mockTeam.id;

      await outputFile(
        join(cwd, '.vercel', 'repo.json'),
        JSON.stringify({
          remoteName: 'origin',
          projects: [
            {
              id: 'prj_aaa',
              name: 'proj-a',
              directory: '.',
              orgId: mockTeam.id,
            },
            {
              id: 'prj_bbb',
              name: 'proj-b',
              directory: '.',
              orgId: mockTeam.id,
            },
            {
              id: 'prj_ccc',
              name: 'proj-c',
              directory: 'apps/c',
              orgId: 'team_other',
            },
          ],
        })
      );

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.isCrossTeamRepo).toBe(true);
      expect(ctx.org.id).toEqual(mockTeam.id);
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

      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.explicitScopeProvided).toBe(false);
    });

    it('should not false-positive on unrelated flags', async () => {
      client.argv = ['deploy', '--force', '--yes'];
      client.localConfig = {};

      const ctx = await getScope(client, { resolveLocalScope: true });

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
      const ctx = await getScope(client, { resolveLocalScope: true });

      expect(ctx.org.id).toEqual(mockTeam.id);
      expect(ctx.user.id).toEqual(mockUser.id);
      expect(ctx.team?.id).toEqual(mockTeam.id);
    });
  });
});

describe('applyScopeFromLink', () => {
  it('should set currentTeam from team org', () => {
    client.config.currentTeam = undefined;
    applyScopeFromLink(client, {
      org: { type: 'team', id: 'team_abc', slug: 'my-team' },
    });
    expect(client.config.currentTeam).toEqual('team_abc');
  });

  it('should clear currentTeam for personal account org', () => {
    client.config.currentTeam = 'team_old';
    applyScopeFromLink(client, {
      org: { type: 'user', id: 'user_abc', slug: 'johndoe' },
    });
    expect(client.config.currentTeam).toBeUndefined();
  });

  it('should override currentTeam when switching teams', () => {
    client.config.currentTeam = 'team_old';
    applyScopeFromLink(client, {
      org: { type: 'team', id: 'team_new', slug: 'new-team' },
    });
    expect(client.config.currentTeam).toEqual('team_new');
  });

  it('should warn on scope mismatch', async () => {
    client.config.currentTeam = 'team_global';
    applyScopeFromLink(client, {
      org: { type: 'team', id: 'team_local', slug: 'local-team' },
    });
    await expect(client.stderr).toOutput(
      'This directory is linked to a project under a different team'
    );
    expect(client.config.currentTeam).toEqual('team_local');
  });

  it('should not warn when scopes match', () => {
    client.config.currentTeam = 'team_abc';
    applyScopeFromLink(client, {
      org: { type: 'team', id: 'team_abc', slug: 'my-team' },
    });
    expect(client.config.currentTeam).toEqual('team_abc');
  });
});
