import { describe, expect, it, beforeEach } from 'vitest';
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

    it('errors when --slug is missing in non-interactive mode', async () => {
      client.nonInteractive = true;
      client.setArgv('teams', 'add', '--name', 'Acme Corp');
      const exitCode = await teams(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'In non-interactive mode "--slug" is required'
      );
    });

    it('errors when --name is missing in non-interactive mode', async () => {
      client.nonInteractive = true;
      client.setArgv('teams', 'add', '--slug', 'acme');
      const exitCode = await teams(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'In non-interactive mode "--name" is required'
      );
    });

    it('errors when --slug is invalid in non-interactive mode', async () => {
      client.nonInteractive = true;
      client.setArgv('teams', 'add', '--slug', '123invalid', '--name', 'Acme');
      const exitCode = await teams(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid "--slug"');
    });
  });
});
