import chalk from 'chalk';
import Client from '../client';
import type { Domain } from '@vercel-internals/types';
import {
  DomainPermissionDenied,
  DomainNotFound,
  isAPIError,
} from '../errors-ts';

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
    client.output.spinner(
      `Fetching domain ${domainName} under ${chalk.bold(contextName)}`
    );
  }
  try {
    const { domain } = await client
      .fetch<Response>(`/v4/domains/${encodeURIComponent(domainName)}`)
      .catch(async err => {
        // NOTE: to maintain backwards compatibility after northstar migration
        // we fallback to personal account if the team is a canonical hobby team
        if (isAPIError(err)) {
          if (
            client.authContext.isCanonicalHobbyTeam === true &&
            err.status === 403
          ) {
            return await client
              .fetch<Response>(
                `/v4/domains/${encodeURIComponent(domainName)}`,
                {
                  useCurrentTeam: false,
                }
              )
              .then(domain => {
                // setting the flag so subsuquent requests to related resources (e.g., issue cert)
                // are also made with the personal account auth context to avoid similar auth errors
                client.authContext.enableFallbackDomainsAccess = true;
                return domain;
              });
          }
        }

        throw err;
      });
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
