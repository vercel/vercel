import { describe, expect, it, beforeEach, vi } from 'vitest';
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
    it('outputs action_required JSON when no email is provided', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'invite');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toContain('email');
      expect(payload.next[0].command).toContain('teams invite');
      expect(payload.next[0].command).toContain('<email>');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('succeeds when emails are provided', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      client.scenario.post(`/teams/${currentTeamId}/members`, (req, res) => {
        expect(req.body).toEqual({ email: 'me@example.com' });
        return res.json({ username: 'person1' });
      });
      client.setArgv('teams', 'invite', 'me@example.com');
      const exitCode = await teams(client);
      expect(exitCode).toBe(0);
    });

    it('passes a normalized role in the request and tracks it', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      client.scenario.post(`/teams/${currentTeamId}/members`, (req, res) => {
        expect(req.body).toEqual({
          email: 'me@example.com',
          role: 'DEVELOPER',
        });
        return res.json({ username: 'person1' });
      });
      client.setArgv(
        'teams',
        'invite',
        'me@example.com',
        '--role',
        'developer'
      );

      await expect(teams(client)).resolves.toBe(0);
      await expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:invite',
          value: 'invite',
        },
        {
          key: 'argument:email',
          value: 'ONE',
        },
        {
          key: 'option:role',
          value: 'DEVELOPER',
        },
      ]);
    });

    it('rejects an invalid role before inviting', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'invite', 'me@example.com', '--role', 'invalid');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_role');
      expect(payload.message).toContain('--role must be one of');
      expect(payload.next).toEqual([
        {
          command: expect.stringContaining(
            'teams invite <email> --role <ROLE>'
          ),
          when: 'to retry with a valid role',
        },
      ]);

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('outputs team_scope_required with global flags in next when no team scope', async () => {
      client.nonInteractive = true;
      // No currentTeam so invite cannot determine which team to invite to
      client.config = {};
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'teams',
        'invite',
        'me@example.com',
        '--non-interactive',
        '--cwd',
        '/tmp/proj'
      );
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('team_scope_required');
      expect(payload.next[0].command).toContain('teams switch');
      expect(payload.next[0].command).toContain('<slug>');
      expect(payload.next[0].command).toContain('--cwd');
      expect(payload.next[0].command).toContain('/tmp/proj');
      expect(payload.next[0].command).toContain('--non-interactive');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('outputs error JSON when API returns user_not_found', async () => {
      client.nonInteractive = true;
      client.config = { currentTeam: currentTeamId };
      client.scenario.post(`/teams/${currentTeamId}/members`, (_req, res) => {
        res.statusCode = 404;
        return res.json({
          error: {
            code: 'user_not_found',
            message: 'User not found',
          },
        });
      });
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'teams',
        'invite',
        'nobody@example.com',
        '--role',
        'DEVELOPER'
      );
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('user_not_found');
      expect(payload.message).toContain('nobody@example.com');
      expect(payload.next[0].command).toContain('teams invite');
      expect(payload.next[0].command).toContain('--role DEVELOPER');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
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
