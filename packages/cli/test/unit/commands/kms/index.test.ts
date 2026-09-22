import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import * as ls from '../../../../src/commands/kms/ls';
import { client } from '../../../mocks/client';

describe('kms', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'kms';

      client.setArgv(command, '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('routes to ls by default', async () => {
    client.setArgv('kms');
    await kms(client);
    expect(lsSpy).toHaveBeenCalledWith(client, []);
  });

  it('routes create and import to separate subcommands', async () => {
    client.setArgv('kms', 'import', '--help');
    await expect(kms(client)).resolves.toEqual(2);
    expect(lsSpy).not.toHaveBeenCalled();
    await expect(client.stderr).toOutput('kms import');
  });

  it('rejects an unrecognized subcommand instead of listing', async () => {
    client.setArgv('kms', 'not-a-command');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(2);
    expect(lsSpy).not.toHaveBeenCalled();
    await expect(client.stderr).toOutput('Please specify a valid subcommand');
  });
});
