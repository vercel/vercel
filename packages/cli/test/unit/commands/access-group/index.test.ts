import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useAccessGroups } from '../../../mocks/access-group';

describe('access-group', () => {
  beforeEach(() => {
    useUser();
  });

  it('prints help and exits 2 for the bare command with --help', async () => {
    client.setArgv('access-group', '--help');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(2);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:help',
        value: 'access-group',
      },
    ]);
  });

  it('defaults to the list subcommand when none is given', async () => {
    useAccessGroups();
    client.setArgv('access-group');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Access groups found under');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'default',
      },
    ]);
  });
});
