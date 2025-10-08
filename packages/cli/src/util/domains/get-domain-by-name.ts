import chalk from 'chalk';
import type Client from '../client';
import type { Domain } from '@vercel-internals/types';
import {
  DomainPermissionDenied,
  DomainNotFound,
  isAPIError,
} from '../errors-ts';
import output from '../../output-manager';

type Response = {
  domain: Domain;
};

export default async function getDomainByName(
  client: Client,
  contextName: string,
  domainName: string,
  options: {
    ignoreWait?: boolean;
  } = {}
) {
  if (!options.ignoreWait) {
    output.spinner(
      `Fetching domain ${domainName} under ${chalk.bold(contextName)}`
    );
  }
  try {
    const { domain } = await client.fetch<Response>(
      `/v4/domains/${encodeURIComponent(domainName)}`
    );
    return domain;
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        return new DomainNotFound(domainName, contextName);
      }

      if (err.status === 403) {
        return new DomainPermissionDenied(domainName, contextName);
      }
    }

    throw err;
  }
}
