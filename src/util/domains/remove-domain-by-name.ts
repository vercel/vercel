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
      return new ERRORS.DomainRemovalConflict({
        aliases: error.aliases,
        certs: error.certs,
        message: error.message,
        pendingAsyncPurchase: error.pendingAsyncPurchase,
        resolvable: error.resolvable,
        suffix: error.suffix,
        transferring: error.transferring
      });
    }
    throw error;
  }
}
