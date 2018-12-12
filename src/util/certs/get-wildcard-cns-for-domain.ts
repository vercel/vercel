import psl from 'psl';

export default function getWildcardCNSForDomain(rawDomain: string) {
  const { domain, subdomain } = psl.parse(rawDomain);
  if (!domain) {
    throw new Error(`Can't get wildcard cns for ${rawDomain}. Invalid domain.`);
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
