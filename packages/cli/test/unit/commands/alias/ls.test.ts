import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import alias from '../../../../src/commands/alias';
import { useUser } from '../../../mocks/user';
import { useAlias } from '../../../mocks/alias';

describe('alias ls', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'alias';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should list up to 20 aliases by default', async () => {
    useAlias();
    client.setArgv('alias', 'ls');
    const exitCodePromise = alias(client);
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stdout).toOutput('dummy-19.app');
  });

  describe('--next', () => {
    it('tracks subcommand and option values', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--next', '1727714910573');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:ls`,
          value: 'ls',
        },
        {
          key: `option:next`,
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--limit', () => {
    it('should list up to 2 aliases', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--limit', '2');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stdout).toOutput('dummy-1.app');
    });

    it('tracks subcommand and option values', async () => {
      useAlias();
      client.setArgv('alias', 'ls', '--limit', '2');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:ls`,
          value: 'ls',
        },
        {
          key: `option:limit`,
          value: '2',
        },
      ]);
    });
  });
});
