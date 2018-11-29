//      
import psl from 'psl';
import chalk from 'chalk';
import retry from 'async-retry';

import * as Errors from '../errors';
                                            
import wait from '../output/wait';

export default async function addDomain(
  now     ,
  domain        ,
  contextName        ,
  isExternal         ,
  cdnEnabled          
) {
  const cancelWait = wait(
    `Adding domain ${domain} under ${chalk.bold(contextName)}`
  );
  const { domain: rootDomain, subdomain } = psl.parse(domain);
  try {
    const addedDomain = await performAddRequest(
      now,
      domain,
      isExternal,
      cdnEnabled
    );
    cancelWait();
    return addedDomain;
  } catch (error) {
    cancelWait();
    if (error.status === 403) {
      return error.code === 'domain_with_cdn_needs_upgrade'
        ? new Errors.CDNNeedsUpgrade()
        : new Errors.DomainPermissionDenied(rootDomain, contextName);
    }

    if (error.status === 401 && error.code === 'verification_failed') {
      return new Errors.DomainVerificationFailed(
        rootDomain,
        subdomain,
        error.verifyToken
      );
    }

    if (error.status === 409) {
      return new Errors.DomainAlreadyExists(error.uid, domain, contextName);
    }

    throw error;
  }
}

async function performAddRequest(
  now     ,
  domain        ,
  isExternal         ,
  cdnEnabled          
)                       {
  const serviceType = isExternal ? 'external' : 'zeit.world';
  return retry(
    async bail => {
      try {
        const result              = await now.fetch('/v3/domains', {
          body: { name: domain, serviceType, cdnEnabled },
          method: 'POST'
        });
        return result;
      } catch (err) {
        // retry in case the user has to setup a TXT record
        if (err.code !== 'verification_failed') {
          bail(err);
        } else {
          throw err;
        }
      }
    },
    { retries: 5, maxTimeout: 8000 }
  );
}
