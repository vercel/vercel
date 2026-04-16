import { describe, it, expect, afterEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import * as ls from '../../../../src/commands/flags/ls';
import * as openFlag from '../../../../src/commands/flags/open';
import * as rolloutFlag from '../../../../src/commands/flags/rollout';
import * as updateFlag from '../../../../src/commands/flags/update';
import { client } from '../../../mocks/client';

describe('flags', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);
  const openSpy = vi.spyOn(openFlag, 'default').mockResolvedValue(0);
  const rolloutSpy = vi.spyOn(rolloutFlag, 'default').mockResolvedValue(0);
  const updateSpy = vi.spyOn(updateFlag, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
    openSpy.mockClear();
    rolloutSpy.mockClear();
    updateSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';

      client.setArgv(command, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('routes to ls subcommand', async () => {
    const args: string[] = [];

    client.setArgv('flags', ...args);
    await flags(client);
    expect(lsSpy).toHaveBeenCalledWith(client, args);
  });

  describe('unrecognized subcommand', () => {
    it('routes to ls', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('flags', ...args);
      await flags(client);
      expect(lsSpy).toHaveBeenCalledWith(client, args);
    });
  });

  it('routes to open subcommand', async () => {
    const args: string[] = ['my-feature'];

    client.setArgv('flags', 'open', ...args);
    await flags(client);
    expect(openSpy).toHaveBeenCalledWith(client, args);
  });

  it('routes to update subcommand', async () => {
    const args: string[] = [
      'my-feature',
      '--variant',
      'control',
      '--value',
      'welcome',
    ];

    client.setArgv('flags', 'update', ...args);
    await flags(client);
    expect(updateSpy).toHaveBeenCalledWith(client, args);
  });

  it('routes to rollout subcommand', async () => {
    const args: string[] = [
      'my-feature',
      '--environment',
      'production',
      '--by',
      'user.userId',
      '--stage',
      '5,6h',
    ];

    client.setArgv('flags', 'rollout', ...args);
    await flags(client);
    expect(rolloutSpy).toHaveBeenCalledWith(client, args);
  });
});
