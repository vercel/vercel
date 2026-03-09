import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

describe('teams invite', () => {
  const currentTeamId = 'team_123';

  beforeEach(() => {
    useUser();
    useTeams(currentTeamId);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'teams';
      const subcommand = 'invite';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('non-interactive mode', () => {
    it('errors when no email is provided', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      client.setArgv('teams', 'invite');
      const exitCode = await teams(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'In non-interactive mode at least one email is required'
      );
    });

    it('succeeds when emails are provided', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      client.scenario.post(`/teams/${currentTeamId}/members`, (_req, res) => {
        return res.json({ username: 'person1' });
      });
      client.setArgv('teams', 'invite', 'me@example.com');
      const exitCode = await teams(client);
      expect(exitCode).toBe(0);
    });
  });

  describe('[email]', () => {
    beforeEach(() => {
      client.config = {
        currentTeam: currentTeamId,
      };

      client.scenario.post(`/teams/${currentTeamId}/members`, (req, res) => {
        return res.json({
          username: 'person1',
        });
      });
    });
    describe('a single email value', () => {
      it('tracks telemetry events', async () => {
        client.setArgv('teams', 'invite', 'me@example.com');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);

        await expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:invite',
            value: 'invite',
          },
          {
            key: 'argument:email',
            value: 'ONE',
          },
        ]);
      });
    });

    describe('several email value', () => {
      it('tracks telemetry events', async () => {
        client.setArgv('teams', 'invite', 'me@example.com', 'you@example.com');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);

        await expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:invite',
            value: 'invite',
          },
          {
            key: 'argument:email',
            value: 'MANY',
          },
        ]);
      });
    });
  });
});
