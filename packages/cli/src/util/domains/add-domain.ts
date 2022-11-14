import chalk from 'chalk';
import retry from 'async-retry';
import { DomainAlreadyExists, InvalidDomain, isAPIError } from '../errors-ts';
import { Domain } from '../../types';
import Client from '../client';

type Response = {
  domain: Domain;
};

export default async function addDomain(
  client: Client,
  domain: string,
  contextName: string
) {
  client.output.spinner(
    `Adding domain ${domain} under ${chalk.bold(contextName)}`
  );
  const addedDomain = await performAddRequest(client, domain);
  return addedDomain;
}

async function performAddRequest(client: Client, domainName: string) {
  return retry(
    async () => {
      try {
        const { domain } = await client.fetch<Response>('/v4/domains', {
          body: { name: domainName },
          method: 'POST',
        });
        return domain;
      } catch (err: unknown) {
        if (isAPIError(err)) {
          if (err.code === 'invalid_name') {
            return new InvalidDomain(domainName);
          }

          if (err.code === 'domain_already_exists') {
            return new DomainAlreadyExists(domainName);
          }
        }

        throw err;
      }
    },
    { retries: 5, maxTimeout: 8000 }
  );
}
