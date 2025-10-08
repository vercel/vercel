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
      client.scenario.get('/v3/domains/price', (_req, res) => {
        res.json({
          price,
          period: 2,
        });
      });

      client.scenario.get(
        `/v4/domains/${encodeURIComponent(domain.name)}/registry`,
        (req, res) => {
          res.json({
            transferable: true,
            transferPolicy: 'no-change',
          });
        }
      );

      client.scenario.post(`/v4/domains/`, (req, res) => {
        res.json({
          domain: domain,
        });
      });
    });

    it('tracks telemety events', async () => {
      client.setArgv('domains', 'transfer-in', domain.name);
      const exitCodePromise = domains(client);

      withFakeTimers(async () => {
        await expect(client.stderr).toOutput(
          `> The domain "${domain.name}" is available to transfer under ${username}! [0ms]`
        );
      });

      await expect(client.stderr).toOutput('- Transfer auth code: ');
      client.stdin.write(`${validCode}\n`);

      await expect(client.stderr).toOutput(
        `? Transfer now for $${price}? (y/N)`
      );
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "domains"').toEqual(0);
      expect(client.telemetryEventStore.readonlyEvents).toMatchObject([
        expect.objectContaining({
          key: `subcommand:transfer-in`,
          value: 'transfer-in',
        }),
        expect.objectContaining({
          key: `argument:domain`,
          value: '[REDACTED]',
        }),
      ]);
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
