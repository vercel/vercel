import { describe, it, expect, beforeEach, vitest } from 'vitest';

import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useDomainPrice, useDomains } from '../../../mocks/domains';

describe('domains transfer-in', () => {
  const username = 'UserName';

  beforeEach(() => {
    vitest.useFakeTimers();
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
    describe('--code', () => {
      it.only('tracks telemety events', async () => {
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

        client.setArgv('domains', 'transfer-in', domainName, '--code=ABC');
        const exitCodePromise = domains(client);

        const asked = `> The domain "example.com" is available to transfer under ${username}!
? Transfer now for $${price}? (y/N)`;
        await expect(client.stderr).toOutput(asked);
        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });
  });
});
