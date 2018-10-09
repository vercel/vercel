// @flow
import getDomains from './get-domains';
import { Output, Now } from '../types';
import toHost from '../to-host';

async function getDomainByIdOrName(
  output: Output,
  now: Now,
  contextName: string,
  domainIdOrName: string
) {
  const domains = await getDomains(output, now, contextName);
  return domains.find(domain => domain.name === toHost(domainIdOrName));
}

export default getDomainByIdOrName;
