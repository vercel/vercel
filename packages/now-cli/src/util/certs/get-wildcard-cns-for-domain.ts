import psl from 'psl';
import { InvalidDomain } from '../errors-ts';

export default function getWildcardCNSForDomain(rawDomain: string) {
  const parsedDomain = psl.parse(rawDomain);
  if (parsedDomain.error) {
    throw new InvalidDomain(rawDomain);
  }

  const { domain, subdomain } = parsedDomain;
  if (!domain) {
    throw new InvalidDomain(rawDomain);
  }

  const secondLevel =
    subdomain && subdomain.includes('.')
      ? subdomain
          .split('.')
          .slice(1)
          .join('.')
      : null;

  const root = secondLevel ? `${secondLevel}.${domain}` : domain;
  return [root, `*.${root}`];
}
