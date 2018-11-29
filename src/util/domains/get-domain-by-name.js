//      
import getDomains from './get-domains';

import toHost from '../to-host';

async function getDomainByIdOrName(
  output        ,
  now     ,
  contextName        ,
  domainIdOrName        
) {
  const domains = await getDomains(output, now, contextName);
  return domains.find(domain => domain.name === toHost(domainIdOrName));
}

export default getDomainByIdOrName;
