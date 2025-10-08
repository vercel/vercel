export function isPublicSuffix(domainName: string) {
  return domainName.endsWith('.vercel.app') || domainName.endsWith('.now.sh');
}
