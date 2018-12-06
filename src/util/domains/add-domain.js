import chalk from 'chalk';
import retry from 'async-retry';

import * as ERRORS from '../errors';
import wait from '../output/wait';

export default async function addDomain(now, domain, contextName, cdnEnabled) {
  const cancelWait = wait(`Adding domain ${domain} under ${chalk.bold(contextName)}`);
  try {
    const addedDomain = await performAddRequest(now, domain, cdnEnabled);
    cancelWait();
    return addedDomain;
  } catch (error) {
    cancelWait();
    throw error;
  }
}

async function performAddRequest(now, domain, cdnEnabled) {
  return retry(
    async () => {
      try {
        return await now.fetch('/v4/domains', {
          body: { name: domain, cdnEnabled },
          method: 'POST'
        })
      } catch (error) {
        if (error.code === 'invalid_name') {
          return new ERRORS.InvalidDomain(domain);
        }

        if (error.code === 'domain_with_cdn_needs_upgrade') {
          return new ERRORS.CDNNeedsUpgrade();
        }

        if (error.code === 'domain_already_exists') {
          return new ERRORS.DomainAlreadyExists(domain)
        }

        throw error;
      }
    },
    { retries: 5, maxTimeout: 8000 }
  );
}
