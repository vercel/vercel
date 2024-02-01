import type { Domain } from '@vercel-internals/types';

export default function isDomainExternal(domain: Domain) {
  return domain.serviceType !== 'zeit.world';
}
