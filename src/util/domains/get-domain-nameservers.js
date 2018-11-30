//      
import wait from '../output/wait';

import { DomainNameserversNotFound } from '../errors';

async function getDomainNameservers(now     , domain        ) {
  const cancelFetchingMessage = wait(`Fetching DNS nameservers for ${domain}`);
  try {
    const { nameservers } = await now.fetch(
      `/whois-ns?domain=${encodeURIComponent(domain)}`
    );
    cancelFetchingMessage();
    return nameservers.filter(ns => 
      // Temporary hack since sometimes we get a response that looks like: ['ns', 'ns', '', '']
      // so we have to filter the empty ones
       ns.length > 0
    );
  } catch (error) {
    cancelFetchingMessage();
    if (error.status === 404) {
      return new DomainNameserversNotFound(domain);
    } 
      throw error;
    
  }
}

export default getDomainNameservers;
