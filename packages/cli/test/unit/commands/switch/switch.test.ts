import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import teamsSwitch from '../../../../src/commands/teams/switch';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

describe('switch', () => {
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
      let exitCodePromise = teamsSwitch(client, []);
      await expect(client.stderr).toOutput('Switch to:');
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\r'); // Return key
      let exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "switch"').toEqual(0);
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
      exitCodePromise = teamsSwitch(client, []);
      await expect(client.stderr).toOutput('Switch to:');
      client.stdin.write('\x1B[A'); // Up arrow
      client.stdin.write('\r'); // Return key
      exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "switch"').toEqual(0);
      await expect(client.stderr).toOutput(
        `Your account (${user.username}) is now active!`
      );
    });
  });

  describe('northstar', () => {
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
      const exitCodePromise = teamsSwitch(client, []);
      // Test that personal account is not displayed in scope switcher
      await expect(client.stderr).not.toOutput(user.username);
      client.stdin.write('\r'); // Return key
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "switch"').toEqual(0);
      await expect(client.stderr).toOutput('No changes made');
    });

    it('should not let you switch to personal account if desiredSlug is set as personal account', async () => {
      const user = useUser({
        version: 'northstar',
      });
      useTeam();

      const exitCodePromise = teamsSwitch(client, [user.username]);
      // Personal account should be hidden
      await expect(client.stderr).toOutput(
        'You cannot set your Personal Account as the scope.'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "switch"').toEqual(1);
    });
  });
});
