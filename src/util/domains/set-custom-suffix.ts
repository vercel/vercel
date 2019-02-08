import * as ERRORS from '../errors-ts';
import Client from '../client';

export default async function setCustomSuffix(
  client: Client,
  contextName: string,
  domain: string,
  suffix: string | null
) {
  try {
    return await client.fetch(`https://api-custom-suffix.zeit.sh/v1`, {
      method: 'PATCH',
      body: {
        suffix
      }
    });
  } catch (error) {
    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(domain, contextName);
    }
    if (error.code === 'domain_external') {
      return new ERRORS.DomainExternal(domain);
    }
    if (error.code === 'domain_invalid') {
      return new ERRORS.DomainInvalid(domain);
    }
    if (error.code === 'domain_not_found') {
      return new ERRORS.DomainNotFound(domain);
    }
    if (error.code === 'domain_not_verified') {
      return new ERRORS.DomainNotVerified(domain);
    }
    if (error.code === 'domain_permission_denied') {
      return new ERRORS.DomainPermissionDenied(domain, contextName);
    }
    throw error;
  }
}
