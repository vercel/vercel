import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

describe('access-group members add', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
  });

  afterEach(() => {
    client.config.currentTeam = undefined;
  });

  function useTeamMembers() {
    client.scenario.get('/v2/teams/team_dummy/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'usr_1', email: 'jane@example.com', username: 'jane' },
        ],
        pagination: { count: 1, next: null },
      });
    });
  }

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'members', 'add', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:members',
          value: 'members',
        },
        {
          key: 'flag:help',
          value: 'access-group members:add',
        },
      ]);
    });
  });

  it('errors when the member is missing', async () => {
    client.setArgv('access-group', 'members', 'add', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group and a member'
    );
  });

  it('resolves a member by email and adds it via the update endpoint', async () => {
    useTeamMembers();
    let body: unknown;
    client.scenario.post('/v1/access-groups/ag_1', (req, res) => {
      body = req.body;
      res.json({});
    });

    client.setArgv(
      'access-group',
      'members',
      'add',
      'ag_1',
      'jane@example.com'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ membersToAdd: ['usr_1'] });
    await expect(client.stderr).toOutput('added to access group');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:members',
        value: 'members',
      },
      {
        key: 'subcommand:add',
        value: 'add',
      },
      {
        key: 'argument:group',
        value: '[REDACTED]',
      },
      {
        key: 'argument:member',
        value: '[REDACTED]',
      },
    ]);
  });

  it('errors when the member cannot be resolved', async () => {
    useTeamMembers();
    client.setArgv(
      'access-group',
      'members',
      'add',
      'ag_1',
      'nobody@example.com'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Could not find a team member matching'
    );
  });
});
