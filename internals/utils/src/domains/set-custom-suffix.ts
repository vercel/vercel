import * as ERRORS from '../errors-ts';
import Client from '../client';

export default async function setCustomSuffix(
  client: Client,
  contextName: string,
  domain: string,
  suffix: string | null
) {
  try {
    return await client.fetch(`/v1/custom-suffix`, {
      method: 'PATCH',
      body: {
        suffix,
      },
    });
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'forbidden') {
        return new ERRORS.DomainPermissionDenied(domain, contextName);
      }
      if (err.code === 'domain_external') {
        return new ERRORS.DomainExternal(domain);
      }
      if (err.code === 'domain_invalid') {
        return new ERRORS.InvalidDomain(domain);
      }
      if (err.code === 'domain_not_found') {
        return new ERRORS.DomainNotFound(domain);
      }
      if (err.code === 'domain_not_verified') {
        return new ERRORS.DomainNotVerified(domain);
      }
      if (err.code === 'domain_permission_denied') {
        return new ERRORS.DomainPermissionDenied(domain, contextName);
      }
    }
    throw err;
  }
}
