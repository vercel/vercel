import getDomainByName from './get-domain-by-name';
import { DomainPermissionDenied, DomainNotFound } from '../errors';

async function maybeGetDomainByName(output, now, contextName, domainName) {
  const maybeDomain = await getDomainByName(output, now, contextName, domainName);
  if (maybeDomain instanceof DomainPermissionDenied) {
    return maybeDomain;
  }

  return maybeDomain instanceof DomainNotFound
    ? null
    : maybeDomain;
}

export default maybeGetDomainByName;
