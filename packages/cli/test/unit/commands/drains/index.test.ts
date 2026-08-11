import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { useDrains } from '../../../mocks/drains';

describe('drains', () => {
  beforeEach(() => {
    useUser();
  });

  it('prints help and exits 2 for the bare command with --help', async () => {
    client.setArgv('drains', '--help');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(2);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:help',
        value: 'drains',
      },
    ]);
  });

  it('defaults to the list subcommand when none is given', async () => {
    useDrains();
    client.setArgv('drains');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Drains found under');
  });
});
