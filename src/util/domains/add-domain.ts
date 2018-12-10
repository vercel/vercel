import chalk from 'chalk';
import retry from 'async-retry';

import { CDNNeedsUpgrade, DomainAlreadyExists, InvalidDomain } from '../errors-ts';
import { Domain } from '../../types';
import Client from '../client';
import wait from '../output/wait';

type Response = {
  domain: Domain
}

export default async function addDomain(client: Client, domain: string, contextName: string, cdnEnabled?: boolean) {
  const cancelWait = wait(`Adding domain ${domain} under ${chalk.bold(contextName)}`);
  try {
    const addedDomain = await performAddRequest(client, domain, cdnEnabled);
    cancelWait();
    return addedDomain;
  } catch (error) {
    cancelWait();
    throw error;
  }
}

async function performAddRequest(client: Client, domainName: string, cdnEnabled?: boolean) {
  return retry(
    async () => {
      try {
        const { domain } = await client.fetch<Response>('/v4/domains', {
          body: { name: domainName, cdnEnabled },
          method: 'POST'
        })
        return domain;
      } catch (error) {
        if (error.code === 'invalid_name') {
          return new InvalidDomain(domainName);
        }

        if (error.code === 'domain_with_cdn_needs_upgrade') {
          return new CDNNeedsUpgrade();
        }

        if (error.code === 'domain_already_exists') {
          return new DomainAlreadyExists(domainName)
        }

        throw error;
      }
    },
    { retries: 5, maxTimeout: 8000 }
  );
}
