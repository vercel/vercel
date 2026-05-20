import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { printProjectNotFoundError } from '../../../../src/util/projects/project-not-found-error';
import * as getScopeModule from '../../../../src/util/get-scope';

describe('printProjectNotFoundError', () => {
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    client.reset();
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never) as unknown as {
      mockRestore: () => void;
    };
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });

  describe('interactive mode', () => {
    it('emits a multi-line error naming the current scope and recovery hints', async () => {
      useUser();
      const teams = useTeams('team_dummy');
      const teamSlug = Array.isArray(teams)
        ? teams[0].slug
        : teams.teams[0].slug;
      client.config.currentTeam = 'team_dummy';

      await printProjectNotFoundError(client, 'foo', 'deploy');

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        `Project "foo" was not found in the current scope (${teamSlug}).`
      );
      expect(stderr).toContain('--scope <team-slug|your-username>');
      expect(stderr).toContain('vercel switch <team-slug|your-username>');
      expect(stderr).toContain('vercel teams ls');
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('falls back to a scope-agnostic message when getScope fails', async () => {
      vi.spyOn(getScopeModule, 'default').mockRejectedValue(
        new Error('network down')
      );

      await printProjectNotFoundError(client, 'foo', 'deploy');

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Project "foo" was not found in the current scope.'
      );
      expect(stderr).toContain('vercel teams ls');
      // No parenthetical scope name when scope lookup fails.
      expect(stderr).not.toMatch(
        /Project "foo" was not found in the current scope \(/
      );
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe('non-interactive mode', () => {
    it('emits structured JSON with reason, scope, and a next array', async () => {
      useUser();
      const teams = useTeams('team_dummy');
      const teamSlug = Array.isArray(teams)
        ? teams[0].slug
        : teams.teams[0].slug;
      client.config.currentTeam = 'team_dummy';
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--project=foo');

      await printProjectNotFoundError(client, 'foo', 'deploy');

      const stdout = client.stdout.getFullOutput();
      const payload = JSON.parse(stdout);

      expect(payload).toMatchObject({
        status: 'error',
        reason: 'project_not_found',
        scope: teamSlug,
        message: expect.stringContaining('Project "foo" was not found'),
      });

      expect(Array.isArray(payload.next)).toBe(true);
      expect(payload.next).toHaveLength(3);
      expect(payload.next[0]).toEqual({
        command: 'vercel teams ls',
        when: 'list accessible teams',
      });
      expect(payload.next[1].command).toContain('--scope <team-slug>');
      expect(payload.next[1].command).toContain('--project foo');
      expect(payload.next[2].command).toBe('vercel switch <team-slug>');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('omits the scope field when getScope fails', async () => {
      vi.spyOn(getScopeModule, 'default').mockRejectedValue(
        new Error('network down')
      );
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--project=foo');

      await printProjectNotFoundError(client, 'foo', 'deploy');

      const stdout = client.stdout.getFullOutput();
      const payload = JSON.parse(stdout);

      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('project_not_found');
      expect(payload.scope).toBeUndefined();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
