import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

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

    it('should prefer team when slug matches both personal username and team slug', async () => {
      const user = useUser({ version: 'northstar' });
      const matchingTeam = {
        id: 'team_matching',
        slug: user.username,
        name: 'Matching Team',
        creatorId: 'creator-id',
        created: '2017-04-29T17:21:54.514Z',
        avatar: null,
      };
      client.scenario.get('/v1/teams', (_req: any, res: any) => {
        res.json({ teams: [matchingTeam] });
      });

      client.setArgv('teams', 'switch', user.username);
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput(
        `The team Matching Team (${user.username}) is now active!`
      );
    });
  });
});
