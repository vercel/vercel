import { Domain } from '../../types';

export type DomainRegistrar = 'Vercel' | 'Purchase in Process' | 'Third Party';

export function getDomainRegistrar(domain: Domain): DomainRegistrar {
  if (domain.boughtAt) {
    return 'Vercel';
  }

  if (typeof domain.orderedAt === 'number' && !domain.boughtAt) {
    return 'Purchase in Process';
  }

  return 'Third Party';
}
