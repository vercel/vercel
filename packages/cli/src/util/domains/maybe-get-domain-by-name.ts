import type Client from '../client';
import { DomainNotFound, DomainPermissionDenied } from '../errors-ts';
import getDomainByName from './get-domain-by-name';

export default async function maybeGetDomainByName(
  client: Client,
  contextName: string,
  domainName: string
) {
  const maybeDomain = await getDomainByName(client, contextName, domainName);
  if (maybeDomain instanceof DomainPermissionDenied) {
    return maybeDomain;
  }

  return maybeDomain instanceof DomainNotFound ? null : maybeDomain;
}
