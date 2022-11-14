import * as ERRORS from '../errors-ts';
import Client from '../client';

export default async function removeDomainByName(
  now: Client,
  contextName: string,
  domain: string
) {
  try {
    return await now.fetch(`/v3/domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
    });
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'not_found') {
        return new ERRORS.DomainNotFound(domain);
      }
      if (err.code === 'forbidden') {
        return new ERRORS.DomainPermissionDenied(domain, contextName);
      }
      if (err.code === 'domain_removal_conflict') {
        return new ERRORS.DomainRemovalConflict({
          aliases: err.aliases,
          certs: err.certs,
          message: err.message,
          pendingAsyncPurchase: err.pendingAsyncPurchase,
          resolvable: err.resolvable,
          suffix: err.suffix,
          transferring: err.transferring,
        });
      }
    }
    throw err;
  }
}
