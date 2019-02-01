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
    if (error.code === 'conflict_certs') {
      return new ERRORS.DomainConflict(
        'CONFLICT_CERTS',
        domain,
        contextName,
        error.message
      );
    }
    if (error.code === 'conflict_aliases') {
      return new ERRORS.DomainConflict(
        'CONFLICT_ALIASES',
        domain,
        contextName,
        error.message
      );
    }
    if (error.code === 'conflict_suffix') {
      return new ERRORS.DomainConflict(
        'CONFLICT_SUFFIX',
        domain,
        contextName,
        error.message
      );
    }
    if (error.code === 'conflict_transfer') {
      return new ERRORS.DomainConflict(
        'CONFLICT_TRANSFER',
        domain,
        contextName,
        error.message
      );
    }
    throw error;
  }
}
