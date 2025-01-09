import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';
import { useDns } from '../../../mocks/dns';

describe('dns rm', () => {
  beforeEach(() => {
    useUser();
    useDns();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:rm`,
        },
      ]);
    });
  });

  describe('[id]', () => {
    it('tracks the use of the argument', async () => {
      const recordId = '1';
      client.scenario.get(`/v5/domains/records/${recordId}`, (req, res) => {
        res.json({
          id: '1',
          type: 'A',
          value: '',
          mxPriority: '1',
          domain: {
            domainName: 'example.com',
          },
          createdAt: '1729878610745',
          name: 'Example',
        });
      });
      client.scenario.delete(
        `/v3/domains/:domain?/records/${recordId}`,
        (req, res) => {
          res.json({});
        }
      );
      client.setArgv('dns', 'rm', recordId);
      const exitCodePromise = dns(client);

      await expect(client.stderr).toOutput(
        `The following record will be removed permanently`
      );

      client.stdin.write('y\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'rm',
        },
        {
          key: 'argument:recordId',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
