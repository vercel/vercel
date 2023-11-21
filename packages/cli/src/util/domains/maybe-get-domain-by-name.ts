import { DomainPermissionDenied, DomainNotFound } from '../errors-ts.js';
import getDomainByName from './get-domain-by-name.js';
import Client from '../client.js';

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
