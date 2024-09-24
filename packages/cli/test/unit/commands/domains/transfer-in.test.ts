import { describe, it, expect, beforeEach, afterEach, vitest } from 'vitest';

import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useDomainPrice, useDomains, useDomain } from '../../../mocks/domains';

describe('domains transfer-in', () => {
  const username = 'UserName';

  beforeEach(() => {
    client.reset();
    
    useUser({
      username,
    });
  });

  describe('[DOMAIN] missing', () => {
    useDomains();

    it('errors', async () => {
      client.setArgv('domains', 'transfer-in');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Error: Missing domain name. Run `vercel domains --help'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('[DOMAIN]', () => {
    it.only('tracks telemety events', async () => {
      const code = 'FAKE CODE';
      const domain = useDomain('suffix');
      const price = 3.5;
      useDomainPrice(price);

      const domainName = 'example.com';
      client.scenario.get(
        `/v4/domains/${encodeURIComponent(domainName)}/registry`,
        (req, res) => {
          res.json({
            transferable: true,
            transferPolicy: 'no-change',
          });
        }
      );

      client.scenario.post(
        `/v4/domains/`,
        (req, res) => {
          res.json({
            domain: domain
          });
        }
      );

      client.setArgv('domains', 'transfer-in', domainName);
      const exitCodePromise = domains(client);

      vitest.useFakeTimers();
      vitest.setSystemTime(new Date(2024, 8, 19))
      await expect(client.stderr).toOutput(`> The domain "${domainName}" is available to transfer under ${username}! [0ms]`);
      vitest.useRealTimers();

      await expect(client.stderr).toOutput('- Transfer auth code: ');
      client.stdin.write(`${code}\n`);

      await expect(client.stderr).toOutput(`- Transfer auth code: ${code}`);
      const asked = `? Transfer now for $${price}? (y/N)`;
      await expect(client.stderr).toOutput(asked);

      client.stdin.write('y\n');

      expect(client.telemetryEventStore.readonlyEvents).toMatchObject(
        [
          expect.objectContaining({
            key: `subcommand:transfer-in`,
            value: 'transfer-in'
          }),
          expect.objectContaining({
            key: `argument:domain`,
            value: '[REDACTED]'
          }),
          expect.objectContaining({
            key: `flag:code`,
            value: '[REDACTED]'
          })
        ]
      )
      await expect(exitCodePromise).resolves.toEqual(0);
    }, 600000);

    describe('--code', () => {
      it('tracks telemety events', async () => {
        const domain = useDomain('suffix');
        const price = 3.5;
        useDomainPrice(price);

        const domainName = 'example.com';
        client.scenario.get(
          `/v4/domains/${encodeURIComponent(domainName)}/registry`,
          (req, res) => {
            res.json({
              transferable: true,
              transferPolicy: 'no-change',
            });
          }
        );

        client.scenario.post(
          `/v4/domains/`,
          (req, res) => {
            res.json({
              domain: domain
            });
          }
        );

        client.setArgv('domains', 'transfer-in', domainName, '--code=ABC');
        const exitCodePromise = domains(client);

        vitest.useFakeTimers();
        vitest.setSystemTime(new Date(2024, 8, 19))
        const asked = `> The domain "${domainName}" is available to transfer under ${username}! [0ms]
? Transfer now for $${price}? (y/N)`;
        await expect(client.stderr).toOutput(asked);
        vitest.useRealTimers();

        client.stdin.write('y\n');

        expect(client.telemetryEventStore.readonlyEvents).toMatchObject(
         [
            expect.objectContaining({
              key: `subcommand:transfer-in`,
              value: 'transfer-in'
            }),
            expect.objectContaining({
              key: `argument:domain`,
              value: '[REDACTED]'
            }),
            expect.objectContaining({
              key: `flag:code`,
              value: '[REDACTED]'
            })
          ]
        )
        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });
  });
});
