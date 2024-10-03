import { parse } from 'tldts';

export default function isRootDomain(domainName: string) {
  const parsedDomain = parse(domainName);
  const { domain: rootDomain, subdomain } = parsedDomain;
  return Boolean(!subdomain && rootDomain);
}
