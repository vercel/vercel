import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { createTeam, useTeams } from '../../../mocks/team';

describe('teams add', () => {
  const currentTeamId = 'team_123';
  const team = createTeam(currentTeamId, 'team-slug', 'My Team');

  beforeEach(() => {
    useUser();
    useTeams(team.id);

    client.config = {
      currentTeam: currentTeamId,
    };
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'teams';
      const subcommand = 'add';

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

  it('tracks telemetry events', async () => {
    client.scenario.post(`/teams`, (req, res) => {
      return res.json(team);
    });

    client.scenario.patch(`/teams/${team.id}`, (req, res) => {
      return res.json(team);
    });

    client.setArgv('teams', 'add');
    const exitCodePromise = teams(client);

    await expect(client.stderr).toOutput(`Pick a team identifier for its URL`);

    client.stdin.write(`${team.slug}\n`);

    await expect(client.stderr).toOutput(`Pick a display name for your team`);

    client.stdin.write(`${team.name}\n`);
    await expect(client.stderr).toOutput(`Success`);

    client.stdin.write(`\n`);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add', value: 'add' },
    ]);
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  describe('non-interactive mode', () => {
    it('creates team with --slug and --name', async () => {
      const newTeam = {
        id: 'team_new',
        slug: 'acme',
        name: 'Acme Corp',
        creatorId: 'user_1',
        created: '2017-04-29T17:21:54.514Z',
        avatar: null,
      };

      client.nonInteractive = true;
      client.scenario.post(`/teams`, (req, res) => {
        const body = req.body as { slug: string };
        return res.json({ ...newTeam, slug: body.slug });
      });
      client.scenario.patch(`/teams/${newTeam.id}`, (req, res) => {
        const body = req.body as { name: string };
        return res.json({ ...newTeam, name: body.name });
      });

      client.setArgv('teams', 'add', '--slug', 'acme', '--name', 'Acme Corp');
      const exitCode = await teams(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Team');
      await expect(client.stderr).toOutput('Acme Corp');
      await expect(client.stderr).toOutput('vercel.com/acme');
    });

    it('outputs action_required JSON when --slug is missing in non-interactive mode', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'add', '--name', 'Acme Corp');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toContain('--slug');
      expect(payload.next[0].command).toContain('teams add');
      expect(payload.next[0].command).toContain('<slug>');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('outputs action_required JSON when --name is missing in non-interactive mode', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'add', '--slug', 'acme');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.message).toContain('--name');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('outputs error JSON when --slug is invalid in non-interactive mode', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'add', '--slug', '123invalid', '--name', 'Acme');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_slug');
      expect(payload.message).toContain('--slug');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });
});
