import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useAccessGroupMembers } from '../../../mocks/access-group';

describe('access-group members remove', () => {
  beforeEach(() => {
    useUser();
  });

  afterEach(() => {
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'members', 'rm', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:members',
          value: 'members',
        },
        {
          key: 'flag:help',
          value: 'access-group members:rm',
        },
      ]);
    });
  });

  it('requires --yes in non-interactive mode and does not update', async () => {
    let updated = false;
    client.scenario.post('/v1/access-groups/ag_1', (_req, res) => {
      updated = true;
      res.json({});
    });

    client.nonInteractive = true;
    client.setArgv('access-group', 'members', 'rm', 'ag_1', 'jane');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    expect(updated).toEqual(false);
    await expect(client.stderr).toOutput('`--yes` is required');
  });

  it('does not update when the user declines', async () => {
    useAccessGroupMembers('ag_1');
    let updated = false;
    client.scenario.post('/v1/access-groups/ag_1', (_req, res) => {
      updated = true;
      res.json({});
    });

    client.setArgv('access-group', 'members', 'rm', 'ag_1', 'jane');
    const exitCodePromise = accessGroup(client);
    await expect(client.stderr).toOutput('Are you sure');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
    expect(updated).toEqual(false);
  });

  it('resolves a member and removes it with --yes', async () => {
    useAccessGroupMembers('ag_1');
    let body: unknown;
    client.scenario.post('/v1/access-groups/ag_1', (req, res) => {
      body = req.body;
      res.json({});
    });

    client.setArgv('access-group', 'members', 'rm', 'ag_1', 'jane', '--yes');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ membersToRemove: ['usr_1'] });
    await expect(client.stderr).toOutput('removed from access group');
  });

  it('errors when the member is not in the group', async () => {
    useAccessGroupMembers('ag_1');
    client.setArgv('access-group', 'members', 'rm', 'ag_1', 'nobody', '--yes');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Could not find a member matching');
  });
});
