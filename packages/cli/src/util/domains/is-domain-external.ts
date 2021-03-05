import { Domain } from '../../types';

export default function isDomainExternal(domain: Domain) {
  return domain.serviceType !== 'zeit.world';
}
