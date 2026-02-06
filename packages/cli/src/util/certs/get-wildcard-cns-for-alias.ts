import { parse } from 'tldts';
import extractDomain from '../alias/extract-domain';
import isWildcardAlias from '../alias/is-wildcard-alias';
import { InvalidDomain } from '../errors-ts';

export default function getWildcardCNSForAlias(alias: string) {
  if (isWildcardAlias(alias)) {
    return [extractDomain(alias), alias];
  }

  const parsedDomain = parse(alias);

  const { domain, subdomain } = parsedDomain;
  if (!domain) {
    throw new InvalidDomain(alias);
  }

  const secondLevel =
    subdomain && subdomain.includes('.')
      ? subdomain.split('.').slice(1).join('.')
      : null;

  const root = secondLevel ? `${secondLevel}.${domain}` : domain;
  return [root, `*.${root}`];
}
