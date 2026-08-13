import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useAccessGroupMembers } from '../../../mocks/access-group';

describe('access-group members list', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry for the members group', async () => {
      client.setArgv('access-group', 'members', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:members',
          value: 'members',
        },
        {
          key: 'flag:help',
          value: 'access-group members',
        },
      ]);
    });

    it('tracks telemetry for the list leaf', async () => {
      client.setArgv('access-group', 'members', 'list', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:members',
          value: 'members',
        },
        {
          key: 'flag:help',
          value: 'access-group members:list',
        },
      ]);
    });
  });

  it('errors when no group is passed', async () => {
    client.setArgv('access-group', 'members', 'list');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group id or name'
    );
  });

  it('lists the members of an access group', async () => {
    useAccessGroupMembers('ag_1');
    client.setArgv('access-group', 'members', 'ls', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    await expect(client.stderr).toOutput('Members found in');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('usr_1');
    expect(stdout).toContain('jane');
  });

  it('handles an empty member list', async () => {
    useAccessGroupMembers('ag_1', []);
    client.setArgv('access-group', 'members', 'ls', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No members found in');
  });

  it('outputs JSON on stdout', async () => {
    useAccessGroupMembers('ag_1');
    client.setArgv('access-group', 'members', 'ls', 'ag_1', '--json');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.members).toHaveLength(1);
    expect(parsed.members[0].uid).toEqual('usr_1');
  });
});
