import { describe, it, expect, beforeEach, vitest } from 'vitest';

import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { createDomain } from '../../../mocks/domains';

describe('domains transfer-in', () => {
  const username = 'UserName';

  beforeEach(() => {
    client.reset();

    useUser({
      username,
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'transfer-in';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:transfer-in`,
        },
      ]);
    });
  });

  describe('[DOMAIN] missing', () => {
    it('errors', async () => {
      client.setArgv('domains', 'transfer-in');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Error: Missing domain name. Run `vercel domains --help'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "domains"').toEqual(1);
    });
  });

  describe('[DOMAIN]', () => {
    const domain = createDomain();
    const price = 3.5;
    const validCode = 'valid-code';

    beforeEach(() => {
      client.scenario.get(
        `/v1/registrar/domains/${encodeURIComponent(domain.name)}/price`,
        (_req, res) => {
          res.json({
            purchasePrice: null,
            renewalPrice: null,
            transferPrice: price,
            years: 2,
          });
        }
      );

      client.scenario.post(
        `/v1/registrar/domains/${encodeURIComponent(domain.name)}/transfer`,
        (req, res) => {
          res.json({
            orderId: 'test-order-id-123',
          });
        }
      );

      client.scenario.get(
        '/v1/registrar/orders/test-order-id-123',
        (req, res) => {
          res.json({
            id: 'test-order-id-123',
            status: 'completed',
            domains: [
              {
                domainName: domain.name,
                status: 'completed',
              },
            ],
          });
        }
      );
    });

    describe('--code', () => {
      it('tracks telemety events', async () => {
        client.setArgv(
          'domains',
          'transfer-in',
          domain.name,
          `--code=${validCode}`
        );
        const exitCodePromise = domains(client);

        const asked = `> The domain "${domain.name}" is available to transfer under ${username}! [0ms]
? Transfer now for $${price}? (y/N)`;

        withFakeTimers(async () => {
          await expect(client.stderr).toOutput(asked);
        });

        client.stdin.write('y\n');

        const exitCode = await exitCodePromise;
        expect(exitCode, 'exit code for "domains"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:transfer-in`,
            value: 'transfer-in',
          },
          {
            key: `option:code`,
            value: '[REDACTED]',
          },
          {
            key: `argument:domain`,
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });
});

// The CLI displays a timer which we need to fake.
function withFakeTimers(callback: Function) {
  vitest.useFakeTimers();
  vitest.setSystemTime(new Date());
  callback();
  vitest.useRealTimers();
}
