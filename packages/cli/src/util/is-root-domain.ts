import psl from 'psl';

export default function isRootDomain(domainName: string) {
  const parsedDomain = psl.parse(domainName);
  if (parsedDomain.error) {
    return false;
  }
  const { domain: rootDomain, subdomain } = parsedDomain;
  return Boolean(!subdomain && rootDomain);
}
