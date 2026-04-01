import { describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { useTeam, createTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('teams switch', () => {
  describe('non-northstar', () => {
    it('should let you switch to team and back', async () => {
      const user = useUser();
      const team = useTeam();

      // ? Switch to:
      // ── Personal Account ──────────────
      // ● Name (username) (current)
      // ── Teams ─────────────────────────
      // ○ Team (slug)
      // ──────────────────────────────────
      // ○ Cancel
      client.setArgv('teams', 'switch');
      let exitCodePromise = teams(client);
      await expect(client.stderr).toOutput('Switch to:');
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\r'); // Return key
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput(
        `Success! The team ${team.name} (${team.slug}) is now active!`
      );

      // ? Switch to:
      // ── Personal Account ──────────────
      // ○ Name (username)
      // ── Teams ─────────────────────────
      // ● Team (slug) (current)
      // ──────────────────────────────────
      // ○ Cancel
      exitCodePromise = teams(client);
      await expect(client.stderr).toOutput('Switch to:');
      client.stdin.write('\x1B[A'); // Up arrow
      client.stdin.write('\r'); // Return key
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput(
        `Your account (${user.username}) is now active!`
      );
    });
  });

  describe('northstar', () => {
    it('should let you provide a slug to bypass prompt', async () => {
      useUser();
      const team = useTeam();

      client.config.currentTeam = team.id;
      client.setArgv('teams', 'switch', team.slug);
      const exitCode = await teams(client);
      expect(exitCode, 'exit code for "teams"').toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:switch', value: 'switch' },
        { key: 'argument:slug', value: '[REDACTED]' },
      ]);
    });
    it('should not let you switch to personal account', async () => {
      const user = useUser({
        version: 'northstar',
      });
      const team = useTeam();
      client.config.currentTeam = team.id;

      // ? Switch to:
      // ── Teams ─────────────────────────
      // ● Team (slug) (current)
      // ──────────────────────────────────
      // ○ Cancel
      client.setArgv('teams', 'switch');
      const exitCodePromise = teams(client);
      // Test that personal account is not displayed in scope switcher
      await expect(client.stderr).not.toOutput(user.username);
      client.stdin.write('\r'); // Return key
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput('No changes made');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:switch', value: 'switch' },
      ]);
    });

    it('outputs error JSON when switching to personal account in non-interactive mode', async () => {
      const user = useUser({
        version: 'northstar',
      });
      useTeam();
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'switch', user.username);
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('personal_scope_not_allowed');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('should not let you switch to personal account if desiredSlug is set as personal account', async () => {
      const user = useUser({
        version: 'northstar',
      });
      useTeam();
      client.setArgv('teams', 'switch', user.username);
      const exitCodePromise = teams(client);
      // Personal account should be hidden
      await expect(client.stderr).toOutput(
        'You cannot set your Personal Account as the scope.'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should preselect the default team when currentTeam is unset', async () => {
      const defaultTeam = useTeam('team_zulu');
      defaultTeam.slug = 'zulu-team';
      defaultTeam.name = 'Zulu Team';
      createTeam('team_alpha', 'alpha-team', 'Alpha Team');
      useUser({
        version: 'northstar',
        defaultTeamId: defaultTeam.id,
      });

      client.config.currentTeam = undefined;
      client.setArgv('teams', 'switch');
      const exitCodePromise = teams(client);

      await expect(client.stderr).toOutput(
        `${defaultTeam.name} (${defaultTeam.slug}) (current)`
      );

      client.stdin.write('\r');
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput('No changes made');
    });
  });

  describe('non-interactive mode', () => {
    it('outputs action_required JSON when slug is omitted even if currentTeam is stale', async () => {
      useUser();
      useTeam();
      // Stale currentTeam (not in teams list) would previously yield
      // current_team_invalid before missing slug was detected.
      client.config.currentTeam = 'stale-team-id-not-in-list';
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'switch');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toContain('slug');
      expect(
        payload.next.some((n: { command: string }) =>
          n.command.includes('teams switch')
        )
      ).toBe(true);

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
      client.config.currentTeam = undefined;
    });

    it('outputs current_team_invalid with teams list and login in next when currentTeam is stale', async () => {
      useUser();
      const team = useTeam();
      client.config.currentTeam = 'stale-team-id-not-in-list';
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'switch', team.slug, '--non-interactive');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('current_team_invalid');
      const listNext = payload.next.find((n: { command: string }) =>
        n.command.includes('teams list')
      );
      expect(listNext).toBeDefined();
      expect(listNext.command).toContain('--non-interactive');
      const loginNext = payload.next.find(
        (n: { command: string }) =>
          n.command.includes('login') && !n.command.includes('teams')
      );
      expect(loginNext).toBeDefined();
      expect(loginNext.command).toContain('login');
      expect(loginNext.command).toContain('--non-interactive');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
      client.config.currentTeam = undefined;
    });

    it('preserves global flags in next when slug omitted with --cwd', async () => {
      useUser();
      useTeam();
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'teams',
        'switch',
        '--non-interactive',
        '--cwd',
        '/tmp/proj'
      );
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.reason).toBe('missing_arguments');
      const switchNext = payload.next.find((n: { command: string }) =>
        n.command.includes('teams switch')
      );
      expect(switchNext.command).toContain('--cwd');
      expect(switchNext.command).toContain('/tmp/proj');
      const listNext = payload.next.find((n: { command: string }) =>
        n.command.includes('teams list')
      );
      expect(listNext.command).toContain('--cwd');
      expect(listNext.command).toContain('/tmp/proj');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('outputs error JSON when slug is not accessible', async () => {
      useUser();
      const team = useTeam();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'switch', 'nonexistent-slug-xyz');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('scope_not_accessible');
      expect(payload.message).toContain('nonexistent-slug-xyz');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('stale-link detection', () => {
    it('should warn when switching to a team that differs from the linked project', async () => {
      useUser();
      const teamA = useTeam('team_aaa');
      const teamB = createTeam('team_bbb', 'team-b', 'Team B');

      const cwd = setupTmpDir();
      client.cwd = cwd;
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({ projectId: 'prj_xxx', orgId: 'team_aaa' })
      );

      client.config.currentTeam = teamA.id;
      client.setArgv('teams', 'switch', teamB.slug);
      const exitCode = await teams(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput(
        'This directory is linked to a project under a different team/scope'
      );
    });

    it('should not warn when switching to the same team as the linked project', async () => {
      useUser();
      const teamA = useTeam('team_aaa');
      const teamB = createTeam('team_bbb', 'team-b', 'Team B');

      const cwd = setupTmpDir();
      client.cwd = cwd;
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({ projectId: 'prj_xxx', orgId: 'team_bbb' })
      );

      client.config.currentTeam = teamA.id;
      client.setArgv('teams', 'switch', teamB.slug);
      const exitCode = await teams(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput(
        `The team ${teamB.name} (${teamB.slug}) is now active!`
      );
      await expect(client.stderr).not.toOutput(
        'This directory is linked to a project under a different team/scope'
      );
    });
  });
});
