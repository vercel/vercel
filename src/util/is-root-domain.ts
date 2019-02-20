import psl from 'psl';

export default function isRootDomain(domainName: string) {
  const { domain: rootDomain, subdomain } = psl.parse(domainName);
  return Boolean(!subdomain && rootDomain);
}
