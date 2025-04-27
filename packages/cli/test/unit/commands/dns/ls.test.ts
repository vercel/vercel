import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';
import { useDns } from '../../../mocks/dns';

describe('dns ls', () => {
  beforeEach(() => {
    useUser();
    useDns();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('[domain] missing', () => {
    it('should list up to 20 dns by default', async () => {
      client.setArgv('dns', 'ls');
      const exitCodePromise = dns(client);
      await expect(client.stderr).toOutput('example-19.com');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "dns"').toEqual(0);
    });

    it('track subcommand invocation', async () => {
      client.setArgv('dns', 'ls');
      const exitCodePromise = dns(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
      ]);
    });

    describe('--limit', () => {
      it('should list up to 2 dns if limit set to 2', async () => {
        client.setArgv('dns', 'ls', '--limit', '2');
        const exitCodePromise = dns(client);
        await expect(client.stderr).toOutput('example-2.com');
        const exitCode = await exitCodePromise;
        expect(exitCode, 'exit code for "dns"').toEqual(0);
      });

      it('track subcommand invocation', async () => {
        client.setArgv('dns', 'ls', '--limit', '2');
        const exitCodePromise = dns(client);

        await expect(exitCodePromise).resolves.toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:list',
            value: 'ls',
          },
          {
            key: 'option:limit',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--next', () => {
      it('tracks the use of next option', async () => {
        client.setArgv('dns', 'ls', '--next', '1729878610745');
        const exitCodePromise = dns(client);

        await expect(exitCodePromise).resolves.toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:list',
            value: 'ls',
          },
          {
            key: 'option:next',
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });

  describe('[domain]', () => {
    it('tracks the use of domain argument', async () => {
      client.scenario.get('/v4/domains/:domain?/records', (req, res) => {
        res.json({
          records: [],
          pagination: { count: 1, total: 1, page: 1, pages: 1 },
        });
      });
      client.setArgv('dns', 'ls', 'example-19.com');
      const exitCodePromise = dns(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
