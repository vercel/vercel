import * as ERRORS from '../errors-ts';
import Client from '../client';

export default async function removeDomainByName(
  now: Client,
  contextName: string,
  domain: string
) {
  try {
    return await now.fetch(`/v3/domains/${domain}`, { method: 'DELETE' });
  } catch (error) {
    if (error.code === 'not_found') {
      return new ERRORS.DomainNotFound(domain);
    }
    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(domain, contextName);
    }
    if (error.code === 'domain_removal_conflict') {
      const { aliases, certs, suffix, transferring } = error;
      return new ERRORS.DomainRemovalConflict({
        aliases,
        certs,
        domain,
        suffix,
        transferring
      });
    }
    throw error;
  }
}
